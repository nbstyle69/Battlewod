import * as Sentry from '@sentry/react-native';
import { buildIdentity } from './buildIdentity';

/**
 * Preuve de réception Sentry (règle 20) : un tableau de bord vide ne prouve
 * rien tant qu'on n'a pas vu arriver un événement qu'on a envoyé exprès.
 *
 * Armée par `EXPO_PUBLIC_SENTRY_SMOKE=1` sur une seule publication (OTA ou
 * build de test) : au démarrage, un `captureMessage('sentry-smoke <identité>')`
 * qui doit apparaître dans Sentry dans la minute. La variable est ensuite
 * retirée ; en production courante `smokeMessage()` rend `null` et rien ne part.
 */
export const SENTRY_SMOKE_FLAG = 'EXPO_PUBLIC_SENTRY_SMOKE';

export function smokeMessage(flag: string | undefined, identity: string): string | null {
  return flag === '1' ? `sentry-smoke ${identity}` : null;
}

export function sendSentrySmoke(): string | null {
  const message = smokeMessage(process.env.EXPO_PUBLIC_SENTRY_SMOKE, buildIdentity());
  if (message) Sentry.captureMessage(message, 'info');
  return message;
}
