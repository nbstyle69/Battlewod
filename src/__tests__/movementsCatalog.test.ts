import { serializeMovement, parseMovementRow, isWeightedMovement } from '../utils/movementsCatalog';
import { parseMovementLine } from '../utils/movementParser';

describe('movementsCatalog serialize/parse', () => {
  it('serializes reps + name + weight into a parseable line', () => {
    expect(serializeMovement(21, 'Thruster', 43)).toBe('21 Thruster (43 kg)');
    expect(serializeMovement(12, 'Pull-ups')).toBe('12 Pull-ups');
    expect(serializeMovement(12, 'Pull-ups', 0)).toBe('12 Pull-ups');
  });

  it('serializes separate men / women loads', () => {
    expect(serializeMovement(21, 'Thruster', 43, 30)).toBe('21 Thruster (43/30 kg)');
    expect(serializeMovement(21, 'Thruster', null, 30)).toBe('21 Thruster (30 kg)');
    expect(serializeMovement(21, 'Thruster', 43, 0)).toBe('21 Thruster (43 kg)');
  });

  it('round-trips through parseMovementRow (editor prefill)', () => {
    const line = serializeMovement(21, 'Thruster', 43);
    const row = parseMovementRow(line);
    expect(row).toEqual({ reps: 21, name: 'Thruster', weightKg: 43, weightKgWomen: null });
  });

  it('round-trips men / women loads through parseMovementRow', () => {
    const line = serializeMovement(21, 'Thruster', 43, 30);
    expect(line).toBe('21 Thruster (43/30 kg)');
    expect(parseMovementRow(line)).toEqual({ reps: 21, name: 'Thruster', weightKg: 43, weightKgWomen: 30 });
  });

  it('parses a partial row (no reps yet) without losing the name', () => {
    expect(parseMovementRow('Thruster')).toEqual({ reps: null, name: 'Thruster', weightKg: null, weightKgWomen: null });
  });

  it('produces lines that the badge parser (parseMovementLine) reads back', () => {
    const line = serializeMovement(15, 'Wall Balls', 9);
    const parsed = parseMovementLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Wall Balls');
    expect(parsed!.reps).toBe(15);
    expect(parsed!.weight_kg).toBe(9);
  });

  it('badge parser reads the men load from a men/women line', () => {
    const line = serializeMovement(15, 'Wall Balls', 9, 6);
    expect(line).toBe('15 Wall Balls (9/6 kg)');
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
