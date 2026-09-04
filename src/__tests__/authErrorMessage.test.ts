import fs from 'fs';
import path from 'path';
import { authErrorKey } from '../lib/authErrorMessage';
import fr from '../i18n/locales/fr.json';
import en from '../i18n/locales/en.json';

describe('traduction des erreurs Supabase Auth', () => {
  it.each([
    ['Error sending confirmation email', 'auth.errors.sendingConfirmation'],
    ['Email not confirmed', 'auth.errors.emailNotConfirmed'],
    ['User already registered', 'auth.errors.alreadyRegistered'],
    ['Invalid login credentials', 'auth.errors.invalidCredentials'],
    ['email rate limit exceeded', 'auth.errors.rateLimited'],
    ['Unable to validate email address: invalid format', 'auth.errors.invalidEmail'],
    ['Password should be at least 6 characters.', 'auth.errors.weakPassword'],
  ])('« %s » → %s', (message, key) => {
    expect(authErrorKey(message)).toBe(key);
  });

  it('repli générique pour un message inconnu ou absent', () => {
    expect(authErrorKey('Database error saving new user')).toBe('auth.errors.generic');
    expect(authErrorKey(null)).toBe('auth.errors.generic');
    expect(authErrorKey('')).toBe('auth.errors.generic');
  });

  it('chaque clé existe en FR et en EN', () => {
    const keys = ['generic', 'sendingConfirmation', 'emailNotConfirmed', 'alreadyRegistered', 'invalidCredentials', 'rateLimited', 'invalidEmail', 'weakPassword'];
    for (const k of keys) {
      expect(typeof fr.auth.errors[k as keyof typeof fr.auth.errors]).toBe('string');
      expect(typeof en.auth.errors[k as keyof typeof en.auth.errors]).toBe('string');
    }
  });

  it("Register et Login n'affichent plus le message brut", () => {
    for (const f of ['RegisterScreen.tsx', 'LoginScreen.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'auth', f), 'utf8');
      expect(src).toContain('translateAuthError(t, error)');
      expect(src).not.toMatch(/Alert\.alert\(t\('auth\.(register|login)Failed'\), error\)/);
    }
  });

  it("signUp passe emailRedirectTo vers la page publique /email-confirme", () => {
    const ctx = fs.readFileSync(path.join(__dirname, '..', 'context', 'AuthContext.tsx'), 'utf8');
    expect(ctx).toContain('emailRedirectTo: EMAIL_CONFIRMED_URL');
  });
});
