import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Filter, FeGaussianBlur, Circle, G, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

const { width: W, height: H } = Dimensions.get('window');

/**
 * Full-screen animated emerald gradient background with floating blurred blobs.
 * Adapts to dark/light theme. Place as the first child of a screen with absolute fill.
 */
type ThemePalette = {
  gradient: [string, string, string];
  blobColors: { b1: string; b2: string; b3: string; b4: string };
};

function usePalette(): ThemePalette {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const gradient: [string, string, string] = isDark
    ? ['#022c22', '#0d1f17', '#14532d']
    : ['#ecfdf5', '#f0fdf4', '#d1fae5'];
  const blobColors = isDark
    ? {
        b1: 'rgba(16,185,129,0.30)',
        b2: 'rgba(5,150,105,0.25)',
        b3: 'rgba(52,211,153,0.25)',
        b4: 'rgba(110,231,183,0.20)',
      }
    : {
        b1: 'rgba(16,185,129,0.50)',
        b2: 'rgba(5,150,105,0.40)',
        b3: 'rgba(52,211,153,0.40)',
        b4: 'rgba(110,231,183,0.35)',
      };
  return { gradient, blobColors };
}

/** Lightweight static background for Android — no animations, 2 fixed blobs. */
function AndroidGlassBackground() {
  const { gradient, blobColors } = usePalette();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={gradient}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ position: 'absolute', top: -80, left: -60 }}>
        <BlurredCircle color={blobColors.b1} size={320} blur={60} />
      </View>
      <View style={{ position: 'absolute', bottom: -80, right: -60 }}>
        <BlurredCircle color={blobColors.b2} size={300} blur={60} />
      </View>
    </View>
  );
}

/** Full-glass animated background for iOS — 4 blobs with native-driven floating loops. */
function IOSGlassBackground() {
  const { gradient, blobColors } = usePalette();
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;
  const a4 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (anim: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
    const animations = [loop(a1, 9000), loop(a2, 11000), loop(a3, 8000), loop(a4, 12000)];
    animations.forEach(a => a.start());
    return () => { animations.forEach(a => a.stop()); };
  }, [a1, a2, a3, a4]);

  const t1y = a1.interpolate({ inputRange: [0, 1], outputRange: [0, 30] });
  const t1x = a1.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const t2y = a2.interpolate({ inputRange: [0, 1], outputRange: [0, -25] });
  const t2x = a2.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  const t3y = a3.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  const t3x = a3.interpolate({ inputRange: [0, 1], outputRange: [0, 25] });
  const t4y = a4.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const t4x = a4.interpolate({ inputRange: [0, 1], outputRange: [0, -25] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={gradient}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={{ position: 'absolute', top: -80, left: -60, transform: [{ translateX: t1x }, { translateY: t1y }] }}>
        <BlurredCircle color={blobColors.b1} size={320} blur={60} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', bottom: -80, right: -60, transform: [{ translateX: t2x }, { translateY: t2y }] }}>
        <BlurredCircle color={blobColors.b2} size={300} blur={60} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: H * 0.35, left: -80, transform: [{ translateX: t3x }, { translateY: t3y }] }}>
        <BlurredCircle color={blobColors.b3} size={220} blur={40} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: H * 0.55, right: -100, transform: [{ translateX: t4x }, { translateY: t4y }] }}>
        <BlurredCircle color={blobColors.b4} size={260} blur={40} />
      </Animated.View>
    </View>
  );
}

export default function GlassBackground() {
  return Platform.OS === 'android' ? <AndroidGlassBackground /> : <IOSGlassBackground />;
}

/**
 * SVG circle with soft glow blob effect.
 * - iOS : uses <FeGaussianBlur> filter (sharp blob → blurred halo).
 * - Android : <FeGaussianBlur> is NOT supported by react-native-svg → fallback to
 *   a <RadialGradient> from opaque center → transparent edges, which renders correctly
 *   on both platforms and produces a visually similar soft blob.
 */
function BlurredCircle({ color, size, blur }: { color: string; size: number; blur: number }) {
  const padding = blur * 2;
  const total = size + padding * 2;
  const gradId = `blob-grad-${size}-${blur}`;

  // Android (and any non-iOS platform) → RadialGradient fallback
  if (Platform.OS !== 'ios') {
    // The visible "circle" radius is enlarged because the gradient fades to transparent,
    // so we draw a circle that fills the whole canvas to mimic the blurred reach.
    return (
      <Svg width={total} height={total}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="55%" stopColor={color} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={total / 2} cy={total / 2} r={total / 2} fill={`url(#${gradId})`} />
      </Svg>
    );
  }

  // iOS — original Gaussian blur filter
  return (
    <Svg width={total} height={total}>
      <Defs>
        <Filter id={`blur-${size}-${blur}`} x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={blur} />
        </Filter>
      </Defs>
      <G filter={`url(#blur-${size}-${blur})`}>
        <Circle cx={total / 2} cy={total / 2} r={size / 2} fill={color} />
      </G>
    </Svg>
  );
}
