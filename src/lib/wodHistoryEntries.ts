/**
 * Historique d'entraînement unifié : WOD générés (avec leurs scores), scores
 * saisis sur les WOD de box, et WOD de box marqués « réalisés » sans score.
 * Une seule liste chronologique ; chaque ligne sait quel détail elle ouvre.
 */

export interface GeneratedWodRow {
  id: string;
  created_at: string;
  scores?: { id: string }[] | null;
}

export interface BoxWodRef {
  title: string;
  wod_type: string | null;
  scheduled_date?: string | null;
}

export interface BoxScoreRow {
  id: string;
  wod_id: string | null;
  score_value: number;
  score_type: string | null;
  rx: boolean | null;
  submitted_at: string | null;
  wod: BoxWodRef | null;
}

export interface CompletionRow {
  id: string;
  wod_id: string;
  completed_at: string;
  wod: BoxWodRef | null;
}

export type HistoryEntry<G extends GeneratedWodRow = GeneratedWodRow> =
  | { kind: 'generated'; id: string; date: string; wod: G }
  | { kind: 'boxScore'; id: string; date: string; wodId: string; wod: BoxWodRef | null; score: BoxScoreRow }
  | { kind: 'completion'; id: string; date: string; wodId: string; wod: BoxWodRef | null };

export function buildHistoryEntries<G extends GeneratedWodRow>(
  generated: G[],
  boxScores: BoxScoreRow[],
  completions: CompletionRow[],
): HistoryEntry<G>[] {
  const entries: HistoryEntry<G>[] = [];
  for (const wod of generated) {
    entries.push({ kind: 'generated', id: `g:${wod.id}`, date: wod.created_at, wod });
  }
  for (const score of boxScores) {
    if (!score.wod_id) continue;
    entries.push({
      kind: 'boxScore', id: `s:${score.id}`, date: score.submitted_at ?? '',
      wodId: score.wod_id, wod: score.wod, score,
    });
  }
  // Un score sur le même WOD fait autorité : la ligne « réalisé » disparaît.
  const scoredWodIds = new Set(boxScores.map(s => s.wod_id));
  for (const c of completions) {
    if (scoredWodIds.has(c.wod_id)) continue;
    entries.push({ kind: 'completion', id: `c:${c.id}`, date: c.completed_at, wodId: c.wod_id, wod: c.wod });
  }
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function countScores(entries: HistoryEntry[]): number {
  return entries.reduce((acc, e) => {
    if (e.kind === 'generated') return acc + (e.wod.scores?.length ?? 0);
    if (e.kind === 'boxScore') return acc + 1;
    return acc;
  }, 0);
}
