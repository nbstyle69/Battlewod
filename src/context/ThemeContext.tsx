import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const THEME_KEY = '@app_theme';

// Android has no native BlurView → translucent cards look washed-out / "double rectangle".
// On Android, we force more opaque card/surface fills so blocks render as crisp,
// clearly-visible cards on every screen that uses theme.card or theme.surface directly.
const IS_ANDROID = Platform.OS === 'android';

export type ThemeMode = 'light' | 'dark';

export interface AppTheme {
  mode: ThemeMode;
  background: string;
  card: string;
  cardBorder: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  primaryLight: string;
  accent: string;
  accentDark: string;
  accentLight: string;
  accentShadow: string;
  // Translucent accent fill/border used by primary action buttons across screens.
  // Mode-aware: silver in light, emerald in dark.
  ctaBg: string;
  ctaBorder: string;
  secondary: string;
  text: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  gold: string;
  silver: string;
  bronze: string;
  success: string;
  error: string;
  warning: string;
  shadow: string;
  modalCard: string;
  modalBackdrop: string;
}

export const lightTheme: AppTheme = {
  mode: 'light',
  background: '#ffffff',
  // Glassmorphism: cards/surfaces are translucent so the emerald gradient/blobs show through on iOS.
  // On Android (no BlurView), we use more opaque fills to keep cards crisp and legible.
  card: IS_ANDROID ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)',
  cardBorder: IS_ANDROID ? 'rgba(148,163,184,0.22)' : 'rgba(255,255,255,0.55)',
  surface: IS_ANDROID ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.40)',
  surfaceAlt: IS_ANDROID ? 'rgba(241,245,249,0.90)' : 'rgba(241,245,249,0.55)',
  primary: '#111827',
  primaryLight: '#374151',
  accent: '#94a3b8',
  accentDark: '#64748b',
  accentLight: '#cbd5e1',
  accentShadow: 'rgba(148,163,184,0.30)',
  ctaBg: 'rgba(148,163,184,0.25)',
  ctaBorder: 'rgba(148,163,184,0.85)',
  secondary: '#6b7280',
  text: '#111827',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: 'rgba(148,163,184,0.20)',
  tabBar: 'rgba(255,255,255,0.85)',
  tabBarBorder: 'rgba(148,163,184,0.22)',
  tabBarActive: '#94a3b8',
  tabBarInactive: '#9ca3af',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  shadow: 'rgba(0,0,0,0.06)',
  modalCard: '#ffffff',
  modalBackdrop: 'rgba(0,0,0,0.55)',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  background: '#0a0a0a',
  // Glassmorphism: cards/surfaces are translucent so the emerald gradient/blobs show through on iOS.
  // On Android (no BlurView), we use more opaque dark fills to keep cards crisp and legible.
  card: IS_ANDROID ? 'rgba(22,28,26,0.82)' : 'rgba(255,255,255,0.06)',
  cardBorder: IS_ANDROID ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.12)',
  surface: IS_ANDROID ? 'rgba(26,32,30,0.80)' : 'rgba(255,255,255,0.04)',
  surfaceAlt: IS_ANDROID ? 'rgba(28,36,34,0.80)' : 'rgba(255,255,255,0.08)',
  primary: '#f9fafb',
  primaryLight: '#d1d5db',
  accent: '#10b981',
  accentDark: '#059669',
  accentLight: '#34d399',
  accentShadow: 'rgba(16,185,129,0.40)',
  ctaBg: 'rgba(16,185,129,0.25)',
  ctaBorder: 'rgba(16,185,129,0.8)',
  secondary: '#9ca3af',
  text: '#f9fafb',
  textPrimary: '#f9fafb',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  border: 'rgba(255,255,255,0.10)',
  tabBar: 'rgba(10,10,10,0.85)',
  tabBarBorder: 'rgba(16,185,129,0.20)',
  tabBarActive: '#10b981',
  tabBarInactive: '#6b7280',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  success: '#10b981',
  error: '#f87171',
  warning: '#fbbf24',
  shadow: 'rgba(0,0,0,0.4)',
  modalCard: '#14161b',
  modalBackdrop: 'rgba(0,0,0,0.80)',
};

interface ThemeContextType {
  theme: AppTheme;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: lightTheme,
  mode: 'light',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'dark' || saved === 'light') setMode(saved);
    });
  }, []);

  function toggleTheme() {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(THEME_KEY, next);
      return next;
    });
  }

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
