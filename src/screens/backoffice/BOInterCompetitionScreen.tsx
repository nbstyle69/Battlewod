import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import {
  Plus, Globe2, CheckCircle, XCircle, Play, Youtube,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { syncLevelAndBadges } from '../../utils/eloLevels';
import {
  sendInterWodRevealedNotification,
  sendInterBracketResultNotification,
  sendInterCompetitionClosedNotification,
} from '../../services/notifications';
import {
  trackInterCompCreate, trackInterCompClose,
  trackBracketGenerate, trackBracketResolve,
  trackLeagueRoundCreate, trackPoolGenerate,
  trackPoolMatchResolve, trackSwissRoundGenerate, trackSwissPairingResolve,
} from '../../lib/analytics';
import { BracketTab, LeagueTab, PoolTab, SwissTab } from './inter-competition';
import {
  InterCompetition, InterWod, InterScore, BracketMatch,
  PoolGroup, PoolMember, PoolMatch,
  LeagueRound, LeagueStanding,
  SwissRound, SwissPairing, SwissStanding,
} from './inter-competition';

export default function BOInterCompetitionScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const FORMAT_LABELS: Record<string, string> = {
    league: t('bo.interComp.format.league'),
    bracket: t('bo.interComp.format.bracket'),
    pool: t('bo.interComp.format.pool'),
    swiss: t('bo.interComp.format.swiss'),
  };
  const STATUS_LABELS: Record<string, string> = {
    draft: t('bo.interComp.status.draft'),
    open: t('bo.interComp.status.open'),
    active: t('bo.interComp.status.active'),
    closed: t('bo.interComp.status.closed'),
  };
  const SCORING_LABELS: Record<string, string> = {
    reps: t('bo.interComp.scoring.reps'),
    time: t('bo.interComp.scoring.time'),
    weight: t('bo.interComp.scoring.weight'),
    rounds_reps: t('bo.interComp.scoring.rounds_reps'),
  };

  const [competitions, setCompetitions] = useState<InterCompetition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'wods' | 'scores' | 'bracket' | 'league' | 'pool' | 'swiss'>('wods');

  // Selected competition data
  const [wods, setWods] = useState<InterWod[]>([]);
  const [scores, setScores] = useState<InterScore[]>([]);
  const [bracketMatches, setBracketMatches] = useState<BracketMatch[]>([]);
  const [leagueRounds, setLeagueRounds] = useState<LeagueRound[]>([]);
  const [leagueStandings, setLeagueStandings] = useState<LeagueStanding[]>([]);
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([]);
  const [poolMembers, setPoolMembers] = useState<PoolMember[]>([]);
  const [poolMatches, setPoolMatches] = useState<PoolMatch[]>([]);
  const [swissRounds, setSwissRounds] = useState<SwissRound[]>([]);
  const [swissPairings, setSwissPairings] = useState<SwissPairing[]>([]);
  const [swissStandings, setSwissStandings] = useState<SwissStanding[]>([]);
  const [registrationCount, setRegistrationCount] = useState(0);

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFormat, setNewFormat] = useState<'league' | 'bracket' | 'pool' | 'swiss'>('bracket');
  const [newType, setNewType] = useState<'individual' | 'team'>('individual');
  const [newTeamSize, setNewTeamSize] = useState('2');
  const [creating, setCreating] = useState(false);

  // Add WOD modal
  const [wodModal, setWodModal] = useState(false);
  const [wodTitle, setWodTitle] = useState('');
  const [wodDesc, setWodDesc] = useState('');
  const [wodTimeCap, setWodTimeCap] = useState('');
  const [wodScoring, setWodScoring] = useState<'reps' | 'time' | 'weight' | 'rounds_reps'>('reps');

  // ── Load competitions ─────────────────────────────────────────────────────
  const loadCompetitions = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('inter_competitions')
        .select('*')
        .order('created_at', { ascending: false });
      setCompetitions((data ?? []) as InterCompetition[]);
      if (data && data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch (e) { captureError(e, { screen: 'BOInterCompetition', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadCompetitions(); }, [loadCompetitions]);

  // ── Load selected competition data ────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedId) return;
    const [{ data: w }, { data: sc }, regResult] = await Promise.all([
      supabase.from('inter_competition_wods')
        .select('*').eq('competition_id', selectedId).order('order_index'),
      supabase.from('inter_scores')
        .select('*').eq('competition_id', selectedId).order('submitted_at', { ascending: false }),
      supabase.from('inter_registrations')
        .select('id', { count: 'exact', head: true }).eq('competition_id', selectedId),
    ]);
    setWods((w ?? []) as InterWod[]);
    setRegistrationCount(regResult?.count ?? 0);

    // Enrich scores with usernames
    const scoreList = (sc ?? []) as InterScore[];
    const athleteIds = scoreList.map(s => s.athlete_id).filter(Boolean) as string[];
    if (athleteIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, username').in('id', athleteIds);
      const profMap: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; username: string }) => { profMap[p.id] = p.username; });
      scoreList.forEach(s => { if (s.athlete_id) s.username = profMap[s.athlete_id] ?? '—'; });
    }
    setScores(scoreList);

    const comp = competitions.find(c => c.id === selectedId);

    // Load bracket matches
    if (comp?.format === 'bracket' || comp?.format === 'swiss') {
      const { data: matches } = await supabase
        .from('inter_bracket_matches')
        .select('*')
        .eq('competition_id', selectedId)
        .order('round')
        .order('match_number');
      if (matches && matches.length > 0) {
        const ids: string[] = Array.from(new Set(
          matches.flatMap((m: { participant1_id: string | null; participant2_id: string | null }) => [m.participant1_id, m.participant2_id]).filter(Boolean)
        )) as string[];
        const { data: profs } = await supabase.from('profiles').select('id, username').in('id', ids);
        const profMap: Record<string, string> = {};
        (profs ?? []).forEach((p: { id: string; username: string }) => { profMap[p.id] = p.username; });

        const enriched: BracketMatch[] = (matches as BracketMatch[]).map(m => ({
          ...m,
          p1_username: m.participant1_id ? profMap[m.participant1_id] ?? '—' : 'BYE',
          p2_username: m.participant2_id ? profMap[m.participant2_id] ?? '—' : 'BYE',
          p1_score: scoreList.find(s => s.athlete_id === m.participant1_id && s.wod_id === m.wod_id) ?? null,
          p2_score: scoreList.find(s => s.athlete_id === m.participant2_id && s.wod_id === m.wod_id) ?? null,
        }));
        setBracketMatches(enriched);
      } else {
        setBracketMatches([]);
      }
    }

    // Load league data
    if (comp?.format === 'league') {
      const [{ data: rounds }, { data: standings }] = await Promise.all([
        supabase.from('inter_league_rounds')
          .select('*').eq('competition_id', selectedId).order('round_number'),
        supabase.from('inter_league_standings')
          .select('*').eq('competition_id', selectedId).order('total_points', { ascending: false }),
      ]);
      setLeagueRounds((rounds ?? []) as LeagueRound[]);
      const standingsList = (standings ?? []) as LeagueStanding[];
      const sIds = standingsList.map(s => s.athlete_id).filter(Boolean);
      if (sIds.length > 0) {
        const { data: sprofs } = await supabase.from('profiles').select('id, username').in('id', sIds);
        const sprofMap: Record<string, string> = {};
        (sprofs ?? []).forEach((p: { id: string; username: string }) => { sprofMap[p.id] = p.username; });
        standingsList.forEach(s => { s.username = sprofMap[s.athlete_id] ?? '—'; });
      }
      setLeagueStandings(standingsList);
    }

    // Load pool data
    if (comp?.format === 'pool') {
      const [{ data: groups }, { data: members }, { data: pMatches }] = await Promise.all([
        supabase.from('inter_pool_groups')
          .select('*').eq('competition_id', selectedId).order('group_index'),
        supabase.from('inter_pool_members')
          .select('*'),
        supabase.from('inter_pool_matches')
          .select('*').eq('competition_id', selectedId).order('group_id'),
      ]);
      setPoolGroups((groups ?? []) as PoolGroup[]);
      const groupIds = (groups ?? []).map((g: { id: string }) => g.id);
      const compMembers = ((members ?? []) as PoolMember[]).filter(m => groupIds.includes(m.group_id));
      const pmIds = [...new Set([
        ...compMembers.map(m => m.athlete_id),
        ...(pMatches ?? []).flatMap((m: { athlete1_id: string; athlete2_id: string }) => [m.athlete1_id, m.athlete2_id]),
      ])].filter(Boolean);
      const pmProfMap: Record<string, string> = {};
      if (pmIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username').in('id', pmIds);
        (profs ?? []).forEach((p: { id: string; username: string }) => { pmProfMap[p.id] = p.username; });
      }
      compMembers.forEach(m => { m.username = pmProfMap[m.athlete_id] ?? '—'; });
      setPoolMembers(compMembers);
      const enrichedMatches: PoolMatch[] = ((pMatches ?? []) as PoolMatch[]).map(m => ({
        ...m,
        a1_username: pmProfMap[m.athlete1_id] ?? '—',
        a2_username: pmProfMap[m.athlete2_id] ?? '—',
      }));
      setPoolMatches(enrichedMatches);
    }

    // Load swiss data
    if (comp?.format === 'swiss') {
      const [{ data: rounds }, { data: pairings }, { data: standings }] = await Promise.all([
        supabase.from('inter_swiss_rounds')
          .select('*').eq('competition_id', selectedId).order('round_number'),
        supabase.from('inter_swiss_pairings')
          .select('*').eq('competition_id', selectedId),
        supabase.from('inter_swiss_standings')
          .select('*').eq('competition_id', selectedId).order('points', { ascending: false }),
      ]);
      setSwissRounds((rounds ?? []) as SwissRound[]);
      const swIds = [...new Set([
        ...(pairings ?? []).flatMap((p: { athlete1_id: string; athlete2_id: string | null }) => [p.athlete1_id, p.athlete2_id]),
        ...(standings ?? []).map((s: { athlete_id: string }) => s.athlete_id),
      ])].filter(Boolean) as string[];
      const swProfMap: Record<string, string> = {};
      if (swIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username').in('id', swIds);
        (profs ?? []).forEach((p: { id: string; username: string }) => { swProfMap[p.id] = p.username; });
      }
      const enrichedPairings: SwissPairing[] = ((pairings ?? []) as SwissPairing[]).map(p => ({
        ...p,
        a1_username: swProfMap[p.athlete1_id] ?? '—',
        a2_username: p.athlete2_id ? swProfMap[p.athlete2_id] ?? '—' : 'BYE',
      }));
      setSwissPairings(enrichedPairings);
      const enrichedStandings: SwissStanding[] = ((standings ?? []) as SwissStanding[]).map(s => ({
        ...s,
        username: swProfMap[s.athlete_id] ?? '—',
      }));
      setSwissStandings(enrichedStandings);
    }
  }, [selectedId, competitions]);

  useEffect(() => { loadData(); }, [loadData]);

  const selected = competitions.find(c => c.id === selectedId);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newTitle.trim()) { Alert.alert(t('common.error'), t('bo.interComp.titleRequired')); return; }
    setCreating(true);
    const { data, error } = await supabase.from('inter_competitions').insert({
      title: newTitle.trim(),
      format: newFormat,
      type: newType,
      team_size: newType === 'team' ? parseInt(newTeamSize) || 2 : 1,
      status: 'draft',
      created_by: user?.id,
    }).select().single();
    setCreating(false);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    trackInterCompCreate(newFormat, newType);
    setCreateModal(false);
    setNewTitle('');
    setSelectedId(data.id);
    loadCompetitions();
  }

  async function handleChangeStatus(newStatus: string) {
    if (!selectedId) return;
    if (newStatus === 'closed') { await handleCloseCompetition(); return; }
    const { error } = await supabase.from('inter_competitions')
      .update({ status: newStatus }).eq('id', selectedId);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setCompetitions(prev => prev.map(c => c.id === selectedId ? { ...c, status: newStatus as InterCompetition['status'] } : c));
  }

  async function handleCloseCompetition() {
    if (!selectedId) return;
    Alert.alert(
      t('bo.interComp.closeConfirmTitle'),
      t('bo.interComp.closeConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bo.interComp.close'), style: 'destructive', onPress: async () => {
          try {
            // ELO is computed and persisted entirely server-side (idempotent,
            // authorized, atomic). The client only triggers the close.
            const { data: eloRows, error: eloErr } = await supabase.rpc(
              'compute_inter_competition_elo', { p_competition_id: selectedId },
            );
            if (eloErr) {
              captureError(eloErr, { screen: 'BOInterCompetition', action: 'computeElo' });
              Alert.alert(t('common.error'), eloErr.message ?? t('bo.interComp.closeError'));
              return;
            }

            setCompetitions(prev => prev.map(c => c.id === selectedId ? { ...c, status: 'closed' } : c));

            const results = eloRows ?? [];
            for (const r of results) {
              await syncLevelAndBadges(r.athlete_id, r.elo_after);
            }

            const comp = competitions.find(c => c.id === selectedId);
            trackInterCompClose(selectedId!, comp?.format ?? 'unknown', results.length);

            if (results.length === 0) {
              Alert.alert(t('bo.interComp.closedNoScore'));
              return;
            }

            const winner = results.find(r => r.final_rank === 1);
            const topDelta = winner ? `+${winner.elo_change}` : '';
            Alert.alert(t('bo.interComp.closedTitle'), t('bo.interComp.closedMsg', { n: results.length, delta: topDelta }));
            if (comp && selectedId) {
              const eloChanges = results.map(r => ({ athleteId: r.athlete_id, delta: r.elo_change }));
              sendInterCompetitionClosedNotification(selectedId, comp.title, eloChanges).catch(() => {});
            }
          } catch (e: unknown) {
            captureError(e, { screen: 'BOInterCompetition', action: 'close' });
            Alert.alert(t('common.error'), (e as Error)?.message ?? t('bo.interComp.closeError'));
          }
        }},
      ]
    );
  }

  async function handleAddWod() {
    if (!wodTitle.trim() || !selectedId) { Alert.alert(t('common.error'), t('bo.interComp.titleRequired')); return; }
    const { error } = await supabase.from('inter_competition_wods').insert({
      competition_id: selectedId,
      title: wodTitle.trim(),
      description: wodDesc.trim() || null,
      time_cap: wodTimeCap ? parseInt(wodTimeCap) : null,
      scoring_type: wodScoring,
      order_index: wods.length + 1,
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setWodModal(false);
    setWodTitle(''); setWodDesc(''); setWodTimeCap('');
    loadData();
  }

  async function handleRevealWod(wodId: string) {
    const { error } = await supabase.from('inter_competition_wods')
      .update({ revealed_at: new Date().toISOString() }).eq('id', wodId);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    loadData();
    const comp = competitions.find(c => c.id === selectedId);
    const wod = wods.find(w => w.id === wodId);
    if (comp && wod && selectedId) {
      sendInterWodRevealedNotification(selectedId, comp.title, wod.title).catch(() => {});
    }
  }

  async function handleValidateScore(scoreId: string) {
    const { error } = await supabase.from('inter_scores')
      .update({ status: 'validated', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', scoreId);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    loadData();
  }

  async function handleRejectScore(scoreId: string) {
    Alert.alert(t('bo.interComp.rejectScoreTitle'), t('bo.interComp.rejectScoreMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('bo.interComp.reject'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('inter_scores')
          .update({ status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
          .eq('id', scoreId);
        if (error) { Alert.alert(t('common.error'), error.message); return; }
        loadData();
      }},
    ]);
  }

  // ── Bracket handlers ──────────────────────────────────────────────────────

  async function handleGenerateBracket() {
    if (!selectedId) return;
    Alert.alert(
      t('bo.interComp.generateBracketTitle'),
      t('bo.interComp.generateBracketMsg', { count: registrationCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bo.interComp.generate'), onPress: async () => {
          const { error } = await supabase.rpc('generate_inter_bracket_round_1', {
            p_competition_id: selectedId,
          });
          if (error) { Alert.alert(t('common.error'), error.message); return; }
          trackBracketGenerate(selectedId!, registrationCount);
          loadData();
          Alert.alert(t('bo.interComp.bracketGenerated'));
        }},
      ]
    );
  }

  async function handleResolveMatch(match: BracketMatch, winnerId: string) {
    const loserId = winnerId === match.participant1_id ? match.participant2_id : match.participant1_id;
    Alert.alert(
      t('bo.interComp.declareWinnerTitle'),
      t('bo.interComp.winner', { name: winnerId === match.participant1_id ? match.p1_username : match.p2_username }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: async () => {
          const { error } = await supabase.from('inter_bracket_matches')
            .update({ winner_id: winnerId, loser_id: loserId, status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', match.id);
          if (error) { Alert.alert(t('common.error'), error.message); return; }
          trackBracketResolve(selectedId!, match.round);
          loadData();
          const comp = competitions.find(c => c.id === selectedId);
          if (comp) {
            if (winnerId) sendInterBracketResultNotification(winnerId, comp.title, true, match.round).catch(() => {});
            if (loserId) sendInterBracketResultNotification(loserId, comp.title, false, match.round).catch(() => {});
          }
        }},
      ]
    );
  }

  async function handleAdvanceRound() {
    if (!selectedId) return;
    const completedRounds = [...new Set(
      bracketMatches.filter(m => m.status === 'completed' || m.status === 'bye').map(m => m.round)
    )].sort((a, b) => b - a);
    const lastCompleted = completedRounds[0];
    if (!lastCompleted) { Alert.alert(t('bo.interComp.noRoundCompleted')); return; }
    const { error } = await supabase.rpc('advance_inter_bracket_round', {
      p_competition_id: selectedId,
      p_completed_round: lastCompleted,
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    loadData();
    Alert.alert(t('bo.interComp.nextRoundGenerated'));
  }

  // ── League handlers ───────────────────────────────────────────────────────

  async function handleCreateLeagueRound() {
    if (!selectedId) return;
    const nextNumber = leagueRounds.length + 1;
    const availableWod = wods.find(w => !leagueRounds.some(r => r.wod_id === w.id));
    const { error } = await supabase.from('inter_league_rounds').insert({
      competition_id: selectedId,
      round_number: nextNumber,
      title: t('bo.interComp.roundN', { n: nextNumber }),
      wod_id: availableWod?.id ?? null,
      status: 'pending',
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    trackLeagueRoundCreate(selectedId!, nextNumber);
    loadData();
    Alert.alert(t('bo.interComp.roundCreated', { n: nextNumber }));
  }

  async function handleComputeLeagueRound(roundNumber: number) {
    if (!selectedId) return;
    const { data, error } = await supabase.rpc('compute_inter_league_round', {
      p_competition_id: selectedId,
      p_round_number: roundNumber,
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    loadData();
    Alert.alert(t('bo.interComp.pointsComputed', { n: data }));
  }

  // ── Pool handlers ─────────────────────────────────────────────────────────

  async function handleGeneratePool() {
    if (!selectedId) return;
    Alert.alert(
      t('bo.interComp.generatePoolTitle'),
      t('bo.interComp.generatePoolMsg', { count: registrationCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bo.interComp.generate'), onPress: async () => {
          const groupsCount = registrationCount <= 8 ? 2 : registrationCount <= 16 ? 4 : 8;
          const { error } = await supabase.rpc('generate_inter_pool_groups', {
            p_competition_id: selectedId,
            p_groups_count: groupsCount,
            p_advance_count: 2,
          });
          if (error) { Alert.alert(t('common.error'), error.message); return; }
          trackPoolGenerate(selectedId!, groupsCount);
          loadData();
          Alert.alert(t('bo.interComp.poolsGenerated', { n: groupsCount }));
        }},
      ]
    );
  }

  async function handleResolvePoolMatch(match: PoolMatch, s1: number, s2: number) {
    const scoringType = wods[0]?.scoring_type ?? 'reps';
    const { error } = await supabase.rpc('resolve_inter_pool_match', {
      p_match_id: match.id,
      p_score1: s1,
      p_score2: s2,
      p_scoring_type: scoringType,
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    trackPoolMatchResolve(selectedId!);
    loadData();
  }

  // ── Swiss handlers ────────────────────────────────────────────────────────

  async function handleGenerateSwissRound() {
    if (!selectedId) return;
    const { data, error } = await supabase.rpc('generate_inter_swiss_round', {
      p_competition_id: selectedId,
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    trackSwissRoundGenerate(selectedId!, swissRounds.length + 1);
    Alert.alert(t('bo.interComp.swissRoundGenerated'), t('bo.interComp.swissPairingsCreated', { n: data }));
    loadData();
  }

  async function handleResolveSwissPairing(pairing: SwissPairing, s1: number, s2: number) {
    const scoringType = wods[0]?.scoring_type ?? 'reps';
    const { error } = await supabase.rpc('resolve_inter_swiss_pairing', {
      p_pairing_id: pairing.id,
      p_score1: s1,
      p_score2: s2,
      p_scoring_type: scoringType,
    });
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    trackSwissPairingResolve(selectedId!);
    loadData();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={S.center}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <Globe2 color={theme.accent} size={22} />
        <Text style={S.headerTitle}>{t('bo.interComp.header')}</Text>
        <TouchableOpacity style={S.addBtn} onPress={() => setCreateModal(true)}>
          <Plus color="#fff" size={16} />
        </TouchableOpacity>
      </View>

      {/* Competition selector */}
      {competitions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.selector}>
          {competitions.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[S.compPill, c.id === selectedId && S.compPillActive]}
              onPress={() => setSelectedId(c.id)}
            >
              <Text style={[S.compPillText, c.id === selectedId && S.compPillTextActive]}>
                {c.title}
              </Text>
              <Text style={S.compPillSub}>
                {FORMAT_LABELS[c.format]} · {STATUS_LABELS[c.status]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!selected ? (
        <View style={S.center}>
          <Text style={S.emptyText}>{t('bo.interComp.noCompetition')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); loadCompetitions(); }} tintColor={theme.accent} />}
        >
          {/* Status actions */}
          <View style={S.statusRow}>
            <View style={[S.statusBadge, { backgroundColor: selected.status === 'active' ? `${theme.success}20` : `${theme.accent}20` }]}>
              <Text style={[S.statusBadgeText, { color: selected.status === 'active' ? theme.success : theme.accent }]}>
                {STATUS_LABELS[selected.status]}
              </Text>
            </View>
            <Text style={S.regCount}>{t('bo.interComp.entrants', { count: registrationCount })}</Text>
            {selected.status === 'draft' && (
              <TouchableOpacity style={S.actionBtn} onPress={() => handleChangeStatus('open')}>
                <Text style={S.actionBtnText}>{t('bo.interComp.openRegistrations')}</Text>
              </TouchableOpacity>
            )}
            {selected.status === 'open' && (
              <TouchableOpacity style={S.actionBtn} onPress={() => handleChangeStatus('active')}>
                <Play color="#fff" size={12} />
                <Text style={S.actionBtnText}>{t('bo.interComp.launch')}</Text>
              </TouchableOpacity>
            )}
            {selected.status === 'active' && (
              <TouchableOpacity style={[S.actionBtn, { backgroundColor: theme.error }]} onPress={() => handleChangeStatus('closed')}>
                <Text style={S.actionBtnText}>{t('bo.interComp.close')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tabs */}
          <View style={S.tabs}>
            {(['wods', 'scores',
              ...(selected.format === 'bracket' ? ['bracket'] : []),
              ...(selected.format === 'swiss' ? ['swiss'] : []),
              ...(selected.format === 'league' ? ['league'] : []),
              ...(selected.format === 'pool' ? ['pool'] : []),
            ] as const).map(tabKey => (
              <TouchableOpacity key={tabKey} style={[S.tabItem, tab === tabKey && S.tabActive]} onPress={() => setTab(tabKey as typeof tab)}>
                <Text style={[S.tabText, tab === tabKey && S.tabTextActive]}>
                  {tabKey === 'wods' ? t('bo.interComp.tabWods') : tabKey === 'scores' ? t('bo.interComp.tabScores', { n: scores.length }) : tabKey === 'bracket' ? t('bo.interComp.format.bracket') : tabKey === 'swiss' ? t('bo.interComp.format.swiss') : tabKey === 'league' ? t('bo.interComp.format.league') : t('bo.interComp.format.pool')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* TAB: WODs */}
          {tab === 'wods' && (
            <View style={S.section}>
              <TouchableOpacity style={S.addWodBtn} onPress={() => setWodModal(true)}>
                <Plus color={theme.accent} size={14} />
                <Text style={[S.addWodBtnText, { color: theme.accent }]}>{t('bo.interComp.addWod')}</Text>
              </TouchableOpacity>
              {wods.map(w => (
                <View key={w.id} style={S.wodCard}>
                  <View style={S.wodHeader}>
                    <Text style={S.wodIndex}>W{w.order_index}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={S.wodTitle}>{w.title}</Text>
                      <Text style={S.wodMeta}>
                        {SCORING_LABELS[w.scoring_type]}{w.time_cap ? t('bo.interComp.cap', { cap: w.time_cap }) : ''}
                      </Text>
                    </View>
                    {!w.revealed_at ? (
                      <TouchableOpacity style={S.revealBtn} onPress={() => handleRevealWod(w.id)}>
                        <Text style={S.revealBtnText}>{t('bo.interComp.reveal')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <CheckCircle color={theme.success} size={16} />
                    )}
                  </View>
                  {w.description ? <Text style={S.wodDesc}>{w.description}</Text> : null}
                </View>
              ))}
            </View>
          )}

          {/* TAB: Scores */}
          {tab === 'scores' && (
            <View style={S.section}>
              {scores.length === 0 ? (
                <Text style={S.emptyText}>{t('bo.interComp.noScoreSubmitted')}</Text>
              ) : scores.map(s => {
                const wod = wods.find(w => w.id === s.wod_id);
                return (
                  <View key={s.id} style={S.scoreCard}>
                    <View style={S.scoreHeader}>
                      <Text style={S.scoreName}>{s.username ?? s.team_name ?? '—'}</Text>
                      <View style={[S.scoreBadge, {
                        backgroundColor: s.status === 'validated' ? `${theme.success}20`
                          : s.status === 'rejected' ? `${theme.error}20` : `${theme.warning}20`
                      }]}>
                        <Text style={[S.scoreBadgeText, {
                          color: s.status === 'validated' ? theme.success
                            : s.status === 'rejected' ? theme.error : theme.warning
                        }]}>
                          {s.status === 'validated' ? t('bo.interComp.scoreStatus.validated') : s.status === 'rejected' ? t('bo.interComp.scoreStatus.rejected') : t('bo.interComp.scoreStatus.pending')}
                        </Text>
                      </View>
                    </View>
                    <Text style={S.scoreValue}>
                      {t('bo.interComp.scoreLine', { score: s.score_display ?? s.score_value ?? '—', n: wod?.order_index ?? '?' })}
                    </Text>
                    {s.video_url ? (
                      <View style={S.videoRow}>
                        <Youtube color={theme.accent} size={12} />
                        <Text style={S.videoLink} numberOfLines={1}>{s.video_url}</Text>
                      </View>
                    ) : null}
                    {s.status === 'pending' && (
                      <View style={S.scoreActions}>
                        <TouchableOpacity style={S.validateBtn} onPress={() => handleValidateScore(s.id)}>
                          <CheckCircle color="#fff" size={12} />
                          <Text style={S.validateBtnText}>{t('bo.interComp.validate')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.rejectBtn} onPress={() => handleRejectScore(s.id)}>
                          <XCircle color="#fff" size={12} />
                          <Text style={S.rejectBtnText}>{t('bo.interComp.reject')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* TAB: Bracket */}
          {tab === 'bracket' && (
            <BracketTab
              bracketMatches={bracketMatches}
              registrationCount={registrationCount}
              theme={theme}
              S={S}
              onGenerateBracket={handleGenerateBracket}
              onResolveMatch={handleResolveMatch}
              onAdvanceRound={handleAdvanceRound}
            />
          )}

          {/* TAB: League */}
          {tab === 'league' && (
            <LeagueTab
              leagueRounds={leagueRounds}
              leagueStandings={leagueStandings}
              wods={wods}
              theme={theme}
              S={S}
              onCreateRound={handleCreateLeagueRound}
              onComputeRound={handleComputeLeagueRound}
            />
          )}

          {/* TAB: Pool */}
          {tab === 'pool' && (
            <PoolTab
              poolGroups={poolGroups}
              poolMembers={poolMembers}
              poolMatches={poolMatches}
              registrationCount={registrationCount}
              theme={theme}
              S={S}
              onGeneratePool={handleGeneratePool}
              onResolveMatch={handleResolvePoolMatch}
            />
          )}

          {/* TAB: Swiss */}
          {tab === 'swiss' && (
            <SwissTab
              swissRounds={swissRounds}
              swissPairings={swissPairings}
              swissStandings={swissStandings}
              registrationCount={registrationCount}
              theme={theme}
              S={S}
              onGenerateRound={handleGenerateSwissRound}
              onResolvePairing={handleResolveSwissPairing}
            />
          )}
        </ScrollView>
      )}

      {/* ── Create Competition Modal ─────────────────────────────────────────── */}
      <Modal visible={createModal} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>{t('bo.interComp.newCompTitle')}</Text>

            <Text style={S.inputLabel}>{t('bo.interComp.labelTitle')}</Text>
            <TextInput style={S.input} value={newTitle} onChangeText={setNewTitle}
              placeholder={t('bo.interComp.placeholderCompTitle')} placeholderTextColor={theme.textMuted} />

            <Text style={S.inputLabel}>{t('bo.interComp.labelFormat')}</Text>
            <View style={S.formatRow}>
              {(['bracket', 'league', 'pool', 'swiss'] as const).map(f => (
                <TouchableOpacity key={f} style={[S.formatPill, newFormat === f && S.formatPillActive]}
                  onPress={() => setNewFormat(f)}>
                  <Text style={[S.formatPillText, newFormat === f && S.formatPillTextActive]}>
                    {FORMAT_LABELS[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={S.inputLabel}>{t('bo.interComp.labelType')}</Text>
            <View style={S.formatRow}>
              <TouchableOpacity style={[S.formatPill, newType === 'individual' && S.formatPillActive]}
                onPress={() => setNewType('individual')}>
                <Text style={[S.formatPillText, newType === 'individual' && S.formatPillTextActive]}>{t('bo.interComp.typeIndividual')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.formatPill, newType === 'team' && S.formatPillActive]}
                onPress={() => setNewType('team')}>
                <Text style={[S.formatPillText, newType === 'team' && S.formatPillTextActive]}>{t('bo.interComp.typeTeam')}</Text>
              </TouchableOpacity>
            </View>

            {newType === 'team' && (
              <>
                <Text style={S.inputLabel}>{t('bo.interComp.labelTeamSize')}</Text>
                <TextInput style={S.input} value={newTeamSize} onChangeText={setNewTeamSize}
                  keyboardType="number-pad" placeholder="2" placeholderTextColor={theme.textMuted} />
              </>
            )}

            <View style={S.modalActions}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setCreateModal(false)}>
                <Text style={S.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> :
                  <Text style={S.confirmBtnText}>{t('bo.interComp.create')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add WOD Modal ────────────────────────────────────────────────────── */}
      <Modal visible={wodModal} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>{t('bo.interComp.addWod')}</Text>

            <Text style={S.inputLabel}>{t('bo.interComp.labelTitle')}</Text>
            <TextInput style={S.input} value={wodTitle} onChangeText={setWodTitle}
              placeholder={t('bo.interComp.placeholderWodTitle')} placeholderTextColor={theme.textMuted} />

            <Text style={S.inputLabel}>{t('bo.interComp.labelDescription')}</Text>
            <TextInput style={[S.input, { height: 80 }]} value={wodDesc} onChangeText={setWodDesc}
              placeholder={t('bo.interComp.placeholderWodDesc')} placeholderTextColor={theme.textMuted}
              multiline textAlignVertical="top" />

            <Text style={S.inputLabel}>{t('bo.interComp.labelTimeCap')}</Text>
            <TextInput style={S.input} value={wodTimeCap} onChangeText={setWodTimeCap}
              keyboardType="number-pad" placeholder={t('bo.interComp.placeholderOptional')} placeholderTextColor={theme.textMuted} />

            <Text style={S.inputLabel}>{t('bo.interComp.labelScoring')}</Text>
            <View style={S.formatRow}>
              {(['reps', 'time', 'weight', 'rounds_reps'] as const).map(st => (
                <TouchableOpacity key={st} style={[S.formatPill, wodScoring === st && S.formatPillActive]}
                  onPress={() => setWodScoring(st)}>
                  <Text style={[S.formatPillText, wodScoring === st && S.formatPillTextActive]}>
                    {SCORING_LABELS[st]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={S.modalActions}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setWodModal(false)}>
                <Text style={S.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleAddWod}>
                <Text style={S.confirmBtnText}>{t('bo.interComp.add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '900', color: theme.text },
    addBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' },
    selector: { maxHeight: 68, paddingHorizontal: 12, marginBottom: 8 },
    compPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.surface, marginRight: 8 },
    compPillActive: { backgroundColor: `${theme.accent}20`, borderWidth: 1, borderColor: theme.accent },
    compPillText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
    compPillTextActive: { color: theme.accent },
    compPillSub: { fontSize: 10, color: theme.textMuted, marginTop: 2 },
    content: { padding: 16, paddingBottom: 60 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusBadgeText: { fontSize: 11, fontWeight: '800' },
    regCount: { fontSize: 12, color: theme.textMuted, flex: 1 },
    actionBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    actionBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    tabs: { flexDirection: 'row', marginBottom: 12, gap: 4 },
    tabItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.surface },
    tabActive: { backgroundColor: `${theme.accent}20` },
    tabText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    tabTextActive: { color: theme.accent },
    section: { gap: 10 },
    emptyText: { fontSize: 13, color: theme.textMuted, textAlign: 'center', marginTop: 20 },
    addWodBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
    addWodBtnText: { fontSize: 13, fontWeight: '700' },
    wodCard: { backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
    wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    wodIndex: { fontSize: 12, fontWeight: '900', color: theme.accent, width: 30 },
    wodTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    wodMeta: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
    wodDesc: { fontSize: 12, color: theme.textMuted, marginTop: 6 },
    revealBtn: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    revealBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    scoreCard: { backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
    scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    scoreName: { fontSize: 14, fontWeight: '700', color: theme.text },
    scoreBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    scoreBadgeText: { fontSize: 10, fontWeight: '800' },
    scoreValue: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
    videoRow: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 },
    videoLink: { fontSize: 11, color: theme.accent, flex: 1 },
    scoreActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    validateBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.success, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    validateBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    rejectBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.error, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    rejectBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    bracketEmpty: { alignItems: 'center', gap: 12, paddingTop: 32 },
    generateBtn: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    generateBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    advanceBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderRadius: 10, padding: 10, marginBottom: 12 },
    advanceBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    roundSection: { marginBottom: 16 },
    roundTitle: { fontSize: 14, fontWeight: '900', color: theme.accent, marginBottom: 8 },
    matchCard: { backgroundColor: theme.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
    matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    matchPlayer: { fontSize: 13, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center' },
    matchWinner: { color: theme.success },
    matchVs: { fontSize: 11, fontWeight: '900', color: theme.textMuted, marginHorizontal: 8 },
    matchScores: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, gap: 8 },
    matchScoreText: { fontSize: 12, fontWeight: '700', color: theme.accent },
    matchScoreSep: { fontSize: 12, color: theme.textMuted },
    resolveRow: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'center' },
    resolveBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.success, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    resolveBtnText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    matchResolved: { fontSize: 11, fontWeight: '700', color: theme.success, textAlign: 'center', marginTop: 6 },
    matchBye: { fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    modalTitle: { fontSize: 18, fontWeight: '900', color: theme.text, marginBottom: 16 },
    inputLabel: { fontSize: 11, fontWeight: '800', color: theme.textMuted, textTransform: 'uppercase', marginBottom: 4, marginTop: 10 },
    input: { backgroundColor: theme.surface, borderRadius: 10, padding: 12, fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.border },
    formatRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    formatPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.surface },
    formatPillActive: { backgroundColor: `${theme.accent}20`, borderWidth: 1, borderColor: theme.accent },
    formatPillText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    formatPillTextActive: { color: theme.accent },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' },
    cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surface },
    cancelBtnText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
    confirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.accent },
    confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  });
}
