// Lignes de tournament_match_elo_history (écrites par trg_bracket_match_elo à chaque match de bracket
// terminé) → entrées de l'historique ELO. Sans elles, le dernier point de la courbe d'un membre qui joue
// des brackets ne retombe pas sur son ELO affiché.

export type EloEntryType = 'wod' | 'tournament' | 'daily' | 'match';

export interface EloEntry {
  id: string;
  type: EloEntryType;
  refId: string | null;
  label: string;
  delta: number;
  eloBefore: number;
  eloAfter: number;
  rank: number | null;
  date: string;
}

export interface MatchEloRow {
  id: string;
  match_id: string | null;
  opponent_id: string | null;
  result: 'win' | 'loss';
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  created_at: string;
  tournament_bracket_matches:
    | { tournament_id: string; tournaments: { name: string } | { name: string }[] | null }
    | { tournament_id: string; tournaments: { name: string } | { name: string }[] | null }[]
    | null;
}

export interface MatchEloLabels {
  deletedMatch: string;
  /** ex. « vs {{opponent}} » */
  versus: (opponent: string) => string;
  unknownOpponent: string;
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function matchEloRowToEntry(
  row: MatchEloRow,
  opponentNames: Record<string, string | undefined>,
  labels: MatchEloLabels,
): EloEntry {
  const match = first(row.tournament_bracket_matches);
  const tournament = first(match?.tournaments);
  const opponent = row.opponent_id ? opponentNames[row.opponent_id] : undefined;
  const who = labels.versus(opponent ?? labels.unknownOpponent);
  const label = row.match_id === null || match === null
    ? labels.deletedMatch
    : `${tournament?.name ?? 'Tournoi'} · ${who}`;
  return {
    id: row.id,
    type: 'match',
    refId: match?.tournament_id ?? null,
    label,
    delta: row.elo_delta,
    eloBefore: row.elo_before,
    eloAfter: row.elo_after,
    rank: null,
    date: row.created_at,
  };
}

/** Tri antéchronologique commun à toutes les sources ; la courbe le renverse. */
export function sortEloEntries(entries: EloEntry[]): EloEntry[] {
  return [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Points de la courbe : elo_before du plus ancien, puis elo_after de chaque entrée, du plus ancien au plus récent. */
export function eloCurvePoints(entriesDesc: EloEntry[]): number[] {
  const asc = [...entriesDesc].reverse();
  if (asc.length === 0) return [];
  return [asc[0].eloBefore, ...asc.map(e => e.eloAfter)];
}
