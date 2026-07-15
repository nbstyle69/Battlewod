import { getScaledMovements } from '../utils/wodScaling';

describe('getScaledMovements', () => {
  test('returns curated scaled variant for an official WOD name', () => {
    const scaled = getScaledMovements('Fran', '21-15-9\nThrusters (43/30 kg)\nPull-ups');
    expect(scaled).toContain('Thrusters (30/20 kg)');
    expect(scaled).toContain('Ring rows');
    expect(scaled).not.toContain('Pull-ups');
  });

  test('prefers curated variant over derivation for Hero-lite', () => {
    const rx = 'AMRAP 18 min\n10 Deadlifts (60/42 kg)\n10 Hang power cleans\n10 Front squats\n10 Push press';
    const scaled = getScaledMovements('AMRAP 18 — Hero-lite', rx);
    expect(scaled).toContain('Deadlifts (40/30 kg)');
  });

  test('derives a scaled version for unknown WODs (lower loads + substitutions)', () => {
    const scaled = getScaledMovements('Custom WOD', 'For Time\n30 Pull-ups\n30 Thrusters (60/40 kg)');
    // pull-ups substituted, loads reduced ~35% rounded to nearest 5
    expect(scaled).toContain('Ring rows');
    expect(scaled).toContain('(40/25 kg)');
  });

  test('handles null/undefined WOD name via derivation', () => {
    const scaled = getScaledMovements(null, 'AMRAP 10\n10 Double-unders');
    expect(scaled).toContain('Single-unders');
  });
});
