import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Trophy, Dumbbell } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface EloEntry {
  id: string;
  type: 'wod' | 'tournament';
  label: string;
  delta: number;
  eloBefore: number;
  eloAfter: number;
  rank: number;
  date: string;
}

export default function EloHistoryScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const S = createStyles(theme, isDark);

  const [entries, setEntries] = useState<EloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const results: EloEntry[] = [];

    // 1. WOD elo_history
    const { data: wodHistory } = await supabase
      .from('elo_history')
      .select('id, wod_id, elo_before, elo_after, elo_delta, rank, created_at, box_wods(title, type)')
      .eq('member_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    for (const h of wodHistory ?? []) {
      const wod = Array.isArray(h.box_wods) ? h.box_wods[0] : h.box_wods;
      results.push({
        id: h.id,
        type: 'wod',
        label: wod?.title ?? 'WOD',
        delta: h.elo_delta,
        eloBefore: h.elo_before,
        eloAfter: h.elo_after,
        rank: h.rank,
        date: h.created_at,
      });
    }

    // 2. Tournament elo_history
    const { data: tournHistory } = await supabase
      .from('tournament_elo_history')
      .select('id, tournament_id, elo_before, elo_after, elo_change, final_rank, calculated_at, tournaments(name)')
      .eq('athlete_id', user.id)
      .order('calculated_at', { ascending: false })
      .limit(100);

    for (const h of tournHistory ?? []) {
      const tourn = Array.isArray(h.tournaments) ? h.tournaments[0] : h.tournaments;
      results.push({
        id: h.id,
        type: 'tournament',
        label: tourn?.name ?? 'Tournoi',
        delta: h.elo_change,
        eloBefore: h.elo_before,
        eloAfter: h.elo_after,
        rank: h.final_rank,
        date: h.calculated_at,
      });
    }

    // Sort by date descending
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEntries(results);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const currentElo = user?.elo ?? 1000;
  const totalGain = entries.reduce((sum, e) => sum + (e.delta > 0 ? e.delta : 0), 0);
  const totalLoss = entries.reduce((sum, e) => sum + (e.delta < 0 ? e.delta : 0), 0);

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

        {/* History list */}
        {loading ? (
          <ActivityIndicator color={theme.accent} size="large" style={{ marginTop: 40 }} />
        ) : entries.length === 0 ? (
          <View style={S.emptyState}>
            <Trophy color={theme.textMuted} size={40} />
            <Text style={S.emptyText}>Aucun historique ELO</Text>
            <Text style={S.emptySubtext}>Participe à des WODs ou tournois pour voir ton historique ici.</Text>
          </View>
        ) : (
          <View style={S.list}>
            <Text style={S.sectionTitle}>HISTORIQUE ({entries.length})</Text>
            {entries.map((entry) => (
              <View key={entry.id} style={S.row}>
                <View style={[S.rowIcon, { backgroundColor: entry.type === 'tournament' ? '#8b5cf620' : `${theme.accent}20` }]}>
                  {entry.type === 'tournament'
                    ? <Trophy color="#8b5cf6" size={18} />
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
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
