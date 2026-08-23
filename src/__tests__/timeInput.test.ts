import { isValidTimeString, normalizeTimeString } from '../lib/timeInput';

describe('normalizeTimeString — ce que le gérant tape devient du HH:MM strict', () => {
  it.each([
    ['9:00', '09:00'],
    ['09:00', '09:00'],
    ['9h00', '09:00'],
    ['9H30', '09:30'],
    ['930', '09:30'],
    ['1830', '18:30'],
    [' 18:30 ', '18:30'],
    ['0:05', '00:05'],
    ['23:59', '23:59'],
  ])('« %s » devient « %s »', (raw, expected) => {
    expect(normalizeTimeString(raw)).toBe(expected);
    expect(isValidTimeString(normalizeTimeString(raw) as string)).toBe(true);
  });

  it.each([
    '',
    '9',
    '9:5',      // minute à un chiffre : une faute de frappe, pas 09:05
    '24:00',
    '9:60',
    '18h',
    'midi',
    '18:30:00', // le serveur lit HH:MM, pas HH:MM:SS
    '1830h',
  ])('« %s » est refusé plutôt que devin\u00e9', (raw) => {
    expect(normalizeTimeString(raw)).toBeNull();
  });
});

describe('isValidTimeString — la propriété exigée par le serveur et les lectures', () => {
  it('rend vrai exactement sur la forme que le CHECK accepte', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString('9:00')).toBe(false);
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('18:30:00')).toBe(false);
  });

  it('un créneau normalisé se concatène en un instant valide (le calcul de délai de l’app)', () => {
    const start = normalizeTimeString('9:00') as string;
    expect(Number.isNaN(new Date(`2026-06-09T${start}:00`).getTime())).toBe(false);
    // la forme brute, elle, donnait un Invalid Date silencieux
    expect(Number.isNaN(new Date('2026-06-09T9:00:00').getTime())).toBe(true);
  });

  it('un créneau normalisé se trie en chaîne comme il se trie en temps', () => {
    const raw = ['9:00', '10:00', '18:30'];
    expect([...raw].sort()).toEqual(['10:00', '18:30', '9:00']);
    expect(raw.map(r => normalizeTimeString(r) as string).sort())
      .toEqual(['09:00', '10:00', '18:30']);
  });
});
