import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Modal, Linking, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Youtube, Clock, Zap, CheckCircle,
  AlertTriangle, Play, FileText, Info,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'TournamentWOD'>;
type Route = RouteProp<CompetitionStackParamList, 'TournamentWOD'>;

const YOUTUBE_REGEX = /(youtube\.com\/watch\?v=|youtu\.be\/)/;

function formatCountdown(ms: number, theme: AppTheme): { text: string; color: string } {
  if (ms <= 0) return { text: 'DÉLAI EXPIRÉ', color: theme.error };
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const text = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const color = ms < 3600000 ? theme.error : ms < 7200000 ? theme.warning : theme.success;
  return { text, color };
}

export default function TournamentWODScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { tournamentId, tournamentName, wod, existingScore } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [phase,         setPhase]         = useState<'detail' | 'submit' | 'success'>('detail');
  const [scoreValue,    setScoreValue]    = useState(existingScore?.score_value ?? '');
  const [youtubeUrl,    setYoutubeUrl]    = useState(existingScore?.video_url ?? '');
  const [tiebreakValue, setTiebreakValue] = useState('');
  const [notes,         setNotes]         = useState('');
  const [urlValid,      setUrlValid]      = useState(YOUTUBE_REGEX.test(existingScore?.video_url ?? ''));
  const [submitting,    setSubmitting]    = useState(false);
  const [showYtHelp,    setShowYtHelp]    = useState(false);

  const deadlineHours = (wod.deadline_hours && wod.deadline_hours > 0) ? wod.deadline_hours : 24;
  const deadlineMsRef = useRef<number>(Date.now() + deadlineHours * 3600 * 1000);
  const [remainingMs, setRemainingMs] = useState(deadlineHours * 3600 * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    deadlineMsRef.current = Date.now() + deadlineHours * 3600 * 1000;
    intervalRef.current = setInterval(() => {
      const rem = deadlineMsRef.current - Date.now();
      setRemainingMs(rem);
      if (rem <= 0 && intervalRef.current) clearInterval(intervalRef.current);
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function startCountdown() {
    deadlineMsRef.current = Date.now() + wod.deadline_hours * 3600 * 1000;
    intervalRef.current = setInterval(() => {
      const rem = deadlineMsRef.current - Date.now();
      setRemainingMs(rem);
      if (rem <= 0 && intervalRef.current) clearInterval(intervalRef.current);
    }, 1000);
  }

  async function handleSubmit() {
    if (!scoreValue.trim()) { Alert.alert('Erreur', 'Saisis ton score avant de soumettre.'); return; }
    if (!urlValid)           { Alert.alert('Erreur', 'Le lien YouTube est invalide.'); return; }
    if (remainingMs <= 0)    { Alert.alert('Délai expiré', 'Tu ne peux plus soumettre de score pour ce WOD.'); return; }
    if (!user)               { Alert.alert('Erreur', 'Utilisateur non connecté.'); return; }

    setSubmitting(true);
    const payload = {
      tournament_id:     tournamentId,
      tournament_wod_id: wod.id,
      athlete_id:        user.id,
      score_value:       scoreValue.trim(),
      tiebreak_value:    tiebreakValue ? parseFloat(tiebreakValue) : null,
      video_url:         youtubeUrl.trim(),
      notes:             notes.trim() || null,
      submitted_at:      new Date().toISOString(),
      deadline_at:       new Date(deadlineMsRef.current).toISOString(),
      status:            'pending',
    };

    let error: any;
    if (existingScore && existingScore.status === 'rejected') {
      ({ error } = await supabase.from('tournament_scores')
        .update(payload).eq('tournament_wod_id', wod.id).eq('athlete_id', user.id));
    } else {
      ({ error } = await supabase.from('tournament_scores').insert(payload));
    }

    setSubmitting(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('success');
  }

  function launchTimer() {
    const rawType = (wod.timer_type ?? wod.type ?? '').toLowerCase();
    const timerType =
      rawType === 'amrap'    || rawType === 'amrap'     ? 'amrap'    :
      rawType === 'for-time' || rawType === 'for time'  ? 'for-time' :
      rawType === 'emom'                                ? 'emom'     :
      rawType === 'tabata'                              ? 'tabata'   :
      rawType === 'ywyr'                                ? 'ywyr'     :
      'for-time';

    const durSeconds = (wod.time_cap_seconds ?? 0) > 0
      ? wod.time_cap_seconds!
      : wod.duration_minutes * 60;

    const rounds   = (wod as any).rounds       ?? (timerType === 'emom' ? wod.duration_minutes : 3);
    const workTime = (wod as any).work_seconds ?? 40;
    const restTime = (wod as any).rest_seconds ?? 20;

    (navigation as any).navigate('TimerRun', {
      timerType,
      countdown:     10,
      totalSeconds:  timerType === 'amrap' ? durSeconds : 0,
      maxTime:       timerType === 'for-time' ? durSeconds : 0,
      interval:      timerType === 'emom' ? 1 : 0,
      rounds,
      workTime,
      restTime,
      sequence:      '[]',
      withCamera:    true,
      videoTitle:    `${tournamentName} · ${wod.title}`,
      withTimestamp: true,
    });
  }

  const countdown = formatCountdown(remainingMs, theme);

  // ══ PHASE : SUCCESS ═══════════════════════════════════════════════════════
  if (phase === 'success') return (
    <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.successContainer}>
      <CheckCircle color={theme.success} size={72} />
      <Text style={S.successTitle}>Score soumis !</Text>
      <Text style={S.successSub}>Ton score est en attente de validation par un admin.</Text>
      <View style={S.successCard}>
        <Text style={S.successLabel}>WOD</Text>
        <Text style={S.successValue}>{wod.title}</Text>
        <Text style={[S.successLabel, { marginTop: 12 }]}>SCORE</Text>
        <Text style={S.successValue}>{scoreValue}</Text>
        {tiebreakValue ? (
          <>
            <Text style={[S.successLabel, { marginTop: 12 }]}>TIE-BREAK</Text>
            <Text style={S.successValue}>{tiebreakValue} reps</Text>
          </>
        ) : null}
        <View style={S.successYtRow}>
          <Youtube color="#FF0000" size={16} />
          <Text style={S.successYtText}>Lien YouTube soumis ✓</Text>
        </View>
      </View>
      <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
        <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.backBtnInner}>
          <Text style={S.backBtnText}>RETOUR AU TOURNOI</Text>
        </LinearGradient>
      </TouchableOpacity>
    </LinearGradient>
  );

  // ══ PHASE : DETAIL ═════════════════════════════════════════════════════
  if (phase === 'detail') return (
    <View style={S.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color="rgba(255,255,255,0.6)" size={24} />
        </TouchableOpacity>
        <View style={S.headerInfo}>
          <Text style={S.headerSub}>{tournamentName}</Text>
          <Text style={S.headerTitle}>{wod.title}</Text>
          <View style={S.headerBadges}>
            <View style={S.typeBadge}><Text style={S.typeBadgeText}>{wod.type}</Text></View>
            <View style={S.durationBadge}>
              <Clock color="rgba(255,255,255,0.4)" size={12} />
              <Text style={S.durationText}>{wod.duration_minutes} min</Text>
            </View>
            <View style={S.scoringBadge}>
              <Zap color={theme.gold} size={12} />
              <Text style={S.scoringText}>{wod.scoring}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {wod.description ? (
          <View style={S.card}>
            <Text style={S.cardLabel}>DESCRIPTION</Text>
            <Text style={S.descText}>{wod.description}</Text>
          </View>
        ) : null}

        {Array.isArray(wod.movements) && wod.movements.length > 0 && (
          <View style={S.card}>
            <Text style={S.cardLabel}>MOUVEMENTS</Text>
            {wod.movements.map((m, i) => (
              <View key={i} style={S.movRow}>
                <View style={[S.movDot, { backgroundColor: theme.accent }]} />
                <Text style={S.movText}>{m}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={S.card}>
          <Text style={S.cardLabel}>RÈGLES DE FILMAGE</Text>
          {['📷 Caméra stable, angle fixe, corps entier visible',
            '🏋️ Chaque répétition clairement identifiable',
            '⏱ Timer visible à l\'écran pendant l\'effort',
            `🔗 Upload YouTube requis dans les ${wod.deadline_hours}h`,
            '🔒 Vidéo non répertoriée acceptée',
          ].map((r, i) => <Text key={i} style={S.ruleText}>{r}</Text>)}
        </View>

        {existingScore && (
          <View style={[S.card, { borderColor: `${theme.warning}40` }]}>
            <Text style={S.cardLabel}>TON SCORE PRÉCÉDENT</Text>
            <Text style={S.prevScore}>{existingScore.score_value}</Text>
            {existingScore.video_url ? (
              <TouchableOpacity style={S.ytPrevBtn} onPress={() => Linking.openURL(existingScore.video_url!)}>
                <Youtube color="#FF0000" size={16} />
                <Text style={S.ytPrevText}>Voir la vidéo soumise</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={[S.card, { borderColor: `${theme.warning}40`, backgroundColor: `${theme.warning}08` }]}>
          <View style={S.warningRow}>
            <AlertTriangle color={theme.warning} size={16} />
            <Text style={S.warningText}>
              Le chrono de {wod.deadline_hours}h démarre dès que tu passes en mode soumission.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={S.actionBtn} onPress={launchTimer} activeOpacity={0.85}>
          <LinearGradient colors={['#EF4444', '#DC2626']} style={S.actionBtnInner}>
            <Play color="#fff" size={18} />
            <Text style={S.actionBtnText}>Lancer le WOD avec caméra</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={S.actionBtn}
          onPress={() => { startCountdown(); setPhase('submit'); }} activeOpacity={0.85}>
          <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.actionBtnInner}>
            <FileText color="#fff" size={18} />
            <Text style={S.actionBtnText}>Soumettre mon score</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  // ══ PHASE : SUBMIT ═════════════════════════════════════════════════════
  return (
    <View style={S.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <TouchableOpacity onPress={() => setPhase('detail')} style={S.back}>
          <ChevronLeft color="rgba(255,255,255,0.6)" size={24} />
        </TouchableOpacity>
        <View style={S.headerInfo}>
          <Text style={S.headerSub}>{tournamentName}</Text>
          <Text style={S.headerTitle}>{wod.title}</Text>
          <View style={[S.countdownRow, { backgroundColor: `${countdown.color}15` }]}>
            <Clock color={countdown.color} size={14} />
            <Text style={[S.countdownText, { color: countdown.color }]}>{countdown.text}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}
        keyboardShouldPersistTaps="handled">

        <View style={S.card}>
          <Text style={S.cardLabel}>
            {wod.type === 'For Time' ? '⏱ TON TEMPS FINAL' : '🔢 TON SCORE FINAL'}
          </Text>
          <TextInput
            style={S.scoreInput}
            value={scoreValue}
            onChangeText={setScoreValue}
            placeholder={
              wod.type === 'For Time' ? 'ex: 12:45' :
              wod.type === 'AMRAP'    ? 'ex: 8 rounds + 15 reps' : 'ex: 185'
            }
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
        </View>

        <View style={S.card}>
          <Text style={S.cardLabel}>🔗 TIE-BREAK (optionnel)</Text>
          <Text style={S.cardHint}>
            Reps du dernier mouvement réalisé — départage en cas d'ex-aequo.
          </Text>
          <TextInput
            style={[S.scoreInput, { fontSize: 16 }]}
            value={tiebreakValue}
            onChangeText={setTiebreakValue}
            placeholder="ex: 15"
            placeholderTextColor={theme.textMuted}
            keyboardType="numeric"
          />
        </View>

        <View style={S.card}>
          <Text style={S.cardLabel}>� LIEN YOUTUBE (obligatoire)</Text>
          <View style={S.ytRow}>
            <Youtube color={urlValid ? theme.success : '#FF0000'} size={20} />
            <TextInput
              style={S.ytInput}
              value={youtubeUrl}
              onChangeText={v => { setYoutubeUrl(v); setUrlValid(YOUTUBE_REGEX.test(v)); }}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {youtubeUrl.length > 0 && !urlValid && (
            <Text style={S.urlError}>Lien YouTube invalide. Format attendu : youtube.com/watch?v= ou youtu.be/</Text>
          )}
          <TouchableOpacity onPress={() => setShowYtHelp(true)} style={S.ytHelpLink}>
            <Info color={theme.accent} size={13} />
            <Text style={S.ytHelpText}>Comment uploader sur YouTube ?</Text>
          </TouchableOpacity>
        </View>

        <View style={S.card}>
          <Text style={S.cardLabel}>📝 NOTES (optionnel)</Text>
          <TextInput
            style={[S.scoreInput, { height: 80, textAlignVertical: 'top', fontSize: 13 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Conditions, blessures, commentaires..."
            placeholderTextColor={theme.textMuted}
            multiline
          />
        </View>

        <View style={[S.card, { backgroundColor: `${theme.warning}08`, borderColor: `${theme.warning}30` }]}>
          <Text style={S.cardLabel}>⚖️ CODE D'HONNEUR</Text>
          <Text style={S.honorText}>
            En soumettant ce score, je certifie avoir respecté tous les standards de mouvement,
            que ma vidéo est complète et authentique, et que le score déclaré est exact.
          </Text>
        </View>

        <TouchableOpacity
          style={[S.actionBtn, (submitting || remainingMs <= 0) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting || remainingMs <= 0}
          activeOpacity={0.85}>
          <LinearGradient
            colors={remainingMs <= 0 ? [theme.surface, theme.surface] : [theme.accent, theme.secondary ?? theme.accent]}
            style={S.actionBtnInner}>
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={S.actionBtnText}>
                  {remainingMs <= 0 ? 'DÉLAI EXPIRÉ' : 'SOUMETTRE MON SCORE'}
                </Text>}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* YouTube help modal */}
      <Modal visible={showYtHelp} animationType="slide" transparent onRequestClose={() => setShowYtHelp(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Uploader sur YouTube</Text>
            {['1. Ouvre l\'app YouTube sur ton téléphone',
              '2. Appuie sur le "+" en bas de l\'écran',
              '3. Sélectionne "Importer une vidéo"',
              '4. Choisis ta vidéo dans la galerie',
              '5. Titre : ex "TheHub – Fran 23/03/2026"',
              '6. Visibilité : "Non répertoriée" (recommandé)',
              '7. Copie le lien et colle-le ici',
            ].map((step, i) => <Text key={i} style={S.modalStep}>{step}</Text>)}
            <TouchableOpacity style={S.ytStudioBtn}
              onPress={() => Linking.openURL('https://studio.youtube.com')}>
              <Youtube color="#FF0000" size={18} />
              <Text style={S.ytStudioText}>Ouvrir YouTube Studio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.modalClose} onPress={() => setShowYtHelp(false)}>
              <Text style={S.modalCloseTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container:   { flex: 1, backgroundColor: theme.background },
  header:      { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20, flexDirection: 'row', gap: 12 },
  back:        { paddingTop: 4 },
  headerInfo:  { flex: 1 },
  headerSub:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 10 },
  headerBadges:{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeBadge:     { backgroundColor: `${theme.accent}20`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800', color: theme.accent },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  durationText:  { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  scoringBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${theme.gold}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  scoringText:   { fontSize: 11, color: theme.gold, fontWeight: '700' },
  countdownRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 },
  countdownText: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  content: { padding: 16, paddingTop: 14 },
  card:      { backgroundColor: theme.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.cardBorder, gap: 10, marginBottom: 14 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1.5 },
  cardHint:  { fontSize: 12, color: theme.textMuted, lineHeight: 18 },
  descText:  { fontSize: 14, color: theme.textSecondary, lineHeight: 22 },
  movRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movDot:    { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
  movText:   { fontSize: 14, color: theme.textSecondary, flex: 1, lineHeight: 22 },
  ruleText:  { fontSize: 13, color: theme.textSecondary, lineHeight: 22 },
  warningRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  warningText: { fontSize: 13, color: theme.warning, lineHeight: 20, flex: 1 },
  prevScore:  { fontSize: 22, fontWeight: '900', color: theme.text },
  ytPrevBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ytPrevText: { fontSize: 13, color: '#FF0000', fontWeight: '600' },
  scoreInput: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '900', color: theme.text, borderWidth: 1, borderColor: theme.border },
  ytRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border },
  ytInput:    { flex: 1, padding: 14, fontSize: 13, color: theme.text },
  urlError:   { fontSize: 12, color: theme.error },
  ytHelpLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  ytHelpText: { fontSize: 12, color: theme.accent, fontWeight: '600' },
  honorText:  { fontSize: 13, color: theme.textSecondary, lineHeight: 21 },
  actionBtn:      { marginBottom: 12 },
  actionBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, paddingVertical: 18 },
  actionBtnText:  { color: '#fff', fontSize: 15, fontWeight: '900' },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  successTitle:     { fontSize: 26, fontWeight: '900', color: '#fff' },
  successSub:       { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  successCard:      { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginTop: 8 },
  successLabel:     { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5 },
  successValue:     { fontSize: 18, fontWeight: '900', color: '#fff' },
  successYtRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  successYtText:    { fontSize: 13, color: theme.success, fontWeight: '700' },
  backBtn:          { width: '100%', marginTop: 8 },
  backBtnInner:     { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  backBtnText:      { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, borderWidth: 1, borderColor: theme.cardBorder },
  modalTitle:    { fontSize: 17, fontWeight: '900', color: theme.text, marginBottom: 4 },
  modalStep:     { fontSize: 14, color: theme.textSecondary, lineHeight: 24 },
  ytStudioBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${theme.error}15`, borderRadius: 12, padding: 14, marginTop: 4 },
  ytStudioText:  { fontSize: 14, fontWeight: '800', color: '#FF0000' },
  modalClose:    { alignItems: 'center', padding: 14 },
  modalCloseTxt: { fontSize: 14, color: theme.textMuted, fontWeight: '700' },
}); }
