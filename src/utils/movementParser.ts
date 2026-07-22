import { MovementEntry } from '../services/gamification';

/**
 * Parse a formatted movement line from generated WODs.
 * Examples:
 *   "12 Thrusters (43 kg)"  → { name: "Thrusters", reps: 12, weight_kg: 43 }
 *   "15 Cal Assault Bike"   → { name: "Cal Assault Bike", reps: 15 }
 *   "400m Course"           → { name: "Course", reps: 1 }  (distance-based = 1 rep)
 *   "21-15-9 :"             → null  (header)
 *   "5 Rounds For Time :"   → null  (header)
 */
export function parseMovementLine(line: string): MovementEntry | null {
  const trimmed = line.trim();

  // Skip headers & labels
  if (!trimmed) return null;
  if (/^\d+\s+rounds?\s+/i.test(trimmed)) return null;
  if (/^(amrap|emom|for time|tabata|pyramide|ladder|chipper|──|min\s+\d)/i.test(trimmed)) return null;
  if (/^\d+[-–]\d+/.test(trimmed)) return null; // rep scheme like "21-15-9 :"
  if (trimmed.endsWith(':')) return null;
  if (trimmed.startsWith('⚡') || trimmed.startsWith('──')) return null;
  if (/⟨.*⟩/.test(trimmed)) return null; // team format labels

  // Distance-based: "400m Course" or "50m Bear Crawl"
  const distMatch = trimmed.match(/^(\d+)m\s+(.+)/);
  if (distMatch) {
    return { name: distMatch[2].replace(/\s*\(.*\)/, '').trim(), reps: 1 };
  }

  // Standard: "12 Thrusters (43 kg)", "15 Cal Assault Bike",
  // and tolerant of "7 reps — Sumo Deadlift @ 42.5/30 kg" (leading "reps"/"—", "@ kg").
  const stdMatch = trimmed.match(/^(\d+)\s*(?:reps?|x)?\s*[—–\-:]?\s*(.+)/i);
  if (stdMatch) {
    const reps = parseInt(stdMatch[1], 10);
    let rest = stdMatch[2];
    // Extract weight: "(43 kg)" or "@ 42.5" / "@ 42.5/30 kg" (take the first number)
    let weight_kg: number | undefined;
    const weightParen = rest.match(/\((\d+(?:\.\d+)?)\s*kg\)/i);
    const weightAt = rest.match(/@\s*(\d+(?:\.\d+)?)/);
    if (weightParen) {
      weight_kg = parseFloat(weightParen[1]);
    } else if (weightAt) {
      weight_kg = parseFloat(weightAt[1]);
    }
    // Remove parenthetical info (weight/scale) and trailing "@ ..." load
    rest = rest.replace(/\s*\([^)]*\)/g, '').replace(/\s*@.*$/, '').trim();
    if (isNaN(reps) || reps <= 0 || !rest) return null;
    return { name: rest, reps, weight_kg };
  }

  return null;
}

/**
 * Parse all movement lines from a generated WOD and compute total reps
 * based on WOD type and submitted score.
 *
 * @param movements - string[] from GeneratedWOD.movements
 * @param wodType - 'For Time' | 'AMRAP' | 'EMOM' | 'Tabata' | 'Max Reps' | etc.
 * @param scoreValue - the submitted score (time in seconds, rounds, or reps)
 * @param scoreType - 'time' | 'reps' | 'rounds'
 */
export function computeCompletedMovements(
  movements: string[],
  wodType: string,
  scoreValue: number,
  scoreType: string,
): MovementEntry[] {
  const parsed = movements.map(parseMovementLine).filter(Boolean) as MovementEntry[];
  if (parsed.length === 0) return [];

  // Extract rounds from header if present (e.g. "5 Rounds For Time :")
  const headerRounds = extractHeaderRounds(movements);

  switch (wodType) {
    case 'For Time': {
      // User completed the whole WOD (score = time)
      // If it has rounds in the header, multiply
      if (headerRounds > 1) {
        return parsed.map(m => ({ ...m, reps: m.reps * headerRounds }));
      }
      // Chipper: reps as-is (each line already has total reps)
      return parsed;
    }

    case 'AMRAP': {
      // Score is total reps or rounds
      if (scoreType === 'rounds' || scoreType === 'reps') {
        // Calculate reps per round
        const repsPerRound = parsed.reduce((sum, m) => sum + m.reps, 0);
        if (repsPerRound <= 0) return parsed;

        if (scoreType === 'rounds') {
          // Exact rounds completed
          return parsed.map(m => ({ ...m, reps: m.reps * scoreValue }));
        } else {
          // Total reps: figure out full rounds
          const fullRounds = Math.floor(scoreValue / repsPerRound);
          const partialReps = scoreValue % repsPerRound;
          const result: MovementEntry[] = [];
          let remaining = partialReps;
          for (const m of parsed) {
            const fullReps = m.reps * fullRounds;
            const partial = Math.min(remaining, m.reps);
            remaining = Math.max(0, remaining - m.reps);
            result.push({ ...m, reps: fullReps + partial });
          }
          return result;
        }
      }
      return parsed;
    }

    case 'EMOM': {
      // Score is rounds completed (each round = 1 minute of work)
      // Each movement appears once per cycle; cycles = scoreValue / parsed.length
      if (scoreType === 'rounds' && parsed.length > 0) {
        const cycles = Math.floor(scoreValue / parsed.length) || 1;
        return parsed.map(m => ({ ...m, reps: m.reps * cycles }));
      }
      // Fallback: header rounds
      if (headerRounds > 1) {
        return parsed.map(m => ({ ...m, reps: m.reps * headerRounds }));
      }
      return parsed;
    }

    case 'Tabata': {
      // 8 rounds standard Tabata
      return parsed.map(m => ({ ...m, reps: m.reps * 8 }));
    }

    case 'Max Reps': {
      // Single movement, score IS the reps
      if (parsed.length === 1) {
        return [{ ...parsed[0], reps: scoreValue }];
      }
      return parsed;
    }

    default:
      // Chipper, Ladder, Couplet, etc. → treat like For Time
      if (headerRounds > 1) {
        return parsed.map(m => ({ ...m, reps: m.reps * headerRounds }));
      }
      return parsed;
  }
}

function extractHeaderRounds(movements: string[]): number {
  for (const line of movements) {
    const match = line.match(/^(\d+)\s+rounds?\s+/i);
    if (match) return parseInt(match[1], 10);
  }
  return 1;
}
