import { computeMaxScore } from '../utils/computeMaxScore';

describe('computeMaxScore', () => {
  // ── Guard clauses ─────────────────────────────────────────────────────────
  describe('null guards', () => {
    it('returns null when wodType is null', () => {
      expect(computeMaxScore(null, '10 Burpees', 600, null, 'reps')).toBeNull();
    });

    it('returns null when description is null', () => {
      expect(computeMaxScore('amrap', null, 600, null, 'reps')).toBeNull();
    });

    it('returns null for For Time WOD', () => {
      expect(computeMaxScore('for time', '10 Burpees', 600, null, 'time')).toBeNull();
    });

    it('returns null for unknown WOD type', () => {
      expect(computeMaxScore('strength', '5 Deadlifts', 600, null, 'weight')).toBeNull();
    });
  });

  // ── AMRAP ─────────────────────────────────────────────────────────────────
  describe('AMRAP', () => {
    it('returns null when timeCapSeconds is null', () => {
      expect(computeMaxScore('amrap', '10 Burpees', null, null, 'reps')).toBeNull();
    });

    it('returns null when timeCapSeconds is 0', () => {
      expect(computeMaxScore('amrap', '10 Burpees', 0, null, 'reps')).toBeNull();
    });

    it('caps reps by both time and rounds formula', () => {
      // 300s, 10 reps/round → capByTime=ceil(300*1.5)=450, capByRounds=10*ceil(5*5)=250 → min=250
      const result = computeMaxScore('amrap', '10 Burpees', 300, null, 'reps');
      expect(result).toBe(250);
    });

    it('uses only time cap when no movements parseable', () => {
      // capByTime = ceil(300 * 1.5) = 450
      const result = computeMaxScore('amrap', 'AMRAP :', 300, null, 'reps');
      expect(result).toBe(Math.ceil(300 * 1.5));
    });

    it('scores in rounds mode', () => {
      // 600s → ceil(10 * 5) = 50 max rounds
      const result = computeMaxScore('amrap', '10 Burpees', 600, null, 'rounds');
      expect(result).toBe(50);
    });

    it('is case-insensitive for wod type', () => {
      const r1 = computeMaxScore('AMRAP', '10 Burpees', 300, null, 'reps');
      const r2 = computeMaxScore('amrap', '10 Burpees', 300, null, 'reps');
      expect(r1).toBe(r2);
    });
  });

  // ── EMOM ─────────────────────────────────────────────────────────────────
  describe('EMOM', () => {
    it('returns null when neither rounds nor timeCapSeconds given', () => {
      expect(computeMaxScore('emom', '10 Burpees', null, null, 'reps')).toBeNull();
    });

    it('returns null when rounds is 0', () => {
      expect(computeMaxScore('emom', '10 Burpees', null, 0, 'reps')).toBeNull();
    });

    it('scores in rounds mode = totalMinutes from rounds', () => {
      expect(computeMaxScore('emom', '10 Burpees', null, 10, 'rounds')).toBe(10);
    });

    it('scores in rounds mode derived from timeCapSeconds', () => {
      // 600s → ceil(600/60) = 10 minutes = 10 rounds
      expect(computeMaxScore('emom', '10 Burpees', 600, null, 'rounds')).toBe(10);
    });

    it('computes max reps = repsPerRound * rounds * 2', () => {
      // 10 rounds, 10 reps/round → 10 * 10 * 2 = 200
      expect(computeMaxScore('emom', '10 Burpees', null, 10, 'reps')).toBe(200);
    });

    it('falls back to time-based reps when no movements parseable', () => {
      // 600s → ceil(10 * 60 * 1.5) for fallback
      const result = computeMaxScore('emom', 'EMOM :', 600, null, 'reps');
      expect(result).toBe(Math.ceil(10 * 60 * 1.5));
    });
  });

  // ── Tabata ────────────────────────────────────────────────────────────────
  describe('Tabata', () => {
    it('returns 8 rounds for rounds scoring', () => {
      expect(computeMaxScore('tabata', '5 Thrusters', null, null, 'rounds')).toBe(8);
    });

    it('caps reps with min(280, repsPerRound * 8 * 3)', () => {
      // 5 reps/round → min(280, 5*8*3) = min(280, 120) = 120
      expect(computeMaxScore('tabata', '5 Thrusters', null, null, 'reps')).toBe(120);
    });

    it('returns 280 when reps per round is very high', () => {
      // 15 reps/round → min(280, 15*8*3) = min(280, 360) = 280
      expect(computeMaxScore('tabata', '15 Thrusters', null, null, 'reps')).toBe(280);
    });

    it('returns 280 when description has no parseable movements', () => {
      expect(computeMaxScore('tabata', 'Tabata :', null, null, 'reps')).toBe(280);
    });
  });
});
