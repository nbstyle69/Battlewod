import React, { useState, useEffect, useCallback } from 'react';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import {
  View, Text, ScrollView, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Users, MapPin, ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { AthleteLevel } from '../../types';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import UserAvatar from '../../components/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import GlassBackground from '../../components/glass/GlassBackground';

const LEVELS: (AthleteLevel | 'all')[] = ['all', 'scaled', 'inter', 'rx', 'rx+', 'elite', 'pro'];
const MAIN_TABS = ['Individuel', 'Équipes', 'Box'];

function RankBadge({ rank }: { rank: number }) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  if (rank === 1) return <Text style={S.rankEmoji}>🥇</Text>;
  if (rank === 2) return <Text style={S.rankEmoji}>🥈</Text>;
  if (rank === 3) return <Text style={S.rankEmoji}>🥉</Text>;
  return <Text style={S.rankNum}>#{rank}</Text>;
}

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Leaderboard'>;

export default function LeaderboardScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const S = createStyles(theme);
  const [mainTab, setMainTab] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<AthleteLevel | 'all'>('all');

  const [athletes,       setAthletes]       = useState<any[]>([]);
  const [loadingAthletes,setLoadingAthletes] = useState(false);
  const [athletePage,    setAthletePage]    = useState(0);
  const [hasMoreAthletes, setHasMoreAthletes] = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const ATHLETE_PAGE_SIZE = 30;
  const [teams,          setTeams]          = useState<any[]>([]);
  const [loadingTeams,   setLoadingTeams]   = useState(false);
  const [boxes,          setBoxes]          = useState<any[]>([]);
  const [loadingBoxes,   setLoadingBoxes]   = useState(false);

  const { data: athleteData, isLoading: loadingAthletesQuery } = useFocusQuery(
    ['leaderboard-athletes'],
    async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, level, elo, wins, total_matches, avatar_url')
        .order('elo', { ascending: false })
        .limit(ATHLETE_PAGE_SIZE);
      return (data ?? []).map((p: any, i: number) => ({ ...p, rank: i + 1, isMe: p.id === user?.id }));
    },
    { enabled: mainTab === 0 },
  );

  useEffect(() => {
    if (athleteData) {
      setAthletes(athleteData);
      setLoadingAthletes(false);
      setAthletePage(0);
      setHasMoreAthletes(athleteData.length >= ATHLETE_PAGE_SIZE);
    } else if (loadingAthletesQuery) setLoadingAthletes(true);
  }, [athleteData, loadingAthletesQuery]);

  const loadMoreAthletes = useCallback(async () => {
    if (loadingMore || !hasMoreAthletes) return;
    setLoadingMore(true);
    const nextPage = athletePage + 1;
    const from = nextPage * ATHLETE_PAGE_SIZE;
    const { data } = await supabase
      .from('profiles')
      .select('id, username, level, elo, wins, total_matches, avatar_url')
      .order('elo', { ascending: false })
      .range(from, from + ATHLETE_PAGE_SIZE - 1);
    const newItems = (data ?? []).map((p: any, i: number) => ({ ...p, rank: from + i + 1, isMe: p.id === user?.id }));
    setAthletes(prev => [...prev, ...newItems]);
    setAthletePage(nextPage);
    setHasMoreAthletes(newItems.length >= ATHLETE_PAGE_SIZE);
    setLoadingMore(false);
  }, [athletePage, loadingMore, hasMoreAthletes, user?.id]);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    const { data: teamsData } = await supabase
      .from('inter_teams')
      .select('id, name, box_id, captain_id');
    if (!teamsData?.length) { setTeams([]); setLoadingTeams(false); return; }

    const teamIds = teamsData.map((t: any) => t.id);
    const { data: membersData } = await supabase
      .from('inter_team_members')
      .select('team_id, user_id, status')
      .in('team_id', teamIds)
      .eq('status', 'accepted');

    const memberUserIds = [...new Set([
      ...(membersData ?? []).map((m: any) => m.user_id),
      ...teamsData.map((t: any) => t.captain_id),
    ])].filter(Boolean) as string[];

    let profilesMap: Record<string, any> = {};
    if (memberUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles').select('id, elo, username').in('id', memberUserIds);
      (profilesData ?? []).forEach((p: any) => { profilesMap[p.id] = p; });
    }

    const boxIds = [...new Set(teamsData.map((t: any) => t.box_id).filter(Boolean))] as string[];
    let boxMap: Record<string, string> = {};
    if (boxIds.length > 0) {
      const { data: boxData } = await supabase.from('boxes').select('id, name').in('id', boxIds);
      (boxData ?? []).forEach((b: any) => { boxMap[b.id] = b.name; });
    }

    const teamList = teamsData.map((t: any) => {
      const accepted = (membersData ?? []).filter((m: any) => m.team_id === t.id);
      const elos = [
        profilesMap[t.captain_id]?.elo ?? 1000,
        ...accepted.map((m: any) => profilesMap[m.user_id]?.elo ?? 1000),
      ];
      const avgElo = Math.round(elos.reduce((a: number, b: number) => a + b, 0) / elos.length);
      return { id: t.id, name: t.name, boxName: boxMap[t.box_id] ?? '—', memberCount: elos.length, avgElo };
    });
    teamList.sort((a: any, b: any) => b.avgElo - a.avgElo);
    setTeams(teamList.map((t: any, i: number) => ({ ...t, rank: i + 1 })));
    setLoadingTeams(false);
  }, []);

  const loadBoxes = useCallback(async () => {
    setLoadingBoxes(true);
    try {
    const { data: boxData } = await supabase.from('boxes').select('id, name, city');
    if (!boxData?.length) { setBoxes([]); setLoadingBoxes(false); return; }

    const boxIds = boxData.map((b: any) => b.id);
    const { data: membersData } = await supabase
      .from('box_members').select('box_id, member_id').in('box_id', boxIds).eq('status', 'active');

    const memberIds = [...new Set((membersData ?? []).map((m: any) => m.member_id))] as string[];
    let profilesMap: Record<string, any> = {};
    if (memberIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles').select('id, elo, username').in('id', memberIds);
      (profilesData ?? []).forEach((p: any) => { profilesMap[p.id] = p; });
    }

    const boxList = boxData.map((b: any) => {
      const members = (membersData ?? []).filter((m: any) => m.box_id === b.id);
      const elos = members.map((m: any) => profilesMap[m.member_id]?.elo ?? 0).filter((e: number) => e > 0);
      const avgElo = elos.length ? Math.round(elos.reduce((a: number, c: number) => a + c, 0) / elos.length) : 0;
      const top = members.map((m: any) => profilesMap[m.member_id]).filter(Boolean)
        .sort((a: any, b: any) => b.elo - a.elo)[0];
      return { id: b.id, name: b.name, city: b.city ?? '', memberCount: members.length, avgElo, topAthlete: top?.username ?? '—' };
    }).filter((b: any) => b.memberCount > 0);

    boxList.sort((a: any, b: any) => b.avgElo - a.avgElo);
    setBoxes(boxList.map((b: any, i: number) => ({ ...b, rank: i + 1 })));
    } catch (e) { captureError(e, { screen: 'Leaderboard', action: 'loadBoxes' }); }
    setLoadingBoxes(false);
  }, []);

  useEffect(() => {
    if (mainTab === 1 && teams.length === 0) loadTeams();
    else if (mainTab === 2 && boxes.length === 0) loadBoxes();
  }, [mainTab]);

  const filtered = selectedLevel === 'all'
    ? athletes
    : athletes.filter((e: any) => e.level === selectedLevel);

  const top3 = athletes.slice(0, 3);

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Classement</Text>
        <Text style={S.headerSub}>Qui domine AthleX ?</Text>

        <View style={S.podium}>
          {[top3[1], top3[0], top3[2]].map((p, idx) => {
            const heights = [56, 76, 44];
            const medals = ['🥈', '🥇', '🥉'];
            return (
              <TouchableOpacity key={idx} style={S.podiumCol} activeOpacity={0.7}
                onPress={() => p?.id && p.id !== user?.id && navigation.navigate('PublicProfile', { userId: p.id })}>
                <UserAvatar
                  uri={p?.avatar_url}
                  name={p?.username ?? '?'}
                  size={idx === 1 ? 56 : 44}
                  borderRadius={idx === 1 ? 20 : 16}
                  backgroundColor={theme.surface}
                  textColor={theme.text}
                />
                <View style={[S.podiumBase, { height: heights[idx] }]}>
                  <Text style={S.podiumMedal}>{medals[idx]}</Text>
                  <Text style={S.podiumName} numberOfLines={1}>{p?.username}</Text>
                  <Text style={S.podiumElo}>{p?.elo}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={S.mainTabs}>
        {MAIN_TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setMainTab(i)}
            style={[S.mainTab, mainTab === i && S.mainTabActive]}>
            <Text style={[S.mainTabText, mainTab === i && S.mainTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mainTab === 0 && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={S.levelFilters}>
            {LEVELS.map((l) => {
              const isAll = l === 'all';
              const isSel = selectedLevel === l;
              const color = isAll ? theme.accent : (LevelColors[l as AthleteLevel] ?? theme.accent);
              return (
                <TouchableOpacity key={l} onPress={() => setSelectedLevel(l)}
                  style={[S.chip, isSel && { backgroundColor: `${color}18`, borderColor: color }]}>
                  <Text style={[S.chipText, isSel && { color, fontWeight: '800' }]}>
                    {isAll ? 'Tous' : l.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {loadingAthletes ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={filtered}
              keyExtractor={(item: any) => item.id}
              contentContainerStyle={S.list}
              showsVerticalScrollIndicator={false}
              onEndReached={selectedLevel === 'all' ? loadMoreAthletes : undefined}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.accent} /> : <View style={{ height: 24 }} />}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 40 }}>
                  <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Aucun athlète pour ce niveau</Text>
                </View>
              }
              renderItem={({ item }: { item: any }) => (
                <TouchableOpacity
                  style={[S.row, item.isMe && S.rowMe]}
                  activeOpacity={0.7}
                  onPress={() => !item.isMe && navigation.navigate('PublicProfile', { userId: item.id })}
                >
                  <View style={S.rankCell}><RankBadge rank={item.rank} /></View>
                  <UserAvatar
                    uri={item.avatar_url}
                    name={item.username ?? '?'}
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
                    <View style={S.metaRow}>
                      {item.level && (
                        <View style={[S.lvlPill, { backgroundColor: `${LevelColors[item.level as AthleteLevel] ?? theme.border}18` }]}>
                          <Text style={[S.lvlText, { color: LevelColors[item.level as AthleteLevel] ?? theme.textMuted }]}>
                            {item.level.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      {item.wins != null && (
                        <Text style={S.winsText}>
                          {item.wins}V – {(item.total_matches ?? item.wins) - item.wins}D
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={S.eloCell}>
                    <Text style={S.eloValue}>{item.elo ?? 1000}</Text>
                    <Text style={S.eloLabel}>ELO</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {mainTab === 1 && (
        loadingTeams ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
        ) : (
          <ScrollView contentContainerStyle={S.list} showsVerticalScrollIndicator={false}>
            {teams.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Users size={40} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontWeight: '600', marginTop: 12 }}>Aucune équipe enregistrée</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>Les équipes apparaissent ici après les compétitions inter-box</Text>
              </View>
            ) : teams.map((team: any) => (
              <View key={team.id} style={S.teamRow}>
                <View style={S.rankCell}><RankBadge rank={team.rank} /></View>
                <View style={S.teamAvatar}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: theme.accent }}>{(team.name ?? '?')[0].toUpperCase()}</Text>
                </View>
                <View style={S.info}>
                  <Text style={S.name}>{team.name}</Text>
                  <View style={S.metaRow}>
                    <MapPin color={theme.textMuted} size={11} />
                    <Text style={S.gymText}>{team.boxName}</Text>
                    <Users color={theme.textMuted} size={11} />
                    <Text style={S.gymText}>{team.memberCount} membres</Text>
                  </View>
                </View>
                <View style={S.eloCell}>
                  <Text style={S.eloValue}>{team.avgElo}</Text>
                  <Text style={S.eloLabel}>ELO moy.</Text>
                </View>
              </View>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )
      )}

      {mainTab === 2 && (
        loadingBoxes ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
        ) : (
          <ScrollView contentContainerStyle={S.list} showsVerticalScrollIndicator={false}>
            <Text style={S.sectionHint}>Classement des box par ELO moyen de leurs athlètes</Text>
            {boxes.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <MapPin size={40} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontWeight: '600', marginTop: 12 }}>Aucune box enregistrée</Text>
              </View>
            ) : boxes.map((gym: any) => (
              <View key={gym.id} style={S.gymRow}>
                <View style={S.rankCell}><RankBadge rank={gym.rank} /></View>
                <View style={S.gymIcon}>
                  <MapPin color={theme.accent} size={20} />
                </View>
                <View style={S.info}>
                  <Text style={S.name}>{gym.name}</Text>
                  <View style={S.metaRow}>
                    {gym.city ? <><Text style={S.gymText}>{gym.city}</Text><Text style={S.dotSep}>·</Text></> : null}
                    <Text style={S.gymText}>{gym.memberCount} athlète{gym.memberCount > 1 ? 's' : ''}</Text>
                    <Text style={S.dotSep}>·</Text>
                    <Text style={S.gymText}>Top: {gym.topAthlete}</Text>
                  </View>
                </View>
                <View style={S.eloCell}>
                  <Text style={S.eloValue}>{gym.avgElo}</Text>
                  <Text style={S.eloLabel}>ELO moy.</Text>
                </View>
              </View>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        )
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
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: 20 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    marginBottom: 6, borderWidth: 2, borderColor: theme.border,
  },
  podiumAvatarFirst: { width: 48, height: 48, borderRadius: 24, borderColor: theme.gold },
  podiumAvatarText: { fontSize: 18, fontWeight: '900', color: theme.text },
  podiumBase: {
    width: '100%', backgroundColor: theme.surface, borderRadius: 8,
    alignItems: 'center', justifyContent: 'flex-end', padding: 6,
    borderWidth: 1, borderColor: theme.border,
  },
  podiumMedal: { fontSize: 14 },
  podiumName: { fontSize: 9, fontWeight: '800', color: theme.text, marginTop: 2 },
  podiumElo: { fontSize: 11, fontWeight: '900', color: theme.accent },
  mainTabs: {
    flexDirection: 'row', backgroundColor: theme.background,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  mainTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: theme.accent },
  mainTabText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  mainTabTextActive: { color: theme.accent, fontWeight: '800' },
  levelFilters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  list: { padding: 16, gap: 8 },
  sectionHint: { fontSize: 12, color: theme.textMuted, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  rowMe: { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
  rankCell: { width: 32, alignItems: 'center' },
  rankEmoji: { fontSize: 18 },
  rankNum: { fontSize: 13, fontWeight: '800', color: theme.textMuted },
  avatarBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 15, fontWeight: '900', color: theme.text },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  lvlPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  lvlText: { fontSize: 9, fontWeight: '800' },
  winsText: { fontSize: 11, color: theme.textMuted },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: `${theme.warning}18`, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  streakText: { fontSize: 10, color: theme.warning, fontWeight: '700' },
  eloCell: { alignItems: 'flex-end' },
  eloValue: { fontSize: 17, fontWeight: '900', color: theme.text },
  eloLabel: { fontSize: 8, color: theme.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  teamAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
  },
  gymRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  gymIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
  },
  gymText: { fontSize: 11, color: theme.textMuted },
  dotSep: { color: theme.border, fontSize: 11 },
}); }
