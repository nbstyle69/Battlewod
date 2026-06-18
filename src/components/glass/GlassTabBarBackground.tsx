import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../context/ThemeContext';

/**
 * Glass tab bar background — BlurView with emerald tint and top highlight.
 * Used via React Navigation's `tabBarBackground` prop.
 */
export default function GlassTabBarBackground() {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';

  // On Android, BlurView has limited support → fallback to solid translucent layer
  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: dark ? 'rgba(10,10,10,0.95)' : 'rgba(255,255,255,0.96)' },
        ]}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            backgroundColor: 'rgba(16,185,129,0.25)',
          }}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={dark ? 60 : 80}
        tint={dark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* Tint color overlay (emerald-tinted dark/light) */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: dark ? 'rgba(10,15,13,0.55)' : 'rgba(236,253,245,0.35)' },
        ]}
      />
      {/* Top border highlight (emerald glow line) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          backgroundColor: 'rgba(16,185,129,0.30)',
        }}
      />
      {/* Subtle inner highlight strip */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 1, left: 0, right: 0, height: 1,
          backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
        }}
      />
    </View>
  );
}
