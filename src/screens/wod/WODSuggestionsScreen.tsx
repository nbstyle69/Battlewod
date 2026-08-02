/**
 * AthleX — Écran de résultats du générateur : 3 suggestions personnalisées
 * ========================================================================
 * SPEC §0 (UX) : glassmorphism existant — GlassBackground, GlassCard, chips arrondies.
 * Thème adaptatif clair/sombre via ThemeContext (aucune couleur en dur).
 * Remplace l'affichage « 1 WOD généré » par 3 cartes choisies par le ranker.
 *
 * Navigation : poussé par WODGenProScreen après « GÉNÉRER MA SÉANCE »
 *   navigation.navigate('WODSuggestions', { sport, cfParams? , hyroxParams? })
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Switch,
  Dimensions, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { ChevronLeft, RefreshCw, Zap, Trophy, Camera, CameraOff } from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, AppTheme } from '../../context/ThemeContext';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../lib/analytics';

import { CFParams, CFWod, Block as CFBlock } from '../../utils/wod/engineCrossFit';
import { HyroxParams, HyroxWod } from '../../utils/wod/engineHyrox';
import { rankCF, rankHyrox, RankedSuggestion, EMPTY_PROFILE, UserWodProfile } from '../../utils/wod/ranker';
import { personalizedLoadDisplay } from '../../utils/wod/movementLoadability';
import {
  loadWodProfile, recordShown, recordChosen, recordSkippedAll, recordCompleted,
} from '../../services/wodPersonalization';
import { buildHyroxTimerPlan, buildHyroxTimerRunParams } from '../../utils/wod/hyroxTimer';
import { buildTimerRunParams } from '../../utils/wodToTimer';
import { BoxWODType } from '../../types';

const CF_METHOD_TO_WOD_TYPE: Record<string, BoxWODType> = {
  'AMRAP': 'amrap', 'For Time': 'for-time', 'EMOM': 'emom', 'Tabata': 'tabata', 'Max Reps': 'amrap',
};
const TIMER_COUNTDOWN = 10;

const SCREEN_W = Dimensions.get('window').width;
const H_PADDING = 20;
const PAGE_W = SCREEN_W - H_PADDING * 2;

const RPE_OPTIONS = [
  { key: 'easy',    label: '😌 Facile' },
  { key: 'perfect', label: '🎯 Parfait' },
  { key: 'hard',    label: '🥵 Trop dur' },
] as const;
type Rpe = (typeof RPE_OPTIONS)[number]['key'];

type Sport = 'functional' | 'hybrid';
type Params = { sport: Sport; cfParams?: CFParams; hyroxParams?: HyroxParams };
type Route = RouteProp<{ WODSuggestions: Params }, 'WODSuggestions'>;

const SKIP_REASONS = [
  { key: 'too_long',  label: '⏱️ Trop long' },
  { key: 'disliked',  label: '🙅 Mouvements pas aimés' },
  { key: 'equipment', label: '🧰 Pas ce matériel' },
  { key: 'too_hard',  label: '🥵 Trop dur' },
  { key: 'other',     label: '🤷 Autre' },
] as const;

/** Lignes d'affichage d'un candidat (même logique que l'adapter, compactée).
 *  `usePR` + `prs` : quand le toggle « charges basées sur mes PR » est actif, la charge barre
 *  affichée devient 1RM × % (une seule valeur). Les reps ne changent JAMAIS (comparabilité). */
function movementLines(s: RankedSuggestion, usePR: boolean, prs: Record<string, number>): string[] {
  const blocks: CFBlock[] =
    s.kind === 'cf'
      ? [...((s.wod as CFWod).strength ? [(s.wod as CFWod).strength!] : []), ...(s.wod as CFWod).blocks]
      : ((s.wod as HyroxWod).blocks as unknown as CFBlock[]);
  const level = (s.wod as CFWod).level ?? 'RX';
  const lines: string[] = [];
  for (const b of blocks) {
    lines.push(b.label ? `${b.label} · ${b.scheme}` : b.scheme);
    for (const m of b.movements) {
      let l = m.prescription ? `${m.prescription} — ${m.name}` : m.name;
      // Personnalisation d'affichage : uniquement le générateur perso, jamais benchmarks/box.
      const load = usePR ? personalizedLoadDisplay(m.name, m.load, level, prs) : m.load;
      if (load) l += ` @ ${load}`;
      lines.push(`  ${l}`);
    }
  }
  return lines;
}

export default function WODSuggestionsScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [profile, setProfile] = useState<UserWodProfile>(EMPTY_PROFILE);
  const [suggestions, setSuggestions] = useState<RankedSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonModal, setReasonModal] = useState(false);
  // Séance lancée : au retour du timer on demande le RPE (1 tap) → calibration (SPEC §6).
  const [pendingRpe, setPendingRpe] = useState<RankedSuggestion | null>(null);
  const [rpeModal, setRpeModal] = useState(false);
  // Charges basées sur les PR : actif par défaut dès qu'au moins un 1RM existe (page Records).
  const [usePR, setUsePR] = useState(false);
  const hasPRs = Object.keys(profile.prs ?? {}).length > 0;
  // Carrousel : une carte visible à la fois (SPEC UX — cartes empilées illisibles sur mobile).
  const [page, setPage] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  // Choix caméra au lancement (comme le flux timer existant).
  const [cameraFor, setCameraFor] = useState<{ s: RankedSuggestion; rank: number } | null>(null);

  const generate = useCallback((p: UserWodProfile) => {
    const next =
      params.sport === 'functional'
        ? rankCF(params.cfParams!, p)
        : rankHyrox(params.hyroxParams!, p);
    setSuggestions(next);
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
    trackEvent('wod_suggestions_shown', {
      sport: params.sport,
      count: next.length,
      goal: p.goal,
      has_challenge: next.some((s) => s.isChallenge),
      avoid_zones: p.avoidZones.length,
    });
    if (user?.id) {
      recordShown(user.id, params.sport, next, (params.cfParams ?? params.hyroxParams ?? {}) as Record<string, unknown>);
    }
  }, [params, user?.id]);

  useEffect(() => {
    (async () => {
      const p = user?.id ? await loadWodProfile(user.id) : EMPTY_PROFILE;
      setProfile(p);
      setUsePR(Object.keys(p.prs ?? {}).length > 0); // ON par défaut si des PR existent
      generate(p);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (s: RankedSuggestion, rank: number, withCamera: boolean) => {
    trackEvent('wod_suggestion_chosen', {
      sport: params.sport, rank, match_pct: s.matchPct, is_challenge: s.isChallenge, method: s.method,
    });
    if (user?.id) {
      recordChosen(user.id, params.sport, s, suggestions.filter((x) => x !== s), rank);
    }
    // → flux timer EXISTANT (mode « libre » préconfiguré), comme depuis l'écran générateur.
    if (s.kind === 'hyrox') {
      const plan = buildHyroxTimerPlan(s.wod as HyroxWod);
      navigation.navigate('TimerRun', buildHyroxTimerRunParams(plan, {
        countdown: TIMER_COUNTDOWN, title: s.wod.title, withCamera,
      }));
      setPendingRpe(s);
      return;
    }
    const cf = s.wod as CFWod;
    navigation.navigate('TimerRun', buildTimerRunParams(
      {
        title: cf.title,
        wod_type: CF_METHOD_TO_WOD_TYPE[cf.method] ?? 'for-time',
        time_cap_seconds: cf.time_cap_min * 60,
        rounds: undefined,
        emom_interval_minutes: undefined,
        tabata_work_seconds: undefined,
        tabata_rest_seconds: undefined,
      },
      { withCamera, countdown: TIMER_COUNTDOWN },
    ));
    setPendingRpe(s);
  };

  // Retour sur l'écran après une séance lancée → RPE 1-tap.
  useFocusEffect(
    useCallback(() => {
      if (pendingRpe) setRpeModal(true);
    }, [pendingRpe]),
  );

  const submitRpe = (rpe: Rpe) => {
    const s = pendingRpe;
    setRpeModal(false);
    setPendingRpe(null);
    if (!s) return;
    trackEvent('wod_completed', { sport: params.sport, rpe, method: s.method, is_challenge: s.isChallenge });
    if (user?.id) recordCompleted(user.id, params.sport, s, rpe);
  };

  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / PAGE_W);
    if (i !== page) setPage(i);
  };

  const launch = (withCamera: boolean) => {
    const target = cameraFor;
    setCameraFor(null);
    if (target) choose(target.s, target.rank, withCamera);
  };

  const regenerate = (reason: (typeof SKIP_REASONS)[number]['key']) => {
    setReasonModal(false);
    trackEvent('wod_regenerated', { sport: params.sport, reason });
    if (user?.id) recordSkippedAll(user.id, params.sport, suggestions, reason);
    generate(profile);
  };

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={[S.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ChevronLeft size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Ta séance</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <View style={S.scroll}>
          <View style={S.subtitleRow}>
            <Text style={S.subtitle}>
              {suggestions.length > 0
                ? 'Swipe pour comparer, puis lance ta séance.'
                : 'Aucune proposition pour ces réglages.'}
            </Text>
            {suggestions.length > 1 && (
              <Text style={S.counter}>{page + 1}/{suggestions.length}</Text>
            )}
          </View>

          {/* Charges perso : visible seulement si l'utilisateur a renseigné des PR (page Records) */}
          {hasPRs && (
            <View style={S.prToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={S.prToggleTitle}>Charges basées sur mes PR</Text>
                <Text style={S.prToggleSub}>
                  {usePR ? 'Poids calculés depuis tes 1RM' : 'Poids RX standard (H/F)'}
                </Text>
              </View>
              <Switch
                value={usePR}
                onValueChange={setUsePR}
                trackColor={{ false: theme.border, true: theme.ctaBg }}
                thumbColor={usePR ? theme.accent : theme.surface}
              />
            </View>
          )}

          {suggestions.length === 0 && (
            <GlassCard style={S.card}>
              <Text style={S.title}>Aucune séance ne passe tes filtres</Text>
              <Text style={S.moveLine}>
                {profile.avoidZones.length > 0
                  ? 'Tes zones à ménager excluent tous les mouvements disponibles avec ce matériel. Retire une zone ou élargis le matériel, puis relance.'
                  : 'Change la durée, la méthode ou le matériel, puis relance la génération.'}
              </Text>
              <TouchableOpacity style={[S.cta, { backgroundColor: theme.accent }]} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                <Text style={[S.ctaText, { color: theme.background }]}>Modifier mes réglages</Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            snapToInterval={PAGE_W}
            snapToAlignment="start"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPagerScroll}
            style={S.pager}
            contentContainerStyle={{ alignItems: 'stretch' }}
          >
          {suggestions.map((s, i) => {
            const isFirst = i === 0;
            const accent = s.isChallenge ? theme.warning : theme.accent;
            return (
              <View key={s.signature} style={S.page}>
              <GlassCard
                style={[S.card, (isFirst || s.isChallenge) && { borderColor: accent, borderWidth: 1.5 }]}
              >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.cardBody}>
                <View style={S.cardTop}>
                  <Text style={[S.method, s.isChallenge && { color: theme.warning }]}>
                    {s.isChallenge ? '⚡ DÉFI · ' : ''}{s.method} · cap {(s.wod as CFWod).time_cap_min} min
                  </Text>
                  <View style={[S.matchBadge, { backgroundColor: `${accent}22` }]}>
                    {s.isChallenge
                      ? <Zap size={11} color={accent} />
                      : <Trophy size={11} color={accent} />}
                    <Text style={[S.matchText, { color: accent }]}>
                      {s.isChallenge ? 'DÉFI' : `MATCH ${s.matchPct} %`}
                    </Text>
                  </View>
                </View>

                <Text style={S.title}>{s.wod.title}</Text>

                {movementLines(s, usePR, profile.prs ?? {}).map((l, j) => (
                  <Text key={j} style={l.startsWith('  ') ? S.moveLine : S.schemeLine}>{l}</Text>
                ))}

                {/* Le « pourquoi » n'apparaît que s'il apporte une info personnelle (sinon vide). */}
                {s.why !== '' && (
                  <View style={[S.whyBox, s.isChallenge && { backgroundColor: `${theme.warning}14` }]}>
                    <Text style={[S.whyText, s.isChallenge && { color: theme.warning }]}>{s.why}</Text>
                  </View>
                )}
                </ScrollView>

                <TouchableOpacity
                  style={[S.cta, { backgroundColor: accent }]}
                  onPress={() => setCameraFor({ s, rank: i + 1 })}
                  activeOpacity={0.85}
                >
                  <Text style={[S.ctaText, { color: theme.background }]}>
                    {s.isChallenge ? 'Je relève le défi' : 'Lancer le WOD'}
                  </Text>
                </TouchableOpacity>
              </GlassCard>
              </View>
            );
          })}
          </ScrollView>

          {suggestions.length > 1 && (
            <View style={S.dots}>
              {suggestions.map((s, i) => (
                <View
                  key={s.signature}
                  style={[S.dot, i === page && { backgroundColor: theme.accent, width: 20 }]}
                />
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[S.regen, { marginBottom: insets.bottom + 16 }]}
            onPress={() => setReasonModal(true)}
            activeOpacity={0.85}
          >
            <RefreshCw size={16} color={theme.text} />
            <Text style={S.regenText}>Regénérer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Choix caméra avant de lancer la séance (même options que le flux timer existant) */}
      <Modal visible={cameraFor !== null} transparent animationType="fade" onRequestClose={() => setCameraFor(null)}>
        <TouchableOpacity style={S.modalBg} activeOpacity={1} onPress={() => setCameraFor(null)}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Comment veux-tu t'entraîner ?</Text>
            <Text style={S.modalSub}>{cameraFor?.s.wod.title}</Text>
            <TouchableOpacity style={S.choiceRow} onPress={() => launch(true)} activeOpacity={0.85}>
              <Camera size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={S.choiceTitle}>Avec caméra</Text>
                <Text style={S.choiceSub}>Enregistre ta séance</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={S.choiceRow} onPress={() => launch(false)} activeOpacity={0.85}>
              <CameraOff size={20} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={S.choiceTitle}>Sans caméra</Text>
                <Text style={S.choiceSub}>Chrono simple</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Raison de regénération : chaque re-roll devient un signal (SPEC §5) */}
      <Modal visible={reasonModal} transparent animationType="fade" onRequestClose={() => setReasonModal(false)}>
        <TouchableOpacity style={S.modalBg} activeOpacity={1} onPress={() => setReasonModal(false)}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Qu'est-ce qui n'allait pas ?</Text>
            <Text style={S.modalSub}>Ça nous aide à mieux te proposer la prochaine fois.</Text>
            {SKIP_REASONS.map((r) => (
              <TouchableOpacity key={r.key} style={S.reasonChip} onPress={() => regenerate(r.key)}>
                <Text style={S.reasonText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* RPE post-séance : alimente la calibration du niveau (SPEC §6) */}
      <Modal visible={rpeModal} transparent animationType="fade" onRequestClose={() => setRpeModal(false)}>
        <View style={S.modalBg}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>C'était comment ?</Text>
            <Text style={S.modalSub}>Un tap suffit — on ajuste tes prochaines séances.</Text>
            {RPE_OPTIONS.map((o) => (
              <TouchableOpacity key={o.key} style={S.reasonChip} onPress={() => submitRpe(o.key)} activeOpacity={0.8}>
                <Text style={S.reasonText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, paddingHorizontal: H_PADDING },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  subtitle: { flex: 1, fontSize: 13, color: theme.textSecondary },
  counter: { fontSize: 13, fontWeight: '800', color: theme.text },

  pager: { flex: 1 },
  page: { width: PAGE_W },
  cardBody: { paddingBottom: 8 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border },

  prToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 16,
  },
  prToggleTitle: { fontSize: 13, fontWeight: '700', color: theme.text },
  prToggleSub: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },

  card: { flex: 1, padding: 20, borderRadius: 20 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  method: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: theme.textSecondary },
  matchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  matchText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '800', color: theme.text, marginTop: 4, marginBottom: 8 },
  schemeLine: { fontSize: 13, fontWeight: '600', color: theme.text, marginTop: 4 },
  moveLine: { fontSize: 13, color: theme.textSecondary },

  whyBox: { backgroundColor: `${theme.accent}1F`, borderRadius: 12, padding: 12, marginTop: 16 },
  whyText: { fontSize: 11, color: theme.accentDark, lineHeight: 16 },

  cta: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontSize: 14, fontWeight: '800' },

  regen: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    borderRadius: 14, paddingVertical: 16, marginTop: 14,
  },
  regenText: { fontSize: 15, fontWeight: '800', color: theme.text },

  choiceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 10,
  },
  choiceTitle: { fontSize: 15, fontWeight: '800', color: theme.text },
  choiceSub: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },

  modalBg: { flex: 1, backgroundColor: theme.modalBackdrop, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.modalCard, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  modalSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2, marginBottom: 20 },
  reasonChip: {
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 8,
  },
  reasonText: { fontSize: 15, color: theme.text },
}); }
