/**
 * Tests du service de personnalisation (Supabase mocké).
 * Focus : la calibration RPE (SPEC §5) — le bug historique était l'absence de garde
 * de longueur (`.every()` renvoie true sur une liste trop courte), donc UNE seule
 * séance « facile » déclenchait +0.05 au lieu des 3 consécutives exigées.
 */

// ---- Faux client Supabase chaînable -----------------------------------------
// Chaque table renvoie un résultat programmable ; les insert/upsert sont journalisés.

type TableResult = { data: unknown; error: null };
const tableResults: Record<string, TableResult> = {};
const writes: { table: string; op: 'insert' | 'upsert'; payload: unknown }[] = [];

function makeBuilder(table: string) {
  const result = () => tableResults[table] ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const chain = (..._args: unknown[]) => builder;
  for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) builder[m] = jest.fn(chain);
  builder.maybeSingle = jest.fn(async () => result());
  builder.insert = jest.fn(async (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return { data: null, error: null }; });
  builder.upsert = jest.fn(async (payload: unknown) => { writes.push({ table, op: 'upsert', payload }); return { data: null, error: null }; });
  // Fin de chaîne « thenable » : `await q.select().eq()...` résout le résultat programmé.
  builder.then = (resolve: (v: TableResult) => unknown) => Promise.resolve(result()).then(resolve);
  return builder;
}

jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn((table: string) => makeBuilder(table)) },
}));

import { recordCompleted } from '../services/wodPersonalization';
import { RankedSuggestion } from '../utils/wod/ranker';

const USER = 'user-1';
const sugg = {
  kind: 'cf', wod: {} as never, seed: 1, signature: 'sig-1',
  movementNames: ['thruster', 'pull-ups'], score: 80, matchPct: 80,
  isChallenge: false, personalized: false, why: '', method: 'For Time',
} as RankedSuggestion;

/** Programme l'historique RPE renvoyé par user_wod_feedback (le + récent d'abord). */
function givenRpeHistory(rpes: string[]) {
  tableResults['user_wod_feedback'] = { data: rpes.map((rpe) => ({ rpe })), error: null };
  tableResults['user_generation_settings'] = { data: { level_adjust: 0 }, error: null };
}
const levelAdjustWrites = () =>
  writes.filter((w) => w.table === 'user_generation_settings' && w.op === 'upsert');

beforeEach(() => {
  writes.length = 0;
  for (const k of Object.keys(tableResults)) delete tableResults[k];
});

describe('calibration RPE (SPEC §5 : 3 « facile » consécutifs → +0.05 ; 2 « dur » → −0.05)', () => {
  it("1 seule séance 'easy' NE déclenche PAS +0.05 (le bug historique)", async () => {
    givenRpeHistory(['easy']); // première séance de l'utilisateur
    await recordCompleted(USER, 'functional', sugg, 'easy');
    expect(levelAdjustWrites()).toHaveLength(0);
  });

  it("2 séances 'easy' ne déclenchent toujours pas", async () => {
    givenRpeHistory(['easy', 'easy']);
    await recordCompleted(USER, 'functional', sugg, 'easy');
    expect(levelAdjustWrites()).toHaveLength(0);
  });

  it("3 'easy' consécutifs → level_adjust +0.05", async () => {
    givenRpeHistory(['easy', 'easy', 'easy']);
    await recordCompleted(USER, 'functional', sugg, 'easy');
    const w = levelAdjustWrites();
    expect(w).toHaveLength(1);
    expect((w[0].payload as { level_adjust: number }).level_adjust).toBeCloseTo(0.05);
  });

  it("1 seule séance 'hard' ne déclenche pas −0.05", async () => {
    givenRpeHistory(['hard']);
    await recordCompleted(USER, 'functional', sugg, 'hard');
    expect(levelAdjustWrites()).toHaveLength(0);
  });

  it("2 'hard' consécutifs → level_adjust −0.05", async () => {
    givenRpeHistory(['hard', 'hard']);
    await recordCompleted(USER, 'functional', sugg, 'hard');
    const w = levelAdjustWrites();
    expect(w).toHaveLength(1);
    expect((w[0].payload as { level_adjust: number }).level_adjust).toBeCloseTo(-0.05);
  });

  it("3 'easy' NON consécutifs (easy, hard, easy) ne déclenchent pas", async () => {
    givenRpeHistory(['easy', 'hard', 'easy']);
    await recordCompleted(USER, 'functional', sugg, 'easy');
    expect(levelAdjustWrites()).toHaveLength(0);
  });

  it("'perfect' n'écrit jamais de calibration", async () => {
    givenRpeHistory(['perfect', 'perfect', 'perfect']);
    await recordCompleted(USER, 'functional', sugg, 'perfect');
    expect(levelAdjustWrites()).toHaveLength(0);
  });

  it('le plafond ±0.10 est respecté (déjà à +0.10 → reste +0.10)', async () => {
    givenRpeHistory(['easy', 'easy', 'easy']);
    tableResults['user_generation_settings'] = { data: { level_adjust: 0.10 }, error: null };
    await recordCompleted(USER, 'functional', sugg, 'easy');
    const w = levelAdjustWrites();
    expect(w).toHaveLength(1);
    expect((w[0].payload as { level_adjust: number }).level_adjust).toBeCloseTo(0.10);
  });

  it("enregistre toujours la ligne 'completed' dans user_wod_feedback", async () => {
    givenRpeHistory(['easy']);
    await recordCompleted(USER, 'functional', sugg, 'easy');
    const fb = writes.filter((w) => w.table === 'user_wod_feedback' && w.op === 'insert');
    expect(fb).toHaveLength(1);
    expect((fb[0].payload as { action: string; rpe: string }).action).toBe('completed');
  });
});
