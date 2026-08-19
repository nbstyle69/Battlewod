// Maps a BoxWOD to a Timer SeqBlock so the athlete can launch a
// preconfigured timer directly from the whiteboard.
import { BoxWOD } from '../types';
import { SeqBlock, BlockType } from '../navigation';
import { formatCap } from './scoreFormat';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Durée d'un bloc en secondes. `durationSec` fait foi ; `durationMin` ne sert
 * qu'aux blocs construits en minutes (générateurs, chrono manuel). Arrondir un
 * cap de 750 s à 13 min donne 30 secondes de rab à l'athlète — un score faussé,
 * pas un libellé approximatif.
 */
export function blockDurationSec(b: Pick<SeqBlock, 'durationMin' | 'durationSec'>): number {
  return b.durationSec ?? b.durationMin * 60;
}

/** `750` → `12:30`, `600` → `10 min`. */
export function formatDurationLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : formatCap(seconds);
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
  const capSec = wod.time_cap_seconds && wod.time_cap_seconds > 0 ? wod.time_cap_seconds : 0;
  const capMin = Math.floor(capSec / 60);
  const rounds = wod.rounds && wod.rounds > 0 ? wod.rounds : undefined;
  const emomInterval = wod.emom_interval_minutes && wod.emom_interval_minutes > 0 ? wod.emom_interval_minutes : 1;
  const tabWork = wod.tabata_work_seconds && wod.tabata_work_seconds > 0 ? wod.tabata_work_seconds : 20;
  const tabRest = wod.tabata_rest_seconds != null && wod.tabata_rest_seconds >= 0 ? wod.tabata_rest_seconds : 10;

  // Defaults
  const base: SeqBlock = {
    id: newId(),
    type: 'for-time',
    durationMin: 0,
    durationSec: 0,
    emomInterval: 1,
    emomRounds: 10,
    workSec: 20,
    restSec: 10,
    tabRounds: 8,
    pauseSec: 0,
  };

  switch (type) {
    case 'amrap':
      return capSec > 0
        ? { ...base, type: 'amrap', durationMin: capMin, durationSec: capSec }
        : { ...base, type: 'amrap', durationMin: 10, durationSec: 600 };

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
      return { ...base, type: 'for-time', durationMin: capMin, durationSec: capSec };

    // strength / custom / anything else → chrono libre type for-time
    default:
      return { ...base, type: 'for-time', durationMin: capMin, durationSec: capSec };
  }
}

/**
 * Human-readable summary of a WOD preconfig, e.g. "AMRAP · 10 min".
 */
export function formatWODPreconfig(wod: WODConfigFields): string {
  const type = (wod.wod_type ?? 'for-time') as string;
  const capSec = wod.time_cap_seconds && wod.time_cap_seconds > 0 ? wod.time_cap_seconds : 0;
  const capMin = Math.floor(capSec / 60);
  const rounds = wod.rounds && wod.rounds > 0 ? wod.rounds : undefined;
  const emomInterval = wod.emom_interval_minutes && wod.emom_interval_minutes > 0 ? wod.emom_interval_minutes : 1;
  const tabWork = wod.tabata_work_seconds && wod.tabata_work_seconds > 0 ? wod.tabata_work_seconds : 20;
  const tabRest = wod.tabata_rest_seconds != null && wod.tabata_rest_seconds >= 0 ? wod.tabata_rest_seconds : 10;

  switch (type) {
    case 'amrap':
      return `AMRAP · ${formatDurationLabel(capSec > 0 ? capSec : 600)}`;
    case 'emom': {
      const label = emomInterval === 1 ? 'EMOM' : `E${emomInterval}MOM`;
      const nRounds = rounds ?? (capMin > 0 ? Math.max(1, Math.floor(capMin / emomInterval)) : 10);
      return `${label} · ${nRounds} rounds`;
    }
    case 'tabata':
      return `Tabata · ${rounds ?? 8} × ${tabWork}/${tabRest}s`;
    case 'for-time':
      return capSec > 0 ? `For Time · Cap ${formatDurationLabel(capSec)}` : 'For Time · Chrono libre';
    case 'strength':
      return capSec > 0 ? `Strength · ${formatDurationLabel(capSec)}` : 'Strength · Chrono libre';
    default:
      return capSec > 0 ? `Chrono · ${formatDurationLabel(capSec)}` : 'Chrono libre';
  }
}

/** Timer modes selectable from the whiteboard launcher (mirror TimerScreen). */
export const TIMER_BLOCK_TYPES: { key: BlockType; label: string }[] = [
  { key: 'for-time', label: 'FOR TIME' },
  { key: 'amrap', label: 'AMRAP' },
  { key: 'emom', label: 'EMOM' },
  { key: 'tabata', label: 'TABATA' },
  { key: 'ywyr', label: 'YWYR' },
];

const SUPPORTED_BLOCK_TYPES: BlockType[] = ['for-time', 'amrap', 'emom', 'tabata', 'ywyr'];

/**
 * Build a fully-seeded SeqBlock from a BoxWOD: every mode-specific field is
 * populated from the WOD so the athlete can freely switch the timer mode in the
 * launcher without losing sensible defaults. The block's `type` is derived from
 * the WOD, defaulting to for-time for non-temporized WODs.
 */
export function buildFullSeqBlockFromWOD(wod: WODConfigFields): SeqBlock {
  const rawType = (wod.wod_type ?? 'for-time') as BlockType;
  const type: BlockType = SUPPORTED_BLOCK_TYPES.includes(rawType) ? rawType : 'for-time';
  const capSec = wod.time_cap_seconds && wod.time_cap_seconds > 0 ? wod.time_cap_seconds : 0;
  const capMin = Math.floor(capSec / 60);
  const rounds = wod.rounds && wod.rounds > 0 ? wod.rounds : undefined;
  const emomInterval = wod.emom_interval_minutes && wod.emom_interval_minutes > 0 ? wod.emom_interval_minutes : 1;
  const tabWork = wod.tabata_work_seconds && wod.tabata_work_seconds > 0 ? wod.tabata_work_seconds : 20;
  const tabRest = wod.tabata_rest_seconds != null && wod.tabata_rest_seconds >= 0 ? wod.tabata_rest_seconds : 10;

  return {
    id: newId(),
    type,
    // amrap: duration; for-time: cap (0 = ∞)
    durationMin: type === 'amrap' && capSec === 0 ? 10 : capMin,
    durationSec: type === 'amrap' && capSec === 0 ? 600 : capSec,
    emomInterval,
    emomRounds: rounds ?? (capMin > 0 ? Math.max(1, Math.floor(capMin / emomInterval)) : 10),
    emomCustomSec: 90,
    workSec: tabWork,
    restSec: tabRest,
    tabRounds: rounds ?? 8,
    pauseSec: 0,
  };
}

/** Human-readable summary of an edited SeqBlock, e.g. "AMRAP · 10 min". */
export function formatBlockPreconfig(b: SeqBlock): string {
  const durSec = blockDurationSec(b);
  switch (b.type) {
    case 'amrap':
      return `AMRAP · ${formatDurationLabel(durSec > 0 ? durSec : 600)}`;
    case 'emom': {
      const isPerso = b.emomInterval === 0;
      const label = isPerso ? 'EMOM PERSO' : b.emomInterval === 1 ? 'EMOM' : `E${b.emomInterval}MOM`;
      return `${label} · ${b.emomRounds} rounds`;
    }
    case 'tabata':
      return `Tabata · ${b.tabRounds} × ${b.workSec}/${b.restSec}s`;
    case 'ywyr':
      return 'YWYR · Your Work Your Rest';
    case 'for-time':
    default:
      return durSec > 0 ? `For Time · Cap ${formatDurationLabel(durSec)}` : 'For Time · Chrono libre';
  }
}

/**
 * Build TimerRun params (libre mode) from an already-edited SeqBlock, so the
 * whiteboard launcher can run any timer mode chosen by the athlete.
 */
export function buildTimerRunParamsFromBlock(
  block: SeqBlock,
  videoTitle: string,
  opts: { withCamera: boolean; countdown: number },
) {
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
    videoTitle: videoTitle.trim(),
    withTimestamp: true,
  };
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
