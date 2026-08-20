import {
  buildStrengthGrid,
  usableDrafts,
  groupStrengthSessions,
  StrengthSetRow,
} from '../services/strengthSets';
import { StrengthEntry } from '../utils/strengthBlock';

const noOneRepMax = () => null;

function entry(over: Partial<StrengthEntry>): StrengthEntry {
  return {
    name: 'Back Squat', sets: 5, reps: 3, load: null, unit: 'kg', restSec: null, tempo: null,
    ...over,
  };
}

describe('buildStrengthGrid', () => {
  it('rend une ligne par série prescrite — jamais un repli qui cache des lignes', () => {
    const grid = buildStrengthGrid([entry({ sets: 5, reps: 3, load: 100 })], noOneRepMax);
    expect(grid).toHaveLength(5);
    expect(grid.map(d => d.setIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it('pré-remplit reps et charge : le cas courant se valide sans rien toucher', () => {
    const [first] = buildStrengthGrid([entry({ sets: 3, reps: 5, load: 90 })], noOneRepMax);
    expect(first.reps).toBe('5');
    expect(first.loadKg).toBe('90');
    expect(first.prescribedReps).toBe(5);
    expect(first.prescribedLoadKg).toBe(90);
  });

  it('résout un %1RM depuis le 1RM connu de l’athlète', () => {
    const grid = buildStrengthGrid(
      [entry({ sets: 2, reps: 3, load: 80, unit: '%1RM' })],
      name => (name === 'Back Squat' ? 150 : null),
    );
    expect(grid.map(d => d.loadKg)).toEqual(['120', '120']);
  });

  it('laisse la charge vide plutôt que d’inventer un %1RM sans 1RM connu', () => {
    const grid = buildStrengthGrid(
      [entry({ sets: 2, reps: 3, load: 80, unit: '%1RM' })],
      noOneRepMax,
    );
    expect(grid.map(d => d.loadKg)).toEqual(['', '']);
    expect(grid[0].prescribedLoadKg).toBeNull();
  });

  it('numérote les blocs séparément pour que l’écran regroupe par mouvement', () => {
    const grid = buildStrengthGrid([
      entry({ name: 'Back Squat', sets: 2, reps: 3, load: 100 }),
      entry({ name: 'Deadlift', sets: 1, reps: 5, load: 140 }),
    ], noOneRepMax);
    expect(grid.map(d => `${d.entryIndex}:${d.name}:${d.setIndex}`)).toEqual([
      '0:Back Squat:1', '0:Back Squat:2', '1:Deadlift:1',
    ]);
  });

  it('borne le nombre de séries au maximum accepté en base (50)', () => {
    expect(buildStrengthGrid([entry({ sets: 400, load: 60 })], noOneRepMax)).toHaveLength(50);
    expect(buildStrengthGrid([entry({ sets: 0, load: 60 })], noOneRepMax)).toHaveLength(1);
  });
});

describe('usableDrafts', () => {
  const grid = buildStrengthGrid([entry({ sets: 3, reps: 3, load: 100 })], noOneRepMax);

  it('accepte la virgule décimale et les corrections ligne par ligne', () => {
    const edited = grid.map((d, i) => (i === 1 ? { ...d, reps: '5', loadKg: '102,5' } : d));
    expect(usableDrafts(edited)).toHaveLength(3);
    expect(usableDrafts(edited)[1].loadKg).toBe('102,5');
  });

  it('écarte une ligne sans charge, sans reps, ou à zéro', () => {
    const edited = [
      { ...grid[0], loadKg: '' },
      { ...grid[1], reps: '' },
      { ...grid[2], loadKg: '0' },
    ];
    expect(usableDrafts(edited)).toEqual([]);
  });
});

function row(over: Partial<StrengthSetRow>): StrengthSetRow {
  return {
    id: 'x', source_type: 'whiteboard', source_id: 's1', source_title: 'Lundi',
    movement: 'Back Squat', movement_label: 'Back Squat', set_index: 1, reps: 3,
    load_kg: 100, prescribed_reps: 3, prescribed_load_kg: 100,
    performed_at: '2026-06-01T10:00:00Z',
    ...over,
  };
}

describe('groupStrengthSessions', () => {
  it('regroupe par (séance, mouvement) et ordonne les séries', () => {
    const sessions = groupStrengthSessions([
      row({ id: 'b', set_index: 2, reps: 5 }),
      row({ id: 'a', set_index: 1, reps: 5 }),
      row({ id: 'c', set_index: 3, reps: 3 }),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets.map(s => [s.setIndex, s.reps])).toEqual([[1, 5], [2, 5], [3, 3]]);
  });

  it('sépare deux mouvements d’une même séance, et garde la provenance', () => {
    const sessions = groupStrengthSessions([
      row({ id: 'a', movement: 'Back Squat' }),
      row({ id: 'b', movement: 'Deadlift' }),
      row({ id: 'c', source_id: 's2', source_type: 'program', performed_at: '2026-06-02T10:00:00Z' }),
    ]);
    expect(sessions).toHaveLength(3);
    // Le plus récent d'abord — l'historique se lit du haut.
    expect(sessions[0].sourceId).toBe('s2');
    expect(sessions[0].sourceType).toBe('program');
  });

  it('n’invente pas la série qui a établi le record : elle se reconnaît à son id', () => {
    const sessions = groupStrengthSessions([row({ id: 'set-42', set_index: 2 })]);
    expect(sessions[0].sets[0].id).toBe('set-42');
  });
});
