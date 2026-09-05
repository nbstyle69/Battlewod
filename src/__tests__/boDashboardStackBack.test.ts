import fs from 'fs';
import path from 'path';

// 1.0.52 I6 : tous les écrans empilés sous le Dashboard gérant (headerShown:
// false) portent le même chevron retour que le reste de l'app. La racine
// « Dashboard » est un onglet, elle n'en a pas.
const NAV = fs.readFileSync(path.join(__dirname, '../navigation/index.tsx'), 'utf8');
const stack = NAV.slice(NAV.indexOf('<BODashStack.Navigator'), NAV.indexOf('</BODashStack.Navigator>'));
const screens = [...stack.matchAll(/component=\{(BO\w+Screen)\}/g)].map(m => m[1]).filter(c => c !== 'BODashboardScreen');

describe('BODashboardStack — chevron retour (I6)', () => {
  it('énumère les écrans empilés', () => {
    expect(screens).toEqual([
      'BOWODsScreen', 'BOMembersScreen', 'BOTournamentScreen', 'BOInterCompetitionScreen',
      'BOStatsScreen', 'BOReportScreen', 'BONotificationsScreen', 'BOGamificationScreen',
      'BOArticlesScreen', 'BOSettingsScreen', 'BOBoxInfoScreen', 'BOSubscriptionScreen',
      'BOProgramsScreen', 'BOProgrammingScreen', 'BOProgramEditorScreen',
    ]);
  });

  it.each(screens)('%s : ChevronLeft + goBack, sans ArrowLeft ni « ← » texte', (name) => {
    const src = fs.readFileSync(path.join(__dirname, `../screens/backoffice/${name}.tsx`), 'utf8');
    expect(src).toMatch(/<ChevronLeft color=/);
    expect(src).toMatch(/navigation\.goBack\(\)/);
    expect(src).not.toMatch(/ArrowLeft/);
    expect(src).not.toMatch(/>←</);
  });
});
