/**
 * Écran de connexion : la version seule (`v1.0.53`) au rendu, l'identifiant
 * OTA (`· 01a01acc` / `· embarqué`) seulement après appui sur le texte.
 */
import fs from 'fs';
import path from 'path';
import { versionDisplay } from '../lib/buildIdentity';

jest.mock('expo-updates', () => ({ updateId: null as string | null }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.53' } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Updates = require('expo-updates') as { updateId: string | null };

const login = fs.readFileSync(path.join(__dirname, '..', 'screens', 'auth', 'LoginScreen.tsx'), 'utf8');

describe('identifiant OTA masqué, visible au toucher', () => {
  it('au rendu : version seule, sans identifiant', () => {
    Updates.updateId = '01a01acc-d79d-7af3-a93d-e5b55f40c2b4';
    expect(versionDisplay(false)).toBe('v1.0.53');
    expect(versionDisplay(false)).not.toContain('01a01acc');
    expect(versionDisplay(false)).not.toContain('·');
  });

  it('après appui : version + identifiant (update reçu ou embarqué)', () => {
    Updates.updateId = '01a01acc-d79d-7af3-a93d-e5b55f40c2b4';
    expect(versionDisplay(true)).toBe('v1.0.53 · 01a01acc');
    Updates.updateId = null;
    expect(versionDisplay(true)).toBe('v1.0.53 · embarqué');
  });

  it("LoginScreen part masqué (useState(false)) et bascule au onPress du texte de version", () => {
    expect(login).toContain('const [showBuildIdentity, setShowBuildIdentity] = useState(false);');
    const i = login.indexOf('testID="login-version"');
    const block = login.slice(i, i + 400);
    expect(block).toContain('onPress={() => setShowBuildIdentity(v => !v)}');
    expect(block).toContain('{versionDisplay(showBuildIdentity)}');
    expect(login).not.toMatch(/\{buildIdentity\(\)\}/);
  });
});
