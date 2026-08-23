import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Un écran dont la racine est `backgroundColor: 'transparent'` laisse voir le
 * fond du navigateur, qui est sombre en dur. Importer GlassBackground sans le
 * rendre passe la relecture (l'import a l'air d'être la preuve du fond) et le
 * mode clair reste illisible : c'est le défaut trouvé sur l'écran Notifications.
 */
describe('GlassBackground — importé implique rendu', () => {
  const importers = sourceFiles(path.join(ROOT, 'src')).filter((file) =>
    /from\s+['"][^'"]*glass\/GlassBackground['"]/.test(fs.readFileSync(file, 'utf8')),
  );

  it('trouve les écrans qui déclarent ce fond', () => {
    expect(importers.length).toBeGreaterThan(0);
  });

  it.each(importers.map((f) => path.relative(ROOT, f)))('%s le rend', (relative) => {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    expect(text).toMatch(/<GlassBackground\b/);
  });
});
