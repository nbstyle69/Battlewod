import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { BOX_COLUMNS, BOX_MEMBERSHIP_COLUMNS } from '../lib/boxColumns';
import { readRows } from '../lib/db';
import { User, Box, BoxMemberRole, BoxSubscription } from '../types';
import { Session } from '@supabase/supabase-js';
import { registerForPushNotifications, savePushToken, removePushToken, scheduleDailyReminder, scheduleScoreReminder, getNotificationPrefs, clearCachedPrefs, cancelAllLocalReminders } from '../services/notifications';
import { awardLevelBadge } from '../services/gamification';
import { setUserContext, clearUserContext, captureError } from '../lib/sentry';
import { identifyUser, resetUser, trackLogin, trackSignUp, trackBoxJoin, trackDeleteAccount } from '../lib/analytics';
import { isPurgedAtSignOut } from '../lib/storageKeys';
import { runSignOutSequence } from '../lib/signOutSequence';
import { EMAIL_CONFIRMED_URL, UPDATE_PASSWORD_URL } from '../lib/urls';

const BOX_SKIPPED_KEY = '@athlex:boxSkipped';
const ACTIVE_BOX_KEY = '@athlex:activeBoxId';

interface MyBoxEntry {
  box: Box;
  role: BoxMemberRole | 'owner';
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  currentBox: Box | null;
  boxRole: BoxMemberRole | 'owner' | null;
  myBoxes: MyBoxEntry[];
  boxSubscription: BoxSubscription | null;
  isBoxActive: boolean;
  daysLeftTrial: number;
  /**
   * Session ouverte mais profil non chargé. Sans ce signal, l'app réaffiche
   * l'écran de connexion sans rien dire : la panne devient invisible.
   */
  profileError: string | null;
  switchBox: (boxId: string) => Promise<void>;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string, level: string, gender?: string) => Promise<{ error: string | null; finalUsername?: string }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updateUser: (updates: Partial<User>) => void;
  boxSkipped: boolean;
  skipBox: () => Promise<void>;
  leaveBox: () => Promise<{ error: string | null }>;
  joinBox: (inviteCode: string) => Promise<{ error: string | null }>;
  refreshBox: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [user, setUser]             = useState<User | null>(null);
  const [currentBox, setCurrentBox] = useState<Box | null>(null);
  const [boxRole, setBoxRole]       = useState<BoxMemberRole | 'owner' | null>(null);
  const [myBoxes, setMyBoxes]       = useState<MyBoxEntry[]>([]);
  const [boxSkipped, setBoxSkipped] = useState(false);
  const [boxSubscription, setBoxSubscription] = useState<BoxSubscription | null>(null);
  const [loading, setLoading]       = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const isBoxActive = (() => {
    if (!boxSubscription) return true;
    if (boxSubscription.status === 'active') return true;
    if (boxSubscription.status === 'trialing' && boxSubscription.trial_ends_at) {
      return new Date(boxSubscription.trial_ends_at).getTime() > Date.now();
    }
    return false;
  })();

  const daysLeftTrial = (() => {
    if (!boxSubscription?.trial_ends_at) return 0;
    if (boxSubscription.status !== 'trialing') return 0;
    const diff = new Date(boxSubscription.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  useEffect(() => {
    AsyncStorage.getItem(BOX_SKIPPED_KEY).then(val => {
      if (val === 'true') setBoxSkipped(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      else { setUser(null); setCurrentBox(null); setBoxRole(null); setProfileError(null); setLoading(false); }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  // Realtime ban detection — runs once the user is known
  useEffect(() => {
    if (!user?.id) return;
    const banChannel = supabase
      .channel(`ban-watch-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'box_members',
          filter: `member_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new.status === 'banned') {
            setCurrentBox(null);
            setBoxRole(null);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(banChannel); };
  }, [user?.id]);

  async function fetchProfile(userId: string) {
    try {
      // Lecture de SON profil par RPC : `full_name`, `gender` et
      // `personal_records` ne sont plus lisibles en colonne par `authenticated`
      // (Lot 0-bis), donc un `select` qui les mentionne échouerait en 42501.
      // L'email du compte courant vient de la SESSION auth, pas de la table.
      // L'`error` de la RPC ne lève pas : la destructurer est le seul moyen de
      // la voir. Sans elle, un refus laissait `user` à `null`, l'app revenait à
      // l'écran de connexion, et il n'en restait aucune trace — ni à l'écran,
      // ni dans Sentry. C'est cette cécité qui a rendu la panne du bundle vide
      // indiscernable d'un mot de passe erroné.
      const { data: rows, error: rpcError } = await supabase.rpc('get_my_profile');
      if (rpcError) throw rpcError;

      const data = Array.isArray(rows) ? rows[0] ?? null : rows ?? null;
      if (!data) {
        // Une session valide sans profil est un état incohérent, pas un vide
        // ordinaire : le trigger d'inscription doit avoir posé la ligne.
        throw new Error(`get_my_profile n'a rendu aucune ligne pour ${userId}`);
      }
      setProfileError(null);
      const { data: authData } = await supabase.auth.getUser();
      const email = authData?.user?.email ?? '';
      const profile = { ...data, email } as User;
      setUser(profile);
      setUserContext(profile.id, email, profile.username);
      identifyUser(profile.id, { email, username: profile.username, role: profile.role, level: profile.level });
      await fetchBox(userId);
      // Register push token silently
      registerForPushNotifications().then(token => {
        if (token) savePushToken(userId, token);
      }).catch(e => captureError(e, { action: 'registerPush' }));
      // Rappels locaux : les préférences sont chargées d'abord (elles alimentent
      // le cache que les fonctions de programmation consultent), puis chaque
      // rappel est (re)posé. Chaque schedule* refuse de lui-même si sa clé est
      // désactivée — l'appelant n'a plus à s'en souvenir.
      getNotificationPrefs(userId).then(prefs => {
        if (prefs.daily_reminder) scheduleDailyReminder(prefs.reminder_hour);
        return scheduleScoreReminder();
      }).catch(e => captureError(e, { action: 'scheduleLocalReminders' }));
    } catch (e) {
      captureError(e, { action: 'fetchProfile', userId });
      setProfileError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  async function fetchBox(userId: string) {
    try {
      // Le titre est prononcé par le serveur, box par box : `profiles.role`
      // vaut pour le compte, pas pour la box active. Un `box_owner` qui n'est
      // que coach dans la box active est un coach dans cette box.
      const adminRows = await readRows(
        supabase.rpc('get_my_admin_boxes'),
        { screen: 'AuthContext', action: 'fetchBox.adminBoxes' },
      );
      const staffRole = new Map<string, 'owner' | 'coach'>(
        (adminRows ?? []).map(r => [r.id, r.my_role === 'owner' ? 'owner' as const : 'coach' as const]),
      );

      const entries: MyBoxEntry[] = [];
      // Member boxes (always fetch — owner can also be member of other boxes)
      const memberships = await readRows(
        supabase
          .from('box_members')
          .select(BOX_MEMBERSHIP_COLUMNS)
          .eq('member_id', userId)
          .eq('status', 'active'),
        { screen: 'AuthContext', action: 'fetchBox.memberships' },
      );
      if (memberships) {
        for (const m of memberships) {
          const box = m.boxes as unknown as Box | null;
          if (box && !entries.find(e => e.box.id === box.id)) {
            entries.push({ box, role: staffRole.get(box.id) ?? 'member' });
          }
        }
      }
      // Boxes administrées sans ligne box_members (gérant principal).
      const missing = (adminRows ?? [])
        .map(r => r.id)
        .filter(id => !entries.find(e => e.box.id === id));
      if (missing.length > 0) {
        const owned = await readRows(
          supabase.from('boxes').select(BOX_COLUMNS).in('id', missing),
          { screen: 'AuthContext', action: 'fetchBox.adminBoxRows' },
        );
        for (const b of owned ?? []) {
          entries.push({ box: b as Box, role: staffRole.get(b.id) ?? 'coach' });
        }
      }
      setMyBoxes(entries);
      // Restore last active box from AsyncStorage, or pick first
      const savedId = await AsyncStorage.getItem(ACTIVE_BOX_KEY);
      const saved = savedId ? entries.find(e => e.box.id === savedId) : null;
      const active = saved ?? entries[0] ?? null;
      if (active) {
        setCurrentBox(active.box);
        setBoxRole(active.role);
        if (active.role === 'owner') await fetchSubscription(active.box.id);
        else setBoxSubscription(null);
      } else {
        setCurrentBox(null);
        setBoxRole(null);
        setBoxSubscription(null);
      }
    } catch (e) {
      captureError(e, { action: 'fetchBox', userId });
    }
  }

  async function fetchSubscription(boxId: string) {
    try {
      const data = await readRows(
        supabase.from('box_subscriptions').select('*').eq('box_id', boxId).maybeSingle(),
        { screen: 'AuthContext', action: 'fetchSubscription' },
      );
      setBoxSubscription(data as BoxSubscription | null);
    } catch (e) {
      captureError(e, { action: 'fetchSubscription', boxId });
    }
  }

  async function refreshSubscription() {
    if (currentBox) await fetchSubscription(currentBox.id);
  }

  async function refreshBox() {
    if (user) await fetchBox(user.id);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) trackLogin();
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, username: string, level: string, gender?: string) {
    // 1) Resolve a free username BEFORE creating the auth user to avoid orphan auth.users rows.
    //    If the chosen pseudo is taken, we auto-append a random 3-4 digit suffix until one is free.
    const baseUsername = username.trim();
    let finalUsername = baseUsername;
    {
      // Même famille que `fetchProfile` : si ce sondage échoue en silence, le
      // pseudo est cru libre, le trigger d'inscription tombe sur la contrainte
      // d'unicité, et l'utilisateur lit une erreur qui ne parle pas de pseudo.
      const { data: existing, error: probeError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', baseUsername)
        .maybeSingle();
      if (probeError) {
        captureError(probeError, { action: 'signUp.usernameProbe' });
        return { error: `Vérification du pseudo impossible : ${probeError.message}` };
      }
      if (existing) {
        let attempts = 0;
        while (attempts < 10) {
          const suffix = Math.floor(100 + Math.random() * 9900); // 100..9999
          const candidate = `${baseUsername}${suffix}`;
          const { data: clash, error: clashError } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', candidate)
            .maybeSingle();
          if (clashError) {
            captureError(clashError, { action: 'signUp.usernameProbe' });
            return { error: `Vérification du pseudo impossible : ${clashError.message}` };
          }
          if (!clash) {
            finalUsername = candidate;
            break;
          }
          attempts++;
        }
        if (finalUsername === baseUsername) {
          return { error: 'Impossible de générer un pseudo libre. Réessaie avec un autre pseudo.' };
        }
      }
    }

    // Le pseudo/niveau/genre passent en MÉTADONNÉE signUp : le trigger serveur
    // handle_new_user (Phase 0-A) crée le profil à partir de ces champs.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: finalUsername, level, gender: gender || null },
        emailRedirectTo: EMAIL_CONFIRMED_URL,
      },
    });
    if (error) return { error: error.message };
    if (data.user) {
      // Reset onboarding tutorial flag — every new account sees the presentation
      await AsyncStorage.removeItem('@athlex:onboardingDone');
      const role = 'member';
      const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
      // Le profil est désormais créé SERVEUR par le trigger. On garde un upsert
      // idempotent en FILET (onConflict:'id', ignoreDuplicates) : si le trigger
      // a déjà inséré la ligne, c'est un no-op — plus jamais de 23505 sur l'id
      // (le piège prouvé en Phase 0-A/A.3). Si le trigger n'avait pas tourné,
      // l'upsert crée la ligne.
      //
      // Sans session (confirmation d'e-mail activée), le client reste `anon`, qui
      // n'a aucun GRANT INSERT sur `profiles` : le filet échouerait forcément.
      // C'est justement le cas où le trigger a déjà fait le travail.
      if (data.session) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          username: finalUsername,
          level,
          role,
          gender: gender || null,
          elo: 1000,
          total_matches: 0,
          wins: 0,
          losses: 0,
          referral_code,
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (profileError) {
          // Best-effort sign-out so the auth state stays clean even if an orphan was created.
          await supabase.auth.signOut().catch(() => {});
          return { error: `Profil: ${profileError.message}` };
        }
      }
      // Award welcome badge (level_scaled) silently
      awardLevelBadge(data.user.id, 'level_scaled').catch(e => captureError(e, { action: 'awardWelcomeBadge' }));
      if (!data.session) return { error: 'CONFIRM_EMAIL', finalUsername };
      trackSignUp('email', role, level);
      // Le pseudo posé en base fait foi : la pré-résolution ci-dessus lit
      // `profiles` en anon (aucun GRANT SELECT) et ne voit donc aucune
      // collision — c'est le trigger qui suffixe. Sans cette relecture, l'écran
      // annoncerait un pseudo différent de celui réellement enregistré.
      const created = await readRows(
        supabase.from('profiles').select('username').eq('id', data.user.id).maybeSingle(),
        { screen: 'AuthContext', action: 'signUp.readUsername' },
      );
      if (created?.username) finalUsername = created.username;
      // Profile is now in DB — explicitly refresh user state so navigation triggers
      await fetchProfile(data.user.id);
    }
    return { error: null, finalUsername };
  }

  async function joinBox(inviteCode: string): Promise<{ error: string | null }> {
    if (!user) return { error: 'Non connecté' };
    const { data: boxId, error: joinErr } = await supabase.rpc('join_box_by_invite', {
      p_invite_code: inviteCode,
    });
    if (joinErr || !boxId) {
      return { error: joinErr?.message ?? 'Code invalide ou box introuvable' };
    }

    const box = await readRows(
      supabase.from('boxes').select(BOX_COLUMNS).eq('id', boxId).single(),
      { screen: 'AuthContext', action: 'joinBox.readBox' },
    );
    if (!box) return { error: 'Box introuvable' };

    const newEntry: MyBoxEntry = { box: box as Box, role: 'member' };
    setMyBoxes(prev => [...prev, newEntry]);
    setCurrentBox(box as Box);
    setBoxRole('member');
    await AsyncStorage.setItem(ACTIVE_BOX_KEY, box.id);
    trackBoxJoin();
    setBoxSkipped(false);
    await AsyncStorage.removeItem(BOX_SKIPPED_KEY);
    return { error: null };
  }

  async function skipBox() {
    setBoxSkipped(true);
    await AsyncStorage.setItem(BOX_SKIPPED_KEY, 'true');
  }

  async function leaveBox(): Promise<{ error: string | null }> {
    if (!user || !currentBox) return { error: 'Pas dans une box' };
    const { error } = await supabase
      .from('box_members')
      .delete()
      .eq('member_id', user.id)
      .eq('box_id', currentBox.id);
    if (error) return { error: error.message };
    const remaining = myBoxes.filter(e => e.box.id !== currentBox.id);
    setMyBoxes(remaining);
    if (remaining.length > 0) {
      setCurrentBox(remaining[0].box);
      setBoxRole(remaining[0].role);
      await AsyncStorage.setItem(ACTIVE_BOX_KEY, remaining[0].box.id);
    } else {
      setCurrentBox(null);
      setBoxRole(null);
      await AsyncStorage.removeItem(ACTIVE_BOX_KEY);
    }
    setBoxSkipped(false);
    await AsyncStorage.removeItem(BOX_SKIPPED_KEY);
    return { error: null };
  }

  async function switchBox(boxId: string) {
    const entry = myBoxes.find(e => e.box.id === boxId);
    if (!entry) return;
    setCurrentBox(entry.box);
    setBoxRole(entry.role);
    await AsyncStorage.setItem(ACTIVE_BOX_KEY, boxId);
    // L'abonnement suit la box active : gardé d'une box à l'autre, il ferait
    // juger l'accès de la box courante sur le contrat d'une autre.
    if (entry.role === 'owner') await fetchSubscription(entry.box.id);
    else setBoxSubscription(null);
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: UPDATE_PASSWORD_URL,
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    const userId = user?.id ?? null;
    await runSignOutSequence({
      removePushToken: userId ? () => removePushToken(userId) : null,
      signOut: () => supabase.auth.signOut(),
      onRemovePushError: e => captureError(e, { action: 'removePushSignOut', userId }),
    });
    clearUserContext();
    resetUser();
    setUser(null);
    setSession(null);
    setCurrentBox(null);
    setBoxRole(null);
    setMyBoxes([]);
    setBoxSkipped(false);
    // Purge des clés locales au signOut (3.8) — appareils partagés : box active,
    // onboarding, messages vus (lastSeenMessages_*), file de badges, etc.
    // `@athlex:tourDone` en est exclu : le tutoriel guidé décrit l'interface de
    // l'appareil, pas la session — le rejouer à chaque déconnexion le ferait
    // réapparaître devant quelqu'un qui l'a déjà vu.
    try {
      const keys = await AsyncStorage.getAllKeys();
      const toRemove = keys.filter(isPurgedAtSignOut);
      if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
    } catch (e) { captureError(e, { action: 'signOutPurge' }); }
    // Le cache mémoire des préférences et les rappels déjà posés appartiennent au
    // compte qui se déconnecte : sur un appareil partagé, le suivant hériterait
    // sinon des réglages et des rappels du précédent.
    await clearCachedPrefs();
    await cancelAllLocalReminders().catch(e => captureError(e, { action: 'signOutCancelReminders' }));
  }

  async function deleteAccount(): Promise<{ error: string | null }> {
    try {
      if (user) await removePushToken(user.id).catch(e => captureError(e, { action: 'removePushDelete' }));
      const { error } = await supabase.rpc('delete_user_account');
      if (error) return { error: error.message };
      trackDeleteAccount();
      clearUserContext();
      resetUser();
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setCurrentBox(null);
      setBoxRole(null);
      setMyBoxes([]);
      await AsyncStorage.removeItem(ACTIVE_BOX_KEY);
      return { error: null };
    } catch (e: any) {
      return { error: e.message ?? 'Erreur inconnue' };
    }
  }

  function updateUser(updates: Partial<User>) {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }

  return (
    <AuthContext.Provider value={{
      session, user, currentBox, boxRole, myBoxes, boxSubscription, isBoxActive, daysLeftTrial,
      profileError, switchBox, loading,
      signIn, signUp, signOut, deleteAccount, resetPassword, updateUser,
      boxSkipped, skipBox, leaveBox,
      joinBox, refreshBox, refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
