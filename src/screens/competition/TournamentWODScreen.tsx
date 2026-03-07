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
import { Colors } from '../../theme/colors';
import { CompetitionStackParamList } from '../../navigation';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'TournamentWOD'>;
type Route = RouteProp<CompetitionStackParamList, 'TournamentWOD'>;

const YOUTUBE_REGEX = /(youtube\.com\/watch\?v=|youtu\.be\/)/;

function formatCountdown(ms: number): { text: string; color: string } {
  if (ms <= 0) return { text: 'DÉLAI EXPIRÉ', color: Colors.error };
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const text = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const color = ms < 3600000 ? Colors.error : ms < 7200000 ? Colors.warning : Colors.success;
  return { text, color };
}

export default function TournamentWODScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { tournamentId, tournamentName, wod, existingScore } = route.params;
  const { user } = useAuth();

  const [phase,         setPhase]         = useState<'detail' | 'submit' | 'success'>('detail');
  const [scoreValue,    setScoreValue]    = useState(existingScore?.score_value ?? '');
  const [youtubeUrl,    setYoutubeUrl]    = useState(existingScore?.video_url ?? '');
  const [tiebreakValue, setTiebreakValue] = useState('');
  const [notes,         setNotes]         = useState('');
  const [urlValid,      setUrlValid]      = useState(YOUTUBE_REGEX.test(existingScore?.video_url ?? ''));
  const [submitting,    setSubmitting]    = useState(false);
  const [showYtHelp,    setShowYtHelp]    = useState(false);

  const deadlineMsRef = useRef<number>(0);
  const [remainingMs, setRemainingMs] = useState(wod.deadline_hours * 3600 * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
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
    // Use timer_type from back office config if available, else derive from wod.type
    const timerType: string = wod.timer_type
      ? wod.timer_type
      : wod.type === 'AMRAP'    ? 'stopwatch'
      : wod.type === 'For Time' ? 'countdown'
      : wod.type === 'EMOM'     ? 'emom'
      : wod.type === 'Tabata'   ? 'tabata'
      : 'countdown';

    const timeCap = wod.time_cap_seconds ?? wod.duration_minutes * 60;

    (navigation as any).navigate('TimerRun', {
      timerType,
      totalSeconds:  timeCap,
      maxTime:       timerType === 'countdown' ? timeCap : 0,
      interval:      0,
      rounds:        (wod as any).rounds        ?? (wod.type === 'EMOM' ? wod.duration_minutes : 0),
      workTime:      (wod as any).work_seconds  ?? 20,
      restTime:      (wod as any).rest_seconds  ?? 10,
      sequence:      '[]',
      withCamera:    true,
      videoTitle:    `${tournamentName} · ${wod.title}`,
      withTimestamp: true,
      countdown:     10,
    });
  }

  const countdown = formatCountdown(remainingMs);

  // ══ PHASE : SUCCESS ═══════════════════════════════════════════════════════
  if (phase === 'success') return (
    <LinearGradient colors={['#12121A', '#0A0A0F']} style={s.successContainer}>
      <CheckCircle color={Colors.success} size={72} />
      <Text style={s.successTitle}>Score soumis !</Text>
      <Text style={s.successSub}>Ton score est en attente de validation par un admin.</Text>
      <View style={s.successCard}>
        <Text style={s.successLabel}>WOD</Text>
        <Text style={s.successValue}>{wod.title}</Text>
        <Text style={[s.successLabel, { marginTop: 12 }]}>SCORE</Text>
        <Text style={s.successValue}>{scoreValue}</Text>
        {tiebreakValue ? (
          <>
            <Text style={[s.successLabel, { marginTop: 12 }]}>TIE-BREAK</Text>
            <Text style={s.successValue}>{tiebreakValue} reps</Text>
          </>
        ) : null}
        <View style={s.successYtRow}>
          <Youtube color="#FF0000" size={16} />
          <Text style={s.successYtText}>Lien YouTube soumis ✓</Text>
        </View>
      </View>
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
        <LinearGradient colors={[Colors.primary, Colors.secondary]} style={s.backBtnInner}>
          <Text style={s.backBtnText}>RETOUR AU TOURNOI</Text>
        </LinearGradient>
      </TouchableOpacity>
    </LinearGradient>
  );

  // ══ PHASE : DETAIL ════════════════════════════════════════════════════════
  if (phase === 'detail') return (
    <View style={s.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color="rgba(255,255,255,0.6)" size={24} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerSub}>{tournamentName}</Text>
          <Text style={s.headerTitle}>{wod.title}</Text>
          <View style={s.headerBadges}>
            <View style={s.typeBadge}><Text style={s.typeBadgeText}>{wod.type}</Text></View>
            <View style={s.durationBadge}>
              <Clock color="rgba(255,255,255,0.4)" size={12} />
              <Text style={s.durationText}>{wod.duration_minutes} min</Text>
            </View>
            <View style={s.scoringBadge}>
              <Zap color={Colors.gold} size={12} />
              <Text style={s.scoringText}>{wod.scoring}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {wod.description ? (
          <View style={s.card}>
            <Text style={s.cardLabel}>DESCRIPTION</Text>
            <Text style={s.descText}>{wod.description}</Text>
          </View>
        ) : null}

        {Array.isArray(wod.movements) && wod.movements.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardLabel}>MOUVEMENTS</Text>
            {wod.movements.map((m, i) => (
              <View key={i} style={s.movRow}>
                <View style={[s.movDot, { backgroundColor: Colors.primary }]} />
                <Text style={s.movText}>{m}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardLabel}>RÈGLES DE FILMAGE</Text>
          {['📷 Caméra stable, angle fixe, corps entier visible',
            '🏋️ Chaque répétition clairement identifiable',
            '⏱ Timer visible à l\'écran pendant l\'effort',
            `🔗 Upload YouTube requis dans les ${wod.deadline_hours}h`,
            '🔒 Vidéo non répertoriée acceptée',
          ].map((r, i) => <Text key={i} style={s.ruleText}>{r}</Text>)}
        </View>

        {existingScore && (
          <View style={[s.card, { borderColor: `${Colors.warning}40` }]}>
            <Text style={s.cardLabel}>TON SCORE PRÉCÉDENT</Text>
            <Text style={s.prevScore}>{existingScore.score_value}</Text>
            {existingScore.video_url ? (
              <TouchableOpacity style={s.ytPrevBtn} onPress={() => Linking.openURL(existingScore.video_url!)}>
                <Youtube color="#FF0000" size={16} />
                <Text style={s.ytPrevText}>Voir la vidéo soumise</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={[s.card, { borderColor: `${Colors.warning}40`, backgroundColor: `${Colors.warning}08` }]}>
          <View style={s.warningRow}>
            <AlertTriangle color={Colors.warning} size={16} />
            <Text style={s.warningText}>
              Le chrono de {wod.deadline_hours}h démarre dès que tu passes en mode soumission.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={s.actionBtn} onPress={launchTimer} activeOpacity={0.85}>
          <LinearGradient colors={['#EF4444', '#DC2626']} style={s.actionBtnInner}>
            <Play color="#fff" size={18} />
            <Text style={s.actionBtnText}>Lancer le WOD avec caméra</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={s.actionBtn}
          onPress={() => { startCountdown(); setPhase('submit'); }} activeOpacity={0.85}>
          <LinearGradient colors={[Colors.primary, Colors.secondary]} style={s.actionBtnInner}>
            <FileText color="#fff" size={18} />
            <Text style={s.actionBtnText}>Soumettre mon score</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );

  // ══ PHASE : SUBMIT ════════════════════════════════════════════════════════
  return (
    <View style={s.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={s.header}>
        <TouchableOpacity onPress={() => setPhase('detail')} style={s.back}>
          <ChevronLeft color="rgba(255,255,255,0.6)" size={24} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerSub}>{tournamentName}</Text>
          <Text style={s.headerTitle}>{wod.title}</Text>
          <View style={[s.countdownRow, { backgroundColor: `${countdown.color}15` }]}>
            <Clock color={countdown.color} size={14} />
            <Text style={[s.countdownText, { color: countdown.color }]}>{countdown.text}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled">

        <View style={s.card}>
          <Text style={s.cardLabel}>
            {wod.type === 'For Time' ? '⏱ TON TEMPS FINAL' : '🔢 TON SCORE FINAL'}
          </Text>
          <TextInput
            style={s.scoreInput}
            value={scoreValue}
            onChangeText={setScoreValue}
            placeholder={
              wod.type === 'For Time' ? 'ex: 12:45' :
              wod.type === 'AMRAP'    ? 'ex: 8 rounds + 15 reps' : 'ex: 185'
            }
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>🔗 TIE-BREAK (optionnel)</Text>
          <Text style={s.cardHint}>
            Reps du dernier mouvement réalisé — départage en cas d'ex-aequo.
          </Text>
          <TextInput
            style={[s.scoreInput, { fontSize: 16 }]}
            value={tiebreakValue}
            onChangeText={setTiebreakValue}
            placeholder="ex: 15"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>🎬 LIEN YOUTUBE (obligatoire)</Text>
          <View style={s.ytRow}>
            <Youtube color={urlValid ? Colors.success : '#FF0000'} size={20} />
            <TextInput
              style={s.ytInput}
              value={youtubeUrl}
              onChangeText={v => { setYoutubeUrl(v); setUrlValid(YOUTUBE_REGEX.test(v)); }}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {youtubeUrl.length > 0 && !urlValid && (
            <Text style={s.urlError}>Lien YouTube invalide. Format attendu : youtube.com/watch?v= ou youtu.be/</Text>
          )}
          <TouchableOpacity onPress={() => setShowYtHelp(true)} style={s.ytHelpLink}>
            <Info color={Colors.primary} size={13} />
            <Text style={s.ytHelpText}>Comment uploader sur YouTube ?</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>📝 NOTES (optionnel)</Text>
          <TextInput
            style={[s.scoreInput, { height: 80, textAlignVertical: 'top', fontSize: 13 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Conditions, blessures, commentaires..."
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        </View>

        <View style={[s.card, { backgroundColor: `${Colors.warning}08`, borderColor: `${Colors.warning}30` }]}>
          <Text style={s.cardLabel}>⚖️ CODE D'HONNEUR</Text>
          <Text style={s.honorText}>
            En soumettant ce score, je certifie avoir respecté tous les standards de mouvement,
            que ma vidéo est complète et authentique, et que le score déclaré est exact.
          </Text>
        </View>

        <TouchableOpacity
          style={[s.actionBtn, (submitting || remainingMs <= 0) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting || remainingMs <= 0}
          activeOpacity={0.85}>
          <LinearGradient
            colors={remainingMs <= 0 ? [Colors.surface, Colors.surface] : [Colors.primary, Colors.secondary]}
            style={s.actionBtnInner}>
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.actionBtnText}>
                  {remainingMs <= 0 ? 'DÉLAI EXPIRÉ' : 'SOUMETTRE MON SCORE'}
                </Text>}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* YouTube help modal */}
      <Modal visible={showYtHelp} animationType="slide" transparent onRequestClose={() => setShowYtHelp(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Uploader sur YouTube</Text>
            {['1. Ouvre l\'app YouTube sur ton téléphone',
              '2. Appuie sur le "+" en bas de l\'écran',
              '3. Sélectionne "Importer une vidéo"',
              '4. Choisis ta vidéo dans la galerie',
              '5. Titre : ex "BattleWOD – Fran 23/03/2026"',
              '6. Visibilité : "Non répertoriée" (recommandé)',
              '7. Copie le lien et colle-le ici',
            ].map((step, i) => <Text key={i} style={s.modalStep}>{step}</Text>)}
            <TouchableOpacity style={s.ytStudioBtn}
              onPress={() => Linking.openURL('https://studio.youtube.com')}>
              <Youtube color="#FF0000" size={18} />
              <Text style={s.ytStudioText}>Ouvrir YouTube Studio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowYtHelp(false)}>
              <Text style={s.modalCloseTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  header:      { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20, flexDirection: 'row', gap: 12 },
  back:        { paddingTop: 4 },
  headerInfo:  { flex: 1 },
  headerSub:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 10 },
  headerBadges:{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeBadge:     { backgroundColor: `${Colors.primary}20`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  durationText:  { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  scoringBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.gold}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  scoringText:   { fontSize: 11, color: Colors.gold, fontWeight: '700' },
  countdownRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 },
  countdownText: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },

  content: { padding: 16, paddingTop: 14 },

  card:      { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.cardBorder, gap: 10, marginBottom: 14 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.5 },
  cardHint:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  descText:  { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  movRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movDot:    { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
  movText:   { fontSize: 14, color: Colors.textSecondary, flex: 1, lineHeight: 22 },
  ruleText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
  warningRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  warningText: { fontSize: 13, color: Colors.warning, lineHeight: 20, flex: 1 },

  prevScore:  { fontSize: 22, fontWeight: '900', color: Colors.text },
  ytPrevBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ytPrevText: { fontSize: 13, color: '#FF0000', fontWeight: '600' },

  scoreInput: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '900', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  ytRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.border },
  ytInput:    { flex: 1, padding: 14, fontSize: 13, color: Colors.text },
  urlError:   { fontSize: 12, color: Colors.error },
  ytHelpLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  ytHelpText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  honorText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 21 },

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
  successYtText:    { fontSize: 13, color: Colors.success, fontWeight: '700' },
  backBtn:          { width: '100%', marginTop: 8 },
  backBtnInner:     { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  backBtnText:      { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  modalTitle:    { fontSize: 17, fontWeight: '900', color: Colors.text, marginBottom: 4 },
  modalStep:     { fontSize: 14, color: Colors.textSecondary, lineHeight: 24 },
  ytStudioBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${Colors.error}15`, borderRadius: 12, padding: 14, marginTop: 4 },
  ytStudioText:  { fontSize: 14, fontWeight: '800', color: '#FF0000' },
  modalClose:    { alignItems: 'center', padding: 14 },
  modalCloseTxt: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },
});
