import { getLevelFromElo, ELO_THRESHOLDS, LEVEL_BADGE_THRESHOLDS } from '../utils/eloLevels';

describe('eloLevels', () => {
  // ── Constants ──────────────────────────────────────────────────────────────
  describe('ELO_THRESHOLDS', () => {
    it('contains 6 levels', () => {
      expect(ELO_THRESHOLDS).toHaveLength(6);
    });

    it('levels are ordered from highest to lowest', () => {
      const mins = ELO_THRESHOLDS.map((t) => t.min);
      for (let i = 0; i < mins.length - 1; i++) {
        expect(mins[i]).toBeGreaterThan(mins[i + 1]);
      }
    });

    it('last threshold starts at 0 (scaled)', () => {
      const last = ELO_THRESHOLDS[ELO_THRESHOLDS.length - 1];
      expect(last.min).toBe(0);
      expect(last.level).toBe('scaled');
    });
  });

  describe('LEVEL_BADGE_THRESHOLDS', () => {
    it('contains 5 badge thresholds (pro through inter)', () => {
      expect(LEVEL_BADGE_THRESHOLDS).toHaveLength(5);
    });

    it('highest threshold is pro at 1800', () => {
      const sorted = [...LEVEL_BADGE_THRESHOLDS].sort((a, b) => b.minElo - a.minElo);
      expect(sorted[0].minElo).toBe(1800);
      expect(sorted[0].badge).toBe('level_pro');
    });
  });

  // ── getLevelFromElo ────────────────────────────────────────────────────────
  describe('getLevelFromElo', () => {
    it('returns pro for ELO >= 1800', () => {
      expect(getLevelFromElo(1800)).toBe('pro');
      expect(getLevelFromElo(2000)).toBe('pro');
      expect(getLevelFromElo(9999)).toBe('pro');
    });

    it('returns elite for ELO 1600–1799', () => {
      expect(getLevelFromElo(1600)).toBe('elite');
      expect(getLevelFromElo(1799)).toBe('elite');
    });

    it('returns rx+ for ELO 1400–1599', () => {
      expect(getLevelFromElo(1400)).toBe('rx+');
      expect(getLevelFromElo(1599)).toBe('rx+');
    });

    it('returns rx for ELO 1200–1399', () => {
      expect(getLevelFromElo(1200)).toBe('rx');
      expect(getLevelFromElo(1399)).toBe('rx');
    });

    it('returns inter for ELO 800–1199', () => {
      expect(getLevelFromElo(800)).toBe('inter');
      expect(getLevelFromElo(1000)).toBe('inter');
      expect(getLevelFromElo(1199)).toBe('inter');
    });

    it('returns scaled for ELO below 800', () => {
      expect(getLevelFromElo(799)).toBe('scaled');
      expect(getLevelFromElo(0)).toBe('scaled');
      expect(getLevelFromElo(-100)).toBe('scaled');
    });

    it('respects exact boundary values', () => {
      expect(getLevelFromElo(1799)).toBe('elite');
      expect(getLevelFromElo(1800)).toBe('pro');
      expect(getLevelFromElo(1199)).toBe('inter');
      expect(getLevelFromElo(1200)).toBe('rx');
    });
  });
});
