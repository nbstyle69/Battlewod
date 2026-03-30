import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Award, Flame, Users, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface MemberBadge {
  user_id: string;
  username: string;
  badge_count: number;
}

interface MemberStreak {
  user_id: string;
  username: string;
  current_streak: number;
  longest_streak: number;
  sessions_this_week: number;
}

interface BadgeSummary {
  badge_key: string;
  title: string;
  icon: string;
  earned_count: number;
}

interface MemberMovementStat {
  user_id: string;
  username: string;
  total_reps: number;
  movement_count: number;
}

export default function BOGamificationScreen() {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const S = styles(theme);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'badges' | 'streaks' | 'movements'>('badges');

  const [memberBadges, setMemberBadges] = useState<MemberBadge[]>([]);
  const [badgeSummary, setBadgeSummary] = useState<BadgeSummary[]>([]);
  const [memberStreaks, setMemberStreaks] = useState<MemberStreak[]>([]);
  const [memberMovements, setMemberMovements] = useState<MemberMovementStat[]>([]);
  const [totalBadgesEarned, setTotalBadgesEarned] = useState(0);
  const [avgStreak, setAvgStreak] = useState(0);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const boxId = currentBox.id;

    // Get box member user_ids
    const { data: members } = await supabase
      .from('box_members')
      .select('member_id, profiles(username)')
      .eq('box_id', boxId).eq('status', 'active');

    const memberIds = (members ?? []).map((m: any) => m.member_id);
    const nameMap = new Map<string, string>();
    (members ?? []).forEach((m: any) => nameMap.set(m.member_id, m.profiles?.username ?? '?'));

    if (memberIds.length === 0) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // ── Badges ──
    const { data: earned } = await supabase
      .from('athlete_badges')
      .select('user_id, badge_key')
      .in('user_id', memberIds);

    // Count per member
    const badgeCountMap = new Map<string, number>();
    (earned ?? []).forEach((e: any) => {
      badgeCountMap.set(e.user_id, (badgeCountMap.get(e.user_id) ?? 0) + 1);
    });
    const mbList: MemberBadge[] = memberIds.map(uid => ({
      user_id: uid,
      username: nameMap.get(uid) ?? '?',
      badge_count: badgeCountMap.get(uid) ?? 0,
    })).sort((a, b) => b.badge_count - a.badge_count);
    setMemberBadges(mbList);
    setTotalBadgesEarned(earned?.length ?? 0);

    // Count per badge
    const { data: catalog } = await supabase
      .from('badges_catalog')
      .select('badge_key, title, icon')
      .order('sort_order');

    const badgeEarnedMap = new Map<string, number>();
    (earned ?? []).forEach((e: any) => {
      badgeEarnedMap.set(e.badge_key, (badgeEarnedMap.get(e.badge_key) ?? 0) + 1);
    });
    const bSummary: BadgeSummary[] = (catalog ?? []).map((c: any) => ({
      badge_key: c.badge_key,
      title: c.title,
      icon: c.icon,
      earned_count: badgeEarnedMap.get(c.badge_key) ?? 0,
    })).filter(b => b.earned_count > 0)
      .sort((a, b) => b.earned_count - a.earned_count);
    setBadgeSummary(bSummary);

    // ── Streaks ──
    const { data: streaks } = await supabase
      .from('athlete_streaks')
      .select('athlete_id, current_streak, longest_streak, week_session_count')
      .in('athlete_id', memberIds);

    const msList: MemberStreak[] = memberIds.map(uid => {
      const s = (streaks ?? []).find((st: any) => st.athlete_id === uid);
      return {
        user_id: uid,
        username: nameMap.get(uid) ?? '?',
        current_streak: s?.current_streak ?? 0,
        longest_streak: s?.longest_streak ?? 0,
        sessions_this_week: s?.week_session_count ?? 0,
      };
    }).sort((a, b) => b.current_streak - a.current_streak);
    setMemberStreaks(msList);

    const activeStreaks = msList.filter(m => m.current_streak > 0);
    setAvgStreak(activeStreaks.length > 0
      ? Math.round(activeStreaks.reduce((s, m) => s + m.current_streak, 0) / activeStreaks.length * 10) / 10
      : 0);

    // ── Movements ──
    const { data: mvStats } = await supabase
      .from('user_movement_stats')
      .select('user_id, total_reps, movement')
      .in('user_id', memberIds);

    const mvMap = new Map<string, { total_reps: number; movements: Set<string> }>();
    (mvStats ?? []).forEach((s: any) => {
      const e = mvMap.get(s.user_id);
      if (e) { e.total_reps += Number(s.total_reps); e.movements.add(s.movement); }
      else { mvMap.set(s.user_id, { total_reps: Number(s.total_reps), movements: new Set([s.movement]) }); }
    });
    const mmList: MemberMovementStat[] = memberIds.map(uid => ({
      user_id: uid,
      username: nameMap.get(uid) ?? '?',
      total_reps: mvMap.get(uid)?.total_reps ?? 0,
      movement_count: mvMap.get(uid)?.movements.size ?? 0,
    })).sort((a, b) => b.total_reps - a.total_reps);
    setMemberMovements(mmList);

    } catch (e) { captureError(e, { screen: 'BOGamification', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const tabs: { key: typeof tab; label: string; icon: any }[] = [
    { key: 'badges', label: 'Badges', icon: Award },
    { key: 'streaks', label: 'Streaks', icon: Flame },
    { key: 'movements', label: 'Mouvements', icon: TrendingUp },
  ];

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Award color={theme.accent} size={22} />
        <Text style={S.headerTitle}>Gamification</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* KPI */}
        <View style={S.kpiRow}>
          <View style={S.kpiCard}>
            <Award color={theme.accent} size={18} />
            <Text style={S.kpiValue}>{totalBadgesEarned}</Text>
            <Text style={S.kpiLabel}>Badges gagnés</Text>
          </View>
          <View style={S.kpiCard}>
            <Flame color={theme.warning} size={18} />
            <Text style={[S.kpiValue, { color: theme.warning }]}>{avgStreak}</Text>
            <Text style={S.kpiLabel}>Streak moyen</Text>
          </View>
          <View style={S.kpiCard}>
            <Users color={theme.accent} size={18} />
            <Text style={S.kpiValue}>
              {memberStreaks.filter(m => m.sessions_this_week >= 3).length}
            </Text>
            <Text style={S.kpiLabel}>Actifs /sem</Text>
          </View>
        </View>

        {/* Tab selector */}
        <View style={S.tabRow}>
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[S.tabBtn, active && S.tabBtnActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.8}
              >
                <Icon color={active ? theme.card : theme.textMuted} size={14} />
                <Text style={[S.tabBtnText, active && S.tabBtnTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TAB: Badges */}
        {tab === 'badges' && (
          <View style={S.section}>
            {/* Badge popularity */}
            {badgeSummary.length > 0 && (
              <>
                <Text style={S.subTitle}>Badges les plus gagnés</Text>
                <View style={S.listCard}>
                  {badgeSummary.slice(0, 8).map((b, i) => (
                    <View key={b.badge_key} style={[S.listRow, i < Math.min(badgeSummary.length, 8) - 1 && S.listRowBorder]}>
                      <Text style={S.badgeIcon}>{b.icon}</Text>
                      <Text style={S.listName} numberOfLines={1}>{b.title}</Text>
                      <Text style={S.listValue}>{b.earned_count} ×</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Member badges ranking */}
            <Text style={[S.subTitle, { marginTop: 20 }]}>Classement membres</Text>
            <View style={S.listCard}>
              {memberBadges.length === 0 ? (
                <Text style={S.emptyText}>Aucun membre</Text>
              ) : memberBadges.map((m, i) => (
                <View key={m.user_id} style={[S.listRow, i < memberBadges.length - 1 && S.listRowBorder]}>
                  <View style={[S.rank, i === 0 && { backgroundColor: `${theme.gold}20` }]}>
                    <Text style={[S.rankText, i === 0 && { color: theme.gold }]}>{i + 1}</Text>
                  </View>
                  <Text style={S.listName} numberOfLines={1}>{m.username}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Award color={theme.accent} size={12} />
                    <Text style={S.listValue}>{m.badge_count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* TAB: Streaks */}
        {tab === 'streaks' && (
          <View style={S.section}>
            <View style={S.listCard}>
              {memberStreaks.length === 0 ? (
                <Text style={S.emptyText}>Aucun membre</Text>
              ) : memberStreaks.map((m, i) => {
                const isInactive = m.current_streak === 0 && m.sessions_this_week === 0;
                return (
                  <View key={m.user_id} style={[S.listRow, i < memberStreaks.length - 1 && S.listRowBorder]}>
                    <View style={[S.rank, {
                      backgroundColor: isInactive ? `${theme.warning}15` : m.current_streak >= 4 ? `${theme.success}15` : theme.surface,
                    }]}>
                      {isInactive
                        ? <AlertTriangle color={theme.warning} size={12} />
                        : <Flame color={m.current_streak >= 4 ? theme.success : theme.textMuted} size={12} />
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.listName} numberOfLines={1}>{m.username}</Text>
                      <Text style={S.listSub}>
                        {m.sessions_this_week} sessions cette sem. · Record: {m.longest_streak} sem.
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[S.streakValue, {
                        color: m.current_streak >= 4 ? theme.success : m.current_streak > 0 ? theme.text : theme.warning,
                      }]}>
                        {m.current_streak} sem.
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB: Movements */}
        {tab === 'movements' && (
          <View style={S.section}>
            <View style={S.listCard}>
              {memberMovements.length === 0 ? (
                <Text style={S.emptyText}>Aucun mouvement tracké</Text>
              ) : memberMovements.map((m, i) => (
                <View key={m.user_id} style={[S.listRow, i < memberMovements.length - 1 && S.listRowBorder]}>
                  <View style={[S.rank, i === 0 && { backgroundColor: `${theme.gold}20` }]}>
                    <Text style={[S.rankText, i === 0 && { color: theme.gold }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.listName} numberOfLines={1}>{m.username}</Text>
                    <Text style={S.listSub}>{m.movement_count} mouvements différents</Text>
                  </View>
                  <Text style={S.listValue}>{m.total_reps.toLocaleString()} reps</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function styles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
  kpiRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 16 },
  kpiCard: {
    flex: 1, backgroundColor: theme.card, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.border,
  },
  kpiValue: { fontSize: 22, fontWeight: '900', color: theme.text },
  kpiLabel: { fontSize: 10, color: theme.textMuted, fontWeight: '600', textAlign: 'center' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 16 },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: theme.surface,
    borderWidth: 1, borderColor: theme.border,
  },
  tabBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  tabBtnTextActive: { color: theme.card },
  section: { paddingHorizontal: 16, marginTop: 16 },
  subTitle: { fontSize: 13, fontWeight: '800', color: theme.textSecondary, marginBottom: 8 },
  listCard: {
    backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border,
    overflow: 'hidden',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.border },
  rank: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: theme.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '900', color: theme.textSecondary },
  badgeIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  listName: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.text },
  listSub: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  listValue: { fontSize: 13, fontWeight: '800', color: theme.accent },
  streakValue: { fontSize: 15, fontWeight: '900' },
  emptyText: { padding: 16, textAlign: 'center', fontSize: 13, color: theme.textMuted },
}); }
