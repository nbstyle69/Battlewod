import {
  formatScoreValue, DNF_BASE, mapForTimeScore, normalizeScore, compareScores,
} from '../utils/scoreFormat';

describe('scoreFormat utilities', () => {
  // ── DNF_BASE ─────────────────────────────────────────────────────────────
  test('DNF_BASE is 999999', () => {
    expect(DNF_BASE).toBe(999999);
  });

  // ── Time formatting ──────────────────────────────────────────────────────
  describe('formatScoreValue — time', () => {
    test('formats seconds into MM:SS', () => {
      expect(formatScoreValue(90, 'time')).toBe('01:30');
      expect(formatScoreValue(0, 'time')).toBe('00:00');
      expect(formatScoreValue(3661, 'time')).toBe('61:01');
    });

    test('pads single digit minutes and seconds', () => {
      expect(formatScoreValue(5, 'time')).toBe('00:05');
      expect(formatScoreValue(65, 'time')).toBe('01:05');
    });

    test('formats DNF as CAP + reps', () => {
      expect(formatScoreValue(DNF_BASE + 42, 'time')).toBe('CAP + 42 reps');
      expect(formatScoreValue(DNF_BASE + 0, 'time')).toBe('CAP + 0 reps');
    });

    test('rounds fractional seconds', () => {
      expect(formatScoreValue(90.7, 'time')).toBe('01:31');
    });
  });

  // ── Reps formatting ──────────────────────────────────────────────────────
  describe('formatScoreValue — reps', () => {
    test('appends reps unit', () => {
      expect(formatScoreValue(150, 'reps')).toBe('150 reps');
    });

    test('handles zero', () => {
      expect(formatScoreValue(0, 'reps')).toBe('0 reps');
    });
  });

  // ── Weight formatting ────────────────────────────────────────────────────
  describe('formatScoreValue — weight', () => {
    test('appends kg unit', () => {
      expect(formatScoreValue(100, 'weight')).toBe('100 kg');
    });
  });

  // ── Rounds formatting ───────────────────────────────────────────────────
  describe('formatScoreValue — rounds', () => {
    test('appends rnds unit', () => {
      expect(formatScoreValue(5, 'rounds')).toBe('5 rnds');
    });
  });

  // ── Unknown type ─────────────────────────────────────────────────────────
  describe('formatScoreValue — unknown type', () => {
    test('returns raw value without unit', () => {
      expect(formatScoreValue(42, 'custom')).toBe('42');
    });
  });

  // ── capped ───────────────────────────────────────────────────────────────
  describe('mapForTimeScore', () => {
    test('finisher → secondes, capped false', () => {
      expect(mapForTimeScore({ capped: false, minutes: 12, seconds: 30 }))
        .toEqual({ score_value: 750, capped: false });
      expect(mapForTimeScore({ capped: false, minutes: 0, seconds: 0 }))
        .toEqual({ score_value: 0, capped: false });
    });

    test('capped → reps, capped true (jamais un temps)', () => {
      expect(mapForTimeScore({ capped: true, reps: 42 }))
        .toEqual({ score_value: 42, capped: true });
    });
  });

  describe('normalizeScore', () => {
    test('laisse passer la convention actuelle', () => {
      expect(normalizeScore(750, false, true)).toEqual({ value: 750, capped: false });
      expect(normalizeScore(42, true, true)).toEqual({ value: 42, capped: true });
    });

    test('ramène l\'encodage hérité DNF_BASE + reps', () => {
      expect(normalizeScore(DNF_BASE + 8, false, true)).toEqual({ value: 8, capped: true });
    });

    test('hors for-time, capped est neutralisé', () => {
      expect(normalizeScore(150, true, false)).toEqual({ value: 150, capped: false });
    });
  });

  describe('formatScoreValue — capped', () => {
    test('affiche CAP + reps sur le drapeau', () => {
      expect(formatScoreValue(42, 'time', true)).toBe('CAP + 42 reps');
    });

    test('affiche un temps sans le drapeau', () => {
      expect(formatScoreValue(42, 'time', false)).toBe('00:42');
    });
  });

  describe('compareScores — miroir de l\'ORDER BY serveur', () => {
    const s = (v: number, capped: boolean, rx = true) => ({ rx, score_value: v, capped });

    test('for-time : finishers avant cappés, temps croissant, reps décroissantes', () => {
      const rows = [
        s(31, true),   // CAP + 31
        s(600, false), // 10:00
        s(8, true),    // CAP + 8
        s(420, false), // 7:00
        s(540, false), // 9:00
      ];
      expect([...rows].sort((a, b) => compareScores(a, b, true)).map(r => r.score_value))
        .toEqual([420, 540, 600, 31, 8]);
    });

    test('for-time : l\'encodage hérité se classe comme un cappé', () => {
      const rows = [s(DNF_BASE + 31, false), s(600, false), s(8, true)];
      expect([...rows].sort((a, b) => compareScores(a, b, true)).map(r => r.score_value))
        .toEqual([600, DNF_BASE + 31, 8]);
    });

    test('rx passe devant scaled, capped compris', () => {
      const rows = [s(10, true, false), s(999, false, false), s(5, true, true)];
      expect([...rows].sort((a, b) => compareScores(a, b, true)).map(r => r.score_value))
        .toEqual([5, 999, 10]);
    });

    test('AMRAP inchangé : reps décroissantes, capped ignoré', () => {
      const rows = [s(100, false), s(150, false), s(120, true)];
      expect([...rows].sort((a, b) => compareScores(a, b, false)).map(r => r.score_value))
        .toEqual([150, 120, 100]);
    });

    test('ex aequo : ordre stable, comparateur nul', () => {
      expect(compareScores(s(20, true), s(20, true), true)).toBe(0);
    });
  });
});
