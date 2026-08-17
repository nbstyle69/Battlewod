import { isPurgedAtSignOut, TOUR_DONE_KEY } from '../lib/storageKeys';

describe('purge des clés locales au signOut', () => {
  it('efface les clés qui appartiennent à la session', () => {
    expect(isPurgedAtSignOut('@athlex:activeBoxId')).toBe(true);
    expect(isPurgedAtSignOut('@athlex:boxSkipped')).toBe(true);
    expect(isPurgedAtSignOut('@athlex:onboardingDone')).toBe(true);
    expect(isPurgedAtSignOut('lastSeenMessages_42')).toBe(true);
  });

  it('conserve le tutoriel guidé — il est par appareil, pas par session', () => {
    expect(isPurgedAtSignOut(TOUR_DONE_KEY)).toBe(false);
  });

  it('ne touche pas aux clés étrangères', () => {
    expect(isPurgedAtSignOut('supabase.auth.token')).toBe(false);
    expect(isPurgedAtSignOut('i18nextLng')).toBe(false);
  });
});
