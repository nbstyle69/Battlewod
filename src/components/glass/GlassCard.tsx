import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** "default" = white-ish glass, "emerald" = tinted emerald glass */
  variant?: 'default' | 'emerald';
  /** Override blur intensity (0-100). Default 40. */
  intensity?: number;
  /** Override border radius. Default 24. */
  radius?: number;
}

/**
 * Glassmorphism card: blurred translucent background + subtle border + top-half reflection.
 * Adapts automatically to dark/light theme.
 */
export default function GlassCard({ style, children, variant = 'default', intensity = 40, radius = 24 }: Props) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  const tint = isDark ? 'dark' : 'light';
  const overlayColor =
    variant === 'emerald'
      ? (isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.12)')
      : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)');
  const borderColor =
    variant === 'emerald'
      ? (isDark ? 'rgba(16,185,129,0.30)' : 'rgba(16,185,129,0.25)')
      : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)');
  const reflectionColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)';

  // ── Android : solid themed card with opaque fill for crisp, clearly visible cards ──
  // theme.card is too translucent (rgba ~0.55) over the emerald gradient which makes
  // cards look washed out when a bright blob sits behind them. We use a more opaque
  // value to guarantee strong contrast, matching the "solid white card" look seen
  // on ExplorerScreen where content density makes cards pop.
  if (Platform.OS === 'android') {
    const bg =
      variant === 'emerald'
        ? (isDark ? 'rgba(16,185,129,0.12)' : 'rgba(236,253,245,0.92)')
        : (isDark ? 'rgba(22,28,26,0.82)' : 'rgba(255,255,255,0.92)');
    const brd =
      variant === 'emerald'
        ? (isDark ? 'rgba(16,185,129,0.30)' : 'rgba(16,185,129,0.25)')
        : theme.border;
    return (
      <View
        style={[
          styles.shadowAndroid,
          { borderRadius: radius, backgroundColor: bg, borderColor: brd, borderWidth: 1, overflow: 'hidden' },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // ── iOS : full glass with blur + top reflection ──
  return (
    <View
      style={[
        styles.shadow,
        { borderRadius: radius, shadowOpacity: isDark ? 0.3 : 0.08 },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor, borderWidth: 1, flex: 1 }]}>
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
        {/* Top-half reflection */}
        <LinearGradient
          colors={[reflectionColor, 'rgba(255,255,255,0)']}
          style={[StyleSheet.absoluteFill, { height: '50%' }]}
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    // Android elevation (subtle, glassmorphism doesn't really translate)
    elevation: 6,
  },
  shadowAndroid: {
    // Subtle elevation only — no white overlay, no double-shadow
    elevation: 3,
  },
  clip: {
    overflow: 'hidden',
  },
});
