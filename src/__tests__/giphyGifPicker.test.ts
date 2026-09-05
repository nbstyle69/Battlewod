/**
 * GIF dans Messages : Tenor (API fermée) → GIPHY. Le code, l'env et les
 * garde-fous de livraison ne mentionnent plus Tenor ; la clé absente donne
 * « GIF indisponibles » ; l'attribution GIPHY est affichée (CGU GIPHY).
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const screen = read('src/screens/messages/MessagesScreen.tsx');
const fn = screen.slice(screen.indexOf('async function searchGifs('), screen.indexOf('function openGifPicker('));

describe('GIPHY remplace Tenor', () => {
  it('search et trending GIPHY, rating pg-13, champs fixed_height / fixed_height_small', () => {
    expect(fn).toContain('https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}');
    expect(fn).toContain('https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}');
    expect(fn.match(/rating=pg-13/g)).toHaveLength(2);
    expect(fn).toContain('r.images?.fixed_height?.url');
    expect(fn).toContain('r.images?.fixed_height_small?.url');
    expect(fn).toContain('json.data ?? []');
  });

  it('plus aucune référence à Tenor dans le code, l’env et les scripts', () => {
    const out = execSync(
      "git grep -il tenor -- ':!package-lock.json' ':!src/__tests__/giphyGifPicker.test.ts' || true",
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    expect(out).toBe('');
    expect(read('.env.example')).toContain('EXPO_PUBLIC_GIPHY_KEY=');
  });

  it('clé absente → « GIF indisponibles » lisible, pas de requête ; attribution « Powered by GIPHY »', () => {
    expect(screen).toContain("const GIPHY_KEY_TAG = 'giphy-key:' + (process.env.EXPO_PUBLIC_GIPHY_KEY ?? '') + ':giphy-end';");
    expect(screen).toContain('const gifUnavailable = !GIPHY_API_KEY;');
    expect(screen).toContain("if (!gifUnavailable) searchGifs('');");
    expect(screen).toMatch(/\{gifUnavailable \? \([\s\S]*?GIF indisponibles<\/Text>/);
    expect(screen).toContain('>Powered by GIPHY</Text>');
  });

  it('les garde-fous de livraison exigent la clé GIPHY dans le bundle (OTA, IPA, AAB)', () => {
    const ota = read('scripts/ota-verify-bundle.mjs');
    expect(ota).toContain('const GIPHY_TAG_RE = /giphy-key:[A-Za-z0-9]{16,}:giphy-end/;');
    expect(ota).toMatch(/if \(giphyFailures\.length > 0\) \{[\s\S]*?process\.exit\(1\)/);
    for (const s of ['scripts/ipa-verify-bundle.mjs', 'scripts/aab-verify-bundle.mjs']) {
      expect(read(s)).toContain("check('clé GIPHY embarquée', !!giphyMatch,");
    }
  });
});
