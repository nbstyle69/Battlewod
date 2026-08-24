import { lightTheme, darkTheme } from '../theme/palette';
import { LevelColors } from '../theme/designTokens';
import { contrast } from '../theme/contrast';

const MIN = 3;

describe('couleurs de domaine partagées', () => {
  const cases: [string, string][] = [
    ...Object.entries(LevelColors).map(([k, v]) => [`niveau ${k}`, v] as [string, string]),
  ];

  it.each(cases)('%s — lisible sur carte claire', (_name, color) => {
    expect(contrast(color, lightTheme.card, lightTheme.background)).toBeGreaterThanOrEqual(MIN);
  });

  it.each(cases)('%s — lisible sur carte sombre', (_name, color) => {
    expect(contrast(color, darkTheme.card, darkTheme.background)).toBeGreaterThanOrEqual(MIN);
  });

  it.each([['gold'], ['silver'], ['bronze'], ['success'], ['error'], ['warning']] as const)(
    'le jeton sémantique %s est lisible dans les deux thèmes',
    (key) => {
      expect(contrast(lightTheme[key], lightTheme.card, lightTheme.background)).toBeGreaterThanOrEqual(MIN);
      expect(contrast(darkTheme[key], darkTheme.card, darkTheme.background)).toBeGreaterThanOrEqual(MIN);
    },
  );
});
