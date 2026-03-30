// ── Shared ELO Calculation Utilities ──────────────────────────────────────────
// Single source of truth for all ELO calculations across the app.
// K-factor: 32 for pairwise (daily tournaments, WODs, inter-box)
//           48 for avg-opponent (box owner tournaments)

export const K_PAIRWISE = 32;
export const K_TOURNAMENT = 48;
export const ELO_FLOOR = 100;

export interface RankedPlayer {
  id: string;
  elo: number;
  rank: number;
}

export interface EloResult extends RankedPlayer {
  delta: number;
}

// ── Pairwise ELO ─────────────────────────────────────────────────────────────
// Each player is compared against every other player individually.
// Used for: daily mini-tournaments, WOD leaderboard ELO, inter-box competitions.
export function calculatePairwiseDeltas(
  players: RankedPlayer[],
  k: number = K_PAIRWISE,
): EloResult[] {
  const n = players.length;
  if (n < 2) return players.map(p => ({ ...p, delta: 0 }));

  return players.map(player => {
    let expectedScore = 0;
    let actualScore = 0;

    for (const opponent of players) {
      if (opponent.id === player.id) continue;
      expectedScore += 1 / (1 + Math.pow(10, (opponent.elo - player.elo) / 400));
      if (player.rank < opponent.rank) actualScore += 1;
      else if (player.rank === opponent.rank) actualScore += 0.5;
    }

    const delta = Math.round((k / (n - 1)) * (actualScore - expectedScore));
    return { ...player, delta };
  });
}

// ── Average-Opponent ELO ─────────────────────────────────────────────────────
// Player ELO change based on rank vs average opponent ELO.
// Used for: box owner tournaments (BOTournamentScreen).
export function calcAvgOpponentDelta(
  athleteElo: number,
  finalRank: number,
  totalParticipants: number,
  avgOpponentElo: number,
  k: number = K_TOURNAMENT,
): number {
  if (totalParticipants <= 1) return 0;
  const actualScore = (totalParticipants - finalRank) / (totalParticipants - 1);
  const expectedScore = 1 / (1 + Math.pow(10, (avgOpponentElo - athleteElo) / 400));
  return Math.round(k * (actualScore - expectedScore));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function clampElo(elo: number): number {
  return Math.max(ELO_FLOOR, elo);
}

// Assign ranks with tie handling from a sorted array of scores.
// `sorted` must already be sorted in the correct order (asc for time, desc for reps).
export function assignRanks<T extends { score: number }>(
  sorted: T[],
): (T & { rank: number })[] {
  const result: (T & { rank: number })[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let rank = i + 1;
    if (i > 0 && sorted[i].score === sorted[i - 1].score) {
      rank = result[i - 1].rank;
    }
    result.push({ ...sorted[i], rank });
  }
  return result;
}
