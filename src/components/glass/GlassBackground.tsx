import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Filter, FeGaussianBlur, Circle, G } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

const { width: W, height: H } = Dimensions.get('window');

/**
 * Full-screen animated emerald gradient background with floating blurred blobs.
 * Adapts to dark/light theme. Place as the first child of a screen with absolute fill.
 */
export default function GlassBackground() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  // Gradient colors per theme — boosted emerald for visibility
  const gradient: [string, string, string] = isDark
    ? ['#0a2e24', '#0f3d2e', '#1a5a3f']
    : ['#ecfdf5', '#f0fdf4', '#d1fae5'];

  // Blobs colors per theme — stronger alpha so blobs really pop
  const blobColors = isDark
    ? {
        b1: 'rgba(16,185,129,0.55)',
        b2: 'rgba(5,150,105,0.50)',
        b3: 'rgba(52,211,153,0.50)',
        b4: 'rgba(110,231,183,0.40)',
      }
    : {
        b1: 'rgba(16,185,129,0.50)',
        b2: 'rgba(5,150,105,0.40)',
        b3: 'rgba(52,211,153,0.40)',
        b4: 'rgba(110,231,183,0.35)',
      };

  // 4 floating animations with different durations
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

  // Translation ranges per blob
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
      {/* Base gradient */}
      <LinearGradient
        colors={gradient}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Top-left blob */}
      <Animated.View style={{ position: 'absolute', top: -100, left: -80, transform: [{ translateX: t1x }, { translateY: t1y }] }}>
        <BlurredCircle color={blobColors.b1} size={400} blur={70} />
      </Animated.View>
      {/* Bottom-right blob */}
      <Animated.View style={{ position: 'absolute', bottom: -100, right: -80, transform: [{ translateX: t2x }, { translateY: t2y }] }}>
        <BlurredCircle color={blobColors.b2} size={380} blur={70} />
      </Animated.View>
      {/* Floating mid-left */}
      <Animated.View style={{ position: 'absolute', top: H * 0.30, left: -120, transform: [{ translateX: t3x }, { translateY: t3y }] }}>
        <BlurredCircle color={blobColors.b3} size={300} blur={50} />
      </Animated.View>
      {/* Floating mid-right */}
      <Animated.View style={{ position: 'absolute', top: H * 0.55, right: -140, transform: [{ translateX: t4x }, { translateY: t4y }] }}>
        <BlurredCircle color={blobColors.b4} size={340} blur={50} />
      </Animated.View>
    </View>
  );
}

/** SVG circle with Gaussian blur filter for a soft glow blob effect. */
function BlurredCircle({ color, size, blur }: { color: string; size: number; blur: number }) {
  const padding = blur * 2;
  const total = size + padding * 2;
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
