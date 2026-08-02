// Mappe un WOD CrossFit généré vers les paramètres du chrono existant.
// Même convention que le générateur historique (WodGeneratorCard) : le time cap
// est passé en `maxTime` sur les For Time, sinon le chrono tournerait sans borne.
import { CFWod } from './engineCrossFit';

export type CFTimerRunParams = {
  timerType: 'for-time' | 'amrap' | 'emom' | 'tabata';
  countdown: number;
  totalSeconds: number;
  maxTime: number;
  interval: number;
  rounds: number;
  workTime: number;
  restTime: number;
  withCamera: boolean;
  sequence: string;
  videoTitle: string;
  withTimestamp: boolean;
};

export function buildCFTimerRunParams(
  wod: Pick<CFWod, 'title' | 'method' | 'time_cap_min'>,
  opts: { withCamera: boolean; countdown: number },
): CFTimerRunParams {
  const cap = Math.max(0, Math.round(wod.time_cap_min)) * 60;
  const method = wod.method.toUpperCase();
  const base = {
    countdown: opts.countdown,
    totalSeconds: 0,
    maxTime: 0,
    interval: 0,
    rounds: 0,
    workTime: 0,
    restTime: 0,
    withCamera: opts.withCamera,
    sequence: '[]',
    videoTitle: wod.title.trim(),
    withTimestamp: true,
  };

  if (method.startsWith('AMRAP') || method.startsWith('MAX REPS')) {
    return { ...base, timerType: 'amrap', totalSeconds: cap > 0 ? cap : 600 };
  }
  if (method.startsWith('EMOM')) {
    return { ...base, timerType: 'emom', interval: 1, rounds: Math.max(1, Math.round(wod.time_cap_min)) };
  }
  if (method.startsWith('TABATA')) {
    return { ...base, timerType: 'tabata', rounds: 8, workTime: 20, restTime: 10 };
  }
  return { ...base, timerType: 'for-time', maxTime: cap };
}
