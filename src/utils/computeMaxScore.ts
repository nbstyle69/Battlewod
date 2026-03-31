import { parseMovementLine } from './movementParser';

/**
 * Compute the maximum plausible score for a WOD based on its type, duration, and movements.
 * Returns null if we can't determine a cap (e.g. missing data, unknown type).
 *
 * Strategy:
 *   AMRAP  → min( duration_sec × 1.5 , repsPerRound × duration_min × 5 )
 *   EMOM   → total minutes (rounds mode) or totalMinutes × repsPerMinute × 2 (reps mode)
 *   Tabata → min( 280 , repsPerRound × 8 × 3 )
 */

const MAX_REPS_PER_SECOND = 1.5;
const MAX_ROUNDS_PER_MINUTE = 5;
const TABATA_ROUNDS = 8;
const TABATA_MAX_REPS_TOTAL = 280;

function parseRepsPerRound(description: string): number {
  const lines = description.split('\n').filter(Boolean);
  let total = 0;
  for (const line of lines) {
    const entry = parseMovementLine(line);
    if (entry) total += entry.reps;
  }
  return total;
}

export function computeMaxScore(
  wodType: string | undefined | null,
  description: string | undefined | null,
  timeCapSeconds: number | undefined | null,
  rounds: number | undefined | null,
  scoreType: string,
): number | null {
  if (!wodType || !description) return null;

  const type = wodType.toLowerCase();
  const repsPerRound = parseRepsPerRound(description);

  switch (type) {
    case 'amrap': {
      if (!timeCapSeconds || timeCapSeconds <= 0) return null;
      if (scoreType === 'rounds') {
        const durationMin = timeCapSeconds / 60;
        return Math.ceil(durationMin * MAX_ROUNDS_PER_MINUTE);
      }
      // Score in reps
      const capByTime = Math.ceil(timeCapSeconds * MAX_REPS_PER_SECOND);
      if (repsPerRound > 0) {
        const durationMin = timeCapSeconds / 60;
        const capByRounds = repsPerRound * Math.ceil(durationMin * MAX_ROUNDS_PER_MINUTE);
        return Math.min(capByTime, capByRounds);
      }
      return capByTime;
    }

    case 'emom': {
      const totalMinutes = rounds ?? (timeCapSeconds ? Math.ceil(timeCapSeconds / 60) : null);
      if (!totalMinutes || totalMinutes <= 0) return null;
      if (scoreType === 'rounds') {
        return totalMinutes;
      }
      // Score in reps
      if (repsPerRound > 0) {
        return repsPerRound * totalMinutes * 2;
      }
      return Math.ceil(totalMinutes * 60 * MAX_REPS_PER_SECOND);
    }

    case 'tabata': {
      if (scoreType === 'rounds') {
        return TABATA_ROUNDS;
      }
      if (repsPerRound > 0) {
        return Math.min(TABATA_MAX_REPS_TOTAL, repsPerRound * TABATA_ROUNDS * 3);
      }
      return TABATA_MAX_REPS_TOTAL;
    }

    default:
      return null; // For Time, Max Reps, etc. → no cap
  }
}
