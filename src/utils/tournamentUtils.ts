import { compareScores, normalizeScore } from './scoreFormat';

// ── CF Games points table ─────────────────────────────────────────────────────
export const CF_GAMES_POINTS: number[] = [
  100, 97, 95, 93, 91, 89, 87, 85, 83, 81,
   79, 77, 75, 73, 71, 69, 67, 65, 63, 61,
   60, 59, 58, 57, 56, 55, 54, 53, 52, 51,
   50, 49, 48, 47, 46, 45, 44, 43, 42, 41,
   40, 39, 38, 37, 36, 35, 34, 33, 32, 31,
];
export function cfPoints(rank: number): number {
  if (rank <= 0) return 0;
  return CF_GAMES_POINTS[rank - 1] ?? Math.max(1, 30 - (rank - 51));
}

// ── Normalize movement names ──────────────────────────────────────────────────
// Les lignes de WOD sont saisies librement : « Pull-ups », « Pull Up »,
// « 12 Toes-to-bar », « Cal Row »… On canonicalise au singulier, sans trait
// d'union, avant de consulter la table — sinon chaque variante d'écriture
// crée sa propre clé et son propre compteur de reps.
const MOVEMENT_MAP: Record<string, string> = {
  deadlift: 'deadlift', 'soulevé de terre': 'deadlift',
  'sumo deadlift high pull': 'sdlhp', sdlhp: 'sdlhp',
  'pull up': 'pull_up', traction: 'pull_up',
  'chest to bar': 'chest_to_bar', 'chest to bar pull up': 'chest_to_bar', ctb: 'chest_to_bar',
  'pull over': 'pull_over',
  'push up': 'push_up', pompe: 'push_up',
  thruster: 'thruster', 'db thruster': 'db_thruster', 'dumbbell thruster': 'db_thruster',
  'kb thruster': 'kb_thruster',
  burpee: 'burpee', 'burpee over the bar': 'burpee', 'bar facing burpee': 'burpee',
  'burpee box jump': 'burpee_box_jump', 'burpee box jump over': 'burpee_box_jump',
  'box jump': 'box_jump', 'box jump over': 'box_jump', 'box step up': 'box_jump',
  'saut sur boite': 'box_jump',
  'kettlebell swing': 'kb_swing', 'kb swing': 'kb_swing',
  'air squat': 'air_squat', squat: 'air_squat',
  'front squat': 'squat', 'back squat': 'squat',
  'overhead squat': 'overhead_squat', ohs: 'overhead_squat',
  'goblet squat': 'goblet_squat',
  'pistol squat': 'pistol_squat', pistol: 'pistol_squat',
  'double under': 'double_under', 'single under': 'single_under',
  'toe to bar': 'toes_to_bar', 'toes to bar': 'toes_to_bar', t2b: 'toes_to_bar',
  'knee to elbow': 'knees_to_elbow', k2e: 'knees_to_elbow',
  'handstand push up': 'hspu', hspu: 'hspu', 'hspu strict': 'hspu',
  'strict handstand push up': 'hspu', 'wall facing hspu': 'hspu',
  'muscle up': 'muscle_up',
  'bar muscle up': 'bar_muscle_up', 'ring muscle up': 'ring_muscle_up',
  'ring dip': 'ring_dip', 'ring row': 'ring_row',
  clean: 'clean', épaulé: 'clean',
  'power clean': 'clean', 'squat clean': 'clean', 'hang clean': 'clean',
  'hang power clean': 'clean', 'hang squat clean': 'clean',
  'clean and jerk': 'clean_and_jerk', 'hang clean and jerk': 'clean_and_jerk',
  'db clean and jerk': 'db_cj', 'kb clean and jerk': 'kb_cj',
  snatch: 'snatch', arraché: 'snatch',
  'power snatch': 'snatch', 'squat snatch': 'snatch', 'hang snatch': 'snatch',
  'db snatch': 'db_snatch', 'db snatch alt': 'db_snatch', 'dumbbell snatch': 'db_snatch',
  'kb snatch': 'kb_snatch',
  'push press': 'press', 'strict press': 'press', 'push jerk': 'press',
  'shoulder to overhead': 'press', 'shoulder to oh': 'press',
  'db push press': 'db_push_press',
  'devil press': 'devil_press',
  lunge: 'lunge', 'db lunge': 'lunge', 'walking lunge': 'lunge', fente: 'lunge',
  'turkish get up': 'turkish_get_up',
  'wall ball': 'wall_ball', 'wall ball shot': 'wall_ball',
  'wall walk': 'wall_walk',
  'sit up': 'sit_up', 'v up': 'v_up', 'hollow rock': 'hollow_rock',
  'mountain climber': 'mountain_climber',
  'mb slam': 'mb_slam', 'medicine ball slam': 'mb_slam', 'slam ball': 'mb_slam',
  row: 'row', 'cal row': 'row', aviron: 'row', rameur: 'row', 'cal rameur': 'row',
  'assault bike': 'bike', 'echo bike': 'bike', 'cal assault bike': 'bike',
  'cal bike': 'bike', 'bike erg': 'bike',
  'ski erg': 'ski_erg', 'cal ski erg': 'ski_erg', ski: 'ski_erg',
  run: 'run', course: 'run',
};

function singularize(word: string): string {
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

export function normalizeMovement(raw: string): { key: string; label: string } {
  const cleaned = raw.toLowerCase()
    .replace(/\d+[-x]\d+[-x]?\d*/g, '')
    .replace(/\d+\s*(kg|lb|rm|%)/g, '')
    .replace(/\d+/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/-/g, ' ')
    .trim()
    .split(/\s+/)
    .map(singularize)
    .join(' ')
    .trim();
  const key = MOVEMENT_MAP[cleaned] ?? cleaned.replace(/\s+/g, '_');
  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { key, label };
}

// ── ELO calculation (delegated to shared utility) ────────────────────────────
// Kept as re-export for backward compatibility
export { calcAvgOpponentDelta as calcTournamentElo } from './elo';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TournamentWOD {
  id: string;
  tournament_id: string;
  order_index: number;
  title: string;
  description: string | null;
  type: string;
  duration_minutes: number;
  movements: string[];
  scoring: string;
  deadline_hours: number;
  opens_at: string | null;
  closes_at: string | null;
  status: 'pending' | 'active' | 'closed';
  // Timer config (set from back office)
  timer_type: 'countdown' | 'stopwatch' | 'emom' | 'tabata' | 'none' | null;
  time_cap_seconds: number | null;
  rounds: number | null;
  work_seconds: number | null;
  rest_seconds: number | null;
  reps_per_round: number | null;
}

// ── AMRAP / Max Reps score helpers ────────────────────────────────────────
// Score for these WODs is normalized to a TOTAL rep count so ranking stays
// coherent whether the athlete entered "rounds + reps" or a raw total.
// reps_per_round converts between the two representations. Mirrors
// TheHub/lib/movements.ts.

export function isRepsScoredType(type: string | null | undefined): boolean {
  const t = (type ?? '').toLowerCase();
  return t === 'amrap' || t === 'max reps';
}

// Leading rep count of one movement line ("10 Thruster (43/30 kg)" -> 10).
function repsFromMovementLine(line: string): number | null {
  const s = (line ?? '').trim().replace(/\((?:[^)]*)\)/g, '').replace(/@.*$/, '').trim();
  const m = s.match(/^(\d+)\s*(?:reps?|x)?\s*[—\-:]?\s*(.+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

export function repsPerRoundFromMovements(movements: string[] | null | undefined): number {
  if (!Array.isArray(movements)) return 0;
  return movements.reduce((acc, line) => acc + (repsFromMovementLine(line) ?? 0), 0);
}

export function amrapTotalToRoundsReps(
  total: number,
  repsPerRound: number,
): { rounds: number; reps: number } {
  if (!repsPerRound || repsPerRound <= 0) return { rounds: 0, reps: total };
  return { rounds: Math.floor(total / repsPerRound), reps: total % repsPerRound };
}

export function roundsRepsToTotal(
  rounds: number,
  reps: number,
  repsPerRound: number,
): number {
  return Math.max(0, Math.round(rounds)) * Math.max(0, repsPerRound) + Math.max(0, Math.round(reps));
}

// "123 reps (3 tours + 12)" — or just "123 reps" when reps_per_round is unknown.
export function formatAmrapScore(
  total: number,
  repsPerRound: number | null | undefined,
): string {
  const repsLabel = `${total} reps`;
  if (!repsPerRound || repsPerRound <= 0) return repsLabel;
  const { rounds, reps } = amrapTotalToRoundsReps(total, repsPerRound);
  return `${repsLabel} (${rounds} tour${rounds > 1 ? 's' : ''}${reps > 0 ? ` + ${reps}` : ''})`;
}

// ── Time (For Time) helpers ───────────────────────────────────────────────────
// Scores for "For Time" WODs are stored canonically as a TOTAL SECONDS number
// (as a string in text columns) so ranking (smallest time wins) stays correct
// regardless of how the athlete typed it. The UI always shows/edits "mm:ss".

export function isTimeScoredType(type: string | null | undefined): boolean {
  const t = (type ?? '').toLowerCase();
  return t === 'for time' || t === 'for-time';
}

// "12:30" -> 750 ; "90" -> 90 ; "1:05:30" -> 3930. Accepts already-numeric input.
export function timeStringToSeconds(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Math.max(0, Math.round(v));
  const s = (v ?? '').toString().trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const parts = s.split(':').map(p => parseInt(p.replace(/[^0-9]/g, ''), 10) || 0);
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
}

// 750 -> "12:30" ; 3930 -> "1:05:30".
export function secondsToTimeString(total: number): string {
  const sec = Math.max(0, Math.round(total || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Live input mask: keeps only digits and formats them right-to-left as mm:ss
// (or h:mm:ss) while the user types. "1234" -> "12:34", "5" -> "0:05".
export function maskTimeInput(raw: string): string {
  const digits = (raw ?? '').replace(/[^0-9]/g, '').slice(0, 6);
  if (!digits) return '';
  const groups: string[] = [];
  let rest = digits;
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  groups.unshift(rest);
  if (groups.length === 1) return `0:${groups[0].padStart(2, '0')}`;
  return groups.map((g, i) => (i === 0 ? g : g.padStart(2, '0'))).join(':');
}

// Parse any stored score into a comparable number for ranking/ELO.
// For Time -> total seconds; everything else -> leading numeric value.
export function parseScoreToNumber(
  value: string | number | null | undefined,
  wodType: string | null | undefined,
): number {
  if (isTimeScoredType(wodType)) return timeStringToSeconds(value ?? 0);
  if (typeof value === 'number') return value;
  return parseFloat((value ?? '').toString()) || 0;
}

// Human-readable display of a stored score.
// For Time -> "mm:ss", ou "CAP + X reps" si le temps limite a été atteint.
// AMRAP/Max Reps -> "123 reps (3 tours + 12)".
export function formatScoreDisplay(
  value: string | number | null | undefined,
  wodType: string | null | undefined,
  repsPerRound?: number | null,
  capped?: boolean | null,
): string {
  const raw = (value ?? '').toString();
  if (isTimeScoredType(wodType)) {
    const n = normalizeScore(timeStringToSeconds(raw), capped, true);
    return n.capped ? `CAP + ${n.value} reps` : secondsToTimeString(n.value);
  }
  if (isRepsScoredType(wodType)) {
    const n = parseFloat(raw);
    if (!isNaN(n)) return formatAmrapScore(n, repsPerRound);
  }
  return raw;
}

export interface TournamentScore {
  id: string;
  athlete_id: string;
  tournament_id: string;
  tournament_wod_id: string;
  score_value: string;
  tiebreak_value: number | null;
  video_url: string | null;
  notes: string | null;
  capped?: boolean | null;
  status: 'pending' | 'validated' | 'rejected';
  submitted_at: string;
  deadline_at: string | null;
  ai_analysis: string | null;
  elo_points: number;
  profile?: { username: string; level: string; elo: number };
  tw?: { title: string; type: string; movements?: string[] };
  t?: { name: string };
}

export interface RankedScore extends TournamentScore {
  rank: number;
  cfPoints: number;
  isExAequo: boolean;
}

// ── Rank WOD scores ───────────────────────────────────────────────────────────
export function rankWodScores(scores: TournamentScore[], wodType: string): RankedScore[] {
  const validated = scores.filter(s => s.status === 'validated');
  // Miroir bit-à-bit de l'ORDER BY serveur (compute_league_wod_elo /
  // recalc_division_points) : finishers d'abord (temps croissant), puis les
  // cappés (reps décroissantes).
  const isTime = isTimeScoredType(wodType);
  const sorted = [...validated].sort((a, b) => compareScores(
    { score_value: parseScoreToNumber(a.score_value, wodType), capped: a.capped },
    { score_value: parseScoreToNumber(b.score_value, wodType), capped: b.capped },
    isTime,
  ));

  let currentRank = 1;
  return sorted.map((score, idx) => {
    if (idx > 0) {
      const prev = sorted[idx - 1];
      const sameScore = score.score_value === prev.score_value
        && !!score.capped === !!prev.capped;
      const sameTiebreak = score.tiebreak_value === prev.tiebreak_value;
      if (!sameScore || !sameTiebreak) currentRank = idx + 1;
    }
    const isExAequo = sorted.filter(s =>
      s.score_value === score.score_value &&
      !!s.capped === !!score.capped &&
      s.tiebreak_value === score.tiebreak_value
    ).length > 1;
    return { ...score, rank: currentRank, cfPoints: cfPoints(currentRank), isExAequo };
  });
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

export function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}
