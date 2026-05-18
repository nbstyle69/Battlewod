import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  size?: number;
  variant?: 'default' | 'emerald';
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}

/**
 * Glassmorphism icon container — square with blur, border, reflection.
 */
export default function GlassIconBox({ size = 56, variant = 'default', children, style, radius = 18 }: Props) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const tint = isDark ? 'dark' : 'light';

  const overlayColor =
    variant === 'emerald'
      ? (isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.14)')
      : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.40)');
  const borderColor =
    variant === 'emerald'
      ? (isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.30)')
      : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)');
  const reflectionColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)';

  // Android : simple themed icon tile (same look as ExplorerScreen's sectionIcon).
  if (Platform.OS === 'android') {
    const bg = variant === 'emerald' ? `${theme.accent}15` : theme.surface;
    const brd = variant === 'emerald' ? `${theme.accent}30` : theme.border;
    return (
      <View
        style={[
          { width: size, height: size, borderRadius: radius, backgroundColor: bg, borderColor: brd, borderWidth: 1, overflow: 'hidden' },
          style,
        ]}
      >
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  // iOS : full glass with blur + reflection.
  return (
    <View style={[{ width: size, height: size, borderRadius: radius }, style]}>
      <View style={[styles.clip, { width: size, height: size, borderRadius: radius, borderColor, borderWidth: 1 }]}>
        <BlurView intensity={30} tint={tint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
        <LinearGradient
          colors={[reflectionColor, 'rgba(255,255,255,0)']}
          style={[StyleSheet.absoluteFill, { height: '50%' }]}
          pointerEvents="none"
        />
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
