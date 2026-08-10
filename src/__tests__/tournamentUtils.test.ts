import {
  cfPoints,
  CF_GAMES_POINTS,
  normalizeMovement,
  rankWodScores,
  formatDate,
  isRepsScoredType,
  repsPerRoundFromMovements,
  amrapTotalToRoundsReps,
  roundsRepsToTotal,
  formatAmrapScore,
  isTimeScoredType,
  timeStringToSeconds,
  secondsToTimeString,
  maskTimeInput,
  parseScoreToNumber,
  formatScoreDisplay,
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
    const r = normalizeMovement('5 deadlifts');
    expect(r.key).toBe('deadlift');
  });

  // Toutes ces lignes existent telles quelles dans les WOD de tournoi en base :
  // chaque variante d'écriture donnait sa propre clé, donc son propre compteur.
  it('collapses plural and hyphenated spellings onto one key', () => {
    const cases: [string, string][] = [
      ['Pull-ups', 'pull_up'],          ['Pull Up', 'pull_up'],
      ['Air Squats', 'air_squat'],      ['Wall Balls', 'wall_ball'],
      ['Toes-to-bar', 'toes_to_bar'],   ['Handstand Push-ups', 'hspu'],
      ['HSPU Stricts', 'hspu'],         ['Box Jumps', 'box_jump'],
      ['DB Thrusters', 'db_thruster'],  ['KB Thrusters', 'kb_thruster'],
      ['Sit-ups', 'sit_up'],            ['Double Unders', 'double_under'],
      ['Kettlebell Swings', 'kb_swing'], ['Wall Walks', 'wall_walk'],
      ['Squat Cleans', 'clean'],        ['Power Clean', 'clean'],
      ['Push Press', 'press'],          ['Shoulder to OH', 'press'],
      ['Cal Row', 'row'],               ['Cal Assault Bike', 'bike'],
      ['Chest-to-Bar Pull-ups', 'chest_to_bar'],
      ['Sumo Deadlift High Pull', 'sdlhp'],
      ['DB Snatches alt.', 'db_snatch'],
    ];
    cases.forEach(([raw, key]) => expect(normalizeMovement(raw).key).toBe(key));
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

    it('ranks every finisher ahead of every capped attempt, capped by reps desc', () => {
      const scores = [
        makeScore({ id: 'cap_low', score_value: '8', capped: true }),
        makeScore({ id: 'fin_slow', score_value: '600' }),
        makeScore({ id: 'cap_high', score_value: '31', capped: true }),
        makeScore({ id: 'fin_fast', score_value: '420' }),
      ];
      const result = rankWodScores(scores, 'For Time');
      expect(result.map((r) => r.id)).toEqual(['fin_fast', 'fin_slow', 'cap_high', 'cap_low']);
    });

    it('shares the rank between two capped athletes with the same reps', () => {
      const scores = [
        makeScore({ id: 'fin', score_value: '420' }),
        makeScore({ id: 'cap_a', score_value: '31', capped: true }),
        makeScore({ id: 'cap_b', score_value: '31', capped: true }),
        makeScore({ id: 'cap_c', score_value: '8', capped: true }),
      ];
      const result = rankWodScores(scores, 'For Time');
      expect(result.find((r) => r.id === 'cap_a')?.rank).toBe(2);
      expect(result.find((r) => r.id === 'cap_b')?.rank).toBe(2);
      expect(result.find((r) => r.id === 'cap_c')?.rank).toBe(4);
    });

    it('does not tie a capped athlete with a finisher sharing the same score_value', () => {
      const scores = [
        makeScore({ id: 'fin', score_value: '100' }),
        makeScore({ id: 'cap', score_value: '100', capped: true }),
      ];
      const result = rankWodScores(scores, 'For Time');
      expect(result.find((r) => r.id === 'fin')?.rank).toBe(1);
      expect(result.find((r) => r.id === 'cap')?.rank).toBe(2);
      expect(result.every((r) => !r.isExAequo)).toBe(true);
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

describe('AMRAP / Max Reps score normalization', () => {
  const wod = ['10 Thruster (43/30 kg)', '12 Pull-ups', '15 Box jump'];

  it('detects reps-scored WOD types', () => {
    expect(isRepsScoredType('AMRAP')).toBe(true);
    expect(isRepsScoredType('Max Reps')).toBe(true);
    expect(isRepsScoredType('For Time')).toBe(false);
    expect(isRepsScoredType(null)).toBe(false);
  });

  it('sums reps per round from movements', () => {
    expect(repsPerRoundFromMovements(wod)).toBe(37);
    expect(repsPerRoundFromMovements([])).toBe(0);
    expect(repsPerRoundFromMovements(null)).toBe(0);
  });

  it('gives the SAME stored total whether entered as "1 round" or "37 reps"', () => {
    const viaRounds = roundsRepsToTotal(1, 0, 37); // "1 round"
    const viaTotal  = 37;                          // "37 reps"
    expect(viaRounds).toBe(viaTotal);
  });

  it('converts total reps <-> rounds+reps consistently', () => {
    expect(roundsRepsToTotal(3, 12, 37)).toBe(123);
    expect(amrapTotalToRoundsReps(123, 37)).toEqual({ rounds: 3, reps: 12 });
  });

  it('falls back to raw total when reps-per-round is unknown', () => {
    expect(amrapTotalToRoundsReps(50, 0)).toEqual({ rounds: 0, reps: 50 });
    expect(formatAmrapScore(50, 0)).toBe('50 reps');
  });

  it('formats the recap label', () => {
    expect(formatAmrapScore(123, 37)).toBe('123 reps (3 tours + 12)');
    expect(formatAmrapScore(37, 37)).toBe('37 reps (1 tour)');
  });

  it('ranks equivalent submissions equally (both stored as total reps)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'a', score_value: '37', status: 'validated' }),   // "1 round"
      makeScore({ athlete_id: 'b', score_value: '37', status: 'validated' }),   // "37 reps"
      makeScore({ athlete_id: 'c', score_value: '123', status: 'validated' }),  // "3 rounds + 12"
    ];
    const ranked = rankWodScores(scores, 'AMRAP');
    const c = ranked.find(r => r.athlete_id === 'c')!;
    const a = ranked.find(r => r.athlete_id === 'a')!;
    const b = ranked.find(r => r.athlete_id === 'b')!;
    expect(c.rank).toBe(1);          // highest total wins for AMRAP
    expect(a.rank).toBe(b.rank);     // equal totals -> equal rank
  });
});

describe('For Time score normalization', () => {
  it('detects time-scored WOD types', () => {
    expect(isTimeScoredType('For Time')).toBe(true);
    expect(isTimeScoredType('for-time')).toBe(true);
    expect(isTimeScoredType('AMRAP')).toBe(false);
    expect(isTimeScoredType(null)).toBe(false);
  });

  it('parses mm:ss into total seconds', () => {
    expect(timeStringToSeconds('12:30')).toBe(750);
    expect(timeStringToSeconds('0:05')).toBe(5);
    expect(timeStringToSeconds('1:05:30')).toBe(3930);
  });

  it('handles numeric and malformed input without throwing', () => {
    expect(timeStringToSeconds(90)).toBe(90);
    expect(timeStringToSeconds('')).toBe(0);
    expect(timeStringToSeconds(null)).toBe(0);
    expect(timeStringToSeconds('abc')).toBe(0);
  });

  it('formats seconds back to mm:ss / h:mm:ss', () => {
    expect(secondsToTimeString(750)).toBe('12:30');
    expect(secondsToTimeString(5)).toBe('0:05');
    expect(secondsToTimeString(3930)).toBe('1:05:30');
  });

  it('round-trips mm:ss through parse/format', () => {
    expect(secondsToTimeString(timeStringToSeconds('12:30'))).toBe('12:30');
  });

  it('masks raw digits into mm:ss right-to-left', () => {
    expect(maskTimeInput('1234')).toBe('12:34');
    expect(maskTimeInput('5')).toBe('0:05');
    expect(maskTimeInput('130')).toBe('1:30');
    expect(maskTimeInput('')).toBe('');
    expect(maskTimeInput('12a34')).toBe('12:34');
  });

  it('ranks lower time first for For Time (canonical seconds)', () => {
    const scores: TournamentScore[] = [
      makeScore({ athlete_id: 'slow', score_value: '750', status: 'validated' }), // 12:30
      makeScore({ athlete_id: 'fast', score_value: '300', status: 'validated' }), // 5:00
    ];
    const ranked = rankWodScores(scores, 'For Time');
    expect(ranked.find(r => r.athlete_id === 'fast')!.rank).toBe(1);
  });
});

describe('parseScoreToNumber / formatScoreDisplay', () => {
  it('parses For Time scores as seconds and reps as numbers', () => {
    expect(parseScoreToNumber('12:30', 'For Time')).toBe(750);
    expect(parseScoreToNumber('123', 'AMRAP')).toBe(123);
  });

  it('displays For Time as mm:ss and AMRAP as a reps recap', () => {
    expect(formatScoreDisplay('750', 'For Time')).toBe('12:30');
    expect(formatScoreDisplay('123', 'AMRAP', 37)).toBe('123 reps (3 tours + 12)');
    expect(formatScoreDisplay('abc', 'Custom')).toBe('abc');
  });
});
