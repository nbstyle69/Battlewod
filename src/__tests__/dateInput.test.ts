import { formatDateInput, isValidDateString, todayDateString } from '../lib/dateInput';

describe('formatDateInput', () => {
  it('inserts dashes progressively', () => {
    expect(formatDateInput('2026')).toBe('2026');
    expect(formatDateInput('202603')).toBe('2026-03');
    expect(formatDateInput('20260315')).toBe('2026-03-15');
  });
  it('strips non-digits and caps at 8 digits', () => {
    expect(formatDateInput('2026-03-15')).toBe('2026-03-15');
    expect(formatDateInput('abc2026x03/15extra')).toBe('2026-03-15');
    expect(formatDateInput('202603159999')).toBe('2026-03-15');
  });
});

describe('isValidDateString', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateString('2026-03-15')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2023-02-29')).toBe(false);
    expect(isValidDateString('2026-3-5')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });
});

describe('todayDateString', () => {
  it('formats a fixed date as YYYY-MM-DD', () => {
    expect(todayDateString(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});
