import {
  calculatePairwiseDeltas,
  calcAvgOpponentDelta,
  clampElo,
  assignRanks,
  K_PAIRWISE,
  K_TOURNAMENT,
  ELO_FLOOR,
  RankedPlayer,
} from '../utils/elo';

describe('elo utilities', () => {
  // ── Constants ────────────────────────────────────────────────────────────
  test('constants have expected values', () => {
    expect(K_PAIRWISE).toBe(64);
    expect(K_TOURNAMENT).toBe(48);
    expect(ELO_FLOOR).toBe(100);
  });

  // ── clampElo ─────────────────────────────────────────────────────────────
  describe('clampElo', () => {
    test('returns same value when above floor', () => {
      expect(clampElo(1200)).toBe(1200);
    });
    test('clamps to floor when below', () => {
      expect(clampElo(50)).toBe(ELO_FLOOR);
      expect(clampElo(-100)).toBe(ELO_FLOOR);
    });
    test('returns floor when exactly at floor', () => {
      expect(clampElo(ELO_FLOOR)).toBe(ELO_FLOOR);
    });
  });

  // ── assignRanks ──────────────────────────────────────────────────────────
  describe('assignRanks', () => {
    test('assigns sequential ranks for unique scores', () => {
      const result = assignRanks([
        { score: 100 },
        { score: 90 },
        { score: 80 },
      ]);
      expect(result.map(r => r.rank)).toEqual([1, 2, 3]);
    });

    test('handles ties correctly', () => {
      const result = assignRanks([
        { score: 100 },
        { score: 100 },
        { score: 80 },
      ]);
      expect(result.map(r => r.rank)).toEqual([1, 1, 3]);
    });

    test('returns empty array for empty input', () => {
      expect(assignRanks([])).toEqual([]);
    });

    test('single player gets rank 1', () => {
      const result = assignRanks([{ score: 50 }]);
      expect(result[0].rank).toBe(1);
    });
  });

  // ── calculatePairwiseDeltas ──────────────────────────────────────────────
  describe('calculatePairwiseDeltas', () => {
    test('returns zero deltas for single player', () => {
      const players: RankedPlayer[] = [{ id: 'a', elo: 1000, rank: 1 }];
      const result = calculatePairwiseDeltas(players);
      expect(result).toHaveLength(1);
      expect(result[0].delta).toBe(0);
    });

    test('returns zero deltas for empty array', () => {
      expect(calculatePairwiseDeltas([])).toEqual([]);
    });

    test('winner gains ELO, loser loses ELO with equal starting ELO', () => {
      const players: RankedPlayer[] = [
        { id: 'winner', elo: 1000, rank: 1 },
        { id: 'loser', elo: 1000, rank: 2 },
      ];
      const result = calculatePairwiseDeltas(players);
      const winner = result.find(r => r.id === 'winner')!;
      const loser = result.find(r => r.id === 'loser')!;

      expect(winner.delta).toBeGreaterThan(0);
      expect(loser.delta).toBeLessThan(0);
    });

    test('deltas sum to zero (zero-sum game)', () => {
      const players: RankedPlayer[] = [
        { id: 'a', elo: 1200, rank: 1 },
        { id: 'b', elo: 1000, rank: 2 },
        { id: 'c', elo: 800, rank: 3 },
      ];
      const result = calculatePairwiseDeltas(players);
      const totalDelta = result.reduce((sum, r) => sum + r.delta, 0);
      expect(Math.abs(totalDelta)).toBeLessThanOrEqual(1); // rounding tolerance
    });

    test('higher ranked player with lower ELO gains more', () => {
      const players: RankedPlayer[] = [
        { id: 'underdog', elo: 800, rank: 1 },
        { id: 'favorite', elo: 1200, rank: 2 },
      ];
      const result = calculatePairwiseDeltas(players);
      const underdog = result.find(r => r.id === 'underdog')!;

      // Underdog beating favorite should gain significant ELO
      expect(underdog.delta).toBeGreaterThan(16);
    });

    test('ties produce smaller deltas than wins', () => {
      const playersWin: RankedPlayer[] = [
        { id: 'a', elo: 1000, rank: 1 },
        { id: 'b', elo: 1000, rank: 2 },
      ];
      const playersTie: RankedPlayer[] = [
        { id: 'a', elo: 1000, rank: 1 },
        { id: 'b', elo: 1000, rank: 1 },
      ];
      const winResult = calculatePairwiseDeltas(playersWin);
      const tieResult = calculatePairwiseDeltas(playersTie);

      expect(Math.abs(winResult[0].delta)).toBeGreaterThan(Math.abs(tieResult[0].delta));
    });

    test('respects custom K factor', () => {
      const players: RankedPlayer[] = [
        { id: 'a', elo: 1000, rank: 1 },
        { id: 'b', elo: 1000, rank: 2 },
      ];
      const resultK32 = calculatePairwiseDeltas(players, 32);
      const resultK64 = calculatePairwiseDeltas(players, 64);

      expect(Math.abs(resultK64[0].delta)).toBeGreaterThan(Math.abs(resultK32[0].delta));
    });
  });

  // ── calcAvgOpponentDelta ─────────────────────────────────────────────────
  describe('calcAvgOpponentDelta', () => {
    test('returns 0 for single participant', () => {
      expect(calcAvgOpponentDelta(1000, 1, 1, 1000)).toBe(0);
    });

    test('first place gains ELO with equal ratings', () => {
      const delta = calcAvgOpponentDelta(1000, 1, 5, 1000);
      expect(delta).toBeGreaterThan(0);
    });

    test('last place loses ELO with equal ratings', () => {
      const delta = calcAvgOpponentDelta(1000, 5, 5, 1000);
      expect(delta).toBeLessThan(0);
    });

    test('underdog winning gains more than favorite winning', () => {
      const underdogWin = calcAvgOpponentDelta(800, 1, 5, 1200);
      const favoriteWin = calcAvgOpponentDelta(1200, 1, 5, 800);
      expect(underdogWin).toBeGreaterThan(favoriteWin);
    });

    test('uses default K=48', () => {
      const withDefault = calcAvgOpponentDelta(1000, 1, 3, 1000);
      const withExplicit = calcAvgOpponentDelta(1000, 1, 3, 1000, 48);
      expect(withDefault).toBe(withExplicit);
    });

    test('higher K produces larger deltas', () => {
      const k32 = calcAvgOpponentDelta(1000, 1, 5, 1000, 32);
      const k48 = calcAvgOpponentDelta(1000, 1, 5, 1000, 48);
      expect(Math.abs(k48)).toBeGreaterThan(Math.abs(k32));
    });
  });
});
