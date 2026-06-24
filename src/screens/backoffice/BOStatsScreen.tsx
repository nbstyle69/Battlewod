import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { BarChart3, TrendingUp, Users, Flame, AlertTriangle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface WeeklyParticipation { week: string; count: number }
interface TopAthlete { username: string; score_count: number; user_id: string }
interface PopularWOD { title: string; count: number; wod_type: string }
interface InactiveMember { username: string; last_active: string | null; user_id: string }

export default function BOStatsScreen() {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const S = styles(theme);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [memberCount, setMemberCount] = useState(0);
  const [weeklyData, setWeeklyData] = useState<WeeklyParticipation[]>([]);
  const [retentionRate, setRetentionRate] = useState(0);
  const [topAthletes, setTopAthletes] = useState<TopAthlete[]>([]);
  const [popularWODs, setPopularWODs] = useState<PopularWOD[]>([]);
  const [inactiveMembers, setInactiveMembers] = useState<InactiveMember[]>([]);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const boxId = currentBox.id;
    const now = new Date();

    // ── Members count ──
    const { count: mc } = await supabase
      .from('box_members').select('*', { count: 'exact', head: true })
      .eq('box_id', boxId).eq('status', 'active');
    setMemberCount(mc ?? 0);

    // ── Weekly participation (last 8 weeks) ──
    const weeks: WeeklyParticipation[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(now);
      start.setDate(start.getDate() - (w * 7 + start.getDay()));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const label = `S${8 - w}`;

      const { count } = await supabase
        .from('wod_scores').select('*', { count: 'exact', head: true })
        .eq('box_id', boxId)
        .gte('submitted_at', start.toISOString())
        .lt('submitted_at', end.toISOString());
      weeks.push({ week: label, count: count ?? 0 });
    }
    setWeeklyData(weeks);

    // ── Retention: members who submitted a score in the last 30 days / total members ──
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: activeScorers } = await supabase
      .from('wod_scores')
      .select('athlete_id')
      .eq('box_id', boxId)
      .gte('submitted_at', thirtyDaysAgo.toISOString());
    const uniqueActive = new Set((activeScorers ?? []).map((s: any) => s.athlete_id));
    setRetentionRate(mc && mc > 0 ? Math.round((uniqueActive.size / mc) * 100) : 0);

    // ── Top 5 athletes this month ──
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data: topScores } = await supabase
      .from('wod_scores')
      .select('athlete_id, profiles(username)')
      .eq('box_id', boxId)
      .gte('submitted_at', monthStart.toISOString());

    const athleteMap = new Map<string, { username: string; count: number }>();
    (topScores ?? []).forEach((s: any) => {
      const existing = athleteMap.get(s.athlete_id);
      if (existing) { existing.count++; }
      else { athleteMap.set(s.athlete_id, { username: s.profiles?.username ?? '?', count: 1 }); }
    });
    const sortedAthletes = Array.from(athleteMap.entries())
      .map(([uid, d]) => ({ user_id: uid, username: d.username, score_count: d.count }))
      .sort((a, b) => b.score_count - a.score_count)
      .slice(0, 5);
    setTopAthletes(sortedAthletes);

    // ── Popular WODs (most scores, last 30 days) ──
    const { data: wodScores } = await supabase
      .from('wod_scores')
      .select('wod_id, box_wods(title, wod_type)')
      .eq('box_id', boxId)
      .gte('submitted_at', thirtyDaysAgo.toISOString());

    const wodMap = new Map<string, { title: string; wod_type: string; count: number }>();
    (wodScores ?? []).forEach((s: any) => {
      const key = s.wod_id;
      const existing = wodMap.get(key);
      if (existing) { existing.count++; }
      else { wodMap.set(key, { title: s.box_wods?.title ?? '?', wod_type: s.box_wods?.wod_type ?? 'WOD', count: 1 }); }
    });
    const sortedWODs = Array.from(wodMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setPopularWODs(sortedWODs);

    // ── Inactive members (no score in 14+ days) ──
    const { data: members } = await supabase
      .from('box_members')
      .select('member_id, profiles(username)')
      .eq('box_id', boxId).eq('status', 'active');

    const inactive: InactiveMember[] = [];
    for (const m of (members ?? [])) {
      const { data: lastScore } = await supabase
        .from('wod_scores')
        .select('submitted_at')
        .eq('athlete_id', (m as any).member_id)
        .eq('box_id', boxId)
        .order('submitted_at', { ascending: false })
        .limit(1);

      const lastDate = lastScore?.[0]?.submitted_at ?? null;
      const daysSince = lastDate ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000) : 999;
      if (daysSince >= 14) {
        inactive.push({
          user_id: (m as any).member_id,
          username: (m as any).profiles?.username ?? '?',
          last_active: lastDate,
        });
      }
    }
    setInactiveMembers(inactive.slice(0, 10));

    } catch (e) { captureError(e, { screen: 'BOStats', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

  const maxWeekly = Math.max(...weeklyData.map(w => w.count), 1);
  const screenW = Dimensions.get('window').width;

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <BarChart3 color={theme.accent} size={22} />
        <Text style={S.headerTitle}>Statistiques</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* KPI row */}
        <View style={S.kpiRow}>
          <View style={S.kpiCard}>
            <Users color={theme.accent} size={18} />
            <Text style={S.kpiValue}>{memberCount}</Text>
            <Text style={S.kpiLabel}>Membres</Text>
          </View>
          <View style={S.kpiCard}>
            <TrendingUp color={retentionRate >= 50 ? theme.success : theme.warning} size={18} />
            <Text style={[S.kpiValue, { color: retentionRate >= 50 ? theme.success : theme.warning }]}>
              {retentionRate}%
            </Text>
            <Text style={S.kpiLabel}>Rétention 30j</Text>
          </View>
          <View style={S.kpiCard}>
            <Flame color={theme.accent} size={18} />
            <Text style={S.kpiValue}>{weeklyData[weeklyData.length - 1]?.count ?? 0}</Text>
            <Text style={S.kpiLabel}>Scores/sem</Text>
          </View>
        </View>

        {/* Weekly participation chart */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Participation / semaine</Text>
          <View style={S.chartCard}>
            <View style={S.chartBars}>
              {weeklyData.map((w, i) => (
                <View key={i} style={S.barCol}>
                  <View style={S.barWrapper}>
                    <View style={[S.bar, {
                      height: `${Math.max((w.count / maxWeekly) * 100, 4)}%`,
                      backgroundColor: i === weeklyData.length - 1 ? theme.accent : `${theme.accent}60`,
                    }]} />
                  </View>
                  <Text style={S.barLabel}>{w.week}</Text>
                  <Text style={S.barValue}>{w.count}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Top athletes */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Top 5 athlètes du mois</Text>
          <View style={S.listCard}>
            {topAthletes.length === 0 ? (
              <Text style={S.emptyText}>Aucun score ce mois-ci</Text>
            ) : topAthletes.map((a, i) => (
              <View key={a.user_id} style={[S.listRow, i < topAthletes.length - 1 && S.listRowBorder]}>
                <View style={[S.rank, i === 0 && { backgroundColor: `${theme.gold}20` }]}>
                  <Text style={[S.rankText, i === 0 && { color: theme.gold }]}>{i + 1}</Text>
                </View>
                <Text style={S.listName} numberOfLines={1}>{a.username}</Text>
                <Text style={S.listValue}>{a.score_count} scores</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Popular WODs */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>WODs les plus populaires</Text>
          <View style={S.listCard}>
            {popularWODs.length === 0 ? (
              <Text style={S.emptyText}>Aucun WOD cette période</Text>
            ) : popularWODs.map((w, i) => (
              <View key={i} style={[S.listRow, i < popularWODs.length - 1 && S.listRowBorder]}>
                <View style={S.wodPill}>
                  <Text style={S.wodPillText}>{w.wod_type.toUpperCase()}</Text>
                </View>
                <Text style={S.listName} numberOfLines={1}>{w.title}</Text>
                <Text style={S.listValue}>{w.count} scores</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Inactive members alert */}
        <View style={S.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle color={theme.warning} size={18} />
            <Text style={S.sectionTitle}>Membres inactifs (+14j)</Text>
          </View>
          <View style={S.listCard}>
            {inactiveMembers.length === 0 ? (
              <Text style={[S.emptyText, { color: theme.success }]}>Tous les membres sont actifs 🎉</Text>
            ) : inactiveMembers.map((m, i) => {
              const days = m.last_active
                ? Math.floor((Date.now() - new Date(m.last_active).getTime()) / 86400000)
                : null;
              return (
                <View key={m.user_id} style={[S.listRow, i < inactiveMembers.length - 1 && S.listRowBorder]}>
                  <View style={[S.rank, { backgroundColor: `${theme.warning}15` }]}>
                    <AlertTriangle color={theme.warning} size={12} />
                  </View>
                  <Text style={S.listName} numberOfLines={1}>{m.username}</Text>
                  <Text style={[S.listValue, { color: theme.warning }]}>
                    {days !== null ? `${days}j` : 'Jamais actif'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
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
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: theme.text, marginBottom: 10 },
  chartCard: {
    backgroundColor: theme.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barWrapper: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, fontWeight: '700', color: theme.textMuted },
  barValue: { fontSize: 9, fontWeight: '800', color: theme.textSecondary },
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
  listName: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.text },
  listValue: { fontSize: 12, fontWeight: '800', color: theme.accent },
  wodPill: {
    backgroundColor: theme.surface, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  wodPillText: { fontSize: 9, fontWeight: '800', color: theme.textSecondary, letterSpacing: 0.5 },
  emptyText: { padding: 16, textAlign: 'center', fontSize: 13, color: theme.textMuted },
}); }
