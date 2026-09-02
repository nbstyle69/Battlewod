import fs from 'fs';
import path from 'path';
import type { TFunction } from 'i18next';

jest.mock('lucide-react-native', () => ({
  BarChart2: 'BarChart2',
  Sparkles: 'Sparkles',
  Target: 'Target',
  Timer: 'Timer',
}));

import { homeTools } from '../screens/home/homeTools';
import { FEATURES } from '../lib/features';

const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const t = ((key: string) => key) as unknown as TFunction;

/**
 * WOD GEN (« 3 séances adaptées à ton profil ») est retiré de l'app par un
 * interrupteur unique, pas supprimé. Le test prouve les deux sens : la carte
 * disparaît quand le flag est à false et réapparaît à true — un test qui ne
 * vérifierait que l'absence passerait aussi si la carte avait été effacée.
 */
describe('FEATURES.wodGen — carte « WOD GEN » des Outils de l’accueil', () => {
  it('ne rend pas la carte WODGenPro quand le flag est à false', () => {
    const tools = homeTools(t, { wodGen: false });
    expect(tools.map((x) => x.screen)).toEqual(['Leaderboard', 'Timer', 'WODGenerator', 'OneRMCalculator']);
    expect(tools.some((x) => x.label === 'WOD GEN')).toBe(false);
  });

  it('rend la carte WODGenPro quand le flag est à true, à sa place historique', () => {
    const tools = homeTools(t, { wodGen: true });
    expect(tools.map((x) => x.screen)).toEqual(['Leaderboard', 'Timer', 'WODGenerator', 'WODGenPro', 'OneRMCalculator']);
    const card = tools.find((x) => x.screen === 'WODGenPro');
    expect(card?.label).toBe('WOD GEN');
    expect(card?.desc).toBe('3 séances adaptées à ton profil');
  });

  it('le flag livré est à false et la valeur par défaut de homeTools le suit', () => {
    expect(FEATURES.wodGen).toBe(false);
    expect(homeTools(t).some((x) => x.screen === 'WODGenPro')).toBe(false);
  });

  it('l’accueil rend ses Outils depuis homeTools et ne contourne pas le flag', () => {
    const home = read('src', 'screens', 'home', 'HomeScreen.tsx');
    expect(home).toMatch(/const TOOLS = homeTools\(t\)/);
    expect(home).toMatch(/\{TOOLS\.map\(/);
    expect(home).not.toContain('WODGenPro');
    expect(home).not.toContain('WOD GEN');
  });

  it('aucun autre point d’accès à la route WODGenPro hors navigation (Explorer, recherche, deep link, notifications)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full);
        if (
          rel === path.join('src', 'navigation', 'index.tsx') ||
          rel === path.join('src', 'screens', 'home', 'homeTools.ts') ||
          rel === path.join('src', 'lib', 'features.ts') ||
          rel.startsWith(path.join('src', 'screens', 'wod', 'WODGenPro')) ||
          rel.startsWith(path.join('src', 'screens', 'wod', 'WODSuggestions'))
        ) continue;
        if (/WODGenPro/.test(fs.readFileSync(full, 'utf8'))) offenders.push(rel);
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(offenders).toEqual([]);
    expect(read('src', 'navigation', 'linking.ts')).not.toMatch(/WODGenPro/);
  });

  it('l’écran, la route et le service restent dans le code', () => {
    expect(fs.existsSync(path.join(ROOT, 'src', 'screens', 'wod', 'WODGenProScreen.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src', 'screens', 'wod', 'WODSuggestionsScreen.tsx'))).toBe(true);
    const nav = read('src', 'navigation', 'index.tsx');
    expect(nav).toMatch(/<HomeStack\.Screen name="WODGenPro" component=\{WODGenProScreen\} \/>/);
    expect(nav).toMatch(/<WODStack\.Screen name="WODGenPro" component=\{WODGenProScreen\} \/>/);
  });
});
