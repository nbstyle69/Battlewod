import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { User, Box } from '../types';
import { Session } from '@supabase/supabase-js';
import { registerForPushNotifications, savePushToken, removePushToken, scheduleDailyReminder, getNotificationPrefs } from '../services/notifications';

const BOX_SKIPPED_KEY = '@thehub:boxSkipped';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  currentBox: Box | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string, level: string, asBoxOwner?: boolean) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  boxSkipped: boolean;
  skipBox: () => Promise<void>;
  leaveBox: () => Promise<{ error: string | null }>;
  joinBox: (inviteCode: string) => Promise<{ error: string | null }>;
  createBox: (name: string, description?: string) => Promise<{ error: string | null; box?: Box }>;
  refreshBox: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [user, setUser]             = useState<User | null>(null);
  const [currentBox, setCurrentBox] = useState<Box | null>(null);
  const [boxSkipped, setBoxSkipped] = useState(false);
  const [loading, setLoading]       = useState(true);

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
      else { setUser(null); setCurrentBox(null); setLoading(false); }
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
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(banChannel); };
  }, [user?.id]);

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setUser(data as User);
      await fetchBox(userId, data.role);
      // Register push token silently
      registerForPushNotifications().then(token => {
        if (token) savePushToken(userId, token);
      }).catch(() => {});
      // Schedule daily reminder if enabled
      getNotificationPrefs(userId).then(prefs => {
        if (prefs.daily_reminder) scheduleDailyReminder(prefs.reminder_hour);
      }).catch(() => {});
    }
    setLoading(false);
  }

  async function fetchBox(userId: string, role: string) {
    if (role === 'box_owner') {
      const { data } = await supabase
        .from('boxes').select('*').eq('owner_id', userId).maybeSingle();
      if (data) setCurrentBox(data as Box);
    } else {
      const { data } = await supabase
        .from('box_members')
        .select('box_id, boxes(*)')
        .eq('member_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (data?.boxes) setCurrentBox(data.boxes as unknown as Box);
    }
  }

  async function refreshBox() {
    if (user) await fetchBox(user.id, user.role);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, username: string, level: string, asBoxOwner = false) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const role = asBoxOwner ? 'box_owner' : 'member';
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        username,
        level,
        role,
        elo: 1000,
        total_matches: 0,
        wins: 0,
        losses: 0,
      });
      if (profileError) return { error: `Profil: ${profileError.message}` };
      if (!data.session) return { error: 'CONFIRM_EMAIL' };
      // Profile is now in DB — explicitly refresh user state so navigation triggers
      await fetchProfile(data.user.id);
    }
    return { error: null };
  }

  async function joinBox(inviteCode: string): Promise<{ error: string | null }> {
    if (!user) return { error: 'Non connecté' };
    const { data: box, error: boxErr } = await supabase
      .from('boxes')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase().trim())
      .eq('is_active', true)
      .single();
    if (boxErr || !box) return { error: 'Code invalide ou box introuvable' };

    const { error: joinErr } = await supabase.from('box_members').insert({
      box_id: box.id,
      member_id: user.id,
      status: 'active',
    });
    if (joinErr) {
      if (joinErr.code === '23505') return { error: 'Tu as déjà rejoint cette box' };
      return { error: joinErr.message };
    }
    setCurrentBox(box as Box);
    // Clear skip flag now that user has a box
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
    setCurrentBox(null);
    setBoxSkipped(false);
    await AsyncStorage.removeItem(BOX_SKIPPED_KEY);
    return { error: null };
  }

  async function createBox(name: string, description?: string): Promise<{ error: string | null; box?: Box }> {
    if (!user) return { error: 'Non connecté' };
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 5) {
      const { data } = await supabase.from('boxes').select('id').eq('invite_code', inviteCode).maybeSingle();
      if (!data) break;
      inviteCode = generateInviteCode();
      attempts++;
    }
    const { data: box, error } = await supabase.from('boxes').insert({
      owner_id: user.id,
      name,
      description,
      invite_code: inviteCode,
      is_active: true,
    }).select().single();
    if (error || !box) return { error: error?.message ?? 'Erreur création box' };
    await supabase.from('profiles').update({ role: 'box_owner' }).eq('id', user.id);
    updateUser({ role: 'box_owner' });
    setCurrentBox(box as Box);
    return { error: null, box: box as Box };
  }

  async function signOut() {
    if (user) removePushToken(user.id).catch(() => {});
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCurrentBox(null);
  }

  function updateUser(updates: Partial<User>) {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }

  return (
    <AuthContext.Provider value={{
      session, user, currentBox, loading,
      signIn, signUp, signOut, updateUser,
      boxSkipped, skipBox, leaveBox,
      joinBox, createBox, refreshBox,
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
