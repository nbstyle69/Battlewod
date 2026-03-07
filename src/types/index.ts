export type AthleteLevel = 'scaled' | 'inter' | 'rx' | 'rx+' | 'gx' | 'pro';

export type UserRole = 'super_admin' | 'box_owner' | 'member' | 'athlete' | 'admin';

export type BoxWODType = 'for-time' | 'amrap' | 'emom' | 'tabata' | 'strength' | 'custom';
export type ScoreType  = 'time' | 'reps' | 'weight' | 'rounds';
export type MemberStatus = 'active' | 'banned';
export type MessageType = 'general' | 'group' | 'direct';
export type EventRegStatus = 'registered' | 'waitlist' | 'cancelled';
export type CompetitionStatus = 'draft' | 'open' | 'ongoing' | 'finished';

export interface Box {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  logo_url?: string;
  invite_code: string;
  is_active: boolean;
  created_at: string;
}

export interface BoxMember {
  id: string;
  box_id: string;
  member_id: string;
  joined_at: string;
  status: MemberStatus;
  profile?: User;
}

export interface BoxWOD {
  id: string;
  box_id: string;
  created_by: string;
  title: string;
  description?: string;
  wod_type?: BoxWODType;
  scheduled_date: string;
  time_cap_seconds?: number;
  rounds?: number;
  notes?: string;
  is_published: boolean;
  created_at: string;
  scores?: WODScore[];
}

export interface WODScore {
  id: string;
  wod_id: string;
  member_id: string;
  box_id: string;
  score_type: ScoreType;
  score_value: number;
  rx: boolean;
  scaled: boolean;
  notes?: string;
  video_url?: string;
  submitted_at: string;
  profile?: User;
  comments?: ScoreComment[];
}

export interface ScoreComment {
  id: string;
  score_id: string;
  box_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: User;
}

export interface Message {
  id: string;
  box_id: string;
  sender_id: string;
  receiver_id?: string;
  group_id?: string;
  content: string;
  message_type: MessageType;
  is_announcement: boolean;
  attachment_url?: string;
  created_at: string;
  read_by: string[];
  sender?: User;
  reactions?: MessageReaction[];
  replies?: MessageReply[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  member_id: string;
  emoji: string;
  created_at: string;
}

export interface MessageReply {
  id: string;
  parent_message_id: string;
  box_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: User;
}

export interface MessageGroup {
  id: string;
  box_id: string;
  name: string;
  created_by: string;
  members: string[];
  created_at: string;
}

export interface BoxEvent {
  id: string;
  box_id: string;
  created_by: string;
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  max_participants?: number;
  registration_deadline?: string;
  is_competition: boolean;
  cover_url?: string;
  created_at: string;
  registrations?: EventRegistration[];
}

export interface EventRegistration {
  id: string;
  event_id: string;
  member_id: string;
  registered_at: string;
  status: EventRegStatus;
}

export interface Competition {
  id: string;
  box_id: string;
  created_by: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  format?: 'individual' | 'team';
  scoring_type?: 'points' | 'time' | 'reps';
  status: CompetitionStatus;
  max_participants?: number;
  cover_url?: string;
  created_at: string;
}

export type UserRole_B2B = 'super_admin' | 'box_owner' | 'member';

export type WODType = 'AMRAP' | 'For Time' | 'EMOM' | 'Tabata' | 'Max Reps';

export type MatchStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export type TournamentStatus = 'open' | 'active' | 'completed';

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  level: AthleteLevel;
  role: UserRole;
  elo: number;
  total_matches: number;
  wins: number;
  losses: number;
  created_at: string;
}

export interface WOD {
  id: string;
  title: string;
  description: string;
  type: WODType;
  duration_minutes: number;
  level: AthleteLevel;
  movements: Movement[];
  equipment: string[];
  scoring: string;
  created_at: string;
}

export interface Movement {
  name: string;
  reps?: number;
  sets?: number;
  weight_rx?: string;
  weight_scaled?: string;
  notes?: string;
}

export interface Match {
  id: string;
  athlete1_id: string;
  athlete2_id: string;
  athlete1?: User;
  athlete2?: User;
  wod_id: string;
  wod?: WOD;
  status: MatchStatus;
  winner_id?: string;
  athlete1_score?: number;
  athlete2_score?: number;
  athlete1_video_url?: string;
  athlete2_video_url?: string;
  elo_change?: number;
  created_at: string;
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  max_participants: number;
  current_participants: number;
  status: TournamentStatus;
  level: AthleteLevel;
  wods: WOD[];
  participants?: User[];
  created_at: string;
  start_date: string;
}

export interface Score {
  id: string;
  athlete_id: string;
  wod_id: string;
  match_id?: string;
  value: number;
  unit: 'reps' | 'time' | 'kg';
  video_url?: string;
  validated: boolean;
  created_at: string;
}

export interface PR {
  movement: string;
  value: number;
  unit: string;
  achieved_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  achieved_at?: string;
}

export interface LeaderboardEntry {
  rank: number;
  user: User;
  elo: number;
  wins: number;
  total_matches: number;
}
