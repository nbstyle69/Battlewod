import { buildIdentity } from '../lib/buildIdentity';

jest.mock('expo-updates', () => ({ updateId: null as string | null }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.50' } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Updates = require('expo-updates') as { updateId: string | null };

describe('buildIdentity', () => {
  it('rend les 8 premiers caractères de l’update reçu', () => {
    Updates.updateId = '01a01acc-d79d-7af3-a93d-e5b55f40c2b4';
    expect(buildIdentity()).toBe('v1.0.50 · 01a01acc');
  });

  it('distingue le bundle embarqué d’un update reçu', () => {
    Updates.updateId = null;
    expect(buildIdentity()).toBe('v1.0.50 · embarqué');
  });
});
