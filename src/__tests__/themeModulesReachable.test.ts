import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const THEME_DIR = path.join(ROOT, 'src', 'theme');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Un module de thème sans importeur est un piège : une refonte l'édite, les
 * valeurs changent, et rien ne bouge à l'écran. C'est exactement ce qui est
 * arrivé à src/theme/colors.ts (le vrai thème est ThemeContext).
 */
describe('src/theme — chaque module a au moins un importeur', () => {
  const files = fs.existsSync(THEME_DIR)
    ? fs.readdirSync(THEME_DIR).filter((f) => /\.(ts|tsx)$/.test(f))
    : [];

  const allSources = sourceFiles(path.join(ROOT, 'src'))
    .concat(fs.readdirSync(ROOT).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(ROOT, f)));

  it.each(files)('%s est importé quelque part', (file) => {
    const moduleName = file.replace(/\.(ts|tsx)$/, '');
    const importers = allSources.filter((src) => {
      if (path.join(THEME_DIR, file) === src) return false;
      const text = fs.readFileSync(src, 'utf8');
      return new RegExp(`(from|require\\()\\s*['"][^'"]*theme/${moduleName}['"]`).test(text);
    });
    expect(importers.length).toBeGreaterThan(0);
  });
});
