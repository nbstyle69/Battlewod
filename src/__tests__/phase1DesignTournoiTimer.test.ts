import fs from 'fs';
import path from 'path';
import { contrast } from '../theme/contrast';
import { lightTheme, darkTheme } from '../theme/palette';

const SCREENS = path.resolve(__dirname, '..', 'screens');
const read = (rel: string): string => fs.readFileSync(path.join(SCREENS, rel), 'utf8');

const TIMER = read('timer/TimerScreen.tsx');
const TOURNOI = read('competition/TournamentScreen.tsx');

const TEXT_MIN = 4.5;
const GLYPH_MIN = 3;
/** Arrêt le plus contraignant du dégradé clair sous les commandes du minuteur. */
const GRAD_LIGHT = '#f1f5f9';
const GRAD_DARK = '#0d1f17';
/** Arrêt le plus clair de l'en-tête du tournoi : celui qui laisse le moins de marge. */
const HEADER_STOP = '#0d1f17';

describe('minuteur — encre des commandes', () => {
  it('aucune encre blanche en dur ne subsiste', () => {
    expect(TIMER).not.toMatch(/'#fff'|'#FFF'|'#ffffff'|'#FFFFFF'/);
    expect(TIMER).not.toMatch(/color="#fff"/);
    expect(TIMER).not.toMatch(/rgba\(255,255,255/);
  });

  it('les aplats d’accent portent onAccent, pas du blanc', () => {
    expect(contrast('#FFFFFF', lightTheme.accent)).toBeLessThan(TEXT_MIN);
    expect(contrast('#FFFFFF', darkTheme.accent)).toBeLessThan(TEXT_MIN);
    expect(contrast(lightTheme.onAccent, lightTheme.accent)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast(darkTheme.onAccent, darkTheme.accent)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(TIMER).toMatch(/chipTextActive: \{ color: theme\.onAccent \}/);
    expect(TIMER).toMatch(/cdChipTextActive: \{ color: theme\.onAccent \}/);
    expect(TIMER).toMatch(/seqTypeTextActive: \{ color: theme\.onAccent \}/);
    expect(TIMER).toMatch(/seqBlockNumText: \{[^}]*color: theme\.onAccent/);
    expect(TIMER).toMatch(/toggleThumbOn: \{ backgroundColor: theme\.onAccent/);
  });

  it('DÉMARRER est posé sur un CTA translucide : son encre est theme.text', () => {
    // Le bouton est un aplat d'accent à 28 % sur le dégradé.
    const cta = `${lightTheme.accent}28`;
    expect(contrast('#FFFFFF', cta, GRAD_LIGHT)).toBeLessThan(2);
    expect(contrast(lightTheme.text, cta, GRAD_LIGHT)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast(darkTheme.text, `${darkTheme.accent}28`, GRAD_DARK)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(TIMER).toMatch(/btnPrimaryText: \{ color: theme\.text/);
  });

  it('l’accent ne sert plus d’encre : accentText sur carte et sur dégradé', () => {
    expect(contrast(lightTheme.accent, lightTheme.card, GRAD_LIGHT)).toBeLessThan(GLYPH_MIN);
    expect(contrast(lightTheme.accentText, lightTheme.card, GRAD_LIGHT)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast(darkTheme.accentText, darkTheme.card, GRAD_DARK)).toBeGreaterThanOrEqual(GLYPH_MIN);
    expect(TIMER).not.toMatch(/color: theme\.accent[,\s}]/);
    expect(TIMER).not.toMatch(/color=\{theme\.accent\}/);
  });

  it('les libellés et la poignée sortent du blanc translucide invisible', () => {
    expect(contrast('rgba(255,255,255,0.5)', GRAD_LIGHT)).toBeLessThan(1.5);
    expect(contrast(lightTheme.textMuted, GRAD_LIGHT)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast('rgba(255,255,255,0.2)', lightTheme.modalCard)).toBeLessThan(1.5);
    expect(contrast(lightTheme.textMuted, lightTheme.modalCard)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('le bouton secondaire ne repose plus sur un aplat de page', () => {
    expect(TIMER).not.toMatch(/backgroundColor: theme\.background/);
  });
});

describe('détail tournoi — en-tête', () => {
  it('les arrêts viennent de la famille du dégradé de la coque, plus du bleu-noir', () => {
    expect(TOURNOI).toMatch(/const HEADER_GRADIENT: \[string, string\] = \['#0d1f17', '#022c22'\]/);
    expect(TOURNOI).not.toMatch(/#12121A|#0A0A0F/);
  });

  it('l’encre des pastilles vient du thème sombre, comme le reste de l’en-tête', () => {
    // Le contrôle mord : les valeurs claires, qui étaient utilisées, échouent ici.
    expect(contrast(lightTheme.success, HEADER_STOP)).toBeLessThan(TEXT_MIN);
    expect(contrast(lightTheme.error, HEADER_STOP)).toBeLessThan(TEXT_MIN);
    expect(contrast(lightTheme.gold, HEADER_STOP)).toBeLessThan(TEXT_MIN);
    expect(contrast(darkTheme.success, HEADER_STOP)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast(darkTheme.error, HEADER_STOP)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrast(darkTheme.gold, HEADER_STOP)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(TOURNOI).not.toMatch(/theme\.success\}22/);
    expect(TOURNOI).toMatch(/prize: *\{[^}]*color: darkTheme\.gold/);
  });

  it('le corps de l’écran reste sur la coque de verre', () => {
    expect(TOURNOI).toMatch(/<GlassBackground \/>/);
    expect(TOURNOI).toMatch(/container: *\{ flex: 1, backgroundColor: 'transparent' \}/);
  });
});
