import {
  buildSeqBlockFromWOD,
  formatWODPreconfig,
  buildTimerRunParams,
  buildFullSeqBlockFromWOD,
  buildTimerRunParamsFromBlock,
  formatBlockPreconfig,
  blockDurationSec,
  formatDurationLabel,
  TIMER_BLOCK_TYPES,
} from '../utils/wodToTimer';
import { SeqBlock } from '../navigation';

type WodInput = {
  wod_type?: string | null;
  time_cap_seconds?: number | null;
  rounds?: number | null;
  emom_interval_minutes?: number | null;
  tabata_work_seconds?: number | null;
  tabata_rest_seconds?: number | null;
  title?: string | null;
};

// ── buildSeqBlockFromWOD ───────────────────────────────────────────────────────

describe('buildSeqBlockFromWOD', () => {
  it('returns for-time block with correct durationMin', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'for-time', time_cap_seconds: 1200 } as any);
    expect(b.type).toBe('for-time');
    expect(b.durationMin).toBe(20);
  });

  it('returns for-time with durationMin=0 when no time_cap', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'for-time' } as any);
    expect(b.type).toBe('for-time');
    expect(b.durationMin).toBe(0);
  });

  it('returns amrap with default 10 min when no time_cap', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'amrap' } as any);
    expect(b.type).toBe('amrap');
    expect(b.durationMin).toBe(10);
  });

  it('returns amrap with correct duration from time_cap', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'amrap', time_cap_seconds: 900 } as any);
    expect(b.type).toBe('amrap');
    expect(b.durationMin).toBe(15);
  });

  it('returns emom with default interval=1 and rounds=10', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'emom' } as any);
    expect(b.type).toBe('emom');
    expect(b.emomInterval).toBe(1);
    expect(b.emomRounds).toBe(10);
  });

  it('returns emom with calculated rounds from time_cap and interval', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'emom', time_cap_seconds: 1200, emom_interval_minutes: 2 } as any);
    expect(b.type).toBe('emom');
    expect(b.emomInterval).toBe(2);
    expect(b.emomRounds).toBe(10); // floor(20/2)
  });

  it('returns emom using explicit rounds field when no time_cap', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'emom', rounds: 7 } as any);
    expect(b.type).toBe('emom');
    expect(b.emomRounds).toBe(7);
  });

  it('applies emomOverride (intervalMinutes + rounds)', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'emom' } as any, { intervalMinutes: 3, rounds: 5 });
    expect(b.type).toBe('emom');
    expect(b.emomInterval).toBe(3);
    expect(b.emomRounds).toBe(5);
  });

  it('applies emomOverride with customSec when intervalMinutes=0', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'emom' } as any, { intervalMinutes: 0, customSec: 90, rounds: 8 });
    expect(b.type).toBe('emom');
    expect(b.emomInterval).toBe(0);
    expect((b as any).emomCustomSec).toBe(90);
    expect(b.emomRounds).toBe(8);
  });

  it('returns tabata with default work/rest/rounds', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'tabata' } as any);
    expect(b.type).toBe('tabata');
    expect(b.workSec).toBe(20);
    expect(b.restSec).toBe(10);
    expect(b.tabRounds).toBe(8);
  });

  it('returns tabata with custom work/rest/rounds', () => {
    const b = buildSeqBlockFromWOD({
      wod_type: 'tabata', tabata_work_seconds: 30, tabata_rest_seconds: 15, rounds: 6,
    } as any);
    expect(b.type).toBe('tabata');
    expect(b.workSec).toBe(30);
    expect(b.restSec).toBe(15);
    expect(b.tabRounds).toBe(6);
  });

  it('tabata allows restSec=0', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'tabata', tabata_rest_seconds: 0 } as any);
    expect(b.restSec).toBe(0);
  });

  it('falls back to for-time for strength wod_type', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'strength', time_cap_seconds: 600 } as any);
    expect(b.type).toBe('for-time');
    expect(b.durationMin).toBe(10);
  });

  it('falls back to for-time when wod_type is undefined', () => {
    const b = buildSeqBlockFromWOD({} as any);
    expect(b.type).toBe('for-time');
  });

  it('always returns a non-empty string id', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'amrap' } as any);
    expect(typeof b.id).toBe('string');
    expect(b.id.length).toBeGreaterThan(0);
  });

  it('returns unique id on each call', () => {
    const b1 = buildSeqBlockFromWOD({ wod_type: 'amrap' } as any);
    const b2 = buildSeqBlockFromWOD({ wod_type: 'amrap' } as any);
    expect(b1.id).not.toBe(b2.id);
  });

  // Un cap de 12:30 arrondi à 13 min donnait 30 secondes de rab à l'athlète :
  // un score AMRAP faussé, pas un libellé approximatif.
  it('garde les secondes du time cap à la seconde (750s ≠ 13 min)', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'amrap', time_cap_seconds: 750 } as any);
    expect(b.durationSec).toBe(750);
    expect(blockDurationSec(b)).toBe(750);
    expect(blockDurationSec(b)).not.toBe(780);
  });

  it('for-time garde aussi les secondes du cap', () => {
    const b = buildSeqBlockFromWOD({ wod_type: 'for-time', time_cap_seconds: 1230 } as any);
    expect(blockDurationSec(b)).toBe(1230);
  });
});

// ── blockDurationSec / formatDurationLabel ────────────────────────────────────

describe('blockDurationSec', () => {
  it('retombe sur durationMin pour les blocs construits en minutes', () => {
    expect(blockDurationSec({ durationMin: 12 })).toBe(720);
    expect(blockDurationSec({ durationMin: 0 })).toBe(0);
  });

  it('donne la priorité à durationSec', () => {
    expect(blockDurationSec({ durationMin: 12, durationSec: 750 })).toBe(750);
    expect(blockDurationSec({ durationMin: 13, durationSec: 0 })).toBe(0);
  });
});

describe('formatDurationLabel', () => {
  it('affiche mm:ss dès qu\'il y a des secondes, min sinon', () => {
    expect(formatDurationLabel(750)).toBe('12:30');
    expect(formatDurationLabel(600)).toBe('10 min');
    expect(formatDurationLabel(1230)).toBe('20:30');
  });
});

// ── formatWODPreconfig ─────────────────────────────────────────────────────────

describe('formatWODPreconfig', () => {
  it('formats AMRAP with time cap', () => {
    expect(formatWODPreconfig({ wod_type: 'amrap', time_cap_seconds: 900 } as any)).toBe('AMRAP · 15 min');
  });

  it('formats AMRAP with default 10 min when no time_cap', () => {
    expect(formatWODPreconfig({ wod_type: 'amrap' } as any)).toBe('AMRAP · 10 min');
  });

  it('formats EMOM (1-min) as "EMOM · N rounds"', () => {
    expect(formatWODPreconfig({ wod_type: 'emom', time_cap_seconds: 600 } as any)).toBe('EMOM · 10 rounds');
  });

  it('formats E2MOM correctly', () => {
    expect(formatWODPreconfig({ wod_type: 'emom', time_cap_seconds: 1200, emom_interval_minutes: 2 } as any))
      .toBe('E2MOM · 10 rounds');
  });

  it('formats EMOM with explicit rounds', () => {
    expect(formatWODPreconfig({ wod_type: 'emom', rounds: 12 } as any)).toBe('EMOM · 12 rounds');
  });

  it('formats EMOM default 10 rounds when no cap and no rounds', () => {
    expect(formatWODPreconfig({ wod_type: 'emom' } as any)).toBe('EMOM · 10 rounds');
  });

  it('formats Tabata with default values', () => {
    expect(formatWODPreconfig({ wod_type: 'tabata' } as any)).toBe('Tabata · 8 × 20/10s');
  });

  it('formats Tabata with custom values', () => {
    expect(formatWODPreconfig({
      wod_type: 'tabata', tabata_work_seconds: 30, tabata_rest_seconds: 15, rounds: 6,
    } as any)).toBe('Tabata · 6 × 30/15s');
  });

  it('formats For Time with cap', () => {
    expect(formatWODPreconfig({ wod_type: 'for-time', time_cap_seconds: 1200 } as any))
      .toBe('For Time · Cap 20 min');
  });

  it('formats For Time without cap as chrono libre', () => {
    expect(formatWODPreconfig({ wod_type: 'for-time' } as any)).toBe('For Time · Chrono libre');
  });

  it('formats Strength with cap', () => {
    expect(formatWODPreconfig({ wod_type: 'strength', time_cap_seconds: 1800 } as any))
      .toBe('Strength · 30 min');
  });

  it('formats Strength without cap', () => {
    expect(formatWODPreconfig({ wod_type: 'strength' } as any)).toBe('Strength · Chrono libre');
  });

  it('formats unknown type with cap as Chrono · N min', () => {
    expect(formatWODPreconfig({ wod_type: 'custom', time_cap_seconds: 600 } as any))
      .toBe('Chrono · 10 min');
  });

  it('formats unknown type without cap as Chrono libre', () => {
    expect(formatWODPreconfig({ wod_type: 'custom' } as any)).toBe('Chrono libre');
  });

  it('treats missing wod_type as for-time chrono libre', () => {
    expect(formatWODPreconfig({} as any)).toBe('For Time · Chrono libre');
  });
});

// ── buildTimerRunParams ────────────────────────────────────────────────────────

describe('buildTimerRunParams', () => {
  const baseWod: WodInput = {
    wod_type: 'for-time', time_cap_seconds: 1200, title: 'Fran',
    rounds: null, emom_interval_minutes: null, tabata_work_seconds: null, tabata_rest_seconds: null,
  };

  it('returns correct top-level structure', () => {
    const p = buildTimerRunParams(baseWod as any, { withCamera: false, countdown: 10 });
    expect(p.timerType).toBe('libre');
    expect(p.withCamera).toBe(false);
    expect(p.countdown).toBe(10);
    expect(p.withTimestamp).toBe(true);
    expect(typeof p.sequence).toBe('string');
  });

  it('embeds a single block in the sequence', () => {
    const p = buildTimerRunParams(baseWod as any, { withCamera: false, countdown: 10 });
    const seq = JSON.parse(p.sequence);
    expect(seq).toHaveLength(1);
    expect(seq[0].type).toBe('for-time');
    expect(seq[0].durationMin).toBe(20);
  });

  it('trims title whitespace', () => {
    const p = buildTimerRunParams({ ...baseWod, title: '  Helen  ' } as any, { withCamera: true, countdown: 5 });
    expect(p.videoTitle).toBe('Helen');
    expect(p.withCamera).toBe(true);
  });

  it('uses empty string for missing title', () => {
    const p = buildTimerRunParams({ wod_type: 'amrap' } as any, { withCamera: false, countdown: 0 });
    expect(p.videoTitle).toBe('');
  });

  it('passes emomOverride to the block', () => {
    const p = buildTimerRunParams(
      { wod_type: 'emom' } as any,
      { withCamera: false, countdown: 10, emomOverride: { intervalMinutes: 2, rounds: 6 } },
    );
    const seq = JSON.parse(p.sequence);
    expect(seq[0].emomInterval).toBe(2);
    expect(seq[0].emomRounds).toBe(6);
  });

  it('sets all numeric fields to 0', () => {
    const p = buildTimerRunParams(baseWod as any, { withCamera: false, countdown: 5 });
    expect(p.totalSeconds).toBe(0);
    expect(p.maxTime).toBe(0);
    expect(p.interval).toBe(0);
    expect(p.rounds).toBe(0);
    expect(p.workTime).toBe(0);
    expect(p.restTime).toBe(0);
  });
});

// ── buildFullSeqBlockFromWOD (whiteboard mode-editable launcher) ────────────────

describe('buildFullSeqBlockFromWOD', () => {
  it('derives the block type from the WOD', () => {
    expect(buildFullSeqBlockFromWOD({ wod_type: 'amrap' } as any).type).toBe('amrap');
    expect(buildFullSeqBlockFromWOD({ wod_type: 'emom' } as any).type).toBe('emom');
    expect(buildFullSeqBlockFromWOD({ wod_type: 'tabata' } as any).type).toBe('tabata');
    expect(buildFullSeqBlockFromWOD({ wod_type: 'ywyr' } as any).type).toBe('ywyr');
    expect(buildFullSeqBlockFromWOD({ wod_type: 'for-time' } as any).type).toBe('for-time');
  });

  it('falls back to for-time for non-temporized/unknown types', () => {
    expect(buildFullSeqBlockFromWOD({ wod_type: 'strength' } as any).type).toBe('for-time');
    expect(buildFullSeqBlockFromWOD({} as any).type).toBe('for-time');
  });

  it('seeds EVERY mode field so switching mode keeps sensible values', () => {
    // A for-time WOD still carries usable amrap/emom/tabata seeds
    const b = buildFullSeqBlockFromWOD({
      wod_type: 'for-time',
      time_cap_seconds: 900,
      rounds: 6,
      emom_interval_minutes: 2,
      tabata_work_seconds: 30,
      tabata_rest_seconds: 15,
    } as any);
    expect(b.type).toBe('for-time');
    expect(b.durationMin).toBe(15); // cap
    expect(b.emomInterval).toBe(2);
    expect(b.emomRounds).toBe(6);
    expect(b.workSec).toBe(30);
    expect(b.restSec).toBe(15);
    expect(b.tabRounds).toBe(6);
    expect(b.emomCustomSec).toBe(90);
  });

  it('amrap durationMin defaults to 10 when no cap', () => {
    expect(buildFullSeqBlockFromWOD({ wod_type: 'amrap' } as any).durationMin).toBe(10);
  });

  it('for-time durationMin (cap) is 0 when no cap', () => {
    expect(buildFullSeqBlockFromWOD({ wod_type: 'for-time' } as any).durationMin).toBe(0);
  });

  it('returns a unique non-empty id', () => {
    const a = buildFullSeqBlockFromWOD({ wod_type: 'amrap' } as any);
    const b = buildFullSeqBlockFromWOD({ wod_type: 'amrap' } as any);
    expect(a.id.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id);
  });
});

// ── formatBlockPreconfig ────────────────────────────────────────────────────────

describe('formatBlockPreconfig', () => {
  const base: SeqBlock = {
    id: 'x', type: 'for-time', durationMin: 0,
    emomInterval: 1, emomRounds: 10, emomCustomSec: 90,
    workSec: 20, restSec: 10, tabRounds: 8, pauseSec: 0,
  };

  it('formats amrap', () => {
    expect(formatBlockPreconfig({ ...base, type: 'amrap', durationMin: 12 })).toBe('AMRAP · 12 min');
    expect(formatBlockPreconfig({ ...base, type: 'amrap', durationMin: 0 })).toBe('AMRAP · 10 min');
  });

  it('formats emom (fixed, E2MOM, and perso)', () => {
    expect(formatBlockPreconfig({ ...base, type: 'emom', emomInterval: 1, emomRounds: 10 })).toBe('EMOM · 10 rounds');
    expect(formatBlockPreconfig({ ...base, type: 'emom', emomInterval: 2, emomRounds: 8 })).toBe('E2MOM · 8 rounds');
    expect(formatBlockPreconfig({ ...base, type: 'emom', emomInterval: 0, emomRounds: 5 })).toBe('EMOM PERSO · 5 rounds');
  });

  it('formats tabata', () => {
    expect(formatBlockPreconfig({ ...base, type: 'tabata', workSec: 30, restSec: 15, tabRounds: 6 }))
      .toBe('Tabata · 6 × 30/15s');
  });

  it('formats ywyr', () => {
    expect(formatBlockPreconfig({ ...base, type: 'ywyr' })).toBe('YWYR · Your Work Your Rest');
  });

  it('formats for-time with and without cap', () => {
    expect(formatBlockPreconfig({ ...base, type: 'for-time', durationMin: 20 })).toBe('For Time · Cap 20 min');
    expect(formatBlockPreconfig({ ...base, type: 'for-time', durationMin: 0 })).toBe('For Time · Chrono libre');
  });

  // L'écran de lancement affichait « AMRAP · 13 min » pour un cap de 12:30.
  it('affiche les secondes du cap au lieu de les arrondir', () => {
    expect(formatBlockPreconfig({ ...base, type: 'amrap', durationMin: 12, durationSec: 750 }))
      .toBe('AMRAP · 12:30');
    expect(formatBlockPreconfig({ ...base, type: 'for-time', durationMin: 12, durationSec: 750 }))
      .toBe('For Time · Cap 12:30');
    expect(formatWODPreconfig({ wod_type: 'amrap', time_cap_seconds: 750 } as never))
      .toBe('AMRAP · 12:30');
  });
});

// ── buildTimerRunParamsFromBlock ───────────────────────────────────────────────

describe('buildTimerRunParamsFromBlock', () => {
  const block: SeqBlock = {
    id: 'x', type: 'tabata', durationMin: 0,
    emomInterval: 1, emomRounds: 10, emomCustomSec: 90,
    workSec: 25, restSec: 5, tabRounds: 8, pauseSec: 0,
  };

  it('wraps the exact block in the libre sequence', () => {
    const p = buildTimerRunParamsFromBlock(block, 'Grace', { withCamera: true, countdown: 5 });
    expect(p.timerType).toBe('libre');
    expect(p.withCamera).toBe(true);
    expect(p.countdown).toBe(5);
    const seq = JSON.parse(p.sequence);
    expect(seq).toHaveLength(1);
    expect(seq[0].type).toBe('tabata');
    expect(seq[0].workSec).toBe(25);
    expect(seq[0].tabRounds).toBe(8);
  });

  it('trims the video title', () => {
    const p = buildTimerRunParamsFromBlock(block, '  Grace  ', { withCamera: false, countdown: 0 });
    expect(p.videoTitle).toBe('Grace');
  });

  it('exposes all 5 timer modes in the launcher list', () => {
    expect(TIMER_BLOCK_TYPES.map(m => m.key)).toEqual(['for-time', 'amrap', 'emom', 'tabata', 'ywyr']);
  });
});
