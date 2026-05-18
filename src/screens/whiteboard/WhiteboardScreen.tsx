import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Clock, ChevronRight, ChevronUp, ChevronDown, Hash, Users, X, MessageCircle, FileText, Trophy, Upload, Sparkles, Newspaper, Play, BookOpen, Check, Timer as TimerIcon, Camera, CameraOff } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { hapticSuccess } from '../../lib/haptics';
import { recordActivity } from '../../services/gamification';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWOD } from '../../types';
import { WhiteboardStackParamList } from '../../navigation';
import { buildTimerRunParams, formatWODPreconfig, EmomOverride } from '../../utils/wodToTimer';
import WeekDayPicker from '../../components/WeekDayPicker';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';
import EmeraldCTAButton from '../../components/glass/EmeraldCTAButton';

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

type Nav = NativeStackNavigationProp<WhiteboardStackParamList>;

interface BoxMember {
  id: string;
  username: string;
  level: string;
  elo: number;
  avatar_url?: string | null;
}

const TYPE_STYLES = StyleSheet.create({
  typeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.5 },
});

function WodTypeBadge({ type }: { type?: string }) {
  const color = TYPE_COLORS[type ?? 'custom'] ?? '#6B7280';
  return (
    <View style={[TYPE_STYLES.typeBadge, { backgroundColor: `${color}18` }]}>
      <Text style={[TYPE_STYLES.typeBadgeText, { color }]}>{(type ?? 'custom').toUpperCase()}</Text>
    </View>
  );
}

export default function WhiteboardScreen() {
  const { user, currentBox, boxRole, joinBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);

  const [dayWODs,       setDayWODs]       = useState<BoxWOD[]>([]);
  const [completedIds,  setCompletedIds]  = useState<Set<string>>(new Set());
  const [scoredIds,     setScoredIds]     = useState<Set<string>>(new Set());
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [selectedDate,  setSelectedDate]  = useState(toISO(new Date()));
  const [membersModal,  setMembersModal]  = useState(false);
  const [members,       setMembers]       = useState<BoxMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Program WODs
  interface ProgWodEntry { programTitle: string; weekNumber: number; dayLabel: string; wod: { id: string; title: string; description: string; wod_type: string; time_cap_seconds?: number } }
  const [programWods, setProgramWods] = useState<ProgWodEntry[]>([]);

  // Join box state
  const [joinModal, setJoinModal] = useState(false);
  const [joinCode,  setJoinCode]  = useState('');
  const [joining,   setJoining]   = useState(false);

  // Unread badges
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadArticles, setUnreadArticles] = useState(0);

  // Timer-launch modal (preconfigured from a WOD card)
  const [timerModalWod, setTimerModalWod] = useState<BoxWOD | null>(null);
  const [timerCountdown, setTimerCountdown] = useState<number>(3);
  const [emomOverride, setEmomOverride] = useState<EmomOverride | null>(null);

  // Personal WODs (when user has no box)
  const [personalWODs, setPersonalWODs] = useState<BoxWOD[]>([]);

  function openTimerModal(wod: BoxWOD) {
    setTimerCountdown(3);
    setTimerModalWod(wod);
    if ((wod.wod_type ?? '') === 'emom') {
      const iv = wod.emom_interval_minutes && wod.emom_interval_minutes > 0 ? wod.emom_interval_minutes : 1;
      const capMin = wod.time_cap_seconds ? Math.max(0, Math.round(wod.time_cap_seconds / 60)) : 0;
      const rounds = wod.rounds && wod.rounds > 0
        ? wod.rounds
        : (capMin > 0 ? Math.max(1, Math.floor(capMin / iv)) : 10);
      // Always start in PERSO mode (intervalMinutes=0) with customSec from WOD
      setEmomOverride({ intervalMinutes: 0, customSec: iv * 60, rounds });
    } else {
      setEmomOverride(null);
    }
  }

  function launchTimerFromWod(wod: BoxWOD, withCamera: boolean) {
    const override = (wod.wod_type === 'emom' && emomOverride) ? emomOverride : undefined;
    const params = buildTimerRunParams(wod, { withCamera, countdown: timerCountdown, emomOverride: override });
    setTimerModalWod(null);
    navigation.navigate('TimerRun', params);
  }

  // Renders the EMOM interval/rounds picker (PERSO mode: intervalle libre + rounds)
  function renderEmomPicker() {
    if (!timerModalWod || timerModalWod.wod_type !== 'emom' || !emomOverride) return null;
    const ov = emomOverride;
    const customSec = ov.customSec ?? 60;
    const customMin = Math.floor(customSec / 60);
    const customSs = customSec % 60;
    const totalSec = customSec * ov.rounds;
    const totalMm = Math.floor(totalSec / 60);
    const totalSs = totalSec % 60;

    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={S.timerModalLabel}>Intervalle</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={S.emomStepRow}>
            <TouchableOpacity style={S.emomStepBtn} onPress={() => setEmomOverride({ ...ov, intervalMinutes: 0, customSec: Math.max(1, customSec - 60) })}>
              <Text style={S.emomStepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={S.emomStepValue}>{customMin}<Text style={S.emomStepUnit}> min</Text></Text>
            <TouchableOpacity style={S.emomStepBtn} onPress={() => setEmomOverride({ ...ov, intervalMinutes: 0, customSec: customSec + 60 })}>
              <Text style={S.emomStepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={S.emomStepRow}>
            <TouchableOpacity style={S.emomStepBtn} onPress={() => {
              const next = customSec % 5 === 0 ? customSec - 5 : Math.floor(customSec / 5) * 5;
              setEmomOverride({ ...ov, intervalMinutes: 0, customSec: Math.max(1, next) });
            }}>
              <Text style={S.emomStepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={S.emomStepValue}>{customSs}<Text style={S.emomStepUnit}> sec</Text></Text>
            <TouchableOpacity style={S.emomStepBtn} onPress={() => {
              const next = customSec % 5 === 0 ? customSec + 5 : Math.ceil(customSec / 5) * 5;
              setEmomOverride({ ...ov, intervalMinutes: 0, customSec: next });
            }}>
              <Text style={S.emomStepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={S.timerModalLabel}>Rounds</Text>
        <View style={S.emomStepRow}>
          <TouchableOpacity style={S.emomStepBtn} onPress={() => setEmomOverride({ ...ov, rounds: Math.max(1, ov.rounds - 1) })}>
            <Text style={S.emomStepBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={S.emomStepValue}>{ov.rounds}<Text style={S.emomStepUnit}> rounds</Text></Text>
          <TouchableOpacity style={S.emomStepBtn} onPress={() => setEmomOverride({ ...ov, rounds: ov.rounds + 1 })}>
            <Text style={S.emomStepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={S.emomTotalHint}>
          Bip au début de chaque interval · Total : {totalMm} min{totalSs ? ` ${totalSs}s` : ''}
        </Text>
      </View>
    );
  }

  useFocusEffect(useCallback(() => {
    if (!user || !currentBox) return;
    (async () => {
      try {
        const [lastMsg, lastArt] = await Promise.all([
          AsyncStorage.getItem(`lastSeenMessages_${user.id}_${currentBox.id}`),
          AsyncStorage.getItem(`lastSeenArticles_${user.id}_${currentBox.id}`),
        ]);
        // Unread messages (general, not from me, after last seen)
        let msgQuery = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('box_id', currentBox.id)
          .eq('message_type', 'general')
          .neq('sender_id', user.id);
        if (lastMsg) msgQuery = msgQuery.gt('created_at', lastMsg);
        const { count: msgCount } = await msgQuery;
        setUnreadMessages(msgCount ?? 0);

        // Unread articles (after last seen)
        let artQuery = supabase
          .from('box_articles')
          .select('id', { count: 'exact', head: true })
          .eq('box_id', currentBox.id);
        if (lastArt) artQuery = artQuery.gt('created_at', lastArt);
        const { count: artCount } = await artQuery;
        setUnreadArticles(artCount ?? 0);
      } catch (_) {}
    })();
  }, [user, currentBox]));

  const loadMembers = useCallback(async () => {
    if (!currentBox) return;
    setMembersLoading(true);
    const { data } = await supabase
      .from('box_members')
      .select('member_id, profiles:member_id(id, username, level, elo, avatar_url)')
      .eq('box_id', currentBox.id)
      .eq('status', 'active');
    const profiles = (data ?? [])
      .map((row: any) => row.profiles)
      .filter(Boolean)
      .sort((a: any, b: any) => (b.elo ?? 0) - (a.elo ?? 0));
    setMembers(profiles as BoxMember[]);
    setMembersLoading(false);
  }, [currentBox]);

  const { data: wodData, isLoading: wodQueryLoading, refetch: refetchWods } = useFocusQuery(
    ['whiteboard', currentBox?.id, selectedDate, boxRole],
    async () => {
    if (!currentBox) return [];

    // 1. Fetch user's group memberships (via members uuid[] array on message_groups)
    const { data: myGroupRows } = user
      ? await supabase.from('message_groups').select('id, wod_visibility_mode').eq('box_id', currentBox.id).contains('members', [user.id])
      : { data: [] };
    const myGroupIds = new Set((myGroupRows ?? []).map((r: any) => r.id));

    // Build visibility mode map from the same query (already fetched wod_visibility_mode)
    const groupVisibility: Record<string, string> = {};
    for (const g of (myGroupRows ?? []) as any[]) {
      groupVisibility[g.id] = g.wod_visibility_mode ?? 'weekly';
    }

    const todayISO = toISO(new Date());
    const isFutureDate = selectedDate > todayISO;

    // Fetch user's active program memberships for this box
    let myProgramIds = new Set<string>();
    if (user) {
      const { data: progMem } = await supabase
        .from('program_members')
        .select('program_id')
        .eq('user_id', user.id)
        .eq('status', 'active');
      for (const r of (progMem ?? []) as any[]) myProgramIds.add(r.program_id);
    }

    const isStaff = boxRole === 'owner' || boxRole === 'coach' || user?.id === currentBox.owner_id;
    let query = supabase
      .from('box_wods')
      .select('*')
      .eq('box_id', currentBox.id)
      .eq('scheduled_date', selectedDate)
      .order('sort_order');
    if (!isStaff) query = query.eq('is_published', true);
    const { data: dayData } = await query;

    const allWodIds = (dayData ?? []).map((w: any) => w.id);

    // 2. Fetch group access restrictions
    let accessMap: Record<string, string[]> = {};
    let programAccessMap: Record<string, string[]> = {};
    if (allWodIds.length > 0) {
      const { data: accessRows } = await supabase
        .from('wod_group_access')
        .select('wod_id, group_id')
        .in('wod_id', allWodIds);
      for (const r of (accessRows ?? []) as any[]) {
        if (!accessMap[r.wod_id]) accessMap[r.wod_id] = [];
        accessMap[r.wod_id].push(r.group_id);
      }
      // Fetch program access
      const { data: progAccessRows } = await supabase
        .from('wod_program_access')
        .select('wod_id, program_id')
        .in('wod_id', allWodIds);
      for (const r of (progAccessRows ?? []) as any[]) {
        if (!programAccessMap[r.wod_id]) programAccessMap[r.wod_id] = [];
        programAccessMap[r.wod_id].push(r.program_id);
      }
    }

    // 3. Filter by group access + program access + visibility mode
    function canSee(wod: any): boolean {
      if (isStaff) return true;
      const restrictedGroups = accessMap[wod.id];
      const restrictedPrograms = programAccessMap[wod.id];
      const hasGroupRestriction = restrictedGroups && restrictedGroups.length > 0;
      const hasProgramRestriction = restrictedPrograms && restrictedPrograms.length > 0;

      // No restriction at all → visible to all
      if (!hasGroupRestriction && !hasProgramRestriction) return true;

      // Check program access: if user is member of any assigned program → visible
      if (hasProgramRestriction) {
        const matchesProgram = restrictedPrograms!.some(pid => myProgramIds.has(pid));
        if (matchesProgram) return true;
      }

      // Check group access
      if (hasGroupRestriction) {
        const myMatchingGroups = restrictedGroups!.filter(gid => myGroupIds.has(gid));
        if (myMatchingGroups.length > 0) {
          if (isFutureDate) {
            const hasWeekly = myMatchingGroups.some(gid => groupVisibility[gid] === 'weekly');
            if (hasWeekly) return true;
          } else {
            return true;
          }
        }
      }

      return false;
    }

    return (dayData ?? []).filter(canSee) as BoxWOD[];
  },
    { enabled: !!currentBox },
  );

  // Fetch program WODs for selected date
  useEffect(() => {
    if (!user) { setProgramWods([]); return; }
    (async () => {
      try {
        const { data: memberships } = await supabase
          .from('program_members')
          .select('program_id, start_date, programs:program_id(id, title, type, duration_weeks, days_per_week)')
          .eq('user_id', user.id)
          .eq('status', 'active');
        if (!memberships || memberships.length === 0) { setProgramWods([]); return; }

        const entries: ProgWodEntry[] = [];
        const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

        for (const m of memberships as any[]) {
          const prog = m.programs;
          if (!prog) continue;

          if (prog.type === 'fixed') {
            const startDate = new Date(m.start_date + 'T00:00:00');
            const selDate = new Date(selectedDate + 'T00:00:00');
            const diffDays = Math.floor((selDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) continue;
            const dayNumber = diffDays + 1;
            const totalDays = (prog.duration_weeks ?? 6) * 7;
            if (dayNumber > totalDays) continue;
            const weekNum = Math.ceil(dayNumber / 7);
            const dayInWeek = ((dayNumber - 1) % 7);

            const { data: wods } = await supabase
              .from('program_wods')
              .select('id, title, description, wod_type, time_cap_seconds')
              .eq('program_id', prog.id)
              .eq('day_number', dayNumber)
              .order('sort_order');
            for (const w of (wods ?? []) as any[]) {
              entries.push({ programTitle: prog.title, weekNumber: weekNum, dayLabel: `S${weekNum} ${DAY_NAMES[dayInWeek]}`, wod: w });
            }
          } else {
            // ongoing: match by scheduled_date
            const { data: wods } = await supabase
              .from('program_wods')
              .select('id, title, description, wod_type, time_cap_seconds, week_number')
              .eq('program_id', prog.id)
              .eq('scheduled_date', selectedDate)
              .order('sort_order');
            for (const w of (wods ?? []) as any[]) {
              entries.push({ programTitle: prog.title, weekNumber: w.week_number ?? 0, dayLabel: '', wod: w });
            }
          }
        }
        setProgramWods(entries);
      } catch (_) { setProgramWods([]); }
    })();
  }, [user, selectedDate]);

  useEffect(() => {
    if (wodData) { setDayWODs(wodData); setLoading(false); setRefreshing(false); }
    else if (wodQueryLoading) setLoading(true);
  }, [wodData, wodQueryLoading]);

  // Fetch user's completions + submitted scores for the visible WODs
  useEffect(() => {
    if (!user || dayWODs.length === 0) {
      setCompletedIds(new Set());
      setScoredIds(new Set());
      return;
    }
    const ids = dayWODs.map(w => w.id);
    (async () => {
      try {
        const [{ data: comps }, { data: scores }] = await Promise.all([
          supabase.from('wod_completions').select('wod_id').eq('member_id', user.id).in('wod_id', ids),
          supabase.from('wod_scores').select('wod_id').eq('member_id', user.id).in('wod_id', ids),
        ]);
        setCompletedIds(new Set((comps ?? []).map((c: any) => c.wod_id)));
        setScoredIds(new Set((scores ?? []).map((s: any) => s.wod_id)));
      } catch (e) { captureError(e, { screen: 'Whiteboard', action: 'fetchCompletions' }); }
    })();
  }, [user, dayWODs]);

  const toggleCompletion = useCallback(async (wodId: string) => {
    if (!user || !currentBox) return;
    const isDone = completedIds.has(wodId) || scoredIds.has(wodId);
    // If already scored, don't allow toggling (score is authoritative)
    if (scoredIds.has(wodId)) return;
    // Optimistic update
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (isDone) next.delete(wodId); else next.add(wodId);
      return next;
    });
    try {
      if (isDone) {
        await supabase.from('wod_completions').delete().eq('wod_id', wodId).eq('member_id', user.id);
      } else {
        hapticSuccess();
        const { error } = await supabase.from('wod_completions').insert({
          wod_id: wodId, member_id: user.id, box_id: currentBox.id,
        });
        if (error && error.code !== '23505') throw error;
        // Count as activity for streak (only once per wod thanks to unique constraint)
        try { await recordActivity(user.id, currentBox.id); } catch (_) {}
      }
    } catch (e) {
      // Revert on error
      setCompletedIds(prev => {
        const next = new Set(prev);
        if (isDone) next.add(wodId); else next.delete(wodId);
        return next;
      });
      captureError(e, { screen: 'Whiteboard', action: 'toggleCompletion', wodId });
      Alert.alert('Erreur', "Impossible de mettre à jour.");
    }
  }, [user, currentBox, completedIds, scoredIds]);

  const isStaff = boxRole === 'owner' || boxRole === 'coach' || user?.id === currentBox?.owner_id;

  async function moveWod(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= dayWODs.length) return;
    const updated = [...dayWODs];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setDayWODs(updated);
    // Persist new sort_order for both swapped WODs
    const promises = updated.map((w, i) =>
      supabase.from('box_wods').update({ sort_order: i }).eq('id', w.id)
    );
    await Promise.all(promises);
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const { error } = await joinBox(joinCode.trim());
    setJoining(false);
    if (error) { Alert.alert('Erreur', error); return; }
    setJoinModal(false);
    setJoinCode('');
  }


  // Fetch personal WODs (box_id IS NULL, created_by = user) when no current box
  const loadPersonalWODs = useCallback(async () => {
    if (!user || currentBox) { setPersonalWODs([]); return; }
    const { data } = await supabase
      .from('box_wods')
      .select('*')
      .is('box_id', null)
      .eq('created_by', user.id)
      .eq('scheduled_date', selectedDate)
      .order('sort_order');
    setPersonalWODs((data ?? []) as BoxWOD[]);
  }, [user, currentBox, selectedDate]);

  useFocusEffect(useCallback(() => { loadPersonalWODs(); }, [loadPersonalWODs]));

  if (!currentBox) {
    const todayISO = toISO(new Date());
    return (
      <View style={S.container}>
      <GlassBackground />
        <View style={S.header}>
          <Text style={S.headerTitle}>Ma Box</Text>
        </View>

        {/* Top CTA: rejoindre une box / importation WOD */}
        <View style={S.topCtaRow}>
          <TouchableOpacity style={S.topJoinBtn} onPress={() => setJoinModal(true)} activeOpacity={0.85}>
            <Hash color="#fff" size={15} />
            <Text style={S.topJoinBtnText}>Rejoindre une box</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={S.topImportBtn}
            onPress={() => navigation.navigate('Documents')}
            activeOpacity={0.85}
          >
            <Upload size={15} color={theme.accent} />
            <Text style={S.topImportBtnText}>Importation WOD</Text>
          </TouchableOpacity>
        </View>

        <WeekDayPicker
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          theme={theme}
        />

        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPersonalWODs().finally(() => setRefreshing(false)); }} />}
        >
          <View style={S.section}>
            <Text style={S.sectionTitle}>
              {selectedDate === todayISO
                ? 'Whiteboard — Séance du jour'
                : new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>

            {personalWODs.length > 0 ? (
              <View style={S.dayGroup}>
                {personalWODs.map(wod => (
                  <TouchableOpacity
                    key={wod.id}
                    style={S.wodCard}
                    onPress={() => navigation.navigate('PersonalWODForm', { wodId: wod.id, date: selectedDate })}
                    activeOpacity={0.8}
                  >
                    <View style={S.wodCardTop}>
                      <WodTypeBadge type={wod.wod_type} />
                      {wod.time_cap_seconds != null && (
                        <View style={S.timeCap}>
                          <Clock color={theme.textMuted} size={12} />
                          <Text style={S.timeCapText}>Cap {Math.floor(wod.time_cap_seconds / 60)} min</Text>
                        </View>
                      )}
                    </View>
                    <Text style={S.wodTitle}>{wod.title}</Text>
                    {wod.description ? <Text style={S.wodDesc} numberOfLines={3}>{wod.description}</Text> : null}
                    <View style={S.wodCardFooter}>
                      <View style={S.wodCardAction}>
                        <Text style={S.wodCardActionText}>Modifier</Text>
                        <ChevronRight color={theme.accent} size={14} />
                      </View>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); openTimerModal(wod); }}
                        style={S.timerBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Lancer le chrono"
                      >
                        <TimerIcon color={theme.accent} size={16} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={S.createWodBtn}
                  onPress={() => navigation.navigate('PersonalWODForm', { date: selectedDate })}
                  activeOpacity={0.85}
                >
                  <Sparkles size={16} color={theme.accent} />
                  <Text style={S.createWodBtnText}>+ Ajouter un WOD</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={S.noWodCard}>
                <Text style={S.noWodEmoji}>📋</Text>
                <Text style={S.noWodText}>Pas de WOD publié ce jour</Text>
                <EmeraldCTAButton
                  icon={<Sparkles size={16} color="#fff" />}
                  size="md"
                  onPress={() => navigation.navigate('PersonalWODForm', { date: selectedDate })}
                  style={{ marginTop: 14 }}
                >
                  + Créer un WOD
                </EmeraldCTAButton>
              </View>
            )}
          </View>

        </ScrollView>

        {/* Launch Timer Modal (réutilisé pour WODs perso) */}
        <Modal
          visible={!!timerModalWod}
          transparent
          animationType="fade"
          onRequestClose={() => setTimerModalWod(null)}
        >
          <View style={S.timerModalBackdrop}>
            <View style={S.timerModalCard}>
              <View style={S.timerModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={S.timerModalTitle}>Lancer le chrono</Text>
                  {timerModalWod && (
                    <Text style={S.timerModalSubtitle} numberOfLines={1}>{timerModalWod.title}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setTimerModalWod(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X color={theme.textSecondary} size={20} />
                </TouchableOpacity>
              </View>
              {timerModalWod && (
                <View style={S.timerModalPreview}>
                  <TimerIcon color={theme.accent} size={18} />
                  <Text style={S.timerModalPreviewText}>{formatWODPreconfig(timerModalWod)}</Text>
                </View>
              )}
              {renderEmomPicker()}
              <Text style={S.timerModalLabel}>Compte à rebours</Text>
              <View style={S.timerModalCountdownRow}>
                {[0, 3, 5, 10].map(v => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setTimerCountdown(v)}
                    style={[S.timerModalCdChip, timerCountdown === v && S.timerModalCdChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[S.timerModalCdChipText, timerCountdown === v && S.timerModalCdChipTextActive]}>
                      {v === 0 ? '—' : `${v}s`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={S.timerModalActions}>
                <TouchableOpacity
                  onPress={() => timerModalWod && launchTimerFromWod(timerModalWod, false)}
                  style={[S.timerModalBtn, S.timerModalBtnSecondary]}
                  activeOpacity={0.85}
                >
                  <CameraOff color={theme.text} size={18} />
                  <Text style={S.timerModalBtnSecondaryText}>Sans caméra</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => timerModalWod && launchTimerFromWod(timerModalWod, true)}
                  style={[S.timerModalBtn, S.timerModalBtnPrimary]}
                  activeOpacity={0.85}
                >
                  <Camera color="#fff" size={18} />
                  <Text style={S.timerModalBtnPrimaryText}>Avec caméra</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={joinModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setJoinModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
            <View style={S.joinSheet}>
              <View style={S.joinHandle} />
              <Text style={S.joinSheetTitle}>Rejoindre une box</Text>
              <Text style={S.joinSheetSub}>Entre le code d'invitation (6 caractères)</Text>
              <TextInput
                style={S.codeInput}
                value={joinCode}
                onChangeText={text => setJoinCode(text.toUpperCase().slice(0, 6))}
                placeholder="EX: ABC123"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
                autoFocus
              />
              <TouchableOpacity
                style={[S.joinBtn, (!joinCode.trim() || joining) && { opacity: 0.5 }]}
                onPress={handleJoin}
                disabled={!joinCode.trim() || joining}
                activeOpacity={0.85}
              >
                {joining
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Hash color="#fff" size={16} /><Text style={S.joinBtnText}>Rejoindre</Text></>
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.headerTitle}>Ma Box</Text>
            <Text style={S.headerSub}>{currentBox.name}</Text>
          </View>
        </View>
        <View style={S.headerBtns}>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => { setMembersModal(true); loadMembers(); }}
            activeOpacity={0.8}
          >
            <Users size={16} color={theme.accent} />
            <Text style={S.membersBtnText}>Membres</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <MessageCircle size={16} color={theme.accent} />
              {unreadMessages > 0 && (
                <View style={S.unreadDot}>
                  <Text style={S.unreadDotTxt}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
                </View>
              )}
            </View>
            <Text style={S.membersBtnText}>Messages</Text>
          </TouchableOpacity>
        </View>
        <View style={[S.headerBtns, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Documents')}
            activeOpacity={0.8}
          >
            <Upload size={16} color={theme.accent} />
            <Text style={S.membersBtnText}>Import WOD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Articles')}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <Newspaper size={16} color={theme.accent} />
              {unreadArticles > 0 && (
                <View style={S.unreadDot}>
                  <Text style={S.unreadDotTxt}>{unreadArticles > 9 ? '9+' : unreadArticles}</Text>
                </View>
              )}
            </View>
            <Text style={S.membersBtnText}>Actualités</Text>
          </TouchableOpacity>
        </View>
      </View>

      <WeekDayPicker
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        theme={theme}
      />

      {/* Quick action buttons when a WOD block exists */}
      {(() => {
        const mainWod =
          dayWODs.find(w => w.block_name === 'wod') ??
          dayWODs.find(w => (w as any).leaderboard_enabled === true) ??
          dayWODs.find(w => w.wod_type === 'for-time' || w.wod_type === 'amrap') ??
          dayWODs[0];
        if (!mainWod) return null;
        return (
          <View style={S.quickActions}>
            <EmeraldCTAButton
              icon={<Sparkles size={20} color="#fff" />}
              onPress={() => navigation.navigate('WODDetail', { wodId: mainWod.id })}
              textStyle={{ fontSize: 17 }}
            >
              ENTRER MON SCORE
            </EmeraldCTAButton>
            <TouchableOpacity
              style={S.rankBtn}
              onPress={() => navigation.navigate('WODDetail', { wodId: mainWod.id, scrollToLeaderboard: true })}
              activeOpacity={0.85}
            >
              <Trophy size={18} color={theme.accent} />
              <Text style={S.rankBtnText}>Classement</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refetchWods(); }} />}
      >
        <View style={S.section}>
          <Text style={S.sectionTitle}>
            {selectedDate === toISO(new Date())
              ? 'Whiteboard — Séance du jour'
              : new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {dayWODs.length > 0 ? (
            <View style={S.dayGroup}>
              {dayWODs.map((wod, idx) => {
                const tc = TYPE_COLORS[wod.wod_type ?? 'custom'] ?? '#6B7280';
                return (
                  <View key={wod.id} style={S.wodRow}>
                    {isStaff && dayWODs.length > 1 && (
                      <View style={S.reorderCol}>
                        <TouchableOpacity
                          onPress={() => moveWod(idx, 'up')}
                          disabled={idx === 0}
                          style={[S.reorderBtn, idx === 0 && { opacity: 0.25 }]}
                          hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
                        >
                          <ChevronUp color={theme.textSecondary} size={16} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => moveWod(idx, 'down')}
                          disabled={idx === dayWODs.length - 1}
                          style={[S.reorderBtn, idx === dayWODs.length - 1 && { opacity: 0.25 }]}
                          hitSlop={{ top: 4, bottom: 8, left: 8, right: 8 }}
                        >
                          <ChevronDown color={theme.textSecondary} size={16} />
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={[S.wodCard, { flex: 1 }]}>
                      <TouchableOpacity
                        onPress={() => navigation.navigate('WODDetail', { wodId: wod.id })}
                        activeOpacity={0.8}
                      >
                        <View style={S.wodCardTop}>
                          <WodTypeBadge type={wod.wod_type} />

                          {wod.video_url && (
                            <View style={[S.timeCap, { backgroundColor: '#EF444418', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}>
                              <Play color="#EF4444" size={10} />
                              <Text style={[S.timeCapText, { color: '#EF4444' }]}>Vidéo</Text>
                            </View>
                          )}
                          {wod.time_cap_seconds != null && (
                            <View style={S.timeCap}>
                              <Clock color={theme.textMuted} size={12} />
                              <Text style={S.timeCapText}>
                                Cap {Math.floor(wod.time_cap_seconds / 60)} min
                              </Text>
                            </View>
                          )}
                          {(() => {
                            const hasScore = scoredIds.has(wod.id);
                            const isDone = hasScore || completedIds.has(wod.id);
                            return (
                              <TouchableOpacity
                                onPress={(e) => { e.stopPropagation(); toggleCompletion(wod.id); }}
                                disabled={hasScore}
                                style={S.checkboxRow}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                activeOpacity={0.7}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: isDone, disabled: hasScore }}
                                accessibilityLabel={isDone ? 'Réalisé' : 'Marquer comme réalisé'}
                              >
                                {isDone && (
                                  <Text style={S.checkboxLabel}>{hasScore ? 'Scoré' : 'Réalisé'}</Text>
                                )}
                                <View style={[S.checkbox, isDone && S.checkboxChecked]}>
                                  {isDone && <Check color="#fff" size={14} strokeWidth={3} />}
                                </View>
                              </TouchableOpacity>
                            );
                          })()}
                        </View>
                        <Text style={S.wodTitle}>{wod.title}</Text>
                        {wod.description && (
                          <Text style={S.wodDesc} numberOfLines={2}>{wod.description}</Text>
                        )}
                      </TouchableOpacity>
                      <View style={S.wodCardFooter}>
                        <TouchableOpacity
                          style={S.wodCardAction}
                          onPress={() => navigation.navigate('WODDetail', { wodId: wod.id })}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={S.wodCardActionText}>Voir détails & score</Text>
                          <ChevronRight color={theme.accent} size={14} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => openTimerModal(wod)}
                          style={S.timerBtn}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Lancer le chrono"
                        >
                          <TimerIcon color={theme.accent} size={16} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={S.noWodCard}>
              <Text style={S.noWodEmoji}>📋</Text>
              <Text style={S.noWodText}>Pas de WOD publié ce jour</Text>
            </View>
          )}

          {/* ── Programme WODs ─────────────────────── */}
          {programWods.length > 0 && programWods.reduce<{ title: string; wods: ProgWodEntry[] }[]>((acc, entry) => {
            const existing = acc.find(g => g.title === entry.programTitle);
            if (existing) existing.wods.push(entry);
            else acc.push({ title: entry.programTitle, wods: [entry] });
            return acc;
          }, []).map(group => (
            <View key={group.title} style={{ marginTop: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <BookOpen color={theme.accent} size={16} />
                <Text style={[S.sectionTitle, { marginBottom: 0 }]}>{group.title}</Text>
                {group.wods[0] && <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>{group.wods[0].dayLabel}</Text>}
              </View>
              <View style={S.dayGroup}>
                {group.wods.map(entry => {
                  const tc = TYPE_COLORS[entry.wod.wod_type ?? 'custom'] ?? '#6B7280';
                  return (
                    <View key={entry.wod.id} style={[S.wodCard, { borderLeftWidth: 3, borderLeftColor: theme.accent }]}>
                      <View style={S.wodCardTop}>
                        <WodTypeBadge type={entry.wod.wod_type} />
                        {entry.wod.time_cap_seconds != null && (
                          <View style={S.timeCap}>
                            <Clock color={theme.textMuted} size={12} />
                            <Text style={S.timeCapText}>Cap {Math.floor(entry.wod.time_cap_seconds / 60)} min</Text>
                          </View>
                        )}
                      </View>
                      <Text style={S.wodTitle}>{entry.wod.title}</Text>
                      {entry.wod.description ? <Text style={S.wodDesc} numberOfLines={3}>{entry.wod.description}</Text> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Launch Timer Modal */}
      <Modal
        visible={!!timerModalWod}
        transparent
        animationType="fade"
        onRequestClose={() => setTimerModalWod(null)}
      >
        <View style={S.timerModalBackdrop}>
          <View style={S.timerModalCard}>
            <View style={S.timerModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.timerModalTitle}>Lancer le chrono</Text>
                {timerModalWod && (
                  <Text style={S.timerModalSubtitle} numberOfLines={1}>{timerModalWod.title}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setTimerModalWod(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={theme.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            {timerModalWod && (
              <View style={S.timerModalPreview}>
                <TimerIcon color={theme.accent} size={18} />
                <Text style={S.timerModalPreviewText}>{formatWODPreconfig(timerModalWod)}</Text>
              </View>
            )}
            {renderEmomPicker()}

            <Text style={S.timerModalLabel}>Compte à rebours</Text>
            <View style={S.timerModalCountdownRow}>
              {[0, 3, 5, 10].map(v => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setTimerCountdown(v)}
                  style={[S.timerModalCdChip, timerCountdown === v && S.timerModalCdChipActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[S.timerModalCdChipText, timerCountdown === v && S.timerModalCdChipTextActive]}>
                    {v === 0 ? '—' : `${v}s`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={S.timerModalActions}>
              <TouchableOpacity
                onPress={() => timerModalWod && launchTimerFromWod(timerModalWod, false)}
                style={[S.timerModalBtn, S.timerModalBtnSecondary]}
                activeOpacity={0.85}
              >
                <CameraOff color={theme.text} size={18} />
                <Text style={S.timerModalBtnSecondaryText}>Sans caméra</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => timerModalWod && launchTimerFromWod(timerModalWod, true)}
                style={[S.timerModalBtn, S.timerModalBtnPrimary]}
                activeOpacity={0.85}
              >
                <Camera color="#fff" size={18} />
                <Text style={S.timerModalBtnPrimaryText}>Avec caméra</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Members Modal */}
      <Modal visible={membersModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMembersModal(false)}>
        <View style={S.membersContainer}>
          <View style={S.membersHeader}>
            <Text style={S.membersTitle}>Membres · {currentBox.name}</Text>
            <TouchableOpacity onPress={() => setMembersModal(false)} style={S.membersClose}>
              <X color={theme.textSecondary} size={22} />
            </TouchableOpacity>
          </View>
          {membersLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={m => m.id}
              contentContainerStyle={S.membersList}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={S.memberRow}
                  onPress={() => { setMembersModal(false); navigation.navigate('PublicProfile', { userId: item.id }); }}
                  activeOpacity={0.75}
                >
                  <Text style={S.memberRank}>{index + 1}</Text>
                  <UserAvatar uri={item.avatar_url} name={item.username} size={40} backgroundColor={theme.accentShadow} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.memberName}>{item.username}</Text>
                    <Text style={S.memberLevel}>{item.level?.toUpperCase()}</Text>
                  </View>
                  <Text style={S.memberElo}>{item.elo} ELO</Text>
                  <ChevronRight color={theme.textMuted} size={14} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={S.emptyText}>Aucun membre trouvé.</Text>}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  };
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card,
    borderBottomWidth: isDark ? 1 : 0, borderBottomColor: theme.border,
    ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  membersBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: isDark ? `${theme.accent}15` : `${theme.accent}08`,
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: `${theme.accent}25`,
  },
  membersBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  unreadDot: {
    position: 'absolute', top: -6, right: -8,
    backgroundColor: theme.error ?? '#EF4444', borderRadius: 9,
    minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 2, borderWidth: 1.5, borderColor: isDark ? theme.surface : theme.card,
  } as any,
  unreadDotTxt: { fontSize: 8, fontWeight: '900' as const, color: '#fff' },
  membersContainer: { flex: 1, backgroundColor: theme.background },
  membersHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  membersTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  membersClose: { padding: 4 },
  membersList: { padding: 16, gap: 10 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  memberRank: { width: 22, fontSize: 13, color: theme.textMuted, fontWeight: '700', textAlign: 'center' },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.accentShadow, justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  memberName: { fontSize: 14, fontWeight: '700', color: theme.text },
  memberLevel: { fontSize: 10, color: theme.textMuted, fontWeight: '600', marginTop: 1 },
  memberElo: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  section:      { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12, letterSpacing: -0.2 },
  dayGroup:     { gap: 10 },
  wodRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reorderCol:   { alignItems: 'center', justifyContent: 'center', gap: 2 },
  reorderBtn:   { padding: 4, borderRadius: 8, backgroundColor: `${theme.surface}` },
  wodCard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
    ...cardShadow,
  },
  wodCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  blockBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: `${theme.accent}12`, borderWidth: 1, borderColor: `${theme.accent}25`,
  },
  blockBadgeText: { fontSize: 10, fontWeight: '700', color: theme.accent },
  timeCap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeCapText: { fontSize: 11, color: theme.textMuted },
  wodTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  wodDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  wodCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  wodCardAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wodCardActionText: { fontSize: 12, fontWeight: '700', color: theme.accent },
  timerBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${theme.accent}18`,
    borderWidth: 1, borderColor: `${theme.accent}35`,
  },
  timerModalBackdrop: {
    flex: 1, backgroundColor: theme.modalBackdrop,
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  timerModalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: theme.modalCard, borderRadius: 20, padding: 20, gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  timerModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerModalTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  timerModalSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  timerModalPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${theme.accent}14`, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  timerModalPreviewText: { fontSize: 14, fontWeight: '700', color: theme.accent, letterSpacing: 0.3 },
  timerModalLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.6, marginTop: 8, marginBottom: 6 },
  emomStepRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8,
    borderWidth: 1, borderColor: theme.border, marginBottom: 4,
  },
  emomStepBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: theme.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.border,
  },
  emomStepBtnText: { fontSize: 18, fontWeight: '900', color: theme.text },
  emomStepValue: { fontSize: 22, fontWeight: '900', color: theme.text },
  emomStepUnit: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  emomTotalHint: { fontSize: 11, fontWeight: '600', color: theme.textMuted, textAlign: 'center', marginTop: 6 },
  timerModalCountdownRow: { flexDirection: 'row', gap: 8 },
  timerModalCdChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    alignItems: 'center',
  },
  timerModalCdChipActive: { backgroundColor: `${theme.accent}22`, borderColor: theme.accent },
  timerModalCdChipText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  timerModalCdChipTextActive: { color: theme.accent },
  timerModalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  timerModalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
  },
  timerModalBtnSecondary: {
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  timerModalBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: theme.text },
  timerModalBtnPrimary: { backgroundColor: theme.accent },
  timerModalBtnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  checkboxRow: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 2, paddingHorizontal: 2,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: theme.border,
    backgroundColor: 'transparent',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.accent, borderColor: theme.accent,
  },
  checkboxLabel: { fontSize: 11, fontWeight: '700', color: theme.accent, letterSpacing: 0.3 },
  noWodCard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 32,
    borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10,
    ...cardShadow,
  },
  noWodEmoji: { fontSize: 36 },
  noWodText:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  historyGroup: { marginBottom: 16 },
  historyGroupDate: {
    fontSize: 13, fontWeight: '700', color: theme.textSecondary,
    marginBottom: 8, textTransform: 'capitalize',
  },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: theme.border, marginBottom: 6, gap: 8,
    ...cardShadow,
  },
  historyTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  historyBlock: { fontSize: 10, fontWeight: '700', color: theme.accent },
  historyTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: theme.textMuted, textAlign: 'center' },
  topCtaRow: {
    flexDirection: 'row', gap: 10, justifyContent: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  topJoinBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: theme.accent,
  },
  topJoinBtnText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  topImportBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: theme.card,
    borderWidth: 1, borderColor: theme.border,
  },
  topImportBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  createWodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.accent,
    backgroundColor: 'rgba(74,222,128,0.08)',
    marginTop: 6,
  },
  createWodBtnText: { fontSize: 14, fontWeight: '800', color: theme.accent, letterSpacing: 0.3 },
  createWodPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: 14, backgroundColor: theme.accent,
    marginTop: 14,
  },
  createWodPrimaryText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  noBoxCard: {
    width: '100%', backgroundColor: isDark ? theme.card : theme.card, borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: theme.border, gap: 12,
    ...cardShadow,
  },
  noBoxTitle: { fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 1 },
  noBoxSub: { fontSize: 15, color: theme.textSecondary },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20, marginTop: 4,
  },
  joinBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.modalBackdrop },
  joinSheet: {
    backgroundColor: theme.modalCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  joinHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: theme.border, alignSelf: 'center', marginBottom: 8,
  },
  joinSheetTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  joinSheetSub: { fontSize: 13, color: theme.textMuted },
  codeInput: {
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1,
    borderColor: theme.border, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '700', color: theme.text,
    letterSpacing: 6, textAlign: 'center',
  },
  quickActions: {
    paddingHorizontal: 16, gap: 10, marginTop: 12,
  },
  scoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#10B981', borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  scoreBtnText: {
    color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5,
  },
  rankBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: isDark ? `${theme.accent}15` : `${theme.accent}08`,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  rankBtnText: {
    fontSize: 14, fontWeight: '700', color: theme.accent,
  },
}); }
