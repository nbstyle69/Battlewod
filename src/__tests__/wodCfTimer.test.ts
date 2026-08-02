import { buildCFTimerRunParams } from '../utils/wod/cfTimer';

const wod = (method: string, cap: number) => ({ title: 'Rogue Gauntlet', method, time_cap_min: cap });
const opts = { withCamera: false, countdown: 10 };

describe('buildCFTimerRunParams', () => {
  it('passe le time cap en maxTime sur les For Time (sinon chrono sans borne)', () => {
    const p = buildCFTimerRunParams(wod('FOR TIME', 19), opts);
    expect(p.timerType).toBe('for-time');
    expect(p.maxTime).toBe(19 * 60);
  });

  it('gère les variantes de méthode For Time', () => {
    const p = buildCFTimerRunParams(wod('FOR TIME (Benchmark)', 8), opts);
    expect(p.timerType).toBe('for-time');
    expect(p.maxTime).toBe(8 * 60);
  });

  it('mappe AMRAP sur la durée totale', () => {
    const p = buildCFTimerRunParams(wod('AMRAP', 10), opts);
    expect(p.timerType).toBe('amrap');
    expect(p.totalSeconds).toBe(600);
  });

  it('mappe EMOM et Tabata', () => {
    expect(buildCFTimerRunParams(wod('EMOM', 12), opts)).toMatchObject({ timerType: 'emom', interval: 1, rounds: 12 });
    expect(buildCFTimerRunParams(wod('TABATA', 4), opts)).toMatchObject({ timerType: 'tabata', rounds: 8, workTime: 20, restTime: 10 });
  });

  it('transmet le choix caméra', () => {
    expect(buildCFTimerRunParams(wod('FOR TIME', 12), { ...opts, withCamera: true }).withCamera).toBe(true);
  });
});
