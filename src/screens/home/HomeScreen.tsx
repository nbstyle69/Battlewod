import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, Pressable, RefreshControl, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { Zap, Trophy, Flame, Timer, BarChart2, Sparkles, Target, User, Users, History, Bell, ChevronDown, Building2, Check, Plus } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { HomeStackParamList, CompetitionSummary } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { formatScoreValue } from '../../utils/scoreFormat';
import { getStreak, StreakInfo } from '../../services/gamification';
import AutoScrollCarousel from '../../components/AutoScrollCarousel';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeList'>;

interface RecentScore {
  id: string;
  score_value: string;
  submitted_at: string;
  wod_title: string;
  status: string;
}


export default function HomeScreen() {
  const { user, currentBox, myBoxes, switchBox } = useAuth();
  const [boxPickerVisible, setBoxPickerVisible] = useState(false);
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const level = user?.level ?? 'scaled';
  const S = createStyles(theme);

  const TOOLS = [
    { icon: BarChart2, label: 'Classement',      desc: 'Individuel · Équipes · Box',   color: theme.gold,    screen: 'Leaderboard'     },
    { icon: Timer,     label: 'Minuteur vidéo',  desc: 'For Time · AMRAP · EMOM…',    color: theme.accent,  screen: 'Timer'           },
    { icon: Sparkles,  label: 'Générateur WOD',  desc: 'For Time · AMRAP · Tabata',   color: '#6366F1',     screen: 'WODGenerator'    },
    { icon: Target,    label: 'Calculateur 1RM', desc: '50% → 130% · Zones',          color: '#10B981',     screen: 'OneRMCalculator' },
  ];

  const [competitions,   setCompetitions]   = useState<CompetitionSummary[]>([]);
  const [recentScores,   setRecentScores]   = useState<RecentScore[]>([]);
  const [rank,           setRank]           = useState<number | null>(null);
  const [streak,         setStreak]         = useState<StreakInfo>({ current_streak: 0, longest_streak: 0, week_session_count: 0, week_start: '', max_sessions_per_week: null });
  const [pendingFriends, setPendingFriends] = useState(0);
  const [unreadAccepted, setUnreadAccepted] = useState(0);
  const [unreadChangelog, setUnreadChangelog] = useState(0);

  // Progression stats
  const [totalWods,       setTotalWods]       = useState(0);
  const [totalScoresGen,  setTotalScoresGen]  = useState(0);
  const [genStreak,       setGenStreak]       = useState(0);
  const [weekActivity,    setWeekActivity]    = useState<number[]>([0,0,0,0,0,0,0]);
  const [favCount,        setFavCount]        = useState(0);
  const [bestScores,      setBestScores]      = useState<{name:string; value:string; type:string}[]>([]);
  const [physComps,       setPhysComps]       = useState<{id:string; name:string; logo_url:string|null; mode:string}[]>([]);

  const { data: homeData, isLoading: homeDataLoading, refetch: refetchHome } = useFocusQuery(
    ['home', user?.id, currentBox?.id],
    async () => {
    if (!user) return null;

    // Rank: number of profiles with higher ELO + 1
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('elo', user.elo ?? 0);
    // Streak from gamification service
    const streakData = await getStreak(user.id, currentBox?.id);

    // Unread changelog count
    const [{ count: totalCl }, { count: readCl }] = await Promise.all([
      supabase.from('app_changelog').select('id', { count: 'exact', head: true }),
      supabase.from('changelog_reads').select('changelog_id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);
    // Competitions: from current box if member, else global open ones
    const boxFilter = currentBox?.id;
    const { data: tourns } = await supabase
      .from('tournaments')
      .select('id, name, description, level, status, start_date, end_date, max_participants, prize, tournament_participants(count)')
      .in('status', ['open', 'active'])
      .eq('box_id', boxFilter ?? '')
      .order('start_date')
      .limit(6);

    const mapped: CompetitionSummary[] = (tourns ?? []).map((t: any) => ({
      id:              t.id,
      name:            t.name,
      description:     t.description ?? '',
      level:           t.level ?? 'rx',
      status:          t.status,
      startDate:       t.start_date ? new Date(t.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—',
      endDate:         t.end_date   ? new Date(t.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—',
      participants:    t.tournament_participants?.[0]?.count ?? 0,
      maxParticipants: t.max_participants ?? 0,
      prize:           t.prize ?? '',
      wods:            [],
    }));
    // Pending friend requests
    const { count: friendCount } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending');
    // Unread accepted friend requests (my sent requests that were accepted since last seen)
    const lastSeen = await AsyncStorage.getItem(`lastSeenFriends_${user.id}`);
    if (lastSeen) {
      const { count: acceptedCount } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .eq('status', 'accepted')
        .gt('updated_at', lastSeen);
      setUnreadAccepted(acceptedCount ?? 0);
    } else {
      await AsyncStorage.setItem(`lastSeenFriends_${user.id}`, new Date().toISOString());
    }

    // ── Progression stats (generated_wods) ──
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysStr = sevenDaysAgo.toISOString();

    const [{ count: genWodCount }, { count: genScoreCount }, { count: genFavCount }, { data: genWeek }, { data: genAll }] = await Promise.all([
      supabase.from('generated_wods').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('generated_wod_scores').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('generated_wods').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_favorite', true),
      supabase.from('generated_wods').select('created_at').eq('user_id', user.id).gte('created_at', sevenDaysStr),
      supabase.from('generated_wods').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    ]);
    // Week activity (7 bars)
    const weekArr = [0,0,0,0,0,0,0];
    const now = new Date();
    (genWeek ?? []).forEach((w: any) => {
      const d = new Date(w.created_at);
      const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) weekArr[6 - diff]++;
    });
    // Gen streak
    let gs = 0;
    if (genAll && genAll.length > 0) {
      const days = [...new Set((genAll as any[]).map((w: any) => w.created_at.slice(0, 10)))];
      const td = new Date();
      for (let i = 0; i < days.length; i++) {
        const check = new Date(td);
        check.setDate(td.getDate() - i);
        if (days.includes(check.toISOString().slice(0, 10))) gs++;
        else break;
      }
    }

    // Best scores per WOD type
    const { data: bestData } = await supabase
      .from('generated_wod_scores')
      .select('score_type, score_value, wod:generated_wods(wod_name, wod_type)')
      .eq('user_id', user.id)
      .order('score_value', { ascending: true })
      .limit(50);
    const byType: Record<string, {name:string; value:number; type:string}> = {};
    if (bestData && bestData.length > 0) {
      (bestData as any[]).forEach(s => {
        const wodType = s.wod?.wod_type ?? 'unknown';
        const key = wodType;
        if (!byType[key]) {
          byType[key] = { name: s.wod?.wod_name ?? '—', value: s.score_value, type: s.score_type };
        } else {
          if (s.score_type === 'time' && s.score_value < byType[key].value) {
            byType[key] = { name: s.wod?.wod_name ?? '—', value: s.score_value, type: s.score_type };
          } else if (s.score_type !== 'time' && s.score_value > byType[key].value) {
            byType[key] = { name: s.wod?.wod_name ?? '—', value: s.score_value, type: s.score_type };
          }
        }
      });
    }
    const bestScoresMapped = Object.entries(byType).map(([, v]) => ({
      name: v.name,
      value: formatScoreValue(v.value, v.type),
      type: v.type === 'time' ? '⏱' : v.type === 'reps' ? '🔄' : v.type === 'weight' ? '🏋️' : '🔁',
    })).slice(0, 4);

    // Recent scores
    const { data: scores } = await supabase
      .from('tournament_scores')
      .select('id, score_value, submitted_at, status, tw:tournament_wods(title)')
      .eq('athlete_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(3);

    const recentScoresMapped = (scores ?? []).map((s: any) => ({
      id:           s.id,
      score_value:  s.score_value,
      submitted_at: s.submitted_at,
      wod_title:    (Array.isArray(s.tw) ? s.tw[0] : s.tw)?.title ?? '—',
      status:       s.status,
    }));

    // Physical competitions for carousel
    const { data: physData } = await supabase
      .from('physical_competitions')
      .select('id, name, logo_url, mode')
      .in('status', ['open', 'active'])
      .order('date', { ascending: true })
      .limit(20);

    return {
      rank: (count ?? 0) + 1,
      streak: streakData,
      unreadChangelog: Math.max(0, (totalCl ?? 0) - (readCl ?? 0)),
      competitions: mapped,
      pendingFriends: friendCount ?? 0,
      recentScores: recentScoresMapped,
      totalWods: genWodCount ?? 0,
      totalScoresGen: genScoreCount ?? 0,
      favCount: genFavCount ?? 0,
      weekActivity: weekArr,
      genStreak: gs,
      bestScores: bestScoresMapped,
      physComps: (physData ?? []).map((p: any) => ({ id: p.id, name: p.name, logo_url: p.logo_url, mode: p.mode })),
    };
  },
    { enabled: !!user },
  );

  // Sync cached data from React Query on remount (stale-while-revalidate)
  useEffect(() => {
    if (!homeData) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRank(homeData.rank);
    setStreak(homeData.streak);
    setUnreadChangelog(homeData.unreadChangelog);
    setCompetitions(homeData.competitions);
    setPendingFriends(homeData.pendingFriends);
    setRecentScores(homeData.recentScores);
    setTotalWods(homeData.totalWods);
    setTotalScoresGen(homeData.totalScoresGen);
    setFavCount(homeData.favCount);
    setWeekActivity(homeData.weekActivity);
    setGenStreak(homeData.genStreak);
    setBestScores(homeData.bestScores);
    setPhysComps(homeData.physComps);
  }, [homeData]);

  // Realtime: refresh badge when a new friend request targets this user
  useEffect(() => {
    if (!user) return;
    const refreshCounts = async () => {
      try {
      const [{ count: pending }, lastSeen] = await Promise.all([
        supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('addressee_id', user.id).eq('status', 'pending'),
        AsyncStorage.getItem(`lastSeenFriends_${user.id}`),
      ]);
      setPendingFriends(pending ?? 0);
      if (lastSeen) {
        const { count: accepted } = await supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('requester_id', user.id).eq('status', 'accepted').gt('updated_at', lastSeen);
        setUnreadAccepted(accepted ?? 0);
      }
      } catch (e) { captureError(e, { screen: 'Home', action: 'refreshFriendCounts' }); }
    };
    const channel = supabase
      .channel(`friend-notif-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` }, refreshCounts)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `requester_id=eq.${user.id}` }, refreshCounts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Reset unread count when returning to Home after visiting Friends
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      AsyncStorage.getItem(`lastSeenFriends_${user.id}`).then(async (lastSeen) => {
        try {
        if (lastSeen) {
          const { count: accepted } = await supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('requester_id', user.id).eq('status', 'accepted').gt('updated_at', lastSeen);
          setUnreadAccepted(accepted ?? 0);
        }
        } catch (e) { captureError(e, { screen: 'Home', action: 'refreshUnreadAccepted' }); }
      });
    }, [user])
  );

  const levelColor = LevelColors[level] ?? theme.text;

  return (
    <ScrollView
      style={S.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={homeDataLoading}
          onRefresh={refetchHome}
          tintColor={theme.accent}
          colors={[theme.accent]}
        />
      }
    >

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={S.header}>
        <View style={S.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={S.username}>{user?.username ?? 'Athlète'}</Text>
            {currentBox && (
              <TouchableOpacity
                onPress={() => myBoxes.length > 1 ? setBoxPickerVisible(true) : null}
                activeOpacity={myBoxes.length > 1 ? 0.7 : 1}
                style={S.boxSwitchBtn}
              >
                <Building2 size={12} color={theme.textSecondary} />
                <Text style={S.boxSwitchText} numberOfLines={1}>{currentBox.name}</Text>
                {myBoxes.length > 1 && <ChevronDown size={12} color={theme.textMuted} />}
              </TouchableOpacity>
            )}
          </View>
          {currentBox?.logo_url ? (
            <TouchableOpacity onPress={() => navigation.navigate('BoxInfo')} activeOpacity={0.8}>
              <Image source={{ uri: currentBox.logo_url }} style={S.boxLogo} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => navigation.navigate('Changelog' as never)} activeOpacity={0.7} style={{ position: 'relative', marginLeft: 12 }} accessibilityLabel="Notifications" accessibilityRole="button">
            <Bell size={22} color={theme.text} />
            {unreadChangelog > 0 && (
              <View style={S.bellBadge}>
                <Text style={S.bellBadgeText}>{unreadChangelog > 9 ? '9+' : unreadChangelog}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Box Picker Modal */}
        <Modal visible={boxPickerVisible} transparent animationType="slide" onRequestClose={() => setBoxPickerVisible(false)}>
          <Pressable style={S.boxPickerOverlay} onPress={() => setBoxPickerVisible(false)}>
            <Pressable style={S.boxPickerSheet} onPress={() => {}}>
              <View style={S.boxPickerHandle} />
              <Text style={S.boxPickerTitle}>Mes boxes</Text>
              {myBoxes.map(entry => {
                const isActive = entry.box.id === currentBox?.id;
                return (
                  <TouchableOpacity
                    key={entry.box.id}
                    style={[S.boxPickerRow, isActive && S.boxPickerRowActive]}
                    onPress={() => { switchBox(entry.box.id); setBoxPickerVisible(false); }}
                    activeOpacity={0.7}
                  >
                    {entry.box.logo_url ? (
                      <Image source={{ uri: entry.box.logo_url }} style={S.boxPickerLogo} />
                    ) : (
                      <View style={S.boxPickerIconWrap}><Building2 size={18} color={theme.textSecondary} /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[S.boxPickerName, isActive && { color: theme.accent }]}>{entry.box.name}</Text>
                      <Text style={S.boxPickerRole}>{entry.role === 'owner' ? 'Propriétaire' : entry.role === 'coach' ? 'Coach' : 'Membre'}</Text>
                    </View>
                    {isActive && <Check size={18} color={theme.accent} />}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Hero: ELO + Level + Rank */}
        <View style={S.heroRow}>
          <TouchableOpacity style={S.heroElo} onPress={() => navigation.navigate('EloHistory' as never)} activeOpacity={0.6}>
            <Text style={S.heroEloNum}>{user?.elo ?? 1000}</Text>
            <Text style={S.heroEloLabel}>ELO ›</Text>
          </TouchableOpacity>
          <View style={S.heroDivider} />
          <View style={S.heroStat}>
            <Text style={S.heroStatNum}>{rank !== null ? `#${rank}` : '—'}</Text>
            <Text style={S.heroStatLabel}>Rang</Text>
          </View>
          <View style={S.heroDivider} />
          <View style={S.heroStat}>
            <Text style={S.heroStatNum}>🔥 {streak.current_streak}</Text>
            <Text style={S.heroStatLabel}>{streak.week_session_count}/{streak.max_sessions_per_week ?? '∞'} sem.</Text>
          </View>
          <View style={S.heroDivider} />
          <View style={S.heroStat}>
            <Text style={S.heroStatNum}>{user?.wins ?? 0}</Text>
            <Text style={S.heroStatLabel}>Victoires</Text>
          </View>
        </View>

        {/* Level badge */}
        <View style={S.levelRow}>
          <View style={[S.levelDot, { backgroundColor: levelColor }]} />
          <Text style={[S.levelTxt, { color: levelColor }]}>{level.toUpperCase()}</Text>
          <Text style={S.matchesTxt}>{user?.total_matches ?? 0} matchs</Text>
        </View>

        {/* Action buttons */}
        <View style={S.actionBtns}>
          <TouchableOpacity style={S.actionBtn} onPress={() => navigation.navigate('Friends')} activeOpacity={0.75} accessibilityLabel="Amis" accessibilityRole="button">
            <View style={{ position: 'relative' }}>
              <Users size={17} color={theme.text} />
              {(pendingFriends + unreadAccepted) > 0 && (
                <View style={S.notifDot}>
                  <Text style={S.notifDotTxt}>{(pendingFriends + unreadAccepted) > 9 ? '9+' : (pendingFriends + unreadAccepted)}</Text>
                </View>
              )}
            </View>
            <Text style={S.actionBtnTxt}>Amis</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.actionBtn} onPress={() => navigation.navigate('Profile')} activeOpacity={0.75} accessibilityLabel="Mon profil" accessibilityRole="button">
            <User size={17} color={theme.text} />
            <Text style={S.actionBtnTxt}>Profil</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Activité semaine ──────────────────────────────────────────── */}
      {(totalWods > 0 || genStreak > 0) && (
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Cette semaine</Text>
            <TouchableOpacity onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.7}>
              <Text style={S.linkText}>Historique</Text>
            </TouchableOpacity>
          </View>
          <View style={S.weekRow}>
            {['L','M','M','J','V','S','D'].map((day, i) => {
              const max = Math.max(...weekActivity, 1);
              const h = Math.max(3, (weekActivity[i] / max) * 36);
              const isToday = i === (new Date().getDay() + 6) % 7;
              const active = weekActivity[i] > 0;
              return (
                <View key={i} style={S.weekCol}>
                  <View style={[S.weekBar, { height: h, backgroundColor: active ? theme.text : theme.border }, isToday && active && { backgroundColor: theme.primary }]} />
                  <Text style={[S.weekDayTxt, isToday && { fontWeight: '900', color: theme.text }]}>{day}</Text>
                </View>
              );
            })}
          </View>

          {/* Compact prog stats */}
          <View style={S.progStrip}>
            {[
              { val: totalWods, lbl: 'WODs' },
              { val: totalScoresGen, lbl: 'Scores' },
              { val: genStreak, lbl: 'Streak' },
              { val: favCount, lbl: 'Favoris' },
            ].map(s => (
              <View key={s.lbl} style={S.progItem}>
                <Text style={S.progItemNum}>{s.val}</Text>
                <Text style={S.progItemLbl}>{s.lbl}</Text>
              </View>
            ))}
          </View>

          {/* PRs */}
          {bestScores.length > 0 && (
            <View style={S.prBlock}>
              <Text style={S.prBlockTitle}>Records personnels</Text>
              {bestScores.map((pr, i) => (
                <View key={i} style={S.prLine}>
                  <Text style={S.prLineIcon}>{pr.type}</Text>
                  <Text style={S.prLineName} numberOfLines={1}>{pr.name}</Text>
                  <Text style={S.prLineVal}>{pr.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Outils ─────────────────────────────────────────────────────── */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Outils</Text>
        <View style={S.toolList}>
          {TOOLS.map(t => (
            <TouchableOpacity key={t.label} style={S.toolRow} onPress={() => navigation.navigate(t.screen as any)} activeOpacity={0.6}>
              <View style={[S.toolIconBox, { backgroundColor: t.color + '18' }]}>
                <t.icon color={t.color} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.toolLabel}>{t.label}</Text>
                <Text style={S.toolDesc}>{t.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Compétitions physiques (carousel) ─────────────────────────── */}
      {physComps.length > 0 && (
        <View style={S.section}>
          <Text style={S.sectionTitle}>Compétitions</Text>
          <AutoScrollCarousel
            data={physComps}
            itemWidth={140}
            gap={12}
            speed={30}
            style={{ marginTop: 8 }}
            renderItem={(item) => (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const nav = navigation.getParent?.();
                  if (nav) {
                    nav.navigate('Competitions', {
                      screen: 'PhysicalCompetition',
                      params: { mode: item.mode as any, selectedId: item.id },
                    });
                  }
                }}
                style={{
                  width: 140,
                  height: 160,
                  backgroundColor: '#1E1E1E',
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                }}
              >
                {item.logo_url ? (
                  <Image
                    source={{ uri: item.logo_url }}
                    style={{ width: 80, height: 80, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={{ width: 80, height: 80, borderRadius: 12, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
                    <Trophy color={theme.textMuted} size={32} />
                  </View>
                )}
                <Text
                  numberOfLines={2}
                  style={{
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: '700',
                    textAlign: 'center',
                    marginTop: 8,
                  }}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* ── Tournois ──────────────────────────────────────────────────── */}
      {competitions.length > 0 && (
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Tournois</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={S.linkText}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {competitions.map((comp: CompetitionSummary) => (
              <TouchableOpacity
                key={comp.id}
                style={S.compCard}
                onPress={() => navigation.navigate('CompetitionDetail', { competition: comp })}
                activeOpacity={0.7}
              >
                <View style={S.compBadgeRow}>
                  <View style={[S.compDot, { backgroundColor: comp.status === 'open' ? theme.text : comp.status === 'active' ? theme.textMuted : theme.border }]} />
                  <Text style={S.compStatus}>{comp.status === 'open' ? 'Ouvert' : comp.status === 'active' ? 'En cours' : 'Terminé'}</Text>
                </View>
                <Text style={S.compName} numberOfLines={2}>{comp.name}</Text>
                <Text style={S.compMeta}>{comp.participants}/{comp.maxParticipants} participants</Text>
                <Text style={S.compDate}>{comp.startDate}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Derniers résultats ─────────────────────────────────────────── */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Résultats récents</Text>
        {recentScores.length === 0 ? (
          <Text style={S.emptyText}>Aucun score soumis pour l'instant.</Text>
        ) : (
          recentScores.map(r => (
            <View key={r.id} style={S.resultRow}>
              <View style={S.resultAvatar}>
                <Text style={S.resultAvatarTxt}>{r.wod_title[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.resultTitle}>{r.wod_title}</Text>
                <Text style={S.resultDate}>
                  {new Date(r.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[S.resultStatus, {
                  color: r.status === 'approved' ? theme.text : r.status === 'rejected' ? theme.error : theme.textMuted,
                }]}>
                  {r.status === 'approved' ? 'Validé' : r.status === 'rejected' ? 'Rejeté' : 'En attente'}
                </Text>
                <Text style={S.resultScore}>{r.score_value}</Text>
              </View>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

import { AppTheme } from '../../context/ThemeContext';
function createStyles(t: AppTheme) {
  const isDark = t.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  };
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background },

    // ── Header ──
    header: {
      paddingTop: 58, paddingHorizontal: 20, paddingBottom: 24,
      backgroundColor: t.card,
      borderBottomWidth: isDark ? 1 : 0, borderBottomColor: t.border,
      ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
    },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    username: { fontSize: 26, fontWeight: '900', color: t.text, letterSpacing: -0.5 },
    boxLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: t.surface },
    headerActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
    iconBtn: {
      width: 42, height: 42, borderRadius: 14,
      backgroundColor: isDark ? t.surface : t.background,
      borderWidth: 1, borderColor: t.border,
      justifyContent: 'center', alignItems: 'center',
    },
    actionBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: isDark ? t.surface : t.background,
      borderRadius: 14, paddingVertical: 13,
      borderWidth: 1, borderColor: t.border,
    },
    actionBtnTxt: { fontSize: 14, fontWeight: '700', color: t.text },
    notifDot: {
      position: 'absolute', top: -3, right: -3,
      backgroundColor: t.error, borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: t.card,
    },
    notifDotTxt: { fontSize: 9, fontWeight: '900', color: '#fff' },
    bellBadge: {
      position: 'absolute', top: -5, right: -6,
      backgroundColor: t.error, borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: t.card,
    },
    bellBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },

    // ── Hero stats ──
    heroRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: isDark ? t.surface : t.card,
      borderRadius: 16, paddingVertical: 18, paddingHorizontal: 4,
      marginBottom: 14,
      borderWidth: 1, borderColor: t.border,
      ...cardShadow,
    },
    heroElo: { flex: 1.2, alignItems: 'center' },
    heroEloNum: { fontSize: 30, fontWeight: '900', color: t.accent, letterSpacing: -1 },
    heroEloLabel: { fontSize: 10, fontWeight: '700', color: t.textMuted, letterSpacing: 2, marginTop: 2 },
    heroDivider: { width: 1, height: 28, backgroundColor: t.border },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatNum: { fontSize: 18, fontWeight: '900', color: t.text },
    heroStatLabel: { fontSize: 9, fontWeight: '600', color: t.textMuted, letterSpacing: 0.3, marginTop: 2 },

    // ── Level ──
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    levelDot: { width: 8, height: 8, borderRadius: 4 },
    levelTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    matchesTxt: { fontSize: 11, color: t.textMuted, fontWeight: '500', marginLeft: 'auto' },

    // ── Sections ──
    section: { paddingHorizontal: 20, marginTop: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: t.text, letterSpacing: -0.3, marginBottom: 14 },
    linkText: { fontSize: 12, fontWeight: '600', color: t.accent },
    emptyText: { fontSize: 13, color: t.textMuted, paddingVertical: 12 },

    // ── Week activity ──
    weekRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
      height: 56, marginBottom: 20,
    },
    weekCol: { alignItems: 'center', flex: 1, gap: 6 },
    weekBar: { width: 22, borderRadius: 6, minHeight: 3 },
    weekDayTxt: { fontSize: 10, fontWeight: '500', color: t.textMuted },

    // ── Progression strip ──
    progStrip: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.border,
      paddingTop: 16, marginBottom: 16,
    },
    progItem: { flex: 1, alignItems: 'center' },
    progItemNum: { fontSize: 18, fontWeight: '900', color: t.text },
    progItemLbl: { fontSize: 9, fontWeight: '600', color: t.textMuted, letterSpacing: 0.3, marginTop: 3 },

    // ── PRs ──
    prBlock: {
      borderTopWidth: 1, borderTopColor: t.border, paddingTop: 16, gap: 10,
    },
    prBlockTitle: { fontSize: 13, fontWeight: '700', color: t.text, marginBottom: 2 },
    prLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    prLineIcon: { fontSize: 14, width: 20, textAlign: 'center' },
    prLineName: { flex: 1, fontSize: 13, fontWeight: '500', color: t.textSecondary },
    prLineVal: { fontSize: 14, fontWeight: '900', color: t.text },

    // ── Tool list ──
    toolList: { gap: 8 },
    toolRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: isDark ? t.surface : t.card,
      borderRadius: 14, borderWidth: 1, borderColor: t.border,
      paddingVertical: 14, paddingHorizontal: 16,
      ...cardShadow,
    },
    toolIconBox: {
      width: 42, height: 42, borderRadius: 12,
      justifyContent: 'center', alignItems: 'center',
    },
    toolLabel: { fontSize: 14, fontWeight: '700', color: t.text },
    toolDesc: { fontSize: 11, fontWeight: '500', color: t.textMuted, marginTop: 2 },

    // ── Competition cards ──
    compCard: {
      width: 160, backgroundColor: isDark ? t.surface : t.card,
      borderRadius: 14, borderWidth: 1, borderColor: t.border,
      padding: 14, gap: 6,
      ...cardShadow,
    },
    compBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    compDot: { width: 6, height: 6, borderRadius: 3 },
    compStatus: { fontSize: 9, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    compName: { fontSize: 13, fontWeight: '700', color: t.text, lineHeight: 17 },
    compMeta: { fontSize: 10, color: t.textMuted },
    compDate: { fontSize: 10, color: t.textMuted },

    // ── Results ──
    resultRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    resultAvatar: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: t.surface, justifyContent: 'center', alignItems: 'center',
    },
    resultAvatarTxt: { fontSize: 14, fontWeight: '700', color: t.textSecondary },
    resultTitle: { fontSize: 13, fontWeight: '700', color: t.text },
    resultDate: { fontSize: 11, color: t.textMuted, marginTop: 1 },
    resultStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    resultScore: { fontSize: 11, color: t.textMuted, marginTop: 1 },

    // ── Box Switcher ──
    boxSwitchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    boxSwitchText: { fontSize: 12, fontWeight: '600', color: t.textSecondary, maxWidth: 160 },

    // ── Box Picker Modal ──
    boxPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    boxPickerSheet: {
      backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
    },
    boxPickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: t.border, alignSelf: 'center', marginBottom: 16 },
    boxPickerTitle: { fontSize: 16, fontWeight: '800', color: t.text, marginBottom: 16 },
    boxPickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, marginBottom: 4,
    },
    boxPickerRowActive: { backgroundColor: `${t.accent}15` },
    boxPickerLogo: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.surface },
    boxPickerIconWrap: {
      width: 40, height: 40, borderRadius: 12, backgroundColor: t.surface,
      justifyContent: 'center', alignItems: 'center',
    },
    boxPickerName: { fontSize: 14, fontWeight: '700', color: t.text },
    boxPickerRole: { fontSize: 11, fontWeight: '500', color: t.textMuted, marginTop: 1 },
  });
}
