import fs from 'fs';
import path from 'path';

// Mixpanel « NBS Innovation » est en résidence EU et n'avait jamais reçu un
// événement : le SDK visait le serveur US par défaut, et `Login` partait avant
// `identify`. Les garde-fous de bundle affirment désormais le token et l'URL EU.

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const readScript = (name: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', name), 'utf8');

const calls: string[] = [];
const mixpanelInstance = {
  init: jest.fn((...args: unknown[]) => calls.push(`init:${JSON.stringify(args)}`)),
  setUseIpAddressForGeolocation: jest.fn(),
  identify: jest.fn(() => calls.push('identify')),
  track: jest.fn((name: string) => calls.push(`track:${name}`)),
  getPeople: () => ({ set: jest.fn() }),
};
jest.mock('mixpanel-react-native', () => ({ Mixpanel: jest.fn(() => mixpanelInstance) }));

process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = '6a12477548a3c5449c877bc2d260233b';

import { MIXPANEL_SERVER_URL, identifyUser, trackLogin } from '../lib/analytics';

describe('Mixpanel — serveur EU', () => {
  it("l'init vise api-eu.mixpanel.com (3e argument de init = serverURL)", () => {
    expect(MIXPANEL_SERVER_URL).toBe('https://api-eu.mixpanel.com');
    expect(mixpanelInstance.init).toHaveBeenCalledWith(false, {}, 'https://api-eu.mixpanel.com');
  });

  it('le token est encadré de marqueurs lisibles dans le bundle', () => {
    const src = read('lib/analytics.ts');
    expect(src).toContain("const MIXPANEL_TOKEN_TAG = 'mixpanel-token:' + (process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ?? '') + ':mixpanel-end';");
  });
});

describe('Mixpanel — Login après identify', () => {
  const auth = read('context/AuthContext.tsx');

  it("signIn n'émet plus Login directement : il arme pendingLoginTrack", () => {
    const signIn = auth.slice(auth.indexOf('async function signIn('), auth.indexOf('async function signUp('));
    expect(signIn).not.toContain('trackLogin()');
    expect(signIn).toContain('if (!error) pendingLoginTrack.current = true;');
  });

  it('fetchProfile émet Login juste après identifyUser', () => {
    const at = auth.indexOf('identifyUser(profile.id');
    const after = auth.slice(at, at + 400);
    expect(after).toContain('pendingLoginTrack.current = false;');
    expect(after).toContain('trackLogin();');
    expect(after.indexOf('trackLogin();')).toBeGreaterThan(after.indexOf('identifyUser('));
  });

  it("l'ordre effectif des appels SDK est identify puis track('Login')", () => {
    calls.length = 0;
    identifyUser('user-1');
    trackLogin();
    expect(calls).toEqual(['identify', 'track:Login']);
  });
});

describe('garde-fous de bundle — token Mixpanel + URL EU', () => {
  it('ota-verify-bundle exige le marqueur du token et le serveur EU', () => {
    const ota = readScript('ota-verify-bundle.mjs');
    expect(ota).toContain('const MIXPANEL_TAG_RE = /mixpanel-token:[0-9a-f]{32}:mixpanel-end/;');
    expect(ota).toContain("const MIXPANEL_EU_URL = 'https://api-eu.mixpanel.com';");
    expect(ota).toContain('if (!hasMixpanel) mixpanelFailures.push(platform);');
    expect(ota).toContain('if (mixpanelFailures.length > 0) {');
  });

  it.each(['ipa-verify-bundle.mjs', 'aab-verify-bundle.mjs'])('%s affirme le token et le serveur EU', (s) => {
    const src = readScript(s);
    expect(src).toContain('const mixpanelMatch = js.match(/mixpanel-token:([0-9a-f]{32}):mixpanel-end/);');
    expect(src).toContain("check('token Mixpanel embarqué', !!mixpanelMatch,");
    expect(src).toContain("check('serveur Mixpanel EU embarqué', js.includes('https://api-eu.mixpanel.com'),");
  });
});
