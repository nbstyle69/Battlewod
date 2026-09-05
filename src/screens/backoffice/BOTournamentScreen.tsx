import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, Linking,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Trophy, Clock, CheckCircle, XCircle, Youtube,
  ChevronDown, ChevronUp, Bot, BarChart2, Lock, Zap,
  RotateCcw, AlertTriangle, Users, UserX, Star, ChevronLeft,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { sendTournamentClosedNotification } from '../../services/notifications';
import { incrementCounter, checkAndAwardBadges, movementBadgesCrossed } from '../../services/gamification';
import { syncLevelAndBadges } from '../../utils/eloLevels';
import { useAuth } from '../../context/AuthContext';
import { LevelColors } from '../../theme/designTokens';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import {
  TournamentScore,
  rankWodScores, cfPoints, parseScoreToNumber, formatScoreDisplay,
  normalizeMovement, formatDateTime,
} from '../../utils/tournamentUtils';
import { computeCompletedMovements } from '../../utils/movementParser';
import GlassBackground from '../../components/glass/GlassBackground';

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusPill({ status, theme: th }: { status: string; theme: AppTheme }) {
  const { t } = useTranslation();
  const color = status === 'pending' ? th.warning
    : status === 'validated' ? th.success : th.error;
  const label = status === 'pending' ? t('bo.tournament.statusPending') : status === 'validated' ? t('bo.tournament.statusValidated') : t('bo.tournament.statusRejected');
  return (
    <View style={[pill.wrap, { backgroundColor: `${color}20` }]}>
      <Text style={[pill.txt, { color }]}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  txt:  { fontSize: 11, fontWeight: '800' },
});

// ═════════════════════════════════════════════════════════════════════════════
export default function BOTournamentScreen() {
  const navigation = useNavigation();
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const s = createStyles(theme);

  const [tournaments,     setTournaments]     = useState<any[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [scores,          setScores]          = useState<TournamentScore[]>([]);
  const [wods,            setWods]            = useState<any[]>([]);
  const [participants,    setParticipants]    = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [tab,             setTab]             = useState<'leaderboard' | 'participants' | 'validate'>('leaderboard');
  const [filterStatus,    setFilterStatus]    = useState<'all' | 'pending' | 'validated' | 'rejected'>('all');
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [rankFrom,        setRankFrom]        = useState('1');
  const [rankTo,          setRankTo]          = useState('');
  const [closingTourn,    setClosingTourn]    = useState(false);
  const [aiLoading,       setAiLoading]       = useState<string | null>(null);
  const [rejectModal,     setRejectModal]     = useState<TournamentScore | null>(null);
  const [rejectReason,    setRejectReason]    = useState('');
  const [aiModal,         setAiModal]         = useState<{ score: TournamentScore; analysis: string } | null>(null);

  // ── Load tournaments list ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentBox) { setLoading(false); return; }
    supabase.from('tournaments')
      .select('id, name, status, end_date')
      .eq('box_id', currentBox.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTournaments(data ?? []);
        if (data && data.length > 0) setSelectedId(data[0].id);
        setLoading(false);
      });
  }, [currentBox]);

  // ── Load tournament data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedId) return;

    // Auto-close: if end_date has passed and tournament not yet completed
    const currentTourn = tournaments.find(tt => tt.id === selectedId);
    if (currentTourn && currentTourn.status !== 'completed' && currentTourn.end_date) {
      const endDate = new Date(currentTourn.end_date + 'T00:00:00');
      endDate.setDate(endDate.getDate() + 1); // end of end_date day
      if (new Date() >= endDate) {
        try {
          await performTournamentClose(selectedId);
          setTournaments(prev => prev.map(tt => tt.id === selectedId ? { ...tt, status: 'completed' } : tt));
        } catch (e) {
          // Refus nommé de la RPC (scores en attente, tableau non terminé…) : le
          // tournoi reste ouvert, le gérant clôture à la main quand c'est prêt.
          captureError(e, { screen: 'BOTournament', action: 'autoClose' });
        }
      }
    }

    const [{ data: sc }, { data: tw }, { data: tp }] = await Promise.all([
      supabase.from('tournament_scores')
        .select('*, tw:tournament_wods(title, type, movements), t:tournaments(name)')
        .eq('tournament_id', selectedId)
        .order('submitted_at', { ascending: false }),
      supabase.from('tournament_wods').select('*').eq('tournament_id', selectedId).order('order_index'),
      supabase.from('tournament_participants')
        .select('athlete_id, score, created_at')
        .eq('tournament_id', selectedId)
        .order('created_at', { ascending: true }),
    ]);

    // ── Separate profile fetch ─────────────────────────────────────────────────
    const scoreList = sc ?? [];
    const partList  = tp ?? [];
    const ids = [...new Set([
      ...scoreList.map((s: any) => s.athlete_id),
      ...partList.map((p: any)  => p.athlete_id),
    ])];
    let profileMap: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, elo, level, box_members(box:boxes(name))')
        .in('id', ids);
      (profs ?? []).forEach((p: any) => { profileMap[p.id] = p; });
    }

    setScores(scoreList.map((s: any) => ({
      ...s,
      profile: profileMap[s.athlete_id] ?? null,
      tw: Array.isArray(s.tw) ? s.tw[0] : s.tw,
    })) as TournamentScore[]);
    setWods(tw ?? []);
    setParticipants(partList.map((p: any) => ({ ...p, profile: profileMap[p.athlete_id] ?? null })));
    setRankTo(String(partList.length));
    setRefreshing(false);
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = {
    total:     scores.length,
    pending:   scores.filter(s => s.status === 'pending').length,
    validated: scores.filter(s => s.status === 'validated').length,
    rejected:  scores.filter(s => s.status === 'rejected').length,
  };

  const selectedTourn = tournaments.find(tt => tt.id === selectedId);

  // ── Kick participant
  async function handleKick(athleteId: string, username: string) {
    Alert.alert(
      t('bo.tournament.kickTitle'),
      t('bo.tournament.kickMsg', { username }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bo.tournament.kick'), style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('tournament_participants')
            .delete()
            .eq('tournament_id', selectedId!)
            .eq('athlete_id', athleteId);
          if (error) { Alert.alert(t('common.error'), error.message); return; }
          loadData();
        }},
      ]
    );
  }

  // ── Recalc leaderboard ────────────────────────────────────────────────────
  async function recalcLeaderboard() {
    if (!selectedId) return;
    const { data: allScores } = await supabase.from('tournament_scores')
      .select('*').eq('tournament_id', selectedId).eq('status', 'validated');
    if (!allScores) return;

    const pointsMap: Record<string, number> = {};
    wods.forEach(wod => {
      const wodScores = (allScores as TournamentScore[]).filter(sc => sc.tournament_wod_id === wod.id);
      const ranked = rankWodScores(wodScores, wod.type);
      ranked.forEach(rs => {
        pointsMap[rs.athlete_id] = (pointsMap[rs.athlete_id] ?? 0) + rs.cfPoints;
      });
    });
    for (const [athleteId, points] of Object.entries(pointsMap)) {
      await supabase.from('tournament_participants')
        .update({ score: points })
        .eq('tournament_id', selectedId)
        .eq('athlete_id', athleteId);
    }
  }

  // ── Validate score ────────────────────────────────────────────────────────
  async function handleValidate(score: TournamentScore) {
    // Règle du tournoi : si la preuve vidéo est exigée, un score sans vidéo ne peut pas
    // être validé — même garde que sur l'écran tournoi (les deux chemins doivent être
    // cohérents ; avant, cet écran laissait passer avec un simple avertissement).
    const currentTourn = tournaments.find(tt => tt.id === selectedId);
    if (currentTourn?.require_video_proof && !score.video_url) {
      Alert.alert(t('common.error'), t('bo.tournament.noVideo'));
      return;
    }
    Alert.alert(t('bo.tournament.validateTitle'), `${score.profile?.username} — ${formatScoreDisplay(score.score_value, (score.tw as any)?.type, (score.tw as any)?.reps_per_round, score.capped)}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('bo.tournament.validate'), onPress: async () => {
        const { error } = await supabase.from('tournament_scores').update({
          status: 'validated', validated_at: new Date().toISOString(),
        }).eq('id', score.id);
        if (error) { Alert.alert(t('common.error'), error.message); return; }

        // Update movement rep counts + badges.
        // Reps are scaled by the athlete's actual score (e.g. an AMRAP score of 250
        // distributes across the round structure), not the per-line reps of one round.
        const movements: string[] = (score.tw as any)?.movements ?? [];
        const wodType: string = (score.tw as any)?.type ?? '';
        const scoreNumeric = parseScoreToNumber(score.score_value, wodType);
        const scoreType = wodType === 'For Time' ? 'time' : 'reps';
        const completed = computeCompletedMovements(movements, wodType, scoreNumeric, scoreType);
        const newBadges: string[] = [];
        for (const entry of completed) {
          const reps = entry.reps;
          if (!reps || reps <= 0) continue;
          const { key, label } = normalizeMovement(entry.name);

          const { data: existing } = await supabase.from('movement_rep_counts')
            .select('id, total_reps').eq('athlete_id', score.athlete_id).eq('movement_key', key).maybeSingle();

          const newTotal = (existing?.total_reps ?? 0) + reps;
          if (existing) {
            await supabase.from('movement_rep_counts')
              .update({ total_reps: newTotal, last_updated: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await supabase.from('movement_rep_counts')
              .insert({ athlete_id: score.athlete_id, movement_key: key, movement_label: label, total_reps: newTotal });
          }
          const crossed = await movementBadgesCrossed(key, existing?.total_reps ?? 0, newTotal);
          for (const badge of crossed) {
            const { error: badgeErr } = await supabase.from('athlete_badges')
              .upsert({ athlete_id: score.athlete_id, badge_key: badge.badge_key }, { onConflict: 'athlete_id,badge_key', ignoreDuplicates: true });
            if (badgeErr) { captureError(badgeErr, { screen: 'BOTournament', action: 'awardMovementBadge' }); continue; }
            newBadges.push(`${badge.icon} ${badge.title}`);
          }
        }

        await recalcLeaderboard();
        const msg = newBadges.length > 0
          ? '\n\n' + t('bo.tournament.newBadge', { username: score.profile?.username, badges: newBadges.join('\n') })
          : '';
        Alert.alert(t('bo.tournament.scoreValidated'), t('bo.tournament.scoreValidatedMsg', { username: score.profile?.username }) + msg);
        loadData();
      }},
    ]);
  }

  // ── Reject score ──────────────────────────────────────────────────────────
  async function confirmReject() {
    if (!rejectModal) return;
    const { error } = await supabase.from('tournament_scores').update({
      status: 'rejected', notes: rejectReason || null,
    }).eq('id', rejectModal.id);
    setRejectModal(null);
    setRejectReason('');
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    loadData();
  }

  // ── AI analysis ───────────────────────────────────────────────────────────
  async function runAI(score: TournamentScore) {
    setAiLoading(score.id);
    try {
      // The Anthropic call runs server-side (Edge Function) so the API key
      // never ships in the client bundle. The function fetches the score
      // details itself and persists the analysis.
      const { data, error } = await supabase.functions.invoke('analyze-tournament-score', {
        body: { score_id: score.id },
      });
      if (error) throw error;
      const analysis: string = data?.analysis ?? t('bo.tournament.analysisUnavailable');
      setAiLoading(null);
      setAiModal({ score: { ...score, ai_analysis: analysis }, analysis });
      loadData();
    } catch (e: any) {
      captureError(e, { screen: 'BOTournament', action: 'aiAnalysis' });
      setAiLoading(null);
      Alert.alert(t('bo.tournament.aiError'), e?.message ?? t('bo.tournament.apiUnreachable'));
    }
  }

  // ── Core tournament close: compute ELO, gamification, notifications ──────
  async function performTournamentClose(tournId: string): Promise<{ name: string; rank: number; change: number }[]> {
    // Une seule écriture, côté serveur : classement (tous formats), historique
    // ELO, profils et statut dans la même transaction. Le client ne fournit
    // aucune valeur d'ELO et n'écrit ni profiles ni tournament_elo_history.
    // Seconde clôture : la RPC refuse (TOURNOI_DEJA_CLOTURE), rien n'est redistribué.
    const { data: eloRows, error: eloErr } = await supabase.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
    if (eloErr) {
      if (/TOURNOI_DEJA_CLOTURE/.test(eloErr.message)) return [];
      captureError(eloErr, { screen: 'BOTournament', action: 'finalizeElo' });
      throw eloErr;
    }
    const nameMap: Record<string, string> = {};
    (eloRows ?? []).forEach(r => { nameMap[r.athlete_id] = r.username ?? '?'; });

    const eloChanges: { name: string; rank: number; change: number }[] = (eloRows ?? [])
      .sort((a, b) => a.final_rank - b.final_rank)
      .map(r => ({ name: nameMap[r.athlete_id] ?? '?', rank: r.final_rank, change: r.elo_change }));

    for (const r of (eloRows ?? [])) {
      await syncLevelAndBadges(r.athlete_id, r.elo_after);
    }

    // Send push notifications to all participants
    const tournName = tournaments.find(tt => tt.id === tournId)?.name ?? t('bo.tournament.tournamentFallback');
    sendTournamentClosedNotification(
      tournId,
      tournName,
      (eloRows ?? []).map(r => ({ athleteId: r.athlete_id, change: r.elo_change })),
    ).catch(e => captureError(e, { action: 'syncLevelAndBadges' }));

    // Gamification: increment counters + award badges
    for (const r of (eloRows ?? [])) {
      incrementCounter(r.athlete_id, 'total_tournaments', 1, currentBox?.id).catch(e => captureError(e, { action: 'incrementTournaments' }));
      if (r.final_rank === 1) incrementCounter(r.athlete_id, 'total_tournament_wins', 1, currentBox?.id).catch(e => captureError(e, { action: 'incrementTournamentWins' }));
      if (r.final_rank <= 3) {
        supabase.from('athlete_badges').upsert(
          { athlete_id: r.athlete_id, badge_key: 'podium' },
          { onConflict: 'athlete_id,badge_key' },
        ).then(() => {});
      }
      checkAndAwardBadges(r.athlete_id, { elo: r.elo_after }).catch(e => captureError(e, { action: 'checkBadges' }));
    }

    return eloChanges;
  }

  // ── Close tournament (manual) + ELO ─────────────────────────────────────
  async function handleCloseTournament() {
    if (!selectedId) return;
    if (stats.pending > 0) {
      Alert.alert(t('bo.tournament.pendingScores'), t('bo.tournament.pendingScoresMsg', { count: stats.pending }));
      return;
    }
    Alert.alert(
      t('bo.tournament.closeTitle'),
      t('bo.tournament.closeMsg'),
      [{ text: t('common.cancel'), style: 'cancel' }, {
        text: t('bo.tournament.close'), style: 'destructive', onPress: async () => {
          setClosingTourn(true);
          let eloChanges: { name: string; rank: number; change: number }[];
          try {
            eloChanges = await performTournamentClose(selectedId);
          } catch (e) {
            setClosingTourn(false);
            Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
            return;
          }
          setClosingTourn(false);
          setTournaments(prev => prev.map(tt => tt.id === selectedId ? { ...tt, status: 'completed' } : tt));

          if (eloChanges.length === 0) {
            Alert.alert(t('bo.tournament.closed'), t('bo.tournament.notEnoughParticipants'));
          } else {
            const recap = eloChanges.slice(0, 5).map(e =>
              `${e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`} ${e.name}: ${e.change >= 0 ? '+' : ''}${e.change} ELO`
            ).join('\n');
            Alert.alert(t('bo.tournament.closedSuccess'), t('bo.tournament.eloDistributed', { recap }) + '\n' + (eloChanges.length > 5 ? t('bo.tournament.andOthers', { count: eloChanges.length - 5 }) : ''));
          }
          loadData();
        },
      }],
    );
  }

  // ── Build leaderboard ─────────────────────────────────────────────────────
  function buildLeaderboard() {
    const pointsMap: Record<string, { name: string; level: string; elo: number; totalPts: number; wodResults: Record<string, { rank: number; pts: number }> }> = {};
    participants.forEach(p => {
      pointsMap[p.athlete_id] = { name: p.profile?.username ?? '?', level: p.profile?.level ?? 'rx', elo: p.profile?.elo ?? 1000, totalPts: 0, wodResults: {} };
    });
    wods.forEach(wod => {
      const wodScores = scores.filter(s => s.tournament_wod_id === wod.id);
      const ranked = rankWodScores(wodScores, wod.type);
      ranked.forEach(rs => {
        if (!pointsMap[rs.athlete_id]) return;
        pointsMap[rs.athlete_id].totalPts += rs.cfPoints;
        pointsMap[rs.athlete_id].wodResults[wod.id] = { rank: rs.rank, pts: rs.cfPoints };
      });
    });
    const rows = Object.entries(pointsMap)
      .map(([athleteId, data]) => ({ athleteId, ...data }))
      .sort((a, b) => b.totalPts - a.totalPts);
    const from = Math.max(1, parseInt(rankFrom) || 1) - 1;
    const to   = parseInt(rankTo) || rows.length;
    return rows.slice(from, to);
  }

  // ── Filtered scores ───────────────────────────────────────────────────────
  const filteredScores = filterStatus === 'all' ? scores : scores.filter(s => s.status === filterStatus);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={s.loadingWrap}><ActivityIndicator size="large" color={theme.accent} /></View>
  );

  return (
    <View style={s.container}>
      <GlassBackground />
      {/* ── Header ── */}
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color="#fff" size={22} />
        </TouchableOpacity>
        <View style={s.headerTexts}>
          <Text style={s.headerLabel}>{t('bo.tournament.backOffice')}</Text>
          <Text style={s.headerTitle}>{t('bo.tournament.title')}</Text>
        </View>
        {stats.pending > 0 && (
          <View style={s.pendingBadge}><Text style={s.pendingBadgeTxt}>{stats.pending}</Text></View>
        )}
      </LinearGradient>

      {/* ── Tournament selector ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tournamentScroll} contentContainerStyle={s.tournamentScrollContent}>
        {tournaments.map(tn => {
          const pendingCount = tn.id === selectedId ? stats.pending : 0;
          return (
            <TouchableOpacity key={tn.id} onPress={() => setSelectedId(tn.id)}
              style={[s.tournamentChip, tn.id === selectedId && s.tournamentChipActive]}>
              <Text style={[s.tournamentChipTxt, tn.id === selectedId && s.tournamentChipTxtActive]}>
                {tn.name}
              </Text>
              {pendingCount > 0 && (
                <View style={s.chipBadge}><Text style={s.chipBadgeTxt}>{pendingCount}</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Stats ── */}
      <View style={s.statsRow}>
        {[
          { label: t('bo.tournament.statTotal'),     value: stats.total,     color: theme.textSecondary },
          { label: t('bo.tournament.statPending'),   value: stats.pending,   color: theme.warning },
          { label: t('bo.tournament.statValidated'), value: stats.validated, color: theme.success },
          { label: t('bo.tournament.statRejected'),  value: stats.rejected,  color: theme.error },
        ].map(stat => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* ══ Tabs ══ */}
      <View style={s.tabs}>
        {(['leaderboard', 'participants', 'validate'] as const).map(tabKey => (
          <TouchableOpacity key={tabKey} style={[s.tab, tab === tabKey && s.tabActive]} onPress={() => setTab(tabKey)}>
            <Text style={[s.tabTxt, tab === tabKey && s.tabTxtActive]} numberOfLines={1}>
              {tabKey === 'leaderboard' ? t('bo.tournament.tabLeaderboard')
                : tabKey === 'participants' ? `👥 (${participants.length})`
                : `⚖️${stats.pending > 0 ? ` (${stats.pending})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}>

        {/* ══ LEADERBOARD ══ */}
        {tab === 'leaderboard' && (
          <>
            {/* Rank filter */}
            <View style={s.rankFilterRow}>
              <Text style={s.rankFilterLabel}>{t('bo.tournament.fromRank')}</Text>
              <TextInput style={s.rankFilterInput} value={rankFrom} onChangeText={setRankFrom} keyboardType="numeric" />
              <Text style={s.rankFilterLabel}>{t('bo.tournament.toRank')}</Text>
              <TextInput style={s.rankFilterInput} value={rankTo} onChangeText={setRankTo} keyboardType="numeric" />
              <TouchableOpacity onPress={() => { setRankFrom('1'); setRankTo(String(participants.length)); }} style={s.rankResetBtn}>
                <RotateCcw color={theme.textMuted} size={14} />
              </TouchableOpacity>
            </View>

            {/* Recalc button */}
            <TouchableOpacity style={s.recalcBtn} onPress={async () => { await recalcLeaderboard(); await loadData(); Alert.alert('✅', t('bo.tournament.leaderboardRecalculated')); }} activeOpacity={0.8}>
              <RotateCcw color={theme.accent} size={14} />
              <Text style={s.recalcTxt}>{t('bo.tournament.recalcLeaderboard')}</Text>
            </TouchableOpacity>

            {/* Table */}
            {buildLeaderboard().length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>🏆</Text>
                <Text style={s.emptyTxt}>{t('bo.tournament.noParticipantFilter')}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  {/* Header row */}
                  <View style={[s.tableRow, s.tableHeaderRow]}>
                    <Text style={[s.tableCell, s.colRank, s.tableHeaderTxt]}>#</Text>
                    <Text style={[s.tableCell, s.colName, s.tableHeaderTxt]}>{t('bo.tournament.athlete')}</Text>
                    {wods.map(w => (
                      <Text key={w.id} style={[s.tableCell, s.colWod, s.tableHeaderTxt]} numberOfLines={1}>
                        {w.title.slice(0, 8)}
                      </Text>
                    ))}
                    <Text style={[s.tableCell, s.colTotal, s.tableHeaderTxt]}>{t('bo.tournament.total')}</Text>
                  </View>
                  {buildLeaderboard().map((row, i) => {
                    const levelColor = LevelColors[row.level] ?? theme.accent;
                    return (
                      <View key={row.athleteId} style={[s.tableRow, i % 2 === 0 ? s.tableRowEven : s.tableRowOdd]}>
                        <View style={[s.tableCell, s.colRank]}>
                          {i === 0 ? <Text style={s.rankEmoji}>🥇</Text>
                            : i === 1 ? <Text style={s.rankEmoji}>🥈</Text>
                            : i === 2 ? <Text style={s.rankEmoji}>🥉</Text>
                            : <Text style={s.rankNumTxt}>#{i + 1}</Text>}
                        </View>
                        <View style={[s.tableCell, s.colName]}>
                          <Text style={s.athleteName} numberOfLines={1}>{row.name}</Text>
                          <View style={[s.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                            <Text style={[s.levelBadgeTxt, { color: levelColor }]}>{row.level.toUpperCase()}</Text>
                          </View>
                        </View>
                        {wods.map(w => {
                          const res = row.wodResults[w.id];
                          const bg  = !res ? 'transparent' : res.rank === 1 ? `${theme.success}20` : res.rank <= 3 ? `${theme.gold}15` : 'transparent';
                          return (
                            <View key={w.id} style={[s.tableCell, s.colWod, { backgroundColor: bg }]}>
                              {res
                                ? <Text style={s.wodCell}>{`${res.rank === 1 ? '🥇' : res.rank === 2 ? '🥈' : res.rank === 3 ? '🥉' : `#${res.rank}`} ${res.pts}pts`}</Text>
                                : <Text style={s.wodCellEmpty}>—</Text>}
                            </View>
                          );
                        })}
                        <View style={[s.tableCell, s.colTotal]}>
                          <Text style={s.totalPts}>{row.totalPts}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {/* Close tournament button */}
            {selectedTourn?.status !== 'completed' && (
              <TouchableOpacity style={s.closeBtn} onPress={handleCloseTournament}
                disabled={closingTourn} activeOpacity={0.85}>
                {closingTourn
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Lock color="#fff" size={16} /><Text style={s.closeBtnTxt}>{t('bo.tournament.closeTournament')}</Text></>}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ══ PARTICIPANTS ══ */}
        {tab === 'participants' && (
          <>
            <View style={s.partHeader}>
              <Users color={theme.accent} size={14} />
              <Text style={s.partHeaderTxt}>{t('bo.tournament.participantsHeader', { count: participants.length })}</Text>
            </View>
            {participants.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>👥</Text>
                <Text style={s.emptyTxt}>{t('bo.tournament.noParticipant')}</Text>
              </View>
            ) : participants.map((p: any) => {
              const levelColor = LevelColors[p.profile?.level ?? ''] ?? theme.accent;
              const boxName = p.profile?.box_members?.[0]?.box?.name ?? null;
              const regDate = p.created_at
                ? new Date(p.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
              return (
                <View key={p.athlete_id} style={s.partRow}>
                  <View style={[s.partAvatar, { backgroundColor: `${levelColor}25` }]}>
                    <Text style={[s.partAvatarTxt, { color: levelColor }]}>
                      {(p.profile?.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.partInfo}>
                    <View style={s.partNameRow}>
                      <Text style={s.partName}>{p.profile?.username ?? '?'}</Text>
                      {p.profile?.level && (
                        <View style={[s.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                          <Text style={[s.levelBadgeTxt, { color: levelColor }]}>
                            {p.profile.level.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={s.partMeta}>
                      <Star color={theme.gold} size={10} />
                      <Text style={s.partMetaTxt}>ELO {p.profile?.elo ?? 1000}</Text>
                      {boxName && (
                        <><Text style={s.partMetaDot}>·</Text>
                        <Text style={s.partMetaTxt}>{boxName}</Text></>
                      )}
                    </View>
                    <Text style={s.partDate}>{t('bo.tournament.registeredOn', { date: regDate })}</Text>
                  </View>
                  <TouchableOpacity style={s.kickBtn}
                    onPress={() => handleKick(p.athlete_id, p.profile?.username ?? '?')}
                    activeOpacity={0.7}>
                    <UserX color={theme.error} size={16} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {/* ══ VALIDATE ══ */}
        {tab === 'validate' && (
          <>
            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {(['all', 'pending', 'validated', 'rejected'] as const).map(f => (
                <TouchableOpacity key={f} onPress={() => setFilterStatus(f)}
                  style={[s.filterChip, filterStatus === f && s.filterChipActive]}>
                  <Text style={[s.filterChipTxt, filterStatus === f && s.filterChipTxtActive]}>
                    {f === 'all' ? t('bo.tournament.filterAll') : f === 'pending' ? t('bo.tournament.filterPending', { count: stats.pending }) : f === 'validated' ? t('bo.tournament.filterValidated') : t('bo.tournament.filterRejected')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredScores.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>📋</Text>
                <Text style={s.emptyTxt}>{t('bo.tournament.noScoreCategory')}</Text>
              </View>
            ) : filteredScores.map(score => {
              const isExpanded = expandedId === score.id;
              const levelColor = LevelColors[score.profile?.level ?? ''] ?? theme.accent;
              return (
                <View key={score.id} style={s.scoreCard}>
                  {/* Card header (always visible) */}
                  <TouchableOpacity
                    style={s.scoreCardHeader}
                    onPress={() => setExpandedId(isExpanded ? null : score.id)}
                    activeOpacity={0.8}>
                    <View style={[s.scoreAvatar, { backgroundColor: `${levelColor}20` }]}>
                      <Text style={[s.scoreAvatarTxt, { color: levelColor }]}>
                        {(score.profile?.username ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.scoreCardInfo}>
                      <View style={s.scoreCardRow}>
                        <Text style={s.scoreAthleteNm}>{score.profile?.username ?? '?'}</Text>
                        <View style={[s.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                          <Text style={[s.levelBadgeTxt, { color: levelColor }]}>
                            {(score.profile?.level ?? 'rx').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.scoreWodNm} numberOfLines={1}>{score.tw?.title ?? ''} · {score.tw?.type ?? ''}</Text>
                      <View style={s.scoreCardRow}>
                        <Text style={s.scoreDate}>{formatDateTime(score.submitted_at)}</Text>
                        <Text style={s.scoreValue}>{formatScoreDisplay(score.score_value, score.tw?.type, (score.tw as any)?.reps_per_round, score.capped)}</Text>
                      </View>
                    </View>
                    <View style={s.scoreCardRight}>
                      <StatusPill status={score.status} theme={theme} />
                      {isExpanded
                        ? <ChevronUp color={theme.textMuted} size={16} />
                        : <ChevronDown color={theme.textMuted} size={16} />}
                    </View>
                  </TouchableOpacity>

                  {/* Expandable body */}
                  {isExpanded && (
                    <View style={s.scoreCardBody}>
                      {score.notes ? (
                        <View style={s.scoreNote}>
                          <Text style={s.scoreNoteLabel}>{t('bo.tournament.athleteNotes')}</Text>
                          <Text style={s.scoreNoteTxt}>{score.notes}</Text>
                        </View>
                      ) : null}
                      {score.tiebreak_value != null && (
                        <Text style={s.tiebreakTxt}>{t('bo.tournament.tiebreak', { value: score.tiebreak_value })}</Text>
                      )}
                      {score.deadline_at && (
                        <Text style={s.deadlineTxt}>
                          <Clock color={theme.textMuted} size={12} /> {t('bo.tournament.deadline', { date: formatDateTime(score.deadline_at) })}
                        </Text>
                      )}

                      {/* YouTube */}
                      {score.video_url ? (
                        <TouchableOpacity style={s.ytBtn} onPress={() => Linking.openURL(score.video_url!)} activeOpacity={0.85}>
                          <Youtube color="#FF0000" size={16} />
                          <Text style={s.ytBtnTxt}>{t('bo.tournament.watchYoutube')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={s.ytWarning}>
                          <AlertTriangle color={theme.error} size={14} />
                          <Text style={s.ytWarningTxt}>{t('bo.tournament.noVideo')}</Text>
                        </View>
                      )}

                      {/* AI analysis preview — désactivé (clé Anthropic retirée) */}
                      {/* {score.ai_analysis ? (
                        <View style={s.aiPreview}>
                          <Text style={s.aiPreviewLabel}>🤖 Analyse IA</Text>
                          <Text style={s.aiPreviewTxt} numberOfLines={3}>{score.ai_analysis}</Text>
                          <TouchableOpacity onPress={() => setAiModal({ score, analysis: score.ai_analysis! })}>
                            <Text style={s.aiPreviewMore}>Voir tout →</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null} */}

                      {/* Action buttons */}
                      {score.status === 'pending' && (
                        <View style={s.actionRow}>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${theme.success}15`, borderColor: `${theme.success}30` }]}
                            onPress={() => handleValidate(score)} activeOpacity={0.8}>
                            <CheckCircle color={theme.success} size={16} />
                            <Text style={[s.actionBtnTxt, { color: theme.success }]}>{t('bo.tournament.validate')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}30` }]}
                            onPress={() => { setRejectModal(score); setRejectReason(''); }} activeOpacity={0.8}>
                            <XCircle color={theme.error} size={16} />
                            <Text style={[s.actionBtnTxt, { color: theme.error }]}>{t('bo.tournament.reject')}</Text>
                          </TouchableOpacity>
                          {/* Bouton IA désactivé (clé Anthropic retirée)
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${theme.accent}10`, borderColor: `${theme.accent}20`, flex: 1.2 }]}
                            onPress={() => runAI(score)} disabled={aiLoading === score.id} activeOpacity={0.8}>
                            {aiLoading === score.id
                              ? <ActivityIndicator size="small" color={theme.accent} />
                              : <><Bot color={theme.accent} size={15} /><Text style={[s.actionBtnTxt, { color: theme.accent }]}>Évaluation du score</Text></>}
                          </TouchableOpacity>
                          */}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Reject modal ── */}
      <Modal visible={!!rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>{t('bo.tournament.rejectScore')}</Text>
            <Text style={s.modalSub}>{rejectModal?.profile?.username} — {rejectModal ? formatScoreDisplay(rejectModal.score_value, (rejectModal.tw as any)?.type, (rejectModal.tw as any)?.reps_per_round, rejectModal.capped) : ''}</Text>
            <TextInput
              style={s.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t('bo.tournament.rejectReasonPlaceholder')}
              placeholderTextColor={theme.textMuted}
              multiline
            />
            <TouchableOpacity style={s.rejectConfirmBtn} onPress={confirmReject} activeOpacity={0.85}>
              <Text style={s.rejectConfirmTxt}>{t('bo.tournament.confirmReject')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRejectModal(null)}>
              <Text style={s.modalCancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── AI analysis modal — désactivé (clé Anthropic retirée) ──
      <Modal visible={!!aiModal} transparent animationType="slide" onRequestClose={() => setAiModal(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>🤖 Évaluation du score</Text>
            <Text style={s.modalSub}>{aiModal?.score.profile?.username} — {aiModal?.score.score_value}</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <Text style={s.aiAnalysisTxt}>{aiModal?.analysis}</Text>
            </ScrollView>
            <View style={[s.aiWarningBox, { marginTop: 12 }]}>
              <AlertTriangle color={theme.warning} size={14} />
              <Text style={s.aiWarningTxt}>
                Analyse basée sur le score déclaré uniquement — vérification vidéo manuelle obligatoire.
              </Text>
            </View>
            {aiModal?.score.video_url ? (
              <TouchableOpacity style={s.ytBtn} onPress={() => Linking.openURL(aiModal!.score.video_url!)} activeOpacity={0.85}>
                <Youtube color="#FF0000" size={16} />
                <Text style={s.ytBtnTxt}>Voir la vidéo</Text>
              </TouchableOpacity>
            ) : null}
            {aiModal?.score.status === 'pending' && (
              <View style={s.actionRow}>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${theme.success}15`, borderColor: `${theme.success}30` }]}
                  onPress={() => { setAiModal(null); if (aiModal) handleValidate(aiModal.score); }} activeOpacity={0.8}>
                  <CheckCircle color={theme.success} size={16} />
                  <Text style={[s.actionBtnTxt, { color: theme.success }]}>Valider</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}30` }]}
                  onPress={() => { setAiModal(null); if (aiModal) { setRejectModal(aiModal.score); setRejectReason(''); } }} activeOpacity={0.8}>
                  <XCircle color={theme.error} size={16} />
                  <Text style={[s.actionBtnTxt, { color: theme.error }]}>Rejeter</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setAiModal(null)}>
              <Text style={s.modalCancelTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      */}
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container:   { flex: 1, backgroundColor: 'transparent' },
  loadingWrap: { flex: 1, backgroundColor: t.background, justifyContent: 'center', alignItems: 'center' },

  header:      { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTexts: { flex: 1 },
  headerLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  pendingBadge:    { backgroundColor: t.warning, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeTxt: { fontSize: 13, fontWeight: '900', color: '#fff' },

  tournamentScroll:        { backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
  tournamentScrollContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tournamentChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  tournamentChipActive:    { backgroundColor: t.accent, borderColor: t.accent },
  tournamentChipTxt:       { fontSize: 12, fontWeight: '700', color: t.textSecondary },
  tournamentChipTxtActive: { color: '#fff' },
  chipBadge:    { backgroundColor: t.warning, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  chipBadgeTxt: { fontSize: 10, fontWeight: '900', color: '#fff' },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  statCard:  { flex: 1, backgroundColor: t.card, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: t.border },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 10, color: t.textMuted, fontWeight: '700', marginTop: 2 },

  tabs:       { flexDirection: 'row', backgroundColor: t.card, marginHorizontal: 12, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: t.border, marginBottom: 4 },
  tab:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive:  { backgroundColor: t.accent },
  tabTxt:     { fontSize: 13, fontWeight: '700', color: t.textMuted },
  tabTxtActive:{ color: '#fff' },

  content: { padding: 12, paddingTop: 8, paddingBottom: 140 },

  rankFilterRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rankFilterLabel: { fontSize: 12, color: t.textMuted, fontWeight: '600' },
  rankFilterInput: { backgroundColor: t.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '800', color: t.text, borderWidth: 1, borderColor: t.border, width: 48, textAlign: 'center' },
  rankResetBtn:    { padding: 6 },
  recalcBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, marginBottom: 12 },
  recalcTxt:       { fontSize: 12, fontWeight: '700', color: t.accent },

  tableRow:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: t.border },
  tableHeaderRow: { backgroundColor: t.surface },
  tableRowEven:   { backgroundColor: t.card },
  tableRowOdd:    { backgroundColor: t.background },
  tableCell:      { paddingHorizontal: 8, paddingVertical: 10, justifyContent: 'center' },
  tableHeaderTxt: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.8 },
  colRank:   { width: 48 },
  colName:   { width: 120, gap: 3 },
  colWod:    { width: 90, borderRadius: 4 },
  colTotal:  { width: 70 },
  rankEmoji: { fontSize: 18 },
  rankNumTxt:{ fontSize: 13, fontWeight: '800', color: t.textSecondary },
  athleteName:    { fontSize: 12, fontWeight: '800', color: t.text },
  levelBadge:     { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  levelBadgeTxt:  { fontSize: 9, fontWeight: '800' },
  wodCell:        { fontSize: 11, fontWeight: '700', color: t.text },
  wodCellEmpty:   { fontSize: 12, color: t.textMuted, textAlign: 'center' },
  totalPts:       { fontSize: 15, fontWeight: '900', color: t.accent, textAlign: 'center' },

  closeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: t.error, borderRadius: 14, padding: 15, marginTop: 16 },
  closeBtnTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },

  filterRow:       { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  filterChip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  filterChipActive:{ backgroundColor: t.accent, borderColor: t.accent },
  filterChipTxt:   { fontSize: 12, fontWeight: '700', color: t.textMuted },
  filterChipTxtActive: { color: '#fff' },

  scoreCard:       { backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.border, marginBottom: 10, overflow: 'hidden' },
  scoreCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  scoreAvatar:     { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scoreAvatarTxt:  { fontSize: 18, fontWeight: '900' },
  scoreCardInfo:   { flex: 1, gap: 3 },
  scoreCardRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreAthleteNm:  { fontSize: 14, fontWeight: '800', color: t.text },
  scoreWodNm:      { fontSize: 11, color: t.textMuted },
  scoreDate:       { fontSize: 11, color: t.textMuted },
  scoreValue:      { fontSize: 14, fontWeight: '900', color: t.accent },
  scoreCardRight:  { alignItems: 'flex-end', gap: 6 },

  scoreCardBody: { padding: 12, paddingTop: 0, gap: 10, borderTopWidth: 1, borderTopColor: t.border },
  scoreNote:     { backgroundColor: t.surface, borderRadius: 10, padding: 10, gap: 4 },
  scoreNoteLabel:{ fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 1 },
  scoreNoteTxt:  { fontSize: 13, color: t.textSecondary, lineHeight: 20 },
  tiebreakTxt:   { fontSize: 12, color: t.textSecondary },
  deadlineTxt:   { fontSize: 12, color: t.textMuted },

  ytBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${t.error}10`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${t.error}20` },
  ytBtnTxt:     { fontSize: 13, fontWeight: '700', color: '#FF0000' },
  ytWarning:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${t.error}10`, borderRadius: 8, padding: 10 },
  ytWarningTxt: { fontSize: 12, color: t.error, fontWeight: '600' },

  aiPreview:      { backgroundColor: `${t.accent}08`, borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: `${t.accent}15` },
  aiPreviewLabel: { fontSize: 10, fontWeight: '800', color: t.accent, letterSpacing: 1 },
  aiPreviewTxt:   { fontSize: 12, color: t.textSecondary, lineHeight: 18 },
  aiPreviewMore:  { fontSize: 12, color: t.accent, fontWeight: '700', marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 10, borderWidth: 1 },
  actionBtnTxt:  { fontSize: 12, fontWeight: '800' },

  emptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTxt:   { fontSize: 13, color: t.textMuted, textAlign: 'center' },
  partHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${t.accent}10`, borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: `${t.accent}20` },
  partHeaderTxt: { fontSize: 12, color: t.accent, fontWeight: '600', flex: 1 },
  partRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: t.border },
  partAvatar:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  partAvatarTxt: { fontSize: 18, fontWeight: '900' },
  partInfo:      { flex: 1, gap: 2 },
  partNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partName:      { fontSize: 14, fontWeight: '800', color: t.text },
  partMeta:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  partMetaTxt:   { fontSize: 11, color: t.textSecondary },
  partMetaDot:   { fontSize: 11, color: t.textMuted },
  partDate:      { fontSize: 10, color: t.textMuted, marginTop: 1 },
  kickBtn:       { width: 34, height: 34, borderRadius: 9, backgroundColor: `${t.error}12`, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: `${t.error}30` },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, borderWidth: 1, borderColor: t.border },
  modalTitle:     { fontSize: 17, fontWeight: '900', color: t.text },
  modalSub:       { fontSize: 13, color: t.textMuted },
  rejectInput:    { backgroundColor: t.surface, borderRadius: 12, padding: 14, fontSize: 13, color: t.text, borderWidth: 1, borderColor: t.border, minHeight: 80, textAlignVertical: 'top' },
  rejectConfirmBtn:{ backgroundColor: t.error, borderRadius: 14, padding: 15, alignItems: 'center' },
  rejectConfirmTxt:{ color: '#fff', fontSize: 15, fontWeight: '900' },
  modalCancelBtn: { alignItems: 'center', padding: 12 },
  modalCancelTxt: { fontSize: 14, color: t.textMuted, fontWeight: '700' },

  aiAnalysisTxt: { fontSize: 13, color: t.textSecondary, lineHeight: 22 },
  aiWarningBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${t.warning}12`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${t.warning}25` },
  aiWarningTxt:  { fontSize: 12, color: t.warning, lineHeight: 18, flex: 1 },
}); }
