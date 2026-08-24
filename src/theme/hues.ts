import type { ThemeMode } from './palette';

/**
 * Couleurs de domaine — celles qui portent une information que le texte ne
 * porte pas (catégorie de notification, gain/perte d'ELO, genre d'un WOD).
 * Elles ne se neutralisent pas ; elles se centralisent, et elles ont DEUX
 * valeurs, parce qu'une teinte lisible sur un fond sombre ne l'est pas sur du
 * blanc : `#EAB308` tombe à 1,9:1 sur une carte claire.
 *
 * La valeur `dark` est la teinte historique de l'app ; la valeur `light` est
 * son équivalent assombri, choisi pour tenir 3:1 au minimum sur carte claire.
 * `src/__tests__/themeContrast.test.ts` refuse toute paire en dessous.
 */
export const HUES = {
  amber: { light: '#B45309', dark: '#F59E0B' },
  cyan: { light: '#0E7490', dark: '#06B6D4' },
  violet: { light: '#6D28D9', dark: '#A78BFA' },
  blue: { light: '#1D4ED8', dark: '#3B82F6' },
  pink: { light: '#BE185D', dark: '#EC4899' },
  emerald: { light: '#047857', dark: '#10B981' },
  orange: { light: '#C2410C', dark: '#F97316' },
  yellow: { light: '#A16207', dark: '#EAB308' },
  red: { light: '#B91C1C', dark: '#EF4444' },
  indigo: { light: '#4338CA', dark: '#818CF8' },
  teal: { light: '#0F766E', dark: '#14B8A6' },
  /** Gain d'ELO / réussite. */
  positive: { light: '#15803D', dark: '#22C55E' },
  /** Perte d'ELO / échec. */
  negative: { light: '#B91C1C', dark: '#EF4444' },
  /** Marque YouTube — la teinte est imposée, seule sa déclinaison lisible varie. */
  youtube: { light: '#C10000', dark: '#FF3B30' },
} as const;

export type HueName = keyof typeof HUES;

export function hue(mode: ThemeMode, name: HueName): string {
  return HUES[name][mode];
}
