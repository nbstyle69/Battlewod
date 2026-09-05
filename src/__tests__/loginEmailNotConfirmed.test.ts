/**
 * Connexion refusée par GoTrue en `email_not_confirmed` (cas nbstylz+r2 : compte
 * créé via /rejoindre, mail de confirmation jamais cliqué). L'écran doit dire
 * « Confirme d'abord ton e-mail » et proposer « Renvoyer le mail » — pour cette
 * erreur seulement, jamais pour un mauvais mot de passe.
 */
import fs from 'fs';
import path from 'path';
import { isEmailNotConfirmed, resendConfirmationMail } from '../lib/loginConfirmation';
import { EMAIL_CONFIRMED_URL } from '../lib/urls';

const LOGIN_SCREEN = path.join(__dirname, '..', 'screens', 'auth', 'LoginScreen.tsx');
const loginScreen = fs.readFileSync(LOGIN_SCREEN, 'utf8');

/** Reproduit la décision de `handleLogin` : bouton ou alerte. */
function loginOutcome(error: string) {
  return isEmailNotConfirmed(error)
    ? { resendButton: true, alert: false }
    : { resendButton: false, alert: true };
}

describe('connexion : email_not_confirmed vs mauvais mot de passe', () => {
  it('« Email not confirmed » → bouton Renvoyer présent, pas d’alerte', () => {
    expect(loginOutcome('Email not confirmed')).toEqual({ resendButton: true, alert: false });
  });

  it('« Invalid login credentials » → pas de bouton, alerte classique', () => {
    expect(loginOutcome('Invalid login credentials')).toEqual({ resendButton: false, alert: true });
    expect(isEmailNotConfirmed(null)).toBe(false);
    expect(isEmailNotConfirmed('Network request failed')).toBe(false);
  });

  it('resend appelé avec le bon e-mail, type signup, atterrissage /email-confirme', async () => {
    const resend = jest.fn().mockResolvedValue({ error: null });
    const result = await resendConfirmationMail({ resend }, '  Lea@Example.com ');
    expect(resend).toHaveBeenCalledTimes(1);
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'Lea@Example.com',
      options: { emailRedirectTo: EMAIL_CONFIRMED_URL },
    });
    expect(result).toEqual({ ok: true, email: 'Lea@Example.com' });
  });

  it('limite Supabase (60 s) → clé traduite avec le délai, pas le texte brut', async () => {
    const resend = jest.fn().mockResolvedValue({
      error: { message: 'For security purposes, you can only request this after 47 seconds.' },
    });
    expect(await resendConfirmationMail({ resend }, 'lea@example.com'))
      .toEqual({ ok: false, key: 'auth.resendTooSoon', seconds: 47 });
  });

  it('autre erreur de renvoi → clé auth.errors.* (rate limit e-mail, générique)', async () => {
    const limited = jest.fn().mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    expect(await resendConfirmationMail({ resend: limited }, 'a@b.c'))
      .toEqual({ ok: false, key: 'auth.errors.rateLimited' });
    const unknown = jest.fn().mockResolvedValue({ error: { message: 'boom' } });
    expect(await resendConfirmationMail({ resend: unknown }, 'a@b.c'))
      .toEqual({ ok: false, key: 'auth.errors.generic' });
  });

  it("l'écran branche bien ces deux chemins (garde source)", () => {
    expect(loginScreen).toMatch(/if \(isEmailNotConfirmed\(error\)\) \{\s*setUnconfirmedEmail\(email\.trim\(\)\);\s*return;/);
    expect(loginScreen).toMatch(/setUnconfirmedEmail\(null\);\s*Alert\.alert\(t\('auth\.loginFailed'\)/);
    expect(loginScreen).toMatch(/\{unconfirmedEmail && \(/);
    expect(loginScreen).toContain("t('auth.confirmEmailFirst')");
    expect(loginScreen).toContain("t('auth.resendMail')");
    expect(loginScreen).toContain('resendConfirmationMail(supabase.auth, unconfirmedEmail)');
    expect(loginScreen).toContain("t('auth.resendSent', { email: result.email })");
  });

  it('clés i18n présentes en FR et EN', () => {
    for (const lang of ['fr', 'en']) {
      const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', `${lang}.json`), 'utf8'));
      for (const k of ['confirmEmailFirst', 'confirmEmailHint', 'resendMail', 'resendSent', 'resendTooSoon']) {
        expect(typeof dict.auth[k]).toBe('string');
      }
    }
  });
});
