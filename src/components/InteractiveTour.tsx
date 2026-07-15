import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform,
  Modal, StatusBar,
} from 'react-native';
import {
  TrendingUp, Users, Trophy, Video, Sparkles, Calculator,
  Swords, Compass, Building2, CalendarClock,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme, AppTheme } from '../context/ThemeContext';

const { width: W, height: H } = Dimensions.get('window');

const TOUR_KEY = '@athlex:tourDone';

export interface TourStep {
  label: string;
  description: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type IconCmp = React.ComponentType<{ color?: string; size?: number }>;
interface FeatureStep {
  icon: IconCmp;
  label: string;
  description: string;
  section: string;
}

const TAB_Y = H - 85;
const TAB_H = 65;

// ── Member/athlete tour : explication des fonctionnalités (accueil + navbar).
// Rendu en cartes centrées, textes i18n (voir clé "tour" dans les locales).
// L'ordre des icônes suit l'ordre du tableau tour.steps.
const HOME_ICONS: IconCmp[] = [TrendingUp, Users, Trophy, Video, Sparkles, Calculator];
const NAV_ICONS: IconCmp[] = [Swords, Compass, Building2, CalendarClock];

// ── Box Owner tabs: Dashboard | WODs | Horaires | Membres | Messages | Profil (6 tabs)
const BO_W = W / 6;
export const BO_TOUR_STEPS: TourStep[] = [
  { label: 'Dashboard', description: 'Vue d\'ensemble de votre box — stats, membres, compétitions', x: 0, y: TAB_Y, w: BO_W, h: TAB_H },
  { label: 'WODs', description: 'Programmez et publiez les WODs quotidiens pour vos athlètes', x: BO_W, y: TAB_Y, w: BO_W, h: TAB_H },
  { label: 'Membres', description: 'Gérez les athlètes inscrits à votre box', x: BO_W * 3, y: TAB_Y, w: BO_W, h: TAB_H },
  { label: 'Profil', description: 'Vos infos personnelles, paramètres et abonnement', x: BO_W * 5, y: TAB_Y, w: BO_W, h: TAB_H },
];

// ── Coach tabs: WODs | Horaires | Whiteboard | Messages | Profil (5 tabs)
const CO_W = W / 5;
export const COACH_TOUR_STEPS: TourStep[] = [
  { label: 'WODs', description: 'Consultez et programmez les WODs de la box', x: 0, y: TAB_Y, w: CO_W, h: TAB_H },
  { label: 'Whiteboard', description: 'Le tableau blanc — WODs du jour et résultats des athlètes', x: CO_W * 2, y: TAB_Y, w: CO_W, h: TAB_H },
  { label: 'Messages', description: 'Communiquez avec les membres de la box', x: CO_W * 3, y: TAB_Y, w: CO_W, h: TAB_H },
  { label: 'Profil', description: 'Vos infos et paramètres', x: CO_W * 4, y: TAB_Y, w: CO_W, h: TAB_H },
];

interface Props {
  steps?: TourStep[];
  onComplete?: () => void;
}

export default function InteractiveTour({ steps, onComplete }: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  // Pas de `steps` → tour athlète (cartes de fonctionnalités i18n).
  // `steps` fourni (owner/coach) → tour "spotlight" sur les onglets.
  const spotlight = Array.isArray(steps);

  const featureSteps = useMemo<FeatureStep[]>(() => {
    if (spotlight) return [];
    const raw = t('tour.steps', { returnObjects: true }) as { label: string; description: string }[];
    const list = Array.isArray(raw) ? raw : [];
    const sectionHome = t('tour.sectionHome');
    const sectionNav = t('tour.sectionNav');
    return list.map((s, i) => ({
      label: s.label,
      description: s.description,
      icon: i < HOME_ICONS.length
        ? HOME_ICONS[i]
        : (NAV_ICONS[i - HOME_ICONS.length] ?? Compass),
      section: i < HOME_ICONS.length ? sectionHome : sectionNav,
    }));
  }, [spotlight, t]);

  const total = spotlight ? (steps as TourStep[]).length : featureSteps.length;

  const [state, setState] = useState<'show' | 'hide'>('show');
  const [stepIndex, setStepIndex] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY)
      .then(v => { if (v === 'true') setState('hide'); })
      .catch(() => { /* show by default on error */ });
  }, []);

  useEffect(() => {
    if (state === 'show' && spotlight) startPulse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function startPulse() {
    pulseAnim.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }

  async function handleNext() {
    if (stepIndex < total - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      await handleDismiss();
    }
  }

  async function handleDismiss() {
    setState('hide');
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    onComplete?.();
  }

  if (state !== 'show' || total === 0) return null;

  const isLast = stepIndex === total - 1;

  // ── Tour athlète : cartes centrées ──────────────────────────────
  if (!spotlight) {
    const step = featureSteps[stepIndex];
    const Icon = step.icon;
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={handleDismiss}>
        <StatusBar backgroundColor="rgba(0,0,0,0.72)" barStyle="light-content" />
        <TouchableOpacity style={S.cardOverlay} activeOpacity={1} onPress={handleNext}>
          <View style={S.card}>
            <View style={S.iconCircle}>
              <Icon color={theme.accent} size={30} />
            </View>
            <Text style={S.section}>{step.section}</Text>
            <Text style={S.cardTitle}>{step.label}</Text>
            <Text style={S.cardDesc}>{step.description}</Text>

            <View style={S.dots}>
              {featureSteps.map((_, i) => (
                <View key={i} style={[S.dot, i === stepIndex && S.dotActive]} />
              ))}
            </View>

            <View style={S.cardFooter}>
              <Text style={S.cardStep}>{stepIndex + 1}/{total}</Text>
              <View style={S.tooltipBtns}>
                {!isLast && (
                  <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7}>
                    <Text style={S.tooltipSkip}>{t('tour.skip')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleNext} style={S.tooltipNextBtn} activeOpacity={0.85}>
                  <Text style={S.tooltipNextText}>{isLast ? t('tour.finish') : t('tour.next')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  // ── Tour owner/coach : spotlight sur les onglets ────────────────
  const step = (steps as TourStep[])[stepIndex];
  const tooltipTop = step.y - 130;
  const tooltipLeft = Math.max(16, Math.min(step.x + step.w / 2 - 140, W - 296));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={handleDismiss}>
      <StatusBar backgroundColor="rgba(0,0,0,0.65)" barStyle="light-content" />
      <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={handleNext}>
        <View style={[S.highlight, { left: step.x - 4, top: step.y - 4, width: step.w + 8, height: step.h + 8 }]}>
          <Animated.View style={[S.highlightInner, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[S.highlightBox, { width: step.w + 8, height: step.h + 8, borderRadius: 16 }]} />
          </Animated.View>
        </View>

        <View style={[S.tooltip, { top: tooltipTop, left: tooltipLeft }]}>
          <Text style={S.tooltipLabel}>{step.label}</Text>
          <Text style={S.tooltipDesc}>{step.description}</Text>
          <View style={S.tooltipFooter}>
            <Text style={S.tooltipStep}>{stepIndex + 1}/{total}</Text>
            <View style={S.tooltipBtns}>
              {!isLast && (
                <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7}>
                  <Text style={S.tooltipSkip}>{t('tour.skip')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleNext} style={S.tooltipNextBtn} activeOpacity={0.85}>
                <Text style={S.tooltipNextText}>{isLast ? t('tour.finish') : t('tour.next')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  highlight: {
    position: 'absolute',
  },
  highlightInner: {
    flex: 1,
  },
  highlightBox: {
    backgroundColor: `${t.accent}26`,
    borderWidth: 2,
    borderColor: t.accent,
  },
  // ── Card mode (athlete feature tour) ──
  cardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: t.modalCard,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 14 },
    }),
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${t.accent}1F`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  section: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: t.textMuted,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: t.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 21,
    color: t.textSecondary,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
    marginBottom: 18,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: t.accent,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  cardStep: {
    fontSize: 12,
    fontWeight: '700',
    color: t.textMuted,
  },
  // ── Tooltip mode (owner/coach spotlight) ──
  tooltip: {
    position: 'absolute',
    width: 280,
    backgroundColor: t.modalCard,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  tooltipLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: t.accent,
  },
  tooltipDesc: {
    fontSize: 14,
    lineHeight: 20,
    color: t.textSecondary,
  },
  tooltipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tooltipStep: {
    fontSize: 12,
    fontWeight: '600',
    color: t.textMuted,
  },
  tooltipBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tooltipSkip: {
    fontSize: 13,
    color: t.textMuted,
    fontWeight: '500',
  },
  tooltipNextBtn: {
    backgroundColor: t.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tooltipNextText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
}); }
