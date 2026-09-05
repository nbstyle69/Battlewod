import * as Sentry from '@sentry/react-native';

export function captureError(error: unknown, context?: Record<string, any>) {
  if (error instanceof Error) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    Sentry.captureMessage(String(error), { extra: context });
  }
}

// Minimisation : l'identifiant seul, jamais l'e-mail ni le pseudo.
export function setUserContext(userId: string) {
  Sentry.setUser({ id: userId });
}

export function clearUserContext() {
  Sentry.setUser(null);
}
