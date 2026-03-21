import { Mixpanel } from 'mixpanel-react-native';

const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN || '';

const mixpanel = new Mixpanel(MIXPANEL_TOKEN, true);
mixpanel.init();

// ── Identity ────────────────────────────────────────────

export function identifyUser(userId: string, props?: Record<string, any>) {
  mixpanel.identify(userId);
  if (props) {
    mixpanel.getPeople().set(props);
  }
}

export function resetUser() {
  mixpanel.reset();
}

// ── Events ──────────────────────────────────────────────

export function trackEvent(name: string, props?: Record<string, any>) {
  mixpanel.track(name, props);
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
