import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, Pressable,
  RefreshControl, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import {
  Trophy, Timer, BarChart2, Sparkles, Target, User, Users, Bell, ChevronDown,
  Building2, Check, Flame,
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { HomeStackParamList, CompetitionSummary } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { formatScoreValue } from '../../utils/scoreFormat';
import { getStreak, StreakInfo } from '../../services/gamification';
import AutoScrollCarousel from '../../components/AutoScrollCarousel';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';
import GlassButton from '../../components/glass/GlassButton';
import GlassIconBox from '../../components/glass/GlassIconBox';

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
  const isDark = theme.mode === 'dark';

  const TOOLS = [
    { icon: BarChart2, label: 'Classement',      desc: 'Individuel · Équipes · Box',   screen: 'Leaderboard'     },
    { icon: Timer,     label: 'Minuteur vidéo',  desc: 'For Time · AMRAP · EMOM…',     screen: 'Timer'           },
    { icon: Sparkles,  label: 'Générateur WOD',  desc: 'For Time · AMRAP · Tabata',    screen: 'WODGenerator'    },
    { icon: Target,    label: 'Calculateur 1RM', desc: '50% → 130% · Zones',           screen: 'OneRMCalculator' },
  ];

  const [competitions,   setCompetitions]   = useState<CompetitionSummary[]>([]);
  const [recentScores,   setRecentScores]   = useState<RecentScore[]>([]);
  const [rank,           setRank]           = useState<number | null>(null);
  const [streak,         setStreak]         = useState<StreakInfo>({ current_streak: 0, longest_streak: 0, week_session_count: 0, week_start: '', max_sessions_per_week: null });
  const [pendingFriends, setPendingFriends] = useState(0);
  const [unreadAccepted, setUnreadAccepted] = useState(0);
  const [unreadChangelog, setUnreadChangelog] = useState(0);

  const [totalWods,       setTotalWods]       = useState(0);
  const [totalScoresGen,  setTotalScoresGen]  = useState(0);
  const [genStreak,       setGenStreak]       = useState(0);
  const [weekActivity,    setWeekActivity]    = useState<number[]>([0,0,0,0,0,0,0]);
  const [weekReservations, setWeekReservations] = useState<number[]>([0,0,0,0,0,0,0]);
  const [totalReservations, setTotalReservations] = useState(0);
  const [favCount,        setFavCount]        = useState(0);
  const [bestScores,      setBestScores]      = useState<{name:string; value:string; type:string}[]>([]);
  const [physComps,       setPhysComps]       = useState<{id:string; name:string; logo_url:string|null; mode:string}[]>([]);

  const { data: homeData, isLoading: homeDataLoading, refetch: refetchHome } = useFocusQuery(
    ['home', user?.id, currentBox?.id],
    async () => {
      if (!user) return null;

      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('elo', user.elo ?? 0);
      const streakData = await getStreak(user.id, currentBox?.id);

      const [{ count: totalCl }, { count: readCl }] = await Promise.all([
        supabase.from('app_changelog').select('id', { count: 'exact', head: true }),
        supabase.from('changelog_reads').select('changelog_id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      const boxFilter = currentBox?.id;
      const { data: tourns } = await supabase
        .from('tournaments')
        .select('id, name, description, level, status, start_date, end_date, max_participants, prize, tournament_participants(count)')
        .in('status', ['open', 'active'])
        .eq('box_id', boxFilter ?? '')
        .order('start_date')
        .limit(6);

      const mapped: CompetitionSummary[] = (tourns ?? []).map((t: any) => ({
        id: t.id, name: t.name, description: t.description ?? '', level: t.level ?? 'rx',
        status: t.status,
        startDate: t.start_date ? new Date(t.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—',
        endDate:   t.end_date   ? new Date(t.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—',
        participants: t.tournament_participants?.[0]?.count ?? 0,
        maxParticipants: t.max_participants ?? 0,
        prize: t.prize ?? '', wods: [],
      }));

      const { count: friendCount } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending');
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

      const now = new Date();
      const todayIdx = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - todayIdx);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 7);

      const weekArr = [0,0,0,0,0,0,0];
      (genWeek ?? []).forEach((w: any) => {
        const d = new Date(w.created_at);
        if (d >= monday && d < sunday) {
          const idx = (d.getDay() + 6) % 7;
          weekArr[idx]++;
        }
      });

      const weekResArr = [0,0,0,0,0,0,0];
      let totalRes = 0;
      if (currentBox?.id) {
        const { data: resData } = await supabase
          .from('class_reservations')
          .select('id, schedule:class_schedules(scheduled_date)')
          .eq('member_id', user.id)
          .eq('box_id', currentBox.id);
        (resData ?? []).forEach((r: any) => {
          const sd = r.schedule?.scheduled_date;
          if (!sd) return;
          const d = new Date(sd + 'T00:00:00');
          if (d >= monday && d < sunday) {
            const idx = (d.getDay() + 6) % 7;
            weekResArr[idx]++;
          }
        });
        totalRes = resData?.length ?? 0;
      }

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

      const { data: scores } = await supabase
        .from('tournament_scores')
        .select('id, score_value, submitted_at, status, tw:tournament_wods(title)')
        .eq('athlete_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(3);

      const recentScoresMapped = (scores ?? []).map((s: any) => ({
        id: s.id, score_value: s.score_value, submitted_at: s.submitted_at,
        wod_title: (Array.isArray(s.tw) ? s.tw[0] : s.tw)?.title ?? '—',
        status: s.status,
      }));

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
        weekReservations: weekResArr,
        totalReservations: totalRes,
        genStreak: gs,
        bestScores: bestScoresMapped,
        physComps: (physData ?? []).map((p: any) => ({ id: p.id, name: p.name, logo_url: p.logo_url, mode: p.mode })),
      };
    },
    { enabled: !!user },
  );

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
    setWeekReservations(homeData.weekReservations);
    setTotalReservations(homeData.totalReservations);
    setGenStreak(homeData.genStreak);
    setBestScores(homeData.bestScores);
    setPhysComps(homeData.physComps);
  }, [homeData]);

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
  const friendsCount = pendingFriends + unreadAccepted;

  return (
    <View style={S.root}>
      {/* Animated emerald background */}
      <GlassBackground />

      <ScrollView
        style={S.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 56, paddingHorizontal: 16, paddingTop: 56 }}
        refreshControl={
          <RefreshControl
            refreshing={homeDataLoading}
            onRefresh={refetchHome}
            tintColor="#10b981"
            colors={['#10b981']}
          />
        }
      >
        {/* ── Header row ──────────────────────────────────────────────── */}
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.username}>{user?.username ?? 'Athlète'}</Text>
            {currentBox && (
              <TouchableOpacity
                onPress={() => myBoxes.length > 1 ? setBoxPickerVisible(true) : null}
                activeOpacity={myBoxes.length > 1 ? 0.7 : 1}
                style={S.boxSwitchBtn}
              >
                <Building2 size={12} color={isDark ? '#9ca3af' : '#6b7280'} />
                <Text style={S.boxSwitchText} numberOfLines={1}>{currentBox.name}</Text>
                {myBoxes.length > 1 && <ChevronDown size={12} color={isDark ? '#9ca3af' : '#6b7280'} />}
              </TouchableOpacity>
            )}
          </View>
          {currentBox?.logo_url && (
            <TouchableOpacity onPress={() => navigation.navigate('BoxInfo')} activeOpacity={0.8} style={{ marginRight: 10 }}>
              <Image source={{ uri: currentBox.logo_url }} style={S.boxLogo} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Changelog' as never)} activeOpacity={0.7}>
            <GlassIconBox size={44} radius={14}>
              <Bell size={20} color={isDark ? '#f9fafb' : '#111827'} />
              {unreadChangelog > 0 && (
                <View style={S.bellBadge}>
                  <Text style={S.bellBadgeText}>{unreadChangelog > 9 ? '9+' : unreadChangelog}</Text>
                </View>
              )}
            </GlassIconBox>
          </TouchableOpacity>
        </View>

        {/* ── Hero ELO card ─────────────────────────────────────────── */}
        <GlassCard style={{ marginTop: 18 }}>
          <View style={S.heroInner}>
            <View style={S.heroTop}>
              <TouchableOpacity onPress={() => navigation.navigate('EloHistory' as never)} activeOpacity={0.7} style={{ alignItems: 'center', flex: 1.2 }}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Flame size={14} color="#f59e0b" />
                  <Text style={S.heroStatNum}>{streak.current_streak}</Text>
                </View>
                <Text style={S.heroStatLabel}>{streak.week_session_count}/{streak.max_sessions_per_week ?? '∞'} sem.</Text>
              </View>
              <View style={S.heroDivider} />
              <View style={S.heroStat}>
                <Text style={S.heroStatNum}>{user?.wins ?? 0}</Text>
                <Text style={S.heroStatLabel}>Victoires</Text>
              </View>
            </View>

            <View style={S.heroLevelRow}>
              <View style={[S.levelDot, { backgroundColor: levelColor }]} />
              <Text style={[S.levelTxt, { color: levelColor }]}>{level.toUpperCase()}</Text>
              <Text style={S.matchesTxt}>{user?.total_matches ?? 0} matchs</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <View style={S.actionRow}>
          <GlassButton
            style={{ flex: 1 }}
            onPress={() => navigation.navigate('Friends')}
            icon={
              <View style={{ position: 'relative' }}>
                <Users size={17} color={isDark ? '#f9fafb' : '#111827'} />
                {friendsCount > 0 && (
                  <View style={S.notifDot}>
                    <Text style={S.notifDotTxt}>{friendsCount > 9 ? '9+' : friendsCount}</Text>
                  </View>
                )}
              </View>
            }
            label="Amis"
          />
          <GlassButton
            style={{ flex: 1 }}
            onPress={() => navigation.navigate('Profile')}
            icon={<User size={17} color={isDark ? '#f9fafb' : '#111827'} />}
            label="Profil"
          />
        </View>

        {/* ── Cette semaine ──────────────────────────────────────────── */}
        {(totalWods > 0 || genStreak > 0 || totalReservations > 0 || weekReservations.some(r => r > 0)) && (
          <GlassCard style={{ marginTop: 16 }}>
            <View style={S.sectionInner}>
              <View style={S.sectionHeader}>
                <Text style={S.sectionTitle}>Cette semaine</Text>
                <TouchableOpacity onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.7}>
                  <Text style={S.linkText}>Historique</Text>
                </TouchableOpacity>
              </View>

              <View style={S.weekRow}>
                {['L','M','M','J','V','S','D'].map((day, i) => {
                  const wods = weekActivity[i];
                  const res = weekReservations[i];
                  const maxAll = Math.max(...weekActivity, ...weekReservations, 1);
                  const hWod = wods > 0 ? Math.max(4, (wods / maxAll) * 32) : 0;
                  const hRes = res > 0 ? Math.max(4, (res / maxAll) * 32) : 0;
                  const isToday = i === (new Date().getDay() + 6) % 7;
                  const hasActivity = wods > 0 || res > 0;
                  return (
                    <View key={i} style={S.weekCol}>
                      <View style={{ alignItems: 'center', gap: 2 }}>
                        {hRes > 0 && <View style={[S.weekBar, { height: hRes, backgroundColor: '#10b981' }]} />}
                        {hWod > 0 && <View style={[S.weekBar, { height: hWod, backgroundColor: isToday ? '#34d399' : (isDark ? '#f9fafb' : '#111827') }]} />}
                        {!hasActivity && <View style={[S.weekBar, { height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} />}
                      </View>
                      <Text style={[S.weekDayTxt, isToday && { fontWeight: '900', color: isDark ? '#f9fafb' : '#111827' }]}>{day}</Text>
                    </View>
                  );
                })}
              </View>

              {weekReservations.some(r => r > 0) && (
                <View style={S.legendRow}>
                  <View style={S.legendItem}>
                    <View style={[S.legendDot, { backgroundColor: isDark ? '#f9fafb' : '#111827' }]} />
                    <Text style={S.legendText}>WODs</Text>
                  </View>
                  <View style={S.legendItem}>
                    <View style={[S.legendDot, { backgroundColor: '#10b981' }]} />
                    <Text style={S.legendText}>Réservations</Text>
                  </View>
                </View>
              )}

              <View style={S.progStrip}>
                {[
                  { val: totalWods, lbl: 'WODs' },
                  { val: totalScoresGen, lbl: 'Scores' },
                  { val: genStreak, lbl: 'Streak' },
                  { val: totalReservations, lbl: 'Réservations' },
                ].map(s => (
                  <View key={s.lbl} style={S.progItem}>
                    <Text style={S.progItemNum}>{s.val}</Text>
                    <Text style={S.progItemLbl}>{s.lbl}</Text>
                  </View>
                ))}
              </View>

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
          </GlassCard>
        )}

        {/* ── Outils ──────────────────────────────────────────────────── */}
        <Text style={S.sectionTitleOutside}>Outils</Text>
        <View style={{ gap: 10 }}>
          {TOOLS.map(t => (
            <TouchableOpacity key={t.label} onPress={() => navigation.navigate(t.screen as any)} activeOpacity={0.85}>
              <GlassCard radius={18}>
                <View style={S.toolRow}>
                  <GlassIconBox size={48} variant="emerald" radius={14}>
                    <t.icon color="#10b981" size={22} />
                  </GlassIconBox>
                  <View style={{ flex: 1 }}>
                    <Text style={S.toolLabel}>{t.label}</Text>
                    <Text style={S.toolDesc}>{t.desc}</Text>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Box Picker Modal ──────────────────────────────────────── */}
        <Modal visible={boxPickerVisible} transparent animationType="slide" onRequestClose={() => setBoxPickerVisible(false)}>
          <Pressable style={S.boxPickerOverlay} onPress={() => setBoxPickerVisible(false)}>
            <Pressable onPress={() => {}} style={{ paddingHorizontal: 16 }}>
              <GlassCard radius={24}>
                <View style={S.boxPickerSheet}>
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
                          <GlassIconBox size={40} radius={12}>
                            <Building2 size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                          </GlassIconBox>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[S.boxPickerName, isActive && { color: '#10b981' }]}>{entry.box.name}</Text>
                          <Text style={S.boxPickerRole}>{entry.role === 'owner' ? 'Propriétaire' : entry.role === 'coach' ? 'Coach' : 'Membre'}</Text>
                        </View>
                        {isActive && <Check size={18} color="#10b981" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Compétitions physiques ─────────────────────────────────── */}
        {physComps.length > 0 && (
          <>
            <View style={[S.sectionHeader, { marginTop: 28, marginBottom: 12 }]}>
              <Text style={S.sectionTitleOutside}>Compétitions</Text>
              <TouchableOpacity
                onPress={() => {
                  const nav = navigation.getParent?.();
                  if (nav) nav.navigate('Competitions', { screen: 'CompetitionList', params: { initialTab: 2 } });
                }}
                activeOpacity={0.7}
              >
                <Text style={S.linkText}>Voir la liste ›</Text>
              </TouchableOpacity>
            </View>
            <AutoScrollCarousel
              data={physComps}
              itemWidth={140}
              gap={12}
              speed={30}
              renderItem={(item) => (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    const nav = navigation.getParent?.();
                    if (nav) nav.navigate('Competitions', { screen: 'PhysicalCompetition', params: { mode: item.mode as any, selectedId: item.id } });
                  }}
                >
                  <GlassCard radius={16} style={{ width: 140, height: 160 }}>
                    <View style={S.compPhysInner}>
                      {item.logo_url ? (
                        <Image source={{ uri: item.logo_url }} style={{ width: 72, height: 72, borderRadius: 12 }} resizeMode="contain" />
                      ) : (
                        <GlassIconBox size={72} radius={16}><Trophy color="#10b981" size={32} /></GlassIconBox>
                      )}
                      <Text numberOfLines={2} style={S.compPhysName}>{item.name}</Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              )}
            />
          </>
        )}

        {/* ── Tournois ────────────────────────────────────────────────── */}
        {competitions.length > 0 && (
          <>
            <View style={[S.sectionHeader, { marginTop: 28, marginBottom: 12 }]}>
              <Text style={S.sectionTitleOutside}>Tournois</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={S.linkText}>Voir tout ›</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {competitions.map((comp: CompetitionSummary) => (
                <TouchableOpacity
                  key={comp.id}
                  onPress={() => navigation.navigate('CompetitionDetail', { competition: comp })}
                  activeOpacity={0.85}
                >
                  <GlassCard radius={16} style={{ width: 170 }}>
                    <View style={S.compInner}>
                      <View style={S.compBadgeRow}>
                        <View style={[S.compDot, { backgroundColor: comp.status === 'open' ? '#10b981' : '#9ca3af' }]} />
                        <Text style={S.compStatus}>{comp.status === 'open' ? 'Ouvert' : comp.status === 'active' ? 'En cours' : 'Terminé'}</Text>
                      </View>
                      <Text style={S.compName} numberOfLines={2}>{comp.name}</Text>
                      <Text style={S.compMeta}>{comp.participants}/{comp.maxParticipants} participants</Text>
                      <Text style={S.compDate}>{comp.startDate}</Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Résultats récents ─────────────────────────────────────── */}
        <Text style={S.sectionTitleOutside}>Résultats récents</Text>
        {recentScores.length === 0 ? (
          <GlassCard radius={16}>
            <View style={{ padding: 16 }}>
              <Text style={S.emptyText}>Aucun score soumis pour l'instant.</Text>
            </View>
          </GlassCard>
        ) : (
          <View style={{ gap: 8 }}>
            {recentScores.map(r => (
              <GlassCard key={r.id} radius={16}>
                <View style={S.resultRow}>
                  <GlassIconBox size={40} radius={12}>
                    <Text style={S.resultAvatarTxt}>{r.wod_title[0]}</Text>
                  </GlassIconBox>
                  <View style={{ flex: 1 }}>
                    <Text style={S.resultTitle}>{r.wod_title}</Text>
                    <Text style={S.resultDate}>
                      {new Date(r.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[S.resultStatus, {
                      color: r.status === 'approved' ? '#10b981' : r.status === 'rejected' ? '#ef4444' : (isDark ? '#9ca3af' : '#6b7280'),
                    }]}>
                      {r.status === 'approved' ? 'Validé' : r.status === 'rejected' ? 'Rejeté' : 'En attente'}
                    </Text>
                    <Text style={S.resultScore}>{r.score_value}</Text>
                  </View>
                </View>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const isDark = t.mode === 'dark';
  const textPrimary  = isDark ? '#f9fafb' : '#111827';
  const textSecondary = isDark ? '#9ca3af' : '#6b7280';
  const textOnGlass = textPrimary;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#ffffff' },
    container: { flex: 1, backgroundColor: 'transparent' },

    // Header row
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    username: { fontSize: 26, fontWeight: '900', color: textPrimary, letterSpacing: -0.5 },
    boxLogo: { width: 40, height: 40, borderRadius: 12 },
    boxSwitchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    boxSwitchText: { fontSize: 12, fontWeight: '600', color: textSecondary, maxWidth: 180 },
    bellBadge: {
      position: 'absolute', top: -6, right: -6,
      backgroundColor: '#ef4444', borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: isDark ? '#0a0a0a' : '#ffffff',
    },
    bellBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },

    // Hero ELO card
    heroInner: { padding: 18 },
    heroTop: { flexDirection: 'row', alignItems: 'center' },
    heroEloNum: { fontSize: 34, fontWeight: '900', color: '#10b981', letterSpacing: -1 },
    heroEloLabel: { fontSize: 10, fontWeight: '700', color: textSecondary, letterSpacing: 2, marginTop: 2 },
    heroDivider: { width: 1, height: 30, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatNum: { fontSize: 18, fontWeight: '900', color: textOnGlass },
    heroStatLabel: { fontSize: 9, fontWeight: '600', color: textSecondary, letterSpacing: 0.3, marginTop: 2 },
    heroLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
    levelDot: { width: 8, height: 8, borderRadius: 4 },
    levelTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    matchesTxt: { fontSize: 11, color: textSecondary, fontWeight: '500', marginLeft: 'auto' },

    // Action row
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    notifDot: {
      position: 'absolute', top: -3, right: -3,
      backgroundColor: '#ef4444', borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: isDark ? '#0a0a0a' : '#ffffff',
    },
    notifDotTxt: { fontSize: 9, fontWeight: '900', color: '#fff' },

    // Section header
    sectionInner: { padding: 18 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: textPrimary, letterSpacing: -0.3 },
    sectionTitleOutside: { fontSize: 15, fontWeight: '800', color: textPrimary, letterSpacing: -0.3, marginTop: 22, marginBottom: 12 },
    linkText: { fontSize: 12, fontWeight: '700', color: '#10b981' },
    emptyText: { fontSize: 13, color: textSecondary },

    // Week activity
    weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 60, marginTop: 16, marginBottom: 12 },
    weekCol: { alignItems: 'center', flex: 1, gap: 6 },
    weekBar: { width: 22, borderRadius: 6, minHeight: 4 },
    weekDayTxt: { fontSize: 10, fontWeight: '500', color: textSecondary },

    // Legend
    legendRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginBottom: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 2 },
    legendText: { fontSize: 10, color: textSecondary, fontWeight: '500' },

    // Progression strip
    progStrip: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      paddingTop: 14, marginTop: 4,
    },
    progItem: { flex: 1, alignItems: 'center' },
    progItemNum: { fontSize: 18, fontWeight: '900', color: textPrimary },
    progItemLbl: { fontSize: 9, fontWeight: '600', color: textSecondary, letterSpacing: 0.3, marginTop: 3 },

    // PRs
    prBlock: { borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', paddingTop: 14, gap: 8, marginTop: 14 },
    prBlockTitle: { fontSize: 13, fontWeight: '700', color: textPrimary, marginBottom: 4 },
    prLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    prLineIcon: { fontSize: 14, width: 20, textAlign: 'center' },
    prLineName: { flex: 1, fontSize: 13, fontWeight: '500', color: textSecondary },
    prLineVal: { fontSize: 14, fontWeight: '900', color: textPrimary },

    // Tools
    toolRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
    toolLabel: { fontSize: 14, fontWeight: '700', color: textPrimary },
    toolDesc: { fontSize: 11, fontWeight: '500', color: textSecondary, marginTop: 2 },

    // Comps
    compInner: { padding: 14, gap: 6 },
    compBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    compDot: { width: 6, height: 6, borderRadius: 3 },
    compStatus: { fontSize: 9, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
    compName: { fontSize: 13, fontWeight: '700', color: textPrimary, lineHeight: 17 },
    compMeta: { fontSize: 10, color: textSecondary },
    compDate: { fontSize: 10, color: textSecondary },
    compPhysInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 8 },
    compPhysName: { color: textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },

    // Results
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    resultAvatarTxt: { fontSize: 14, fontWeight: '700', color: '#10b981' },
    resultTitle: { fontSize: 13, fontWeight: '700', color: textPrimary },
    resultDate: { fontSize: 11, color: textSecondary, marginTop: 1 },
    resultStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    resultScore: { fontSize: 11, color: textSecondary, marginTop: 1 },

    // Box picker modal
    boxPickerOverlay: { flex: 1, backgroundColor: t.modalBackdrop, justifyContent: 'flex-end', paddingBottom: 32 },
    boxPickerSheet: { backgroundColor: t.modalCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
    boxPickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', alignSelf: 'center', marginBottom: 16 },
    boxPickerTitle: { fontSize: 16, fontWeight: '800', color: textPrimary, marginBottom: 16 },
    boxPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, marginBottom: 4 },
    boxPickerRowActive: { backgroundColor: 'rgba(16,185,129,0.10)' },
    boxPickerLogo: { width: 40, height: 40, borderRadius: 12 },
    boxPickerName: { fontSize: 14, fontWeight: '700', color: textPrimary },
    boxPickerRole: { fontSize: 11, fontWeight: '500', color: textSecondary, marginTop: 1 },
  });
}
