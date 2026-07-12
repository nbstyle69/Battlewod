import AsyncStorage from '@react-native-async-storage/async-storage';

let mockLanguageCode: string | undefined = 'fr';
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: mockLanguageCode }],
}));

import i18n, {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_KEY,
  deviceLanguage,
  initLanguage,
  setLanguage,
} from '../i18n';

describe('i18n', () => {
  beforeEach(async () => {
    mockLanguageCode = 'fr';
    await AsyncStorage.clear();
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it('defaults to French', () => {
    expect(DEFAULT_LANGUAGE).toBe('fr');
    expect(SUPPORTED_LANGUAGES).toEqual(['fr', 'en']);
  });

  it('detects the device language when supported', () => {
    mockLanguageCode = 'en';
    expect(deviceLanguage()).toBe('en');
    mockLanguageCode = 'FR';
    expect(deviceLanguage()).toBe('fr');
  });

  it('falls back to French for unsupported device languages', () => {
    mockLanguageCode = 'de';
    expect(deviceLanguage()).toBe('fr');
    mockLanguageCode = undefined;
    expect(deviceLanguage()).toBe('fr');
  });

  it('prioritises the persisted preference over the device language', async () => {
    mockLanguageCode = 'fr';
    await AsyncStorage.setItem(LANGUAGE_KEY, 'en');
    const lang = await initLanguage();
    expect(lang).toBe('en');
    expect(i18n.language).toBe('en');
  });

  it('uses the device language when no preference is stored', async () => {
    mockLanguageCode = 'en';
    const lang = await initLanguage();
    expect(lang).toBe('en');
  });

  it('persists the chosen language via setLanguage', async () => {
    await setLanguage('en');
    expect(i18n.language).toBe('en');
    expect(await AsyncStorage.getItem(LANGUAGE_KEY)).toBe('en');
  });

  it('translates keys in both languages', async () => {
    await setLanguage('fr');
    expect(i18n.t('auth.loginTitle')).toBe('Connexion');
    await setLanguage('en');
    expect(i18n.t('auth.loginTitle')).toBe('Sign in');
  });

  it('has identical key structures for fr and en', () => {
    const fr = require('../i18n/locales/fr.json');
    const en = require('../i18n/locales/en.json');
    const paths = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === 'object'
          ? paths(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(paths(en).sort()).toEqual(paths(fr).sort());
  });
});
