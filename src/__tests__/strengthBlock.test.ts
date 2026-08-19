import {
  formatStrengthPrescription,
  isStrengthLine,
  parseStrengthLine,
  resolveStrengthLoadKg,
  serializeStrength,
  splitStrengthLines,
  StrengthEntry,
} from '../utils/strengthBlock';
import { parseMovementLine, computeCompletedMovements } from '../utils/movementParser';
import { parsePersonalRecords, oneRepMaxForMovement } from '../utils/wod/movementLoadability';

const base: StrengthEntry = {
  name: 'Back Squat', sets: 5, reps: 3, load: 80, unit: '%1RM', restSec: 120, tempo: '30X1',
};

describe('sérialisation du bloc musculation', () => {
  it('écrit le nom d’abord, séries × reps, charge, repos et tempo', () => {
    expect(serializeStrength(base)).toBe('Back Squat — 5 × 3 @ 80 %1RM — repos 2:00 — tempo 30X1');
  });

  it('omet ce qui n’est pas prescrit', () => {
    expect(serializeStrength({ ...base, load: null, restSec: null, tempo: null }))
      .toBe('Back Squat — 5 × 3');
    expect(serializeStrength({ ...base, unit: 'kg', load: 70, restSec: 90, tempo: '' }))
      .toBe('Back Squat — 5 × 3 @ 70 kg — repos 1:30');
  });

  it('refuse qu’un chiffre passe en tête du nom (sinon le crédit compterait la ligne)', () => {
    expect(serializeStrength({ ...base, name: '4 x 8 Back Squat' }))
      .toBe('Back Squat — 5 × 3 @ 80 %1RM — repos 2:00 — tempo 30X1');
  });

  it('fait l’aller-retour à l’identique', () => {
    for (const e of [base, { ...base, unit: 'kg' as const, load: 72.5 }, { ...base, load: null, restSec: null, tempo: null }]) {
      expect(parseStrengthLine(serializeStrength(e))).toEqual({
        name: e.name, sets: e.sets, reps: e.reps,
        load: e.load, unit: e.load == null ? 'kg' : e.unit,
        restSec: e.restSec, tempo: e.tempo || null,
      });
    }
  });
});

describe('reconnaissance des lignes', () => {
  it('tolère les notations d’un coach (x, tiret simple, secondes, %)', () => {
    expect(parseStrengthLine('Deadlift - 3x5 @ 90% - repos 180s')).toEqual({
      name: 'Deadlift', sets: 3, reps: 5, load: 90, unit: '%1RM', restSec: 180, tempo: null,
    });
  });

  it('ne prend pas un mouvement de WOD pour un bloc de force', () => {
    expect(isStrengthLine('21 Thruster (43 kg)')).toBe(false);
    expect(isStrengthLine('5 Rounds For Time :')).toBe(false);
    expect(isStrengthLine('Back Squat lourd du jour')).toBe(false);
  });

  it('sépare les deux familles de lignes', () => {
    const { wod, strength } = splitStrengthLines([
      '21 Thruster (43 kg)', 'Back Squat — 5 × 3 @ 80 %1RM', '12 Pull-ups',
    ]);
    expect(wod).toEqual(['21 Thruster (43 kg)', '12 Pull-ups']);
    expect(strength).toEqual(['Back Squat — 5 × 3 @ 80 %1RM']);
  });
});

// Contrôle négatif : c'est la propriété qui autorise le bloc muscu sans OTA.
describe('un bloc de force ne crédite aucun mouvement', () => {
  const line = serializeStrength(base);

  it('parseMovementLine l’ignore', () => {
    expect(parseMovementLine(line)).toBeNull();
  });

  it('n’ajoute aucune rep au crédit du WOD', () => {
    const credited = computeCompletedMovements(['21 Thruster (43 kg)', line], 'For Time', 0, 'time');
    expect(credited).toEqual([{ name: 'Thruster', reps: 21, weight_kg: 43 }]);
  });
});

describe('résolution de la charge', () => {
  it('rend les kg tels quels', () => {
    expect(resolveStrengthLoadKg({ load: 72.5, unit: 'kg' }, null)).toBe(72.5);
  });

  it('résout le %1RM au pas de 2,5 kg', () => {
    expect(resolveStrengthLoadKg({ load: 80, unit: '%1RM' }, 190)).toBe(152.5);
  });

  it('ne devine pas une charge sans 1RM', () => {
    expect(resolveStrengthLoadKg({ load: 80, unit: '%1RM' }, null)).toBeNull();
    expect(resolveStrengthLoadKg({ load: 80, unit: '%1RM' }, 0)).toBeNull();
  });

  it('lit le 1RM dans les records de l’athlète, et seulement s’il est plausible', () => {
    const prs = parsePersonalRecords({ 'weightlifting_Back Squat': '190', 'weightlifting_Deadlift': '4' });
    expect(oneRepMaxForMovement('Back Squat', prs)).toBe(190);
    expect(oneRepMaxForMovement('Deadlift', prs)).toBeNull();     // 4 kg : hors plage, ignoré
    expect(oneRepMaxForMovement('Rope Climbs', prs)).toBeNull();  // pas de 1RM
  });

  it('affiche le pourcentage seul quand le 1RM manque, le kg quand il est connu', () => {
    expect(formatStrengthPrescription(base, 190)).toBe('5 × 3 @ 80 %1RM (≈ 152.5 kg)');
    expect(formatStrengthPrescription(base, null)).toBe('5 × 3 @ 80 %1RM');
    expect(formatStrengthPrescription({ ...base, unit: 'kg', load: 70 }, 190)).toBe('5 × 3 @ 70 kg');
    expect(formatStrengthPrescription({ ...base, load: null }, 190)).toBe('5 × 3');
  });
});
