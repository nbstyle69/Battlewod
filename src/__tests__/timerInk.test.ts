import { TIMER_THEMES, ensureContrast, inkOn } from '../theme/timerInk';
import { contrast } from '../theme/contrast';

const TEXT_MIN = 4.5;
const GLYPH_MIN = 3;

// Les fonds du minuteur sont opaques : le ratio se mesure directement.
const PHASES = ['bgCountdown', 'bgRunning', 'bgDone'] as const;

describe('encre du minuteur plein écran', () => {
  const cases = TIMER_THEMES.flatMap(t =>
    PHASES.map(phase => [`${t.label} · ${phase}`, t[phase]] as [string, string]),
  );

  it.each(cases)('%s — l\'encre principale est lisible', (_name, bg) => {
    expect(contrast(inkOn(bg), bg)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(cases)('%s — les chiffres choisis restent visibles', (_name, bg) => {
    // Le chiffre passe par ensureContrast : sa couleur brute peut être proche
    // du fond, le résultat ne doit jamais l'être.
    TIMER_THEMES.forEach(t => {
      expect(contrast(ensureContrast(t.digitColor, bg), bg)).toBeGreaterThanOrEqual(GLYPH_MIN);
    });
  });

  it.each(cases)('%s — les étiquettes travail / repos / terminer restent visibles', (_name, bg) => {
    ['#F59E0B', '#60A5FA', '#4ADE80', '#EF4444'].forEach(domain => {
      expect(contrast(ensureContrast(domain, bg), bg)).toBeGreaterThanOrEqual(GLYPH_MIN);
    });
  });

  // Contrôle de régression : le défaut corrigé était un blanc en dur. S'il
  // revenait, ces fonds-là le rendraient illisible — et ce test le nomme.
  it('mesure le défaut historique : le blanc en dur sur les palettes claires', () => {
    const clear = TIMER_THEMES.filter(t => ['blanc', 'solar', 'emerald', 'ocean'].includes(t.id));
    expect(clear.length).toBe(4);
    clear.forEach(t => {
      expect(contrast('#FFFFFF', t.bgDone)).toBeLessThan(GLYPH_MIN);
    });
  });
});
