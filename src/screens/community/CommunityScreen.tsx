import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Users, Search, ChevronRight, Trophy, Zap } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CommunityStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CommunityMain'>;

interface Member {
  id: string;
  username: string;
  level: string;
  elo: number;
  wins: number;
  total_matches: number;
  avatar_url?: string | null;
}

const LEVEL_COLORS: Record<string, string> = {
  scaled: '#6B7280', inter: '#3B82F6', rx: '#10B981',
  'rx+': '#F59E0B', gx: '#EF4444', pro: '#8B5CF6',
};

export default function CommunityScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);

  const [members,    setMembers]    = useState<Member[]>([]);
  const [filtered,   setFiltered]   = useState<Member[]>([]);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); setRefreshing(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, level, elo, wins, total_matches, avatar_url')
      .eq('box_id', currentBox.id)
      .order('elo', { ascending: false });
    const list = (data ?? []) as Member[];
    setMembers(list);
    setFiltered(list);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleSearch(text: string) {
    setSearch(text);
    if (!text.trim()) { setFiltered(members); return; }
    setFiltered(members.filter(m => m.username.toLowerCase().includes(text.toLowerCase())));
  }

  const myRank = members.findIndex(m => m.id === user?.id) + 1;

  if (!currentBox) {
    return (
      <View style={[S.container, S.center]}>
        <Users color={theme.textMuted} size={48} />
        <Text style={S.emptyTitle}>Aucune box</Text>
        <Text style={S.emptySub}>Rejoins une box pour voir ses membres.</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <View>
          <Text style={S.headerTitle}>Membres</Text>
          <Text style={S.headerSub}>{currentBox.name} · {members.length} athlète{members.length > 1 ? 's' : ''}</Text>
        </View>
        {myRank > 0 && (
          <View style={S.myRankBadge}>
            <Trophy color={theme.gold} size={14} />
            <Text style={S.myRankText}>#{myRank}</Text>
          </View>
        )}
      </View>

      <View style={S.searchWrap}>
        <Search color={theme.textMuted} size={16} style={S.searchIcon} />
        <TextInput
          style={S.searchInput}
          placeholder="Rechercher un athlète…"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={m => m.id}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListEmptyComponent={
            <View style={S.center}>
              <Text style={S.emptySub}>Aucun membre trouvé.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe = item.id === user?.id;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
            const levelColor = LEVEL_COLORS[item.level] ?? '#6B7280';
            return (
              <TouchableOpacity
                style={[S.row, isMe && S.rowMe]}
                onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
                activeOpacity={0.75}
              >
                <Text style={S.rank}>{medal ?? `${index + 1}`}</Text>
                <View style={[S.avatar, { backgroundColor: `${levelColor}30` }]}>
                  <Text style={[S.avatarText, { color: levelColor }]}>
                    {item.username[0].toUpperCase()}
                  </Text>
                </View>
                <View style={S.info}>
                  <Text style={S.name}>{item.username}{isMe ? ' (moi)' : ''}</Text>
                  <View style={S.pills}>
                    <View style={[S.levelPill, { backgroundColor: `${levelColor}20` }]}>
                      <View style={[S.levelDot, { backgroundColor: levelColor }]} />
                      <Text style={[S.levelText, { color: levelColor }]}>{item.level?.toUpperCase()}</Text>
                    </View>
                    {(item.total_matches ?? 0) > 0 && (
                      <Text style={S.matchText}>{item.wins ?? 0}V/{item.total_matches ?? 0}M</Text>
                    )}
                  </View>
                </View>
                <View style={S.eloWrap}>
                  <Text style={S.eloVal}>{item.elo}</Text>
                  <Text style={S.eloLabel}>ELO</Text>
                </View>
                <ChevronRight color={theme.textMuted} size={14} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    center:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 },
    header: {
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    headerTitle: { fontSize: 24, fontWeight: '900', color: theme.text },
    headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 1 },
    myRankBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: `${theme.gold}18`, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 7,
      borderWidth: 1, borderColor: `${theme.gold}30`,
    },
    myRankText: { fontSize: 14, fontWeight: '900', color: theme.gold },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
      paddingHorizontal: 16, paddingVertical: 10, gap: 10,
    },
    searchIcon: {},
    searchInput: {
      flex: 1, fontSize: 15, color: theme.text,
      paddingVertical: 6,
    },
    list: { padding: 12, gap: 8, paddingBottom: 40 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    rowMe: { borderColor: theme.accent, backgroundColor: `${theme.accent}08` },
    rank: { width: 28, fontSize: 16, textAlign: 'center', color: theme.text },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 17, fontWeight: '900' },
    info: { flex: 1 },
    name: { fontSize: 14, fontWeight: '800', color: theme.text },
    pills: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    levelPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    },
    levelDot: { width: 5, height: 5, borderRadius: 3 },
    levelText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
    matchText: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
    eloWrap: { alignItems: 'center' },
    eloVal:  { fontSize: 16, fontWeight: '900', color: theme.text },
    eloLabel:{ fontSize: 9,  fontWeight: '700', color: theme.textMuted, letterSpacing: 1 },
    emptyTitle: { fontSize: 17, fontWeight: '900', color: theme.text },
    emptySub:   { fontSize: 13, color: theme.textMuted, textAlign: 'center' },
  });
}
