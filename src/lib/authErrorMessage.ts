import type { TFunction } from 'i18next';

/**
 * Messages GoTrue connus → clés i18n `auth.errors.*`. Tout message inconnu
 * tombe sur le repli générique ; le texte brut n'est jamais montré tel quel.
 */
const KNOWN: ReadonlyArray<{ match: RegExp; key: string }> = [
  { match: /error sending confirmation email/i, key: 'auth.errors.sendingConfirmation' },
  { match: /email not confirmed/i, key: 'auth.errors.emailNotConfirmed' },
  { match: /user already registered/i, key: 'auth.errors.alreadyRegistered' },
  { match: /invalid login credentials/i, key: 'auth.errors.invalidCredentials' },
  { match: /email rate limit exceeded|over_email_send_rate_limit/i, key: 'auth.errors.rateLimited' },
  { match: /invalid email|unable to validate email address/i, key: 'auth.errors.invalidEmail' },
  { match: /password should be at least/i, key: 'auth.errors.weakPassword' },
];

export function authErrorKey(message: string | null | undefined): string {
  if (message) {
    const hit = KNOWN.find(k => k.match.test(message));
    if (hit) return hit.key;
  }
  return 'auth.errors.generic';
}

export function translateAuthError(t: TFunction, message: string | null | undefined): string {
  return t(authErrorKey(message));
}
