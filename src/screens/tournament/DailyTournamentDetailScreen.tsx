import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Linking, Share,
} from 'react-native';
import {
  ArrowLeft, Users, Clock, Zap, Trophy, Crown, Medal, Check, X, Play, Edit3,
  Youtube, AlertTriangle, ThumbsUp, Link, Share2, Flame,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { hapticSuccess } from '../../lib/haptics';
import { useAuth } from '../../context/AuthContext';
import { LevelColors } from '../../theme/designTokens';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { incrementCounter, logMovementReps } from '../../services/gamification';
import { cancelTodayScoreReminder } from '../../services/notifications';
import { computeCompletedMovements } from '../../utils/movementParser';
import { computeMaxScore } from '../../utils/computeMaxScore';
import { syncLevelAndBadges } from '../../utils/eloLevels';
import { formatScoreValue } from '../../utils/scoreFormat';
import { getScaledMovements } from '../../utils/wodScaling';

import { trackDailyTournamentJoin, trackDailyTournamentScoreSubmit } from '../../lib/analytics';
import { HomeStackParamList, TimerType } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<HomeStackParamList>;
type Route = RouteProp<{ DailyTournamentDetail: { tournamentId: string } }, 'DailyTournamentDetail'>;

interface Participant {
  user_id: string;
  username: string;
  level: string;
  elo: number;
  score_value: number | null;
  rx: boolean;
  submitted_at: string | null;
  video_url: string | null;
  status: string;
}

interface TournamentDetail {
  id: string;
  creator_id: string;
  wod_name: string;
  wod_type: string;
  duration: number;
  level: string;
  movements: string;
  movements_scaled?: string | null;
  scoring: string | null;
  score_mode: string;
  max_players: number;
  status: string;
  elo_reward: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  gender_target?: string;
  is_official?: boolean;
}

function formatScore(value: number, mode: string): string {
  return formatScoreValue(value, mode);
}

export default function DailyTournamentDetailScreen() {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user, currentBox } = useAuth();
  const { tournamentId } = route.params;

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [hasScored, setHasScored] = useState(false);
  const [joining, setJoining] = useState(false);

  // Score modal
  const [scoreModal, setScoreModal] = useState(false);
  const [scoreInput, setScoreInput] = useState('');
  const [timeMin, setTimeMin] = useState('');
  const [timeSec, setTimeSec] = useState('');
  const secRef = useRef<TextInput>(null);
  const [scoreRx, setScoreRx] = useState(true);
  const [boardTab, setBoardTab] = useState<'rx' | 'scaled'>('rx');
  const [scoreNotes, setScoreNotes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contestModal, setContestModal] = useState<Participant | null>(null);
  const [contestReason, setContestReason] = useState('');
  const [eloDeltas, setEloDeltas] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user) return;
    try {
    const { data: t } = await supabase
      .from('daily_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (t) setTournament(t as TournamentDetail);

    // Participants with scores and profiles
    const { data: parts } = await supabase
      .from('daily_tournament_participants')
      .select('user_id, profile:profiles!user_id(username, level, elo)')
      .eq('tournament_id', tournamentId);

    const { data: scores } = await supabase
      .from('daily_tournament_scores')
      .select('user_id, score_value, rx, submitted_at, video_url, status')
      .eq('tournament_id', tournamentId);

    const scoreMap = new Map((scores ?? []).map((s: any) => [s.user_id, s]));

    const mapped: Participant[] = (parts ?? []).map((p: any) => {
      const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
      const score = scoreMap.get(p.user_id);
      return {
        user_id: p.user_id,
        username: profile?.username ?? '—',
        level: profile?.level ?? 'scaled',
        elo: profile?.elo ?? 1000,
        score_value: score?.score_value ?? null,
        rx: score?.rx ?? true,
        submitted_at: score?.submitted_at ?? null,
        video_url: score?.video_url ?? null,
        status: score?.status ?? 'pending',
      };
    });

    // Sort: scored first, RX above Scaled within scored, then by score, then unscored
    const scoreMode = t?.score_mode ?? 'time';
    mapped.sort((a, b) => {
      if (a.score_value === null && b.score_value === null) return 0;
      if (a.score_value === null) return 1;
      if (b.score_value === null) return -1;
      const rxDiff = (a.rx ? 0 : 1) - (b.rx ? 0 : 1);
      if (rxDiff !== 0) return rxDiff;
      return scoreMode === 'time'
        ? a.score_value - b.score_value
        : b.score_value - a.score_value;
    });

    setParticipants(mapped);
    const alreadyJoined = mapped.some(p => p.user_id === user.id);
    const isCreator = t?.creator_id === user.id;

    // Auto-join creator if not already in participants
    if (isCreator && !alreadyJoined) {
      await supabase.from('daily_tournament_participants').upsert({
        tournament_id: tournamentId,
        user_id: user.id,
      }, { onConflict: 'tournament_id,user_id', ignoreDuplicates: true });
      setHasJoined(true);
    } else {
      setHasJoined(alreadyJoined);
    }

    setHasScored(mapped.some(p => p.user_id === user.id && p.score_value !== null));

    // ELO: compute lazily after tournament ends_at has passed, then load deltas
    const tournEnded = t?.ends_at ? new Date() >= new Date(t.ends_at) : false;
    // Fenêtre expirée mais jamais complété (ex. < max_players scores) : complétion
    // paresseuse via RPC pour que l'ELO puisse enfin être distribué.
    let tournStatus = t?.status;
    if (t && tournStatus !== 'completed' && tournEnded && !t.is_official && (alreadyJoined || isCreator)) {
      const { error: cErr } = await supabase.rpc('complete_daily_tournament', { p_tournament_id: tournamentId });
      if (!cErr) tournStatus = 'completed';
    }
    if (tournStatus === 'completed' && tournEnded && !t?.is_official) {
      const { data: eloHist } = await supabase
        .from('daily_tournament_elo_history')
        .select('user_id, elo_delta')
        .eq('tournament_id', tournamentId);

      if ((eloHist ?? []).length === 0 && mapped.length >= 2) {
        await computeAndSaveEloForTournament(tournamentId, t, mapped);
        const { data: freshHist } = await supabase
          .from('daily_tournament_elo_history')
          .select('user_id, elo_delta')
          .eq('tournament_id', tournamentId);
        const dMap: Record<string, number> = {};
        (freshHist ?? []).forEach((h: any) => { dMap[h.user_id] = h.elo_delta; });
        setEloDeltas(dMap);
      } else {
        const dMap: Record<string, number> = {};
        (eloHist ?? []).forEach((h: any) => { dMap[h.user_id] = h.elo_delta; });
        setEloDeltas(dMap);
      }
    } else {
      setEloDeltas({});
    }

    } catch (e) { captureError(e, { screen: 'DailyTournamentDetail', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [user, tournamentId]);

  useEffect(() => { load(); }, [load]);

  function mapTimerType(wodType: string): TimerType {
    const map: Record<string, TimerType> = {
      'For Time': 'for-time', 'AMRAP': 'amrap', 'EMOM': 'emom', 'Tabata': 'tabata',
    };
    return map[wodType] ?? 'for-time';
  }

  function handleLaunchWOD() {
    if (!tournament) return;
    const tt = mapTimerType(tournament.wod_type);
    const dur = (tournament.duration || 12) * 60;
    navigation.navigate('TimerRun', {
      timerType: tt,
      countdown: 10,
      totalSeconds: tt === 'amrap' || tt === 'emom' ? dur : 0,
      maxTime: tt === 'for-time' ? dur : 0,
      interval: tt === 'emom' ? 60 : 0,
      rounds: 1,
      workTime: tt === 'tabata' ? 20 : 0,
      restTime: tt === 'tabata' ? 10 : 0,
      withCamera: true,
      sequence: '[]',
      videoTitle: tournament.wod_name,
      withTimestamp: true,
    });
  }

  async function handleJoin() {
    if (!user) return;
    // Gender check
    if (tournament?.gender_target && tournament.gender_target !== 'mix') {
      const { data: profile } = await supabase.from('profiles').select('gender').eq('id', user.id).single();
      if (profile?.gender && profile.gender !== tournament.gender_target) {
        const label = tournament.gender_target === 'male' ? 'hommes' : 'femmes';
        Alert.alert('Accès restreint', `Ce tournoi est réservé aux ${label}.`);
        return;
      }
      if (!profile?.gender) {
        Alert.alert('Genre non renseigné', 'Renseigne ton genre dans ton profil pour rejoindre ce tournoi.');
        return;
      }
    }
    setJoining(true);
    const { error } = await supabase.from('daily_tournament_participants').upsert({
      tournament_id: tournamentId,
      user_id: user.id,
    }, { onConflict: 'tournament_id,user_id', ignoreDuplicates: true });
    setJoining(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    trackDailyTournamentJoin(tournamentId);
    load();
  }

  async function handleSubmitScore() {
    const hasInput = tournament?.score_mode === 'time' ? (timeMin.trim() || timeSec.trim()) : scoreInput.trim();
    if (!user || !hasInput) return;
    setSubmitting(true);

    let value = 0;
    if (tournament?.score_mode === 'time') {
      const m = parseInt(timeMin) || 0;
      const s = parseInt(timeSec) || 0;
      value = m * 60 + s;
    } else {
      value = parseFloat(scoreInput);
    }

    if (isNaN(value) || value <= 0) {
      Alert.alert('Valeur invalide', 'Entre un score valide.');
      setSubmitting(false);
      return;
    }

    // Validate video URL if provided
    const trimmedVideo = videoUrl.trim();
    if (trimmedVideo && !/^https?:\/\/.+/i.test(trimmedVideo)) {
      Alert.alert('Lien vidéo invalide', 'Le lien vidéo doit commencer par http:// ou https://');
      setSubmitting(false);
      return;
    }

    // Cap validation for AMRAP / EMOM / Tabata
    const sType = tournament?.score_mode === 'time' ? 'time' : 'reps';
    const maxScore = computeMaxScore(
      tournament?.wod_type,
      tournament?.movements,
      tournament?.duration ? tournament.duration * 60 : null,
      null,
      sType,
    );
    if (maxScore && value > maxScore) {
      Alert.alert('Score trop élevé', `Le maximum estimé pour ce WOD est de ${maxScore} reps. Vérifie ta saisie.`);
      setSubmitting(false);
      return;
    }

    // Inscription implicite au WOD du Jour : soumettre un score = participer.
    if (tournament?.is_official && !hasJoined) {
      await supabase.from('daily_tournament_participants').upsert({
        tournament_id: tournamentId,
        user_id: user.id,
      }, { onConflict: 'tournament_id,user_id', ignoreDuplicates: true });
    }

    const { error } = await supabase.from('daily_tournament_scores').upsert({
      tournament_id: tournamentId,
      user_id: user.id,
      score_value: value,
      rx: scoreRx,
      notes: scoreNotes.trim() || null,
      video_url: videoUrl.trim() || null,
      status: 'pending',
    }, { onConflict: 'tournament_id,user_id' });

    setSubmitting(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    incrementCounter(user.id, 'total_scores_submitted', 1, currentBox?.id).catch(e => captureError(e, { action: 'incrementScores' }));
    cancelTodayScoreReminder().catch(e => captureError(e, { action: 'cancelScoreReminder' }));

    // Log movement reps for badges
    if (tournament?.movements) {
      const lines = tournament.movements.split('\n').filter(Boolean);
      const sType = tournament.score_mode === 'time' ? 'time' : 'reps';
      const completed = computeCompletedMovements(lines, tournament.wod_type, value, sType);
      logMovementReps(user.id, completed, 'daily', tournamentId).catch(e => captureError(e, { action: 'logMovementReps' }));
    }

    trackDailyTournamentScoreSubmit(tournamentId, tournament?.score_mode ?? 'reps');
    hapticSuccess();
    setScoreModal(false);
    setScoreInput('');
    setScoreNotes('');
    setVideoUrl('');

    // Check if all participants scored → complete tournament
    const { count } = await supabase
      .from('daily_tournament_scores')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    if (count && count >= (tournament?.max_players ?? 5)) {
      await completeTournament();
    }

    load();
  }

  async function completeTournament() {
    if (!tournament) return;
    // RPC serveur : complète si tous les scores attendus sont là OU si la fenêtre est
    // expirée. Appelable par TOUT participant — avant, l'update direct échouait en
    // silence (RLS créateur uniquement) quand le dernier score venait d'un autre
    // joueur, et l'ELO n'était jamais distribué.
    const { error } = await supabase.rpc('complete_daily_tournament', { p_tournament_id: tournamentId });
    if (error) captureError(error, { screen: 'DailyTournamentDetail', action: 'completeTournament' });
  }

  async function computeAndSaveEloForTournament(tId: string, _t: any, _parts: Participant[]) {
    // ELO is computed and persisted entirely server-side (idempotent RPC).
    // The client never supplies ELO values; it only triggers the computation.
    const { data, error } = await supabase.rpc('compute_daily_tournament_elo', { p_tournament_id: tId });
    if (error) { captureError(error, { screen: 'DailyTournamentDetail', action: 'computeElo' }); return; }
    for (const r of (data ?? [])) {
      await syncLevelAndBadges(r.user_id, r.elo_after);
    }
  }

  // Validation/contestation par les PAIRS via RPC SECURITY DEFINER : l'update direct
  // était un no-op silencieux (la RLS n'autorise que l'auteur du score) — l'app
  // affichait « validé » sans rien écrire. Le RPC vérifie : relecteur participant,
  // pas son propre score, score encore pending, tournoi non complété.
  async function handleValidateScore(participantId: string) {
    const { error } = await supabase.rpc('peer_review_daily_score', {
      p_tournament_id: tournamentId, p_user_id: participantId, p_action: 'validated',
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
    Alert.alert('✅', 'Score validé !');
    load();
  }

  async function handleContestScore() {
    if (!contestModal || !user) return;
    const { error } = await supabase.rpc('peer_review_daily_score', {
      p_tournament_id: tournamentId, p_user_id: contestModal.user_id,
      p_action: 'contested', p_reason: contestReason.trim() || null,
    });
    if (error) { Alert.alert('Erreur', error.message); return; }
    setContestModal(null);
    setContestReason('');
    Alert.alert('⚠️', 'Score contesté — un administrateur vérifiera.');
    load();
  }

  function timeLeft(): string {
    if (!tournament) return '';
    const diff = new Date(tournament.ends_at).getTime() - Date.now();
    if (diff <= 0) return 'Terminé';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h${String(m).padStart(2, '0')} restantes`;
  }

  if (loading || !tournament) {
    return (
      <View style={[S.screen, S.center]}>
        <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const levelColor = LevelColors[tournament.level] ?? theme.textMuted;
  const isCompleted = tournament.status === 'completed';
  const isOfficial = tournament.is_official === true;
  const isFull = !isOfficial && participants.length >= tournament.max_players;

  const scoreMode = tournament.score_mode ?? 'time';
  // Unresolved contested scores don't hold a rank (mirrors the server ELO rule).
  const rankGroup = (rx: boolean) =>
    participants
      .filter(p => p.score_value !== null && p.status !== 'contested' && p.rx === rx)
      .sort((a, b) => scoreMode === 'time'
        ? (a.score_value ?? 0) - (b.score_value ?? 0)
        : (b.score_value ?? 0) - (a.score_value ?? 0));
  const rxRanked = rankGroup(true);
  const scaledRanked = rankGroup(false);

  // Combined RX-first ranking for the mini-tournament board, contested excluded.
  const rankByUser = new Map<string, number>();
  participants
    .filter(p => p.score_value !== null && p.status !== 'contested')
    .forEach((p, i) => rankByUser.set(p.user_id, i + 1));

  const scaledMovements = tournament.movements_scaled || getScaledMovements(tournament.wod_name, tournament.movements);
  const shownMovements = !isOfficial || boardTab === 'rx' ? tournament.movements : scaledMovements;
  const shownRanked = boardTab === 'rx' ? rxRanked : scaledRanked;

  function renderPlayerRow(p: Participant, rank: number | null, isMe: boolean) {
    const pLevelColor = LevelColors[p.level] ?? theme.textMuted;
    const RankIcon = rank === 1 ? Crown : rank === 2 ? Medal : rank === 3 ? Medal : null;
    const rankColor = rank === 1 ? theme.gold : rank === 2 ? theme.silver : rank === 3 ? theme.bronze : theme.textMuted;
    const statusColor = p.status === 'validated' ? theme.success
      : p.status === 'contested' ? theme.error : theme.warning;
    const statusLabel = p.status === 'validated' ? 'Validé'
      : p.status === 'contested' ? 'Contesté' : 'En attente';

    return (
      <View key={p.user_id} style={[S.playerCard, isMe && S.playerRowMe]}>
        <View style={S.playerRow}>
          <View style={S.rankCol}>
            {RankIcon ? (
              <RankIcon color={rankColor} size={18} />
            ) : (
              <Text style={S.rankNum}>{rank ?? '—'}</Text>
            )}
          </View>
          <View style={S.playerInfo}>
            <Text style={S.playerName}>{p.username} {isMe ? '(moi)' : ''}</Text>
            <View style={S.playerMeta}>
              <View style={[S.levelDot, { backgroundColor: pLevelColor }]} />
              <Text style={[S.levelTxt, { color: pLevelColor }]}>{p.level.toUpperCase()}</Text>
              <Text style={S.eloTxt}>{p.elo} ELO</Text>
              {isCompleted && eloDeltas[p.user_id] != null && (
                <Text style={{ fontSize: 10, fontWeight: '800', color: eloDeltas[p.user_id] > 0 ? '#22c55e' : eloDeltas[p.user_id] < 0 ? '#ef4444' : theme.textMuted }}>
                  {eloDeltas[p.user_id] > 0 ? '+' : ''}{eloDeltas[p.user_id]}
                </Text>
              )}
            </View>
          </View>
          {p.score_value !== null ? (
            <View style={S.scoreCol}>
              <Text style={S.scoreValue}>{formatScore(p.score_value, tournament!.score_mode)}</Text>
              <Text style={S.scoreRx}>{p.rx ? 'RX' : 'SC'}</Text>
            </View>
          ) : (
            <Text style={S.pendingTxt}>En attente…</Text>
          )}
        </View>

        {/* Video + status + actions (only if scored) */}
        {p.score_value !== null && (
          <View style={S.playerActions}>
            <View style={S.playerActionsTop}>
              {p.video_url ? (
                <TouchableOpacity style={S.videoBtn} onPress={async () => {
                  try {
                    const canOpen = await Linking.canOpenURL(p.video_url!);
                    if (canOpen) {
                      await Linking.openURL(p.video_url!);
                    } else {
                      Alert.alert('Lien invalide', `Impossible d'ouvrir ce lien vidéo.\n\n${p.video_url}`);
                    }
                  } catch (e: any) {
                    Alert.alert('Erreur vidéo', e?.message ?? 'Erreur inconnue');
                  }
                }} activeOpacity={0.8}>
                  <Youtube color="#FF0000" size={14} />
                  <Text style={S.videoBtnTxt}>Vidéo</Text>
                </TouchableOpacity>
              ) : (
                <View style={S.noVideoTag}>
                  <Text style={S.noVideoTxt}>Pas de vidéo</Text>
                </View>
              )}
              <View style={[S.statusTag, { backgroundColor: `${statusColor}15` }]}>
                <Text style={[S.statusTxt, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>

            {/* Validate / Contest (only for other participants, not self, and only if pending) */}
            {!isMe && hasJoined && p.status === 'pending' && (
              <View style={S.voteRow}>
                <TouchableOpacity style={S.validateBtn} onPress={() => handleValidateScore(p.user_id)} activeOpacity={0.8}>
                  <ThumbsUp color={theme.success} size={13} />
                  <Text style={[S.voteTxt, { color: theme.success }]}>Valider</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.contestBtn} onPress={() => { setContestModal(p); setContestReason(''); }} activeOpacity={0.8}>
                  <AlertTriangle color={theme.error} size={13} />
                  <Text style={[S.voteTxt, { color: theme.error }]}>Contester</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={S.screen}>
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>{tournament.wod_name}</Text>
        <TouchableOpacity onPress={() => Share.share({ message: `${tournament.wod_name} — Rejoins le mini-tournoi sur AthleX ! athlex://daily/${tournamentId}` })} hitSlop={12}>
          <Share2 color={theme.text} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Status + badges */}
        <View style={S.badges}>
          {isOfficial && (
            <View style={[S.badge, { backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Flame color="#fff" size={10} />
              <Text style={[S.badgeTxt, { color: '#fff' }]}>WOD DU JOUR</Text>
            </View>
          )}
          <View style={[S.badge, { backgroundColor: `${theme.accent}12` }]}>
            <Text style={[S.badgeTxt, { color: theme.accent }]}>{tournament.wod_type}</Text>
          </View>
          <View style={[S.badge, { backgroundColor: `${levelColor}20` }]}>
            <Text style={[S.badgeTxt, { color: levelColor }]}>{tournament.level.toUpperCase()}</Text>
          </View>
          {tournament.duration > 0 && (
            <View style={[S.badge, { backgroundColor: theme.surface }]}>
              <Clock color={theme.textMuted} size={10} />
              <Text style={[S.badgeTxt, { color: theme.textMuted }]}>{tournament.duration} min</Text>
            </View>
          )}
          <View style={[S.badge, { backgroundColor: isCompleted ? '#EF444418' : `${theme.accent}15` }]}>
            <Text style={[S.badgeTxt, { color: isCompleted ? '#EF4444' : theme.accent }]}>
              {isCompleted ? 'TERMINÉ' : timeLeft()}
            </Text>
          </View>
          {tournament.gender_target && tournament.gender_target !== 'mix' && (
            <View style={[S.badge, { backgroundColor: tournament.gender_target === 'male' ? '#3B82F620' : '#EC489920' }]}>
              <Text style={[S.badgeTxt, { color: tournament.gender_target === 'male' ? '#3B82F6' : '#EC4899' }]}>
                {tournament.gender_target === 'male' ? '♂ Homme' : '♀ Femme'}
              </Text>
            </View>
          )}
        </View>

        {/* Reward / official banner */}
        {isOfficial ? (
          <View style={S.rewardCard}>
            <Flame color={theme.accent} size={18} />
            <Text style={S.rewardTxt}>WOD du Jour officiel · classement RX / Scaled · ouvert à toute la communauté</Text>
          </View>
        ) : (
          <View style={S.rewardCard}>
            <Trophy color={theme.gold} size={18} />
            <Text style={S.rewardTxt}>Récompense : +{tournament.elo_reward} ELO pour le 1er</Text>
          </View>
        )}

        {/* RX / Scaled segmented control (official WODs) */}
        {isOfficial && (
          <View style={S.segment}>
            <TouchableOpacity
              style={[S.segmentBtn, boardTab === 'rx' && S.segmentBtnSel]}
              onPress={() => setBoardTab('rx')}
              activeOpacity={0.85}
            >
              <Text style={[S.segmentTxt, boardTab === 'rx' && S.segmentTxtSel]}>RX</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.segmentBtn, boardTab === 'scaled' && S.segmentBtnSel]}
              onPress={() => setBoardTab('scaled')}
              activeOpacity={0.85}
            >
              <Text style={[S.segmentTxt, boardTab === 'scaled' && S.segmentTxtSel]}>Scaled</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* WOD content */}
        <View style={S.wodCard}>
          <View style={S.wodTitleRow}>
            <Text style={S.wodTitle}>{tournament.wod_name}</Text>
            {isOfficial && (
              <View style={[S.wodVariantTag, { backgroundColor: `${theme.accent}15` }]}>
                <Text style={[S.wodVariantTxt, { color: theme.accent }]}>{boardTab === 'rx' ? 'RX' : 'SCALED'}</Text>
              </View>
            )}
          </View>
          {shownMovements.split('\n').map((line, i) => (
            <Text key={i} style={line.startsWith('  ') ? S.wodLine : S.wodHeader}>{line}</Text>
          ))}
          {isOfficial && boardTab === 'scaled' && (
            <Text style={S.wodScaledHint}>Version allégée — adapte encore les charges à ton niveau si besoin.</Text>
          )}
          {tournament.scoring && (
            <View style={S.scoringRow}>
              <Zap color={theme.gold} size={12} />
              <Text style={S.scoringTxt}>{tournament.scoring}</Text>
            </View>
          )}
        </View>

        {/* Leaderboard */}
        {isOfficial ? (
          <>
            <Text style={S.sectionTitle}>Classement {boardTab === 'rx' ? 'RX' : 'Scaled'} ({shownRanked.length})</Text>
            {shownRanked.length === 0 ? (
              <Text style={S.noParticipants}>Aucun score {boardTab === 'rx' ? 'RX' : 'Scaled'} pour le moment.</Text>
            ) : (
              shownRanked.map((p, i) => renderPlayerRow(p, i + 1, p.user_id === user?.id))
            )}
          </>
        ) : (
          <>
            <Text style={S.sectionTitle}>
              Classement ({participants.length}/{tournament.max_players})
            </Text>
            {participants.length === 0 ? (
              <Text style={S.noParticipants}>Aucun participant pour le moment.</Text>
            ) : (
              participants.map((p) => renderPlayerRow(p, rankByUser.get(p.user_id) ?? null, p.user_id === user?.id))
            )}
          </>
        )}

        {/* Action buttons */}
        {!isCompleted && (
          <View style={S.actions}>
            {isOfficial ? (
              !hasScored ? (
                <>
                  <TouchableOpacity style={S.actionBtn} onPress={handleLaunchWOD} activeOpacity={0.85}>
                    <Play color="#fff" size={16} />
                    <Text style={S.actionBtnTxt}>Lancer le WOD</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.secondaryBtn} onPress={() => { setScoreRx(boardTab === 'rx'); setScoreModal(true); }} activeOpacity={0.85}>
                    <Edit3 color={theme.accent} size={16} />
                    <Text style={S.secondaryBtnTxt}>Entrer mon score manuellement</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={S.doneBadge}>
                  <Check color={theme.accent} size={16} />
                  <Text style={S.doneTxt}>Score soumis ✓</Text>
                </View>
              )
            ) : (
            <>
            {!hasJoined && !isFull && (
              <TouchableOpacity style={S.actionBtn} onPress={handleJoin} disabled={joining} activeOpacity={0.85}>
                {joining ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Users color="#fff" size={16} />
                    <Text style={S.actionBtnTxt}>Rejoindre</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {hasJoined && !hasScored && (
              <>
                <TouchableOpacity style={S.actionBtn} onPress={handleLaunchWOD} activeOpacity={0.85}>
                  <Play color="#fff" size={16} />
                  <Text style={S.actionBtnTxt}>Lancer le WOD</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.secondaryBtn} onPress={() => setScoreModal(true)} activeOpacity={0.85}>
                  <Edit3 color={theme.accent} size={16} />
                  <Text style={S.secondaryBtnTxt}>Entrer mon score manuellement</Text>
                </TouchableOpacity>
              </>
            )}
            {hasScored && (
              <View style={S.doneBadge}>
                <Check color={theme.accent} size={16} />
                <Text style={S.doneTxt}>Score soumis ✓</Text>
              </View>
            )}
            </>
            )}
          </View>
        )}

        {!isOfficial && isCompleted && participants.length > 0 && participants[0].score_value !== null && (
          <View style={S.winnerCard}>
            <Crown color={theme.gold} size={22} />
            <Text style={S.winnerTxt}>🏆 {participants[0].username} remporte +{tournament.elo_reward} ELO !</Text>
          </View>
        )}
      </ScrollView>

      {/* Score modal */}
      <Modal visible={scoreModal} transparent animationType="slide" onRequestClose={() => setScoreModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Entrer mon score</Text>
              <TouchableOpacity onPress={() => setScoreModal(false)} hitSlop={8}>
                <X color={theme.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={S.modalLabel}>
              {tournament.score_mode === 'time' ? 'TEMPS (MM:SS)' :
               tournament.score_mode === 'reps' ? 'NOMBRE DE REPS' :
               tournament.score_mode === 'rounds' ? 'NOMBRE DE ROUNDS' : 'POIDS (KG)'}
            </Text>
            {tournament.score_mode === 'time' ? (
              <View style={S.timeRow}>
                <TextInput
                  style={[S.modalInput, S.timeInput]}
                  placeholder="MM"
                  placeholderTextColor={theme.textMuted}
                  value={timeMin}
                  onChangeText={(t) => {
                    const d = t.replace(/\D/g, '').slice(0, 2);
                    setTimeMin(d);
                    if (d.length === 2) secRef.current?.focus();
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  autoFocus
                />
                <Text style={S.timeColon}>:</Text>
                <TextInput
                  ref={secRef}
                  style={[S.modalInput, S.timeInput]}
                  placeholder="SS"
                  placeholderTextColor={theme.textMuted}
                  value={timeSec}
                  onChangeText={(t) => setTimeSec(t.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            ) : (
              <TextInput
                style={S.modalInput}
                value={scoreInput}
                onChangeText={setScoreInput}
                keyboardType="number-pad"
                placeholder="150"
                placeholderTextColor={theme.textMuted}
                autoFocus
              />
            )}

            <View style={S.rxRow}>
              <TouchableOpacity onPress={() => setScoreRx(true)} style={[S.rxBtn, scoreRx && S.rxBtnSel]}>
                <Text style={[S.rxTxt, scoreRx && S.rxTxtSel]}>RX</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setScoreRx(false)} style={[S.rxBtn, !scoreRx && S.rxBtnSel]}>
                <Text style={[S.rxTxt, !scoreRx && S.rxTxtSel]}>Scaled</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[S.modalInput, { minHeight: 50 }]}
              value={scoreNotes}
              onChangeText={setScoreNotes}
              placeholder="Notes (optionnel)"
              placeholderTextColor={theme.textMuted}
              multiline
            />

            <Text style={S.modalLabel}>LIEN VIDÉO YOUTUBE (recommandé)</Text>
            <View style={S.videoInputRow}>
              <Link color={theme.textMuted} size={16} />
              <TextInput
                style={S.videoInput}
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="https://youtube.com/..."
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            <TouchableOpacity
              style={[S.submitBtn, (!(tournament?.score_mode === 'time' ? (timeMin.trim() || timeSec.trim()) : scoreInput.trim()) || submitting) && { opacity: 0.5 }]}
              onPress={handleSubmitScore}
              disabled={!(tournament?.score_mode === 'time' ? (timeMin.trim() || timeSec.trim()) : scoreInput.trim()) || submitting}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Check color="#fff" size={16} />
                  <Text style={S.submitBtnTxt}>Valider mon score</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Contest modal */}
      <Modal visible={!!contestModal} transparent animationType="slide" onRequestClose={() => setContestModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Contester le score</Text>
              <TouchableOpacity onPress={() => setContestModal(null)} hitSlop={8}>
                <X color={theme.textMuted} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={S.contestInfo}>
              {contestModal?.username} — {contestModal?.score_value != null ? formatScore(contestModal.score_value, tournament?.score_mode ?? 'time') : ''}
            </Text>
            <TextInput
              style={[S.modalInput, { minHeight: 80 }]}
              value={contestReason}
              onChangeText={setContestReason}
              placeholder="Raison de la contestation..."
              placeholderTextColor={theme.textMuted}
              multiline
            />
            <TouchableOpacity style={S.contestConfirmBtn} onPress={handleContestScore} activeOpacity={0.85}>
              <AlertTriangle color="#fff" size={16} />
              <Text style={S.contestConfirmTxt}>Confirmer la contestation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.modalCancelBtn} onPress={() => setContestModal(null)}>
              <Text style={S.modalCancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text, flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 140 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  rewardCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${t.gold}12`, borderRadius: 12, padding: 12,
  },
  rewardTxt: { fontSize: 13, fontWeight: '700', color: t.gold },
  wodCard: {
    backgroundColor: t.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: t.border, gap: 4,
  },
  wodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  wodTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  wodVariantTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  wodVariantTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  wodScaledHint: { fontSize: 11, fontStyle: 'italic', color: t.textMuted, marginTop: 6 },
  segment: {
    flexDirection: 'row', gap: 6, backgroundColor: t.surface,
    borderRadius: 12, padding: 4, borderWidth: 1, borderColor: t.border,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentBtnSel: { backgroundColor: t.accent },
  segmentTxt: { fontSize: 13, fontWeight: '800', color: t.textMuted },
  segmentTxtSel: { color: '#fff', fontWeight: '900' },
  wodHeader: { fontSize: 12, fontWeight: '800', color: t.textSecondary },
  wodLine: { fontSize: 13, fontWeight: '600', color: t.text },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  scoringTxt: { fontSize: 11, fontWeight: '700', color: t.textSecondary },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: t.text },
  noParticipants: { fontSize: 13, color: t.textMuted },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
  },
  playerRowMe: { borderColor: t.accent, backgroundColor: `${t.accent}06` },
  rankCol: { width: 28, alignItems: 'center' },
  rankNum: { fontSize: 14, fontWeight: '900', color: t.textMuted },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '700', color: t.text },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  eloTxt: { fontSize: 10, color: t.textMuted, fontWeight: '600' },
  scoreCol: { alignItems: 'flex-end' },
  scoreValue: { fontSize: 16, fontWeight: '900', color: t.text },
  scoreRx: { fontSize: 9, fontWeight: '800', color: t.accent, marginTop: 1 },
  pendingTxt: { fontSize: 11, color: t.textMuted, fontStyle: 'italic' },
  actions: { gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.accent, borderRadius: 12, padding: 14,
  },
  actionBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: `${t.accent}12`, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: `${t.accent}30`,
  },
  secondaryBtnTxt: { color: t.accent, fontSize: 13, fontWeight: '800' },
  doneBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${t.accent}12`, borderRadius: 12, padding: 14,
  },
  doneTxt: { fontSize: 14, fontWeight: '800', color: t.accent },
  winnerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${t.gold}12`, borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: `${t.gold}30`,
  },
  winnerTxt: { fontSize: 14, fontWeight: '900', color: t.gold, flex: 1 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.modalBackdrop },
  modalSheet: {
    backgroundColor: t.modalCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40, gap: 12,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, alignSelf: 'center', marginBottom: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  modalLabel: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: t.surface, borderRadius: 10, borderWidth: 1, borderColor: t.border,
    padding: 12, fontSize: 16, fontWeight: '700', color: t.text,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, textAlign: 'center', fontSize: 22 },
  timeColon: { fontSize: 24, fontWeight: '700', color: t.text },
  rxRow: { flexDirection: 'row', gap: 8 },
  rxBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface,
  },
  rxBtnSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  rxTxt: { fontSize: 13, fontWeight: '700', color: t.textMuted },
  rxTxtSel: { color: t.accent, fontWeight: '900' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.accent, borderRadius: 12, padding: 14,
  },
  submitBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  // Player card with actions
  playerCard: {
    backgroundColor: t.card, borderRadius: 12,
    borderWidth: 1, borderColor: t.border, overflow: 'hidden',
  },
  playerActions: { paddingHorizontal: 12, paddingBottom: 10, gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 8 },
  playerActionsTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  videoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FF000012', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  videoBtnTxt: { fontSize: 11, fontWeight: '700', color: '#FF0000' },
  noVideoTag: { backgroundColor: t.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  noVideoTxt: { fontSize: 11, fontWeight: '600', color: t.textMuted },
  statusTag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusTxt: { fontSize: 11, fontWeight: '800' },
  voteRow: { flexDirection: 'row', gap: 8 },
  validateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: `${t.success}12`, borderRadius: 8, paddingVertical: 8,
    borderWidth: 1, borderColor: `${t.success}25`,
  },
  contestBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: `${t.error}12`, borderRadius: 8, paddingVertical: 8,
    borderWidth: 1, borderColor: `${t.error}25`,
  },
  voteTxt: { fontSize: 12, fontWeight: '700' },
  // Video input in score modal
  videoInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: t.surface, borderRadius: 10, borderWidth: 1, borderColor: t.border,
    paddingHorizontal: 12,
  },
  videoInput: { flex: 1, fontSize: 14, fontWeight: '600', color: t.text, paddingVertical: 12 },
  // Contest modal
  contestInfo: { fontSize: 14, fontWeight: '700', color: t.textSecondary },
  contestConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.error, borderRadius: 12, padding: 14,
  },
  contestConfirmTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modalCancelBtn: { alignItems: 'center', padding: 12 },
  modalCancelTxt: { fontSize: 14, color: t.textMuted, fontWeight: '700' },
}); }
