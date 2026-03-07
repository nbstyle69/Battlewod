import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Plus, Clock, RotateCcw, MessageSquare, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../theme/colors';
import { BoxWOD, WODScore, ScoreType } from '../../types';

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

function WodTypeBadge({ type }: { type?: string }) {
  const colors: Record<string, string> = {
    'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
    tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
  };
  const color = colors[type ?? 'custom'] ?? '#6B7280';
  return (
    <View style={[s.typeBadge, { backgroundColor: `${color}18` }]}>
      <Text style={[s.typeBadgeText, { color }]}>{(type ?? 'custom').toUpperCase()}</Text>
    </View>
  );
}

export default function WhiteboardScreen() {
  const { user, currentBox } = useAuth();

  const [todayWOD,    setTodayWOD]    = useState<BoxWOD | null>(null);
  const [scores,      setScores]      = useState<WODScore[]>([]);
  const [myScore,     setMyScore]     = useState<WODScore | null>(null);
  const [recentWODs,  setRecentWODs]  = useState<BoxWOD[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);

  // Score form state
  const [scoreType,  setScoreType]  = useState<ScoreType>('time');
  const [scoreInput, setScoreInput] = useState('');
  const [isRx,       setIsRx]       = useState(true);
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }

    const [{ data: wods }, { data: recentData }] = await Promise.all([
      supabase
        .from('box_wods')
        .select('*')
        .eq('box_id', currentBox.id)
        .eq('scheduled_date', today)
        .eq('is_published', true)
        .limit(1),
      supabase
        .from('box_wods')
        .select('*')
        .eq('box_id', currentBox.id)
        .eq('is_published', true)
        .lt('scheduled_date', today)
        .order('scheduled_date', { ascending: false })
        .limit(5),
    ]);

    const wod = wods?.[0] ?? null;
    setTodayWOD(wod);
    setRecentWODs((recentData ?? []) as BoxWOD[]);

    if (wod) {
      const { data: scoreData } = await supabase
        .from('wod_scores')
        .select('*, profile:profiles(id, username, avatar_url, level)')
        .eq('wod_id', wod.id)
        .order('score_value', { ascending: wod.wod_type === 'for-time' });

      const list = (scoreData ?? []) as WODScore[];
      setScores(list);
      setMyScore(list.find(sc => sc.member_id === user?.id) ?? null);
      if (wod.wod_type) setScoreType(wod.wod_type === 'for-time' ? 'time' : 'reps');
    }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, today, user?.id]);

  useEffect(() => { load(); }, [load]);

  async function submitScore() {
    if (!todayWOD || !user || !currentBox) return;
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
      wod_id: todayWOD.id,
      member_id: user.id,
      box_id: currentBox.id,
      score_type: scoreType,
      score_value: value,
      rx: isRx,
      scaled: !isRx,
      notes: notes.trim() || null,
    }, { onConflict: 'wod_id,member_id' });
    setSubmitting(false);

    if (error) { Alert.alert('Erreur', error.message); return; }
    setModalOpen(false);
    setScoreInput('');
    setNotes('');
    load();
  }

  if (!currentBox) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Whiteboard</Text>
        </View>
        <View style={s.empty}>
          <Text style={s.emptyText}>Rejoins une box pour voir le Whiteboard 🏋️</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Whiteboard</Text>
          <Text style={s.headerSub}>{currentBox.name}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* WOD du jour */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>WOD du jour</Text>
          {todayWOD ? (
            <View style={s.wodCard}>
              <View style={s.wodCardTop}>
                <WodTypeBadge type={todayWOD.wod_type} />
                {todayWOD.time_cap_seconds && (
                  <View style={s.timeCap}>
                    <Clock color={Colors.textMuted} size={12} />
                    <Text style={s.timeCapText}>
                      Cap {Math.floor(todayWOD.time_cap_seconds / 60)} min
                    </Text>
                  </View>
                )}
              </View>
              <Text style={s.wodTitle}>{todayWOD.title}</Text>
              {todayWOD.description && (
                <Text style={s.wodDesc}>{todayWOD.description}</Text>
              )}
              {todayWOD.notes && (
                <View style={s.notesBox}>
                  <Text style={s.notesText}>{todayWOD.notes}</Text>
                </View>
              )}

              {myScore ? (
                <View style={s.myScoreRow}>
                  <View style={s.myScoreBadge}>
                    <Text style={s.myScoreLabel}>Mon score</Text>
                    <Text style={s.myScoreValue}>{formatScore(myScore)}</Text>
                    <Text style={s.myScoreRx}>{myScore.rx ? 'RX' : 'Scaled'}</Text>
                  </View>
                  <TouchableOpacity style={s.editScoreBtn} onPress={() => setModalOpen(true)} activeOpacity={0.7}>
                    <RotateCcw color={Colors.primary} size={14} />
                    <Text style={s.editScoreBtnText}>Modifier</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.enterScoreBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
                  <Plus color="#fff" size={18} />
                  <Text style={s.enterScoreBtnText}>Entrer mon score</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={s.noWodCard}>
              <Text style={s.noWodEmoji}>📋</Text>
              <Text style={s.noWodText}>Pas de WOD publié aujourd'hui</Text>
            </View>
          )}
        </View>

        {/* Classement */}
        {todayWOD && scores.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Classement · {scores.length} score{scores.length > 1 ? 's' : ''}</Text>
            <View style={s.leaderboard}>
              {scores.map((sc, i) => {
                const isMe = sc.member_id === user?.id;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <View key={sc.id} style={[s.leaderRow, isMe && s.leaderRowMe]}>
                    <Text style={s.leaderRank}>{medal ?? `${i + 1}`}</Text>
                    <View style={s.leaderAvatar}>
                      <Text style={s.leaderAvatarText}>
                        {((sc.profile as any)?.username?.[0] ?? '?').toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.leaderMid}>
                      <Text style={s.leaderName}>
                        {(sc.profile as any)?.username ?? 'Athlète'}{isMe ? ' (moi)' : ''}
                      </Text>
                      <Text style={s.leaderRxTag}>{sc.rx ? 'RX' : 'Scaled'}</Text>
                    </View>
                    <View style={s.leaderRight}>
                      <Text style={[s.leaderScore, i === 0 && s.leaderScoreGold]}>{formatScore(sc)}</Text>
                    </View>
                    <TouchableOpacity style={s.commentBtn} activeOpacity={0.7}>
                      <MessageSquare color={Colors.textMuted} size={14} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Historique */}
        {recentWODs.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>WODs récents</Text>
            {recentWODs.map(wod => (
              <TouchableOpacity key={wod.id} style={s.historyRow} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <View style={s.historyTop}>
                    <WodTypeBadge type={wod.wod_type} />
                    <Text style={s.historyDate}>
                      {new Date(wod.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={s.historyTitle}>{wod.title}</Text>
                </View>
                <ChevronRight color={Colors.textMuted} size={16} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Score Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Entrer mon score</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={s.modalClose}>
                <Text style={s.modalCloseText}>Annuler</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              {todayWOD && (
                <Text style={s.modalWodName}>{todayWOD.title}</Text>
              )}

              {/* Score type */}
              <Text style={s.modalLabel}>TYPE DE SCORE</Text>
              <View style={s.typeRow}>
                {(['time', 'reps', 'weight', 'rounds'] as ScoreType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeChip, scoreType === t && s.typeChipActive]}
                    onPress={() => setScoreType(t)}
                  >
                    <Text style={[s.typeChipText, scoreType === t && s.typeChipTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Score input */}
              <Text style={s.modalLabel}>
                {scoreType === 'time' ? 'TEMPS (MM:SS)' : scoreType === 'weight' ? 'POIDS (kg)' : scoreType === 'reps' ? 'REPS' : 'ROUNDS'}
              </Text>
              <TextInput
                style={s.scoreInput}
                placeholder={scoreType === 'time' ? '14:32' : '150'}
                placeholderTextColor={Colors.textMuted}
                value={scoreInput}
                onChangeText={setScoreInput}
                keyboardType={scoreType === 'time' ? 'default' : 'numeric'}
                autoFocus
              />

              {/* RX / Scaled */}
              <Text style={s.modalLabel}>NIVEAU</Text>
              <View style={s.rxRow}>
                <TouchableOpacity style={[s.rxChip, isRx && s.rxChipActive]} onPress={() => setIsRx(true)}>
                  <Text style={[s.rxChipText, isRx && s.rxChipTextActive]}>RX</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.rxChip, !isRx && s.rxChipActiveScaled]} onPress={() => setIsRx(false)}>
                  <Text style={[s.rxChipText, !isRx && s.rxChipTextActive]}>Scaled</Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <Text style={s.modalLabel}>NOTES (optionnel)</Text>
              <TextInput
                style={[s.scoreInput, { minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Commentaire, mouvements adaptés…"
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <TouchableOpacity
                style={[s.submitBtn, (!scoreInput.trim() || submitting) && s.submitBtnDisabled]}
                onPress={submitScore}
                disabled={!scoreInput.trim() || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.submitBtnText}>Valider le score</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: Colors.text },
  headerSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 1 },

  section:      { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: Colors.text, marginBottom: 12, letterSpacing: -0.2 },

  // WOD card
  wodCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  wodCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  timeCap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeCapText: { fontSize: 11, color: Colors.textMuted },
  wodTitle: { fontSize: 20, fontWeight: '900', color: Colors.text },
  wodDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  notesBox: { backgroundColor: Colors.surface, borderRadius: 8, padding: 10 },
  notesText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  myScoreRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myScoreLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  myScoreValue: { fontSize: 20, fontWeight: '900', color: Colors.text },
  myScoreRx:    { fontSize: 11, fontWeight: '700', color: Colors.success,
    backgroundColor: `${Colors.success}15`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  editScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editScoreBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  enterScoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, marginTop: 4,
  },
  enterScoreBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  noWodCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 32,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 10,
  },
  noWodEmoji: { fontSize: 36 },
  noWodText:  { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },

  // Leaderboard
  leaderboard: {
    backgroundColor: Colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  leaderRowMe:     { backgroundColor: `${Colors.primary}06` },
  leaderRank:      { width: 24, fontSize: 16, textAlign: 'center' },
  leaderAvatar:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  leaderAvatarText: { fontSize: 13, fontWeight: '800', color: Colors.text },
  leaderMid:       { flex: 1 },
  leaderName:      { fontSize: 13, fontWeight: '700', color: Colors.text },
  leaderRxTag:     { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  leaderRight:     { alignItems: 'flex-end' },
  leaderScore:     { fontSize: 15, fontWeight: '900', color: Colors.text, fontVariant: ['tabular-nums'] },
  leaderScoreGold: { color: Colors.gold },
  commentBtn:      { padding: 4 },

  // History
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8, gap: 8,
  },
  historyTop:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  historyDate: { fontSize: 11, color: Colors.textMuted },
  historyTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: 'center' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#fff',
  },
  modalTitle:     { fontSize: 18, fontWeight: '900', color: Colors.text },
  modalClose:     { padding: 4 },
  modalCloseText: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  modalBody:      { padding: 20, gap: 12 },
  modalWodName:   { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalLabel:     { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1 },
  typeRow:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  typeChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText:       { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  typeChipTextActive: { color: '#fff' },
  scoreInput: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 18, color: Colors.text, fontWeight: '700',
  },
  rxRow:            { flexDirection: 'row', gap: 10 },
  rxChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  rxChipActive:       { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rxChipActiveScaled: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  rxChipText:         { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  rxChipTextActive:   { color: '#fff' },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { color: '#fff', fontSize: 16, fontWeight: '900' },
});
