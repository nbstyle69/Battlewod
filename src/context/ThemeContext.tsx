import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@app_theme';

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
  secondary: string;
  text: string;
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
}

export const lightTheme: AppTheme = {
  mode: 'light',
  background: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.06)',
  surface: '#f9fafb',
  surfaceAlt: '#f3f4f6',
  primary: '#111827',
  primaryLight: '#374151',
  accent: '#10b981',
  accentDark: '#059669',
  accentLight: '#34d399',
  accentShadow: 'rgba(16,185,129,0.35)',
  secondary: '#6b7280',
  text: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: 'rgba(0,0,0,0.06)',
  tabBar: '#FFFFFF',
  tabBarBorder: '#f3f4f6',
  tabBarActive: '#10b981',
  tabBarInactive: '#9ca3af',
  gold: '#C9A227',
  silver: '#9E9E9E',
  bronze: '#A0714F',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  shadow: 'rgba(0,0,0,0.08)',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  background: '#0f172a',
  card: '#1e293b',
  cardBorder: '#334155',
  surface: '#1e293b',
  surfaceAlt: '#334155',
  primary: '#f1f5f9',
  primaryLight: '#cbd5e1',
  accent: '#10b981',
  accentDark: '#059669',
  accentLight: '#34d399',
  accentShadow: 'rgba(16,185,129,0.45)',
  secondary: '#94a3b8',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#334155',
  tabBar: '#1e293b',
  tabBarBorder: '#334155',
  tabBarActive: '#10b981',
  tabBarInactive: '#64748b',
  gold: '#C9A227',
  silver: '#9E9E9E',
  bronze: '#A0714F',
  success: '#10b981',
  error: '#f87171',
  warning: '#fbbf24',
  shadow: 'rgba(0,0,0,0.3)',
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
