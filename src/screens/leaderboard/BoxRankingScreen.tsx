import React from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Trophy } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WhiteboardStackParamList } from '../../navigation';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/designTokens';
import { AthleteLevel } from '../../types';
import { supabase } from '../../lib/supabase';
import { readRows } from '../../lib/db';
import UserAvatar from '../../components/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<WhiteboardStackParamList, 'BoxRanking'>;

interface Row {
  id: string;
  username: string;
  avatar_url: string | null;
  level: AthleteLevel | null;
  elo: number;
  matches: number;
  wins: number;
  rank: number;
  isMe: boolean;
}

function RankBadge({ rank }: { rank: number }) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  if (rank === 1) return <Text style={S.rankEmoji}>🥇</Text>;
  if (rank === 2) return <Text style={S.rankEmoji}>🥈</Text>;
  if (rank === 3) return <Text style={S.rankEmoji}>🥉</Text>;
  return <Text style={S.rankNum}>#{rank}</Text>;
}

export default function BoxRankingScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user, currentBox } = useAuth();
  const S = createStyles(theme);

  const { data, isLoading } = useFocusQuery(
    ['box-ranking', currentBox?.id],
    async (): Promise<Row[]> => {
      if (!currentBox) return [];

      const members = await readRows(
        supabase
          .from('box_members')
          .select('member_id, profiles(id, username, avatar_url, level)')
          .eq('box_id', currentBox.id)
          .eq('status', 'active'),
        { screen: 'BoxRanking', action: 'loadMembers' },
      );

      const eloRows = await readRows(
        supabase
          .from('box_elo')
          .select('member_id, elo, matches, wins')
          .eq('box_id', currentBox.id),
        { screen: 'BoxRanking', action: 'loadBoxElo' },
      );

      const eloMap: Record<string, { elo: number; matches: number; wins: number }> = {};
      (eloRows ?? []).forEach((r: any) => {
        eloMap[r.member_id] = { elo: r.elo, matches: r.matches, wins: r.wins };
      });

      const rows = (members ?? [])
        .map((m: any) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          const e = eloMap[m.member_id] ?? { elo: 1000, matches: 0, wins: 0 };
          return {
            id: m.member_id,
            username: p?.username ?? 'Athlète',
            avatar_url: p?.avatar_url ?? null,
            level: (p?.level as AthleteLevel) ?? null,
            elo: e.elo,
            matches: e.matches,
            wins: e.wins,
            isMe: m.member_id === user?.id,
          };
        })
        .sort((a, b) => b.elo - a.elo)
        .map((r, i) => ({ ...r, rank: i + 1 }));

      return rows;
    },
    { enabled: !!currentBox },
  );

  const rows = data ?? [];

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Classement de la box</Text>
        <Text style={S.headerSub}>ELO propre à {currentBox?.name ?? 'la box'} — WODs de la box uniquement</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Trophy size={40} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, fontWeight: '600', marginTop: 12 }}>Aucun membre pour l'instant</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[S.row, item.isMe && S.rowMe]}
              activeOpacity={0.7}
              onPress={() => !item.isMe && navigation.navigate('PublicProfile', { userId: item.id })}
            >
              <View style={S.rankCell}><RankBadge rank={item.rank} /></View>
              <UserAvatar
                uri={item.avatar_url}
                name={item.username}
                size={40}
                borderRadius={20}
                borderWidth={2}
                borderColor={LevelColors[item.level as AthleteLevel] ?? theme.border}
                backgroundColor={theme.surface}
                textColor={theme.text}
              />
              <View style={S.info}>
                <Text style={[S.name, item.isMe && { color: theme.accent }]}>
                  {item.username}{item.isMe ? ' 👈' : ''}
                </Text>
                <Text style={S.winsText}>{item.wins}V · {item.matches} WOD{item.matches > 1 ? 's' : ''}</Text>
              </View>
              <View style={S.eloCell}>
                <Text style={S.eloValue}>{item.elo}</Text>
                <Text style={S.eloLabel}>ELO box</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { marginBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: theme.text },
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  list: { padding: 16, gap: 8, paddingBottom: 140 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  rowMe: { borderColor: theme.accent, backgroundColor: `${theme.accent}0D` },
  rankCell: { width: 36, alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankNum: { fontSize: 13, fontWeight: '800', color: theme.textMuted },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: theme.text },
  winsText: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  eloCell: { alignItems: 'flex-end' },
  eloValue: { fontSize: 17, fontWeight: '900', color: theme.accent },
  eloLabel: { fontSize: 9, fontWeight: '700', color: theme.textMuted },
}); }
