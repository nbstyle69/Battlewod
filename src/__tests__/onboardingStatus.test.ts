/**
 * « Présentation vue » côté compte : profiles.onboarding_completed_at décide,
 * la clé locale @athlex:onboardingDone n'est qu'un cache de session.
 *
 * Mutation inverse jouée à la main : retirer `if (serverCompletedAt) return true;`
 * de resolveOnboardingDone → « signOut puis signIn du même compte » et « autre
 * appareil » passent au rouge (la présentation reviendrait).
 */
const rpc = jest.fn();
const captureError = jest.fn();
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock('../lib/sentry', () => ({ captureError: (...a: unknown[]) => captureError(...a) }));

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_KEY,
  markOnboardingCompleted,
  readOnboardingCache,
  resolveOnboardingDone,
} from '../lib/onboardingStatus';
import { TOUR_DONE_KEY, isPurgedAtSignOut } from '../lib/storageKeys';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

/** Un serveur minimal : la colonne par compte, écrite par la RPC. */
function fakeServer() {
  const completed = new Map<string, string | null>();
  let current: string | null = null;
  rpc.mockImplementation(async (name: string) => {
    expect(name).toBe('mark_onboarding_completed');
    if (!current) return { data: null, error: { message: 'JWT requis' } };
    const prev = completed.get(current) ?? null;
    const value = prev ?? '2026-09-05T10:00:00.000Z';
    completed.set(current, value);
    return { data: value, error: null };
  });
  return {
    signIn: (id: string) => { current = id; },
    signOut: () => { current = null; },
    profile: (id: string) => ({ id, onboarding_completed_at: completed.get(id) ?? null }),
  };
}

/** Ce que fait AuthContext.signOut sur les clés locales (3.8). */
async function purgeLocalAtSignOut() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(isPurgedAtSignOut));
}

/** Ce que fait AppNavigator pour décider d'afficher la présentation. */
async function showsPresentation(profile: { id: string; onboarding_completed_at: string | null }) {
  return !resolveOnboardingDone({
    serverCompletedAt: profile.onboarding_completed_at,
    cachedUserId: await readOnboardingCache(),
    userId: profile.id,
  });
}

beforeEach(async () => {
  rpc.mockReset();
  captureError.mockReset();
  await AsyncStorage.clear();
});

describe('présentation : le serveur décide', () => {
  it('signOut puis signIn du même compte → pas de présentation', async () => {
    const server = fakeServer();
    server.signIn(ALICE);
    expect(await showsPresentation(server.profile(ALICE))).toBe(true);
    await markOnboardingCompleted(ALICE);
    expect(await showsPresentation(server.profile(ALICE))).toBe(false);

    server.signOut();
    await purgeLocalAtSignOut();
    expect(await AsyncStorage.getItem(ONBOARDING_KEY)).toBeNull();

    server.signIn(ALICE);
    expect(await showsPresentation(server.profile(ALICE))).toBe(false);
  });

  it('nouveau compte → présentation, même si un autre compte l’a vue sur cet appareil', async () => {
    const server = fakeServer();
    server.signIn(ALICE);
    await markOnboardingCompleted(ALICE);
    // Pas de purge : cache d'Alice encore là (cas d'une inscription enchaînée).
    server.signIn(BOB);
    expect(await showsPresentation(server.profile(BOB))).toBe(true);
  });

  it('autre appareil (cache vierge), compte déjà passé → pas de présentation', async () => {
    const server = fakeServer();
    server.signIn(ALICE);
    await markOnboardingCompleted(ALICE);
    await AsyncStorage.clear();
    expect(await showsPresentation(server.profile(ALICE))).toBe(false);
  });

  it('serveur NULL et cache d’un autre compte, ou ancien cache « true » → présentation', () => {
    expect(resolveOnboardingDone({ serverCompletedAt: null, cachedUserId: BOB, userId: ALICE })).toBe(false);
    expect(resolveOnboardingDone({ serverCompletedAt: null, cachedUserId: 'true', userId: ALICE })).toBe(false);
    expect(resolveOnboardingDone({ serverCompletedAt: undefined, cachedUserId: null, userId: ALICE })).toBe(false);
  });
});

describe('markOnboardingCompleted', () => {
  it('appelle la RPC puis pose le cache avec l’id du compte', async () => {
    rpc.mockResolvedValue({ data: '2026-09-05T10:00:00.000Z', error: null });
    expect(await markOnboardingCompleted(ALICE)).toBe('2026-09-05T10:00:00.000Z');
    expect(rpc).toHaveBeenCalledWith('mark_onboarding_completed');
    expect(await AsyncStorage.getItem(ONBOARDING_KEY)).toBe(ALICE);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('échec serveur : Sentry prévenu, cache posé quand même (la session en cours n’est pas bloquée), serveur toujours NULL', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    expect(await markOnboardingCompleted(ALICE)).toBeNull();
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'network' }),
      expect.objectContaining({ action: 'markOnboardingCompleted', userId: ALICE }),
    );
    // Même session : cache → pas de présentation. Reconnexion (cache purgé) : elle revient.
    expect(resolveOnboardingDone({ serverCompletedAt: null, cachedUserId: ALICE, userId: ALICE })).toBe(true);
    await purgeLocalAtSignOut();
    expect(resolveOnboardingDone({ serverCompletedAt: null, cachedUserId: await readOnboardingCache(), userId: ALICE })).toBe(false);
  });
});

describe('câblage et périmètre', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  it('AppNavigator lit profiles.onboarding_completed_at (relu par get_my_profile) et le cache', () => {
    const nav = read('src/navigation/index.tsx');
    expect(nav).toContain('serverCompletedAt: user.onboarding_completed_at');
    expect(nav).toContain('readOnboardingCache().then(setOnboardingCache)');
    expect(nav).not.toMatch(/AsyncStorage\.getItem\(ONBOARDING_KEY\)/);
  });

  it('onDone écrit le serveur (markOnboardingCompleted), plus la clé locale directement', () => {
    const screen = read('src/screens/onboarding/OnboardingTutorialScreen.tsx');
    expect(screen).toContain('await markOnboardingCompleted(user.id)');
    expect(screen).not.toContain('AsyncStorage');
  });

  it('la migration ajoute la colonne nullable sans toucher aux lignes, RPC idempotente réservée à authenticated', () => {
    const sql = read('supabase/migrations/20261201_onboarding_completed_at.sql');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;/);
    expect(sql).not.toMatch(/NOT NULL|DEFAULT now\(\)/);
    expect(sql).not.toMatch(/UPDATE public\.profiles\s+SET onboarding_completed_at = now\(\)/i);
    expect(sql).toContain('COALESCE(onboarding_completed_at, now())');
    expect(sql).toContain('WHERE id = auth.uid()');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.mark_onboarding_completed() FROM anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.mark_onboarding_completed() TO authenticated;');
  });

  it('@athlex:tourDone reste lié à l’appareil, @athlex:onboardingDone est purgé au signOut', () => {
    expect(TOUR_DONE_KEY).toBe('@athlex:tourDone');
    expect(isPurgedAtSignOut(TOUR_DONE_KEY)).toBe(false);
    expect(isPurgedAtSignOut(ONBOARDING_KEY)).toBe(true);
    expect(read('src/components/InteractiveTour.tsx')).toContain('TOUR_DONE_KEY');
  });
});
