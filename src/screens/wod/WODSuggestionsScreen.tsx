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
  Dimensions, NativeScrollEvent, NativeSyntheticEvent, Share, Alert, Platform,
} from 'react-native';
import {
  ChevronLeft, RefreshCw, Zap, Trophy, Camera, CameraOff, Bookmark, Share2, BookOpen, Clock,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, AppTheme } from '../../context/ThemeContext';
import GlassBackground from '../../components/glass/GlassBackground';
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
import { buildCFTimerRunParams } from '../../utils/wod/cfTimer';
import { supabase } from '../../lib/supabase';
import { BoxWODType } from '../../types';

const CF_METHOD_TO_WOD_TYPE: Record<string, BoxWODType> = {
  // Les moteurs renvoient la méthode en majuscules (« FOR TIME », « FOR TIME (Benchmark) »…).
  'AMRAP': 'amrap', 'FOR TIME': 'for-time', 'EMOM': 'emom', 'TABATA': 'tabata', 'MAX REPS': 'amrap',
  'STRENGTH': 'strength',
};
const TIMER_COUNTDOWN = 10;
const TAB_BAR_H = Platform.OS === 'ios' ? 60 : 40;

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
type Params = {
  sport: Sport; cfParams?: CFParams; hyroxParams?: HyroxParams;
  /** état UI courant du générateur — prime sur la lecture Supabase (course write/read) */
  goal?: UserWodProfile['goal']; avoidZones?: UserWodProfile['avoidZones'];
};
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
  const [saving, setSaving] = useState<string | null>(null);

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
      const loaded = user?.id ? await loadWodProfile(user.id) : EMPTY_PROFILE;
      // Les choix faits À L'INSTANT sur l'écran générateur (objectif, zones) arrivent en
      // params : ils priment sur la lecture Supabase, qui peut être en retard d'un upsert.
      const p: UserWodProfile = {
        ...loaded,
        goal: params.goal ?? loaded.goal,
        avoidZones: params.avoidZones ?? loaded.avoidZones,
      };
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
    navigation.navigate(
      'TimerRun',
      buildCFTimerRunParams(cf, { withCamera, countdown: TIMER_COUNTDOWN }),
    );
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

  /** Fermeture SANS enregistrement (retour arrière, séance non faite) : ne pollue ni
   *  l'historique `completed`, ni la calibration, ni l'event Mixpanel. Désarme aussi
   *  `pendingRpe`, sinon la modale se réarmait à chaque re-focus de l'écran. */
  const dismissRpe = () => {
    setRpeModal(false);
    setPendingRpe(null);
  };

  /** Texte partagé / sauvegardé : mêmes lignes que la carte. */
  const wodText = (s: RankedSuggestion) =>
    movementLines(s, usePR, profile.prs ?? {}).join('\n');

  async function saveWod(s: RankedSuggestion) {
    if (!user?.id) { Alert.alert('Connecte-toi', 'Il faut être connecté pour sauvegarder un WOD.'); return; }
    setSaving(s.signature);
    const wod = s.wod as CFWod;
    // Une carte Hyrox n'a ni `level` ni `format` CF : on prend les vrais champs du
    // HyroxWod (category, format Solo/Doubles/Relais) au lieu de forcer 'Solo'/'RX'
    // — sinon une séance Doubles était historisée comme Solo RX (données fausses).
    const hy = s.kind === 'hyrox' ? (s.wod as HyroxWod) : null;
    const { error } = await supabase.from('generated_wods').insert({
      user_id: user.id,
      sport: params.sport,
      wod_name: wod.title,
      wod_type: s.method,
      duration: wod.time_cap_min,
      level: hy ? hy.category : wod.level ?? 'RX',
      format: hy ? hy.format : 'Solo',
      movements: wodText(s),
      scoring: wod.score_type,
      coach_tip: wod.coach_notes.join('\n'),
    });
    setSaving(null);
    if (error) { Alert.alert('Erreur', error.message); return; }
    Alert.alert('✅ WOD sauvegardé', 'Retrouve-le dans ton historique.');
  }

  async function addToWhiteboard(s: RankedSuggestion) {
    if (!user?.id) { Alert.alert('Connecte-toi', 'Il faut être connecté pour utiliser le whiteboard.'); return; }
    setSaving(s.signature);
    const wod = s.wod as CFWod;
    const { error } = await supabase.from('box_wods').insert({
      box_id: null,
      created_by: user.id,
      title: wod.title,
      description: `${wodText(s)}\n\n📊 ${wod.score_type}`,
      wod_type: s.kind === 'cf' ? (CF_METHOD_TO_WOD_TYPE[wod.method] ?? 'custom') : 'custom',
      scheduled_date: new Date().toISOString().slice(0, 10),
      time_cap_seconds: wod.time_cap_min * 60,
      notes: wod.coach_notes.join('\n'),
      is_published: true,
      leaderboard_enabled: false,
      sort_order: 0,
    });
    setSaving(null);
    if (error) { Alert.alert('Erreur', error.message); return; }
    Alert.alert('✅ Ajouté au whiteboard', "La séance est programmée pour aujourd'hui.");
  }

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
            <View style={[S.card, S.cardInner]}>
              <Text style={S.title}>Aucune séance ne passe tes filtres</Text>
              <Text style={S.moveLine}>
                {profile.avoidZones.length > 0
                  ? 'Tes zones à ménager excluent tous les mouvements disponibles avec ce matériel. Retire une zone ou élargis le matériel, puis relance.'
                  : 'Change la durée, la méthode ou le matériel, puis relance la génération.'}
              </Text>
              <TouchableOpacity style={[S.cta, { backgroundColor: theme.accent }]} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                <Text style={[S.ctaText, { color: theme.background }]}>Modifier mes réglages</Text>
              </TouchableOpacity>
            </View>
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
            contentContainerStyle={{ flexGrow: 1, alignItems: 'stretch' }}
          >
          {suggestions.map((s, i) => {
            const isFirst = i === 0;
            const accent = s.isChallenge ? theme.warning : theme.accent;
            return (
              <View key={s.signature} style={S.page}>
              <View
                style={[S.card, (isFirst || s.isChallenge) && { borderColor: accent, borderWidth: 1.5 }]}
              >
                <View style={S.cardInner}>
                  <View style={S.cardTop}>
                    <View style={S.badges}>
                      <View style={[S.badge, { backgroundColor: `${accent}20` }]}>
                        <Text style={[S.badgeText, { color: accent }]}>{s.method}</Text>
                      </View>
                      <View style={[S.badge, { backgroundColor: theme.surface }]}>
                        <Clock size={11} color={theme.textMuted} />
                        <Text style={[S.badgeText, { color: theme.textMuted }]}>
                          cap {(s.wod as CFWod).time_cap_min} min
                        </Text>
                      </View>
                    </View>
                    {/* Le score n'a de sens que si un signal personnel a joué (sinon 50 % partout). */}
                    {(s.isChallenge || s.personalized) && (
                    <View style={[S.matchBadge, { backgroundColor: `${accent}22` }]}>
                      {s.isChallenge
                        ? <Zap size={11} color={accent} />
                        : <Trophy size={11} color={accent} />}
                      <Text style={[S.matchText, { color: accent }]}>
                        {s.isChallenge ? 'DÉFI' : `POUR TOI ${s.matchPct} %`}
                      </Text>
                    </View>
                    )}
                  </View>

                  <Text style={S.title}>{s.wod.title}</Text>

                  <View style={S.moveBox}>
                    {movementLines(s, usePR, profile.prs ?? {}).map((l, j) => (
                      <Text key={j} style={l.startsWith('  ') ? S.moveLine : S.schemeLine}>{l.trim()}</Text>
                    ))}
                  </View>

                  <View style={S.scoringRow}>
                    <Zap size={14} color={theme.gold} />
                    <Text style={S.scoringText}>
                      {(s.wod as CFWod).score_type} — cap {(s.wod as CFWod).time_cap_min} min
                    </Text>
                  </View>

                  {/* Le « pourquoi » n'apparaît que s'il apporte une info personnelle (sinon vide). */}
                  {s.why !== '' && (
                    <View style={[S.whyBox, s.isChallenge && { backgroundColor: `${theme.warning}14` }]}>
                      <Text style={[S.whyText, s.isChallenge && { color: theme.warning }]}>{s.why}</Text>
                    </View>
                  )}

                  <View style={S.actionRow}>
                    <TouchableOpacity
                      style={[S.actionBtn, { borderColor: accent }]}
                      onPress={() => saveWod(s)}
                      disabled={saving === s.signature}
                      activeOpacity={0.8}
                    >
                      {saving === s.signature
                        ? <ActivityIndicator size="small" color={accent} />
                        : <><Bookmark size={14} color={accent} /><Text style={[S.actionText, { color: accent }]}>Sauvegarder</Text></>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.actionBtn, { borderColor: accent }]}
                      onPress={() => Share.share({
                        message: `${s.wod.title}\n${(s.wod as CFWod).score_type}\n\n${wodText(s)}\n\nGénéré avec AthleX 💪`,
                      })}
                      activeOpacity={0.8}
                    >
                      <Share2 size={14} color={accent} />
                      <Text style={[S.actionText, { color: accent }]}>Partager</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[S.cta, { backgroundColor: accent }]}
                    onPress={() => setCameraFor({ s, rank: i + 1 })}
                    activeOpacity={0.85}
                  >
                    <Zap size={16} color="#fff" />
                    <Text style={S.ctaText}>
                      {s.isChallenge ? 'JE RELÈVE LE DÉFI' : 'LANCER LE WOD'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[S.wbBtn, { borderColor: accent, backgroundColor: `${accent}15` }]}
                    onPress={() => addToWhiteboard(s)}
                    disabled={saving === s.signature}
                    activeOpacity={0.85}
                  >
                    <BookOpen size={16} color={accent} />
                    <Text style={[S.wbText, { color: accent }]}>AJOUTER AU WHITEBOARD</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
            // La barre d'onglets flotte au-dessus de l'écran (84 px iOS) : sans cette marge
            // le bouton passe dessous et n'est visible qu'en scrollant.
            style={[S.regen, { marginBottom: TAB_BAR_H + insets.bottom + 16 }]}
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

      {/* RPE post-séance : alimente la calibration du niveau (SPEC §6).
          L'app ne SAIT PAS si la séance a réellement eu lieu (le timer ne renvoie pas de
          signal de fin) → toute sortie sans réponse explicite ne doit RIEN enregistrer. */}
      <Modal visible={rpeModal} transparent animationType="fade" onRequestClose={dismissRpe}>
        <TouchableOpacity style={S.modalBg} activeOpacity={1} onPress={dismissRpe}>
          <TouchableOpacity activeOpacity={1} style={S.modalSheet}>
            <Text style={S.modalTitle}>C'était comment ?</Text>
            <Text style={S.modalSub}>Un tap suffit — on ajuste tes prochaines séances.</Text>
            {RPE_OPTIONS.map((o) => (
              <TouchableOpacity key={o.key} style={S.reasonChip} onPress={() => submitRpe(o.key)} activeOpacity={0.8}>
                <Text style={S.reasonText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={S.rpeSkip} onPress={dismissRpe} activeOpacity={0.8}>
              <Text style={S.rpeSkipText}>Je ne l'ai pas faite</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
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
  // Carte à hauteur de contenu, centrée : ni trou dans la carte, ni bloc écrasé.
  page: { width: PAGE_W, justifyContent: 'center' },

  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border },

  prToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 16,
  },
  prToggleTitle: { fontSize: 13, fontWeight: '700', color: theme.text },
  prToggleSub: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },

  // La carte s'adapte à son contenu : pas de vide entre le WOD et les boutons.
  // flex:1 obligatoire : GlassCard place son contenu dans une vue flex:1,
  // une carte à hauteur automatique s'écraserait.
  // Vue simple (pas GlassCard) : sur iOS le wrapper BlurView en flex:1 écrase
  // une carte à hauteur de contenu. Même rendu que la carte du générateur.
  card: {
    borderRadius: 16, backgroundColor: theme.card,
    borderWidth: 1, borderColor: theme.border,
  },
  cardInner: { padding: 16, gap: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  method: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: theme.textSecondary },
  matchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  matchText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '900', color: theme.text, letterSpacing: -0.3 },
  schemeLine: { fontSize: 12, fontWeight: '800', color: theme.textSecondary },
  moveLine: { fontSize: 13, fontWeight: '600', color: theme.text },

  whyBox: { backgroundColor: `${theme.accent}1F`, borderRadius: 12, padding: 12, marginTop: 16 },
  whyText: { fontSize: 11, color: theme.accentDark, lineHeight: 16 },

  badges: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },

  // Le bloc séance absorbe la hauteur restante : pas de vide entre les blocs.
  moveBox: {
    backgroundColor: theme.surface, borderRadius: 10, padding: 12, gap: 3,
  },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoringText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, flex: 1 },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1.5, paddingVertical: 10,
  },
  actionText: { fontSize: 12, fontWeight: '800' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, padding: 14,
  },
  ctaText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  wbBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 2, padding: 14,
  },
  wbText: { fontSize: 14, fontWeight: '900' },

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
  rpeSkip: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  rpeSkipText: { fontSize: 13, fontWeight: '600', color: theme.textMuted, textDecorationLine: 'underline' },
}); }
