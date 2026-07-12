import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import fr from './locales/fr.json';
import en from './locales/en.json';

export const LANGUAGE_KEY = '@app_language';
export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'fr';

export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const;

// Resolve the phone's language, falling back to French (the app default).
export function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode?.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code as AppLanguage) ? (code as AppLanguage) : DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Load the saved preference, else the device language. Runs once at startup.
export async function initLanguage(): Promise<AppLanguage> {
  let lang: AppLanguage = deviceLanguage();
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved === 'fr' || saved === 'en') lang = saved;
  } catch {
    /* ignore storage errors, keep device language */
  }
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
  return lang;
}

export async function setLanguage(lang: AppLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    /* ignore storage errors */
  }
}

export default i18n;
