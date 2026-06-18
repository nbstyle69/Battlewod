import {
  cfPoints,
  CF_GAMES_POINTS,
  normalizeMovement,
  rankWodScores,
  formatDate,
} from '../utils/tournamentUtils';
import type { TournamentScore } from '../utils/tournamentUtils';

// ── Helper ────────────────────────────────────────────────────────────────────
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

// ── cfPoints ─────────────────────────────────────────────────────────────────
describe('cfPoints', () => {
  it('returns 0 for rank 0 or negative', () => {
    expect(cfPoints(0)).toBe(0);
    expect(cfPoints(-1)).toBe(0);
  });

  it('returns 100 for rank 1', () => {
    expect(cfPoints(1)).toBe(CF_GAMES_POINTS[0]);
    expect(cfPoints(1)).toBe(100);
  });

  it('returns 97 for rank 2', () => {
    expect(cfPoints(2)).toBe(97);
  });

  it('returns 81 for rank 10', () => {
    expect(cfPoints(10)).toBe(81);
  });

  it('returns 31 for rank 50 (last in table)', () => {
    expect(cfPoints(50)).toBe(31);
  });

  it('calculates points beyond table using fallback formula', () => {
    // rank 51 → max(1, 30 - (51 - 51)) = 30
    expect(cfPoints(51)).toBe(30);
    // rank 60 → max(1, 30 - (60 - 51)) = 21
    expect(cfPoints(60)).toBe(21);
    // rank 100 → max(1, 30 - 49) = 1
    expect(cfPoints(100)).toBe(1);
  });
});

// ── normalizeMovement ─────────────────────────────────────────────────────────
describe('normalizeMovement', () => {
  it('normalizes known movement — deadlift', () => {
    const r = normalizeMovement('deadlift');
    expect(r.key).toBe('deadlift');
    expect(r.label).toBe('Deadlift');
  });

  it('normalizes known movement — pull-up', () => {
    const r = normalizeMovement('pull-up');
    expect(r.key).toBe('pull_up');
    expect(r.label).toBe('Pull Up');
  });

  it('normalizes French alias — traction → pull_up', () => {
    const r = normalizeMovement('traction');
    expect(r.key).toBe('pull_up');
  });

  it('normalizes thruster', () => {
    const r = normalizeMovement('thruster');
    expect(r.key).toBe('thruster');
  });

  it('normalizes burpee', () => {
    const r = normalizeMovement('burpee');
    expect(r.key).toBe('burpee');
  });

  it('produces snake_case key for unknown movement', () => {
    const r = normalizeMovement('unknown move');
    expect(r.key).toBe('unknown_move');
    expect(r.label).toBe('Unknown Move');
  });

  it('strips digits from input before lookup', () => {
    // '5 deadlifts' → remove digits → 'deadlifts' → not in map → key 'deadlifts'
    const r = normalizeMovement('5 deadlifts');
    expect(r.key).toContain('deadlift');
  });
});

// ── rankWodScores ─────────────────────────────────────────────────────────────
describe('rankWodScores', () => {
  it('returns empty array for empty input', () => {
    expect(rankWodScores([], 'AMRAP')).toEqual([]);
  });

  it('filters out non-validated scores', () => {
    const scores = [
      makeScore({ score_value: '100', status: 'validated' }),
      makeScore({ score_value: '200', status: 'pending' }),
      makeScore({ score_value: '150', status: 'rejected' }),
    ];
    const result = rankWodScores(scores, 'AMRAP');
    expect(result).toHaveLength(1);
    expect(result[0].score_value).toBe('100');
  });

  describe('AMRAP — higher score is better', () => {
    it('ranks highest score first', () => {
      const scores = [
        makeScore({ id: 'a', score_value: '80' }),
        makeScore({ id: 'b', score_value: '150' }),
        makeScore({ id: 'c', score_value: '120' }),
      ];
      const result = rankWodScores(scores, 'AMRAP');
      expect(result[0].id).toBe('b');
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(3);
    });

    it('assigns same rank to tied scores', () => {
      const scores = [
        makeScore({ id: 'a', score_value: '100' }),
        makeScore({ id: 'b', score_value: '100' }),
        makeScore({ id: 'c', score_value: '80' }),
      ];
      const result = rankWodScores(scores, 'AMRAP');
      const ranked1 = result.filter((r) => r.rank === 1);
      expect(ranked1).toHaveLength(2);
      expect(result.find((r) => r.id === 'c')?.rank).toBe(3);
    });

    it('marks tied scores as isExAequo', () => {
      const scores = [
        makeScore({ id: 'a', score_value: '100' }),
        makeScore({ id: 'b', score_value: '100' }),
      ];
      const result = rankWodScores(scores, 'AMRAP');
      expect(result.every((r) => r.isExAequo)).toBe(true);
    });
  });

  describe('For Time — lower score is better', () => {
    it('ranks lowest time first', () => {
      const scores = [
        makeScore({ id: 'slow', score_value: '500' }),
        makeScore({ id: 'fast', score_value: '200' }),
        makeScore({ id: 'mid', score_value: '350' }),
      ];
      const result = rankWodScores(scores, 'For Time');
      expect(result[0].id).toBe('fast');
      expect(result[0].rank).toBe(1);
    });
  });

  it('assigns cfPoints to each ranked score', () => {
    const scores = [
      makeScore({ score_value: '150' }),
      makeScore({ score_value: '100' }),
    ];
    const result = rankWodScores(scores, 'AMRAP');
    expect(result[0].cfPoints).toBe(100); // rank 1
    expect(result[1].cfPoints).toBe(97);  // rank 2
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────
describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2026-01-15T10:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not throw for invalid input', () => {
    expect(() => formatDate('not-a-date')).not.toThrow();
    expect(typeof formatDate('not-a-date')).toBe('string');
  });
});
