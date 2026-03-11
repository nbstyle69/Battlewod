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
import { useTheme, AppTheme } from '../../context/ThemeContext';
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
  const { theme } = useTheme();
  const S = createStyles(theme);
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

    // 4. Group chat messages (bidirectional — from group_messages table)
    let groupChatRows: MsgRow[] = [];
    if (groupIds.length > 0) {
      const { data: gcData } = await supabase
        .from('group_messages')
        .select('id, group_id, sender_id, content, created_at')
        .in('group_id', groupIds)
        .order('created_at', { ascending: true })
        .limit(100);
      const gcMsgs = gcData ?? [];
      const senderIds = [...new Set(gcMsgs.map((m: any) => m.sender_id))];
      let profMap: Record<string, { username: string; avatar_url?: string }> = {};
      if (senderIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', senderIds);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
      }
      groupChatRows = gcMsgs.map((m: any) => ({
        id:              `gc-${m.id}`,
        box_id:          currentBox.id,
        sender_id:       m.sender_id,
        group_id:        m.group_id,
        content:         m.content,
        message_type:    'general' as MessageType,
        is_announcement: false,
        created_at:      m.created_at,
        read_by:         [],
        sender:          profMap[m.sender_id] ?? { username: 'Inconnu' },
      }));
    }

    // 5. Merge + tri chronologique
    const all = [...chatRows, ...adminRows, ...groupChatRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    setMessages(all);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, user]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Supabase Realtime — general messages
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

  // Supabase Realtime — group chat messages
  useEffect(() => {
    if (!currentBox || groups.length === 0) return;
    const channels = groups.map(g =>
      supabase
        .channel(`group-chat-${g.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${g.id}`,
        }, async (payload) => {
          const raw = payload.new as any;
          const { data: profile } = await supabase
            .from('profiles').select('username, avatar_url').eq('id', raw.sender_id).single();
          const msgRow: MsgRow = {
            id: `gc-${raw.id}`,
            box_id: currentBox.id,
            sender_id: raw.sender_id,
            group_id: raw.group_id,
            content: raw.content,
            message_type: 'general',
            is_announcement: false,
            created_at: raw.created_at,
            read_by: [],
            sender: profile ?? { username: 'Inconnu' },
          };
          setMessages(prev => {
            if (prev.some(m => m.id === msgRow.id)) return prev;
            return [...prev, msgRow];
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        })
        .subscribe()
    );
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [currentBox, groups]);

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
    if (activeTab) {
      // Send to group chat
      await supabase.from('group_messages').insert({
        group_id: activeTab,
        sender_id: user.id,
        content: text,
      });
    } else {
      // Send to general box chat
      await supabase.from('messages').insert({
        box_id: currentBox.id,
        sender_id: user.id,
        content: text,
        message_type: 'general',
        is_announcement: false,
      });
    }
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
      <View style={S.container}>
        <View style={S.header}><Text style={S.headerTitle}>Messages</Text></View>
        <View style={S.empty}><Text style={S.emptyText}>Rejoins une box pour accéder aux messages 🏋️</Text></View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  // Filter messages by active tab
  const visibleMessages = activeTab === null
    ? messages
    : messages.filter(m => m.group_id === activeTab);

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
      style={S.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.headerTitle}>Messages</Text>
          <Text style={S.headerSub}>{currentBox.name}</Text>
        </View>
      </View>

      {/* Group tabs */}
      {groups.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={S.tabsContainer}
          contentContainerStyle={S.tabsContent}
        >
          <TouchableOpacity
            style={[S.tab, activeTab === null && S.tabActive]}
            onPress={() => setActiveTab(null)}
          >
            <Text style={[S.tabText, activeTab === null && S.tabTextActive]}>Tous</Text>
          </TouchableOpacity>
          {groups.map(g => (
            <TouchableOpacity
              key={g.id}
              style={[
                S.tab,
                activeTab === g.id && { backgroundColor: g.color ?? theme.accent, borderColor: g.color ?? theme.accent },
              ]}
              onPress={() => setActiveTab(g.id)}
            >
              <View style={[S.tabDot, { backgroundColor: g.color ?? theme.accent }]} />
              <Text style={[S.tabText, activeTab === g.id && S.tabTextActive]}>{g.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Messages list */}
      <FlatList
        ref={listRef}
        data={grouped}
        keyExtractor={item => ('id' in item ? item.id : item.key)}
        contentContainerStyle={S.list}
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
              <View style={S.dateDivider}>
                <View style={S.dateLine} />
                <Text style={S.dateLabel}>{item.label}</Text>
                <View style={S.dateLine} />
              </View>
            );
          }
          const msg = item as MsgRow;
          const isMe = msg.sender_id === user?.id;
          const initial = (msg.sender?.username?.[0] ?? '?').toUpperCase();
          return (
            <View style={[S.msgRow, isMe && S.msgRowMe]}>
              {!isMe && (
                <View style={S.avatar}>
                  <Text style={S.avatarText}>{initial}</Text>
                </View>
              )}
              <View style={[S.bubble, isMe ? S.bubbleMe : S.bubbleThem]}>
                {!isMe && (
                  <Text style={S.senderName}>{msg.sender?.username ?? 'Inconnu'}</Text>
                )}
                {msg.is_announcement && (
                  <View style={S.announcementTag}>
                    <Megaphone color={theme.warning} size={10} />
                    <Text style={S.announcementText}>Annonce</Text>
                  </View>
                )}
                <Text style={[S.bubbleText, isMe && S.bubbleTextMe]}>{msg.content}</Text>
                <Text style={[S.timeText, isMe && S.timeTextMe]}>{formatTime(msg.created_at)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyEmoji}>💬</Text>
            <Text style={S.emptyText}>Aucun message pour l'instant.{'\n'}Soyez le premier à écrire !</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={S.inputBar}>
        <TextInput
          style={S.input}
          placeholder="Écrire un message…"
          placeholderTextColor={theme.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[S.sendBtn, (!input.trim() || sending) && S.sendBtnDisabled]}
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

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  dateDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 8 },
  dateLine:    { flex: 1, height: 1, backgroundColor: theme.border },
  dateLabel:   { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
  msgRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  msgRowMe: { flexDirection: 'row-reverse' },
  avatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  avatarText: { fontSize: 12, fontWeight: '900', color: theme.text },
  bubble: {
    maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 3,
  },
  bubbleThem: {
    backgroundColor: theme.card,
    borderWidth: 1, borderColor: theme.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: theme.accent,
    borderBottomRightRadius: 4,
  },
  senderName:       { fontSize: 11, fontWeight: '800', color: theme.accent, marginBottom: 1 },
  announcementTag:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  announcementText: { fontSize: 9, fontWeight: '800', color: theme.warning },
  bubbleText:       { fontSize: 14, color: theme.text, lineHeight: 20 },
  bubbleTextMe:     { color: '#fff' },
  timeText:         { fontSize: 10, color: theme.textMuted, alignSelf: 'flex-end' },
  timeTextMe:       { color: 'rgba(255,255,255,0.6)' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border,
  },
  input: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 22,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, color: theme.text, maxHeight: 100,
  },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 22 },
  tabsContainer: { backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  tabsContent:   { paddingHorizontal: 14, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  tabActive:     { backgroundColor: theme.accent, borderColor: theme.accent },
  tabDot:        { width: 8, height: 8, borderRadius: 4 },
  tabText:       { fontSize: 13, fontWeight: '700', color: theme.textMuted },
  tabTextActive: { color: '#fff' },
}); }
