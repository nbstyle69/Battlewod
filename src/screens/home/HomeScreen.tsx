import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Zap, Trophy, Flame, Timer, BarChart2, Sparkles, Target, User, Users, History } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { HomeStackParamList, CompetitionSummary } from '../../navigation';
import { supabase } from '../../lib/supabase';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeList'>;

interface RecentScore {
  id: string;
  score_value: string;
  submitted_at: string;
  wod_title: string;
  status: string;
}


export default function HomeScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const level = user?.level ?? 'scaled';
  const S = createStyles(theme);

  const TOOLS = [
    { icon: BarChart2, label: 'Classement',      desc: 'Individuel · Équipes · Box',   color: theme.gold,    screen: 'Leaderboard'     },
    { icon: Timer,     label: 'Minuteur vidéo',  desc: 'For Time · AMRAP · EMOM…',    color: theme.accent,  screen: 'Timer'           },
    { icon: Sparkles,  label: 'Générateur WOD',  desc: 'For Time · AMRAP · Tabata',   color: '#6366F1',     screen: 'WODGenerator'    },
    { icon: Target,    label: 'Calculateur 1RM', desc: '50% → 130% · Zones',          color: '#10B981',     screen: 'OneRMCalculator' },
    { icon: Zap,       label: 'Mini-Tournois',   desc: 'Flash · 5 max · ELO',         color: '#EF4444',     screen: 'DailyTournaments'},
  ];

  const [competitions,   setCompetitions]   = useState<CompetitionSummary[]>([]);
  const [recentScores,   setRecentScores]   = useState<RecentScore[]>([]);
  const [rank,           setRank]           = useState<number | null>(null);
  const [streak,         setStreak]         = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);

  // Progression stats
  const [totalWods,       setTotalWods]       = useState(0);
  const [totalScoresGen,  setTotalScoresGen]  = useState(0);
  const [genStreak,       setGenStreak]       = useState(0);
  const [weekActivity,    setWeekActivity]    = useState<number[]>([0,0,0,0,0,0,0]);
  const [favCount,        setFavCount]        = useState(0);
  const [bestScores,      setBestScores]      = useState<{name:string; value:string; type:string}[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;

    // Rank: number of profiles with higher ELO + 1
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('elo', user.elo ?? 0);
    setRank((count ?? 0) + 1);

    // Streak: count consecutive days with wod_scores
    const { data: scoresDays } = await supabase
      .from('wod_scores')
      .select('created_at')
      .eq('athlete_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (scoresDays && scoresDays.length > 0) {
      const days = [...new Set(scoresDays.map((s: any) => s.created_at.slice(0, 10)))];
      let s = 0;
      const today = new Date();
      for (let i = 0; i < days.length; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        if (days[i] === d.toISOString().slice(0, 10)) s++;
        else break;
      }
      setStreak(s);
    }

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
    setCompetitions(mapped);

    // Pending friend requests
    const { count: friendCount } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending');
    setPendingFriends(friendCount ?? 0);

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
    setTotalWods(genWodCount ?? 0);
    setTotalScoresGen(genScoreCount ?? 0);
    setFavCount(genFavCount ?? 0);

    // Week activity (7 bars)
    const weekArr = [0,0,0,0,0,0,0];
    const now = new Date();
    (genWeek ?? []).forEach((w: any) => {
      const d = new Date(w.created_at);
      const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) weekArr[6 - diff]++;
    });
    setWeekActivity(weekArr);

    // Gen streak
    if (genAll && genAll.length > 0) {
      const days = [...new Set((genAll as any[]).map((w: any) => w.created_at.slice(0, 10)))];
      let gs = 0;
      const td = new Date();
      for (let i = 0; i < days.length; i++) {
        const check = new Date(td);
        check.setDate(td.getDate() - i);
        if (days.includes(check.toISOString().slice(0, 10))) gs++;
        else break;
      }
      setGenStreak(gs);
    }

    // Best scores per WOD type
    const { data: bestData } = await supabase
      .from('generated_wod_scores')
      .select('score_type, score_value, wod:generated_wods(wod_name, wod_type)')
      .eq('user_id', user.id)
      .order('score_value', { ascending: true })
      .limit(50);
    if (bestData && bestData.length > 0) {
      const byType: Record<string, {name:string; value:number; type:string}> = {};
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
      setBestScores(Object.entries(byType).map(([, v]) => ({
        name: v.name,
        value: v.type === 'time'
          ? `${String(Math.floor(v.value / 60)).padStart(2, '0')}:${String(Math.round(v.value % 60)).padStart(2, '0')}`
          : `${v.value}`,
        type: v.type === 'time' ? '⏱' : v.type === 'reps' ? '🔄' : v.type === 'weight' ? '🏋️' : '🔁',
      })).slice(0, 4));
    }

    // Recent scores
    const { data: scores } = await supabase
      .from('tournament_scores')
      .select('id, score_value, submitted_at, status, tw:tournament_wods(title)')
      .eq('athlete_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(3);

    setRecentScores((scores ?? []).map((s: any) => ({
      id:           s.id,
      score_value:  s.score_value,
      submitted_at: s.submitted_at,
      wod_title:    (Array.isArray(s.tw) ? s.tw[0] : s.tw)?.title ?? '—',
      status:       s.status,
    })));
  }, [user, currentBox]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: refresh badge when a new friend request targets this user
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`friend-notif-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friendships',
        filter: `addressee_id=eq.${user.id}`,
      }, () => {
        // Re-count pending requests
        supabase
          .from('friendships')
          .select('id', { count: 'exact', head: true })
          .eq('addressee_id', user.id)
          .eq('status', 'pending')
          .then(({ count }) => setPendingFriends(count ?? 0));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const levelColor = LevelColors[level] ?? '#111';

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={S.header}>
        <View style={S.headerTop}>
          <View>
            <Text style={S.greeting}>Bonjour,</Text>
            <Text style={S.username}>{user?.username ?? 'Athlète'}</Text>
          </View>
          <View style={S.headerActions}>
            <TouchableOpacity style={S.iconBtn} onPress={() => navigation.navigate('Friends')} activeOpacity={0.7}>
              <Users size={20} color="#111" />
              {pendingFriends > 0 && (
                <View style={S.notifDot}>
                  <Text style={S.notifDotTxt}>{pendingFriends > 9 ? '9+' : pendingFriends}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={S.iconBtn} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7}>
              <User size={20} color="#111" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero: ELO + Level + Rank */}
        <View style={S.heroRow}>
          <View style={S.heroElo}>
            <Text style={S.heroEloNum}>{user?.elo ?? 1000}</Text>
            <Text style={S.heroEloLabel}>ELO</Text>
          </View>
          <View style={S.heroDivider} />
          <View style={S.heroStat}>
            <Text style={S.heroStatNum}>{rank !== null ? `#${rank}` : '—'}</Text>
            <Text style={S.heroStatLabel}>Rang</Text>
          </View>
          <View style={S.heroDivider} />
          <View style={S.heroStat}>
            <Text style={S.heroStatNum}>{streak}</Text>
            <Text style={S.heroStatLabel}>Streak</Text>
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
              const isToday = i === 6;
              const active = weekActivity[i] > 0;
              return (
                <View key={i} style={S.weekCol}>
                  <View style={[S.weekBar, { height: h, backgroundColor: active ? '#111' : '#E5E7EB' }, isToday && active && { backgroundColor: '#000' }]} />
                  <Text style={[S.weekDayTxt, isToday && { fontWeight: '900', color: '#111' }]}>{day}</Text>
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
        <View style={S.toolGrid}>
          {TOOLS.map(t => (
            <TouchableOpacity key={t.label} style={S.toolCard} onPress={() => navigation.navigate(t.screen as any)} activeOpacity={0.6}>
              <t.icon color="#111" size={22} />
              <Text style={S.toolLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Compétitions ──────────────────────────────────────────────── */}
      {competitions.length > 0 && (
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Compétitions</Text>
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
                  <View style={[S.compDot, { backgroundColor: comp.status === 'open' ? '#111' : comp.status === 'active' ? '#999' : '#ddd' }]} />
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
                  color: r.status === 'approved' ? '#111' : r.status === 'rejected' ? '#DC2626' : '#9CA3AF',
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
function createStyles(_theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // ── Header ──
    header: {
      paddingTop: 58, paddingHorizontal: 20, paddingBottom: 24,
      backgroundColor: '#fff',
      borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    greeting: { fontSize: 14, fontWeight: '500', color: '#9CA3AF', letterSpacing: 0.2 },
    username: { fontSize: 28, fontWeight: '900', color: '#111', letterSpacing: -0.8, marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: 6, paddingTop: 4 },
    iconBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6',
      justifyContent: 'center', alignItems: 'center',
    },
    notifDot: {
      position: 'absolute', top: -2, right: -2,
      backgroundColor: '#111', borderRadius: 8,
      minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 2, borderColor: '#fff',
    },
    notifDotTxt: { fontSize: 8, fontWeight: '900', color: '#fff' },

    // ── Hero stats ──
    heroRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#FAFAFA', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 4,
      marginBottom: 14,
    },
    heroElo: { flex: 1.2, alignItems: 'center' },
    heroEloNum: { fontSize: 32, fontWeight: '900', color: '#111', letterSpacing: -1 },
    heroEloLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 2, marginTop: 2 },
    heroDivider: { width: 1, height: 32, backgroundColor: '#E5E7EB' },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatNum: { fontSize: 18, fontWeight: '800', color: '#111' },
    heroStatLabel: { fontSize: 9, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.3, marginTop: 2 },

    // ── Level ──
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    levelDot: { width: 8, height: 8, borderRadius: 4 },
    levelTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    matchesTxt: { fontSize: 11, color: '#D1D5DB', fontWeight: '600', marginLeft: 'auto' },

    // ── Sections ──
    section: { paddingHorizontal: 20, marginTop: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: '#111', letterSpacing: -0.3, marginBottom: 14 },
    linkText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
    emptyText: { fontSize: 13, color: '#D1D5DB', paddingVertical: 12 },

    // ── Week activity ──
    weekRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
      height: 56, marginBottom: 20,
    },
    weekCol: { alignItems: 'center', flex: 1, gap: 6 },
    weekBar: { width: 24, borderRadius: 6, minHeight: 3 },
    weekDayTxt: { fontSize: 10, fontWeight: '500', color: '#D1D5DB' },

    // ── Progression strip ──
    progStrip: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F3F4F6',
      paddingTop: 16, marginBottom: 16,
    },
    progItem: { flex: 1, alignItems: 'center' },
    progItemNum: { fontSize: 18, fontWeight: '900', color: '#111' },
    progItemLbl: { fontSize: 9, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.3, marginTop: 3 },

    // ── PRs ──
    prBlock: {
      borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 16, gap: 10,
    },
    prBlockTitle: { fontSize: 13, fontWeight: '800', color: '#111', marginBottom: 2 },
    prLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    prLineIcon: { fontSize: 14, width: 20, textAlign: 'center' },
    prLineName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
    prLineVal: { fontSize: 14, fontWeight: '900', color: '#111' },

    // ── Tool grid ──
    toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    toolCard: {
      width: '31%', aspectRatio: 1, borderRadius: 16,
      backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#F3F4F6',
      justifyContent: 'center', alignItems: 'center', gap: 8,
    },
    toolLabel: { fontSize: 10, fontWeight: '700', color: '#374151', textAlign: 'center', paddingHorizontal: 4 },

    // ── Competition cards ──
    compCard: {
      width: 155, backgroundColor: '#FAFAFA', borderRadius: 14,
      borderWidth: 1, borderColor: '#F3F4F6', padding: 14, gap: 6,
    },
    compBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    compDot: { width: 6, height: 6, borderRadius: 3 },
    compStatus: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
    compName: { fontSize: 13, fontWeight: '800', color: '#111', lineHeight: 17 },
    compMeta: { fontSize: 10, color: '#9CA3AF' },
    compDate: { fontSize: 10, color: '#D1D5DB' },

    // ── Results ──
    resultRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    resultAvatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
    },
    resultAvatarTxt: { fontSize: 14, fontWeight: '800', color: '#374151' },
    resultTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
    resultDate: { fontSize: 11, color: '#D1D5DB', marginTop: 1 },
    resultStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
    resultScore: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  });
}
