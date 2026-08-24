import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, AppTheme, ThemeMode } from '../theme/palette';

const THEME_KEY = '@app_theme';

export type { ThemeMode, AppTheme } from '../theme/palette';
export { lightTheme, darkTheme } from '../theme/palette';

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
