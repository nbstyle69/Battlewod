import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { ChevronLeft, Clock, Plus, RotateCcw, MessageSquare, Trophy } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWOD, WODScore, ScoreType } from '../../types';
import { WhiteboardStackParamList } from '../../navigation';

type Nav   = NativeStackNavigationProp<WhiteboardStackParamList>;
type Route = RouteProp<WhiteboardStackParamList, 'WODDetail'>;

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

function allowedScoreTypes(wodType?: string | null): { types: ScoreType[]; default: ScoreType } {
  switch (wodType) {
    case 'for-time': return { types: ['time'],            default: 'time'   };
    case 'amrap':    return { types: ['reps'],            default: 'reps'   };
    case 'emom':     return { types: ['reps', 'rounds'],  default: 'rounds' };
    case 'tabata':   return { types: ['reps'],            default: 'reps'   };
    case 'strength': return { types: ['weight'],          default: 'weight' };
    default:         return { types: ['time', 'reps', 'weight', 'rounds'], default: 'reps' };
  }
}

function formatScore(score: WODScore): string {
  if (score.score_type === 'time') {
    const total = Math.round(score.score_value);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const units: Record<ScoreType, string> = { time: 's', reps: ' reps', weight: ' kg', rounds: ' rounds' };
  return `${score.score_value}${units[score.score_type] ?? ''}`;
}

// ── ELO Calculation ──────────────────────────────────────────────────────
const K = 32;

function calculateEloDeltas(rankedScores: { member_id: string; elo: number; rank: number }[]) {
  const n = rankedScores.length;
  if (n < 2) return rankedScores.map(s => ({ ...s, delta: 0 }));

  const results: { member_id: string; elo: number; rank: number; delta: number }[] = [];

  for (const player of rankedScores) {
    let expectedScore = 0;
    let actualScore = 0;

    for (const opponent of rankedScores) {
      if (opponent.member_id === player.member_id) continue;
      const exp = 1 / (1 + Math.pow(10, (opponent.elo - player.elo) / 400));
      expectedScore += exp;

      if (player.rank < opponent.rank) actualScore += 1;
      else if (player.rank === opponent.rank) actualScore += 0.5;
    }

    const delta = Math.round((K / (n - 1)) * (actualScore - expectedScore));
    results.push({ ...player, delta });
  }

  return results;
}

async function computeAndSaveElo(wodId: string, boxId: string, scores: WODScore[], isTimeBased: boolean) {
  if (scores.length < 2) return;

  // Get current ELO for all participants
  const memberIds = scores.map(s => s.member_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, elo')
    .in('id', memberIds);

  if (!profiles) return;

  const eloMap: Record<string, number> = {};
  for (const p of profiles) eloMap[p.id] = p.elo ?? 1000;

  // Sort scores: for time => ascending (lower is better), else descending (higher is better)
  const sorted = [...scores].sort((a, b) =>
    isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value
  );

  // Assign ranks (handle ties)
  const ranked = sorted.map((s, i) => {
    let rank = i + 1;
    if (i > 0 && sorted[i].score_value === sorted[i - 1].score_value) {
      rank = ranked[i - 1]?.rank ?? rank;
    }
    return { member_id: s.member_id, elo: eloMap[s.member_id] ?? 1000, rank };
  });

  const deltas = calculateEloDeltas(ranked);

  // Upsert elo_history
  const historyRows = deltas.map(d => ({
    box_id: boxId,
    wod_id: wodId,
    member_id: d.member_id,
    elo_before: d.elo,
    elo_after: d.elo + d.delta,
    elo_delta: d.delta,
    rank: d.rank,
  }));

  await supabase.from('elo_history').upsert(historyRows, { onConflict: 'wod_id,member_id' });

  // Update profiles
  for (const d of deltas) {
    await supabase
      .from('profiles')
      .update({ elo: d.elo + d.delta })
      .eq('id', d.member_id);
  }
}

// ─────────────────────────────────────────────────────────────────────────

export default function WODDetailScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { wodId } = route.params;
  const S = createStyles(theme);

  const [wod,         setWod]         = useState<BoxWOD | null>(null);
  const [scores,      setScores]      = useState<WODScore[]>([]);
  const [myScore,     setMyScore]     = useState<WODScore | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);

  // Score form
  const [scoreType,  setScoreType]  = useState<ScoreType>('reps');
  const [scoreInput, setScoreInput] = useState('');
  const [isRx,       setIsRx]       = useState(true);
  const [noteInput,  setNoteInput]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data: wodData } = await supabase.from('box_wods').select('*').eq('id', wodId).single();
    const w = wodData as BoxWOD | null;
    setWod(w);

    if (w) {
      const { data: scoreData } = await supabase
        .from('wod_scores')
        .select('*, profile:profiles(id, username, avatar_url, level)')
        .eq('wod_id', w.id)
        .order('score_value', { ascending: w.wod_type === 'for-time' });

      const list = (scoreData ?? []) as WODScore[];
      setScores(list);
      setMyScore(list.find(sc => sc.member_id === user?.id) ?? null);
      setScoreType(allowedScoreTypes(w.wod_type).default);
    }
    setLoading(false);
    setRefreshing(false);
  }, [wodId, user?.id]);

  useEffect(() => { load(); }, [load]);

  async function submitScore() {
    if (!wod || !user || !currentBox) return;
    let value = 0;
    if (scoreType === 'time') {
      const parts = scoreInput.split(':');
      if (parts.length === 2) value = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      else value = parseInt(scoreInput);
    } else {
      value = parseFloat(scoreInput);
    }
    if (isNaN(value) || value <= 0) { Alert.alert('Score invalide'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('wod_scores').upsert({
      wod_id: wod.id,
      member_id: user.id,
      box_id: currentBox.id,
      score_type: scoreType,
      score_value: value,
      rx: isRx,
      scaled: !isRx,
      notes: noteInput.trim() || null,
    }, { onConflict: 'wod_id,member_id' });

    if (error) { setSubmitting(false); Alert.alert('Erreur', error.message); return; }

    // Reload scores then compute ELO
    const { data: updatedScores } = await supabase
      .from('wod_scores')
      .select('*, profile:profiles(id, username, avatar_url, level)')
      .eq('wod_id', wod.id)
      .order('score_value', { ascending: wod.wod_type === 'for-time' });

    const list = (updatedScores ?? []) as WODScore[];
    setScores(list);
    setMyScore(list.find(sc => sc.member_id === user.id) ?? null);

    // ELO calculation
    await computeAndSaveElo(wod.id, currentBox.id, list, wod.wod_type === 'for-time');

    setSubmitting(false);
    setModalOpen(false);
    setScoreInput('');
    setNoteInput('');
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!wod) {
    return (
      <View style={S.container}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <ChevronLeft color={theme.text} size={22} />
          </TouchableOpacity>
          <Text style={S.headerTitle}>WOD introuvable</Text>
        </View>
      </View>
    );
  }

  const color = TYPE_COLORS[wod.wod_type ?? 'custom'] ?? '#6B7280';
  const myRank = myScore ? scores.findIndex(s => s.id === myScore.id) + 1 : null;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>{wod.title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* WOD info card */}
        <View style={S.wodCard}>
          <View style={S.wodMeta}>
            <View style={[S.typeBadge, { backgroundColor: `${color}18` }]}>
              <Text style={[S.typeBadgeText, { color }]}>{(wod.wod_type ?? 'custom').toUpperCase()}</Text>
            </View>
            {wod.block_name && (
              <View style={S.blockBadge}>
                <Text style={S.blockBadgeText}>Block {wod.block_name}</Text>
              </View>
            )}
            {wod.time_cap_seconds && (
              <View style={S.timeCap}>
                <Clock color={theme.textMuted} size={12} />
                <Text style={S.timeCapText}>Cap {Math.floor(wod.time_cap_seconds / 60)} min</Text>
              </View>
            )}
          </View>

          <Text style={S.wodDate}>
            {new Date(wod.scheduled_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>

          {wod.description && <Text style={S.wodDesc}>{wod.description}</Text>}
          {wod.notes && (
            <View style={S.notesBox}>
              <Text style={S.notesLabel}>Notes coach</Text>
              <Text style={S.notesText}>{wod.notes}</Text>
            </View>
          )}

          {/* My score */}
          {myScore ? (
            <View style={S.myScoreRow}>
              <View style={S.myScoreBadge}>
                <Text style={S.myScoreLabel}>Mon score</Text>
                <Text style={S.myScoreValue}>{formatScore(myScore)}</Text>
                <Text style={S.myScoreRx}>{myScore.rx ? 'RX' : 'Scaled'}</Text>
              </View>
              {myRank && (
                <View style={S.myRankBadge}>
                  <Trophy color={myRank <= 3 ? theme.gold : theme.textMuted} size={14} />
                  <Text style={[S.myRankText, myRank <= 3 && { color: theme.gold }]}>#{myRank}</Text>
                </View>
              )}
              <TouchableOpacity style={S.editScoreBtn} onPress={() => setModalOpen(true)} activeOpacity={0.7}>
                <RotateCcw color={theme.accent} size={14} />
                <Text style={S.editScoreBtnText}>Modifier</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={S.enterScoreBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
              <Plus color="#fff" size={18} />
              <Text style={S.enterScoreBtnText}>Entrer mon score</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Leaderboard */}
        {scores.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Classement · {scores.length} score{scores.length > 1 ? 's' : ''}</Text>
            <View style={S.leaderboard}>
              {scores.map((sc, i) => {
                const isMe = sc.member_id === user?.id;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <TouchableOpacity
                    key={sc.id}
                    style={[S.leaderRow, isMe && S.leaderRowMe]}
                    onPress={() => {
                      const profileId = (sc.profile as any)?.id;
                      if (profileId) navigation.navigate('PublicProfile', { userId: profileId });
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={S.leaderRank}>{medal ?? `${i + 1}`}</Text>
                    <View style={S.leaderAvatar}>
                      <Text style={S.leaderAvatarText}>
                        {((sc.profile as any)?.username?.[0] ?? '?').toUpperCase()}
                      </Text>
                    </View>
                    <View style={S.leaderMid}>
                      <Text style={S.leaderName}>
                        {(sc.profile as any)?.username ?? 'Athlète'}{isMe ? ' (moi)' : ''}
                      </Text>
                      <Text style={S.leaderRxTag}>{sc.rx ? 'RX' : 'Scaled'}</Text>
                    </View>
                    <View style={S.leaderRight}>
                      <Text style={[S.leaderScore, i === 0 && S.leaderScoreGold]}>{formatScore(sc)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Score Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Entrer mon score</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalCloseText}>Annuler</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={S.modalWodName}>{wod.title}</Text>

              {/* Score type */}
              {(() => {
                const allowed = allowedScoreTypes(wod.wod_type);
                if (allowed.types.length === 1) {
                  return (
                    <>
                      <Text style={S.modalLabel}>TYPE DE SCORE</Text>
                      <View style={S.typeRow}>
                        <View style={[S.typeChip, S.typeChipActive]}>
                          <Text style={[S.typeChipText, S.typeChipTextActive]}>{allowed.types[0].toUpperCase()}</Text>
                        </View>
                      </View>
                    </>
                  );
                }
                return (
                  <>
                    <Text style={S.modalLabel}>TYPE DE SCORE</Text>
                    <View style={S.typeRow}>
                      {allowed.types.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[S.typeChip, scoreType === t && S.typeChipActive]}
                          onPress={() => setScoreType(t)}
                        >
                          <Text style={[S.typeChipText, scoreType === t && S.typeChipTextActive]}>
                            {t.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                );
              })()}

              <Text style={S.modalLabel}>
                {scoreType === 'time' ? 'TEMPS (MM:SS)' : scoreType === 'weight' ? 'POIDS (kg)' : scoreType === 'reps' ? 'REPS' : 'ROUNDS'}
              </Text>
              <TextInput
                style={S.scoreInput}
                placeholder={scoreType === 'time' ? '14:32' : '150'}
                placeholderTextColor={theme.textMuted}
                value={scoreInput}
                onChangeText={setScoreInput}
                keyboardType={scoreType === 'time' ? 'default' : 'numeric'}
                autoFocus
              />

              <Text style={S.modalLabel}>NIVEAU</Text>
              <View style={S.rxRow}>
                <TouchableOpacity style={[S.rxChip, isRx && S.rxChipActive]} onPress={() => setIsRx(true)}>
                  <Text style={[S.rxChipText, isRx && S.rxChipTextActive]}>RX</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.rxChip, !isRx && S.rxChipActiveScaled]} onPress={() => setIsRx(false)}>
                  <Text style={[S.rxChipText, !isRx && S.rxChipTextActive]}>Scaled</Text>
                </TouchableOpacity>
              </View>

              <Text style={S.modalLabel}>NOTES (optionnel)</Text>
              <TextInput
                style={[S.scoreInput, { minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Commentaire, mouvements adaptés…"
                placeholderTextColor={theme.textMuted}
                value={noteInput}
                onChangeText={setNoteInput}
                multiline
              />

              <TouchableOpacity
                style={[S.submitBtn, (!scoreInput.trim() || submitting) && S.submitBtnDisabled]}
                onPress={submitScore}
                disabled={!scoreInput.trim() || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.submitBtnText}>Valider le score</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: theme.text, flex: 1, textAlign: 'center' },
  wodCard: {
    margin: 16, backgroundColor: theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
  },
  wodMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  blockBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: `${theme.accent}15`, borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  blockBadgeText: { fontSize: 10, fontWeight: '800', color: theme.accent },
  timeCap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeCapText: { fontSize: 11, color: theme.textMuted },
  wodDate: { fontSize: 12, color: theme.textMuted, fontWeight: '600', textTransform: 'capitalize' },
  wodDesc: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  notesBox: { backgroundColor: theme.surface, borderRadius: 8, padding: 10, gap: 4 },
  notesLabel: { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 0.5 },
  notesText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  myScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  myScoreLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  myScoreValue: { fontSize: 20, fontWeight: '900', color: theme.text },
  myScoreRx: {
    fontSize: 11, fontWeight: '700', color: theme.success,
    backgroundColor: `${theme.success}15`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  myRankBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 },
  myRankText: { fontSize: 16, fontWeight: '900', color: theme.text },
  editScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editScoreBtnText: { fontSize: 12, color: theme.accent, fontWeight: '700' },
  enterScoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: theme.accent, borderRadius: 12, padding: 14, marginTop: 4,
  },
  enterScoreBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  section: { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: theme.text, marginBottom: 12, letterSpacing: -0.2 },
  leaderboard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  leaderRowMe: { backgroundColor: `${theme.accent}10` },
  leaderRank: { width: 24, fontSize: 16, textAlign: 'center' },
  leaderAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  leaderAvatarText: { fontSize: 13, fontWeight: '800', color: theme.text },
  leaderMid: { flex: 1 },
  leaderName: { fontSize: 13, fontWeight: '700', color: theme.text },
  leaderRxTag: { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
  leaderRight: { alignItems: 'flex-end' },
  leaderScore: { fontSize: 15, fontWeight: '900', color: theme.text, fontVariant: ['tabular-nums'] },
  leaderScoreGold: { color: theme.gold },
  modalContainer: { flex: 1, backgroundColor: theme.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: theme.text },
  modalCloseText: { fontSize: 14, color: theme.accent, fontWeight: '700' },
  modalBody: { padding: 20, gap: 12 },
  modalWodName: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 4 },
  modalLabel: { fontSize: 11, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  typeChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  typeChipText: { fontSize: 11, fontWeight: '800', color: theme.textMuted },
  typeChipTextActive: { color: '#fff' },
  scoreInput: {
    backgroundColor: theme.card, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 18, color: theme.text, fontWeight: '700',
  },
  rxRow: { flexDirection: 'row', gap: 10 },
  rxChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    alignItems: 'center',
  },
  rxChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  rxChipActiveScaled: { backgroundColor: theme.warning, borderColor: theme.warning },
  rxChipText: { fontSize: 13, fontWeight: '800', color: theme.textMuted },
  rxChipTextActive: { color: '#fff' },
  submitBtn: {
    backgroundColor: theme.accent, borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
}); }
