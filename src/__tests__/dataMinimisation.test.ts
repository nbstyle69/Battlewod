import fs from 'fs';
import path from 'path';

// Minimisation des données (App Privacy 1.0.53) : Sentry sans capture d'écran
// ni e-mail/pseudo, Mixpanel sans géolocalisation IP ni e-mail, et le profil
// Mixpanel effacé à la suppression du compte — avant `reset()`, avant `signOut`.

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const calls: string[] = [];
const people = {
  set: jest.fn((props: Record<string, unknown>) => { calls.push('people.set'); people.lastProps = props; }),
  deleteUser: jest.fn(() => calls.push('people.deleteUser')),
  lastProps: undefined as Record<string, unknown> | undefined,
};
const mixpanelInstance = {
  init: jest.fn(),
  setUseIpAddressForGeolocation: jest.fn((v: boolean) => calls.push(`geo:${v}`)),
  identify: jest.fn(() => calls.push('identify')),
  reset: jest.fn(() => calls.push('reset')),
  flush: jest.fn(() => calls.push('flush')),
  track: jest.fn(),
  getPeople: () => people,
};
jest.mock('mixpanel-react-native', () => ({ Mixpanel: jest.fn(() => mixpanelInstance) }));

process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'test-token';

import * as Sentry from '@sentry/react-native';
import { setUserContext } from '../lib/sentry';
import { identifyUser, forgetUser, resetUser } from '../lib/analytics';

describe('Sentry — minimisation', () => {
  const appSrc = read('../App.tsx');
  const initBlock = appSrc.slice(appSrc.indexOf('Sentry.init({'), appSrc.indexOf('});', appSrc.indexOf('Sentry.init({')));

  it("Sentry.init ne demande pas de capture d'écran", () => {
    expect(initBlock).toMatch(/attachScreenshot:\s*false/);
    expect(initBlock).not.toMatch(/attachScreenshot:\s*true/);
  });

  it("setUser reçoit l'identifiant seul — pas de clé email ni username", () => {
    setUserContext('user-1');
    const arg = (Sentry.setUser as jest.Mock).mock.calls.at(-1)?.[0];
    expect(arg).toEqual({ id: 'user-1' });
    expect(Object.keys(arg)).toEqual(['id']);
    expect(arg).not.toHaveProperty('email');
    expect(arg).not.toHaveProperty('username');
  });
});

describe('Mixpanel — minimisation', () => {
  it("désactive la géolocalisation par IP à l'initialisation", () => {
    expect(mixpanelInstance.setUseIpAddressForGeolocation).toHaveBeenCalledWith(false);
    expect(mixpanelInstance.setUseIpAddressForGeolocation).not.toHaveBeenCalledWith(true);
  });

  it("people.set part sans email (username, role, level seulement)", () => {
    identifyUser('user-1', { username: 'nab', role: 'member', level: 'rx' });
    expect(people.lastProps).toEqual({ username: 'nab', role: 'member', level: 'rx' });
    expect(people.lastProps).not.toHaveProperty('email');
    // Le chemin réel dans AuthContext n'a pas de clé email non plus.
    const authSrc = read('context/AuthContext.tsx');
    const identifyCall = authSrc.match(/identifyUser\(profile\.id,\s*\{([^}]*)\}\)/)?.[1] ?? 'ABSENT';
    expect(identifyCall).not.toMatch(/\bemail\b/);
    expect(identifyCall).toMatch(/username/);
  });

  it("forgetUser : deleteUser puis flush, et n'échoue jamais", () => {
    calls.length = 0;
    expect(forgetUser()).toEqual({ error: null });
    expect(calls).toEqual(['people.deleteUser', 'flush']);

    const boom = new Error('mixpanel down');
    people.deleteUser.mockImplementationOnce(() => { throw boom; });
    expect(forgetUser()).toEqual({ error: boom });
  });

  it("suppression de compte : deleteUser avant reset, reset avant signOut ; l'échec Mixpanel part dans Sentry", () => {
    const authSrc = read('context/AuthContext.tsx');
    const fn = authSrc.slice(authSrc.indexOf('async function deleteAccount'), authSrc.indexOf('async function updateUser') > 0 ? authSrc.indexOf('async function updateUser') : undefined);
    const iRpc = fn.indexOf("rpc('delete_user_account')");
    const iForget = fn.indexOf('forgetUser()');
    const iReset = fn.indexOf('resetUser()');
    const iSignOut = fn.indexOf('auth.signOut()');
    expect(iRpc).toBeGreaterThan(-1);
    expect(iForget).toBeGreaterThan(iRpc);
    expect(iReset).toBeGreaterThan(iForget);
    expect(iSignOut).toBeGreaterThan(iReset);
    expect(fn).toMatch(/if \(forgotten\.error\) captureError\(forgotten\.error/);

    // Ordre affirmé à l'exécution aussi : la séquence réelle du module.
    calls.length = 0;
    forgetUser();
    resetUser();
    expect(calls).toEqual(['people.deleteUser', 'flush', 'reset']);
  });
});
