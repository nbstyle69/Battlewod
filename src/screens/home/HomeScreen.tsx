import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Zap, Swords, Trophy, TrendingUp, ChevronRight, Flame, Timer, BarChart2, Sparkles, Target } from 'lucide-react-native';
import KettlebellIcon from '../../components/KettlebellIcon';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';
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

const QUICK_ACTIONS = [
  { icon: Swords, label: 'Match 1v1', color: Colors.primary, desc: 'Défie un athlète' },
  { icon: Trophy, label: 'Tournoi', color: Colors.gold, desc: 'Rejoins la compét' },
  { icon: Zap, label: 'WOD du jour', color: Colors.success, desc: 'Entraîne-toi' },
  { icon: TrendingUp, label: 'Mon niveau', color: LevelColors.gx, desc: 'Voir progression' },
];

export default function HomeScreen() {
  const { user, currentBox } = useAuth();
  const navigation = useNavigation<Nav>();
  const level = user?.level ?? 'scaled';

  const [competitions,  setCompetitions]  = useState<CompetitionSummary[]>([]);
  const [recentScores,  setRecentScores]  = useState<RecentScore[]>([]);
  const [rank,          setRank]          = useState<number | null>(null);
  const [streak,        setStreak]        = useState(0);

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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>

        {/* Logo BattleWOD */}
        <View style={styles.logoRow}>
          <KettlebellIcon size={30} />
          <View style={styles.logoTextWrap}>
            <Text style={styles.logoTextBattle}>BATTLE</Text>
            <Text style={styles.logoTextWod}>WOD</Text>
          </View>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.username}>{user?.username ?? 'Athlète'}</Text>
            <View style={styles.levelPill}>
              <View style={[styles.levelDot, { backgroundColor: LevelColors[level] }]} />
              <Text style={[styles.levelText, { color: LevelColors[level] }]}>{level.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.eloBox}>
              <Text style={styles.eloLabel}>ELO</Text>
              <Text style={styles.eloValue}>{user?.elo ?? 1000}</Text>
              <Text style={styles.eloSub}>points</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.8}
            >
              <KettlebellIcon size={22} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        {[
          { icon: Flame,      color: Colors.primary, value: streak, label: 'Série' },
          { icon: Trophy,     color: Colors.gold,    value: rank !== null ? `#${rank}` : '—', label: 'Rang' },
          { icon: Swords,     color: Colors.success, value: user?.wins ?? 0,   label: 'Victoires' },
          { icon: TrendingUp, color: '#9C27B0',      value: user?.total_matches ?? 0, label: 'Matchs' },
        ].map(({ icon: Icon, color, value, label }) => (
          <View key={label} style={styles.statCard}>
            <Icon color={color} size={18} />
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Actions rapides ────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions rapides</Text>

        {/* Classement card */}
        <TouchableOpacity style={styles.timerHero} onPress={() => navigation.navigate('Leaderboard')} activeOpacity={0.82}>
          <View style={styles.timerHeroLeft}>
            <View style={[styles.timerIconBox, { backgroundColor: `${Colors.gold}18` }]}>
              <BarChart2 color={Colors.gold} size={24} />
            </View>
            <View>
              <Text style={styles.timerHeroTitle}>Classement</Text>
              <Text style={styles.timerHeroSub}>Individuel · Équipes · Box</Text>
            </View>
          </View>
          <ChevronRight color={Colors.textMuted} size={18} />
        </TouchableOpacity>

        {/* Timer hero card — rouge et visible */}
        <TouchableOpacity style={styles.timerHeroRed} onPress={() => navigation.navigate('Timer')} activeOpacity={0.82}>
          <View style={styles.timerHeroLeft}>
            <View style={styles.timerIconBoxRed}>
              <Timer color="#fff" size={24} />
            </View>
            <View>
              <Text style={styles.timerHeroTitleRed}>Minuteur vidéo</Text>
              <Text style={styles.timerHeroSubRed}>For Time · AMRAP · EMOM · Tabata · YWYR · Intervalles</Text>
            </View>
          </View>
          <ChevronRight color="rgba(255,255,255,0.6)" size={18} />
        </TouchableOpacity>
      </View>

      {/* ── Générateur de WOD ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.wodGenHero} onPress={() => navigation.navigate('WODGenerator')} activeOpacity={0.82}>
          <View style={styles.timerHeroLeft}>
            <View style={styles.wodGenIconBox}>
              <Sparkles color="#fff" size={24} />
            </View>
            <View>
              <Text style={styles.wodGenTitle}>Générateur de WOD</Text>
              <Text style={styles.wodGenSub}>For Time · AMRAP · EMOM · Tabata · Max Reps</Text>
            </View>
          </View>
          <ChevronRight color="rgba(255,255,255,0.6)" size={18} />
        </TouchableOpacity>
      </View>

      {/* ── Calculateur 1RM ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.oneRMHero} onPress={() => navigation.navigate('OneRMCalculator')} activeOpacity={0.82}>
          <View style={styles.timerHeroLeft}>
            <View style={styles.oneRMIconBox}>
              <Target color="#0A0A0A" size={24} />
            </View>
            <View>
              <Text style={styles.oneRMTitle}>Calculateur 1RM</Text>
              <Text style={styles.oneRMSub}>50% → 130% · Zones · Charges · Répétitions</Text>
            </View>
          </View>
          <ChevronRight color="rgba(0,0,0,0.4)" size={18} />
        </TouchableOpacity>
      </View>

      {/* ── Actions rapides (suite) ───────────────────────────────────────── */}
      <View style={styles.section}>
        {/* 2×2 action grid */}
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity key={action.label} style={styles.actionCard} activeOpacity={0.75}>
              <View style={[styles.actionIconBox, { backgroundColor: `${action.color}12` }]}>
                <action.icon color={action.color} size={20} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionDesc}>{action.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Compétitions ──────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Compétitions</Text>
          <TouchableOpacity style={styles.seeAll} activeOpacity={0.7}>
            <Text style={styles.seeAllText}>Voir tout</Text>
            <ChevronRight color={Colors.primary} size={14} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compHScroll} contentContainerStyle={styles.compHScrollContent}>
          {competitions.map((comp: CompetitionSummary) => (
            <TouchableOpacity
              key={comp.id}
              style={styles.compCard}
              onPress={() => navigation.navigate('CompetitionDetail', { competition: comp })}
              activeOpacity={0.82}
            >
              <View style={styles.compCardTop}>
                <View style={[styles.compStatusDot, { backgroundColor: comp.status === 'open' ? Colors.success : comp.status === 'active' ? Colors.warning : Colors.textMuted }]} />
                <Text style={styles.compStatusLabel}>{comp.status === 'open' ? 'Ouvert' : comp.status === 'active' ? 'En cours' : 'Terminé'}</Text>
              </View>
              <Text style={styles.compName} numberOfLines={2}>{comp.name}</Text>
              <Text style={styles.compPrize}>{comp.prize}</Text>
              <View style={styles.compFooter}>
                <Text style={styles.compParticipants}>{comp.participants}/{comp.maxParticipants} 👥</Text>
                <Text style={styles.compDate}>{comp.startDate}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Derniers résultats ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Derniers résultats</Text>
        {recentScores.length === 0 ? (
          <View style={[styles.resultRow, { justifyContent: 'center' }]}>
            <Text style={{ color: Colors.textMuted, fontSize: 13 }}>Aucun score soumis pour l'instant.</Text>
          </View>
        ) : (
          recentScores.map(r => (
            <View key={r.id} style={styles.resultRow}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{r.wod_title[0]}</Text>
              </View>
              <View style={styles.resultMid}>
                <Text style={styles.resultOpp}>{r.wod_title}</Text>
                <Text style={styles.resultWod}>
                  {new Date(r.submitted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <View style={styles.resultRight}>
                <Text style={[styles.resultBadge, {
                  color: r.status === 'approved' ? Colors.success : r.status === 'rejected' ? Colors.error : Colors.textMuted,
                }]}>
                  {r.status === 'approved' ? 'VALIDÉ' : r.status === 'rejected' ? 'REJETÉ' : 'EN ATTENTE'}
                </Text>
                <Text style={styles.resultWod}>{r.score_value}</Text>
              </View>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Header
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1, gap: 4 },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  logoTextWrap: { flexDirection: 'column', justifyContent: 'center' },
  logoTextBattle: { fontSize: 11, fontWeight: '900', color: Colors.text, letterSpacing: 2.5, lineHeight: 12 },
  logoTextWod: { fontSize: 17, fontWeight: '900', color: Colors.text, letterSpacing: 2, lineHeight: 18 },
  username: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  levelDot: { width: 7, height: 7, borderRadius: 4 },
  levelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  eloBox: {
    backgroundColor: Colors.surface, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, minWidth: 72,
  },
  eloLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '800', letterSpacing: 1.5 },
  eloValue: { fontSize: 24, fontWeight: '900', color: Colors.text, lineHeight: 28 },
  eloSub: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },

  // ── Stats
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.3 },

  // ── Sections
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: Colors.text, marginBottom: 12, letterSpacing: -0.2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  // ── Timer hero
  timerHero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  timerHeroLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  timerIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${Colors.primary}12`,
    justifyContent: 'center', alignItems: 'center',
  },
  timerHeroTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  timerHeroSub: { fontSize: 10, color: Colors.textMuted, lineHeight: 15 },

  // ── Actions grid
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '47.5%', borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.card,
    padding: 14, gap: 6,
  },
  actionIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '800', color: Colors.text, marginTop: 2 },
  actionDesc: { fontSize: 11, color: Colors.textMuted },

  // ── 1RM Calculator hero
  oneRMHero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#00ff88', borderRadius: 16, padding: 16,
  },
  oneRMIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  oneRMTitle: { fontSize: 16, fontWeight: '900', color: '#0A0A0A', marginBottom: 2 },
  oneRMSub: { fontSize: 11, color: 'rgba(0,0,0,0.55)', fontWeight: '600' },

  // ── WOD Generator hero
  wodGenHero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A2E', borderRadius: 16, padding: 16,
  },
  wodGenIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  wodGenTitle: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 2 },
  wodGenSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  // ── Timer hero RED variant
  timerHeroRed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#CC1A1A', borderRadius: 16, padding: 16, marginBottom: 12,
    opacity: 0.92,
  },
  timerIconBoxRed: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  timerHeroTitleRed: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 2 },
  timerHeroSubRed: { fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 15 },

  // ── Competitions horizontal scroll
  compHScroll: { marginHorizontal: -16 },
  compHScrollContent: { paddingHorizontal: 16, gap: 12 },
  compCard: {
    width: 160, backgroundColor: Colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6,
  },
  compCardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compStatusDot: { width: 7, height: 7, borderRadius: 4 },
  compStatusLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  compName: { fontSize: 13, fontWeight: '900', color: Colors.text, lineHeight: 17 },
  compPrize: { fontSize: 12, color: Colors.gold, fontWeight: '700' },
  compFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  compParticipants: { fontSize: 10, color: Colors.textMuted },
  compDate: { fontSize: 10, color: Colors.textMuted },

  // ── Results
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  avatarText: { fontSize: 15, fontWeight: '900', color: Colors.text },
  resultMid: { flex: 1 },
  resultOpp: { fontSize: 14, fontWeight: '700', color: Colors.text },
  resultWod: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  resultRight: { alignItems: 'flex-end', gap: 1 },
  resultBadge: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  eloChange: { fontSize: 12, fontWeight: '700' },
});
