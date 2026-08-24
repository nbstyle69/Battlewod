/**
 * Encre du minuteur plein écran.
 *
 * Le fond du minuteur n'est PAS le thème de l'app : c'est une couleur choisie
 * par l'athlète, qui peut être blanche (« Blanc »), jaune ou fluo. Un texte
 * blanc en dur y disparaît. Ces primitives sont donc la seule source de
 * l'encre, et elles sont mesurables hors composant.
 */

import { contrast } from './contrast';

/**
 * Encre principale (texte fort) sur un fond de minuteur donné : celle des deux
 * qui contraste le plus, mesurée en WCAG.
 *
 * Le seuil de luminance BT.601 employé auparavant (`lum > 128 ? noir : blanc`)
 * tombait du mauvais côté sur les fonds vifs de mi-échelle — sur le vert de
 * décompte (#2DB80E, lum 123) il choisissait le blanc, à 2,6:1.
 */
export function inkOn(bg: string): '#000000' | '#FFFFFF' {
  return contrast('#000000', bg) >= contrast('#FFFFFF', bg) ? '#000000' : '#FFFFFF';
}

/** Un glyphe ou un grand chiffre reste lisible à partir de 3:1 (WCAG 1.4.11). */
const GLYPH_MIN = 3;

/** Un texte, même petit et discret, reste lisible à partir de 4,5:1. */
const TEXT_MIN = 4.5;

/** Opacités candidates de l'encre secondaire, de la plus discrète à la plus franche. */
const SECONDARY_ALPHAS = [0.5, 0.6, 0.7, 0.8, 0.9];

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
 * Utilisée pour les chiffres et les couleurs de domaine du minuteur
 * (travail, repos, terminer) — le sens survit, l'invisibilité non.
 */
export function ensureContrast(color: string, bg: string): string {
  if (contrast(color, bg) >= GLYPH_MIN) return color;
  return inkOn(bg);
}

export interface TimerPalette {
  id: string;
  label: string;
  emoji: string;
  digitColor: string;
  bgCountdown: string;
  bgRunning: string;
  bgDone: string;
  accent: string;
}

export const TIMER_THEMES: TimerPalette[] = [
  { id: 'emerald',  label: 'Lime',     emoji: '🌿', digitColor: '#003300', bgCountdown: '#2DB80E', bgRunning: '#39FF14', bgDone: '#55FF33', accent: '#003300' },
  { id: 'fire',     label: 'Orange',   emoji: '🔥', digitColor: '#4d1a00', bgCountdown: '#CC5200', bgRunning: '#FF6600', bgDone: '#FF8833', accent: '#4d1a00' },
  { id: 'electric', label: 'Cyan Blue',emoji: '⚡', digitColor: '#003344', bgCountdown: '#0099CC', bgRunning: '#00BFFF', bgDone: '#33CCFF', accent: '#003344' },
  { id: 'midnight', label: 'Violet',   emoji: '🌙', digitColor: '#FFFFFF', bgCountdown: '#AA00DD', bgRunning: '#CC00FF', bgDone: '#DD33FF', accent: '#FFFFFF' },
  { id: 'ocean',    label: 'Cyan',     emoji: '🌊', digitColor: '#003333', bgCountdown: '#00CCCC', bgRunning: '#00FFFF', bgDone: '#33FFFF', accent: '#003333' },
  { id: 'solar',    label: 'Yellow',   emoji: '☀️', digitColor: '#333300', bgCountdown: '#CCCC00', bgRunning: '#FFFF00', bgDone: '#FFFF44', accent: '#333300' },
  { id: 'neon',     label: 'Pink',     emoji: '🩷', digitColor: '#FFFFFF', bgCountdown: '#CC0073', bgRunning: '#FF0090', bgDone: '#FF33AA', accent: '#FFFFFF' },
  { id: 'rage',     label: 'Red',      emoji: '🔴', digitColor: '#FFFFFF', bgCountdown: '#CC0000', bgRunning: '#FF1414', bgDone: '#FF4444', accent: '#FFFFFF' },
  { id: 'noir',     label: 'Noir',     emoji: '⬛', digitColor: '#39FF14', bgCountdown: '#000000', bgRunning: '#000000', bgDone: '#111111', accent: '#FFFFFF' },
  { id: 'blanc',    label: 'Blanc',    emoji: '⬜', digitColor: '#000000', bgCountdown: '#EEEEEE', bgRunning: '#FFFFFF', bgDone: '#E8E8E8', accent: '#000000' },
];
