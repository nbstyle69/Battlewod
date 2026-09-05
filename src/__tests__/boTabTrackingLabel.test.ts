/**
 * Barre gérant à 6 onglets : le premier onglet affiche « Suivi » (FR) /
 * « Tracking » (EN) au lieu de « Dashboard » (tronqué). Libellé seulement :
 * la route `BODashboard` et ses écrans ne bougent pas.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const nav = read('navigation/index.tsx');
const fr = JSON.parse(read('i18n/locales/fr.json'));
const en = JSON.parse(read('i18n/locales/en.json'));

describe('Onglet gérant « Suivi »', () => {
  it('le libellé passe par i18n et vaut Suivi / Tracking', () => {
    expect(nav).toMatch(/<BOTab\.Screen name="BODashboard" component=\{BODashboardNavigator\} options=\{\{ tabBarLabel: t\('tabs\.boTracking'\) \}\} \/>/);
    expect(fr.tabs.boTracking).toBe('Suivi');
    expect(en.tabs.boTracking).toBe('Tracking');
  });

  it("mutation inverse : plus aucun libellé d'onglet gérant « Dashboard » en dur", () => {
    const tabs = nav.slice(nav.indexOf('function BoxOwnerTabs()'), nav.indexOf('function BOProfileNavigator()'));
    expect(tabs).not.toMatch(/tabBarLabel: 'Dashboard'/);
  });

  it('la route est inchangée : BODashboard et son écran Dashboard existent toujours', () => {
    expect(nav).toMatch(/<BOTab\.Screen name="BODashboard"/);
    expect(nav).toMatch(/<BODashStack\.Screen name="Dashboard"\s+component=\{BODashboardScreen\} \/>/);
    const params = nav.slice(nav.indexOf('export type BoxOwnerTabParamList'), nav.indexOf('export type BOProfileStackParamList'));
    expect(params).toContain('BODashboard: undefined;');
  });
});
