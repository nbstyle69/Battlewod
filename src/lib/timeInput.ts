// Pure helpers for free-text HH:MM entry (no native picker dependency).
//
// `class_schedules.start_time` and its siblings are text columns that every
// reader parses as exactly `HH:MM` — the slot instant is built by concatenation
// (`${date}T${start_time}:00`), the ordering is a string ordering, and the
// template generator deduplicates on string equality.

/**
 * Accept what a human types for an hour of the day and return strict `HH:MM`,
 * or `null` when it cannot be read as a time. `9:5` is a typo, not 09:05 —
 * a single-digit minute is refused rather than guessed.
 */
export function normalizeTimeString(raw: string): string | null {
  const value = raw.trim().replace(/\s/g, '');
  const match = /^(\d{1,2})[:hH.]?([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** True when the string already is a strict `HH:MM` in the 00:00–23:59 range. */
export function isValidTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
