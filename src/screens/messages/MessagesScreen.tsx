import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl,
  Image, Modal, Pressable, Dimensions, ScrollView, Keyboard,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Send, Megaphone, ImagePlus, X, Search, ChevronLeft } from 'lucide-react-native';

// Marqueur repérable dans le bundle publié (ota.yml, verify:ipa/aab) : le
// préfixe suit la clé inlinée au moment du bundle, comme l'URL Supabase.
const GIPHY_KEY_TAG = 'giphy-key:' + (process.env.EXPO_PUBLIC_GIPHY_KEY ?? '') + ':giphy-end';
const GIPHY_API_KEY = GIPHY_KEY_TAG.slice('giphy-key:'.length, -':giphy-end'.length);
interface GifResult { id: string; url: string; preview: string; }
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { resolveStorageUrls, isExternalValue } from '../../lib/storageUrl';
import { lastSeenMessagesKey, markMessagesSeen } from '../../lib/unreadMessages';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { sendNewMessageNotification } from '../../services/notifications';
import { incrementCounter } from '../../services/gamification';
import { MessageType } from '../../types';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';
import ReportMenu from '../../components/ReportMenu';
import { getBlockedUserIds } from '../../services/moderation';

const REACTION_EMOJIS = ['❤️', '🔥', '💪', '😂', '👏', '👀'];
const SCREEN_W = Dimensions.get('window').width;

interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

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
  reactions?: Reaction[];
}

interface Group { id: string; name: string; color: string | null; }

export default function MessagesScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  // Bottom tab bar uses position:'absolute' (see navigation/index.tsx) → must
  // reserve its height as bottom padding to keep the input bar visible.
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { /* not inside tabs */ }
  const S = createStyles(theme);
  const [messages,   setMessages]   = useState<MsgRow[]>([]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [activeTab,  setActiveTab]  = useState<string | null>(null); // null = Tous
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending,    setSending]    = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [previewImg,   setPreviewImg]   = useState<string | null>(null);
  // Lot 1C-c — bucket `message-attachments` privé : la valeur stockée en base
  // (URL publique historique, chemin nu, ou GIF externe) est résolue en URL
  // affichable (signée pour les objets du bucket, telle quelle pour les GIF).
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [reactionMsgId, setReactionMsgId] = useState<string | null>(null);
  const [gifOpen,    setGifOpen]    = useState(false);
  const [gifSearch,  setGifSearch]  = useState('');
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  // Distingue « GIPHY n'a rien trouvé » de « l'appel a échoué » (réseau, quota) :
  // avant, les deux affichaient la même page vide. La clé absente est un
  // troisième état, affiché tel quel plutôt qu'un sélecteur vide.
  const [gifError,   setGifError]   = useState(false);
  const gifUnavailable = !GIPHY_API_KEY;
  const listRef = useRef<FlatList>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const [kbOpen, setKbOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const load = useCallback(async () => {
    if (!currentBox || !user) { setLoading(false); setRefreshing(false); return; }

    // 1. Groupes du membre (via members uuid[] array sur message_groups)
    const { data: memberGroups } = await supabase
      .from('message_groups')
      .select('id, name, color')
      .eq('box_id', currentBox.id)
      .contains('members', [user.id]);

    const userGroups: Group[] = (memberGroups ?? []).map((g: any) =>
      g ? { id: g.id, name: g.name, color: g.color } : null
    ).filter(Boolean) as Group[];
    setGroups(userGroups);

    // 2. Annonces admin depuis box_messages (filtrées par groupe si besoin)
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
        .select('id, group_id, sender_id, content, attachment_url, created_at')
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
        attachment_url:   m.attachment_url ?? undefined,
        message_type:    'general' as MessageType,
        is_announcement: false,
        created_at:      m.created_at,
        read_by:         [],
        sender:          profMap[m.sender_id] ?? { username: 'Inconnu' },
      }));
    }

    // 5. Merge + tri chronologique + filtre users bloqués
    const blocked = await getBlockedUserIds();
    setBlockedIds(blocked);
    const blockedSet = new Set(blocked);
    const all = [...adminRows, ...groupChatRows]
      .filter(m => m.sender_id === 'admin' || !blockedSet.has(m.sender_id))
      .sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    // 6. Load reactions for all messages
    const allIds = all.map(m => m.id);
    let reactionsMap: Record<string, Reaction[]> = {};
    if (allIds.length > 0) {
      try {
        const { data: rxData } = await supabase
          .from('message_reactions')
          .select('message_id, emoji, member_id')
          .in('message_id', allIds);
        const grouped: Record<string, Record<string, { count: number; mine: boolean }>> = {};
        (rxData ?? []).forEach((r: any) => {
          if (!grouped[r.message_id]) grouped[r.message_id] = {};
          if (!grouped[r.message_id][r.emoji]) grouped[r.message_id][r.emoji] = { count: 0, mine: false };
          grouped[r.message_id][r.emoji].count++;
          if (r.member_id === user.id) grouped[r.message_id][r.emoji].mine = true;
        });
        Object.entries(grouped).forEach(([msgId, emojis]) => {
          reactionsMap[msgId] = Object.entries(emojis).map(([emoji, v]) => ({ emoji, ...v }));
        });
      } catch (e) { captureError(e, { screen: 'Messages', action: 'loadReactions' }); }
    }

    setMessages(all.map(m => ({ ...m, reactions: reactionsMap[m.id] ?? [] })));
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, user]);

  useEffect(() => { load(); }, [load]);

  // Résolution des pièces jointes (URL signées, mises en cache par le helper).
  useEffect(() => {
    let cancelled = false;
    const pending = [...new Set(
      messages.map(m => m.attachment_url).filter((v): v is string => !!v),
    )].filter(v => !attachmentUrls[v]);
    if (pending.length === 0) return;
    (async () => {
      const resolved = await resolveStorageUrls(pending, 'message-attachments');
      if (cancelled) return;
      setAttachmentUrls(prev => {
        const next = { ...prev };
        pending.forEach((v, i) => { const r = resolved[i]; if (r) next[v] = r; });
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Auto-select first group ONLY at initial mount (avoid stale-closure resets on refresh)
  useEffect(() => {
    if (activeTab === null && groups.length > 0) {
      setActiveTab(groups[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  useFocusEffect(useCallback(() => {
    load().then(() => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    });
    if (user && currentBox) {
      AsyncStorage.setItem(lastSeenMessagesKey(user.id, currentBox.id), new Date().toISOString());
      markMessagesSeen();
    }
  }, [load, user, currentBox]));

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
  }, [activeTab]);

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
            attachment_url: raw.attachment_url ?? undefined,
            message_type: 'general',
            is_announcement: false,
            created_at: raw.created_at,
            read_by: [],
            sender: profile ? { username: profile.username, avatar_url: profile.avatar_url ?? undefined } : { username: 'Inconnu' },
          };
          setMessages(prev => {
            const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.sender_id === raw.sender_id));
            if (filtered.some(m => m.id === msgRow.id)) return filtered;
            return [...filtered, msgRow];
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

  async function searchGifs(query: string) {
    setGifLoading(true);
    setGifError(false);
    try {
      if (!GIPHY_API_KEY) throw new Error('EXPO_PUBLIC_GIPHY_KEY absente du bundle');
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`GIPHY HTTP ${res.status}`);
      const json = await res.json();
      const results: GifResult[] = (json.data ?? []).map((r: any) => ({
        id: r.id,
        url: r.images?.fixed_height?.url ?? r.images?.fixed_height_small?.url ?? '',
        preview: r.images?.fixed_height_small?.url ?? r.images?.fixed_height?.url ?? '',
      }));
      setGifResults(results);
    } catch (e) {
      captureError(e, { screen: 'Messages', action: 'searchGifs' });
      setGifResults([]);
      setGifError(true);
    }
    setGifLoading(false);
  }

  function openGifPicker() {
    setGifOpen(true);
    setGifSearch('');
    if (!gifUnavailable) searchGifs('');
  }

  async function sendGif(gifUrl: string) {
    if (!user || !currentBox) return;
    setGifOpen(false);
    setSending(true);
    if (activeTab) {
      await supabase.from('group_messages').insert({
        group_id: activeTab,
        sender_id: user.id,
        content: 'GIF',
        attachment_url: gifUrl,
      });
    }
    setSending(false);
    load();
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingImage(result.assets[0].uri);
    }
  }

  async function uploadImage(uri: string, groupId: string): Promise<string | null> {
    try {
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      // Chemin scopé (Lot 1C-c) : <group_id>/<uid>_<ts>_<rand>.<ext>.
      // Avant, les chemins étaient plats → impossible de restreindre la lecture
      // aux membres de la conversation. Le 1er segment porte le groupe : la
      // policy storage lit l'appartenance sans requête applicative.
      const fileName = `${groupId}/${user!.id}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuf = await new Response(blob).arrayBuffer();
      const { error } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, arrayBuf, { contentType: blob.type || `image/${ext}`, upsert: false });
      if (error) { captureError(error, { screen: 'Messages', action: 'uploadImage' }); return null; }
      // Format « public » conservé pour la coexistence de versions : tant que le
      // bucket est public, une app non mise à jour doit pouvoir afficher une
      // pièce jointe envoyée depuis la nouvelle. Le résolveur en extrait le
      // chemin et la signe une fois le bucket privé.
      const { data: urlData } = supabase.storage.from('message-attachments').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (e) { captureError(e, { screen: 'Messages', action: 'uploadImage' }); return null; }
  }

  async function toggleReaction(msgId: string, emoji: string) {
    if (!user) return;
    const msg = messages.find(m => m.id === msgId);
    const existing = msg?.reactions?.find(r => r.emoji === emoji && r.mine);
    if (existing) {
      await supabase.from('message_reactions').delete()
        .eq('message_id', msgId).eq('member_id', user.id).eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions').insert({
        message_id: msgId, member_id: user.id, emoji,
      });
    }
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      let rx = [...(m.reactions ?? [])];
      const idx = rx.findIndex(r => r.emoji === emoji);
      if (existing) {
        if (idx >= 0) {
          rx[idx] = { ...rx[idx], count: rx[idx].count - 1, mine: false };
          if (rx[idx].count <= 0) rx.splice(idx, 1);
        }
      } else {
        if (idx >= 0) rx[idx] = { ...rx[idx], count: rx[idx].count + 1, mine: true };
        else rx.push({ emoji, count: 1, mine: true });
      }
      return { ...m, reactions: rx };
    }));
    setReactionMsgId(null);
  }

  function handleDoubleTap(msgId: string) {
    const now = Date.now();
    if (lastTapRef.current.id === msgId && now - lastTapRef.current.time < 300) {
      toggleReaction(msgId, '\u2764\ufe0f');
      lastTapRef.current = { id: '', time: 0 };
    } else {
      lastTapRef.current = { id: msgId, time: now };
    }
  }

  async function sendMessage() {
    const hasText = input.trim().length > 0;
    const hasImage = !!pendingImage;
    if ((!hasText && !hasImage) || !user || !currentBox) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    let attachmentUrl: string | null = null;
    if (pendingImage) {
      // Le chemin de stockage est scopé au groupe → pas d'upload hors conversation
      // (l'insert ne se fait de toute façon que si `activeTab` existe).
      if (activeTab) attachmentUrl = await uploadImage(pendingImage, activeTab);
      setPendingImage(null);
    }

    const content = text || (attachmentUrl ? '📷 Image' : '');

    const tempMsg: MsgRow = {
      id: `temp-${Date.now()}`,
      box_id: currentBox.id,
      sender_id: user.id,
      group_id: activeTab ?? null,
      content,
      message_type: 'general' as MessageType,
      is_announcement: false,
      attachment_url: attachmentUrl ?? undefined,
      created_at: new Date().toISOString(),
      read_by: [],
      sender: { username: user.username ?? '?' },
      reactions: [],
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    if (activeTab) {
      await supabase.from('group_messages').insert({
        group_id: activeTab,
        sender_id: user.id,
        content,
        ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}),
      });
      const grp = groups.find(g => g.id === activeTab);
      if (grp) {
        sendNewMessageNotification(activeTab, grp.name, user.id, user.username, content).catch(e => captureError(e, { action: 'sendMessageNotif' }));
      }
    }
    if (user) incrementCounter(user.id, 'total_messages_sent', 1, currentBox?.id).catch(e => captureError(e, { action: 'incrementMessagesSent' }));
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
      <GlassBackground />
        <View style={S.header}><Text style={S.headerTitle}>Messages</Text></View>
        <View style={S.empty}><Text style={S.emptyText}>Rejoins une box pour accéder aux messages 🏋️</Text></View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  // Filter messages by active tab
  const visibleMessages = activeTab === null
    ? messages
    : messages.filter(m => m.group_id === activeTab);

  // Build grouped list with date dividers + track previous sender for grouping
  const grouped: (MsgRow & { _showSender: boolean } | { type: 'date'; label: string; key: string })[] = [];
  let lastDate = '';
  let lastSenderId = '';
  visibleMessages.forEach(msg => {
    const dateLabel = formatDate(msg.created_at);
    if (dateLabel !== lastDate) {
      grouped.push({ type: 'date', label: dateLabel, key: `d-${msg.created_at}` });
      lastDate = dateLabel;
      lastSenderId = '';
    }
    const showSender = msg.sender_id !== lastSenderId;
    lastSenderId = msg.sender_id;
    grouped.push({ ...msg, _showSender: showSender });
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={S.container}
      keyboardVerticalOffset={0}
    >
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {canGoBack && (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft color={theme.text} size={22} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={S.headerTitle}>Messages</Text>
            <Text style={S.headerSub}>{currentBox.name}</Text>
          </View>
        </View>
      </View>

      {/* Group tabs */}
      {groups.length > 0 && (
        <View style={S.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.tabsContent}
          >
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
                <Text style={[S.tabText, activeTab === g.id && S.tabTextActive]} numberOfLines={1}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
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
        ListHeaderComponent={null}
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
          const msg = item as MsgRow & { _showSender: boolean };
          const isMe = msg.sender_id === user?.id;
          const showSender = msg._showSender;
          const hasReactions = (msg.reactions?.length ?? 0) > 0;
          return (
            <View style={[S.msgRow, isMe && S.msgRowMe, !showSender && S.msgRowGrouped]}>
              {!isMe && (
                showSender
                  ? <UserAvatar uri={msg.sender?.avatar_url} name={msg.sender?.username ?? '?'} size={28} borderRadius={10} backgroundColor={theme.accentShadow} />
                  : <View style={S.avatarSpacer} />
              )}
              <Pressable
                onPress={() => handleDoubleTap(msg.id)}
                onLongPress={() => setReactionMsgId(msg.id)}
                delayLongPress={400}
                style={{ maxWidth: '78%' }}
              >
                <View style={[S.bubble, isMe ? S.bubbleMe : S.bubbleThem]}>
                  {!isMe && showSender && (
                    <Text style={S.senderName}>{msg.sender?.username ?? 'Inconnu'}</Text>
                  )}
                  {msg.is_announcement && (
                    <View style={S.announcementTag}>
                      <Megaphone color={theme.warning} size={10} />
                      <Text style={S.announcementText}>Annonce</Text>
                    </View>
                  )}
                  {(() => {
                    const raw = msg.attachment_url;
                    if (!raw) return null;
                    // Une URL externe (GIF GIPHY) s'affiche IMMÉDIATEMENT :
                    // elle n'a jamais besoin d'être signée, donc elle ne doit pas
                    // attendre la résolution asynchrone. Seuls les objets du
                    // bucket privé attendent leur URL signée.
                    const uri = isExternalValue(raw, 'message-attachments')
                      ? raw
                      : attachmentUrls[raw];
                    if (!uri) return null;
                    return (
                      <Pressable onPress={() => setPreviewImg(uri)} style={S.attachmentWrap}>
                        <Image source={{ uri }} style={S.attachmentImg} resizeMode="cover" />
                      </Pressable>
                    );
                  })()}
                  {msg.content && msg.content !== '📷 Image' && (
                    <Text style={[S.bubbleText, isMe && S.bubbleTextMe]}>{msg.content}</Text>
                  )}
                  <Text style={[S.timeText, isMe && S.timeTextMe]}>{formatTime(msg.created_at)}</Text>
                </View>
                {!isMe && msg.sender_id !== 'admin' && !msg.id.startsWith('temp-') && (
                  <View style={{ position: 'absolute', top: 6, right: -18, opacity: 0.4 }}>
                    <ReportMenu
                      contentType="message"
                      contentId={msg.id.replace(/^gc-/, '')}
                      reportedUserId={msg.sender_id}
                      size={14}
                      color={theme.textMuted}
                      onActionDone={() => load()}
                    />
                  </View>
                )}
                {hasReactions && (
                  <View style={[S.reactionsRow, isMe && { justifyContent: 'flex-end' }]}>
                    {msg.reactions!.map(r => (
                      <Pressable
                        key={r.emoji}
                        onPress={() => toggleReaction(msg.id, r.emoji)}
                        style={[S.reactionPill, r.mine && S.reactionPillMine]}
                      >
                        <Text style={S.reactionEmoji}>{r.emoji}</Text>
                        <Text style={[S.reactionCount, r.mine && { color: theme.accent }]}>{r.count}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Pressable>
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

      {/* Pending image preview */}
      {pendingImage && (
        <View style={S.pendingImageBar}>
          <Image source={{ uri: pendingImage }} style={S.pendingImageThumb} />
          <TouchableOpacity onPress={() => setPendingImage(null)} style={S.pendingImageRemove}>
            <X color="#fff" size={14} />
          </TouchableOpacity>
        </View>
      )}

      {/* Character counter */}
      {input.length >= 400 && (
        <View style={S.charCounterBar}>
          <Text style={[S.charCounterText, input.length >= 500 && { color: '#ef4444' }]}>
            {input.length}/500
          </Text>
        </View>
      )}

      {/* Input bar */}
      <View style={[S.inputBar, { paddingBottom: kbOpen ? 6 : 6 + tabBarHeight }]}>
        <TouchableOpacity onPress={pickImage} style={S.imgBtn} activeOpacity={0.7}>
          <ImagePlus color={theme.textMuted} size={22} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openGifPicker} style={S.imgBtn} activeOpacity={0.7}>
          <Text style={S.gifBtnLabel}>GIF</Text>
        </TouchableOpacity>
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
          style={[S.sendBtn, (!input.trim() && !pendingImage || sending) && S.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={(!input.trim() && !pendingImage) || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Send color="#fff" size={18} />}
        </TouchableOpacity>
      </View>

      {/* Fullscreen image preview */}
      <Modal visible={!!previewImg} transparent animationType="fade" onRequestClose={() => setPreviewImg(null)}>
        <Pressable style={S.previewOverlay} onPress={() => setPreviewImg(null)}>
          <Image source={{ uri: previewImg! }} style={S.previewImage} resizeMode="contain" />
          <TouchableOpacity style={S.previewClose} onPress={() => setPreviewImg(null)}>
            <X color="#fff" size={24} />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Reaction picker */}
      <Modal visible={!!reactionMsgId} transparent animationType="fade" onRequestClose={() => setReactionMsgId(null)}>
        <Pressable style={S.reactionOverlay} onPress={() => setReactionMsgId(null)}>
          <View style={S.reactionPickerBar}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                onPress={() => reactionMsgId && toggleReaction(reactionMsgId, emoji)}
                style={S.reactionPickerBtn}
              >
                <Text style={S.reactionPickerEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* GIF picker modal */}
      <Modal visible={gifOpen} animationType="slide" onRequestClose={() => setGifOpen(false)}>
        <View style={S.gifModal}>
          <View style={S.gifHeader}>
            <Text style={S.gifHeaderTitle}>Envoyer un GIF</Text>
            <TouchableOpacity onPress={() => setGifOpen(false)}>
              <X color={theme.textMuted} size={22} />
            </TouchableOpacity>
          </View>
          <View style={S.gifSearchBar}>
            <Search color={theme.textMuted} size={16} />
            <TextInput
              style={S.gifSearchInput}
              placeholder="Rechercher un GIF..."
              placeholderTextColor={theme.textMuted}
              value={gifSearch}
              onChangeText={t => { setGifSearch(t); searchGifs(t); }}
              autoFocus
              editable={!gifUnavailable}
            />
          </View>
          {gifUnavailable ? (
            <View style={S.gifUnavailable} accessibilityLabel="GIF indisponibles">
              <Text style={S.gifUnavailableTitle}>GIF indisponibles</Text>
              <Text style={S.gifUnavailableHint}>La recherche de GIF n'est pas configurée dans cette version de l'app.</Text>
            </View>
          ) : gifLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
          ) : (
            <FlatList
              data={gifResults}
              keyExtractor={g => g.id}
              numColumns={2}
              contentContainerStyle={{ padding: 6 }}
              renderItem={({ item: g }) => (
                <TouchableOpacity
                  style={S.gifItem}
                  onPress={() => sendGif(g.url)}
                  activeOpacity={0.7}
                >
                  <Image source={{ uri: g.preview }} style={S.gifImage} resizeMode="cover" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[S.emptyText, { marginTop: 40 }]}>
                  {gifError ? 'Recherche de GIF indisponible' : 'Aucun r\u00e9sultat'}
                </Text>
              }
            />
          )}
          <Text style={S.gifAttribution} accessibilityLabel="Powered by GIPHY">Powered by GIPHY</Text>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: theme.card,
    borderBottomWidth: isDark ? 1 : 0, borderBottomColor: theme.border,
    ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  dateDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  dateLine:    { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.border },
  dateLabel:   { fontSize: 11, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  msgRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2, marginTop: 8 },
  msgRowMe:      { flexDirection: 'row-reverse' },
  msgRowGrouped: { marginTop: 2 },
  avatar:        { width: 28, height: 28, borderRadius: 10, backgroundColor: theme.accentShadow, justifyContent: 'center', alignItems: 'center' },
  avatarSpacer:  { width: 28 },
  avatarText:    { fontSize: 11, fontWeight: '900', color: '#fff' },
  bubble: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
  },
  bubbleThem: {
    backgroundColor: isDark ? theme.card : theme.card,
    borderWidth: 1, borderColor: theme.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: theme.accent,
    borderBottomRightRadius: 4,
  },
  senderName:       { fontSize: 11, fontWeight: '700', color: theme.accent, marginBottom: 2 },
  announcementTag:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  announcementText: { fontSize: 9, fontWeight: '700', color: theme.warning },
  bubbleText:       { fontSize: 15, color: theme.text, lineHeight: 21 },
  bubbleTextMe:     { color: '#fff' },
  timeText:         { fontSize: 10, color: theme.textMuted, alignSelf: 'flex-end', marginTop: 2 },
  timeTextMe:       { color: 'rgba(255,255,255,0.55)' },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border,
  },
  input: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 22,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: theme.text, maxHeight: 100,
  },
  sendBtn:         { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 22 },
  tabsContainer: { backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  tabsContent:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1, borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  tabActive:     { backgroundColor: theme.accent, borderColor: theme.accent },
  tabDot:        { width: 7, height: 7, borderRadius: 4 },
  tabText:       { fontSize: 13, fontWeight: '700', color: theme.textSecondary ?? theme.textMuted },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  attachmentWrap:  { marginBottom: 6, borderRadius: 12, overflow: 'hidden' },
  attachmentImg:   { width: SCREEN_W * 0.55, height: SCREEN_W * 0.4, borderRadius: 12 },

  reactionsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, paddingHorizontal: 4 },
  reactionPill:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
  reactionPillMine:{ borderWidth: 1, borderColor: `${theme.accent}50`, backgroundColor: `${theme.accent}12` },
  reactionEmoji:   { fontSize: 14 },
  reactionCount:   { fontSize: 11, fontWeight: '700', color: theme.textMuted },

  pendingImageBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border },
  pendingImageThumb: { width: 60, height: 60, borderRadius: 10 },
  pendingImageRemove:{ position: 'absolute', top: 4, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 4 },

  imgBtn:          { justifyContent: 'center', alignItems: 'center', padding: 6 },

  previewOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  previewImage:    { width: SCREEN_W, height: SCREEN_W },
  previewClose:    { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 10 },

  reactionOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  reactionPickerBar:  { flexDirection: 'row', backgroundColor: isDark ? '#1a1a1a' : '#fff', borderRadius: 28, paddingHorizontal: 8, paddingVertical: 6, gap: 2, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  reactionPickerBtn:  { padding: 8 },
  reactionPickerEmoji:{ fontSize: 28 },

  gifBtnLabel:     { fontSize: 13, fontWeight: '900', color: theme.textMuted, letterSpacing: 0.5 },
  gifModal:        { flex: 1, backgroundColor: theme.background, paddingTop: Platform.OS === 'ios' ? 56 : 32 },
  gifHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  gifHeaderTitle:  { fontSize: 18, fontWeight: '800', color: theme.text },
  gifSearchBar:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 12, backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 10 },
  gifSearchInput:  { flex: 1, fontSize: 15, color: theme.text },
  gifItem:         { flex: 1, margin: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
  gifImage:        { width: '100%', height: (SCREEN_W - 36) / 2 * 0.75, borderRadius: 10 },
  gifUnavailable:  { marginTop: 40, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  gifUnavailableTitle: { fontSize: 17, fontWeight: '800', color: theme.text, textAlign: 'center' },
  gifUnavailableHint:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  gifAttribution:  { fontSize: 11, fontWeight: '700', color: theme.textMuted, textAlign: 'center', paddingVertical: 10, letterSpacing: 0.5 },

  charCounterBar:  { alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 2, backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border },
  charCounterText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
}); }
