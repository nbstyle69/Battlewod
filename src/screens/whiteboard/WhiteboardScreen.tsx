import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Plus, Clock, RotateCcw, MessageSquare, ChevronRight, Hash, Users, X, MessageCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWOD, WODScore, ScoreType } from '../../types';
import { WhiteboardStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<WhiteboardStackParamList>;

interface BoxMember {
  id: string;
  username: string;
  level: string;
  elo: number;
  avatar_url?: string | null;
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

const TYPE_STYLES = StyleSheet.create({
  typeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.5 },
});

function WodTypeBadge({ type }: { type?: string }) {
  const colors: Record<string, string> = {
    'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
    tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
  };
  const color = colors[type ?? 'custom'] ?? '#6B7280';
  return (
    <View style={[TYPE_STYLES.typeBadge, { backgroundColor: `${color}18` }]}>
      <Text style={[TYPE_STYLES.typeBadgeText, { color }]}>{(type ?? 'custom').toUpperCase()}</Text>
    </View>
  );
}

export default function WhiteboardScreen() {
  const { user, currentBox, joinBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);

  const [todayWOD,      setTodayWOD]      = useState<BoxWOD | null>(null);
  const [scores,        setScores]        = useState<WODScore[]>([]);
  const [myScore,       setMyScore]       = useState<WODScore | null>(null);
  const [recentWODs,    setRecentWODs]    = useState<BoxWOD[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [membersModal,  setMembersModal]  = useState(false);
  const [members,       setMembers]       = useState<BoxMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Score form state
  const [scoreType,  setScoreType]  = useState<ScoreType>('time');
  const [scoreInput, setScoreInput] = useState('');
  const [isRx,       setIsRx]       = useState(true);
  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Join box state
  const [joinModal, setJoinModal] = useState(false);
  const [joinCode,  setJoinCode]  = useState('');
  const [joining,   setJoining]   = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadMembers = useCallback(async () => {
    if (!currentBox) return;
    setMembersLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, level, elo, avatar_url')
      .eq('box_id', currentBox.id)
      .order('elo', { ascending: false });
    setMembers((data ?? []) as BoxMember[]);
    setMembersLoading(false);
  }, [currentBox]);

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

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const { error } = await joinBox(joinCode.trim());
    setJoining(false);
    if (error) { Alert.alert('Erreur', error); return; }
    setJoinModal(false);
    setJoinCode('');
  }

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
      <View style={S.container}>
        <View style={S.header}>
          <Text style={S.headerTitle}>Whiteboard</Text>
        </View>
        <View style={S.empty}>
          <View style={S.noBoxCard}>
            <Text style={S.noBoxTitle}>MA BOX</Text>
            <Text style={S.noBoxSub}>Tu n'es rattaché à aucune box.</Text>
            <TouchableOpacity style={S.joinBtn} onPress={() => setJoinModal(true)} activeOpacity={0.85}>
              <Hash color="#fff" size={16} />
              <Text style={S.joinBtnText}>Rejoindre une box</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={joinModal} animationType="slide" presentationStyle="pageSheet" transparent onRequestClose={() => setJoinModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
            <View style={S.joinSheet}>
              <View style={S.joinHandle} />
              <Text style={S.joinSheetTitle}>Rejoindre une box</Text>
              <Text style={S.joinSheetSub}>Entre le code d'invitation (6 caractères)</Text>
              <TextInput
                style={S.codeInput}
                value={joinCode}
                onChangeText={text => setJoinCode(text.toUpperCase().slice(0, 6))}
                placeholder="EX: ABC123"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
                autoFocus
              />
              <TouchableOpacity
                style={[S.joinBtn, (!joinCode.trim() || joining) && { opacity: 0.5 }]}
                onPress={handleJoin}
                disabled={!joinCode.trim() || joining}
                activeOpacity={0.85}
              >
                {joining
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Hash color="#fff" size={16} /><Text style={S.joinBtnText}>Rejoindre</Text></>
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.headerTitle}>Whiteboard</Text>
            <Text style={S.headerSub}>{currentBox.name}</Text>
          </View>
          <View style={S.headerBtns}>
            <TouchableOpacity
              style={S.membersBtn}
              onPress={() => { setMembersModal(true); loadMembers(); }}
              activeOpacity={0.8}
            >
              <Users size={16} color={theme.accent} />
              <Text style={S.membersBtnText}>Membres</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={S.membersBtn}
              onPress={() => navigation.navigate('Messages')}
              activeOpacity={0.8}
            >
              <MessageCircle size={16} color={theme.accent} />
              <Text style={S.membersBtnText}>Messages</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* WOD du jour */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>WOD du jour</Text>
          {todayWOD ? (
            <View style={S.wodCard}>
              <View style={S.wodCardTop}>
                <WodTypeBadge type={todayWOD.wod_type} />
                {todayWOD.time_cap_seconds && (
                  <View style={S.timeCap}>
                    <Clock color={theme.textMuted} size={12} />
                    <Text style={S.timeCapText}>
                      Cap {Math.floor(todayWOD.time_cap_seconds / 60)} min
                    </Text>
                  </View>
                )}
              </View>
              <Text style={S.wodTitle}>{todayWOD.title}</Text>
              {todayWOD.description && (
                <Text style={S.wodDesc}>{todayWOD.description}</Text>
              )}
              {todayWOD.notes && (
                <View style={S.notesBox}>
                  <Text style={S.notesText}>{todayWOD.notes}</Text>
                </View>
              )}

              {myScore ? (
                <View style={S.myScoreRow}>
                  <View style={S.myScoreBadge}>
                    <Text style={S.myScoreLabel}>Mon score</Text>
                    <Text style={S.myScoreValue}>{formatScore(myScore)}</Text>
                    <Text style={S.myScoreRx}>{myScore.rx ? 'RX' : 'Scaled'}</Text>
                  </View>
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
          ) : (
            <View style={S.noWodCard}>
              <Text style={S.noWodEmoji}>📋</Text>
              <Text style={S.noWodText}>Pas de WOD publié aujourd'hui</Text>
            </View>
          )}
        </View>

        {/* Classement */}
        {todayWOD && scores.length > 0 && (
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
                    <TouchableOpacity style={S.commentBtn} activeOpacity={0.7}>
                      <MessageSquare color={theme.textMuted} size={14} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Historique */}
        {recentWODs.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>WODs récents</Text>
            {recentWODs.map(wod => (
              <TouchableOpacity key={wod.id} style={S.historyRow} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <View style={S.historyTop}>
                    <WodTypeBadge type={wod.wod_type} />
                    <Text style={S.historyDate}>
                      {new Date(wod.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={S.historyTitle}>{wod.title}</Text>
                </View>
                <ChevronRight color={theme.textMuted} size={16} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Members Modal */}
      <Modal visible={membersModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMembersModal(false)}>
        <View style={S.membersContainer}>
          <View style={S.membersHeader}>
            <Text style={S.membersTitle}>Membres · {currentBox.name}</Text>
            <TouchableOpacity onPress={() => setMembersModal(false)} style={S.membersClose}>
              <X color={theme.textSecondary} size={22} />
            </TouchableOpacity>
          </View>
          {membersLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={m => m.id}
              contentContainerStyle={S.membersList}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={S.memberRow}
                  onPress={() => { setMembersModal(false); navigation.navigate('PublicProfile', { userId: item.id }); }}
                  activeOpacity={0.75}
                >
                  <Text style={S.memberRank}>{index + 1}</Text>
                  <View style={S.memberAvatar}>
                    <Text style={S.memberAvatarText}>{item.username[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.memberName}>{item.username}</Text>
                    <Text style={S.memberLevel}>{item.level?.toUpperCase()}</Text>
                  </View>
                  <Text style={S.memberElo}>{item.elo} ELO</Text>
                  <ChevronRight color={theme.textMuted} size={14} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={S.emptyText}>Aucun membre trouvé.</Text>}
            />
          )}
        </View>
      </Modal>

      {/* Score Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Entrer mon score</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={S.modalClose}>
                <Text style={S.modalCloseText}>Annuler</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
              {todayWOD && (
                <Text style={S.modalWodName}>{todayWOD.title}</Text>
              )}

              {/* Score type */}
              <Text style={S.modalLabel}>TYPE DE SCORE</Text>
              <View style={S.typeRow}>
                {(['time', 'reps', 'weight', 'rounds'] as ScoreType[]).map(t => (
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

              {/* Score input */}
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

              {/* RX / Scaled */}
              <Text style={S.modalLabel}>NIVEAU</Text>
              <View style={S.rxRow}>
                <TouchableOpacity style={[S.rxChip, isRx && S.rxChipActive]} onPress={() => setIsRx(true)}>
                  <Text style={[S.rxChipText, isRx && S.rxChipTextActive]}>RX</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.rxChip, !isRx && S.rxChipActiveScaled]} onPress={() => setIsRx(false)}>
                  <Text style={[S.rxChipText, !isRx && S.rxChipTextActive]}>Scaled</Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <Text style={S.modalLabel}>NOTES (optionnel)</Text>
              <TextInput
                style={[S.scoreInput, { minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Commentaire, mouvements adaptés…"
                placeholderTextColor={theme.textMuted}
                value={notes}
                onChangeText={setNotes}
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
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: theme.text },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  membersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${theme.accent}15`, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  membersBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  membersContainer: { flex: 1, backgroundColor: theme.background },
  membersHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  membersTitle: { fontSize: 18, fontWeight: '900', color: theme.text },
  membersClose: { padding: 4 },
  membersList: { padding: 16, gap: 10 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border,
  },
  memberRank: { width: 22, fontSize: 13, color: theme.textMuted, fontWeight: '700', textAlign: 'center' },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.accentShadow, justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  memberName: { fontSize: 14, fontWeight: '800', color: theme.text },
  memberLevel: { fontSize: 10, color: theme.textMuted, fontWeight: '700', marginTop: 1 },
  memberElo: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  section:      { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: theme.text, marginBottom: 12, letterSpacing: -0.2 },
  wodCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
  },
  wodCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeCap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeCapText: { fontSize: 11, color: theme.textMuted },
  wodTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
  wodDesc: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  notesBox: { backgroundColor: theme.surface, borderRadius: 8, padding: 10 },
  notesText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  myScoreRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myScoreLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  myScoreValue: { fontSize: 20, fontWeight: '900', color: theme.text },
  myScoreRx:    { fontSize: 11, fontWeight: '700', color: theme.success,
    backgroundColor: `${theme.success}15`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  editScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editScoreBtnText: { fontSize: 12, color: theme.accent, fontWeight: '700' },
  enterScoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: theme.accent, borderRadius: 12, padding: 14, marginTop: 4,
  },
  enterScoreBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  noWodCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 32,
    borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10,
  },
  noWodEmoji: { fontSize: 36 },
  noWodText:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  leaderboard: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  leaderRowMe:     { backgroundColor: `${theme.accent}10` },
  leaderRank:      { width: 24, fontSize: 16, textAlign: 'center' },
  leaderAvatar:    { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  leaderAvatarText: { fontSize: 13, fontWeight: '800', color: theme.text },
  leaderMid:       { flex: 1 },
  leaderName:      { fontSize: 13, fontWeight: '700', color: theme.text },
  leaderRxTag:     { fontSize: 10, color: theme.textMuted, fontWeight: '600' },
  leaderRight:     { alignItems: 'flex-end' },
  leaderScore:     { fontSize: 15, fontWeight: '900', color: theme.text, fontVariant: ['tabular-nums'] },
  leaderScoreGold: { color: theme.gold },
  commentBtn:      { padding: 4 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: theme.border, marginBottom: 8, gap: 8,
  },
  historyTop:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  historyDate: { fontSize: 11, color: theme.textMuted },
  historyTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: theme.textMuted, textAlign: 'center' },
  noBoxCard: {
    width: '100%', backgroundColor: theme.card, borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: theme.border, gap: 12,
  },
  noBoxTitle: { fontSize: 13, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
  noBoxSub: { fontSize: 15, color: theme.textSecondary },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.success, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20, marginTop: 4,
  },
  joinBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  joinSheet: {
    backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  joinHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: theme.border, alignSelf: 'center', marginBottom: 8,
  },
  joinSheetTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
  joinSheetSub: { fontSize: 13, color: theme.textMuted },
  codeInput: {
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1,
    borderColor: theme.border, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '800', color: theme.text,
    letterSpacing: 6, textAlign: 'center',
  },
  modalContainer: { flex: 1, backgroundColor: theme.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  modalTitle:     { fontSize: 18, fontWeight: '900', color: theme.text },
  modalClose:     { padding: 4 },
  modalCloseText: { fontSize: 14, color: theme.accent, fontWeight: '700' },
  modalBody:      { padding: 20, gap: 12 },
  modalWodName:   { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 4 },
  modalLabel:     { fontSize: 11, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
  typeRow:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  typeChipActive:     { backgroundColor: theme.accent, borderColor: theme.accent },
  typeChipText:       { fontSize: 11, fontWeight: '800', color: theme.textMuted },
  typeChipTextActive: { color: '#fff' },
  scoreInput: {
    backgroundColor: theme.card, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 18, color: theme.text, fontWeight: '700',
  },
  rxRow:            { flexDirection: 'row', gap: 10 },
  rxChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    alignItems: 'center',
  },
  rxChipActive:       { backgroundColor: theme.accent, borderColor: theme.accent },
  rxChipActiveScaled: { backgroundColor: theme.warning, borderColor: theme.warning },
  rxChipText:         { fontSize: 13, fontWeight: '800', color: theme.textMuted },
  rxChipTextActive:   { color: '#fff' },
  submitBtn: {
    backgroundColor: theme.accent, borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { color: '#fff', fontSize: 16, fontWeight: '900' },
}); }
