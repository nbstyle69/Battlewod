import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Trophy, Dumbbell, Zap, ChevronRight } from 'lucide-react-native';
import { HomeStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { log } from '../../lib/logger';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface EloEntry {
  id: string;
  type: 'wod' | 'tournament' | 'daily';
  refId: string;
  label: string;
  delta: number;
  eloBefore: number;
  eloAfter: number;
  rank: number;
  date: string;
}

type Nav = NativeStackNavigationProp<HomeStackParamList>;

export default function EloHistoryScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const isDark = mode === 'dark';
  const S = createStyles(theme, isDark);

  const [entries, setEntries] = useState<EloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | '365d' | 'all'>('all');

  const load = useCallback(async () => {
    if (!user) return;
    try {
    const results: EloEntry[] = [];

    // 0. Trigger server-side batch ELO compute (idempotent).
    //    All logic lives in the `compute-elo-batch` Edge Function; the daily
    //    pg_cron job covers most cases, this on-demand call ensures freshness
    //    when the user just finished a WOD.
    try {
      const { error: fnErr } = await supabase.functions.invoke('compute-elo-batch', {
        body: {},
      });
      if (fnErr) log.warn('[EloHistory] compute-elo-batch invoke error:', fnErr.message);
    } catch (e) {
      log.warn('[EloHistory] compute-elo-batch threw:', e);
    }

    // 1. WOD elo_history
    const { data: wodHistory, error: wodErr } = await supabase
      .from('elo_history')
      .select('id, wod_id, elo_before, elo_after, elo_delta, rank, created_at, box_wods(title, wod_type)')
      .eq('member_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    log.debug('[EloHistory] wodHistory count=', wodHistory?.length ?? 0, 'error=', wodErr?.message);

    for (const h of wodHistory ?? []) {
      const wod = Array.isArray(h.box_wods) ? h.box_wods[0] : h.box_wods;
      results.push({
        id: h.id,
        type: 'wod',
        refId: h.wod_id,
        label: wod?.title ?? 'WOD',
        delta: h.elo_delta,
        eloBefore: h.elo_before,
        eloAfter: h.elo_after,
        rank: h.rank,
        date: h.created_at ?? '',
      });
    }

    // 2. Tournament elo_history
    const { data: tournHistory, error: tournErr } = await supabase
      .from('tournament_elo_history')
      .select('id, tournament_id, elo_before, elo_after, elo_change, final_rank, calculated_at, tournaments(name)')
      .eq('athlete_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(100);

    log.debug('[EloHistory] tournHistory count=', tournHistory?.length ?? 0, 'error=', tournErr?.message);

    for (const h of tournHistory ?? []) {
      const tourn = Array.isArray(h.tournaments) ? h.tournaments[0] : h.tournaments;
      results.push({
        id: h.id,
        type: 'tournament',
        refId: h.tournament_id,
        label: tourn?.name ?? 'Tournoi',
        delta: h.elo_change,
        eloBefore: h.elo_before,
        eloAfter: h.elo_after,
        rank: h.final_rank,
        date: h.calculated_at,
      });
    }

    // 3. Daily tournament elo_history
    const { data: dailyHistory } = await supabase
      .from('daily_tournament_elo_history')
      .select('id, tournament_id, elo_before, elo_after, elo_delta, final_rank, calculated_at, daily_tournaments(wod_name)')
      .eq('user_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(100);

    for (const h of dailyHistory ?? []) {
      const dt = Array.isArray(h.daily_tournaments) ? h.daily_tournaments[0] : h.daily_tournaments;
      results.push({
        id: h.id,
        type: 'daily',
        refId: h.tournament_id,
        label: dt?.wod_name ?? 'Mini-Tournoi',
        delta: h.elo_delta,
        eloBefore: h.elo_before,
        eloAfter: h.elo_after,
        rank: h.final_rank,
        date: h.calculated_at,
      });
    }

    // Sort by date descending
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEntries(results);
    } catch (e) { captureError(e, { screen: 'EloHistory', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const currentElo = user?.elo ?? 1000;

  const filtered = React.useMemo(() => {
    if (period === 'all') return entries;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return entries.filter(e => new Date(e.date) >= cutoff);
  }, [entries, period]);

  const totalGain = filtered.reduce((sum, e) => sum + (e.delta > 0 ? e.delta : 0), 0);
  const totalLoss = filtered.reduce((sum, e) => sum + (e.delta < 0 ? e.delta : 0), 0);

  function formatDate(iso: string) {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} à ${hours}:${mins}`;
  }

  function rankLabel(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={S.backBtn}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Historique ELO</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={S.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {/* Current ELO card */}
        <View style={S.eloCard}>
          <Text style={S.eloCardValue}>{currentElo}</Text>
          <Text style={S.eloCardLabel}>ELO ACTUEL</Text>
          <View style={S.eloCardStats}>
            <View style={S.eloCardStat}>
              <TrendingUp color="#22c55e" size={16} />
              <Text style={[S.eloCardStatText, { color: '#22c55e' }]}>+{totalGain}</Text>
            </View>
            <View style={S.eloCardStat}>
              <TrendingDown color="#ef4444" size={16} />
              <Text style={[S.eloCardStatText, { color: '#ef4444' }]}>{totalLoss}</Text>
            </View>
          </View>
        </View>

        {/* Period filter */}
        {!loading && entries.length > 0 && (
          <View style={S.filterRow}>
            {(['7d', '30d', '365d', 'all'] as const).map(p => (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                style={[S.filterPill, period === p && { backgroundColor: theme.accent }]}
              >
                <Text style={[S.filterPillText, period === p && { color: '#fff' }]}>
                  {p === '7d' ? '7j' : p === '30d' ? '30j' : p === '365d' ? '1an' : 'Tout'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ELO Chart */}
        {!loading && filtered.length >= 2 && (
          <EloChart entries={filtered} currentElo={currentElo} theme={theme} isDark={isDark} />
        )}

        {/* History list */}
        {loading ? (
          <ActivityIndicator color={theme.accent} size="large" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={S.emptyState}>
            <Trophy color={theme.textMuted} size={40} />
            <Text style={S.emptyText}>Aucun historique ELO</Text>
            <Text style={S.emptySubtext}>Participe à des WODs ou tournois pour voir ton historique ici.</Text>
          </View>
        ) : (
          <View style={S.list}>
            <Text style={S.sectionTitle}>HISTORIQUE ({filtered.length})</Text>
            {filtered.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={S.row}
                activeOpacity={0.7}
                onPress={() => {
                  if (entry.type === 'wod' && entry.refId) {
                    nav.navigate('WODDetail', { wodId: entry.refId, scrollToLeaderboard: true });
                  }
                }}
              >
                <View style={[S.rowIcon, { backgroundColor: entry.type === 'tournament' ? '#8b5cf620' : entry.type === 'daily' ? '#ef444420' : `${theme.accent}20` }]}>
                  {entry.type === 'tournament'
                    ? <Trophy color="#8b5cf6" size={18} />
                    : entry.type === 'daily'
                    ? <Zap color="#ef4444" size={18} />
                    : <Dumbbell color={theme.accent} size={18} />
                  }
                </View>
                <View style={S.rowBody}>
                  <Text style={S.rowLabel} numberOfLines={1}>{entry.label}</Text>
                  <View style={S.rowMeta}>
                    <Text style={S.rowDate}>{formatDate(entry.date)}</Text>
                    <Text style={S.rowRank}>{rankLabel(entry.rank)}</Text>
                  </View>
                </View>
                <View style={S.rowRight}>
                  <Text style={[
                    S.rowDelta,
                    { color: entry.delta > 0 ? '#22c55e' : entry.delta < 0 ? '#ef4444' : theme.textMuted },
                  ]}>
                    {entry.delta > 0 ? '+' : ''}{entry.delta}
                  </Text>
                  <Text style={S.rowEloAfter}>{entry.eloAfter}</Text>
                </View>
                {entry.type === 'wod' && (
                  <ChevronRight color={theme.textMuted} size={16} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── ELO Progression Chart ────────────────────────────────────────────
const CHART_WIDTH = Dimensions.get('window').width - 32;
const CHART_HEIGHT = 180;
const PADDING = { top: 20, right: 16, bottom: 28, left: 44 };

function EloChart({ entries, currentElo, theme, isDark }: {
  entries: EloEntry[]; currentElo: number; theme: AppTheme; isDark: boolean;
}) {
  // Build chronological data points (oldest → newest, then current)
  const sorted = [...entries].reverse();
  const points: { elo: number; label: string }[] = [];

  // Start with elo_before of the oldest entry
  if (sorted.length > 0) {
    const oldest = sorted[0];
    const d = new Date(oldest.date);
    points.push({ elo: oldest.eloBefore, label: `${d.getDate()}/${d.getMonth() + 1}` });
  }

  for (const e of sorted) {
    const d = new Date(e.date);
    points.push({ elo: e.eloAfter, label: `${d.getDate()}/${d.getMonth() + 1}` });
  }

  if (points.length < 2) return null;

  const elos = points.map(p => p.elo);
  const minElo = Math.min(...elos);
  const maxElo = Math.max(...elos);
  const eloRange = maxElo - minElo || 50;
  const padded = { min: minElo - eloRange * 0.1, max: maxElo + eloRange * 0.1 };

  const w = CHART_WIDTH - PADDING.left - PADDING.right;
  const h = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const x = (i: number) => PADDING.left + (i / (points.length - 1)) * w;
  const y = (elo: number) => PADDING.top + h - ((elo - padded.min) / (padded.max - padded.min)) * h;

  // Build smooth path
  const linePoints = points.map((p, i) => ({ cx: x(i), cy: y(p.elo) }));
  let linePath = `M ${linePoints[0].cx} ${linePoints[0].cy}`;
  for (let i = 1; i < linePoints.length; i++) {
    const prev = linePoints[i - 1];
    const curr = linePoints[i];
    const cpx = (prev.cx + curr.cx) / 2;
    linePath += ` C ${cpx} ${prev.cy}, ${cpx} ${curr.cy}, ${curr.cx} ${curr.cy}`;
  }

  // Fill path (close at bottom)
  const fillPath = linePath +
    ` L ${linePoints[linePoints.length - 1].cx} ${PADDING.top + h}` +
    ` L ${linePoints[0].cx} ${PADDING.top + h} Z`;

  // Y-axis labels (3-4 ticks)
  const tickCount = 4;
  const yTicks: number[] = [];
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push(Math.round(padded.min + (i / tickCount) * (padded.max - padded.min)));
  }

  // X-axis labels — show first, middle, last
  const xLabels: { i: number; label: string }[] = [];
  if (points.length <= 5) {
    points.forEach((p, i) => xLabels.push({ i, label: p.label }));
  } else {
    xLabels.push({ i: 0, label: points[0].label });
    const mid = Math.floor(points.length / 2);
    xLabels.push({ i: mid, label: points[mid].label });
    xLabels.push({ i: points.length - 1, label: points[points.length - 1].label });
  }

  // Color: green if trending up, red if down
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const trending = lastPoint.elo >= firstPoint.elo;
  const accentColor = trending ? '#22c55e' : '#ef4444';

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 16, borderRadius: 20,
      backgroundColor: isDark ? theme.card : '#f8f8f8',
      borderWidth: 1, borderColor: theme.border, padding: 12,
    }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>
        PROGRESSION ELO
      </Text>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={accentColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <Line
            key={`grid-${i}`}
            x1={PADDING.left} y1={y(tick)}
            x2={PADDING.left + w} y2={y(tick)}
            stroke={isDark ? '#ffffff10' : '#00000010'}
            strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <SvgText
            key={`ytick-${i}`}
            x={PADDING.left - 6}
            y={y(tick) + 4}
            fontSize={10}
            fontWeight="600"
            fill={theme.textMuted}
            textAnchor="end"
          >
            {tick}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => (
          <SvgText
            key={`xtick-${i}`}
            x={x(i)}
            y={PADDING.top + h + 18}
            fontSize={10}
            fontWeight="500"
            fill={theme.textMuted}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}

        {/* Gradient fill */}
        <Path d={fillPath} fill="url(#chartGrad)" />

        {/* Line */}
        <Path d={linePath} stroke={accentColor} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {linePoints.map((pt, i) => (
          <Circle
            key={`dot-${i}`}
            cx={pt.cx}
            cy={pt.cy}
            r={i === linePoints.length - 1 ? 5 : 3}
            fill={i === linePoints.length - 1 ? accentColor : isDark ? theme.card : '#fff'}
            stroke={accentColor}
            strokeWidth={2}
          />
        ))}

        {/* Current ELO label on last point */}
        <SvgText
          x={linePoints[linePoints.length - 1].cx}
          y={linePoints[linePoints.length - 1].cy - 10}
          fontSize={12}
          fontWeight="800"
          fill={accentColor}
          textAnchor="middle"
        >
          {currentElo}
        </SvgText>
      </Svg>
    </View>
  );
}

function createStyles(theme: AppTheme, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
      backgroundColor: isDark ? theme.card : theme.background,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
    scroll: { paddingBottom: 40 },

    // ELO Card
    eloCard: {
      margin: 16, padding: 24, borderRadius: 20,
      backgroundColor: isDark ? theme.card : '#f8f8f8',
      borderWidth: 1, borderColor: theme.border,
      alignItems: 'center',
    },
    eloCardValue: { fontSize: 56, fontWeight: '900', color: theme.accent },
    eloCardLabel: { fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 2, marginTop: 4 },
    eloCardStats: { flexDirection: 'row', gap: 24, marginTop: 16 },
    eloCardStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eloCardStatText: { fontSize: 15, fontWeight: '700' },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyText: { fontSize: 16, fontWeight: '700', color: theme.text, marginTop: 16 },
    emptySubtext: { fontSize: 13, color: theme.textMuted, textAlign: 'center', marginTop: 8 },

    // Filter pills
    filterRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12,
    },
    filterPill: {
      flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center',
      backgroundColor: isDark ? theme.card : '#f0f0f0',
      borderWidth: 1, borderColor: theme.border,
    },
    filterPillText: {
      fontSize: 13, fontWeight: '700', color: theme.textMuted,
    },

    // List
    list: { paddingHorizontal: 16 },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: theme.textMuted,
      letterSpacing: 1, marginBottom: 12,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: isDark ? theme.card : '#fff',
      borderRadius: 14, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor: theme.border,
    },
    rowIcon: {
      width: 40, height: 40, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    rowBody: { flex: 1 },
    rowLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
    rowDate: { fontSize: 12, color: theme.textMuted },
    rowRank: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    rowRight: { alignItems: 'flex-end' },
    rowDelta: { fontSize: 16, fontWeight: '800' },
    rowEloAfter: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  });
}
