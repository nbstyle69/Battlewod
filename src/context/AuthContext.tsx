import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { BOX_COLUMNS, BOX_MEMBERSHIP_COLUMNS } from '../lib/boxColumns';
import { readRows } from '../lib/db';
import { User, Box, BoxMemberRole, BoxSubscription } from '../types';
import { Session } from '@supabase/supabase-js';
import { registerForPushNotifications, savePushToken, removePushToken, scheduleDailyReminder, scheduleScoreReminder, getNotificationPrefs } from '../services/notifications';
import { awardLevelBadge } from '../services/gamification';
import { setUserContext, clearUserContext, captureError } from '../lib/sentry';
import { identifyUser, resetUser, trackLogin, trackSignUp, trackBoxJoin, trackDeleteAccount } from '../lib/analytics';

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
      else { setUser(null); setCurrentBox(null); setBoxRole(null); setLoading(false); }
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
      // Colonnes EXPLICITES, jamais `*` : la Phase 3 (3B2) révoque SELECT(email)
      // sur profiles pour `authenticated` → un select('*') tomberait en 42501 au
      // login. L'email du compte courant vient de la SESSION auth, pas de la table.
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, level, role, elo, total_matches, wins, losses, created_at, full_name, bio, personal_records, gender, featured_badges, total_scores_submitted, total_wods_generated, total_timer_sessions, total_messages_sent, total_tournaments, total_tournament_wins, total_friends, referral_code, referred_by')
        .eq('id', userId)
        .single();
      if (data) {
        const { data: authData } = await supabase.auth.getUser();
        const email = authData?.user?.email ?? '';
        const profile = { ...data, email } as User;
        setUser(profile);
        setUserContext(profile.id, email, profile.username);
        identifyUser(profile.id, { email, username: profile.username, role: profile.role, level: profile.level });
        await fetchBox(userId, data.role);
        // Register push token silently
        registerForPushNotifications().then(token => {
          if (token) savePushToken(userId, token);
        }).catch(e => captureError(e, { action: 'registerPush' }));
        // Schedule daily reminder if enabled
        getNotificationPrefs(userId).then(prefs => {
          if (prefs.daily_reminder) scheduleDailyReminder(prefs.reminder_hour);
        }).catch(e => captureError(e, { action: 'scheduleDailyReminder' }));
        scheduleScoreReminder().catch(e => captureError(e, { action: 'scheduleScoreReminder' }));
      }
    } catch (e) {
      captureError(e, { action: 'fetchProfile', userId });
    }
    setLoading(false);
  }

  async function fetchBox(userId: string, role: string) {
    try {
      const entries: MyBoxEntry[] = [];
      // Owner box
      if (role === 'box_owner') {
        const data = await readRows(
          supabase.from('boxes').select(BOX_COLUMNS).eq('owner_id', userId).maybeSingle(),
          { screen: 'AuthContext', action: 'fetchBox.owner' },
        );
        if (data) entries.push({ box: data as Box, role: 'owner' });
      }
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
          if (m.boxes && !entries.find(e => e.box.id === (m.boxes as any).id)) {
            entries.push({ box: m.boxes as unknown as Box, role: (m.role as BoxMemberRole) ?? 'member' });
          }
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
        if (active.role === 'owner') {
          await fetchSubscription(active.box.id);
        }
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
    if (user) await fetchBox(user.id, user.role);
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
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', baseUsername)
        .maybeSingle();
      if (existing) {
        let attempts = 0;
        while (attempts < 10) {
          const suffix = Math.floor(100 + Math.random() * 9900); // 100..9999
          const candidate = `${baseUsername}${suffix}`;
          const { data: clash } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', candidate)
            .maybeSingle();
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
      options: { data: { username: finalUsername, level, gender: gender || null } },
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
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }

  async function signOut() {
    if (user) removePushToken(user.id).catch(e => captureError(e, { action: 'removePushSignOut' }));
    clearUserContext();
    resetUser();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCurrentBox(null);
    setBoxRole(null);
    setMyBoxes([]);
    await AsyncStorage.removeItem(ACTIVE_BOX_KEY);
  }

  async function deleteAccount(): Promise<{ error: string | null }> {
    try {
      if (user) removePushToken(user.id).catch(e => captureError(e, { action: 'removePushDelete' }));
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
      switchBox, loading,
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
