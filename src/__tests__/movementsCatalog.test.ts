import { serializeMovement, parseMovementRow, isWeightedMovement } from '../utils/movementsCatalog';
import { parseMovementLine } from '../utils/movementParser';

describe('movementsCatalog serialize/parse', () => {
  it('serializes reps + name + weight into a parseable line', () => {
    expect(serializeMovement(21, 'Thruster', 43)).toBe('21 Thruster (43 kg)');
    expect(serializeMovement(12, 'Pull-ups')).toBe('12 Pull-ups');
    expect(serializeMovement(12, 'Pull-ups', 0)).toBe('12 Pull-ups');
  });

  it('round-trips through parseMovementRow (editor prefill)', () => {
    const line = serializeMovement(21, 'Thruster', 43);
    const row = parseMovementRow(line);
    expect(row).toEqual({ reps: 21, name: 'Thruster', weightKg: 43 });
  });

  it('parses a partial row (no reps yet) without losing the name', () => {
    expect(parseMovementRow('Thruster')).toEqual({ reps: null, name: 'Thruster', weightKg: null });
  });

  it('produces lines that the badge parser (parseMovementLine) reads back', () => {
    const line = serializeMovement(15, 'Wall Balls', 9);
    const parsed = parseMovementLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Wall Balls');
    expect(parsed!.reps).toBe(15);
    expect(parsed!.weight_kg).toBe(9);
  });

  it('knows which catalog movements are weighted', () => {
    expect(isWeightedMovement('Thruster')).toBe(true);
    expect(isWeightedMovement('Pull-ups')).toBe(false);
    expect(isWeightedMovement('Unknown Move')).toBe(false);
  });
});
