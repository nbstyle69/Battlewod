import { lightTheme, darkTheme, AppTheme, ThemeMode } from '../theme/palette';
import { HUES, HueName, hue } from '../theme/hues';
import { contrast } from '../theme/contrast';

/**
 * Un écran « thémé » peut être illisible : les jetons se composent, et rien ne
 * vérifiait que la composition reste lisible. `#fff` sur `theme.accent` donnait
 * 2,5:1 dans LES DEUX thèmes — le bouton d'action principal de l'app.
 *
 * Ce contrôle mesure les paires réellement utilisées par les écrans, au ratio
 * WCAG, sur les deux thèmes. Il est discriminant : il échoue sur l'état d'avant.
 */

const TEXT_MIN = 4.5;
const GLYPH_MIN = 3;

const THEMES: [ThemeMode, AppTheme][] = [
  ['light', lightTheme],
  ['dark', darkTheme],
];

describe.each(THEMES)('contraste — thème %s', (mode, t) => {
  const onCard = (fg: string) => contrast(fg, t.card, t.background);

  it('le texte courant est lisible sur une carte', () => {
    expect(onCard(t.text)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('le texte secondaire est lisible sur une carte', () => {
    expect(onCard(t.textSecondary)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('le texte atténué reste lisible sur une carte (sous-titres de réglages)', () => {
    expect(onCard(t.textMuted)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('l\'encre des boutons pleins est lisible sur l\'accent', () => {
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('l\'accent utilisé EN TEXTE passe par accentText, et il est lisible', () => {
    expect(onCard(t.accentText)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('les icônes sur fond d\'accent atténué restent visibles', () => {
    expect(contrast(t.accentText, `${t.accent}12`, t.background)).toBeGreaterThanOrEqual(GLYPH_MIN);
  });

  const hueNames = Object.keys(HUES) as HueName[];
  it.each(hueNames)('la couleur de domaine « %s » est lisible en texte', (name) => {
    expect(onCard(hue(mode, name))).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

describe('contraste — le contrôle sait échouer', () => {
  it('mesure le défaut historique : #fff sur l\'accent des deux thèmes', () => {
    expect(contrast('#ffffff', lightTheme.accent)).toBeLessThan(TEXT_MIN);
    expect(contrast('#ffffff', darkTheme.accent)).toBeLessThan(TEXT_MIN);
  });

  it('mesure le défaut historique : la teinte sombre d\'une catégorie sur carte claire', () => {
    expect(contrast(HUES.yellow.dark, lightTheme.card, lightTheme.background)).toBeLessThan(GLYPH_MIN);
  });

  it('compose bien les cartes translucides (sinon tout passerait)', () => {
    expect(contrast('#ffffff', darkTheme.card, darkTheme.background)).toBeGreaterThan(10);
    expect(contrast('#ffffff', lightTheme.card, lightTheme.background)).toBeLessThan(1.2);
  });
});
