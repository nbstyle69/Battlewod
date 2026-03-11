import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  ArrowLeft, Users, Clock, Zap, Trophy, Crown, Medal, Check, X,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<any>;
type Route = RouteProp<{ DailyTournamentDetail: { tournamentId: string } }, 'DailyTournamentDetail'>;

interface Participant {
  user_id: string;
  username: string;
  level: string;
  elo: number;
  score_value: number | null;
  rx: boolean;
  submitted_at: string | null;
}

interface TournamentDetail {
  id: string;
  creator_id: string;
  wod_name: string;
  wod_type: string;
  duration: number;
  level: string;
  movements: string;
  scoring: string | null;
  score_mode: string;
  max_players: number;
  status: string;
  elo_reward: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

function formatScore(value: number, mode: string): string {
  if (mode === 'time') {
    const total = Math.round(value);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const units: Record<string, string> = { reps: ' reps', weight: ' kg', rounds: ' rnds' };
  return `${value}${units[mode] ?? ''}`;
}

export default function DailyTournamentDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
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
  const [scoreRx, setScoreRx] = useState(true);
  const [scoreNotes, setScoreNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

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
      .select('user_id, score_value, rx, submitted_at')
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
      };
    });

    // Sort: scored first (by best score), then unscored
    const scoreMode = t?.score_mode ?? 'time';
    mapped.sort((a, b) => {
      if (a.score_value === null && b.score_value === null) return 0;
      if (a.score_value === null) return 1;
      if (b.score_value === null) return -1;
      return scoreMode === 'time'
        ? a.score_value - b.score_value
        : b.score_value - a.score_value;
    });

    setParticipants(mapped);
    setHasJoined(mapped.some(p => p.user_id === user.id));
    setHasScored(mapped.some(p => p.user_id === user.id && p.score_value !== null));
    setLoading(false);
    setRefreshing(false);
  }, [user, tournamentId]);

  useEffect(() => { load(); }, [load]);

  async function handleJoin() {
    if (!user) return;
    setJoining(true);
    const { error } = await supabase.from('daily_tournament_participants').insert({
      tournament_id: tournamentId,
      user_id: user.id,
    });
    setJoining(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    load();
  }

  async function handleSubmitScore() {
    if (!user || !scoreInput.trim()) return;
    setSubmitting(true);

    let value = parseFloat(scoreInput);
    // If time mode and input is MM:SS format
    if (tournament?.score_mode === 'time' && scoreInput.includes(':')) {
      const [m, s] = scoreInput.split(':').map(Number);
      value = (m || 0) * 60 + (s || 0);
    }

    if (isNaN(value) || value <= 0) {
      Alert.alert('Valeur invalide', 'Entre un score valide.');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from('daily_tournament_scores').upsert({
      tournament_id: tournamentId,
      user_id: user.id,
      score_value: value,
      rx: scoreRx,
      notes: scoreNotes.trim() || null,
    }, { onConflict: 'tournament_id,user_id' });

    setSubmitting(false);
    if (error) { Alert.alert('Erreur', error.message); return; }

    setScoreModal(false);
    setScoreInput('');
    setScoreNotes('');

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
    // Get all scores sorted
    const { data: allScores } = await supabase
      .from('daily_tournament_scores')
      .select('user_id, score_value')
      .eq('tournament_id', tournamentId)
      .order('score_value', { ascending: tournament.score_mode === 'time' });

    if (!allScores || allScores.length === 0) return;

    // Winner gets ELO reward
    const winnerId = allScores[0].user_id;
    const { data: winnerProfile } = await supabase
      .from('profiles')
      .select('elo, wins')
      .eq('id', winnerId)
      .single();

    if (winnerProfile) {
      await supabase.from('profiles').update({
        elo: (winnerProfile.elo ?? 1000) + tournament.elo_reward,
        wins: (winnerProfile.wins ?? 0) + 1,
      }).eq('id', winnerId);
    }

    // Update all participants total_matches
    for (const s of allScores) {
      const { data: p } = await supabase.from('profiles').select('total_matches').eq('id', s.user_id).single();
      if (p) {
        await supabase.from('profiles').update({ total_matches: (p.total_matches ?? 0) + 1 }).eq('id', s.user_id);
      }
    }

    // Mark tournament completed
    await supabase.from('daily_tournaments').update({ status: 'completed' }).eq('id', tournamentId);
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
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const levelColor = LevelColors[tournament.level] ?? Colors.textMuted;
  const isCompleted = tournament.status === 'completed';
  const isFull = participants.length >= tournament.max_players;

  return (
    <View style={S.screen}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft color={Colors.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>{tournament.wod_name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Status + badges */}
        <View style={S.badges}>
          <View style={[S.badge, { backgroundColor: `${Colors.primary}12` }]}>
            <Text style={[S.badgeTxt, { color: Colors.primary }]}>{tournament.wod_type}</Text>
          </View>
          <View style={[S.badge, { backgroundColor: `${levelColor}20` }]}>
            <Text style={[S.badgeTxt, { color: levelColor }]}>{tournament.level.toUpperCase()}</Text>
          </View>
          {tournament.duration > 0 && (
            <View style={[S.badge, { backgroundColor: Colors.surface }]}>
              <Clock color={Colors.textMuted} size={10} />
              <Text style={[S.badgeTxt, { color: Colors.textMuted }]}>{tournament.duration} min</Text>
            </View>
          )}
          <View style={[S.badge, { backgroundColor: isCompleted ? '#EF444418' : `${Colors.accent}15` }]}>
            <Text style={[S.badgeTxt, { color: isCompleted ? '#EF4444' : Colors.accent }]}>
              {isCompleted ? 'TERMINÉ' : timeLeft()}
            </Text>
          </View>
        </View>

        {/* Reward */}
        <View style={S.rewardCard}>
          <Trophy color={Colors.gold} size={18} />
          <Text style={S.rewardTxt}>Récompense : +{tournament.elo_reward} ELO pour le 1er</Text>
        </View>

        {/* WOD content */}
        <View style={S.wodCard}>
          <Text style={S.wodTitle}>{tournament.wod_name}</Text>
          {tournament.movements.split('\n').map((line, i) => (
            <Text key={i} style={line.startsWith('  ') ? S.wodLine : S.wodHeader}>{line}</Text>
          ))}
          {tournament.scoring && (
            <View style={S.scoringRow}>
              <Zap color={Colors.gold} size={12} />
              <Text style={S.scoringTxt}>{tournament.scoring}</Text>
            </View>
          )}
        </View>

        {/* Leaderboard */}
        <Text style={S.sectionTitle}>
          Classement ({participants.length}/{tournament.max_players})
        </Text>

        {participants.length === 0 ? (
          <Text style={S.noParticipants}>Aucun participant pour le moment.</Text>
        ) : (
          participants.map((p, i) => {
            const isMe = p.user_id === user?.id;
            const pLevelColor = LevelColors[p.level] ?? Colors.textMuted;
            const rank = p.score_value !== null ? i + 1 : null;
            const RankIcon = rank === 1 ? Crown : rank === 2 ? Medal : rank === 3 ? Medal : null;
            const rankColor = rank === 1 ? Colors.gold : rank === 2 ? Colors.silver : rank === 3 ? Colors.bronze : Colors.textMuted;

            return (
              <View key={p.user_id} style={[S.playerRow, isMe && S.playerRowMe]}>
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
                  </View>
                </View>
                {p.score_value !== null ? (
                  <View style={S.scoreCol}>
                    <Text style={S.scoreValue}>{formatScore(p.score_value, tournament.score_mode)}</Text>
                    <Text style={S.scoreRx}>{p.rx ? 'RX' : 'SC'}</Text>
                  </View>
                ) : (
                  <Text style={S.pendingTxt}>En attente…</Text>
                )}
              </View>
            );
          })
        )}

        {/* Action buttons */}
        {!isCompleted && (
          <View style={S.actions}>
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
              <TouchableOpacity style={S.actionBtn} onPress={() => setScoreModal(true)} activeOpacity={0.85}>
                <Zap color="#fff" size={16} />
                <Text style={S.actionBtnTxt}>Entrer mon score</Text>
              </TouchableOpacity>
            )}
            {hasScored && (
              <View style={S.doneBadge}>
                <Check color={Colors.accent} size={16} />
                <Text style={S.doneTxt}>Score soumis ✓</Text>
              </View>
            )}
          </View>
        )}

        {isCompleted && participants.length > 0 && participants[0].score_value !== null && (
          <View style={S.winnerCard}>
            <Crown color={Colors.gold} size={22} />
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
                <X color={Colors.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={S.modalLabel}>
              {tournament.score_mode === 'time' ? 'TEMPS (MM:SS ou secondes)' :
               tournament.score_mode === 'reps' ? 'NOMBRE DE REPS' :
               tournament.score_mode === 'rounds' ? 'NOMBRE DE ROUNDS' : 'POIDS (KG)'}
            </Text>
            <TextInput
              style={S.modalInput}
              value={scoreInput}
              onChangeText={setScoreInput}
              keyboardType="numeric"
              placeholder={tournament.score_mode === 'time' ? '12:30' : '150'}
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

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
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <TouchableOpacity
              style={[S.submitBtn, (!scoreInput.trim() || submitting) && { opacity: 0.5 }]}
              onPress={handleSubmitScore}
              disabled={!scoreInput.trim() || submitting}
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
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  rewardCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.gold}12`, borderRadius: 12, padding: 12,
  },
  rewardTxt: { fontSize: 13, fontWeight: '700', color: Colors.gold },
  wodCard: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  wodTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 4 },
  wodHeader: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  wodLine: { fontSize: 13, fontWeight: '600', color: Colors.text },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  scoringTxt: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: Colors.text },
  noParticipants: { fontSize: 13, color: Colors.textMuted },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  playerRowMe: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}06` },
  rankCol: { width: 28, alignItems: 'center' },
  rankNum: { fontSize: 14, fontWeight: '900', color: Colors.textMuted },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  playerMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  eloTxt: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  scoreCol: { alignItems: 'flex-end' },
  scoreValue: { fontSize: 16, fontWeight: '900', color: Colors.text },
  scoreRx: { fontSize: 9, fontWeight: '800', color: Colors.accent, marginTop: 1 },
  pendingTxt: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  actions: { gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 14,
  },
  actionBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  doneBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${Colors.accent}12`, borderRadius: 12, padding: 14,
  },
  doneTxt: { fontSize: 14, fontWeight: '800', color: Colors.accent },
  winnerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${Colors.gold}12`, borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: `${Colors.gold}30`,
  },
  winnerTxt: { fontSize: 14, fontWeight: '900', color: Colors.gold, flex: 1 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40, gap: 12,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  modalLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    padding: 12, fontSize: 16, fontWeight: '700', color: Colors.text,
  },
  rxRow: { flexDirection: 'row', gap: 8 },
  rxBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  rxBtnSel: { backgroundColor: `${Colors.accent}15`, borderColor: Colors.accent },
  rxTxt: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  rxTxtSel: { color: Colors.accent, fontWeight: '900' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 14,
  },
  submitBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
