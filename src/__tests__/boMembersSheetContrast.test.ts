import { lightTheme, darkTheme, AppTheme, ThemeMode } from '../theme/palette';
import { contrast } from '../theme/contrast';

/**
 * Fiche adhérent du back-office mobile (BOMembersScreen, modal « sheet »).
 *
 * 1.0.52 I4 : la fiche était posée en `theme.card` (translucide) sur un voile
 * `rgba(0,0,0,0.6)` — en clair, la carte devenait un gris moyen et l'encre
 * atténuée tombait à 2,77:1. La fiche est désormais en `theme.modalCard`
 * (opaque) sur `theme.modalBackdrop`. On mesure les paires réellement posées :
 * texte / secondaire / atténué, statuts colorés, encres des badges, et le bloc
 * formule (`theme.surface` sur la fiche). Le test échoue sur l'état d'avant.
 */

const TEXT_MIN = 4.5;
const GLYPH_MIN = 3;

const THEMES: [ThemeMode, AppTheme][] = [
  ['light', lightTheme],
  ['dark', darkTheme],
];

/** Fond réel de l'ancienne fiche : voile 60 % noir sur le fond du thème, puis theme.card. */
function ancienneFiche(t: AppTheme): { bg: string; behind: string } {
  return { bg: t.card, behind: `rgba(0,0,0,0.6)` };
}

describe.each(THEMES)('fiche adhérent BOMembers — thème %s', (mode, t) => {
  const onSheet = (fg: string) => contrast(fg, t.modalCard);
  const onPlanCard = (fg: string) => contrast(fg, t.surface, t.modalCard);

  it('texte, secondaire et atténué lisibles sur la fiche', () => {
    expect(onSheet(t.text)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onSheet(t.textSecondary)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onSheet(t.textMuted)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('bloc formule : nom, échéance et statuts lisibles sur theme.surface posé sur la fiche', () => {
    expect(onPlanCard(t.text)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onPlanCard(t.textSecondary)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onPlanCard(t.textMuted)).toBeGreaterThanOrEqual(TEXT_MIN);
    // statuts (12 px gras) : encre de texte, pas de glyphe
    expect(onPlanCard(t.success)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onPlanCard(t.warning)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onPlanCard(t.error)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('bouton coach et badges de réservation (accentText / warning) lisibles sur la fiche', () => {
    expect(onSheet(t.accentText)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onSheet(t.warning)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(onPlanCard(t.accentText)).toBeGreaterThanOrEqual(GLYPH_MIN);
  });

  it(`les encres codées en dur d'avant (#3B82F6, #C9A227, #f59e0b) ne tenaient pas sur la fiche claire`, () => {
    if (mode === 'light') {
      expect(Math.min(onSheet('#C9A227'), onSheet('#f59e0b'))).toBeLessThan(GLYPH_MIN);
      expect(onSheet('#3B82F6')).toBeLessThan(TEXT_MIN);
    }
  });

  it(`l'état d'avant (theme.card sur voile 60 %) est mesuré et retenu`, () => {
    const { bg, behind } = ancienneFiche(t);
    const muted = contrast(t.textMuted, bg, behind);
    if (mode === 'light') {
      // La raison de la correction : 2,77:1, sous le seuil texte.
      expect(muted).toBeLessThan(TEXT_MIN);
    } else {
      expect(muted).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  });
});
