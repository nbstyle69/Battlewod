import { generateCFWod, cfSignature, generateFreshCF, CFParams } from '../utils/wod/engineCrossFit';
import { generateHyroxWod, generateFreshHyrox, HyroxParams } from '../utils/wod/engineHyrox';

const CF_METHODS: CFParams['method'][] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];

function baseCF(method: CFParams['method']): CFParams {
  return { level: 'RX', format: 'Solo', intent: 'Mixed', method, duration_min: 20, equipment: [], benchmark: false };
}

describe('AUDIT — générateur de WOD (moteur déterministe)', () => {
  it('déterminisme : même seed → WOD identique (les 5 méthodes)', () => {
    for (const m of CF_METHODS) {
      const a = generateCFWod(baseCF(m), 12345);
      const b = generateCFWod(baseCF(m), 12345);
      expect(cfSignature(a)).toBe(cfSignature(b));
      expect(a.blocks.length).toBeGreaterThan(0);
      expect(a.title).toBeTruthy();
    }
  });

  it('seeds différents → WOD généralement différents', () => {
    const sigs = new Set(Array.from({ length: 20 }, (_, i) => cfSignature(generateCFWod(baseCF('For Time'), 1000 + i))));
    expect(sigs.size).toBeGreaterThan(10);
  });

  it('anti-répétition : generateFreshCF évite les signatures récentes', () => {
    const recent: string[] = [];
    for (let i = 0; i < 8; i++) {
      const w = generateFreshCF(baseCF('AMRAP'), recent, 5);
      const sig = cfSignature(w);
      expect(recent).not.toContain(sig);
      recent.push(sig);
    }
  });

  it('structure valide : chaque bloc a des mouvements, time_cap cohérent', () => {
    for (const m of CF_METHODS) {
      const w = generateCFWod(baseCF(m), 777);
      expect(w.time_cap_min).toBeGreaterThan(0);
      expect(w.score_type).toBeTruthy();
      for (const blk of w.blocks) expect(blk.movements.length).toBeGreaterThan(0);
    }
  });

  it('Hyrox : déterminisme + structure', () => {
    const p: HyroxParams = {
      category: 'Men', duration_min: 45, session_type: 'Interval', format: 'Solo',
      training_type: 'Station Training', equipment: [], vest: 'off',
    };
    const a = generateHyroxWod(p, 42);
    const b = generateHyroxWod(p, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const fresh = generateFreshHyrox(p, [], 5);
    expect(fresh).toBeTruthy();
  });
});
