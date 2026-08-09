import { prKey, prDateKey, readPr, readPrDate, normalizePrRecords } from '../screens/profile/prStorage';

describe('prStorage', () => {
  it('builds stable slug keys', () => {
    expect(prKey('weightlifting', 'Back Squat')).toBe('weightlifting_Back Squat');
    expect(prDateKey('cardio', '500m Row')).toBe('cardio_500m Row_date');
  });

  it('reads modern keys, falling back to legacy label prefixes', () => {
    const modern = { 'weightlifting_Back Squat': '140' };
    const legacy = { 'Haltérophilie_Back Squat': '120' };
    expect(readPr(modern, 'weightlifting', 'Back Squat')).toBe('140');
    expect(readPr(legacy, 'weightlifting', 'Back Squat')).toBe('120');
    expect(readPr(undefined, 'weightlifting', 'Back Squat')).toBeUndefined();
  });

  it('reads dates with legacy fallback', () => {
    const legacy = { 'Cardio & Endurance_500m Row_date': '2026-01-01' };
    expect(readPrDate(legacy, 'cardio', '500m Row')).toBe('2026-01-01');
  });

  it('normalizes legacy keys to slugs and drops _featured_badges', () => {
    const raw = {
      'Haltérophilie_Back Squat': '140',
      'Haltérophilie_Back Squat_date': '2026-01-01',
      'Gymnastics_Pull-ups': '30',
      'Benchmarks CrossFit_Fran': '2:45',
      'Cardio & Endurance_500m Row': '1:35',
      _featured_badges: ['a', 'b'],
    };
    expect(normalizePrRecords(raw)).toEqual({
      'weightlifting_Back Squat': '140',
      'weightlifting_Back Squat_date': '2026-01-01',
      'gymnastics_Pull-ups': '30',
      'benchmarks_Fran': '2:45',
      'cardio_500m Row': '1:35',
    });
  });

  it('is idempotent on already-slugged records', () => {
    const modern = { 'weightlifting_Back Squat': '140', 'gymnastics_Dips': '20' };
    expect(normalizePrRecords(modern)).toEqual(modern);
  });

  it('prefers modern keys over legacy on collision', () => {
    const mixed = { 'weightlifting_Back Squat': '150', 'Haltérophilie_Back Squat': '120' };
    expect(normalizePrRecords(mixed)['weightlifting_Back Squat']).toBe('150');
  });

  it('coerces numeric values to strings instead of dropping them (4.6)', () => {
    const raw: Record<string, unknown> = { 'weightlifting_Back Squat': 150, 'cardio_Row': 92.5, bad: null };
    const out = normalizePrRecords(raw);
    expect(out['weightlifting_Back Squat']).toBe('150');
    expect(out['cardio_Row']).toBe('92.5');
    expect('bad' in out).toBe(false);
  });
});
