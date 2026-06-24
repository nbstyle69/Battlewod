/**
 * BattleWOD — Mapping WOD Hybrid → plan de timer.
 * ===============================================
 * Convertit la structure d'un HyroxWod (FOR TIME / AMRAP / EMOM / INTERVAL /
 * STRENGTH) en une séquence de blocs de timer (`SeqBlock[]`) jouable en mode
 * `libre`. Gère les WOD multi-blocs (Force A/B, Run Split) avec les temps de
 * récupération programmés entre les blocs.
 */
import { SeqBlock, BlockType } from '../../navigation';
import { HyroxWod } from './engineHyrox';

export interface HyroxTimerPlan {
  summary: string;        // résumé lisible, ex. "EMOM · 12 rounds"
  primaryType: BlockType; // type du 1er bloc (pour l'édition rapide)
  editable: boolean;      // true si un seul bloc (édition simple possible)
  sequence: SeqBlock[];   // séquence pour le timer en mode 'libre'
}

let seqCounter = 0;
function newId(): string {
  seqCounter += 1;
  return `hy-${Date.now()}-${seqCounter}`;
}

function baseBlock(): SeqBlock {
  return {
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
}

/** Convertit un texte de repos ("1:30 entre séries", "60-90s", "selon méthode") en secondes. */
export function parseRestSeconds(rest: string | null | undefined): number {
  if (!rest) return 0;
  const clock = rest.match(/(\d+):(\d{1,2})/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  const sec = rest.match(/(\d+)\s*(?:-\s*\d+\s*)?s/i);
  if (sec) return parseInt(sec[1], 10);
  const min = rest.match(/(\d+)\s*min/i);
  if (min) return parseInt(min[1], 10) * 60;
  return 0;
}

function parseRounds(scheme: string): number | undefined {
  const m = scheme.match(/(\d+)\s*(?:rounds?|RFT|tours?)/i) || scheme.match(/(\d+)\s*×/);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseAmrapMin(scheme: string, fallback: number): number {
  const m = scheme.match(/AMRAP\s*(\d+)/i) || scheme.match(/(\d+)\s*min\s*AMRAP/i);
  return m ? parseInt(m[1], 10) : fallback;
}

function parseEmomTotalMin(scheme: string): number | undefined {
  const m = scheme.match(/EMOM\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Construit le plan de timer à partir d'un WOD Hybrid. */
export function buildHyroxTimerPlan(wod: HyroxWod): HyroxTimerPlan {
  const cap = wod.time_cap_min > 0 ? wod.time_cap_min : Math.round(wod.duration_min * 0.9);
  const softCap = Math.round(wod.duration_min * 0.8);
  const sequence: SeqBlock[] = [];

  for (const b of wod.blocks) {
    const s = (b.structure || '').toUpperCase();
    const block = baseBlock();

    if (s.includes('AMRAP')) {
      block.type = 'amrap';
      block.durationMin = parseAmrapMin(b.scheme, softCap);
    } else if (s.includes('EMOM') || s.includes('INTERVAL')) {
      block.type = 'emom';
      block.emomInterval = 1;
      const total = parseEmomTotalMin(b.scheme);
      block.emomRounds = parseRounds(b.scheme) ?? total ?? Math.max(1, cap);
    } else if (s.includes('STRENGTH')) {
      // Force : chrono libre (l'athlète gère son tempo), récup programmée entre blocs.
      block.type = 'for-time';
      block.durationMin = 0;
    } else {
      // FOR TIME / CHIPPER / défaut
      block.type = 'for-time';
      block.durationMin = cap;
    }

    block.pauseSec = parseRestSeconds(b.rest);
    sequence.push(block);
  }

  if (sequence.length === 0) {
    const b = baseBlock();
    b.type = 'for-time';
    b.durationMin = cap;
    sequence.push(b);
  }

  // Pas de pause après le dernier bloc.
  sequence[sequence.length - 1].pauseSec = 0;

  return {
    summary: summarize(wod, sequence),
    primaryType: sequence[0].type,
    editable: sequence.length === 1,
    sequence,
  };
}

function summarize(wod: HyroxWod, seq: SeqBlock[]): string {
  if (seq.length > 1) {
    const rests = seq.slice(0, -1).map((b) => fmtSec(b.pauseSec)).filter(Boolean);
    const restTxt = rests.length ? ` · récup ${rests.join(' / ')}` : '';
    return `${wod.session_type} · ${seq.length} blocs${restTxt}`;
  }
  const b = seq[0];
  switch (b.type) {
    case 'amrap': return `AMRAP · ${b.durationMin} min`;
    case 'emom': return `EMOM · ${b.emomRounds} rounds`;
    case 'for-time':
      return b.durationMin > 0 ? `For Time · cap ${b.durationMin} min` : 'Chrono libre';
    default: return 'Chrono';
  }
}

function fmtSec(sec: number): string {
  if (!sec) return '';
  if (sec % 60 === 0) return `${sec / 60} min`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

/**
 * Construit les params de navigation TimerRun (mode 'libre' avec séquence).
 */
export function buildHyroxTimerRunParams(
  plan: HyroxTimerPlan,
  opts: { countdown: number; title?: string; withCamera?: boolean },
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
    withCamera: opts.withCamera ?? false,
    sequence: JSON.stringify(plan.sequence),
    videoTitle: opts.title?.trim() ?? '',
    withTimestamp: true,
  };
}
