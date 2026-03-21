/**
 * Shared score formatting utility.
 * DNF_BASE = 999999 → scores >= this are "CAP + X reps" (For Time unfinished).
 */

export const DNF_BASE = 999999;

/**
 * Format a score value for display based on score type.
 * @param value  - raw numeric score value
 * @param type   - 'time' | 'reps' | 'weight' | 'rounds'
 */
export function formatScoreValue(value: number, type: string): string {
  if (type === 'time') {
    const total = Math.round(value);
    if (total >= DNF_BASE) {
      const reps = total - DNF_BASE;
      return `CAP + ${reps} reps`;
    }
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const units: Record<string, string> = { reps: ' reps', weight: ' kg', rounds: ' rnds' };
  return `${value}${units[type] ?? ''}`;
}
