// Alimentation des 1RM par les charges réellement soulevées.
//
// Un bloc musculation prescrit des séries × reps × charge ; ce que l'athlète a
// réellement fait est la seule source légitime d'un 1RM. Ce service convertit une
// série réalisée en 1RM estimé (Epley) et ne l'écrit que s'il dépasse le record
// déjà enregistré — un 1RM ne descend jamais tout seul.
//
// La lecture passe par `get_my_profile()` : depuis le Lot 0-bis,
// `profiles.personal_records` n'est plus lisible en colonne. L'écriture reste
// limitée à sa propre ligne par la RLS.

import { supabase } from '../lib/supabase';
import { captureError } from '../lib/sentry';
import { fetchMyProfile } from './myProfile';
import { PR_SANITY } from '../utils/wod/movementLoadability';
import { prKey, prDateKey, weightliftingPrLabel } from '../screens/profile/prStorage';
import { Json } from '../types/supabase';

export interface PerformedSet {
  /** Nom du mouvement tel qu'écrit dans le bloc musculation. */
  name: string;
  /** Charge de la série, en kilos. */
  loadKg: number;
  /** Répétitions réellement effectuées dans cette série. */
  reps: number;
}

export interface RecordedPR {
  movement: string;
  kg: number;
  previousKg: number | null;
}

/**
 * 1RM estimé par la formule d'Epley, arrondi au demi-kilo.
 *
 * `null` au-delà de 10 reps : l'estimation devient une extrapolation, et un 1RM
 * inventé est pire qu'un 1RM absent (il faussera toutes les charges en %1RM).
 */
export function estimateOneRepMax(loadKg: number, reps: number): number | null {
  if (!Number.isFinite(loadKg) || loadKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  const est = reps === 1 ? loadKg : loadKg * (1 + reps / 30);
  const rounded = Math.round(est * 2) / 2;
  if (rounded < PR_SANITY[0] || rounded > PR_SANITY[1]) return null;
  return rounded;
}

/** Meilleur 1RM estimé par mouvement (libellé de la page Records). */
export function bestOneRepMaxBySet(sets: PerformedSet[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) {
    const label = weightliftingPrLabel(s.name);
    if (!label) continue;                       // mouvement sans 1RM de référence
    const est = estimateOneRepMax(s.loadKg, s.reps);
    if (est == null) continue;
    if (out[label] === undefined || est > out[label]) out[label] = est;
  }
  return out;
}

/**
 * Écrit les 1RM battus par les séries réalisées et rend ceux qui l'ont été.
 *
 * Fusionne uniquement les clés touchées après relecture, comme l'écran Records :
 * écrire tout l'objet écraserait un PR enregistré ailleurs entre-temps.
 */
export async function recordStrengthPRs(sets: PerformedSet[]): Promise<RecordedPR[]> {
  const candidates = bestOneRepMaxBySet(sets);
  if (Object.keys(candidates).length === 0) return [];

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];

  const profile = await fetchMyProfile();
  if (!profile) {
    captureError(new Error('get_my_profile a rendu null'), { service: 'strengthPR', action: 'read' });
    return [];
  }

  const remote = (profile.personal_records ?? {}) as Record<string, Json>;
  const merged: Record<string, Json> = { ...remote };
  const beaten: RecordedPR[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [movement, kg] of Object.entries(candidates)) {
    const key = prKey('weightlifting', movement);
    const rawPrev = remote[key];
    const prev = typeof rawPrev === 'string' || typeof rawPrev === 'number'
      ? parseFloat(String(rawPrev).replace(',', '.'))
      : NaN;
    const previousKg = Number.isFinite(prev) ? prev : null;
    if (previousKg != null && kg <= previousKg) continue;
    merged[key] = String(kg);
    merged[prDateKey('weightlifting', movement)] = today;
    beaten.push({ movement, kg, previousKg });
  }

  if (beaten.length === 0) return [];

  const { error } = await supabase
    .from('profiles').update({ personal_records: merged }).eq('id', userId);
  if (error) {
    captureError(error, { service: 'strengthPR', action: 'write' });
    return [];
  }
  return beaten;
}
