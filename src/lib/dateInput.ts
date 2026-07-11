// Pure helpers for masked YYYY-MM-DD text entry (no native picker dependency).

/** Keep only digits, cap at 8 (YYYYMMDD) and re-insert dashes → YYYY-MM-DD. */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  let out = year;
  if (digits.length > 4) out += '-' + month;
  if (digits.length > 6) out += '-' + day;
  return out;
}

/** True when the string is a real calendar date in strict YYYY-MM-DD form. */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Today as YYYY-MM-DD (local time) — used as a sensible default placeholder. */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
