import fs from 'fs';
import path from 'path';

/**
 * Les écrans de back-office posaient leur fond à plat (`theme.background`,
 * donc blanc pur en clair) pendant que l'accueil, Ma Box et Compte montaient
 * le dégradé argenté. Ce contrôle énumère les écrans depuis le disque : un
 * écran de back-office neuf hérite de la coque, ou il fait échouer la suite.
 *
 * Deux écrans sont hors charte par intention : le fond du minuteur et celui de
 * la lecture vidéo sont choisis par l'athlète.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SCREENS = path.join(ROOT, 'src/screens');

const read = (rel: string): string => fs.readFileSync(path.join(SCREENS, rel), 'utf8');

const BACKOFFICE = fs
  .readdirSync(path.join(SCREENS, 'backoffice'))
  .filter((f) => f.endsWith('Screen.tsx'))
  .map((f) => `backoffice/${f}`);

const ALSO = [
  'settings/NotificationSettingsScreen.tsx',
  'programs/ProgramDetailScreen.tsx',
  'explorer/BoxDirectoryMapScreen.tsx',
];

const ON_GLASS = [...BACKOFFICE, ...ALSO];

const OWN_BACKGROUND = ['timer/TimerRunScreen.tsx', 'timer/VideoPlaybackScreen.tsx'];

describe('coque de verre — les écrans denses la montent aussi', () => {
  it('la liste énumérée n\'est pas vide et couvre tout le back-office', () => {
    expect(BACKOFFICE.length).toBeGreaterThanOrEqual(18);
  });

  it.each(ON_GLASS)('%s monte le dégradé', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/import GlassBackground from '.*components\/glass\/GlassBackground';/);
    expect(src).toMatch(/<GlassBackground \/>/);
  });

  it.each(ON_GLASS)('%s ne repeint pas un fond plein sur sa racine', (rel) => {
    const src = read(rel);
    const root = src.match(/\n\s+container:\s*\{[^}]*\}|\n\s+screen:\s*\{[^}]*\}/);
    expect(root).not.toBeNull();
    expect(root![0]).toMatch(/backgroundColor: 'transparent'/);
  });

  it.each(OWN_BACKGROUND)('%s garde son fond propre', (rel) => {
    expect(read(rel)).not.toMatch(/<GlassBackground \/>/);
  });
});
