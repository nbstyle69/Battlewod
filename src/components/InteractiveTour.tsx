import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, AppTheme } from '../context/ThemeContext';

const { width: W, height: H } = Dimensions.get('window');

const TOUR_KEY = '@athlex:tourDone';

export interface TourStep {
  /** Tab name shown to user */
  label: string;
  /** Description text */
  description: string;
  /** Approximate position of the highlight zone (relative to screen) */
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_STEPS: TourStep[] = [
  {
    label: 'WOD',
    description: 'Génère ton premier WOD ici',
    x: 0,
    y: H - 85,
    w: W / 5,
    h: 65,
  },
  {
    label: 'Compétitions',
    description: "Inscris-toi à des tournois et grimpe dans le classement ELO",
    x: W / 5,
    y: H - 85,
    w: W / 5,
    h: 65,
  },
  {
    label: 'Whiteboard',
    description: "Consulte les WODs du jour de ta box, ou crée tes propres entraînements",
    x: (W / 5) * 2,
    y: H - 85,
    w: W / 5,
    h: 65,
  },
  {
    label: 'Profil',
    description: "Tes stats, ton ELO, tes badges et tes infos personnelles",
    x: (W / 5) * 4,
    y: H - 85,
    w: W / 5,
    h: 65,
  },
];

interface Props {
  steps?: TourStep[];
  onComplete?: () => void;
}

export default function InteractiveTour({ steps = DEFAULT_STEPS, onComplete }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then(v => {
      if (v !== 'true') {
        setVisible(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        startPulse();
      }
    });
  }, []);

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
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      await handleDismiss();
    }
  }

  async function handleDismiss() {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(async () => {
      setVisible(false);
      await AsyncStorage.setItem(TOUR_KEY, 'true');
      onComplete?.();
    });
  }

  if (!visible || steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Tooltip position: above the highlighted area
  const tooltipTop = step.y - 120;
  const tooltipLeft = Math.max(16, Math.min(step.x + step.w / 2 - 140, W - 296));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim, zIndex: 9999 }]} pointerEvents="box-none">
      {/* Semi-transparent overlay */}
      <TouchableOpacity
        style={S.overlay}
        activeOpacity={1}
        onPress={handleNext}
      >
        {/* Cut-out highlight */}
        <View style={[S.highlight, {
          left: step.x - 4,
          top: step.y - 4,
          width: step.w + 8,
          height: step.h + 8,
        }]}>
          <Animated.View style={[S.highlightInner, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[S.highlightBox, {
              width: step.w + 8,
              height: step.h + 8,
              borderRadius: 16,
            }]} />
          </Animated.View>
        </View>

        {/* Tooltip */}
        <View style={[S.tooltip, { top: tooltipTop, left: tooltipLeft }]}>
          <Text style={S.tooltipLabel}>{step.label}</Text>
          <Text style={S.tooltipDesc}>{step.description}</Text>
          <View style={S.tooltipFooter}>
            <Text style={S.tooltipStep}>{stepIndex + 1}/{steps.length}</Text>
            <View style={S.tooltipBtns}>
              {!isLast && (
                <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7}>
                  <Text style={S.tooltipSkip}>Passer le tour</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleNext} style={S.tooltipNextBtn} activeOpacity={0.85}>
                <Text style={S.tooltipNextText}>{isLast ? 'Terminer' : 'Suivant'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  highlight: {
    position: 'absolute',
  },
  highlightInner: {
    flex: 1,
  },
  highlightBox: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 2,
    borderColor: t.accent,
  },
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
