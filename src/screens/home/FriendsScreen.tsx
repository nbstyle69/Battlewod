import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, TextInput,
} from 'react-native';
import { ChevronLeft, UserPlus, Check, X, Search, UserCheck } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { HomeStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<HomeStackParamList>;

interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester?: { id: string; username: string; level: string; elo: number };
  addressee?: { id: string; username: string; level: string; elo: number };
}

interface Friend {
  id: string;
  username: string;
  level: string;
  elo: number;
}

const LEVEL_COLORS: Record<string, string> = {
  scaled: '#6B7280', inter: '#3B82F6', rx: '#10B981',
  'rx+': '#F59E0B', gx: '#EF4444', pro: '#8B5CF6',
};

export default function FriendsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);

  const [tab, setTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingReceived, setPendingReceived] = useState<FriendRequest[]>([]);
  const [pendingSent, setPendingSent] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: received } = await supabase
      .from('friendships')
      .select('*, requester:profiles!friendships_requester_id_fkey(id, username, level, elo)')
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPendingReceived((received ?? []) as FriendRequest[]);

    const { data: sent } = await supabase
      .from('friendships')
      .select('*, addressee:profiles!friendships_addressee_id_fkey(id, username, level, elo)')
      .eq('requester_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPendingSent((sent ?? []) as FriendRequest[]);

    const { data: accepted } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, level, elo), addressee:profiles!friendships_addressee_id_fkey(id, username, level, elo)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const friendList: Friend[] = (accepted ?? []).map((r: any) => {
      const other = r.requester_id === user.id ? r.addressee : r.requester;
      return other as Friend;
    }).filter(Boolean);
    setFriends(friendList);

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleSearch() {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, level, elo')
      .ilike('username', `%${searchQuery.trim()}%`)
      .neq('id', user.id)
      .limit(10);
    setSearchResults((data ?? []) as Friend[]);
    setSearching(false);
  }

  async function sendFriendRequest(targetId: string) {
    if (!user) return;
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: targetId,
      status: 'pending',
    });
    if (error) {
      if (error.code === '23505') Alert.alert('Invitation déjà envoyée');
      else Alert.alert('Erreur', error.message);
      return;
    }
    Alert.alert('✅', 'Invitation envoyée !');
    load();
  }

  async function handleAccept(requestId: string) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
    load();
  }

  async function handleDecline(requestId: string) {
    await supabase.from('friendships').update({ status: 'declined' }).eq('id', requestId);
    load();
  }

  async function handleCancelRequest(requestId: string) {
    await supabase.from('friendships').delete().eq('id', requestId);
    load();
  }

  function isAlreadyFriend(targetId: string): boolean {
    return friends.some(f => f.id === targetId);
  }

  function hasPendingRequest(targetId: string): boolean {
    return pendingSent.some(r => (r.addressee as any)?.id === targetId);
  }

  const pendingCount = pendingReceived.length;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>Amis</Text>
          <Text style={S.headerSub}>{friends.length} ami{friends.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      <View style={S.tabRow}>
        {([
          { key: 'friends',  label: 'Mes amis',    Icon: UserCheck },
          { key: 'requests', label: `Invitations${pendingCount > 0 ? ` (${pendingCount})` : ''}`, Icon: UserPlus },
          { key: 'search',   label: 'Rechercher',  Icon: Search },
        ] as const).map(({ key, label, Icon }) => (
          <TouchableOpacity
            key={key}
            style={[S.tab, tab === key && S.tabActive]}
            onPress={() => setTab(key)}
          >
            <Icon size={14} color={tab === key ? theme.accent : theme.textMuted} />
            <Text style={[S.tabText, tab === key && S.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {tab === 'friends' && (
            <>
              {friends.length === 0 ? (
                <View style={S.emptyCard}>
                  <Text style={S.emptyEmoji}>👥</Text>
                  <Text style={S.emptyTitle}>Pas encore d'amis</Text>
                  <Text style={S.emptySub}>Recherche des athlètes et envoie des invitations !</Text>
                  <TouchableOpacity style={S.emptyBtn} onPress={() => setTab('search')}>
                    <Search color="#fff" size={16} />
                    <Text style={S.emptyBtnText}>Rechercher</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                friends.map(friend => (
                  <TouchableOpacity
                    key={friend.id}
                    style={S.friendRow}
                    onPress={() => navigation.navigate('PublicProfile', { userId: friend.id })}
                    activeOpacity={0.75}
                  >
                    <View style={S.avatar}>
                      <Text style={S.avatarText}>{friend.username[0].toUpperCase()}</Text>
                    </View>
                    <View style={S.friendInfo}>
                      <Text style={S.friendName}>{friend.username}</Text>
                      <View style={S.levelPill}>
                        <View style={[S.levelDot, { backgroundColor: LEVEL_COLORS[friend.level] ?? '#6B7280' }]} />
                        <Text style={[S.levelText, { color: LEVEL_COLORS[friend.level] ?? '#6B7280' }]}>
                          {friend.level?.toUpperCase()}
                        </Text>
                        <Text style={S.eloText}>· {friend.elo} ELO</Text>
                      </View>
                    </View>
                    <ChevronLeft color={theme.textMuted} size={16} style={{ transform: [{ rotate: '180deg' }] }} />
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {tab === 'requests' && (
            <>
              {pendingReceived.length > 0 && (
                <>
                  <Text style={S.subTitle}>Reçues</Text>
                  {pendingReceived.map(req => {
                    const sender = req.requester as any;
                    return (
                      <View key={req.id} style={S.requestRow}>
                        <View style={S.avatar}>
                          <Text style={S.avatarText}>{sender?.username?.[0]?.toUpperCase() ?? '?'}</Text>
                        </View>
                        <View style={S.friendInfo}>
                          <Text style={S.friendName}>{sender?.username ?? 'Athlète'}</Text>
                          <View style={S.levelPill}>
                            <View style={[S.levelDot, { backgroundColor: LEVEL_COLORS[sender?.level] ?? '#6B7280' }]} />
                            <Text style={[S.levelText, { color: LEVEL_COLORS[sender?.level] ?? '#6B7280' }]}>
                              {sender?.level?.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <View style={S.actionBtns}>
                          <TouchableOpacity style={S.acceptBtn} onPress={() => handleAccept(req.id)}>
                            <Check color="#fff" size={16} />
                          </TouchableOpacity>
                          <TouchableOpacity style={S.declineBtn} onPress={() => handleDecline(req.id)}>
                            <X color="#fff" size={16} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
              {pendingSent.length > 0 && (
                <>
                  <Text style={[S.subTitle, { marginTop: 20 }]}>Envoyées</Text>
                  {pendingSent.map(req => {
                    const receiver = req.addressee as any;
                    return (
                      <View key={req.id} style={S.requestRow}>
                        <View style={S.avatar}>
                          <Text style={S.avatarText}>{receiver?.username?.[0]?.toUpperCase() ?? '?'}</Text>
                        </View>
                        <View style={S.friendInfo}>
                          <Text style={S.friendName}>{receiver?.username ?? 'Athlète'}</Text>
                          <Text style={S.pendingLabel}>En attente…</Text>
                        </View>
                        <TouchableOpacity style={S.cancelBtn} onPress={() => handleCancelRequest(req.id)}>
                          <Text style={S.cancelBtnText}>Annuler</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )}
              {pendingReceived.length === 0 && pendingSent.length === 0 && (
                <View style={S.emptyCard}>
                  <Text style={S.emptyEmoji}>📬</Text>
                  <Text style={S.emptyTitle}>Aucune invitation</Text>
                  <Text style={S.emptySub}>Quand quelqu'un t'enverra une invitation, elle apparaîtra ici.</Text>
                </View>
              )}
            </>
          )}

          {tab === 'search' && (
            <>
              <View style={S.searchRow}>
                <TextInput
                  style={S.searchInput}
                  placeholder="Rechercher un athlète…"
                  placeholderTextColor={theme.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={S.searchBtn} onPress={handleSearch} disabled={searching}>
                  {searching ? <ActivityIndicator color="#fff" size="small" /> : <Search color="#fff" size={18} />}
                </TouchableOpacity>
              </View>
              {searchResults.map(result => {
                const alreadyFriend = isAlreadyFriend(result.id);
                const pending = hasPendingRequest(result.id);
                return (
                  <TouchableOpacity
                    key={result.id}
                    style={S.friendRow}
                    onPress={() => navigation.navigate('PublicProfile', { userId: result.id })}
                    activeOpacity={0.75}
                  >
                    <View style={S.avatar}>
                      <Text style={S.avatarText}>{result.username[0].toUpperCase()}</Text>
                    </View>
                    <View style={S.friendInfo}>
                      <Text style={S.friendName}>{result.username}</Text>
                      <View style={S.levelPill}>
                        <View style={[S.levelDot, { backgroundColor: LEVEL_COLORS[result.level] ?? '#6B7280' }]} />
                        <Text style={[S.levelText, { color: LEVEL_COLORS[result.level] ?? '#6B7280' }]}>
                          {result.level?.toUpperCase()}
                        </Text>
                        <Text style={S.eloText}>· {result.elo} ELO</Text>
                      </View>
                    </View>
                    {alreadyFriend ? (
                      <View style={S.alreadyFriendTag}>
                        <UserCheck size={14} color={theme.success} />
                        <Text style={[S.alreadyFriendText, { color: theme.success }]}>Ami</Text>
                      </View>
                    ) : pending ? (
                      <View style={S.alreadyFriendTag}>
                        <Text style={[S.alreadyFriendText, { color: theme.textMuted }]}>En attente</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={S.addBtn}
                        onPress={(e) => { e.stopPropagation(); sendFriendRequest(result.id); }}
                        activeOpacity={0.8}
                      >
                        <UserPlus size={15} color="#fff" />
                        <Text style={S.addBtnText}>Ajouter</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
      flexDirection: 'row', alignItems: 'center', gap: 14,
    },
    back: { padding: 4 },
    headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text },
    headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabRow: {
      flexDirection: 'row', backgroundColor: theme.card,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    tab: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: 12,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: theme.accent },
    tabText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
    tabTextActive: { color: theme.accent },
    content: { padding: 16, gap: 10 },
    subTitle: { fontSize: 13, fontWeight: '800', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 4 },
    emptyCard: {
      backgroundColor: theme.card, borderRadius: 20, padding: 32,
      borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10, marginTop: 20,
    },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '900', color: theme.text },
    emptySub: { fontSize: 13, color: theme.textMuted, textAlign: 'center', lineHeight: 18 },
    emptyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: theme.accent, borderRadius: 12,
      paddingHorizontal: 20, paddingVertical: 12, marginTop: 4,
    },
    emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    friendRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    requestRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: theme.accentShadow,
      justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 16, fontWeight: '900', color: '#fff' },
    friendInfo: { flex: 1 },
    friendName: { fontSize: 15, fontWeight: '800', color: theme.text },
    levelPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    levelDot: { width: 6, height: 6, borderRadius: 3 },
    levelText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    eloText: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    pendingLabel: { fontSize: 11, color: theme.textMuted, marginTop: 2, fontStyle: 'italic' },
    actionBtns: { flexDirection: 'row', gap: 8 },
    acceptBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: theme.success, justifyContent: 'center', alignItems: 'center',
    },
    declineBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center',
    },
    cancelBtn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    },
    cancelBtnText: { fontSize: 12, color: theme.textMuted, fontWeight: '700' },
    searchRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    searchInput: {
      flex: 1, backgroundColor: theme.card, borderRadius: 12,
      borderWidth: 1, borderColor: theme.border,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: theme.text,
    },
    searchBtn: {
      width: 48, height: 48, borderRadius: 12,
      backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center',
    },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: theme.accent, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    addBtnText: { fontSize: 12, color: '#fff', fontWeight: '800' },
    alreadyFriendTag: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: theme.surface, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    alreadyFriendText: { fontSize: 12, fontWeight: '700' },
  });
}
