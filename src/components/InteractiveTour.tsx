import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform,
  Modal, InteractionManager, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, AppTheme } from '../context/ThemeContext';
import { captureError } from '../lib/sentry';

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

// Tab order: Compete(0) | Explorer(1) | Home/Accueil(2) | Ma Box(3) | Résa(4)
const TAB_W = W / 5;
const TAB_Y = H - 85;
const TAB_H = 65;

const DEFAULT_STEPS: TourStep[] = [
  {
    label: 'Accueil & WOD',
    description: 'Génère ton premier WOD ici, lance le timer et suis ta progression',
    x: TAB_W * 2,
    y: TAB_Y,
    w: TAB_W,
    h: TAB_H,
  },
  {
    label: 'Compétitions',
    description: "Inscris-toi à des tournois et grimpe dans le classement ELO",
    x: 0,
    y: TAB_Y,
    w: TAB_W,
    h: TAB_H,
  },
  {
    label: 'Ma Box',
    description: "Consulte les WODs du jour de ta box, ou crée tes propres entraînements",
    x: TAB_W * 3,
    y: TAB_Y,
    w: TAB_W,
    h: TAB_H,
  },
  {
    label: 'Explorer',
    description: "Découvre des box, des programmes et des partenaires",
    x: TAB_W,
    y: TAB_Y,
    w: TAB_W,
    h: TAB_H,
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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        AsyncStorage.getItem(TOUR_KEY)
          .then(v => {
            if (v !== 'true') {
              setVisible(true);
              startPulse();
            }
          })
          .catch(e => {
            captureError(e, { action: 'InteractiveTour.checkTourDone' });
            setVisible(true);
            startPulse();
          });
      }, 600);
    });
    return () => handle.cancel();
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
    setVisible(false);
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    onComplete?.();
  }

  if (steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const tooltipTop = step.y - 130;
  const tooltipLeft = Math.max(16, Math.min(step.x + step.w / 2 - 140, W - 296));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.65)" barStyle="light-content" />
      <TouchableOpacity
        style={S.overlay}
        activeOpacity={1}
        onPress={handleNext}
      >
        {/* Highlight zone */}
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
