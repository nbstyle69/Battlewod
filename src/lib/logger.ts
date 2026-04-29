// Conditional logger for mobile app.
// - debug/info are no-ops in production to avoid log spam.
// - warn/error always pass through and also go to Sentry via captureError.
import { captureError } from './sentry';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const log = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (message: string, error?: unknown, context?: Record<string, unknown>) => {
    if (isDev) console.error(message, error, context);
    if (error !== undefined) captureError(error, { message, ...context });
  },
};
