import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Zap, Swords, Trophy, TrendingUp, ChevronRight, Flame, Timer, BarChart2, Sparkles, Target, User, Users } from 'lucide-react-native';
import KettlebellIcon from '../../components/KettlebellIcon';
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

const QUICK_ACTIONS_BASE = [
  { icon: Trophy,     label: 'Tournoi',        colorKey: 'gold' as const,    desc: 'Rejoins la compét',  fixedColor: undefined },
  { icon: Zap,        label: 'WOD du jour',    colorKey: 'success' as const, desc: 'Entraîne-toi',       fixedColor: undefined },
  { icon: TrendingUp, label: 'Mon niveau',     colorKey: null,               desc: 'Voir progression',   fixedColor: LevelColors.gx },
];

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
  ];

  const [competitions,   setCompetitions]   = useState<CompetitionSummary[]>([]);
  const [recentScores,   setRecentScores]   = useState<RecentScore[]>([]);
  const [rank,           setRank]           = useState<number | null>(null);
  const [streak,         setStreak]         = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);

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

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={S.header}>

        {/* Logo TheHub */}
        <View style={S.logoRow}>
          <KettlebellIcon size={30} color={theme.accent} />
          <View style={S.logoTextWrap}>
            <Text style={S.logoTextBattle}>THE</Text>
            <Text style={S.logoTextWod}>HUB</Text>
          </View>
        </View>

        <View style={S.headerRow}>
          <View style={S.headerLeft}>
            <Text style={S.username}>{user?.username ?? 'Athlète'}</Text>
            <View style={S.levelPill}>
              <View style={[S.levelDot, { backgroundColor: LevelColors[level] }]} />
              <Text style={[S.levelText, { color: LevelColors[level] }]}>{level.toUpperCase()}</Text>
            </View>
          </View>
          <View style={S.headerRight}>
            <View style={S.eloBox}>
              <Text style={S.eloLabel}>ELO</Text>
              <Text style={S.eloValue}>{user?.elo ?? 1000}</Text>
              <Text style={S.eloSub}>points</Text>
            </View>
            <View style={S.headerBtns}>
              <TouchableOpacity
                style={S.profileBtn}
                onPress={() => navigation.navigate('Friends')}
                activeOpacity={0.8}
              >
                <Users size={19} color={theme.textSecondary} />
                {pendingFriends > 0 && (
                  <View style={S.badge}>
                    <Text style={S.badgeText}>{pendingFriends > 9 ? '9+' : pendingFriends}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={S.profileBtn}
                onPress={() => navigation.navigate('Profile')}
                activeOpacity={0.8}
              >
                <User size={19} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <View style={S.statsRow}>
        {[
          { icon: Flame,      color: theme.accent, value: streak, label: 'Série' },
          { icon: Trophy,     color: theme.gold,   value: rank !== null ? `#${rank}` : '—', label: 'Rang' },
          { icon: Swords,     color: theme.success, value: user?.wins ?? 0,   label: 'Victoires' },
          { icon: TrendingUp, color: '#9C27B0',     value: user?.total_matches ?? 0, label: 'Matchs' },
        ].map(({ icon: Icon, color, value, label }) => (
          <View key={label} style={S.statCard}>
            <Icon color={color} size={18} />
            <Text style={S.statValue}>{value}</Text>
            <Text style={S.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Outils ─────────────────────────────────────────────────────── */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Outils</Text>
        <View style={S.actionsGrid}>
          {TOOLS.map((tool) => (
            <TouchableOpacity key={tool.label} style={S.actionCard} onPress={() => navigation.navigate(tool.screen as any)} activeOpacity={0.75}>
              <View style={[S.actionIconBox, { backgroundColor: `${tool.color}18` }]}>
                <tool.icon color={tool.color} size={20} />
              </View>
              <Text style={S.actionLabel}>{tool.label}</Text>
              <Text style={S.actionDesc}>{tool.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Actions rapides ──────────────────────────────────────────────── */}
      <View style={S.section}>
        <View style={S.actionsGrid}>
          {QUICK_ACTIONS_BASE.map((action) => {
            const color = action.fixedColor ?? (action.colorKey ? theme[action.colorKey] : theme.accent);
            return (
              <TouchableOpacity key={action.label} style={S.actionCard} activeOpacity={0.75}>
                <View style={[S.actionIconBox, { backgroundColor: `${color}18` }]}>
                  <action.icon color={color} size={20} />
                </View>
                <Text style={S.actionLabel}>{action.label}</Text>
                <Text style={S.actionDesc}>{action.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Compétitions ──────────────────────────────────────────────── */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>Compétitions</Text>
          <TouchableOpacity style={S.seeAll} activeOpacity={0.7}>
            <Text style={S.seeAllText}>Voir tout</Text>
            <ChevronRight color={theme.accent} size={14} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.compHScroll} contentContainerStyle={S.compHScrollContent}>
          {competitions.map((comp: CompetitionSummary) => (
            <TouchableOpacity
              key={comp.id}
              style={S.compCard}
              onPress={() => navigation.navigate('CompetitionDetail', { competition: comp })}
              activeOpacity={0.82}
            >
              <View style={S.compCardTop}>
                <View style={[S.compStatusDot, { backgroundColor: comp.status === 'open' ? theme.success : comp.status === 'active' ? theme.warning : theme.textMuted }]} />
                <Text style={S.compStatusLabel}>{comp.status === 'open' ? 'Ouvert' : comp.status === 'active' ? 'En cours' : 'Terminé'}</Text>
              </View>
              <Text style={S.compName} numberOfLines={2}>{comp.name}</Text>
              <Text style={S.compPrize}>{comp.prize}</Text>
              <View style={S.compFooter}>
                <Text style={S.compParticipants}>{comp.participants}/{comp.maxParticipants} 👥</Text>
                <Text style={S.compDate}>{comp.startDate}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Derniers résultats ─────────────────────────────────────────── */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Derniers résultats</Text>
        {recentScores.length === 0 ? (
          <View style={[S.resultRow, { justifyContent: 'center' }]}>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>Aucun score soumis pour l'instant.</Text>
          </View>
        ) : (
          recentScores.map(r => (
            <View key={r.id} style={S.resultRow}>
              <View style={S.avatarPlaceholder}>
                <Text style={S.avatarText}>{r.wod_title[0]}</Text>
              </View>
              <View style={S.resultMid}>
                <Text style={S.resultOpp}>{r.wod_title}</Text>
                <Text style={S.resultWod}>
                  {new Date(r.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <View style={S.resultRight}>
                <Text style={[S.resultBadge, {
                  color: r.status === 'approved' ? theme.success : r.status === 'rejected' ? theme.error : theme.textMuted,
                }]}>
                  {r.status === 'approved' ? 'VALIDÉ' : r.status === 'rejected' ? 'REJETÉ' : 'EN ATTENTE'}
                </Text>
                <Text style={S.resultWod}>{r.score_value}</Text>
              </View>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

import { AppTheme } from '../../context/ThemeContext';
function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    header: {
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerLeft: { flex: 1, gap: 4 },
    headerRight: { alignItems: 'flex-end', gap: 8 },
    headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    profileBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
      justifyContent: 'center', alignItems: 'center',
    },
    badge: {
      position: 'absolute', top: -4, right: -4,
      backgroundColor: '#EF4444', borderRadius: 8,
      minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 1.5, borderColor: theme.card,
    },
    badgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    logoTextWrap: { flexDirection: 'column', justifyContent: 'center' },
    logoTextBattle: { fontSize: 10, fontFamily: 'Barlow_800ExtraBold', color: theme.textMuted, letterSpacing: 3, lineHeight: 11 },
    logoTextWod: { fontSize: 20, fontFamily: 'Barlow_900Black', color: theme.accent, letterSpacing: 2, lineHeight: 21 },
    username: { fontSize: 26, fontWeight: '900', color: theme.text, letterSpacing: -0.5 },
    levelPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    levelDot: { width: 7, height: 7, borderRadius: 4 },
    levelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
    eloBox: {
      backgroundColor: theme.surface, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
      borderWidth: 1, borderColor: theme.border, minWidth: 72,
    },
    eloLabel: { fontSize: 9, color: theme.textMuted, fontWeight: '800', letterSpacing: 1.5 },
    eloValue: { fontSize: 24, fontWeight: '900', color: theme.text, lineHeight: 28 },
    eloSub: { fontSize: 9, color: theme.textMuted, fontWeight: '600' },

    statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
    statCard: {
      flex: 1, backgroundColor: theme.card, borderRadius: 12,
      paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', gap: 3,
      borderWidth: 1, borderColor: theme.border,
      shadowColor: theme.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    statValue: { fontSize: 15, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 9, color: theme.textMuted, fontWeight: '600', letterSpacing: 0.3 },

    section: { paddingHorizontal: 16, marginTop: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 17, fontWeight: '900', color: theme.text, marginBottom: 12, letterSpacing: -0.2 },
    seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    seeAllText: { fontSize: 12, color: theme.accent, fontWeight: '700' },

    timerHero: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: theme.border, marginBottom: 12,
      shadowColor: theme.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 2,
    },
    timerHeroLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    timerIconBox: {
      width: 44, height: 44, borderRadius: 12,
      justifyContent: 'center', alignItems: 'center',
    },
    timerHeroTitle: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 2 },
    timerHeroSub: { fontSize: 10, color: theme.textMuted, lineHeight: 15 },

    timerHeroEmerald: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.accentDark, borderRadius: 16, padding: 16, marginBottom: 12,
      shadowColor: theme.accentShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 20, elevation: 4,
    },
    timerIconBoxEmerald: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center', alignItems: 'center',
    },
    timerHeroTitleWhite: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 2 },
    timerHeroSubWhite: { fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 15 },

    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionCard: {
      width: '47.5%', borderRadius: 14, borderWidth: 1,
      borderColor: theme.border, backgroundColor: theme.card, padding: 14, gap: 6,
      shadowColor: theme.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 2,
    },
    actionIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    actionLabel: { fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 2 },
    actionDesc: { fontSize: 11, color: theme.textMuted },

    oneRMHero: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.accent, borderRadius: 16, padding: 16,
      shadowColor: theme.accentShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 20, elevation: 4,
    },
    oneRMIconBox: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    oneRMTitle: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 2 },
    oneRMSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

    wodGenHero: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.mode === 'dark' ? '#1e293b' : '#1A1A2E', borderRadius: 16, padding: 16,
    },
    wodGenIconBox: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    wodGenTitle: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 2 },
    wodGenSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

    compHScroll: { marginHorizontal: -16 },
    compHScrollContent: { paddingHorizontal: 16, gap: 12 },
    compCard: {
      width: 160, backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, padding: 14, gap: 6,
      shadowColor: theme.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 2,
    },
    compCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    compStatusDot: { width: 7, height: 7, borderRadius: 4 },
    compStatusLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted },
    compName: { fontSize: 13, fontWeight: '900', color: theme.text, lineHeight: 17 },
    compPrize: { fontSize: 12, color: theme.gold, fontWeight: '700' },
    compFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    compParticipants: { fontSize: 10, color: theme.textMuted },
    compDate: { fontSize: 10, color: theme.textMuted },

    resultRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.card, borderRadius: 12, padding: 12,
      marginBottom: 8, borderWidth: 1, borderColor: theme.border, gap: 12,
      shadowColor: theme.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 2,
    },
    avatarPlaceholder: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: theme.accentShadow, justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 15, fontWeight: '900', color: '#fff' },
    resultMid: { flex: 1 },
    resultOpp: { fontSize: 14, fontWeight: '700', color: theme.text },
    resultWod: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    resultRight: { alignItems: 'flex-end', gap: 1 },
    resultBadge: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
    eloChange: { fontSize: 12, fontWeight: '700' },
  });
}
