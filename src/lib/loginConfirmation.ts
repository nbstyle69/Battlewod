import { authErrorKey } from './authErrorMessage';
import { EMAIL_CONFIRMED_URL } from './urls';

/**
 * Connexion refusée en `email_not_confirmed` : le compte existe, le mot de
 * passe est bon, il manque le clic dans le mail. C'est le seul refus qui
 * mérite un bouton « Renvoyer le mail » — jamais un mauvais mot de passe.
 */
export function isEmailNotConfirmed(message: string | null | undefined): boolean {
  return authErrorKey(message) === 'auth.errors.emailNotConfirmed';
}

/** GoTrue : « For security purposes, you can only request this after 47 seconds ». */
const TOO_SOON = /for security purposes, you can only request this after (\d+) seconds?/i;

export type ResendAuth = {
  resend: (args: {
    type: 'signup';
    email: string;
    options?: { emailRedirectTo?: string };
  }) => Promise<{ error: { message: string } | null }>;
};

export type ResendResult =
  | { ok: true; email: string }
  | { ok: false; key: string; seconds?: number };

export async function resendConfirmationMail(auth: ResendAuth, rawEmail: string): Promise<ResendResult> {
  const email = rawEmail.trim();
  const { error } = await auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: EMAIL_CONFIRMED_URL },
  });
  if (!error) return { ok: true, email };
  const tooSoon = error.message.match(TOO_SOON);
  if (tooSoon) return { ok: false, key: 'auth.resendTooSoon', seconds: Number(tooSoon[1]) };
  return { ok: false, key: authErrorKey(error.message) };
}
