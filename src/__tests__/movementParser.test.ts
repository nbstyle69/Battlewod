import { parseMovementLine, computeCompletedMovements } from '../utils/movementParser';

// ── parseMovementLine ────────────────────────────────────────────────────────
describe('parseMovementLine', () => {
  describe('valid movement lines', () => {
    it('parses standard line: reps + movement', () => {
      const result = parseMovementLine('15 Burpees');
      expect(result).toEqual({ name: 'Burpees', reps: 15, weight_kg: undefined });
    });

    it('parses line with weight in kg', () => {
      const result = parseMovementLine('12 Thrusters (43 kg)');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Thrusters');
      expect(result!.reps).toBe(12);
      expect(result!.weight_kg).toBe(43);
    });

    it('parses line with decimal weight', () => {
      const result = parseMovementLine('5 Hang Clean (52.5 kg)');
      expect(result!.weight_kg).toBe(52.5);
    });

    it('parses distance-based line as 1 rep', () => {
      const result = parseMovementLine('400m Course');
      expect(result).not.toBeNull();
      expect(result!.reps).toBe(1);
      expect(result!.name).toBe('Course');
    });

    it('parses 50m movement', () => {
      const result = parseMovementLine('50m Farmer Carry');
      expect(result!.reps).toBe(1);
      expect(result!.name).toBe('Farmer Carry');
    });

    it('strips parenthetical scale info from name', () => {
      const result = parseMovementLine('21 KB Swings (Russian)');
      expect(result!.name).toBe('KB Swings');
    });
  });

  describe('headers and non-movement lines', () => {
    it('returns null for empty string', () => {
      expect(parseMovementLine('')).toBeNull();
    });

    it('returns null for rep-scheme headers (21-15-9)', () => {
      expect(parseMovementLine('21-15-9 :')).toBeNull();
    });

    it('returns null for Rounds For Time header', () => {
      expect(parseMovementLine('5 Rounds For Time :')).toBeNull();
    });

    it('returns null for AMRAP header', () => {
      expect(parseMovementLine('AMRAP 12 :')).toBeNull();
    });

    it('returns null for EMOM header', () => {
      expect(parseMovementLine('EMOM 10 :')).toBeNull();
    });

    it('returns null for lines ending with colon', () => {
      expect(parseMovementLine('Round 1:')).toBeNull();
    });

    it('returns null for separator lines', () => {
      expect(parseMovementLine('── Bloc A ──')).toBeNull();
    });
  });
});

// ── computeCompletedMovements ────────────────────────────────────────────────
describe('computeCompletedMovements', () => {
  it('returns empty array for empty movements', () => {
    expect(computeCompletedMovements([], 'For Time', 120, 'time')).toEqual([]);
  });

  it('returns empty array for unparseable movements', () => {
    const result = computeCompletedMovements(['AMRAP 12 :', '──────────'], 'AMRAP', 50, 'reps');
    expect(result).toEqual([]);
  });

  describe('For Time', () => {
    it('returns movements as-is (chipper format)', () => {
      const movements = ['12 Thrusters', '15 Burpees'];
      const result = computeCompletedMovements(movements, 'For Time', 180, 'time');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: 'Thrusters', reps: 12 });
      expect(result[1]).toMatchObject({ name: 'Burpees', reps: 15 });
    });

    it('multiplies reps by header rounds when present', () => {
      const movements = ['3 Rounds For Time :', '10 Pull-ups', '15 Push-ups'];
      const result = computeCompletedMovements(movements, 'For Time', 300, 'time');
      expect(result.find((m) => m.name === 'Pull-ups')!.reps).toBe(30);
      expect(result.find((m) => m.name === 'Push-ups')!.reps).toBe(45);
    });
  });

  describe('AMRAP — rounds scoring', () => {
    it('multiplies reps by number of rounds completed', () => {
      const movements = ['10 Pull-ups', '15 Push-ups'];
      const result = computeCompletedMovements(movements, 'AMRAP', 3, 'rounds');
      expect(result.find((m) => m.name === 'Pull-ups')!.reps).toBe(30);
      expect(result.find((m) => m.name === 'Push-ups')!.reps).toBe(45);
    });
  });

  describe('AMRAP — reps scoring', () => {
    it('distributes reps across full and partial rounds', () => {
      // repsPerRound = 10, score = 25 → 2 full rounds (20) + 5 partial
      const movements = ['10 Burpees'];
      const result = computeCompletedMovements(movements, 'AMRAP', 25, 'reps');
      expect(result[0].reps).toBe(25);
    });

    it('handles partial round correctly across movements', () => {
      // [5 Pull-ups, 10 Push-ups] → repsPerRound=15, score=17 → 1 full round + 2 partial
      const movements = ['5 Pull-ups', '10 Push-ups'];
      const result = computeCompletedMovements(movements, 'AMRAP', 17, 'reps');
      const pullUps = result.find((m) => m.name === 'Pull-ups')!;
      const pushUps = result.find((m) => m.name === 'Push-ups')!;
      expect(pullUps.reps).toBe(5 + 2);  // 1 full + 2 partial
      expect(pushUps.reps).toBe(10);     // 1 full + 0 partial
    });
  });

  describe('Tabata', () => {
    it('multiplies each movement by 8 rounds', () => {
      const movements = ['5 Thrusters', '10 Ring Rows'];
      const result = computeCompletedMovements(movements, 'Tabata', 0, 'rounds');
      expect(result.find((m) => m.name === 'Thrusters')!.reps).toBe(40);
      expect(result.find((m) => m.name === 'Ring Rows')!.reps).toBe(80);
    });
  });

  describe('Max Reps', () => {
    it('uses score value directly as reps for single movement', () => {
      const result = computeCompletedMovements(['1 Muscle-up'], 'Max Reps', 23, 'reps');
      expect(result[0].reps).toBe(23);
    });
  });

  describe('EMOM', () => {
    it('calculates cycles per movement', () => {
      // 2 movements, 6 rounds → cycles = floor(6/2) = 3
      const movements = ['5 Pull-ups', '10 Push-ups'];
      const result = computeCompletedMovements(movements, 'EMOM', 6, 'rounds');
      expect(result.find((m) => m.name === 'Pull-ups')!.reps).toBe(15);
      expect(result.find((m) => m.name === 'Push-ups')!.reps).toBe(30);
    });
  });
});
