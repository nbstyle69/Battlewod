import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import {
  Trophy, Plus, Globe2, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Users, Dumbbell, Clock, Play, Youtube, GitBranch, Shield,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { calculatePairwiseDeltas, clampElo, assignRanks, RankedPlayer } from '../../utils/elo';
import { syncLevelAndBadges } from '../../utils/eloLevels';
import {
  sendInterWodRevealedNotification,
  sendInterBracketResultNotification,
  sendInterCompetitionClosedNotification,
} from '../../services/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────
interface InterCompetition {
  id: string;
  title: string;
  description: string | null;
  format: 'league' | 'bracket' | 'pool' | 'swiss';
  type: 'individual' | 'team';
  team_size: number;
  status: 'draft' | 'open' | 'active' | 'closed';
  starts_at: string | null;
  ends_at: string | null;
  max_participants: number | null;
  rules: string | null;
  created_at: string;
}

interface InterWod {
  id: string;
  competition_id: string;
  title: string;
  description: string | null;
  order_index: number;
  time_cap: number | null;
  scoring_type: 'reps' | 'time' | 'weight' | 'rounds_reps';
  revealed_at: string | null;
}

interface InterScore {
  id: string;
  competition_id: string;
  wod_id: string;
  athlete_id: string | null;
  team_id: string | null;
  score_value: number | null;
  score_display: string | null;
  video_url: string | null;
  status: 'pending' | 'validated' | 'rejected';
  submitted_at: string;
  username?: string;
  team_name?: string;
}

interface BracketMatch {
  id: string;
  competition_id: string;
  round: number;
  match_number: number;
  participant1_id: string | null;
  participant2_id: string | null;
  winner_id: string | null;
  status: 'pending' | 'active' | 'completed' | 'bye';
  wod_id: string | null;
  p1_username?: string;
  p2_username?: string;
  p1_score?: InterScore | null;
  p2_score?: InterScore | null;
}

interface PoolGroup {
  id: string;
  competition_id: string;
  group_name: string;
  group_index: number;
  advance_count: number;
}

interface PoolMember {
  id: string;
  group_id: string;
  athlete_id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  score_for: number;
  score_against: number;
  username?: string;
}

interface PoolMatch {
  id: string;
  group_id: string;
  competition_id: string;
  athlete1_id: string;
  athlete2_id: string;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: 'pending' | 'active' | 'completed';
  a1_username?: string;
  a2_username?: string;
}

interface LeagueRound {
  id: string;
  competition_id: string;
  round_number: number;
  title: string | null;
  wod_id: string | null;
  status: 'pending' | 'active' | 'completed';
  started_at: string | null;
  completed_at: string | null;
}

interface LeagueStanding {
  id: string;
  competition_id: string;
  athlete_id: string;
  total_points: number;
  rounds_played: number;
  wins: number;
  podiums: number;
  username?: string;
}

const FORMAT_LABELS: Record<string, string> = {
  league: 'Ligue', bracket: 'Elimination', pool: 'Poules', swiss: 'Suisse',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', open: 'Ouvert', active: 'En cours', closed: 'Termine',
};
const SCORING_LABELS: Record<string, string> = {
  reps: 'Reps', time: 'Temps', weight: 'Poids', rounds_reps: 'Rounds+Reps',
};

export default function BOInterCompetitionScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const S = createStyles(theme);

  const [competitions, setCompetitions] = useState<InterCompetition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'wods' | 'scores' | 'bracket' | 'league' | 'pool'>('wods');

  // Selected competition data
  const [wods, setWods] = useState<InterWod[]>([]);
  const [scores, setScores] = useState<InterScore[]>([]);
  const [bracketMatches, setBracketMatches] = useState<BracketMatch[]>([]);
  const [leagueRounds, setLeagueRounds] = useState<LeagueRound[]>([]);
  const [leagueStandings, setLeagueStandings] = useState<LeagueStanding[]>([]);
  const [poolGroups, setPoolGroups] = useState<PoolGroup[]>([]);
  const [poolMembers, setPoolMembers] = useState<PoolMember[]>([]);
  const [poolMatches, setPoolMatches] = useState<PoolMatch[]>([]);
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
      const { data } = await (supabase as any)
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
      (supabase as any).from('inter_competition_wods')
        .select('*').eq('competition_id', selectedId).order('order_index'),
      (supabase as any).from('inter_scores')
        .select('*').eq('competition_id', selectedId).order('submitted_at', { ascending: false }),
      (supabase as any).from('inter_registrations')
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
      (profs ?? []).forEach((p: any) => { profMap[p.id] = p.username; });
      scoreList.forEach(s => { if (s.athlete_id) s.username = profMap[s.athlete_id] ?? '—'; });
    }
    setScores(scoreList);

    // Load bracket matches if format is bracket
    const comp = competitions.find(c => c.id === selectedId);
    if (comp?.format === 'bracket' || comp?.format === 'swiss') {
      const { data: matches } = await (supabase as any)
        .from('inter_bracket_matches')
        .select('*')
        .eq('competition_id', selectedId)
        .order('round')
        .order('match_number');
      if (matches && matches.length > 0) {
        const ids: string[] = Array.from(new Set(
          matches.flatMap((m: any) => [m.participant1_id, m.participant2_id]).filter(Boolean)
        ));
        const { data: profs } = await supabase.from('profiles').select('id, username').in('id', ids);
        const profMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p.username; });

        const enriched: BracketMatch[] = (matches as any[]).map(m => ({
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

    // Load league data if format is league
    if (comp?.format === 'league') {
      const [{ data: rounds }, { data: standings }] = await Promise.all([
        (supabase as any).from('inter_league_rounds')
          .select('*').eq('competition_id', selectedId).order('round_number'),
        (supabase as any).from('inter_league_standings')
          .select('*').eq('competition_id', selectedId).order('total_points', { ascending: false }),
      ]);
      setLeagueRounds((rounds ?? []) as LeagueRound[]);

      // Enrich standings with usernames
      const standingsList = (standings ?? []) as LeagueStanding[];
      const sIds = standingsList.map(s => s.athlete_id).filter(Boolean);
      if (sIds.length > 0) {
        const { data: sprofs } = await supabase.from('profiles').select('id, username').in('id', sIds);
        const sprofMap: Record<string, string> = {};
        (sprofs ?? []).forEach((p: any) => { sprofMap[p.id] = p.username; });
        standingsList.forEach(s => { s.username = sprofMap[s.athlete_id] ?? '—'; });
      }
      setLeagueStandings(standingsList);
    }

    // Load pool data if format is pool
    if (comp?.format === 'pool') {
      const [{ data: groups }, { data: members }, { data: matches }] = await Promise.all([
        (supabase as any).from('inter_pool_groups')
          .select('*').eq('competition_id', selectedId).order('group_index'),
        (supabase as any).from('inter_pool_members')
          .select('*'),
        (supabase as any).from('inter_pool_matches')
          .select('*').eq('competition_id', selectedId).order('group_id'),
      ]);
      setPoolGroups((groups ?? []) as PoolGroup[]);

      // Filter members to only current comp groups
      const groupIds = (groups ?? []).map((g: any) => g.id);
      const compMembers = ((members ?? []) as PoolMember[]).filter(m => groupIds.includes(m.group_id));

      // Enrich with usernames
      const pmIds = [...new Set([
        ...compMembers.map(m => m.athlete_id),
        ...(matches ?? []).flatMap((m: any) => [m.athlete1_id, m.athlete2_id]),
      ])].filter(Boolean);
      const pmProfMap: Record<string, string> = {};
      if (pmIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username').in('id', pmIds);
        (profs ?? []).forEach((p: any) => { pmProfMap[p.id] = p.username; });
      }
      compMembers.forEach(m => { m.username = pmProfMap[m.athlete_id] ?? '—'; });
      setPoolMembers(compMembers);

      const enrichedMatches: PoolMatch[] = ((matches ?? []) as PoolMatch[]).map(m => ({
        ...m,
        a1_username: pmProfMap[m.athlete1_id] ?? '—',
        a2_username: pmProfMap[m.athlete2_id] ?? '—',
      }));
      setPoolMatches(enrichedMatches);
    }
  }, [selectedId, competitions]);

  useEffect(() => { loadData(); }, [loadData]);

  const selected = competitions.find(c => c.id === selectedId);

  // ── Create competition ────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newTitle.trim()) { Alert.alert('Erreur', 'Titre requis'); return; }
    setCreating(true);
    const { data, error } = await (supabase as any).from('inter_competitions').insert({
      title: newTitle.trim(),
      format: newFormat,
      type: newType,
      team_size: newType === 'team' ? parseInt(newTeamSize) || 2 : 1,
      status: 'draft',
      created_by: user?.id,
    }).select().single();
    setCreating(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setCreateModal(false);
    setNewTitle('');
    setSelectedId(data.id);
    loadCompetitions();
  }

  // ── Change status ─────────────────────────────────────────────────────────
  async function handleChangeStatus(newStatus: string) {
    if (!selectedId) return;
    if (newStatus === 'closed') {
      await handleCloseCompetition();
      return;
    }
    const { error } = await (supabase as any).from('inter_competitions')
      .update({ status: newStatus }).eq('id', selectedId);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setCompetitions(prev => prev.map(c => c.id === selectedId ? { ...c, status: newStatus as any } : c));
  }

  // ── Close competition + distribute ELO (pairwise) ─────────────────────────
  async function handleCloseCompetition() {
    if (!selectedId) return;
    Alert.alert(
      'Cloturer la competition ?',
      'Les ELO seront calcules et distribues a tous les participants.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Cloturer', style: 'destructive', onPress: async () => {
          try {
            // Get validated scores aggregated by athlete (sum across all WODs)
            const { data: validatedScores } = await (supabase as any).from('inter_scores')
              .select('athlete_id, score_value').eq('competition_id', selectedId).eq('status', 'validated');
            if (!validatedScores || validatedScores.length === 0) {
              await (supabase as any).from('inter_competitions').update({ status: 'closed' }).eq('id', selectedId);
              setCompetitions(prev => prev.map(c => c.id === selectedId ? { ...c, status: 'closed' as any } : c));
              Alert.alert('Competition cloturee (aucun score valide).');
              return;
            }

            // Aggregate total score per athlete
            const totals: Record<string, number> = {};
            validatedScores.forEach((s: any) => {
              totals[s.athlete_id] = (totals[s.athlete_id] ?? 0) + (parseFloat(s.score_value) || 0);
            });

            // Get profiles with ELO
            const athleteIds = Object.keys(totals);
            const { data: profs } = await supabase.from('profiles').select('id, elo').in('id', athleteIds);
            const profMap: Record<string, number> = {};
            (profs ?? []).forEach((p: any) => { profMap[p.id] = p.elo ?? 1000; });

            // Sort athletes by total score (DESC for now; already aggregated)
            const sorted = Object.entries(totals)
              .map(([id, score]) => ({ id, score }))
              .sort((a, b) => b.score - a.score);
            const ranked = assignRanks(sorted);

            // Build RankedPlayer array for pairwise ELO
            const players: RankedPlayer[] = ranked.map(r => ({
              id: r.id,
              elo: profMap[r.id] ?? 1000,
              rank: r.rank,
            }));

            // Calculate pairwise deltas
            const results = calculatePairwiseDeltas(players);

            // Apply ELO changes
            for (const r of results) {
              const newElo = clampElo(r.elo + r.delta);
              await supabase.rpc('update_user_elo', {
                p_user_id: r.id,
                p_new_elo: newElo,
                p_increment_matches: 1,
                p_increment_wins: r.rank === 1 ? 1 : 0,
              });
              await syncLevelAndBadges(r.id, newElo);
            }

            // Update competition status
            await (supabase as any).from('inter_competitions').update({ status: 'closed' }).eq('id', selectedId);
            setCompetitions(prev => prev.map(c => c.id === selectedId ? { ...c, status: 'closed' as any } : c));

            const winner = results.find(r => r.rank === 1);
            const topDelta = winner ? `+${winner.delta}` : '';
            Alert.alert('Competition cloturee !', `ELO distribue a ${results.length} athletes. 1er: ${topDelta} ELO`);

            // Notify all athletes of their ELO change
            const comp = competitions.find(c => c.id === selectedId);
            if (comp && selectedId) {
              const eloChanges = results.map(r => ({ athleteId: r.id, delta: r.delta }));
              sendInterCompetitionClosedNotification(selectedId, comp.title, eloChanges).catch(() => {});
            }
          } catch (e: any) {
            captureError(e, { screen: 'BOInterCompetition', action: 'close' });
            Alert.alert('Erreur', e?.message ?? 'Erreur lors de la cloture');
          }
        }},
      ]
    );
  }

  // ── Add WOD ───────────────────────────────────────────────────────────────
  async function handleAddWod() {
    if (!wodTitle.trim() || !selectedId) { Alert.alert('Erreur', 'Titre requis'); return; }
    const { error } = await (supabase as any).from('inter_competition_wods').insert({
      competition_id: selectedId,
      title: wodTitle.trim(),
      description: wodDesc.trim() || null,
      time_cap: wodTimeCap ? parseInt(wodTimeCap) : null,
      scoring_type: wodScoring,
      order_index: wods.length + 1,
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
    setWodModal(false);
    setWodTitle(''); setWodDesc(''); setWodTimeCap('');
    loadData();
  }

  // ── Reveal WOD ────────────────────────────────────────────────────────────
  async function handleRevealWod(wodId: string) {
    const { error } = await (supabase as any).from('inter_competition_wods')
      .update({ revealed_at: new Date().toISOString() }).eq('id', wodId);
    if (error) { Alert.alert('Erreur', error.message); return; }
    loadData();
    // Notify participants
    const comp = competitions.find(c => c.id === selectedId);
    const wod = wods.find(w => w.id === wodId);
    if (comp && wod && selectedId) {
      sendInterWodRevealedNotification(selectedId, comp.title, wod.title).catch(() => {});
    }
  }

  // ── Validate / reject score ───────────────────────────────────────────────
  async function handleValidateScore(scoreId: string) {
    const { error } = await (supabase as any).from('inter_scores')
      .update({ status: 'validated', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', scoreId);
    if (error) { Alert.alert('Erreur', error.message); return; }
    loadData();
  }

  async function handleRejectScore(scoreId: string) {
    Alert.alert('Rejeter ce score ?', 'Le participant devra re-soumettre.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Rejeter', style: 'destructive', onPress: async () => {
        const { error } = await (supabase as any).from('inter_scores')
          .update({ status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
          .eq('id', scoreId);
        if (error) { Alert.alert('Erreur', error.message); return; }
        loadData();
      }},
    ]);
  }

  // ── Bracket: generate round 1 ─────────────────────────────────────────────
  async function handleGenerateBracket() {
    if (!selectedId) return;
    Alert.alert(
      'Generer le bracket ?',
      `${registrationCount} inscrits seront apparies aleatoirement en Round 1.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Generer', onPress: async () => {
          const { error } = await (supabase as any).rpc('generate_inter_bracket_round_1', {
            p_competition_id: selectedId,
          });
          if (error) { Alert.alert('Erreur', error.message); return; }
          loadData();
          Alert.alert('Bracket genere !');
        }},
      ]
    );
  }

  // ── Bracket: admin resolve match (declare winner) ─────────────────────────
  async function handleResolveMatch(match: BracketMatch, winnerId: string) {
    const loserId = winnerId === match.participant1_id ? match.participant2_id : match.participant1_id;
    Alert.alert(
      'Declarer le gagnant ?',
      `Gagnant : ${winnerId === match.participant1_id ? match.p1_username : match.p2_username}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: async () => {
          const { error } = await (supabase as any).from('inter_bracket_matches')
            .update({ winner_id: winnerId, loser_id: loserId, status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', match.id);
          if (error) { Alert.alert('Erreur', error.message); return; }
          loadData();
          // Notify winner and loser
          const comp = competitions.find(c => c.id === selectedId);
          if (comp) {
            if (winnerId) {
              sendInterBracketResultNotification(winnerId, comp.title, true, match.round).catch(() => {});
            }
            if (loserId) {
              sendInterBracketResultNotification(loserId, comp.title, false, match.round).catch(() => {});
            }
          }
        }},
      ]
    );
  }

  // ── Bracket: advance round ────────────────────────────────────────────────
  async function handleAdvanceRound() {
    if (!selectedId) return;
    const completedRounds = [...new Set(
      bracketMatches.filter(m => m.status === 'completed' || m.status === 'bye').map(m => m.round)
    )].sort((a, b) => b - a);
    const lastCompleted = completedRounds[0];
    if (!lastCompleted) { Alert.alert('Aucun round termine'); return; }

    const { error } = await (supabase as any).rpc('advance_inter_bracket_round', {
      p_competition_id: selectedId,
      p_completed_round: lastCompleted,
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
    loadData();
    Alert.alert('Round suivant genere !');
  }

  // ── League: create round (journee) ────────────────────────────────────────
  async function handleCreateLeagueRound() {
    if (!selectedId) return;
    const nextNumber = leagueRounds.length + 1;
    // Use first unrevealed WOD or null
    const availableWod = wods.find(w => !leagueRounds.some(r => r.wod_id === w.id));
    const { error } = await (supabase as any).from('inter_league_rounds').insert({
      competition_id: selectedId,
      round_number: nextNumber,
      title: `Journee ${nextNumber}`,
      wod_id: availableWod?.id ?? null,
      status: 'pending',
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
    loadData();
    Alert.alert(`Journee ${nextNumber} creee !`);
  }

  // ── League: compute round points ─────────────────────────────────────────
  async function handleComputeLeagueRound(roundNumber: number) {
    if (!selectedId) return;
    const { data, error } = await (supabase as any).rpc('compute_inter_league_round', {
      p_competition_id: selectedId,
      p_round_number: roundNumber,
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
    loadData();
    Alert.alert(`Points calcules pour ${data} athletes !`);
  }

  // ── Pool: generate groups ──────────────────────────────────────────────────
  async function handleGeneratePool() {
    if (!selectedId) return;
    Alert.alert(
      'Generer les poules ?',
      `${registrationCount} inscrits seront repartis en poules (seeding par ELO).`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Generer', onPress: async () => {
          const groupsCount = registrationCount <= 8 ? 2 : registrationCount <= 16 ? 4 : 8;
          const { error } = await (supabase as any).rpc('generate_inter_pool_groups', {
            p_competition_id: selectedId,
            p_groups_count: groupsCount,
            p_advance_count: 2,
          });
          if (error) { Alert.alert('Erreur', error.message); return; }
          loadData();
          Alert.alert(`${groupsCount} poules generees !`);
        }},
      ]
    );
  }

  // ── Pool: resolve match ──────────────────────────────────────────────────
  async function handleResolvePoolMatch(match: PoolMatch, s1: number, s2: number) {
    const scoringType = wods[0]?.scoring_type ?? 'reps';
    const { error } = await (supabase as any).rpc('resolve_inter_pool_match', {
      p_match_id: match.id,
      p_score1: s1,
      p_score2: s2,
      p_scoring_type: scoringType,
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
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
        <Text style={S.headerTitle}>Inter-box Competitions</Text>
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
          <Text style={S.emptyText}>Aucune competition. Cree-en une !</Text>
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
            <Text style={S.regCount}>{registrationCount} inscrit(s)</Text>
            {selected.status === 'draft' && (
              <TouchableOpacity style={S.actionBtn} onPress={() => handleChangeStatus('open')}>
                <Text style={S.actionBtnText}>Ouvrir inscriptions</Text>
              </TouchableOpacity>
            )}
            {selected.status === 'open' && (
              <TouchableOpacity style={S.actionBtn} onPress={() => handleChangeStatus('active')}>
                <Play color="#fff" size={12} />
                <Text style={S.actionBtnText}>Lancer</Text>
              </TouchableOpacity>
            )}
            {selected.status === 'active' && (
              <TouchableOpacity style={[S.actionBtn, { backgroundColor: theme.error }]} onPress={() => handleChangeStatus('closed')}>
                <Text style={S.actionBtnText}>Cloturer</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tabs */}
          <View style={S.tabs}>
            {(['wods', 'scores',
              ...(selected.format === 'bracket' || selected.format === 'swiss' ? ['bracket'] : []),
              ...(selected.format === 'league' ? ['league'] : []),
              ...(selected.format === 'pool' ? ['pool'] : []),
            ] as const).map(t => (
              <TouchableOpacity key={t} style={[S.tabItem, tab === t && S.tabActive]} onPress={() => setTab(t as any)}>
                <Text style={[S.tabText, tab === t && S.tabTextActive]}>
                  {t === 'wods' ? 'WODs' : t === 'scores' ? `Scores (${scores.length})` : t === 'bracket' ? 'Bracket' : t === 'league' ? 'Ligue' : 'Poules'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* TAB: WODs */}
          {tab === 'wods' && (
            <View style={S.section}>
              <TouchableOpacity style={S.addWodBtn} onPress={() => setWodModal(true)}>
                <Plus color={theme.accent} size={14} />
                <Text style={[S.addWodBtnText, { color: theme.accent }]}>Ajouter un WOD</Text>
              </TouchableOpacity>
              {wods.map(w => (
                <View key={w.id} style={S.wodCard}>
                  <View style={S.wodHeader}>
                    <Text style={S.wodIndex}>W{w.order_index}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={S.wodTitle}>{w.title}</Text>
                      <Text style={S.wodMeta}>
                        {SCORING_LABELS[w.scoring_type]}{w.time_cap ? ` · ${w.time_cap}min cap` : ''}
                      </Text>
                    </View>
                    {!w.revealed_at ? (
                      <TouchableOpacity style={S.revealBtn} onPress={() => handleRevealWod(w.id)}>
                        <Text style={S.revealBtnText}>Reveler</Text>
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
                <Text style={S.emptyText}>Aucun score soumis.</Text>
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
                          {s.status === 'validated' ? 'Valide' : s.status === 'rejected' ? 'Rejete' : 'En attente'}
                        </Text>
                      </View>
                    </View>
                    <Text style={S.scoreValue}>
                      {s.score_display ?? s.score_value ?? '—'} · WOD {wod?.order_index ?? '?'}
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
                          <Text style={S.validateBtnText}>Valider</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={S.rejectBtn} onPress={() => handleRejectScore(s.id)}>
                          <XCircle color="#fff" size={12} />
                          <Text style={S.rejectBtnText}>Rejeter</Text>
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
            <View style={S.section}>
              {bracketMatches.length === 0 ? (
                <View style={S.bracketEmpty}>
                  <GitBranch color={theme.textMuted} size={32} />
                  <Text style={S.emptyText}>Bracket non genere.</Text>
                  <TouchableOpacity style={S.generateBtn} onPress={handleGenerateBracket}>
                    <Text style={S.generateBtnText}>Generer le bracket ({registrationCount} inscrits)</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={S.advanceBtn} onPress={handleAdvanceRound}>
                    <Play color="#fff" size={12} />
                    <Text style={S.advanceBtnText}>Avancer au round suivant</Text>
                  </TouchableOpacity>

                  {Object.entries(
                    bracketMatches.reduce((acc, m) => {
                      (acc[m.round] ??= []).push(m);
                      return acc;
                    }, {} as Record<number, BracketMatch[]>)
                  ).sort(([a], [b]) => Number(a) - Number(b)).map(([round, matches]) => (
                    <View key={round} style={S.roundSection}>
                      <Text style={S.roundTitle}>Round {round}</Text>
                      {matches.map(match => (
                        <View key={match.id} style={S.matchCard}>
                          <View style={S.matchRow}>
                            <Text style={[S.matchPlayer, match.winner_id === match.participant1_id && S.matchWinner]}>
                              {match.p1_username ?? 'BYE'}
                            </Text>
                            <Text style={S.matchVs}>vs</Text>
                            <Text style={[S.matchPlayer, match.winner_id === match.participant2_id && S.matchWinner]}>
                              {match.p2_username ?? 'BYE'}
                            </Text>
                          </View>

                          {/* Show scores if both submitted */}
                          {(match.p1_score || match.p2_score) && (
                            <View style={S.matchScores}>
                              <Text style={S.matchScoreText}>
                                {match.p1_score?.score_display ?? match.p1_score?.score_value ?? '—'}
                              </Text>
                              <Text style={S.matchScoreSep}>-</Text>
                              <Text style={S.matchScoreText}>
                                {match.p2_score?.score_display ?? match.p2_score?.score_value ?? '—'}
                              </Text>
                            </View>
                          )}

                          {/* Admin resolve buttons */}
                          {match.status !== 'completed' && match.status !== 'bye' && match.participant1_id && match.participant2_id && (
                            <View style={S.resolveRow}>
                              <TouchableOpacity
                                style={S.resolveBtn}
                                onPress={() => handleResolveMatch(match, match.participant1_id!)}
                              >
                                <Trophy color="#fff" size={10} />
                                <Text style={S.resolveBtnText}>{match.p1_username}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[S.resolveBtn, { backgroundColor: theme.error }]}
                                onPress={() => handleResolveMatch(match, match.participant2_id!)}
                              >
                                <Trophy color="#fff" size={10} />
                                <Text style={S.resolveBtnText}>{match.p2_username}</Text>
                              </TouchableOpacity>
                            </View>
                          )}

                          {match.status === 'completed' && (
                            <Text style={S.matchResolved}>
                              Gagnant : {match.winner_id === match.participant1_id ? match.p1_username : match.p2_username}
                            </Text>
                          )}
                          {match.status === 'bye' && (
                            <Text style={S.matchBye}>BYE — avance automatiquement</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* TAB: League */}
          {tab === 'league' && (
            <View style={S.section}>
              {/* Standings */}
              <Text style={S.roundTitle}>Classement general</Text>
              {leagueStandings.length === 0 ? (
                <Text style={S.emptyText}>Aucun classement — calculez les points d'une journee</Text>
              ) : (
                leagueStandings.map((s, i) => (
                  <View key={s.id} style={[S.matchCard, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[S.matchPlayer, { width: 24 }]}>{i + 1}.</Text>
                      <Text style={S.matchPlayer}>{s.username ?? s.athlete_id.slice(0, 8)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Text style={[S.matchPlayer, { color: theme.accent }]}>{s.total_points} pts</Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>{s.wins}W {s.podiums}P | {s.rounds_played}j</Text>
                    </View>
                  </View>
                ))
              )}

              {/* Rounds (journees) */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <Text style={S.roundTitle}>Journees</Text>
                <TouchableOpacity style={S.generateBtn} onPress={handleCreateLeagueRound}>
                  <Plus color="#fff" size={12} />
                  <Text style={S.generateBtnText}>Ajouter journee</Text>
                </TouchableOpacity>
              </View>

              {leagueRounds.length === 0 ? (
                <Text style={S.emptyText}>Aucune journee creee</Text>
              ) : (
                leagueRounds.map(r => (
                  <View key={r.id} style={S.matchCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={S.matchPlayer}>{r.title ?? `Journee ${r.round_number}`}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: r.status === 'completed' ? theme.success : theme.textMuted }}>
                        {r.status === 'completed' ? 'Termine' : r.status === 'active' ? 'En cours' : 'A venir'}
                      </Text>
                    </View>
                    {r.wod_id && (
                      <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>WOD: {wods.find(w => w.id === r.wod_id)?.title ?? '—'}</Text>
                    )}
                    {r.status !== 'completed' && (
                      <TouchableOpacity
                        style={[S.advanceBtn, { marginTop: 8 }]}
                        onPress={() => handleComputeLeagueRound(r.round_number)}
                      >
                        <Play color="#fff" size={12} />
                        <Text style={S.advanceBtnText}>Calculer les points</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB: Pool */}
          {tab === 'pool' && (
            <View style={S.section}>
              {poolGroups.length === 0 ? (
                <View style={S.bracketEmpty}>
                  <Text style={S.emptyText}>Poules non generees.</Text>
                  <TouchableOpacity style={S.generateBtn} onPress={handleGeneratePool}>
                    <Text style={S.generateBtnText}>Generer les poules ({registrationCount} inscrits)</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {poolGroups.map(group => {
                    const members = poolMembers.filter(m => m.group_id === group.id).sort((a, b) => b.points - a.points);
                    const matches = poolMatches.filter(m => m.group_id === group.id);
                    return (
                      <View key={group.id} style={{ marginBottom: 16 }}>
                        <Text style={S.roundTitle}>{group.group_name}</Text>
                        {/* Standings */}
                        {members.map((m, i) => (
                          <View key={m.id} style={[S.matchCard, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[S.matchPlayer, { width: 20 }]}>{i + 1}.</Text>
                              <Text style={S.matchPlayer}>{m.username}</Text>
                            </View>
                            <Text style={[S.matchPlayer, { color: theme.accent }]}>
                              {m.points}pts ({m.wins}V {m.draws}N {m.losses}D)
                            </Text>
                          </View>
                        ))}
                        {/* Matches */}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, marginTop: 8, marginBottom: 4 }}>
                          Matchs ({matches.filter(m => m.status === 'completed').length}/{matches.length})
                        </Text>
                        {matches.map(match => (
                          <View key={match.id} style={[S.matchCard, { paddingVertical: 6 }]}>
                            <View style={S.matchRow}>
                              <Text style={[S.matchPlayer, match.winner_id === match.athlete1_id && S.matchWinner]}>
                                {match.a1_username}
                              </Text>
                              <Text style={{ fontSize: 11, color: theme.textMuted }}>
                                {match.status === 'completed' ? `${match.score1} - ${match.score2}` : 'vs'}
                              </Text>
                              <Text style={[S.matchPlayer, match.winner_id === match.athlete2_id && S.matchWinner]}>
                                {match.a2_username}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Create Competition Modal ─────────────────────────────────────────── */}
      <Modal visible={createModal} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Nouvelle competition Inter-box</Text>

            <Text style={S.inputLabel}>Titre</Text>
            <TextInput style={S.input} value={newTitle} onChangeText={setNewTitle}
              placeholder="Ex: Inter-box Championship 2026" placeholderTextColor={theme.textMuted} />

            <Text style={S.inputLabel}>Format</Text>
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

            <Text style={S.inputLabel}>Type</Text>
            <View style={S.formatRow}>
              <TouchableOpacity style={[S.formatPill, newType === 'individual' && S.formatPillActive]}
                onPress={() => setNewType('individual')}>
                <Text style={[S.formatPillText, newType === 'individual' && S.formatPillTextActive]}>Individuel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.formatPill, newType === 'team' && S.formatPillActive]}
                onPress={() => setNewType('team')}>
                <Text style={[S.formatPillText, newType === 'team' && S.formatPillTextActive]}>Equipe</Text>
              </TouchableOpacity>
            </View>

            {newType === 'team' && (
              <>
                <Text style={S.inputLabel}>Taille equipe</Text>
                <TextInput style={S.input} value={newTeamSize} onChangeText={setNewTeamSize}
                  keyboardType="number-pad" placeholder="2" placeholderTextColor={theme.textMuted} />
              </>
            )}

            <View style={S.modalActions}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setCreateModal(false)}>
                <Text style={S.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> :
                  <Text style={S.confirmBtnText}>Creer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add WOD Modal ────────────────────────────────────────────────────── */}
      <Modal visible={wodModal} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Ajouter un WOD</Text>

            <Text style={S.inputLabel}>Titre</Text>
            <TextInput style={S.input} value={wodTitle} onChangeText={setWodTitle}
              placeholder="Ex: WOD 1 — Chipper" placeholderTextColor={theme.textMuted} />

            <Text style={S.inputLabel}>Description</Text>
            <TextInput style={[S.input, { height: 80 }]} value={wodDesc} onChangeText={setWodDesc}
              placeholder="Mouvements, charges..." placeholderTextColor={theme.textMuted}
              multiline textAlignVertical="top" />

            <Text style={S.inputLabel}>Time cap (min)</Text>
            <TextInput style={S.input} value={wodTimeCap} onChangeText={setWodTimeCap}
              keyboardType="number-pad" placeholder="Optionnel" placeholderTextColor={theme.textMuted} />

            <Text style={S.inputLabel}>Scoring</Text>
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
                <Text style={S.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleAddWod}>
                <Text style={S.confirmBtnText}>Ajouter</Text>
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
    // WODs
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
    // Scores
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
    // Bracket
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
    // Modals
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
