import * as Sentry from '@sentry/react-native';

export function captureError(error: unknown, context?: Record<string, any>) {
  if (error instanceof Error) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    Sentry.captureMessage(String(error), { extra: context });
  }
}

export function setUserContext(userId: string, email?: string, username?: string) {
  Sentry.setUser({ id: userId, email, username });
}

export function clearUserContext() {
  Sentry.setUser(null);
}
