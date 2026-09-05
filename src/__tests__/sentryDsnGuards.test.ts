/**
 * Sentry ne reçoit rien si `EXPO_PUBLIC_SENTRY_DSN` est vide au moment du
 * bundle (`Sentry.init({ dsn: '' })`). Constaté sur l'OTA 1.0.52 et l'IPA
 * 1.0.52 (49) : aucun DSN embarqué. Les trois garde-fous de livraison (règle 11)
 * doivent donc vérifier le DSN comme ils vérifient Supabase et GIPHY, avec une
 * expression qui ne confond pas le DSN et l'URL de télémétrie du SDK lui-même.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DSN_RE = /https:\/\/[0-9a-f]{32}@o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io\/\d+/;
const FAKE_DSN = 'https://0123456789abcdef0123456789abcdef@o4509000000000000.ingest.de.sentry.io/4509000000000001';
// Présente dans tout bundle @sentry/react-native, même sans DSN configuré.
const SDK_TELEMETRY_URL = 'https://o447951.ingest.sentry.io/api/4509632503087104/envelope/?sentry_version=7';

describe('DSN Sentry : source et garde-fous', () => {
  it("App.tsx lit le DSN dans EXPO_PUBLIC_SENTRY_DSN (inliné au bundle), pas ailleurs", () => {
    const app = read('App.tsx');
    expect(app).toContain("dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || ''");
    expect(read('.env.example')).toMatch(/^EXPO_PUBLIC_SENTRY_DSN=/m);
  });

  it("l'expression reconnaît un DSN et ignore l'URL de télémétrie du SDK", () => {
    expect(DSN_RE.test(FAKE_DSN)).toBe(true);
    expect(DSN_RE.test(FAKE_DSN.replace('.de.', '.'))).toBe(true);
    expect(DSN_RE.test(SDK_TELEMETRY_URL)).toBe(false);
    expect(DSN_RE.test('')).toBe(false);
  });

  it('ota-verify-bundle.mjs échoue explicitement sans DSN', () => {
    const ota = read('scripts/ota-verify-bundle.mjs');
    expect(ota).toContain(`const SENTRY_DSN_RE = ${DSN_RE.toString()};`);
    expect(ota).toContain('if (!hasSentry) sentryFailures.push(platform);');
    expect(ota).toMatch(/if \(sentryFailures\.length > 0\) \{[\s\S]*EXPO_PUBLIC_SENTRY_DSN[\s\S]*process\.exit\(1\);/);
  });

  for (const s of ['scripts/ipa-verify-bundle.mjs', 'scripts/aab-verify-bundle.mjs']) {
    it(`${s} affirme « DSN Sentry embarqué »`, () => {
      const src = read(s);
      expect(src).toContain("check('DSN Sentry embarqué', !!dsnMatch,");
      expect(src).toContain('@o(\\d+)\\.ingest(?:\\.[a-z]{2})?\\.sentry\\.io\\/(\\d+)/');
    });
  }
});
