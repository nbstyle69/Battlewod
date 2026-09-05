/**
 * Preuve de réception Sentry (règle 20) : le smoke part au démarrage seulement
 * quand EXPO_PUBLIC_SENTRY_SMOKE=1, porte l'identité du code exécuté, et ne
 * part jamais sans le flag — le rendu courant de production reste silencieux.
 */
import fs from 'fs';
import path from 'path';

const captureMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));
jest.mock('../lib/buildIdentity', () => ({ buildIdentity: () => 'v1.0.53 · abcdef12' }));

import { smokeMessage, sendSentrySmoke, SENTRY_SMOKE_FLAG } from '../lib/sentrySmoke';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('smokeMessage', () => {
  it('flag à 1 → « sentry-smoke <identité> »', () => {
    expect(smokeMessage('1', 'v1.0.53 · abcdef12')).toBe('sentry-smoke v1.0.53 · abcdef12');
  });
  it.each([undefined, '', '0', 'true'])('flag %p → rien ne part', (flag) => {
    expect(smokeMessage(flag, 'x')).toBeNull();
  });
});

describe('sendSentrySmoke', () => {
  const saved = process.env.EXPO_PUBLIC_SENTRY_SMOKE;
  afterEach(() => {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_SENTRY_SMOKE;
    else process.env.EXPO_PUBLIC_SENTRY_SMOKE = saved;
    captureMessage.mockClear();
  });

  it('sans flag : aucun captureMessage', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_SMOKE;
    expect(sendSentrySmoke()).toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('avec flag : captureMessage(« sentry-smoke v… · <update> », info)', () => {
    process.env.EXPO_PUBLIC_SENTRY_SMOKE = '1';
    expect(sendSentrySmoke()).toBe('sentry-smoke v1.0.53 · abcdef12');
    expect(captureMessage).toHaveBeenCalledWith('sentry-smoke v1.0.53 · abcdef12', 'info');
  });
});

describe('câblage', () => {
  it('App.tsx appelle sendSentrySmoke après Sentry.init', () => {
    const app = read('App.tsx');
    const init = app.indexOf('Sentry.init(');
    const smoke = app.indexOf('sendSentrySmoke();');
    expect(init).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(init);
  });
  it('le flag lu est bien EXPO_PUBLIC_SENTRY_SMOKE (inliné par Expo dans le bundle)', () => {
    expect(SENTRY_SMOKE_FLAG).toBe('EXPO_PUBLIC_SENTRY_SMOKE');
    expect(read('src/lib/sentrySmoke.ts')).toContain('process.env.EXPO_PUBLIC_SENTRY_SMOKE');
  });
  it('règle 20 documentée : tableau vide ≠ preuve', () => {
    const rules = read('docs/REGLES_DE_VERIFICATION.md');
    expect(rules).toMatch(/^## 20\. /m);
    expect(rules).toContain('sentry-smoke');
  });
});
