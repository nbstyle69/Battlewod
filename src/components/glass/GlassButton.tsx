import React from 'react';
import { TouchableOpacity, View, Text, ViewStyle, TextStyle, StyleProp, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onPress?: () => void;
  children?: React.ReactNode;
  label?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'emerald';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  radius?: number;
  paddingV?: number;
}

/**
 * Glassmorphism button — translucent blur with reflection highlight.
 */
export default function GlassButton({
  onPress, children, label, icon, variant = 'default', style, textStyle, disabled,
  radius = 18, paddingV = 13,
}: Props) {
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
      : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.50)');
  const reflectionColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)';
  const labelColor = variant === 'emerald' ? '#10b981' : theme.text;

  // Android : solid themed button (opaque fill for crisp look, matching GlassCard).
  if (Platform.OS === 'android') {
    const bg =
      variant === 'emerald'
        ? (isDark ? 'rgba(16,185,129,0.12)' : 'rgba(236,253,245,0.92)')
        : (isDark ? 'rgba(22,28,26,0.82)' : 'rgba(255,255,255,0.92)');
    const brd = variant === 'emerald' ? (isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.30)') : theme.border;
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        disabled={disabled}
        style={[
          { borderRadius: radius, backgroundColor: bg, borderColor: brd, borderWidth: 1, overflow: 'hidden', opacity: disabled ? 0.5 : 1 },
          style,
        ]}
      >
        <View style={[styles.content, { paddingVertical: paddingV }]}>
          {icon}
          {label && (
            <Text style={[styles.label, { color: labelColor }, textStyle]}>{label}</Text>
          )}
          {children}
        </View>
      </TouchableOpacity>
    );
  }

  // iOS : full glass with blur + reflection.
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled}
      style={[styles.shadow, { borderRadius: radius, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor, borderWidth: 1 }]}>
        <BlurView intensity={35} tint={tint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
        <LinearGradient
          colors={[reflectionColor, 'rgba(255,255,255,0)']}
          style={[StyleSheet.absoluteFill, { height: '50%' }]}
          pointerEvents="none"
        />
        <View style={[styles.content, { paddingVertical: paddingV }]}>
          {icon}
          {label && (
            <Text style={[styles.label, { color: labelColor }, textStyle]}>{label}</Text>
          )}
          {children}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 16,
    shadowOpacity: 0.15, elevation: 4,
  },
  clip: { overflow: 'hidden' },
  content: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 16,
  },
  label: { fontSize: 14, fontWeight: '700' },
});
