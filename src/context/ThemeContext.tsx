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
  background: '#F8F8FA',
  card: '#FFFFFF',
  cardBorder: '#E2E2EA',
  surface: '#F1F1F5',
  surfaceAlt: '#E8E8EE',
  primary: '#1A1A2E',
  primaryLight: '#3A3A50',
  accent: '#059669',
  accentDark: '#047857',
  accentLight: '#34d399',
  accentShadow: 'rgba(5,150,105,0.30)',
  secondary: '#6B6B80',
  text: '#1A1A2E',
  textSecondary: '#6B6B80',
  textMuted: '#9E9EB0',
  border: '#E2E2EA',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E8E8EE',
  tabBarActive: '#059669',
  tabBarInactive: '#9E9EB0',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  shadow: 'rgba(0,0,0,0.06)',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  background: '#0A0A0F',
  card: '#141419',
  cardBorder: '#2A2A35',
  surface: '#1C1C24',
  surfaceAlt: '#26262F',
  primary: '#F5F5F7',
  primaryLight: '#C8C8D0',
  accent: '#10b981',
  accentDark: '#059669',
  accentLight: '#34d399',
  accentShadow: 'rgba(16,185,129,0.40)',
  secondary: '#A0A0B0',
  text: '#F5F5F7',
  textSecondary: '#A0A0B0',
  textMuted: '#5C5C6E',
  border: '#2A2A35',
  tabBar: '#111116',
  tabBarBorder: '#1C1C24',
  tabBarActive: '#10b981',
  tabBarInactive: '#5C5C6E',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  success: '#10b981',
  error: '#f87171',
  warning: '#fbbf24',
  shadow: 'rgba(0,0,0,0.4)',
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
