/**
 * Bloc musculation : séries × reps × charge, sérialisé dans `description`.
 *
 * Les mouvements de WOD sont écrits « reps d'abord » (`21 Thruster (43 kg)`) et
 * c'est cette forme que le crédit de badges parse (`parseMovementLine`). Un bloc
 * de force est écrit « nom d'abord » :
 *
 *   Back Squat — 5 × 3 @ 80 %1RM — repos 2:00 — tempo 30X1
 *
 * L'absence de chiffre en tête est ce qui le rend invisible au crédit : les
 * parseurs de l'app déjà installée rendent `null` sur cette ligne, donc un bloc
 * de force n'invente ni reps ni badge, et reste lisible tel quel sans mise à
 * jour. `serializeStrength` garantit cette propriété (le nom est nettoyé de tout
 * chiffre de tête) ; le test de non-crédit la verrouille.
 */

export type StrengthLoadUnit = 'kg' | '%1RM';

export interface StrengthEntry {
  name: string;
  sets: number;
  reps: number;
  /** Charge prescrite, dans `unit`. `null` = à l'appréciation de l'athlète. */
  load: number | null;
  unit: StrengthLoadUnit;
  restSec: number | null;
  tempo: string | null;
}

const SEP = ' — ';

/** Un bloc de force ne doit jamais commencer par un chiffre (cf. en-tête). */
function sanitizeName(name: string): string {
  // Un tiret entouré d'espaces est le séparateur de la ligne : il ne peut pas
  // rester dans le nom (« Toes-to-Bar » n'est pas concerné, son tiret est collé).
  return name.replace(/^[\d\s×x.,:—–-]+/, '').replace(/\s+[—–-]\s+/g, ' ').trim();
}

function formatRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function parseRest(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(/\s/g, '');
  const mmss = raw.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
  const sec = raw.match(/^(\d+)s?$/);
  if (sec) return parseInt(sec[1], 10);
  return null;
}

export function serializeStrength(e: StrengthEntry): string {
  const name = sanitizeName(e.name);
  if (!name) return '';
  const sets = Math.max(1, Math.round(e.sets));
  const reps = Math.max(1, Math.round(e.reps));
  let out = `${name}${SEP}${sets} × ${reps}`;
  if (e.load != null && e.load > 0) out += ` @ ${e.load} ${e.unit}`;
  if (e.restSec != null && e.restSec > 0) out += `${SEP}repos ${formatRest(e.restSec)}`;
  const tempo = (e.tempo ?? '').trim();
  if (tempo) out += `${SEP}tempo ${tempo}`;
  return out;
}

export function parseStrengthLine(line: string): StrengthEntry | null {
  const raw = (line ?? '').trim();
  if (!raw || /^\d/.test(raw)) return null;    // « reps d'abord » = mouvement de WOD
  const parts = raw.split(/\s+[—–-]\s+/);
  if (parts.length < 2) return null;
  const name = parts[0].trim();
  if (!name) return null;

  const m = parts[1].match(/^(\d+)\s*[x×]\s*(\d+)(?:\s*@\s*(\d+(?:[.,]\d+)?)\s*(kg|%\s*1rm|%))?$/i);
  if (!m) return null;

  const load = m[3] != null ? parseFloat(m[3].replace(',', '.')) : null;
  const unit: StrengthLoadUnit = m[4] != null && m[4].toLowerCase().startsWith('kg') ? 'kg' : '%1RM';

  let restSec: number | null = null;
  let tempo: string | null = null;
  for (const tail of parts.slice(2)) {
    const rest = tail.match(/^repos\s+(.+)$/i);
    if (rest) { restSec = parseRest(rest[1]); continue; }
    const tp = tail.match(/^tempo\s+(.+)$/i);
    if (tp) tempo = tp[1].trim();
  }

  return {
    name,
    sets: parseInt(m[1], 10),
    reps: parseInt(m[2], 10),
    load,
    unit: load == null ? 'kg' : unit,
    restSec,
    tempo,
  };
}

export function isStrengthLine(line: string): boolean {
  return parseStrengthLine(line) !== null;
}

/** Sépare une description en mouvements de WOD (crédités) et blocs de force. */
export function splitStrengthLines(lines: string[]): { wod: string[]; strength: string[] } {
  const wod: string[] = [];
  const strength: string[] = [];
  for (const l of lines) (isStrengthLine(l) ? strength : wod).push(l);
  return { wod, strength };
}

const LOAD_STEP = 2.5;

/**
 * Charge réelle d'un bloc, en kg. Une prescription en `%1RM` a besoin du 1RM de
 * l'athlète : sans lui (records vides, mouvement inconnu) elle reste un
 * pourcentage et cette fonction rend `null` — jamais une charge inventée.
 */
export function resolveStrengthLoadKg(
  e: Pick<StrengthEntry, 'load' | 'unit'>,
  oneRepMaxKg: number | null | undefined,
): number | null {
  if (e.load == null || e.load <= 0) return null;
  if (e.unit === 'kg') return e.load;
  if (oneRepMaxKg == null || oneRepMaxKg <= 0) return null;
  return Math.round((oneRepMaxKg * e.load) / 100 / LOAD_STEP) * LOAD_STEP;
}

/**
 * Description d'un WOD où chaque bloc en `%1RM` porte la charge de l'athlète
 * (« … @ 80 %1RM (≈ 152.5 kg) »). Les autres lignes sont rendues intactes, et un
 * pourcentage sans 1RM connu reste un pourcentage nu.
 *
 * `oneRepMaxFor` est injecté : ce module ne lit jamais `personal_records`
 * lui-même (l'athlète passe par `get_my_profile()`, le staff par sa RPC).
 */
export function annotateStrengthLoads(
  description: string,
  oneRepMaxFor: (movementName: string) => number | null,
): string {
  return description
    .split('\n')
    .map(line => {
      const e = parseStrengthLine(line);
      if (!e || e.unit !== '%1RM' || e.load == null) return line;
      const kg = resolveStrengthLoadKg(e, oneRepMaxFor(e.name));
      return kg == null ? line : `${line.trimEnd()} (≈ ${kg} kg)`;
    })
    .join('\n');
}

/** « 5 × 3 @ 80 %1RM (≈ 152.5 kg) » — le kg n'apparaît que s'il est connu. */
export function formatStrengthPrescription(
  e: StrengthEntry,
  oneRepMaxKg?: number | null,
): string {
  let out = `${e.sets} × ${e.reps}`;
  if (e.load == null || e.load <= 0) return out;
  out += ` @ ${e.load} ${e.unit}`;
  if (e.unit === '%1RM') {
    const kg = resolveStrengthLoadKg(e, oneRepMaxKg);
    if (kg != null) out += ` (≈ ${kg} kg)`;
  }
  return out;
}
