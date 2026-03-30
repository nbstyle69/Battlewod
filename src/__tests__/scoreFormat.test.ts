import { formatScoreValue, DNF_BASE } from '../utils/scoreFormat';

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
});
