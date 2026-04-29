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

  return (
    <View
      style={[
        styles.shadow,
        { borderRadius: radius, shadowOpacity: isDark ? 0.3 : 0.08 },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor, borderWidth: 1 }]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        ) : (
          // Android: BlurView is less reliable — we layer a stronger background tint instead
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(20,20,25,0.55)' : 'rgba(255,255,255,0.55)' }]} />
        )}
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
  clip: {
    overflow: 'hidden',
  },
});
