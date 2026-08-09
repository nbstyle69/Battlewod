export type AthleteLevel = 'scaled' | 'inter' | 'rx' | 'rx+' | 'elite' | 'pro';

export type UserRole = 'super_admin' | 'box_owner' | 'member' | 'athlete' | 'admin';

export type BoxWODType = 'for-time' | 'amrap' | 'emom' | 'tabata' | 'strength' | 'custom';
export type ScoreType  = 'time' | 'reps' | 'weight' | 'rounds';
export type BoxMemberRole = 'member' | 'coach';
export type MemberStatus = 'active' | 'banned';
export type MessageType = 'general' | 'group' | 'direct';
export type EventRegStatus = 'registered' | 'waitlist' | 'cancelled';
export type CompetitionStatus = 'draft' | 'open' | 'ongoing' | 'finished';

export type SubscriptionPlanTier = 'trial' | 'complete';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface Box {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  logo_url?: string;
  address?: string;
  website_url?: string;
  contact_email?: string;
  phone?: string;
  google_maps_url?: string;
  founded_at?: string;
  /** Jamais chargé avec la box : passe par la RPC `get_my_box_invite_code`. */
  invite_code?: string;
  is_active: boolean;
  created_at: string;
  city?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  sport_type?: string[];
  services?: string[];
  cover_url?: string;
  instagram_url?: string;
  is_listed?: boolean;
  tagline?: string;
  opening_hours?: Record<string, string>;
  member_count?: number;
  slug?: string;
}

export interface BoxProgram {
  id: string;
  box_id: string;
  name: string;
  description?: string;
  price?: number;
  currency: string;
  url: string;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ProgramType = 'fixed' | 'ongoing';
export type ProgramMemberStatus = 'active' | 'expired' | 'cancelled' | 'refunded';

export interface Program {
  id: string;
  box_id: string;
  owner_id: string;
  title: string;
  description?: string;
  price_cents: number;
  currency: string;
  type: ProgramType;
  duration_weeks?: number;
  days_per_week: number;
  invite_code: string;
  stripe_price_id?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined fields
  member_count?: number;
  box_name?: string;
}

export interface ProgramWOD {
  id: string;
  program_id: string;
  day_number?: number;
  scheduled_date?: string;
  week_number?: number;
  title: string;
  description: string;
  wod_type: string;
  scoring_type?: string;
  time_cap_seconds?: number;
  notes?: string;
  sort_order: number;
  created_at: string;
}

export interface ProgramMember {
  id: string;
  program_id: string;
  user_id: string;
  start_date: string;
  stripe_payment_intent?: string;
  amount_cents?: number;
  platform_fee_cents?: number;
  status: ProgramMemberStatus;
  purchased_at: string;
  // joined
  profile?: User;
}

export interface ProgramScore {
  id: string;
  program_wod_id: string;
  user_id: string;
  score_type: string;
  score_value: number;
  rx: boolean;
  notes?: string;
  created_at: string;
  profile?: User;
}

export interface BoxSubscription {
  id: string;
  box_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan_tier: SubscriptionPlanTier;
  status: SubscriptionStatus;
  trial_ends_at?: string;
  current_period_end?: string;
  is_early_adopter: boolean;
  created_at: string;
  updated_at: string;
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
  block_name?: string;
  video_url?: string;
  is_published: boolean;
  publish_at?: string | null;
  leaderboard_enabled?: boolean;
  sort_order?: number;
  emom_interval_minutes?: number;
  tabata_work_seconds?: number;
  tabata_rest_seconds?: number;
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
  /** Time cap atteint sans terminer : score_value porte alors les reps. */
  capped: boolean;
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

export type WODType = 'AMRAP' | 'For Time' | 'EMOM' | 'Tabata' | 'Max Reps' | 'Chipper' | 'Ladder' | 'Couplet' | 'Death By';

export type TournamentStatus = 'open' | 'active' | 'completed';

export type Gender = 'male' | 'female';
export type GenderTarget = 'male' | 'female' | 'mix';

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  level: AthleteLevel;
  role: UserRole;
  gender?: Gender;
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

export type PartnerCategory = 'nutrition' | 'equipment' | 'apparel' | 'supplements' | 'recovery' | 'coaching' | 'software' | 'other';

export interface Partner {
  id: string;
  name: string;
  logo_url?: string;
  description?: string;
  website_url?: string;
  instagram_url?: string;
  offer_title?: string;
  offer_description?: string;
  offer_code?: string;
  category: PartnerCategory;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}
