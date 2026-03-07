import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Send, Megaphone } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../theme/colors';
import { MessageType } from '../../types';

interface MsgRow {
  id: string;
  box_id: string;
  sender_id: string;
  receiver_id?: string;
  group_id?: string | null;
  content: string;
  message_type: MessageType;
  is_announcement: boolean;
  attachment_url?: string;
  created_at: string;
  read_by: string[];
  sender: { username: string; avatar_url?: string } | null;
}

interface Group { id: string; name: string; color: string | null; }

export default function MessagesScreen() {
  const { user, currentBox } = useAuth();
  const [messages,   setMessages]   = useState<MsgRow[]>([]);
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [activeTab,  setActiveTab]  = useState<string | null>(null); // null = Tous
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending,    setSending]    = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!currentBox || !user) { setLoading(false); setRefreshing(false); return; }

    // 1. Groupes du membre (pour les onglets)
    const { data: memberGroups } = await supabase
      .from('message_group_members')
      .select('group_id, message_groups(id, name, color)')
      .eq('member_id', user.id);

    const userGroups: Group[] = (memberGroups ?? []).map((mg: any) => {
      const g = Array.isArray(mg.message_groups) ? mg.message_groups[0] : mg.message_groups;
      return g ? { id: g.id, name: g.name, color: g.color } : null;
    }).filter(Boolean) as Group[];
    setGroups(userGroups);

    // 2. Messages du chat membre
    const { data: chatData } = await supabase
      .from('messages')
      .select('id, box_id, sender_id, content, message_type, is_announcement, created_at, read_by, sender:profiles!messages_sender_id_fkey(username, avatar_url)')
      .eq('box_id', currentBox.id)
      .eq('message_type', 'general')
      .order('created_at', { ascending: true })
      .limit(60);

    const chatRows: MsgRow[] = (chatData ?? []).map((m: any) => ({
      ...m,
      group_id:        null,
      sender:          Array.isArray(m.sender) ? m.sender[0] ?? null : m.sender,
    }));

    // 3. Annonces admin depuis box_messages (filtrées par groupe si besoin)
    let adminQuery = supabase
      .from('box_messages')
      .select('id, box_id, title, body, type, sent_at, target_group_id')
      .eq('box_id', currentBox.id)
      .order('sent_at', { ascending: true })
      .limit(30);

    // Membre voit uniquement les messages de ses groupes + les messages "Tous" (target_group_id null)
    const groupIds = userGroups.map(g => g.id);
    if (groupIds.length > 0) {
      // Messages sans groupe OU dans ses groupes
      adminQuery = adminQuery.or(`target_group_id.is.null,target_group_id.in.(${groupIds.join(',')})`);
    } else {
      // Pas dans un groupe → uniquement les messages "Tous"
      adminQuery = adminQuery.is('target_group_id', null);
    }

    const { data: adminData } = await adminQuery;

    const adminRows: MsgRow[] = (adminData ?? []).map((m: any) => ({
      id:              `admin-${m.id}`,
      box_id:          m.box_id,
      sender_id:       'admin',
      group_id:        m.target_group_id ?? null,
      content:         m.title ? `${m.title}\n${m.body}` : m.body,
      message_type:    'general' as MessageType,
      is_announcement: true,
      created_at:      m.sent_at,
      read_by:         [],
      sender:          { username: currentBox.name },
    }));

    // 4. Merge + tri chronologique
    const all = [...chatRows, ...adminRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    setMessages(all);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, user]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Supabase Realtime subscription
  useEffect(() => {
    if (!currentBox) return;
    const channel = supabase
      .channel(`box-messages-${currentBox.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `box_id=eq.${currentBox.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as MsgRow;
          if (newMsg.message_type !== 'general') return;
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newMsg.sender_id)
            .single();
          setMessages(prev => [
            ...prev,
            { ...newMsg, group_id: null, sender: profile ?? null } as unknown as MsgRow,
          ]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentBox]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [loading]);

  async function sendMessage() {
    if (!input.trim() || !user || !currentBox) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    await supabase.from('messages').insert({
      box_id: currentBox.id,
      sender_id: user.id,
      content: text,
      message_type: 'general',
      is_announcement: false,
    });
    setSending(false);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const diff = today.toDateString() === d.toDateString();
    if (diff) return "Aujourd'hui";
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (yest.toDateString() === d.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  if (!currentBox) {
    return (
      <View style={s.container}>
        <View style={s.header}><Text style={s.headerTitle}>Messages</Text></View>
        <View style={s.empty}><Text style={s.emptyText}>Rejoins une box pour accéder aux messages 🏋️</Text></View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Filter messages by active tab
  const visibleMessages = activeTab === null
    ? messages
    : messages.filter(m => m.is_announcement
        ? m.group_id === activeTab
        : true // chat messages always shown in all tabs
      );

  // Group messages by date for dividers
  const grouped: (MsgRow | { type: 'date'; label: string; key: string })[] = [];
  let lastDate = '';
  visibleMessages.forEach(msg => {
    const dateLabel = formatDate(msg.created_at);
    if (dateLabel !== lastDate) {
      grouped.push({ type: 'date', label: dateLabel, key: `d-${msg.created_at}` });
      lastDate = dateLabel;
    }
    grouped.push(msg);
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Messages</Text>
          <Text style={s.headerSub}>{currentBox.name}</Text>
        </View>
      </View>

      {/* Group tabs */}
      {groups.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabsContainer}
          contentContainerStyle={s.tabsContent}
        >
          <TouchableOpacity
            style={[s.tab, activeTab === null && s.tabActive]}
            onPress={() => setActiveTab(null)}
          >
            <Text style={[s.tabText, activeTab === null && s.tabTextActive]}>Tous</Text>
          </TouchableOpacity>
          {groups.map(g => (
            <TouchableOpacity
              key={g.id}
              style={[
                s.tab,
                activeTab === g.id && { backgroundColor: g.color ?? Colors.primary, borderColor: g.color ?? Colors.primary },
              ]}
              onPress={() => setActiveTab(g.id)}
            >
              <View style={[s.tabDot, { backgroundColor: g.color ?? Colors.primary }]} />
              <Text style={[s.tabText, activeTab === g.id && s.tabTextActive]}>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Messages list */}
      <FlatList
        ref={listRef}
        data={grouped}
        keyExtractor={item => ('id' in item ? item.id : item.key)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
          />
        }
        renderItem={({ item }) => {
          if ('type' in item && item.type === 'date') {
            return (
              <View style={s.dateDivider}>
                <View style={s.dateLine} />
                <Text style={s.dateLabel}>{item.label}</Text>
                <View style={s.dateLine} />
              </View>
            );
          }
          const msg = item as MsgRow;
          const isMe = msg.sender_id === user?.id;
          const initial = (msg.sender?.username?.[0] ?? '?').toUpperCase();
          return (
            <View style={[s.msgRow, isMe && s.msgRowMe]}>
              {!isMe && (
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{initial}</Text>
                </View>
              )}
              <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                {!isMe && (
                  <Text style={s.senderName}>{msg.sender?.username ?? 'Inconnu'}</Text>
                )}
                {msg.is_announcement && (
                  <View style={s.announcementTag}>
                    <Megaphone color={Colors.warning} size={10} />
                    <Text style={s.announcementText}>Annonce</Text>
                  </View>
                )}
                <Text style={[s.bubbleText, isMe && s.bubbleTextMe]}>{msg.content}</Text>
                <Text style={[s.timeText, isMe && s.timeTextMe]}>{formatTime(msg.created_at)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>💬</Text>
            <Text style={s.emptyText}>Aucun message pour l'instant.{'\n'}Soyez le premier à écrire !</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          placeholder="Écrire un message…"
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Send color="#fff" size={18} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.text },
  headerSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 1 },

  list: { padding: 12, paddingBottom: 8 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 8 },
  dateLine:    { flex: 1, height: 1, backgroundColor: Colors.border },
  dateLabel:   { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  msgRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  msgRowMe: { flexDirection: 'row-reverse' },

  avatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 11, fontWeight: '900', color: Colors.text },

  bubble: {
    maxWidth: '75%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, gap: 3,
  },
  bubbleThem: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },

  senderName:       { fontSize: 11, fontWeight: '800', color: Colors.primary, marginBottom: 1 },
  announcementTag:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  announcementText: { fontSize: 9, fontWeight: '800', color: Colors.warning },
  bubbleText:       { fontSize: 14, color: Colors.text, lineHeight: 20 },
  bubbleTextMe:     { color: '#fff' },
  timeText:         { fontSize: 10, color: Colors.textMuted, alignSelf: 'flex-end' },
  timeTextMe:       { color: 'rgba(255,255,255,0.6)' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.text, maxHeight: 100,
  },
  sendBtn:         { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  tabsContainer: { maxHeight: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabsContent:   { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabDot:        { width: 7, height: 7, borderRadius: 4 },
  tabText:       { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: '#fff' },
});
