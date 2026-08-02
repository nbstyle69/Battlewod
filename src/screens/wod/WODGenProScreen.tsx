/**
 * AthleX — Générateur personnalisé (« WOD GEN »)
 * ==============================================
 * Nouvelle page, en parallèle de WODGeneratorScreen (comparaison A/B) : mêmes contrôles
 * (durée, type de travail, méthode, niveau, matériel) + les nouveautés de la SPEC :
 *   - Objectif du moment (§4)          - Zones à ménager (§8)
 *   - Badge de calibration (§6)        - Mode Hybrid : « Ma prochaine course » (§7)
 * « GÉNÉRER MA SÉANCE » ne produit pas un WOD : il pousse WODSuggestionsScreen (3 cartes).
 * Thème adaptatif via ThemeContext, composants glass existants, aucune couleur en dur
 * (hors orange Hybrid, déjà utilisé par l'écran générateur existant).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, ChevronUp, Sparkles, X, Flag, History, Heart } from 'lucide-react-native';

import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';

import { CFParams, Level, Intent, Method } from '../../utils/wod/engineCrossFit';
import { HyroxParams, Category, SessionType, TrainingType } from '../../utils/wod/engineHyrox';
import { BodyZone, ZONE_LABELS, excludedMovementNames } from '../../utils/wod/movementZones';
import { MOVEMENT_CATALOG } from '../../utils/movementsCatalog';
import {
  loadWodProfile, saveAvoidZone, removeAvoidZone, saveGoal, saveRace,
} from '../../services/wodPersonalization';
import { UserWodProfile, EMPTY_PROFILE } from '../../utils/wod/ranker';

const HYROX_ORANGE = '#F97316';

type Sport = 'functional' | 'hybrid';
type Goal = UserWodProfile['goal'];
type ZoneDuration = 'today' | 'week' | 'permanent';

const CF_LEVELS: Level[] = ['Scaled', 'Inter', 'RX', 'RX+', 'Elite', 'Pro'];
const CF_DURATIONS = [10, 20, 30, 45];
const CF_INTENTS: { key: Intent; label: string }[] = [
  { key: 'Mixed', label: '⚡ Mixed' }, { key: 'Cardio', label: '🫀 Cardio' },
  { key: 'Force', label: '💪 Force' }, { key: 'Gym', label: '🤸 Gym' },
];
const CF_METHODS: Method[] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];
const CF_EQUIPMENT = [
  'Barre + Disques', 'Haltères', 'Kettlebell', 'Box', 'Corde à sauter',
  'Barre de traction', 'Anneaux', 'Erg',
];

const HY_DURATIONS: HyroxParams['duration_min'][] = [20, 30, 45, 60];
const HY_SESSIONS: { key: SessionType; label: string }[] = [
  { key: 'Interval', label: '⚡ Interval' }, { key: 'Engine', label: '🔧 Engine' },
  { key: 'Aerobic', label: '🏃 Aerobic' }, { key: 'Run Split', label: '🎽 Run Split' },
  { key: 'Force', label: '💪 Force' },
];
const HY_TRAINING: TrainingType[] = ['Race Simulation', 'Station Training', 'Cardio Force', 'Named WOD'];
const HY_CATEGORIES: Category[] = ['Women', 'Women Pro', 'Men', 'Men Pro'];
const HY_FORMATS: HyroxParams['format'][] = ['Solo', 'Doubles', 'Relais', 'Mixed Relais'];
const HY_EQUIPMENT = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'RowErg', 'BikeErg',
  'Burpee Broad Jump', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
];

const GOALS: { key: Goal; label: string; sub: string }[] = [
  { key: 'balanced', label: 'Équilibré', sub: 'varié' },
  { key: 'progress', label: '⚡ Progresser', sub: 'sur mes faiblesses' },
  { key: 'race', label: '🏁 Compét', sub: 'préparer une course' },
];

const ZONE_DURATIONS: { key: ZoneDuration; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" }, { key: 'week', label: 'Cette semaine' },
  { key: 'permanent', label: 'Permanent' },
];

const ALL_MOVEMENT_NAMES = MOVEMENT_CATALOG.map((m) => m.name);

/** Date d'expiration d'une zone à ménager (null = permanent). */
function zoneUntil(d: ZoneDuration): string | null {
  if (d === 'permanent') return null;
  const date = new Date();
  date.setDate(date.getDate() + (d === 'today' ? 0 : 7));
  return date.toISOString().slice(0, 10);
}

export default function WODGenProScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [sport, setSport] = useState<Sport>('functional');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserWodProfile>(EMPTY_PROFILE);
  const [advanced, setAdvanced] = useState(false);

  // Functional Fitness
  const [level, setLevel] = useState<Level>('RX');
  const [duration, setDuration] = useState(20);
  const [intent, setIntent] = useState<Intent>('Mixed');
  const [method, setMethod] = useState<Method>('For Time');
  const [equipment, setEquipment] = useState<string[]>(['Barre + Disques', 'Corde à sauter']);

  // Hybrid / Hyrox
  const [category, setCategory] = useState<Category>('Men');
  const [hyDuration, setHyDuration] = useState<HyroxParams['duration_min']>(45);
  const [session, setSession] = useState<SessionType>('Engine');
  const [training, setTraining] = useState<TrainingType>('Race Simulation');
  const [hyFormat, setHyFormat] = useState<HyroxParams['format']>('Solo');
  const [hyEquipment, setHyEquipment] = useState<string[]>([]);

  // Personnalisation
  const [goal, setGoal] = useState<Goal>('balanced');
  const [avoidZones, setAvoidZones] = useState<BodyZone[]>([]);
  const [zoneModal, setZoneModal] = useState(false);
  const [pendingZone, setPendingZone] = useState<BodyZone | null>(null);
  const [zoneDuration, setZoneDuration] = useState<ZoneDuration>('week');
  const [raceSheet, setRaceSheet] = useState(false);
  const [raceName, setRaceName] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [raceSaving, setRaceSaving] = useState(false);

  const reload = useCallback(async () => {
    const p = user?.id ? await loadWodProfile(user.id) : EMPTY_PROFILE;
    setProfile(p);
    setGoal(p.goal);
    setAvoidZones(p.avoidZones);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  const toggle = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  async function chooseGoal(g: Goal) {
    setGoal(g);
    if (user?.id) await saveGoal(user.id, g);
  }

  async function confirmZone() {
    if (!pendingZone) return;
    const zone = pendingZone;
    setAvoidZones((prev) => [...new Set([...prev, zone])]);
    setZoneModal(false);
    setPendingZone(null);
    if (user?.id) await saveAvoidZone(user.id, zone, zoneUntil(zoneDuration));
  }

  async function dropZone(zone: BodyZone) {
    setAvoidZones((prev) => prev.filter((z) => z !== zone));
    if (user?.id) await removeAvoidZone(user.id, zone);
  }

  async function confirmRace() {
    if (!raceName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) return;
    setRaceSaving(true);
    if (user?.id) {
      await saveRace(user.id, {
        name: raceName.trim(), race_date: raceDate, format: hyFormat, category,
      });
    }
    setRaceSaving(false);
    setRaceSheet(false);
    setGoal('race');
    reload();
  }

  function generate() {
    // goal/avoidZones passés EN DIRECT (état UI) : la génération n'attend pas que les
    // upserts Supabase (chooseGoal/confirmZone) soient visibles en lecture — sinon un
    // choix fait juste avant « Générer » pouvait être ignoré (course write/read).
    if (sport === 'functional') {
      const cfParams: CFParams = { level, duration_min: duration, intent, method, format: 'Solo', equipment };
      navigation.navigate('WODSuggestions', { sport, cfParams, goal, avoidZones });
    } else {
      const hyroxParams: HyroxParams = {
        category, duration_min: hyDuration, session_type: session,
        format: hyFormat, training_type: training, equipment: hyEquipment, vest: 'off',
      };
      navigation.navigate('WODSuggestions', { sport, hyroxParams, goal, avoidZones });
    }
  }

  const accent = sport === 'hybrid' ? HYROX_ORANGE : theme.accent;
  const excluded = excludedMovementNames(ALL_MOVEMENT_NAMES, pendingZone ? [pendingZone] : avoidZones);
  const adjustPct = Math.round(profile.levelAdjust * 100);
  const raceDaysLeft = profile.raceDaysLeft ?? null;

  /** Réglages : une seule ligne qui défile horizontalement (pas de retour à la ligne). */
  const ChipScroll = ({ children }: { children: React.ReactNode }) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={S.chipScroll}
      style={S.chipScrollOuter}
    >
      {children}
    </ScrollView>
  );

  const Chip = ({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) => (
    <TouchableOpacity
      style={[S.chip, selected && { backgroundColor: `${color ?? accent}25`, borderColor: color ?? accent }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[S.chipText, selected && { color: color ?? theme.text, fontWeight: '800' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={[S.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>
          Générateur {sport === 'hybrid' ? <Text style={{ color: HYROX_ORANGE }}>Hybrid</Text> : null}
        </Text>
        <Text style={S.headerSub}>3 propositions adaptées à ton profil</Text>
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color={theme.accent} /></View>
      ) : (
      <ScrollView contentContainerStyle={[S.content, { paddingBottom: insets.bottom + 140 }]} showsVerticalScrollIndicator={false}>
        {/* Accès rapide : Historique & Favoris (comme l'écran générateur existant) */}
        <View style={S.quickRow}>
          <GlassCard radius={12} style={{ flex: 1 }}>
            <TouchableOpacity style={S.quickBtn} onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.85}>
              <History color={theme.text} size={16} />
              <Text style={S.quickText}>Historique</Text>
            </TouchableOpacity>
          </GlassCard>
          <GlassCard radius={12} style={{ flex: 1 }}>
            <TouchableOpacity style={S.quickBtn} onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.85}>
              <Heart color={theme.error} size={16} />
              <Text style={S.quickText}>Favoris</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Sport */}
        <View style={S.sportRow}>
          {(['functional', 'hybrid'] as Sport[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[S.sportCard, sport === s && (s === 'hybrid'
                ? { borderColor: HYROX_ORANGE, backgroundColor: `${HYROX_ORANGE}10` }
                : { borderColor: theme.accent, backgroundColor: `${theme.accent}10` })]}
              onPress={() => setSport(s)}
              activeOpacity={0.85}
            >
              <Text style={S.sportEmoji}>{s === 'functional' ? '🏋️' : '🏁'}</Text>
              <Text style={S.sportLabel}>{s === 'functional' ? 'Functional Fitness' : 'Hybrid'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bandeau course (Hybrid) : périodisation par J−X (SPEC §7) */}
        {sport === 'hybrid' && raceDaysLeft !== null && (
          <GlassCard radius={14} style={S.raceBanner}>
            <Text style={S.raceBannerText}>
              🏁 Ta course — J−{raceDaysLeft} ·{' '}
              {raceDaysLeft <= 10 ? 'affûtage' : raceDaysLeft <= 42 ? 'volume race-specific' : 'base'}
            </Text>
          </GlassCard>
        )}

        {sport === 'functional' ? (
          <>
            <Section title="Durée" S={S}>
              <ChipScroll>
                {CF_DURATIONS.map((d) => (
                  <Chip key={d} label={`${d} min`} selected={duration === d} onPress={() => setDuration(d)} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Type de travail" S={S}>
              <ChipScroll>
                {CF_INTENTS.map((i) => (
                  <Chip key={i.key} label={i.label} selected={intent === i.key} onPress={() => setIntent(i.key)} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Méthode" S={S}>
              <ChipScroll>
                {CF_METHODS.map((m) => (
                  <Chip key={m} label={m} selected={method === m} onPress={() => setMethod(m)} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Niveau" S={S} badge={adjustPct !== 0 ? `${level} · ajusté ${adjustPct > 0 ? '+' : ''}${adjustPct} %` : undefined} theme={theme}>
              <ChipScroll>
                {CF_LEVELS.map((l) => (
                  <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(l)} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Matériel" S={S}>
              <ChipScroll>
                {CF_EQUIPMENT.map((e) => (
                  <Chip key={e} label={e} selected={equipment.includes(e)} onPress={() => toggle(equipment, setEquipment, e)} />
                ))}
              </ChipScroll>
            </Section>
          </>
        ) : (
          <>
            <Section title="Durée" S={S}>
              <ChipScroll>
                {HY_DURATIONS.map((d) => (
                  <Chip key={d} label={`${d} min`} selected={hyDuration === d} onPress={() => setHyDuration(d)} color={HYROX_ORANGE} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Type de séance" S={S}>
              <ChipScroll>
                {HY_SESSIONS.map((s) => (
                  <Chip key={s.key} label={s.label} selected={session === s.key} onPress={() => setSession(s.key)} color={HYROX_ORANGE} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Format de travail" S={S}>
              <ChipScroll>
                {HY_TRAINING.map((tt) => (
                  <Chip key={tt} label={tt} selected={training === tt} onPress={() => setTraining(tt)} color={HYROX_ORANGE} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Catégorie · format" S={S}>
              <ChipScroll>
                {HY_CATEGORIES.map((c) => (
                  <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} color={HYROX_ORANGE} />
                ))}
              </ChipScroll>
              <ChipScroll>
                {HY_FORMATS.map((f) => (
                  <Chip key={f} label={f} selected={hyFormat === f} onPress={() => setHyFormat(f)} color={HYROX_ORANGE} />
                ))}
              </ChipScroll>
            </Section>

            <Section title="Ma salle · matériel" S={S}>
              <ChipScroll>
                {HY_EQUIPMENT.map((e) => (
                  <Chip key={e} label={e} selected={hyEquipment.includes(e)} onPress={() => toggle(hyEquipment, setHyEquipment, e)} color={HYROX_ORANGE} />
                ))}
              </ChipScroll>
            </Section>
          </>
        )}

        {/* ── Options avancées (repliable) ─────────────────────────── */}
        <TouchableOpacity style={S.advToggle} onPress={() => setAdvanced((v) => !v)} activeOpacity={0.8}>
          <Text style={S.advToggleText}>Options avancées</Text>
          {advanced ? <ChevronUp size={18} color={theme.textSecondary} /> : <ChevronDown size={18} color={theme.textSecondary} />}
        </TouchableOpacity>

        {advanced && (
          <View style={S.advBox}>
            {/* Objectif du moment (SPEC §4) */}
            <Text style={S.advLabel}>Objectif du moment</Text>
            <View style={S.chipRow}>
              {GOALS.map((g) => (
                <TouchableOpacity
                  key={g.key}
                  style={[S.goalCard, goal === g.key && { borderColor: accent, backgroundColor: `${accent}15` }]}
                  onPress={() => chooseGoal(g.key)}
                  activeOpacity={0.85}
                >
                  <Text style={S.goalLabel}>{g.label}</Text>
                  <Text style={S.goalSub}>{g.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Zones à ménager (SPEC §8) */}
            <Text style={[S.advLabel, { marginTop: 20 }]}>Zones à ménager</Text>
            <View style={S.chipRow}>
              {avoidZones.map((z) => (
                <TouchableOpacity key={z} style={S.zoneChip} onPress={() => dropZone(z)} activeOpacity={0.8}>
                  <Text style={S.zoneChipText}>{ZONE_LABELS[z]}</Text>
                  <X size={12} color={theme.error} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={S.chip} onPress={() => setZoneModal(true)} activeOpacity={0.8}>
                <Text style={S.chipText}>+ Ajouter</Text>
              </TouchableOpacity>
            </View>
            {avoidZones.length > 0 && excluded.length > 0 && (
              <Text style={S.excludedText}>
                Sera exclu : {excluded.slice(0, 6).join(' · ')}
                {excluded.length > 6 ? '…' : ''} — des alternatives seront proposées.
              </Text>
            )}

            {/* Mode Hybrid : ma prochaine course (SPEC §7) */}
            {sport === 'hybrid' && (
              <>
                <Text style={[S.advLabel, { marginTop: 20 }]}>Ma prochaine course</Text>
                <TouchableOpacity style={S.raceBtn} onPress={() => setRaceSheet(true)} activeOpacity={0.85}>
                  <Flag size={15} color={HYROX_ORANGE} />
                  <Text style={S.raceBtnText}>
                    {raceDaysLeft !== null ? `Course déclarée — J−${raceDaysLeft} · modifier` : 'Déclarer ma course'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <GlassCard radius={16} variant={sport === 'hybrid' ? 'default' : 'emerald'} style={S.generateCard}>
          <TouchableOpacity
            style={[S.generateBtn, { borderColor: accent, backgroundColor: `${accent}1A` }]}
            onPress={generate}
            activeOpacity={0.9}
          >
            <Sparkles size={18} color={accent} />
            <View>
              <Text style={[S.generateText, { color: theme.text }]}>Générer des WODs</Text>
              <Text style={S.generateSub}>3 propositions adaptées à ton profil</Text>
            </View>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
      )}

      {/* Déclaration d'une zone à ménager */}
      <Modal visible={zoneModal} transparent animationType="slide" onRequestClose={() => setZoneModal(false)}>
        <View style={S.modalBg}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Une zone à ménager ?</Text>
            <Text style={S.modalSub}>
              On exclura les mouvements qui la sollicitent. Modifiable à tout moment.
            </Text>
            <View style={S.chipRow}>
              {(Object.keys(ZONE_LABELS) as BodyZone[]).map((z) => (
                <TouchableOpacity
                  key={z}
                  style={[S.chip, pendingZone === z && { borderColor: theme.error, backgroundColor: `${theme.error}18` }]}
                  onPress={() => setPendingZone(z)}
                  activeOpacity={0.8}
                >
                  <Text style={S.chipText}>{ZONE_LABELS[z]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[S.chipRow, { marginTop: 12 }]}>
              {ZONE_DURATIONS.map((d) => (
                <Chip key={d.key} label={d.label} selected={zoneDuration === d.key} onPress={() => setZoneDuration(d.key)} />
              ))}
            </View>
            {pendingZone && excluded.length > 0 && (
              <Text style={S.excludedText}>
                Sera exclu de tes WODs : {excluded.slice(0, 6).join(' · ')}
                {excluded.length > 6 ? '…' : ''}
              </Text>
            )}
            <View style={S.modalActions}>
              <TouchableOpacity style={S.modalCancel} onPress={() => { setZoneModal(false); setPendingZone(null); }} activeOpacity={0.8}>
                <Text style={S.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.modalConfirm, { backgroundColor: theme.accent, opacity: pendingZone ? 1 : 0.5 }]}
                onPress={confirmZone}
                disabled={!pendingZone}
                activeOpacity={0.85}
              >
                <Text style={[S.modalConfirmText, { color: theme.background }]}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom sheet « Ma prochaine course » (Hybrid) */}
      <Modal visible={raceSheet} transparent animationType="slide" onRequestClose={() => setRaceSheet(false)}>
        <View style={S.modalBg}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>🏁 Ma prochaine course</Text>
            <Text style={S.modalSub}>Ton plan d'entraînement s'organise automatiquement autour de cette date.</Text>
            <TextInput
              style={S.input}
              placeholder="Nom (ex. Hyrox Paris)"
              placeholderTextColor={theme.textMuted}
              value={raceName}
              onChangeText={setRaceName}
            />
            <TextInput
              style={S.input}
              placeholder="Date (AAAA-MM-JJ)"
              placeholderTextColor={theme.textMuted}
              value={raceDate}
              onChangeText={setRaceDate}
              autoCapitalize="none"
            />
            <View style={S.chipRow}>
              {HY_FORMATS.slice(0, 3).map((f) => (
                <Chip key={f} label={f} selected={hyFormat === f} onPress={() => setHyFormat(f)} color={HYROX_ORANGE} />
              ))}
            </View>
            <View style={[S.chipRow, { marginTop: 8 }]}>
              {HY_CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} color={HYROX_ORANGE} />
              ))}
            </View>
            <View style={S.modalActions}>
              <TouchableOpacity style={S.modalCancel} onPress={() => setRaceSheet(false)} activeOpacity={0.8}>
                <Text style={S.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.modalConfirm, { backgroundColor: HYROX_ORANGE, opacity: raceSaving ? 0.6 : 1 }]}
                onPress={confirmRace}
                disabled={raceSaving}
                activeOpacity={0.85}
              >
                <Text style={[S.modalConfirmText, { color: theme.background }]}>C'est ma course</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Section({ title, badge, children, S, theme }: {
  title: string; badge?: string; children: React.ReactNode;
  S: ReturnType<typeof createStyles>; theme?: AppTheme;
}) {
  return (
    <View style={S.section}>
      <View style={S.sectionHead}>
        <Text style={S.sectionTitle}>{title}</Text>
        {badge && theme && (
          <View style={[S.calibBadge, { backgroundColor: `${theme.accent}20` }]}>
            <Text style={[S.calibBadgeText, { color: theme.accentDark }]}>{badge}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: theme.text, marginTop: 12 },
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  content: { padding: 16 },

  sportRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sportCard: {
    flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4,
    backgroundColor: theme.card, borderWidth: 2, borderColor: theme.border,
  },
  sportEmoji: { fontSize: 24 },
  sportLabel: { fontSize: 13, fontWeight: '800', color: theme.textSecondary, textAlign: 'center' },

  raceBanner: { padding: 14, marginBottom: 20 },
  raceBannerText: { fontSize: 13, fontWeight: '700', color: theme.text },

  section: { marginBottom: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: theme.textSecondary },
  calibBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  calibBadgeText: { fontSize: 10, fontWeight: '800' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipScrollOuter: { marginHorizontal: -16, marginBottom: 8 },
  chipScroll: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  chipText: { fontSize: 13, color: theme.text, fontWeight: '600' },

  advToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  advToggleText: { fontSize: 14, fontWeight: '800', color: theme.text },
  advBox: {
    marginTop: 12, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface,
  },
  advLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: theme.textSecondary, marginBottom: 10 },

  goalCard: {
    flex: 1, minWidth: 96, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, alignItems: 'center',
  },
  goalLabel: { fontSize: 13, fontWeight: '800', color: theme.text, textAlign: 'center' },
  goalSub: { fontSize: 10, color: theme.textMuted, textAlign: 'center', marginTop: 2 },

  zoneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: theme.error, backgroundColor: `${theme.error}12`,
  },
  zoneChipText: { fontSize: 13, fontWeight: '700', color: theme.text },
  excludedText: { fontSize: 11, color: theme.textMuted, marginTop: 10, lineHeight: 16 },

  raceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: HYROX_ORANGE, backgroundColor: `${HYROX_ORANGE}12`,
  },
  raceBtnText: { fontSize: 13, fontWeight: '700', color: theme.text },

  generateCard: { marginTop: 24, overflow: 'hidden' },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 16, borderWidth: 1, padding: 18,
  },
  generateText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  generateSub: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, marginTop: 2 },

  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
  },
  quickText: { fontSize: 13, fontWeight: '800', color: theme.text },

  modalBg: { flex: 1, backgroundColor: theme.modalBackdrop, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.modalCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: theme.text },
  modalSub: { fontSize: 13, color: theme.textSecondary, marginTop: 2, marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: theme.text,
    fontSize: 14, marginBottom: 10,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancel: {
    flex: 1, padding: 16, borderRadius: 14, borderWidth: 1,
    borderColor: theme.border, alignItems: 'center',
  },
  modalCancelText: { color: theme.textSecondary, fontWeight: '700' },
  modalConfirm: { flex: 2, padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { fontWeight: '900', fontSize: 15 },
}); }
