// Portage de parsePersonalRecords.verify.ts (28 assertions) — pont page Records → charges PR.
import {
  parsePersonalRecords, resolveLoad, personalizedLoadDisplay, PRMap,
} from '../utils/wod/movementLoadability';

const modern = {
  'weightlifting_Back Squat': '160',
  'weightlifting_Front Squat': '135',
  'weightlifting_Deadlift': '200',
  'weightlifting_Push Press': '90',
  'weightlifting_Clean & Jerk': '120',
  'weightlifting_Thruster': '95',
  'weightlifting_Squat Clean': '125',
  'weightlifting_Power Clean': '110',
  'weightlifting_Squat Snatch': '85',
  'weightlifting_Power Snatch': '80',
  'weightlifting_Back Squat_date': '2026-06-01',
  '_featured_badges': ['x'],
  'gymnastics_Pull-ups': '30',
  'cardio_Run 5k': '22:30',
};
const prs = parsePersonalRecords(modern);

describe('parsePersonalRecords — format moderne', () => {
  it('normalise les 1RM chargés', () => {
    expect(prs.deadlift).toBe(200);
    expect(prs.back_squat).toBe(160);
    expect(prs.front_squat).toBe(135);
    expect(prs.push_press).toBe(90);
    expect(prs.clean_jerk).toBe(120);
    expect(prs.thruster).toBe(95);
    expect(prs.clean).toBe(125);  // max(squat clean, power clean)
    expect(prs.snatch).toBe(85);  // max(squat snatch, power snatch)
  });

  it('ignore les clés non pertinentes', () => {
    expect(prs['back_squat_date' as keyof PRMap]).toBeUndefined();
    expect('_featured_badges' in prs).toBe(false);
    expect('pull-ups' in prs).toBe(false);
    expect(prs['run 5k' as keyof PRMap]).toBeUndefined();
  });
});

describe('parsePersonalRecords — legacy et robustesse', () => {
  it('lit les clés legacy préfixées par le label', () => {
    const legacy = parsePersonalRecords({ 'Haltérophilie_Deadlift': '180', 'Haltérophilie_Back Squat': '150' });
    expect(legacy.deadlift).toBe(180);
    expect(legacy.back_squat).toBe(150);
  });

  it('tolère null / undefined', () => {
    expect(parsePersonalRecords(null)).toEqual({});
    expect(parsePersonalRecords(undefined)).toEqual({});
  });

  it('filtre les valeurs aberrantes et gère la virgule décimale', () => {
    const dirty = parsePersonalRecords({
      'weightlifting_Deadlift': '0',
      'weightlifting_Back Squat': '5000',
      'weightlifting_Snatch': '82,5',
    });
    expect(dirty.deadlift).toBeUndefined();
    expect(dirty.back_squat).toBeUndefined();
    expect(dirty.snatch).toBe(82.5);
  });
});

describe('pont PR → charges affichées', () => {
  const dl = resolveLoad('deadlift', 'RX', prs, 0);

  it('résout une charge personnalisée depuis le PR', () => {
    expect(dl?.source).toBe('pr');
    expect(dl!.kg).toBeGreaterThan(100);
    expect(dl!.kg).toBeLessThan(125);
    expect(resolveLoad('snatch', 'RX', prs, 0)!.kg).toBeLessThan(dl!.kg);
    expect(resolveLoad('deadlift', 'RX', {}, 0)?.source).toBe('rx');
  });

  it('affiche une seule valeur avec PR, la charge moteur sinon', () => {
    expect(personalizedLoadDisplay('Deadlift', '102/70 kg', 'RX', prs)).toBe(`${dl!.kg} kg`);
    expect(personalizedLoadDisplay('Deadlift', '102/70 kg', 'RX', {})).toBe('102/70 kg');
    expect(personalizedLoadDisplay('KB Swing', '24/16 kg', 'RX', prs)).toBe('24/16 kg');
    expect(personalizedLoadDisplay('Pull-ups', null, 'RX', prs)).toBeNull();
  });

  it('progresse avec le niveau : Scaled < RX < Pro', () => {
    const s = resolveLoad('deadlift', 'Scaled', prs, 0)!.kg;
    const r = resolveLoad('deadlift', 'RX', prs, 0)!.kg;
    const p = resolveLoad('deadlift', 'Pro', prs, 0)!.kg;
    expect(s).toBeLessThan(r);
    expect(r).toBeLessThan(p);
  });
});
