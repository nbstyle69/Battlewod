import { AppTheme } from '../../../context/ThemeContext';

export interface InterCompetition {
  id: string;
  title: string;
  description: string | null;
  format: 'league' | 'bracket' | 'pool' | 'swiss';
  type: 'individual' | 'team';
  team_size: number;
  status: 'draft' | 'open' | 'active' | 'closed';
  starts_at: string | null;
  ends_at: string | null;
  max_participants: number | null;
  rules: string | null;
  created_at: string;
}

export interface InterWod {
  id: string;
  competition_id: string;
  title: string;
  description: string | null;
  order_index: number;
  time_cap: number | null;
  scoring_type: 'reps' | 'time' | 'weight' | 'rounds_reps';
  revealed_at: string | null;
}

export interface InterScore {
  id: string;
  competition_id: string;
  wod_id: string;
  athlete_id: string | null;
  team_id: string | null;
  score_value: number | null;
  score_display: string | null;
  video_url: string | null;
  status: 'pending' | 'validated' | 'rejected';
  submitted_at: string;
  username?: string;
  team_name?: string;
}

export interface BracketMatch {
  id: string;
  competition_id: string;
  round: number;
  match_number: number;
  participant1_id: string | null;
  participant2_id: string | null;
  winner_id: string | null;
  status: 'pending' | 'active' | 'completed' | 'bye';
  wod_id: string | null;
  p1_username?: string;
  p2_username?: string;
  p1_score?: InterScore | null;
  p2_score?: InterScore | null;
}

export interface PoolGroup {
  id: string;
  competition_id: string;
  group_name: string;
  group_index: number;
  advance_count: number;
}

export interface PoolMember {
  id: string;
  group_id: string;
  athlete_id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  score_for: number;
  score_against: number;
  username?: string;
}

export interface PoolMatch {
  id: string;
  group_id: string;
  competition_id: string;
  athlete1_id: string;
  athlete2_id: string;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: 'pending' | 'active' | 'completed';
  a1_username?: string;
  a2_username?: string;
}

export interface LeagueRound {
  id: string;
  competition_id: string;
  round_number: number;
  title: string | null;
  wod_id: string | null;
  status: 'pending' | 'active' | 'completed';
  started_at: string | null;
  completed_at: string | null;
}

export interface LeagueStanding {
  id: string;
  competition_id: string;
  athlete_id: string;
  total_points: number;
  rounds_played: number;
  wins: number;
  podiums: number;
  username?: string;
}

export interface SwissRound {
  id: string;
  competition_id: string;
  round_number: number;
  status: 'pending' | 'active' | 'completed';
  completed_at: string | null;
}

export interface SwissPairing {
  id: string;
  round_id: string;
  competition_id: string;
  athlete1_id: string;
  athlete2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: 'pending' | 'active' | 'completed' | 'bye';
  a1_username?: string;
  a2_username?: string;
}

export interface SwissStanding {
  id: string;
  competition_id: string;
  athlete_id: string;
  points: number;
  buchholz: number;
  wins: number;
  draws: number;
  losses: number;
  rounds_played: number;
  username?: string;
}

export const FORMAT_LABELS: Record<string, string> = {
  league: 'Ligue', bracket: 'Elimination', pool: 'Poules', swiss: 'Suisse',
};
export const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', open: 'Ouvert', active: 'En cours', closed: 'Termine',
};
export const SCORING_LABELS: Record<string, string> = {
  reps: 'Reps', time: 'Temps', weight: 'Poids', rounds_reps: 'Rounds+Reps',
};

export interface TabStyleSheet {
  section: object;
  emptyText: object;
  roundTitle: object;
  matchCard: object;
  matchRow: object;
  matchPlayer: object;
  matchWinner: object;
  matchVs: object;
  matchScores: object;
  matchScoreText: object;
  matchScoreSep: object;
  resolveRow: object;
  resolveBtn: object;
  resolveBtnText: object;
  matchResolved: object;
  matchBye: object;
  bracketEmpty: object;
  generateBtn: object;
  generateBtnText: object;
  advanceBtn: object;
  advanceBtnText: object;
  roundSection: object;
  [key: string]: object;
}
