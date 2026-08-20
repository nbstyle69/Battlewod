import { bestOneRepMaxBySet, estimateOneRepMax } from '../services/strengthPR';
import { parsePersonalRecords, oneRepMaxForMovement } from '../utils/wod/movementLoadability';
import { weightliftingPrLabel, prKey } from '../screens/profile/prStorage';

describe('estimateOneRepMax', () => {
  it('rend la charge telle quelle sur une série à 1 rep', () => {
    expect(estimateOneRepMax(150, 1)).toBe(150);
  });

  it('estime par Epley au demi-kilo', () => {
    // 140 × (1 + 3/30) = 154
    expect(estimateOneRepMax(140, 3)).toBe(154);
    // 100 × (1 + 5/30) = 116,66… → 116,5
    expect(estimateOneRepMax(100, 5)).toBe(116.5);
  });

  it('refuse d’extrapoler au-delà de 10 reps — un 1RM inventé fausse tous les %1RM', () => {
    expect(estimateOneRepMax(60, 20)).toBeNull();
  });

  it('refuse les valeurs hors plage physiologique ou absurdes', () => {
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(-100, 3)).toBeNull();
    expect(estimateOneRepMax(5, 1)).toBeNull();      // sous le plancher de plausibilité
    expect(estimateOneRepMax(500, 1)).toBeNull();    // au-dessus du plafond
    expect(estimateOneRepMax(100, 2.5)).toBeNull();  // reps non entières
  });
});

describe('bestOneRepMaxBySet', () => {
  it('garde la série la plus lourde par mouvement', () => {
    expect(bestOneRepMaxBySet([
      { name: 'Back Squat', loadKg: 140, reps: 3 },   // 154
      { name: 'Back Squat', loadKg: 150, reps: 1 },   // 150
      { name: 'Deadlift', loadKg: 180, reps: 2 },     // 192
    ])).toEqual({
      'Back Squat': { kg: 154, logId: null },
      Deadlift: { kg: 192, logId: null },
    });
  });

  it('retient la série exacte qui a établi le record, pas une autre du même jour', () => {
    const best = bestOneRepMaxBySet([
      { name: 'Back Squat', loadKg: 100, reps: 5, logId: 'set-1' }, // 116,5
      { name: 'Back Squat', loadKg: 140, reps: 3, logId: 'set-2' }, // 154
      { name: 'Back Squat', loadKg: 120, reps: 3, logId: 'set-3' }, // 132
    ]);
    expect(best['Back Squat']).toEqual({ kg: 154, logId: 'set-2' });
  });

  it('part des reps réalisées, jamais des reps prescrites', () => {
    // Prescription 5 × 3 @ 100 kg, réalisé 5 reps sur la série la plus lourde :
    // le 1RM honnête est celui des 5 reps (116,5), pas celui des 3 (110).
    const best = bestOneRepMaxBySet([{ name: 'Back Squat', loadKg: 100, reps: 5 }]);
    expect(best['Back Squat'].kg).toBe(116.5);
    expect(estimateOneRepMax(100, 3)).toBe(110);
  });

  it('ignore un mouvement sans 1RM de référence', () => {
    expect(bestOneRepMaxBySet([{ name: 'Wall Ball', loadKg: 9, reps: 5 }])).toEqual({});
  });

  it('vise exactement les clés que la page Records affiche', () => {
    const best = bestOneRepMaxBySet([{ name: 'back squat', loadKg: 150, reps: 1 }]);
    const [movement] = Object.keys(best);
    expect(movement).toBe(weightliftingPrLabel('BACK SQUAT'));
    // La clé écrite est relue par le pont %1RM sans intermédiaire.
    const prs = parsePersonalRecords({ [prKey('weightlifting', movement)]: String(best[movement].kg) });
    expect(oneRepMaxForMovement('Back Squat', prs)).toBe(150);
  });
});
