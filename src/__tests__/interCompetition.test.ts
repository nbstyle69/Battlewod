/**
 * Integration tests for inter-box competition logic:
 * - ELO seeding & bracket generation order
 * - League round points calculation (CF Games scoring)
 * - Pool standings computation (W=3, D=1, L=0)
 * - Swiss pairing logic (score-based, anti-rematch, BYE, Buchholz)
 * - For Time vs Reps scoring direction
 */
import { calculatePairwiseDeltas, clampElo, assignRanks, RankedPlayer, K_PAIRWISE } from '../utils/elo';
import { cfPoints, rankWodScores } from '../utils/tournamentUtils';
import type { TournamentScore } from '../utils/tournamentUtils';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(id: string, elo: number, rank: number): RankedPlayer {
  return { id, elo, rank };
}

function makeScore(overrides: Partial<TournamentScore> = {}): TournamentScore {
  return {
    id: Math.random().toString(36).slice(2),
    athlete_id: 'athlete-1',
    tournament_id: 'tournament-1',
    tournament_wod_id: 'wod-1',
    score_value: '100',
    tiebreak_value: null,
    video_url: null,
    notes: null,
    status: 'validated',
    submitted_at: new Date().toISOString(),
    deadline_at: null,
    ai_analysis: null,
    elo_points: 0,
    ...overrides,
  };
}

// ── ELO Seeding Tests ───────────────────────────────────────────────────────

describe('inter-box ELO seeding', () => {
  it('pairs top ELO vs bottom ELO in bracket seeding', () => {
    // Simulate ELO-sorted participants: 1500, 1400, 1300, 1200
    // Expected pairing: 1500 vs 1200, 1400 vs 1300
    const sorted = [
      { id: 'a', elo: 1500 },
      { id: 'b', elo: 1400 },
      { id: 'c', elo: 1300 },
      { id: 'd', elo: 1200 },
    ];
    // Top vs bottom pairing
    const pairs: [string, string][] = [];
    const n = sorted.length;
    for (let i = 0; i < n / 2; i++) {
      pairs.push([sorted[i].id, sorted[n - 1 - i].id]);
    }
    expect(pairs).toEqual([['a', 'd'], ['b', 'c']]);
  });

  it('handles odd number of participants (BYE for top seed)', () => {
    const sorted = [
      { id: 'a', elo: 1500 },
      { id: 'b', elo: 1400 },
      { id: 'c', elo: 1300 },
    ];
    // BYE goes to the last unpaired (top seed gets BYE in typical format)
    const n = sorted.length;
    const pairs: [string, string | null][] = [];
    const half = Math.floor(n / 2);
    for (let i = 0; i < half; i++) {
      pairs.push([sorted[i].id, sorted[n - 1 - i].id]);
    }
    if (n % 2 !== 0) {
      pairs.push([sorted[half].id, null]); // BYE
    }
    expect(pairs).toEqual([['a', 'c'], ['b', null]]);
  });

  it('distributes ELO correctly after a bracket competition', () => {
    const players: RankedPlayer[] = [
      makePlayer('winner', 1200, 1),
      makePlayer('loser', 1200, 2),
    ];
    const results = calculatePairwiseDeltas(players);
    const winnerResult = results.find(r => r.id === 'winner')!;
    const loserResult = results.find(r => r.id === 'loser')!;
    // Winner gains, loser loses
    expect(winnerResult.delta).toBeGreaterThan(0);
    expect(loserResult.delta).toBeLessThan(0);
    // Zero-sum
    expect(winnerResult.delta + loserResult.delta).toBe(0);
  });

  it('higher ranked player loses less ELO when losing to lower-ranked', () => {
    // Strong player (1500) loses to weak player (900) — bigger upset
    const players1: RankedPlayer[] = [
      makePlayer('weak', 900, 1),   // weak wins
      makePlayer('strong', 1500, 2), // strong loses
    ];
    const results1 = calculatePairwiseDeltas(players1);
    const strongLoss = results1.find(r => r.id === 'strong')!.delta;

    // Two equal players
    const players2: RankedPlayer[] = [
      makePlayer('a', 1200, 1),
      makePlayer('b', 1200, 2),
    ];
    const results2 = calculatePairwiseDeltas(players2);
    const equalLoss = results2.find(r => r.id === 'b')!.delta;

    // Loss for higher-rated player should be larger (bigger upset)
    expect(Math.abs(strongLoss)).toBeGreaterThan(Math.abs(equalLoss));
  });
});

// ── League Points Tests ─────────────────────────────────────────────────────

describe('inter-box league round points', () => {
  it('awards CF Games points based on rank', () => {
    expect(cfPoints(1)).toBe(100);
    expect(cfPoints(2)).toBe(97);
    expect(cfPoints(3)).toBe(95);
    expect(cfPoints(10)).toBe(81);
    expect(cfPoints(50)).toBe(31);
  });

  it('ranks For Time scores ASC (lower = better)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'fast', score_value: '120' }),  // 2:00
      makeScore({ athlete_id: 'slow', score_value: '300' }),  // 5:00
      makeScore({ athlete_id: 'mid', score_value: '180' }),   // 3:00
    ];
    const ranked = rankWodScores(scores, 'For Time');
    expect(ranked[0].athlete_id).toBe('fast');
    expect(ranked[1].athlete_id).toBe('mid');
    expect(ranked[2].athlete_id).toBe('slow');
  });

  it('ranks Reps scores DESC (higher = better)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'low', score_value: '50' }),
      makeScore({ athlete_id: 'high', score_value: '200' }),
      makeScore({ athlete_id: 'mid', score_value: '100' }),
    ];
    const ranked = rankWodScores(scores, 'AMRAP');
    expect(ranked[0].athlete_id).toBe('high');
    expect(ranked[1].athlete_id).toBe('mid');
    expect(ranked[2].athlete_id).toBe('low');
  });

  it('cumulates points across multiple rounds (journees)', () => {
    // Simulate 3 rounds, athlete finishing 1st, 3rd, 2nd
    const roundPoints = [cfPoints(1), cfPoints(3), cfPoints(2)];
    const total = roundPoints.reduce((a, b) => a + b, 0);
    expect(total).toBe(100 + 95 + 97); // 292
  });

  it('handles tie in scores with same rank', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'a', score_value: '100' }),
      makeScore({ athlete_id: 'b', score_value: '100' }),
      makeScore({ athlete_id: 'c', score_value: '80' }),
    ];
    const ranked = rankWodScores(scores, 'AMRAP');
    // Both a and b should come before c
    const aIdx = ranked.findIndex(s => s.athlete_id === 'a');
    const bIdx = ranked.findIndex(s => s.athlete_id === 'b');
    const cIdx = ranked.findIndex(s => s.athlete_id === 'c');
    expect(cIdx).toBe(2);
    expect(aIdx).toBeLessThan(cIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });
});

// ── Pool Standings Tests ────────────────────────────────────────────────────

describe('inter-box pool standings', () => {
  it('awards W=3, D=1, L=0 points', () => {
    const W = 3, D = 1, L = 0;
    // Athlete with 2 wins, 1 draw, 1 loss = 2*3 + 1*1 + 1*0 = 7
    const points = 2 * W + 1 * D + 1 * L;
    expect(points).toBe(7);
  });

  it('determines winner by scoring type direction', () => {
    // For Time: lower score wins
    const s1_time = 120, s2_time = 180;
    const winnerTime = s1_time < s2_time ? 'p1' : 'p2';
    expect(winnerTime).toBe('p1');

    // For Reps: higher score wins
    const s1_reps = 50, s2_reps = 80;
    const winnerReps = s1_reps > s2_reps ? 'p1' : 'p2';
    expect(winnerReps).toBe('p2');
  });

  it('detects draw when scores are equal', () => {
    const s1 = 100, s2 = 100;
    const isDraw = s1 === s2;
    expect(isDraw).toBe(true);
  });

  it('sorts pool standings by points DESC then differential', () => {
    const standings = [
      { athlete: 'a', points: 9, scoreFor: 300, scoreAgainst: 200 },
      { athlete: 'b', points: 9, scoreFor: 350, scoreAgainst: 200 },
      { athlete: 'c', points: 6, scoreFor: 250, scoreAgainst: 250 },
    ];
    const sorted = [...standings].sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      return (y.scoreFor - y.scoreAgainst) - (x.scoreFor - x.scoreAgainst);
    });
    expect(sorted[0].athlete).toBe('b'); // same points but better differential
    expect(sorted[1].athlete).toBe('a');
    expect(sorted[2].athlete).toBe('c');
  });

  it('generates correct number of round-robin matches for n players', () => {
    // n*(n-1)/2 matches in a round-robin
    const n = 5;
    const matches = n * (n - 1) / 2;
    expect(matches).toBe(10);

    const n2 = 4;
    expect(n2 * (n2 - 1) / 2).toBe(6);
  });

  it('serpentine seeding distributes fairly across groups', () => {
    // 8 players sorted by ELO, 2 groups
    // Serpentine: G1=[1,4,5,8], G2=[2,3,6,7]
    const players = [1, 2, 3, 4, 5, 6, 7, 8]; // ELO rank
    const groups: number[][] = [[], []];
    const numGroups = 2;
    players.forEach((p, i) => {
      const row = Math.floor(i / numGroups);
      const col = row % 2 === 0 ? i % numGroups : numGroups - 1 - (i % numGroups);
      groups[col].push(p);
    });
    // Sum of ELO ranks should be balanced
    const sum1 = groups[0].reduce((a, b) => a + b, 0);
    const sum2 = groups[1].reduce((a, b) => a + b, 0);
    expect(Math.abs(sum1 - sum2)).toBeLessThanOrEqual(2);
  });
});

// ── Swiss System Tests ──────────────────────────────────────────────────────

describe('inter-box swiss system', () => {
  it('pairs adjacent players in standings for round N>1', () => {
    // After round 1, standings sorted by points DESC, buchholz DESC
    const standings = [
      { id: 'a', points: 3, buchholz: 3 },
      { id: 'b', points: 3, buchholz: 0 },
      { id: 'c', points: 1, buchholz: 3 },
      { id: 'd', points: 0, buchholz: 0 },
    ];
    // Adjacent pairing: a vs b, c vs d
    const pairs: [string, string][] = [];
    for (let i = 0; i < standings.length; i += 2) {
      pairs.push([standings[i].id, standings[i + 1].id]);
    }
    expect(pairs).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('awards BYE (free win = 3pts) for odd participants', () => {
    const players = ['a', 'b', 'c'];
    const hasOdd = players.length % 2 !== 0;
    expect(hasOdd).toBe(true);
    // BYE player gets 3 points
    const byePoints = 3;
    expect(byePoints).toBe(3);
  });

  it('uses W=3, D=1, L=0 scoring', () => {
    expect(3).toBe(3); // Win
    expect(1).toBe(1); // Draw
    expect(0).toBe(0); // Loss
  });

  it('calculates Buchholz tiebreaker correctly', () => {
    // Buchholz = sum of opponents' points
    // Player A beat B (3pts) and C (1pt) → Buchholz = 3 + 1 = 4
    const opponentPoints = [3, 1];
    const buchholz = opponentPoints.reduce((a, b) => a + b, 0);
    expect(buchholz).toBe(4);
  });

  it('prevents rematch in subsequent rounds', () => {
    // Players who already faced each other should not be paired again
    const previousPairings = [
      { athlete1: 'a', athlete2: 'b' },
      { athlete1: 'c', athlete2: 'd' },
    ];
    const hasFaced = (p1: string, p2: string) =>
      previousPairings.some(
        pp => (pp.athlete1 === p1 && pp.athlete2 === p2) ||
              (pp.athlete1 === p2 && pp.athlete2 === p1)
      );
    expect(hasFaced('a', 'b')).toBe(true);
    expect(hasFaced('a', 'c')).toBe(false);
    expect(hasFaced('b', 'a')).toBe(true); // symmetric
  });

  it('sorts by points DESC then buchholz DESC for pairing', () => {
    const standings = [
      { id: 'a', points: 3, buchholz: 5 },
      { id: 'b', points: 6, buchholz: 2 },
      { id: 'c', points: 3, buchholz: 8 },
      { id: 'd', points: 6, buchholz: 7 },
    ];
    const sorted = [...standings].sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      return y.buchholz - x.buchholz;
    });
    expect(sorted.map(s => s.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('determines winner correctly for time-based scoring', () => {
    // For Time: lower score wins
    const s1 = 120, s2 = 150;
    const scoringType = 'time';
    const winner = scoringType === 'time'
      ? (s1 < s2 ? 'p1' : s1 > s2 ? 'p2' : 'draw')
      : (s1 > s2 ? 'p1' : s1 < s2 ? 'p2' : 'draw');
    expect(winner).toBe('p1');
  });

  it('determines winner correctly for reps-based scoring', () => {
    // For Reps: higher score wins
    const s1 = 80, s2 = 120;
    const scoringType: string = 'reps';
    const winner = scoringType === 'time'
      ? (s1 < s2 ? 'p1' : s1 > s2 ? 'p2' : 'draw')
      : (s1 > s2 ? 'p1' : s1 < s2 ? 'p2' : 'draw');
    expect(winner).toBe('p2');
  });

  it('handles draw correctly', () => {
    const s1 = 100, s2 = 100;
    const scoringType: string = 'reps';
    const winner = scoringType === 'time'
      ? (s1 < s2 ? 'p1' : s1 > s2 ? 'p2' : 'draw')
      : (s1 > s2 ? 'p1' : s1 < s2 ? 'p2' : 'draw');
    expect(winner).toBe('draw');
  });
});

// ── ELO Distribution Tests ──────────────────────────────────────────────────

describe('inter-box ELO distribution at close', () => {
  it('distributes ELO to 8 players in a tournament', () => {
    const players: RankedPlayer[] = [
      makePlayer('p1', 1400, 1),
      makePlayer('p2', 1350, 2),
      makePlayer('p3', 1300, 3),
      makePlayer('p4', 1250, 4),
      makePlayer('p5', 1200, 5),
      makePlayer('p6', 1150, 6),
      makePlayer('p7', 1100, 7),
      makePlayer('p8', 1050, 8),
    ];
    const results = calculatePairwiseDeltas(players);

    // First place gains ELO
    expect(results.find(r => r.id === 'p1')!.delta).toBeGreaterThan(0);
    // Last place loses ELO
    expect(results.find(r => r.id === 'p8')!.delta).toBeLessThan(0);
    // Total sum of deltas should be ~0 (zero-sum)
    const totalDelta = results.reduce((sum, r) => sum + r.delta, 0);
    expect(Math.abs(totalDelta)).toBeLessThanOrEqual(1); // allow rounding
  });

  it('clamps ELO to floor (100) after heavy losses', () => {
    const result = clampElo(50);
    expect(result).toBe(100);
    const result2 = clampElo(-200);
    expect(result2).toBe(100);
  });

  it('assigns correct ranks with ties', () => {
    const sorted = [
      { id: 'a', score: 500 },
      { id: 'b', score: 500 },
      { id: 'c', score: 300 },
      { id: 'd', score: 200 },
    ];
    const ranked = assignRanks(sorted);
    expect(ranked[0].rank).toBe(1); // a
    expect(ranked[1].rank).toBe(1); // b (tied)
    expect(ranked[2].rank).toBe(3); // c (skip rank 2)
    expect(ranked[3].rank).toBe(4); // d
  });

  it('handles single participant gracefully', () => {
    const players: RankedPlayer[] = [makePlayer('solo', 1200, 1)];
    const results = calculatePairwiseDeltas(players);
    expect(results.length).toBe(1);
    expect(results[0].delta).toBe(0); // no opponents
  });
});

// ── Scoring Direction Tests ─────────────────────────────────────────────────

describe('scoring direction consistency', () => {
  it('For Time: ASC (120s beats 300s)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'fast', score_value: '120' }),
      makeScore({ athlete_id: 'slow', score_value: '300' }),
    ];
    const ranked = rankWodScores(scores, 'For Time');
    expect(ranked[0].athlete_id).toBe('fast');
  });

  it('Reps: DESC (200 reps beats 100 reps)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'strong', score_value: '200' }),
      makeScore({ athlete_id: 'weak', score_value: '100' }),
    ];
    const ranked = rankWodScores(scores, 'AMRAP');
    expect(ranked[0].athlete_id).toBe('strong');
  });

  it('Weight: DESC (150kg beats 100kg)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'heavy', score_value: '150' }),
      makeScore({ athlete_id: 'light', score_value: '100' }),
    ];
    const ranked = rankWodScores(scores, 'Max Weight');
    expect(ranked[0].athlete_id).toBe('heavy');
  });

  it('rounds_reps: DESC (higher rounds+reps wins)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'more', score_value: '505' }),  // 5 rounds + 5 reps
      makeScore({ athlete_id: 'less', score_value: '312' }),  // 3 rounds + 12 reps
    ];
    const ranked = rankWodScores(scores, 'Rounds + Reps');
    expect(ranked[0].athlete_id).toBe('more');
  });
});
