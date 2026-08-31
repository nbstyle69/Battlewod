/**
 * Encre mesurée sur un fond qui n'est pas un jeton du thème.
 *
 * Trois cas dans l'app : le fond du minuteur, choisi par l'athlète (blanc,
 * jaune, fluo) ; une bande sombre commune aux deux thèmes ; un aplat de couleur
 * de domaine (erreur, succès) dont la luminance change d'un thème à l'autre.
 * Un `#fff` en dur y disparaît une fois sur deux. L'encre est donc choisie par
 * mesure WCAG, et reste vérifiable hors composant.
 */

import { contrast } from './contrast';

/** Un glyphe ou un grand chiffre reste lisible à partir de 3:1 (WCAG 1.4.11). */
const GLYPH_MIN = 3;

/** Un texte, même petit et discret, reste lisible à partir de 4,5:1. */
const TEXT_MIN = 4.5;

/** Opacités candidates de l'encre secondaire, de la plus discrète à la plus franche. */
const SECONDARY_ALPHAS = [0.5, 0.6, 0.7, 0.8, 0.9];

/**
 * Encre principale (texte fort) sur un fond donné : celle des deux qui
 * contraste le plus, mesurée en WCAG.
 *
 * Le seuil de luminance BT.601 employé auparavant (`lum > 128 ? noir : blanc`)
 * tombait du mauvais côté sur les fonds vifs de mi-échelle — sur le vert de
 * décompte (#2DB80E, lum 123) il choisissait le blanc, à 2,6:1.
 */
export function inkOn(bg: string): '#000000' | '#FFFFFF' {
  return contrast('#000000', bg) >= contrast('#FFFFFF', bg) ? '#000000' : '#FFFFFF';
}

/**
 * Encre secondaire (libellés discrets : « TEMPS FINAL », l'horloge, les hints) :
 * l'encre du fond, atténuée le plus possible sans descendre sous le seuil de
 * lecture. L'opacité est choisie par mesure, pas fixée à l'œil — `rgba(0,0,0,0.5)`
 * ne valait que 3,81:1 sur le fond « Blanc » terminé (#E8E8E8).
 */
export function inkOnSecondary(bg: string): string {
  const ink = inkOn(bg);
  const channels = ink === '#000000' ? '0,0,0' : '255,255,255';
  for (const alpha of SECONDARY_ALPHAS) {
    const candidate = `rgba(${channels},${alpha})`;
    if (contrast(candidate, bg) >= TEXT_MIN) return candidate;
  }
  return ink;
}

/**
 * Rend `color` si elle se détache du fond, sinon l'encre du fond.
 * Utilisée pour les couleurs de domaine posées sur un fond variable
 * (travail, repos, terminer) — le sens survit, l'invisibilité non.
 */
export function ensureContrast(color: string, bg: string): string {
  if (contrast(color, bg) >= GLYPH_MIN) return color;
  return inkOn(bg);
}
