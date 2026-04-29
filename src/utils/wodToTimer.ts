// Maps a BoxWOD to a Timer SeqBlock so the athlete can launch a
// preconfigured timer directly from the whiteboard.
import { BoxWOD } from '../types';
import { SeqBlock, BlockType } from '../navigation';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Build a single SeqBlock from a BoxWOD. Always returns a usable block,
 * falling back to a for-time chrono when the WOD type is non-temporized
 * (strength / custom / undefined).
 */
type WODConfigFields = Pick<
  BoxWOD,
  'wod_type' | 'time_cap_seconds' | 'rounds' | 'emom_interval_minutes' | 'tabata_work_seconds' | 'tabata_rest_seconds'
>;

export type EmomOverride = {
  intervalMinutes: number; // 1-5, ou 0 = PERSO (utilise customSec)
  customSec?: number;
  rounds: number;
};

export function buildSeqBlockFromWOD(wod: WODConfigFields, emomOverride?: EmomOverride): SeqBlock {
  const type = (wod.wod_type ?? 'for-time') as string;
  const capMin = wod.time_cap_seconds ? Math.max(0, Math.round(wod.time_cap_seconds / 60)) : 0;
  const rounds = wod.rounds && wod.rounds > 0 ? wod.rounds : undefined;
  const emomInterval = wod.emom_interval_minutes && wod.emom_interval_minutes > 0 ? wod.emom_interval_minutes : 1;
  const tabWork = wod.tabata_work_seconds && wod.tabata_work_seconds > 0 ? wod.tabata_work_seconds : 20;
  const tabRest = wod.tabata_rest_seconds != null && wod.tabata_rest_seconds >= 0 ? wod.tabata_rest_seconds : 10;

  // Defaults
  const base: SeqBlock = {
    id: newId(),
    type: 'for-time',
    durationMin: 0,
    emomInterval: 1,
    emomRounds: 10,
    workSec: 20,
    restSec: 10,
    tabRounds: 8,
    pauseSec: 0,
  };

  switch (type) {
    case 'amrap':
      return { ...base, type: 'amrap', durationMin: capMin > 0 ? capMin : 10 };

    case 'emom':
      if (emomOverride) {
        return {
          ...base,
          type: 'emom',
          emomInterval: emomOverride.intervalMinutes, // 0 = PERSO
          emomCustomSec: emomOverride.customSec,
          emomRounds: Math.max(1, emomOverride.rounds),
        };
      }
      return {
        ...base,
        type: 'emom',
        emomInterval,
        emomRounds: rounds ?? (capMin > 0 ? Math.max(1, Math.floor(capMin / emomInterval)) : 10),
      };

    case 'tabata':
      return { ...base, type: 'tabata', workSec: tabWork, restSec: tabRest, tabRounds: rounds ?? 8 };

    case 'for-time':
      return { ...base, type: 'for-time', durationMin: capMin };

    // strength / custom / anything else → chrono libre type for-time
    default:
      return { ...base, type: 'for-time', durationMin: capMin };
  }
}

/**
 * Human-readable summary of a WOD preconfig, e.g. "AMRAP · 10 min".
 */
export function formatWODPreconfig(wod: WODConfigFields): string {
  const type = (wod.wod_type ?? 'for-time') as string;
  const capMin = wod.time_cap_seconds ? Math.max(0, Math.round(wod.time_cap_seconds / 60)) : 0;
  const rounds = wod.rounds && wod.rounds > 0 ? wod.rounds : undefined;
  const emomInterval = wod.emom_interval_minutes && wod.emom_interval_minutes > 0 ? wod.emom_interval_minutes : 1;
  const tabWork = wod.tabata_work_seconds && wod.tabata_work_seconds > 0 ? wod.tabata_work_seconds : 20;
  const tabRest = wod.tabata_rest_seconds != null && wod.tabata_rest_seconds >= 0 ? wod.tabata_rest_seconds : 10;

  switch (type) {
    case 'amrap':
      return `AMRAP · ${capMin > 0 ? capMin : 10} min`;
    case 'emom': {
      const label = emomInterval === 1 ? 'EMOM' : `E${emomInterval}MOM`;
      const nRounds = rounds ?? (capMin > 0 ? Math.max(1, Math.floor(capMin / emomInterval)) : 10);
      return `${label} · ${nRounds} rounds`;
    }
    case 'tabata':
      return `Tabata · ${rounds ?? 8} × ${tabWork}/${tabRest}s`;
    case 'for-time':
      return capMin > 0 ? `For Time · Cap ${capMin} min` : 'For Time · Chrono libre';
    case 'strength':
      return capMin > 0 ? `Strength · ${capMin} min` : 'Strength · Chrono libre';
    default:
      return capMin > 0 ? `Chrono · ${capMin} min` : 'Chrono libre';
  }
}

/**
 * Build full TimerRun navigation params (libre mode with a single preconfigured block).
 */
export function buildTimerRunParams(
  wod: Pick<BoxWOD, 'wod_type' | 'time_cap_seconds' | 'rounds' | 'title' | 'emom_interval_minutes' | 'tabata_work_seconds' | 'tabata_rest_seconds'>,
  opts: { withCamera: boolean; countdown: number; emomOverride?: EmomOverride },
) {
  const block = buildSeqBlockFromWOD(wod as any, opts.emomOverride);
  return {
    timerType: 'libre' as const,
    countdown: opts.countdown,
    totalSeconds: 0,
    maxTime: 0,
    interval: 0,
    rounds: 0,
    workTime: 0,
    restTime: 0,
    withCamera: opts.withCamera,
    sequence: JSON.stringify([block]),
    videoTitle: wod.title?.trim() ?? '',
    withTimestamp: true,
  };
}

// Re-export BlockType so consumers can type-check if needed.
export type { BlockType };
