import { Mixpanel } from 'mixpanel-react-native';

const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN || '';

// Sans token (dev/CI/Expo Go sans .env), le SDK lève « token is not a valid string »
// au chargement du module et empêche l'app de démarrer : on désactive le tracking.
const mixpanel = MIXPANEL_TOKEN ? new Mixpanel(MIXPANEL_TOKEN, true) : null;
if (mixpanel) {
  mixpanel.init();
} else {
  console.warn('[analytics] EXPO_PUBLIC_MIXPANEL_TOKEN absent — tracking désactivé.');
}

// ── Identity ────────────────────────────────────────────

export function identifyUser(userId: string, props?: Record<string, any>) {
  mixpanel?.identify(userId);
  if (props) {
    mixpanel?.getPeople().set(props);
  }
}

export function resetUser() {
  mixpanel?.reset();
}

// ── Events ──────────────────────────────────────────────

export function trackEvent(name: string, props?: Record<string, any>) {
  mixpanel?.track(name, props);
}

// ── Predefined events ───────────────────────────────────

export function trackSignUp(method: string, role: string, level: string) {
  trackEvent('Sign Up', { method, role, level });
}

export function trackLogin() {
  trackEvent('Login');
}

export function trackScoreSubmit(wodId: string, scoreType: string) {
  trackEvent('Score Submit', { wod_id: wodId, score_type: scoreType });
}

export function trackTournamentJoin(tournamentId: string, type: string) {
  trackEvent('Tournament Join', { tournament_id: tournamentId, type });
}

export function trackWodGenerate(format: string, duration: number, level: string) {
  trackEvent('WOD Generate', { format, duration, level });
}

export function trackTimerStart(type: string, withCamera: boolean) {
  trackEvent('Timer Start', { timer_type: type, with_camera: withCamera });
}

export function trackVideoRecord(duration: number) {
  trackEvent('Video Record', { duration_seconds: duration });
}

export function trackScreenView(screenName: string) {
  trackEvent('Screen View', { screen: screenName });
}

export function trackDeleteAccount() {
  trackEvent('Delete Account');
}

export function trackBoxJoin() {
  trackEvent('Box Join');
}

export function trackBoxCreate() {
  trackEvent('Box Create');
}

export function trackMessageSend(isGroup: boolean) {
  trackEvent('Message Send', { is_group: isGroup });
}

export function trackFriendAdd() {
  trackEvent('Friend Add');
}

// ── Inter-box competition events ─────────────────────────

export function trackInterCompCreate(format: string, type: string) {
  trackEvent('Inter Comp Create', { format, type });
}

export function trackInterCompRegister(competitionId: string, format: string) {
  trackEvent('Inter Comp Register', { competition_id: competitionId, format });
}

export function trackInterCompScoreSubmit(competitionId: string, format: string, withVideo: boolean) {
  trackEvent('Inter Comp Score Submit', { competition_id: competitionId, format, with_video: withVideo });
}

export function trackInterCompClose(competitionId: string, format: string, participantCount: number) {
  trackEvent('Inter Comp Close', { competition_id: competitionId, format, participant_count: participantCount });
}

export function trackBracketGenerate(competitionId: string, participantCount: number) {
  trackEvent('Bracket Generate', { competition_id: competitionId, participant_count: participantCount });
}

export function trackBracketResolve(competitionId: string, round: number) {
  trackEvent('Bracket Resolve', { competition_id: competitionId, round });
}

export function trackLeagueRoundCreate(competitionId: string, roundNumber: number) {
  trackEvent('League Round Create', { competition_id: competitionId, round: roundNumber });
}

export function trackPoolGenerate(competitionId: string, groupCount: number) {
  trackEvent('Pool Generate', { competition_id: competitionId, group_count: groupCount });
}

export function trackPoolMatchResolve(competitionId: string) {
  trackEvent('Pool Match Resolve', { competition_id: competitionId });
}

export function trackSwissRoundGenerate(competitionId: string, roundNumber: number) {
  trackEvent('Swiss Round Generate', { competition_id: competitionId, round: roundNumber });
}

export function trackSwissPairingResolve(competitionId: string) {
  trackEvent('Swiss Pairing Resolve', { competition_id: competitionId });
}

// ── Daily tournament events ──────────────────────────────

export function trackDailyTournamentJoin(tournamentId: string) {
  trackEvent('Daily Tournament Join', { tournament_id: tournamentId });
}

export function trackDailyTournamentScoreSubmit(tournamentId: string, scoreMode: string) {
  trackEvent('Daily Tournament Score Submit', { tournament_id: tournamentId, score_mode: scoreMode });
}

export function trackDailyTournamentCreate() {
  trackEvent('Daily Tournament Create');
}

// ── Program events ───────────────────────────────────────

export function trackProgramJoin(programId: string) {
  trackEvent('Program Join', { program_id: programId });
}

// ── Onboarding events ────────────────────────────────────

export function trackOnboardingStep(step: number, slideTitle: string) {
  trackEvent('Onboarding Step', { step, slide: slideTitle });
}

export function trackOnboardingComplete() {
  trackEvent('Onboarding Complete');
}

export function trackOnboardingBoxJoin() {
  trackEvent('Onboarding Box Join');
}

export function trackOnboardingSkipBox() {
  trackEvent('Onboarding Skip Box');
}
