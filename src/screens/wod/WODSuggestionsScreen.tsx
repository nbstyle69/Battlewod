/**
 * AthleX — Écran de résultats du générateur : 3 suggestions personnalisées
 * ========================================================================
 * SPEC §0 (UX) : thème CLAIR glassmorphism existant — GlassBackground, GlassCard,
 * chips arrondies, accent Colors.accent (#10b981). Aucune nouvelle couleur en dur.
 * Remplace l'affichage « 1 WOD généré » par 3 cartes choisies par le ranker.
 *
 * Navigation : poussé par WODGeneratorScreen après « ✨ GÉNÉRER MON WOD »
 *   navigation.navigate('WODSuggestions', { sport, cfParams? , hyroxParams? })
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Switch,
} from 'react-native';
import { ChevronLeft, RefreshCw, Zap, Trophy } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../theme/colors';
import { spacing, borderRadius, typography } from '../../theme/designTokens';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';
import { useAuth } from '../../context/AuthContext';

import { CFParams, CFWod, Block as CFBlock } from '../../utils/wod/engineCrossFit';
import { HyroxParams, HyroxWod } from '../../utils/wod/engineHyrox';
import { rankCF, rankHyrox, RankedSuggestion, EMPTY_PROFILE, UserWodProfile } from '../../utils/wod/ranker';
import { personalizedLoadDisplay } from '../../utils/wod/movementLoadability';
import {
  loadWodProfile, recordShown, recordChosen, recordSkippedAll,
} from '../../services/wodPersonalization';

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

  const [profile, setProfile] = useState<UserWodProfile>(EMPTY_PROFILE);
  const [suggestions, setSuggestions] = useState<RankedSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasonModal, setReasonModal] = useState(false);
  // Charges basées sur les PR : actif par défaut dès qu'au moins un 1RM existe (page Records).
  const [usePR, setUsePR] = useState(false);
  const hasPRs = Object.keys(profile.prs ?? {}).length > 0;

  const generate = useCallback((p: UserWodProfile) => {
    const next =
      params.sport === 'functional'
        ? rankCF(params.cfParams!, p)
        : rankHyrox(params.hyroxParams!, p);
    setSuggestions(next);
    if (user?.id) recordShown(user.id, params.sport, next, params.cfParams ?? params.hyroxParams ?? {});
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

  const choose = (s: RankedSuggestion, rank: number) => {
    if (user?.id) {
      recordChosen(user.id, params.sport, s, suggestions.filter((x) => x !== s), rank);
    }
    // → flux existant : même destination que l'ancien générateur (carte WOD / timer).
    navigation.navigate('WODScreen', { generated: s.wod, sport: params.sport, seed: s.seed });
  };

  const regenerate = (reason: (typeof SKIP_REASONS)[number]['key']) => {
    setReasonModal(false);
    if (user?.id) recordSkippedAll(user.id, params.sport, suggestions, reason);
    generate(profile);
  };

  return (
    <GlassBackground>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ta séance</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            3 propositions adaptées à ton profil — choisis, c'est parti.
          </Text>

          {/* Charges perso : visible seulement si l'utilisateur a renseigné des PR (page Records) */}
          {hasPRs && (
            <View style={styles.prToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prToggleTitle}>Charges basées sur mes PR</Text>
                <Text style={styles.prToggleSub}>
                  {usePR ? 'Poids calculés depuis tes 1RM' : 'Poids RX standard (H/F)'}
                </Text>
              </View>
              <Switch
                value={usePR}
                onValueChange={setUsePR}
                trackColor={{ false: Colors.border, true: `${Colors.accent}99` }}
                thumbColor={usePR ? Colors.accent : Colors.surface}
              />
            </View>
          )}

          {suggestions.map((s, i) => {
            const isFirst = i === 0;
            const accent = s.isChallenge ? Colors.featured : Colors.accent;
            return (
              <GlassCard
                key={s.signature}
                style={[styles.card, (isFirst || s.isChallenge) && { borderColor: accent, borderWidth: 1.5 }]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.method, s.isChallenge && { color: Colors.featured }]}>
                    {s.isChallenge ? '⚡ DÉFI · ' : ''}{s.method} · cap {(s.wod as CFWod).time_cap_min} min
                  </Text>
                  <View style={[styles.matchBadge, { backgroundColor: `${accent}22` }]}>
                    {s.isChallenge
                      ? <Zap size={11} color={accent} />
                      : <Trophy size={11} color={accent} />}
                    <Text style={[styles.matchText, { color: accent }]}>
                      {s.isChallenge ? 'DÉFI' : `MATCH ${s.matchPct} %`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.title}>{s.wod.title}</Text>

                {movementLines(s, usePR, profile.prs ?? {}).slice(0, 6).map((l, j) => (
                  <Text key={j} style={l.startsWith('  ') ? styles.moveLine : styles.schemeLine}>{l}</Text>
                ))}

                <View style={[styles.whyBox, s.isChallenge && { backgroundColor: `${Colors.featured}14` }]}>
                  <Text style={[styles.whyText, s.isChallenge && { color: '#8a6d00' }]}>{s.why}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.cta, isFirst ? { backgroundColor: Colors.accent } : styles.ctaAlt,
                          s.isChallenge && { backgroundColor: 'transparent', borderColor: Colors.featured, borderWidth: 1 }]}
                  onPress={() => choose(s, i + 1)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.ctaText, isFirst ? { color: '#fff' } : { color: Colors.text },
                                s.isChallenge && { color: Colors.featured }]}>
                    {s.isChallenge ? 'Je relève le défi' : isFirst ? "C'est parti" : 'Choisir celle-ci'}
                  </Text>
                </TouchableOpacity>
              </GlassCard>
            );
          })}

          <TouchableOpacity style={styles.regen} onPress={() => setReasonModal(true)} activeOpacity={0.8}>
            <RefreshCw size={15} color={Colors.textSecondary} />
            <Text style={styles.regenText}>Rien ne te plaît ? Regénérer</Text>
          </TouchableOpacity>
          <View style={{ height: insets.bottom + spacing.xxl }} />
        </ScrollView>
      )}

      {/* Raison de regénération : chaque re-roll devient un signal (SPEC §5) */}
      <Modal visible={reasonModal} transparent animationType="fade" onRequestClose={() => setReasonModal(false)}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setReasonModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Qu'est-ce qui n'allait pas ?</Text>
            <Text style={styles.modalSub}>Ça nous aide à mieux te proposer la prochaine fois.</Text>
            {SKIP_REASONS.map((r) => (
              <TouchableOpacity key={r.key} style={styles.reasonChip} onPress={() => regenerate(r.key)}>
                <Text style={styles.reasonText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  headerTitle: { ...typography.h3, color: Colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.lg },
  subtitle: { ...typography.bodySmall, color: Colors.textSecondary, marginBottom: spacing.md },

  prToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: borderRadius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  prToggleTitle: { ...typography.bodySmall, fontWeight: '700', color: Colors.text },
  prToggleSub: { ...typography.caption, color: Colors.textSecondary, marginTop: 1 },

  card: { padding: spacing.lg, marginBottom: spacing.md, borderRadius: borderRadius.xl },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  method: { ...typography.overline, color: Colors.textSecondary },
  matchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  matchText: { fontSize: 10, fontWeight: '800' },
  title: { ...typography.h3, color: Colors.text, marginTop: spacing.xs, marginBottom: spacing.sm },
  schemeLine: { ...typography.bodySmall, fontWeight: '600', color: Colors.text, marginTop: spacing.xs },
  moveLine: { ...typography.bodySmall, color: Colors.textSecondary },

  whyBox: {
    backgroundColor: `${Colors.accent}12`, borderRadius: borderRadius.md,
    padding: spacing.md, marginTop: spacing.md,
  },
  whyText: { ...typography.caption, color: Colors.accentDark, lineHeight: 16 },

  cta: {
    marginTop: spacing.md, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  ctaAlt: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  ctaText: { ...typography.button },

  regen: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border,
    borderRadius: borderRadius.md, paddingVertical: spacing.md, marginTop: spacing.xs,
  },
  regenText: { ...typography.bodySmall, color: Colors.textSecondary },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: borderRadius.xxl, borderTopRightRadius: borderRadius.xxl,
    padding: spacing.xl, paddingBottom: spacing.xxxl,
  },
  modalTitle: { ...typography.h4, color: Colors.text },
  modalSub: { ...typography.bodySmall, color: Colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },
  reasonChip: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: borderRadius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  reasonText: { ...typography.body, color: Colors.text },
});
