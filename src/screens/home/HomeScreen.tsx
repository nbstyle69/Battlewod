import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, Pressable,
  RefreshControl, LayoutAnimation, UIManager, Platform, Animated,
} from 'react-native';
import {
  Trophy, User, Users, Bell, ChevronDown,
  Building2, Check, Flame,
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { LevelColors } from '../../theme/designTokens';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';
import { HomeStackParamList, CompetitionSummary } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { readRows } from '../../lib/db';
import { countUnreadChangelog } from '../../lib/changelog';
import { formatScoreValue } from '../../utils/scoreFormat';
import { getStreak, StreakInfo, readBadgeQueue, clearBadgeQueue, BadgeQueueItem } from '../../services/gamification';
import AutoScrollCarousel from '../../components/AutoScrollCarousel';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';
import GlassButton from '../../components/glass/GlassButton';
import GlassIconBox from '../../components/glass/GlassIconBox';
import InteractiveTour from '../../components/InteractiveTour';
import { homeTools } from './homeTools';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeList'>;

interface RecentScore {
  id: string;
  score_value: string;
  submitted_at: string;
  wod_title: string;
  status: string;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, currentBox, myBoxes, switchBox } = useAuth();
  const [boxPickerVisible, setBoxPickerVisible] = useState(false);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const level = user?.level ?? 'scaled';
  const S = createStyles(theme);
  const isDark = theme.mode === 'dark';

  const TOOLS = homeTools(t);

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
  const [weekWodsTotal,   setWeekWodsTotal]   = useState(0);
  const [weekResTotal,    setWeekResTotal]    = useState(0);
  const [activeDayStreak, setActiveDayStreak] = useState(0);
  const [selectedDay,     setSelectedDay]     = useState<number | null>(null);
  const [totalReservations, setTotalReservations] = useState(0);
  const [favCount,        setFavCount]        = useState(0);
  const [bestScores,      setBestScores]      = useState<{name:string; value:string; type:string}[]>([]);
  const [physComps,       setPhysComps]       = useState<{id:string; name:string; logo_url:string|null; mode:string}[]>([]);

  // ── Badge unlock popup
  const [badgePopup, setBadgePopup] = useState<BadgeQueueItem | null>(null);
  const badgeQueueRef = useRef<BadgeQueueItem[]>([]);
  const popupAnim    = useRef(new Animated.Value(120)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupProgress = useRef(new Animated.Value(0)).current;
  const popupTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNextBadge() {
    if (badgeQueueRef.current.length === 0) { setBadgePopup(null); return; }
    const item = badgeQueueRef.current.shift()!;
    setBadgePopup(item);
    popupAnim.setValue(120);
    popupOpacity.setValue(0);
    popupProgress.setValue(0);
    Animated.parallel([
      Animated.spring(popupAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(popupOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    Animated.timing(popupProgress, { toValue: 1, duration: 3000, useNativeDriver: false }).start();
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => dismissBadgePopup(), 3200);
  }

  function dismissBadgePopup() {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    Animated.parallel([
      Animated.timing(popupAnim, { toValue: 120, duration: 220, useNativeDriver: true }),
      Animated.timing(popupOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => showNextBadge());
  }

  const { data: homeData, isLoading: homeDataLoading, refetch: refetchHome } = useFocusQuery(
    ['home', user?.id, currentBox?.id],
    async () => {
      if (!user) return null;

      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('elo', user.elo ?? 0);
      const streakData = await getStreak(user.id, currentBox?.id);

      const unreadCl = await countUnreadChangelog(user.id, { screen: 'Home', action: 'countUnreadChangelog' });

      const boxFilter = currentBox?.id;
      const tourns = boxFilter
        ? await readRows(
            supabase
              .from('tournaments')
              .select('id, name, description, level, status, start_date, end_date, max_participants, prize, tournament_participants(count)')
              .in('status', ['open', 'active'])
              .eq('box_id', boxFilter)
              .order('start_date')
              .limit(6),
            { screen: 'Home', action: 'tournaments' },
          )
        : [];

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

      const [{ count: genWodCount }, { count: genScoreCount }, { count: genFavCount }, { data: genScoreWeek }, { data: boxScoreWeek }, { data: genAll }] = await Promise.all([
        supabase.from('generated_wods').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('generated_wod_scores').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('generated_wods').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_favorite', true),
        supabase.from('generated_wod_scores').select('completed_at').eq('user_id', user.id).gte('completed_at', sevenDaysStr),
        supabase.from('wod_scores').select('submitted_at').eq('member_id', user.id).gte('submitted_at', sevenDaysStr),
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
      const completedTs = [
        ...(genScoreWeek ?? []).map((s: any) => s.completed_at),
        ...(boxScoreWeek ?? []).map((s: any) => s.submitted_at),
      ];
      completedTs.forEach((ts: string | null) => {
        if (!ts) return;
        const d = new Date(ts);
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

      const weekWodsSum = weekArr.reduce((a, b) => a + b, 0);
      const weekResSum = weekResArr.reduce((a, b) => a + b, 0);

      let dayStreak = 0;
      for (let i = todayIdx; i >= 0; i--) {
        if (weekArr[i] > 0 || weekResArr[i] > 0) dayStreak++;
        else break;
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
        unreadChangelog: unreadCl,
        competitions: mapped,
        pendingFriends: friendCount ?? 0,
        recentScores: recentScoresMapped,
        totalWods: genWodCount ?? 0,
        totalScoresGen: genScoreCount ?? 0,
        favCount: genFavCount ?? 0,
        weekActivity: weekArr,
        weekReservations: weekResArr,
        weekWodsTotal: weekWodsSum,
        weekResTotal: weekResSum,
        activeDayStreak: dayStreak,
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
    setWeekWodsTotal(homeData.weekWodsTotal);
    setWeekResTotal(homeData.weekResTotal);
    setActiveDayStreak(homeData.activeDayStreak);
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
      // Check badge queue
      readBadgeQueue(user.id).then(async (q) => {
        if (q.length > 0) {
          await clearBadgeQueue(user.id);
          badgeQueueRef.current = q;
          showNextBadge();
        }
      });
    }, [user?.id])
  );

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
        contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 16, paddingTop: insets.top + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={homeDataLoading}
            onRefresh={refetchHome}
            tintColor={theme.accent}
            colors={[theme.accent]}
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
          <TouchableOpacity
            onPress={() => navigation.navigate('Changelog' as never)}
            activeOpacity={0.7}
            style={{ position: 'relative' }}
          >
            <GlassIconBox size={44} radius={14}>
              <Bell size={20} color={isDark ? '#f9fafb' : '#111827'} />
            </GlassIconBox>
            {unreadChangelog > 0 && (
              <View style={S.bellBadge} pointerEvents="none">
                <Text style={S.bellBadgeText}>{unreadChangelog > 9 ? '9+' : unreadChangelog}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Hero ELO card ─────────────────────────────────────────── */}
        <GlassCard style={{ marginTop: 18 }}>
          <View style={S.heroInner}>
            <View style={S.heroTop}>
              <TouchableOpacity onPress={() => navigation.navigate('EloHistory' as never)} activeOpacity={0.7} style={{ alignItems: 'center', flex: 1.2 }}>
                <Text style={S.heroEloNum}>{user?.elo ?? 1000}</Text>
                <Text style={S.heroEloLabel}>{t('home.elo')} ›</Text>
              </TouchableOpacity>
              <View style={S.heroDivider} />
              <View style={S.heroStat}>
                <Text style={S.heroStatNum}>{rank !== null ? `#${rank}` : '—'}</Text>
                <Text style={S.heroStatLabel}>{t('home.rank')}</Text>
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
                <Text style={S.heroStatLabel}>{t('home.wins')}</Text>
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
            label={t('home.friends')}
          />
          <GlassButton
            style={{ flex: 1 }}
            onPress={() => navigation.navigate('Profile')}
            icon={<User size={17} color={isDark ? '#f9fafb' : '#111827'} />}
            label={t('tabs.profile')}
          />
        </View>

        {/* ── Cette semaine ──────────────────────────────────────────── */}
        {(totalWods > 0 || genStreak > 0 || totalReservations > 0 || weekReservations.some(r => r > 0)) && (
          <GlassCard style={{ marginTop: 16 }}>
            <View style={S.sectionInner}>
              <View style={S.sectionHeader}>
                <View style={S.weekTitleRow}>
                  <Text style={S.sectionTitle}>{t('home.thisWeek')}</Text>
                  {activeDayStreak >= 3 && (
                    <View style={S.streakBadge}>
                      <Flame color={theme.accent} size={12} />
                      <Text style={S.streakTxt}>{t('home.dayStreak', { count: activeDayStreak })}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.7}>
                  <Text style={S.linkText}>{t('home.history')}</Text>
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
                  const isSelected = selectedDay === i;
                  const hasActivity = wods > 0 || res > 0;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[S.weekCol, isSelected && S.weekColSelected]}
                      activeOpacity={0.7}
                      onPress={() => setSelectedDay(isSelected ? null : i)}
                    >
                      <View style={{ alignItems: 'center', gap: 2 }}>
                        {hRes > 0 && <View style={[S.weekBar, { height: hRes, backgroundColor: theme.accent }]} />}
                        {hWod > 0 && <View style={[S.weekBar, { height: hWod, backgroundColor: isToday ? theme.accentLight : (isDark ? '#f9fafb' : '#111827') }]} />}
                        {!hasActivity && <View style={[S.weekBar, { height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} />}
                      </View>
                      <Text style={[S.weekDayTxt, isToday && { fontWeight: '900', color: isDark ? '#f9fafb' : '#111827' }]}>{day}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedDay !== null && (
                <Text style={S.dayDetailTxt}>
                  {t('home.dayDetail', {
                    day: (t('home.dayNamesFull', { returnObjects: true }) as string[])[selectedDay],
                    res: weekReservations[selectedDay],
                    wods: weekActivity[selectedDay],
                  })}
                </Text>
              )}

              <View style={S.legendRow}>
                <View style={S.legendItem}>
                  <View style={[S.legendDot, { backgroundColor: isDark ? '#f9fafb' : '#111827' }]} />
                  <Text style={S.legendText}>{t('home.wodsCompleted')}</Text>
                </View>
                <View style={S.legendItem}>
                  <View style={[S.legendDot, { backgroundColor: theme.accent }]} />
                  <Text style={S.legendText}>{t('home.reservations')}</Text>
                </View>
              </View>

              <Text style={S.weekTotalTxt}>{t('home.weekTotal', { res: weekResTotal, wods: weekWodsTotal })}</Text>

              <View style={S.progStrip}>
                {[
                  { val: totalWods, lbl: 'WODs' },
                  { val: totalScoresGen, lbl: 'Scores' },
                  { val: genStreak, lbl: 'Streak' },
                  { val: totalReservations, lbl: t('home.reservations') },
                ].map(s => (
                  <View key={s.lbl} style={S.progItem}>
                    <Text style={S.progItemNum}>{s.val}</Text>
                    <Text style={S.progItemLbl}>{s.lbl}</Text>
                  </View>
                ))}
              </View>

              {bestScores.length > 0 && (
                <View style={S.prBlock}>
                  <Text style={S.prBlockTitle}>{t('home.personalRecords')}</Text>
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
        <Text style={S.sectionTitleOutside}>{t('home.tools.title')}</Text>
        <View style={{ gap: 10 }}>
          {TOOLS.map(t => (
            <TouchableOpacity key={t.label} onPress={() => navigation.navigate(t.screen as any)} activeOpacity={0.85}>
              <GlassCard radius={18}>
                <View style={S.toolRow}>
                  <GlassIconBox size={48} variant="emerald" radius={14}>
                    <t.icon color={theme.accent} size={22} />
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
                  <Text style={S.boxPickerTitle}>{t('home.myBoxes')}</Text>
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
                          <Text style={[S.boxPickerName, isActive && { color: theme.accent }]}>{entry.box.name}</Text>
                          <Text style={S.boxPickerRole}>{entry.role === 'owner' ? 'Propriétaire' : entry.role === 'coach' ? 'Coach' : 'Membre'}</Text>
                        </View>
                        {isActive && <Check size={18} color={theme.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>
            </Pressable>
          </Pressable>
        </Modal>

      {/* ── Badge unlock popup ──────────────────────────────────────── */}
      {badgePopup && (
        <Animated.View
          style={[S.badgePopupWrap, {
            transform: [{ translateY: popupAnim }],
            opacity: popupOpacity,
          }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity onPress={dismissBadgePopup} activeOpacity={0.9} style={S.badgePopupCard}>
            <View style={S.badgePopupIconRow}>
              <Text style={S.badgePopupIcon}>{badgePopup.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.badgePopupHeader}>🏅 Badge débloqué !</Text>
                <Text style={S.badgePopupTitle}>{badgePopup.title}</Text>
                <Text style={S.badgePopupDesc} numberOfLines={2}>{badgePopup.description}</Text>
              </View>
            </View>
            <View style={S.badgeProgressTrack}>
              <Animated.View style={[S.badgeProgressFill, {
                width: popupProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }]} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

        {/* ── Compétitions physiques ─────────────────────────────────── */}
        {physComps.length > 0 && (
          <>
            <View style={[S.sectionHeader, { marginTop: 28, marginBottom: 12 }]}>
              <Text style={S.sectionTitleOutside}>{t('home.competitions')}</Text>
              <TouchableOpacity
                onPress={() => {
                  const nav = navigation.getParent?.();
                  if (nav) nav.navigate('Competitions', { screen: 'CompetitionList', params: { initialTab: 2 } });
                }}
                activeOpacity={0.7}
              >
                <Text style={S.linkText}>{t('home.seeList')} ›</Text>
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
                        <GlassIconBox size={72} radius={16}><Trophy color={theme.accent} size={32} /></GlassIconBox>
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
              <Text style={S.sectionTitleOutside}>{t('home.tournaments')}</Text>
              <TouchableOpacity
                onPress={() => {
                  const nav = navigation.getParent?.();
                  if (nav) nav.navigate('Competitions', { screen: 'CompetitionList', params: { initialTab: 0 } });
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('home.seeAllTournaments')}
              >
                <Text style={S.linkText}>{t('home.seeAllTournaments')} ›</Text>
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
                        <View style={[S.compDot, { backgroundColor: comp.status === 'open' ? theme.accent : '#9ca3af' }]} />
                        <Text style={S.compStatus}>{comp.status === 'open' ? t('home.tournamentStatus.open') : comp.status === 'active' ? t('home.tournamentStatus.active') : t('home.tournamentStatus.closed')}</Text>
                      </View>
                      <Text style={S.compName} numberOfLines={2}>{comp.name}</Text>
                      <Text style={S.compMeta}>{t('home.tournamentParticipants', { n: comp.participants, max: comp.maxParticipants })}</Text>
                      <Text style={S.compDate}>{comp.startDate}</Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Résultats récents ─────────────────────────────────────── */}
        <Text style={S.sectionTitleOutside}>{t('home.recentResults')}</Text>
        {recentScores.length === 0 ? (
          <GlassCard radius={16}>
            <View style={{ padding: 16 }}>
              <Text style={S.emptyText}>{t('home.noScores')}</Text>
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
                      color: r.status === 'approved' ? theme.success : r.status === 'rejected' ? theme.error : theme.textMuted,
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

      {/* Interactive tour overlay — shown once after onboarding */}
      <InteractiveTour />
    </View>
  );
}

function createStyles(t: AppTheme) {
  const isDark = t.mode === 'dark';
  const textPrimary = t.text;
  const textSecondary = t.textSecondary;
  const textOnGlass = textPrimary;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.background },
    container: { flex: 1, backgroundColor: 'transparent' },

    // Header row
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
    username: { ...typography.h2, color: textPrimary },
    boxLogo: { width: 40, height: 40, borderRadius: borderRadius.md },
    boxSwitchBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    boxSwitchText: { ...typography.caption, color: textSecondary, maxWidth: 180 },
    bellBadge: {
      position: 'absolute', top: -6, right: -6,
      backgroundColor: t.error, borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: t.background,
    },
    bellBadgeText: { ...typography.caption, color: '#fff' },

    // Hero ELO card
    heroInner: { padding: spacing.md },
    heroTop: { flexDirection: 'row', alignItems: 'center' },
    heroEloNum: { ...typography.h1, color: t.accent, letterSpacing: -1 },
    heroEloLabel: { ...typography.overline, color: textSecondary, marginTop: spacing.xxs },
    heroDivider: { width: 1, height: 30, backgroundColor: t.border },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatNum: { ...typography.h4, color: textOnGlass },
    heroStatLabel: { ...typography.caption, color: textSecondary, marginTop: spacing.xxs },
    heroLevelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
    levelDot: { width: 8, height: 8, borderRadius: 4 },
    levelTxt: { ...typography.label, textTransform: 'none' },
    matchesTxt: { ...typography.caption, color: textSecondary, marginLeft: 'auto' },

    // Action row
    actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    notifDot: {
      position: 'absolute', top: -3, right: -3,
      backgroundColor: t.error, borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: t.background,
    },
    notifDotTxt: { ...typography.caption, color: '#fff' },

    // Section header
    sectionInner: { padding: spacing.md },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { ...typography.h4, color: textPrimary },
    sectionTitleOutside: { ...typography.h4, color: textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
    linkText: { ...typography.button, color: t.accent },
    emptyText: { ...typography.body, color: textSecondary },

    // Week activity
    weekTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
    streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${t.accent}15`, borderRadius: borderRadius.sm, paddingHorizontal: 8, paddingVertical: 3 },
    streakTxt: { ...typography.caption, color: t.accent, fontWeight: '800' },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 60, marginTop: spacing.md, marginBottom: spacing.sm },
    weekCol: { alignItems: 'center', flex: 1, gap: spacing.xs, paddingVertical: 4, borderRadius: borderRadius.sm },
    weekColSelected: { backgroundColor: `${t.accent}12` },
    weekBar: { width: 22, borderRadius: borderRadius.sm, minHeight: 4 },
    weekDayTxt: { ...typography.caption, color: textSecondary },
    dayDetailTxt: { ...typography.caption, color: t.text, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm },
    weekTotalTxt: { ...typography.caption, color: textSecondary, textAlign: 'center', marginBottom: spacing.sm },

    // Legend
    legendRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', marginBottom: spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    legendDot: { width: 8, height: 8, borderRadius: 2 },
    legendText: { ...typography.caption, color: textSecondary },

    // Progression strip
    progStrip: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.border,
      paddingTop: spacing.sm, marginTop: spacing.xs,
    },
    progItem: { flex: 1, alignItems: 'center' },
    progItemNum: { ...typography.h4, color: textPrimary },
    progItemLbl: { ...typography.caption, color: textSecondary, marginTop: spacing.xxs },

    // PRs
    prBlock: { borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.sm, gap: spacing.sm, marginTop: spacing.sm },
    prBlockTitle: { ...typography.button, color: textPrimary, marginBottom: spacing.xxs },
    prLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    prLineIcon: { fontSize: 14, width: 20, textAlign: 'center' },
    prLineName: { flex: 1, ...typography.bodySmall, color: textSecondary },
    prLineVal: { ...typography.button, color: textPrimary },

    // Tools
    toolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
    toolLabel: { ...typography.button, color: textPrimary },
    toolDesc: { ...typography.caption, color: textSecondary, marginTop: spacing.xxs },

    // Comps
    compInner: { padding: spacing.sm, gap: spacing.xs },
    compBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
    compDot: { width: 6, height: 6, borderRadius: 3 },
    compStatus: { ...typography.overline, color: textSecondary },
    compName: { ...typography.button, color: textPrimary, lineHeight: 17 },
    compMeta: { ...typography.caption, color: textSecondary },
    compDate: { ...typography.caption, color: textSecondary },
    compPhysInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, gap: spacing.xs },
    compPhysName: { color: textPrimary, ...typography.caption, textAlign: 'center' },

    // Results
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
    resultAvatarTxt: { ...typography.button, color: t.accent },
    resultTitle: { ...typography.button, color: textPrimary },
    resultDate: { ...typography.caption, color: textSecondary, marginTop: spacing.xxs },
    resultStatus: { ...typography.overline },
    resultScore: { ...typography.caption, color: textSecondary, marginTop: spacing.xxs },

    // Badge unlock popup
    badgePopupWrap: {
      position: 'absolute', bottom: 100, left: 16, right: 16, zIndex: 99,
    },
    badgePopupCard: {
      backgroundColor: isDark ? 'rgba(10,20,15,0.97)' : 'rgba(241,245,249,0.97)',
      borderRadius: 20, padding: 16,
      borderWidth: 1.5, borderColor: t.accent,
      shadowColor: t.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
      elevation: 10,
    },
    badgePopupIconRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
    badgePopupIcon: { fontSize: 44 },
    badgePopupHeader: { fontSize: 10, fontWeight: '800', color: t.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    badgePopupTitle: { fontSize: 16, fontWeight: '900', color: t.text, marginBottom: 2 },
    badgePopupDesc: { fontSize: 12, color: t.textSecondary, lineHeight: 16 },
    badgeProgressTrack: { height: 3, backgroundColor: t.surface, borderRadius: 2, overflow: 'hidden' },
    badgeProgressFill: { height: '100%', backgroundColor: t.accent, borderRadius: 2 },

    // Box picker modal
    boxPickerOverlay: { flex: 1, backgroundColor: t.modalBackdrop, justifyContent: 'flex-end', paddingBottom: spacing.xl },
    boxPickerSheet: { backgroundColor: t.modalCard, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md },
    boxPickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: t.border, alignSelf: 'center', marginBottom: spacing.md },
    boxPickerTitle: { ...typography.h3, color: textPrimary, marginBottom: spacing.md },
    boxPickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: borderRadius.lg, marginBottom: spacing.xs },
    boxPickerRowActive: { backgroundColor: `${t.accent}15` },
    boxPickerLogo: { width: 40, height: 40, borderRadius: borderRadius.md },
    boxPickerName: { ...typography.button, color: textPrimary },
    boxPickerRole: { fontSize: 11, fontWeight: '500', color: textSecondary, marginTop: 1 },
  });
}
