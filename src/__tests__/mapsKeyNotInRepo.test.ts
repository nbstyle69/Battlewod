import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'android', 'ios', '.expo', 'coverage'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs|ts|tsx|json|yml|yaml|md|sh)$/.test(name)) out.push(full);
  }
  return out;
};

describe('clé Google Maps Android — dépôt public, aucune clé embarquée', () => {
  it('app.json ne contient aucune clé Google (AIza…) ni googleMaps.apiKey', () => {
    const app = read('app.json');
    expect(app).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(app).not.toContain('googleMaps');
  });

  it('aucun fichier versionné ne contient une clé Google', () => {
    const offenders = walk(ROOT).filter((f) => /AIza[0-9A-Za-z_-]{30,}/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("app.config.js injecte GOOGLE_MAPS_ANDROID_API_KEY et ne lit plus l'ancienne GOOGLE_MAPS_API_KEY", () => {
    const cfg = read('app.config.js');
    expect(cfg).toContain('process.env.GOOGLE_MAPS_ANDROID_API_KEY');
    expect(cfg).not.toMatch(/GOOGLE_MAPS_API_KEY\b/);
    const built = require(path.join(ROOT, 'app.config.js'))({ config: { android: { package: 'com.athlex.app' } } });
    expect(built.android.config.googleMaps.apiKey).toBe(process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '');
  });

  it("l'ancien nom GOOGLE_MAPS_API_KEY n'est plus lu nulle part dans le code", () => {
    const offenders = walk(ROOT)
      .filter((f) => !/docs\//.test(f) && !/__tests__/.test(f))
      .filter((f) => /\bGOOGLE_MAPS_API_KEY\b/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('verify:aab affirme la clé Maps du manifeste et le refus du préfixe interdit', () => {
    const s = read('scripts/aab-verify-bundle.mjs');
    expect(s).toContain("meta('com.google.android.geo.API_KEY')");
    expect(s).toContain('MAPS_KEY_FORBIDDEN_SUFFIX');
    expect(s).toContain('MAPS_KEY_EXPECTED_SUFFIX');
  });
});
