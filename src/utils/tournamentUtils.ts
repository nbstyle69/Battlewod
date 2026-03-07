import { Colors } from '../theme/colors';

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

// ── Movement badge levels ─────────────────────────────────────────────────────
export const MOVEMENT_BADGE_LEVELS = [
  { level: 1, reps: 100,   label: 'Débutant',      emoji: '🥉', color: '#CD7F32' },
  { level: 2, reps: 500,   label: 'Intermédiaire', emoji: '🥈', color: '#C0C0C0' },
  { level: 3, reps: 1000,  label: 'Confirmé',      emoji: '🥇', color: '#FFD700' },
  { level: 4, reps: 3000,  label: 'Expert',        emoji: '💎', color: '#60A5FA' },
  { level: 5, reps: 10000, label: 'Elite',         emoji: '⚡', color: Colors.primary },
];

// ── Normalize movement names ──────────────────────────────────────────────────
const MOVEMENT_MAP: Record<string, string> = {
  deadlift: 'deadlift', 'soulevé de terre': 'deadlift',
  'pull-up': 'pull_up', 'pull up': 'pull_up', traction: 'pull_up',
  'push-up': 'push_up', 'push up': 'push_up', pompe: 'push_up',
  thruster: 'thruster', burpee: 'burpee', burpees: 'burpee',
  'box jump': 'box_jump', 'saut sur boite': 'box_jump',
  'kettlebell swing': 'kb_swing', 'kb swing': 'kb_swing',
  'air squat': 'air_squat', squat: 'air_squat',
  'double under': 'double_under', 'double-under': 'double_under',
  'toes to bar': 'toes_to_bar', t2b: 'toes_to_bar',
  'handstand push-up': 'hspu', hspu: 'hspu',
  'muscle-up': 'muscle_up', 'muscle up': 'muscle_up',
  clean: 'clean', épaulé: 'clean',
  snatch: 'snatch', arraché: 'snatch',
  row: 'row', aviron: 'row', run: 'run', course: 'run',
};

export function normalizeMovement(raw: string): { key: string; label: string } {
  const cleaned = raw.toLowerCase()
    .replace(/\d+[-x]\d+[-x]?\d*/g, '')
    .replace(/\d+\s*(kg|lb|rm|%)/g, '')
    .replace(/\d+/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
  const key = MOVEMENT_MAP[cleaned] ?? cleaned.replace(/\s+/g, '_');
  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { key, label };
}

// ── ELO calculation ───────────────────────────────────────────────────────────
export function calcTournamentElo(
  athleteElo: number,
  finalRank: number,
  totalParticipants: number,
  avgOpponentElo: number,
  k = 48,
): number {
  if (totalParticipants <= 1) return 0;
  const actualScore = (totalParticipants - finalRank) / (totalParticipants - 1);
  const expectedScore = 1 / (1 + Math.pow(10, (avgOpponentElo - athleteElo) / 400));
  return Math.round(k * (actualScore - expectedScore));
}

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
  const sorted = [...validated].sort((a, b) => {
    const aVal = parseFloat(a.score_value) || 0;
    const bVal = parseFloat(b.score_value) || 0;
    if (wodType === 'For Time') return aVal - bVal;
    return bVal - aVal;
  });

  let currentRank = 1;
  return sorted.map((score, idx) => {
    if (idx > 0) {
      const prev = sorted[idx - 1];
      const sameScore = score.score_value === prev.score_value;
      const sameTiebreak = score.tiebreak_value === prev.tiebreak_value;
      if (!sameScore || !sameTiebreak) currentRank = idx + 1;
    }
    const isExAequo = sorted.filter(s =>
      s.score_value === score.score_value &&
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
