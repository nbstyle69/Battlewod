// Journal des séries réellement réalisées (lot 4).
//
// Le lot 2 collectait UNE charge par mouvement et calculait le 1RM avec les reps
// PRESCRITES : un 5 × 3 réellement exécuté 5, 5, 3 produisait un 1RM estimé sur
// 3 reps alors que l'athlète en avait poussé 5. Le chiffre était faux, plausible,
// et invérifiable puisque le travail n'était nulle part.
//
// Ici la grille est la source : une ligne par série prescrite, pré-remplie avec
// la prescription (reps, et charge résolue depuis le %1RM), modifiable ligne par
// ligne. L'athlète qui a fait exactement ce qui était prescrit valide sans rien
// toucher ; celui qui a dévié corrige la ligne concernée, et c'est cette valeur
// qui part au journal ET au calcul du 1RM.
//
// Ce service n'écrit JAMAIS dans `movement_logs` : cette table crédite les
// badges et les reps à vie, et le lot 2 a délibérément exclu les blocs de force
// de ce crédit. Un test verrouille cette séparation.

import { supabase } from '../lib/supabase';
import { captureError } from '../lib/sentry';
import { StrengthEntry, resolveStrengthLoadKg } from '../utils/strengthBlock';
import { weightliftingPrLabel } from '../screens/profile/prStorage';
import { PerformedSet } from './strengthPR';

/** Origine d'une série : le couple (type, id) survivra à la mort de program_wods. */
export type StrengthSourceType = 'whiteboard' | 'program';

/** Une ligne de la grille de saisie : ce que l'athlète déclare avoir fait. */
export interface StrengthSetDraft {
  /** Index du bloc dans la description (une même séance peut avoir plusieurs mouvements). */
  entryIndex: number;
  /** 1-based, dans l'ordre des séries du bloc. */
  setIndex: number;
  name: string;
  /** Saisies libres : la grille reste éditable, la validation se fait à l'écriture. */
  reps: string;
  loadKg: string;
  prescribedReps: number;
  prescribedLoadKg: number | null;
}

export interface StrengthSetRow {
  id: string;
  source_type: string;
  source_id: string;
  source_title: string | null;
  movement: string;
  movement_label: string | null;
  set_index: number;
  reps: number;
  load_kg: number | null;
  prescribed_reps: number | null;
  prescribed_load_kg: number | null;
  performed_at: string;
}

function toNumber(text: string): number | null {
  const n = parseFloat((text ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Grille pré-remplie par la prescription : une ligne par série.
 *
 * Un `%1RM` sans 1RM connu laisse la charge vide plutôt que d'en inventer une —
 * c'est déjà la règle de `resolveStrengthLoadKg`, elle ne change pas ici.
 */
export function buildStrengthGrid(
  entries: StrengthEntry[],
  oneRepMaxFor: (name: string) => number | null,
): StrengthSetDraft[] {
  const out: StrengthSetDraft[] = [];
  entries.forEach((e, entryIndex) => {
    const kg = resolveStrengthLoadKg(e, oneRepMaxFor(e.name));
    const sets = Math.max(1, Math.min(50, Math.round(e.sets)));
    for (let s = 1; s <= sets; s++) {
      out.push({
        entryIndex,
        setIndex: s,
        name: e.name,
        reps: String(e.reps),
        loadKg: kg == null ? '' : String(kg),
        prescribedReps: e.reps,
        prescribedLoadKg: kg,
      });
    }
  });
  return out;
}

/** Les lignes exploitables : une série sans reps ni charge valides n'est pas une série. */
export function usableDrafts(drafts: StrengthSetDraft[]): StrengthSetDraft[] {
  return drafts.filter(d => {
    const reps = toNumber(d.reps);
    const load = toNumber(d.loadKg);
    return reps != null && reps >= 1 && load != null && load > 0;
  });
}

export interface LogStrengthSetsParams {
  userId: string;
  sourceType: StrengthSourceType;
  sourceId: string;
  sourceTitle: string | null;
  drafts: StrengthSetDraft[];
}

/**
 * Écrit le journal de la séance et rend les séries réalisées, chacune porteuse
 * de l'`id` de sa ligne : c'est cet id qui permet de rattacher un 1RM à la
 * séance qui l'a établi (sinon la provenance serait déduite d'une date, donc
 * fausse dès qu'un athlète enregistre deux séances le même jour).
 *
 * La réécriture est un upsert sur (athlète, source, mouvement, série) suivi de
 * la purge des séries non réécrites : corriger son score corrige l'historique,
 * il ne l'empile pas — et trois séries déclarées après cinq, c'est trois séries.
 */
export async function logStrengthSets(p: LogStrengthSetsParams): Promise<PerformedSet[]> {
  const usable = usableDrafts(p.drafts);
  // Une grille entièrement vide n'est PAS une déclaration de « zéro série » :
  // le pré-remplissage repart de la prescription à chaque ouverture, donc un
  // %1RM non résolu rend les charges vides sans que l'athlète ait rien dit.
  // Purger ici effacerait son historique sur un geste qu'il n'a pas fait. On
  // retire une série en soumettant moins de lignes, pas en les vidant toutes.
  if (usable.length === 0) return [];

  const rows = usable.map(d => ({
    user_id: p.userId,
    source_type: p.sourceType,
    source_id: p.sourceId,
    source_title: p.sourceTitle,
    movement: d.name,
    movement_label: weightliftingPrLabel(d.name),
    set_index: d.setIndex,
    reps: Math.round(toNumber(d.reps) as number),
    load_kg: toNumber(d.loadKg),
    prescribed_reps: d.prescribedReps,
    prescribed_load_kg: d.prescribedLoadKg,
  }));

  // Écriture d'abord, purge ensuite : l'inverse (effacer puis réinsérer) perdrait
  // l'historique de la séance si l'insertion échouait entre les deux.
  const { data, error } = await supabase
    .from('strength_set_logs')
    .upsert(rows, { onConflict: 'user_id,source_type,source_id,movement,set_index' })
    .select('id, movement, reps, load_kg');
  if (error || !data) {
    captureError(error ?? new Error('upsert strength_set_logs sans données'),
      { service: 'strengthSets', action: 'upsert' });
    return [];
  }

  // Les séries retirées de la grille (5 séries déclarées puis corrigées à 3)
  // sortent du journal : le laisser les garder ferait mentir l'historique.
  const keptIds = data.map(r => r.id);
  const { error: pruneErr } = await supabase
    .from('strength_set_logs')
    .delete()
    .eq('user_id', p.userId)
    .eq('source_type', p.sourceType)
    .eq('source_id', p.sourceId)
    .not('id', 'in', `(${keptIds.join(',')})`);
  if (pruneErr) captureError(pruneErr, { service: 'strengthSets', action: 'prune' });

  return data
    .filter(r => r.load_kg != null)
    .map(r => ({
      name: r.movement,
      loadKg: Number(r.load_kg),
      reps: r.reps,
      logId: r.id,
    }));
}

/** Historique de l'athlète (sa propre trace : la RLS suffit, pas de RPC). */
export async function fetchMyStrengthSets(limit = 200): Promise<StrengthSetRow[]> {
  const { data, error } = await supabase
    .from('strength_set_logs')
    .select('id, source_type, source_id, source_title, movement, movement_label, set_index, reps, load_kg, prescribed_reps, prescribed_load_kg, performed_at')
    .order('performed_at', { ascending: false })
    .order('movement', { ascending: true })
    .order('set_index', { ascending: true })
    .limit(limit);
  if (error) {
    captureError(error, { service: 'strengthSets', action: 'fetchMine' });
    return [];
  }
  return (data ?? []).map(r => ({ ...r, load_kg: r.load_kg == null ? null : Number(r.load_kg) }));
}

export interface StrengthSession {
  key: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string | null;
  performedAt: string;
  movement: string;
  movementLabel: string | null;
  sets: { setIndex: number; reps: number; loadKg: number | null; id: string }[];
}

/** Regroupe les séries par (séance, mouvement) — l'unité que l'athlète a vécue. */
export function groupStrengthSessions(rows: StrengthSetRow[]): StrengthSession[] {
  const map = new Map<string, StrengthSession>();
  for (const r of rows) {
    const key = `${r.source_id}::${r.movement}`;
    const existing = map.get(key);
    if (existing) {
      existing.sets.push({ setIndex: r.set_index, reps: r.reps, loadKg: r.load_kg, id: r.id });
      continue;
    }
    map.set(key, {
      key,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceTitle: r.source_title,
      performedAt: r.performed_at,
      movement: r.movement,
      movementLabel: r.movement_label,
      sets: [{ setIndex: r.set_index, reps: r.reps, loadKg: r.load_kg, id: r.id }],
    });
  }
  const list = [...map.values()];
  for (const s of list) s.sets.sort((a, b) => a.setIndex - b.setIndex);
  return list.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
}
