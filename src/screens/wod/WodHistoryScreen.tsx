import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { ArrowLeft, Heart, Clock, Zap, Trash2, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { LevelColors } from '../../theme/designTokens';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { HomeStackParamList } from '../../navigation';
import { AthleteLevel } from '../../types';
import { formatScoreValue } from '../../utils/scoreFormat';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<HomeStackParamList>;

interface SavedWOD {
  id: string;
  sport: string;
  wod_name: string;
  wod_type: string;
  duration: number;
  level: string;
  format: string;
  movements: string;
  scoring: string | null;
  coach_tip: string | null;
  team_note: string | null;
  equipment: string[];
  is_favorite: boolean;
  is_benchmark: boolean;
  created_at: string;
  scores?: WODScore[];
}

interface WODScore {
  id: string;
  score_type: string;
  score_value: number;
  rx: boolean;
  notes: string | null;
  completed_at: string;
}

type FilterType = 'all' | 'favorites' | 'benchmark';

function formatScore(score: WODScore): string {
  return formatScoreValue(score.score_value, score.score_type);
}

function localeTag(): string {
  return i18n.language === 'en' ? 'en-US' : 'fr-FR';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

export default function WodHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const [wods, setWods] = useState<SavedWOD[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const WOD_PAGE_SIZE = 30;

  const load = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('generated_wods')
      .select('*, scores:generated_wod_scores(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(WOD_PAGE_SIZE);

    if (filter === 'favorites') query = query.eq('is_favorite', true);
    if (filter === 'benchmark') query = query.eq('is_benchmark', true);

    const { data, error } = await query;
    if (error) { captureError(error, { screen: 'WodHistory', action: 'loadWods' }); }
    setWods((data ?? []) as SavedWOD[]);
    setHasMore((data ?? []).length >= WOD_PAGE_SIZE);
    setLoading(false);
    setRefreshing(false);
  }, [user, filter]);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!user || loadingMore || !hasMore || wods.length === 0) return;
    setLoadingMore(true);
    const lastCreated = wods[wods.length - 1].created_at;
    let query = supabase
      .from('generated_wods')
      .select('*, scores:generated_wod_scores(*)')
      .eq('user_id', user.id)
      .lt('created_at', lastCreated)
      .order('created_at', { ascending: false })
      .limit(WOD_PAGE_SIZE);
    if (filter === 'favorites') query = query.eq('is_favorite', true);
    if (filter === 'benchmark') query = query.eq('is_benchmark', true);
    const { data } = await query;
    const newItems = (data ?? []) as SavedWOD[];
    setWods(prev => [...prev, ...newItems]);
    setHasMore(newItems.length >= WOD_PAGE_SIZE);
    setLoadingMore(false);
  }, [user, filter, wods, loadingMore, hasMore]);

  async function toggleFav(wod: SavedWOD) {
    const newVal = !wod.is_favorite;
    setWods(prev => prev.map(w => w.id === wod.id ? { ...w, is_favorite: newVal } : w));
    await supabase.from('generated_wods').update({ is_favorite: newVal }).eq('id', wod.id);
  }

  async function deleteWod(wod: SavedWOD) {
    Alert.alert(t('wodHistory.deleteConfirmTitle'), wod.wod_name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          setWods(prev => prev.filter(w => w.id !== wod.id));
          await supabase.from('generated_wods').delete().eq('id', wod.id);
        },
      },
    ]);
  }

  // Stats
  const totalWods = wods.length;
  const totalScores = wods.reduce((acc, w) => acc + (w.scores?.length ?? 0), 0);
  const streak = (() => {
    const days = new Set(wods.map(w => new Date(w.created_at).toISOString().split('T')[0]));
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toISOString().split('T')[0])) count++;
      else if (i > 0) break;
    }
    return count;
  })();

  function renderWod({ item }: { item: SavedWOD }) {
    const isExpanded = expandedId === item.id;
    const levelColor = LevelColors[item.level as AthleteLevel] ?? theme.textMuted;
    const bestScore = item.scores && item.scores.length > 0
      ? item.scores.sort((a, b) => item.wod_type === 'For Time' ? a.score_value - b.score_value : b.score_value - a.score_value)[0]
      : null;

    return (
      <TouchableOpacity
        style={S.wodCard}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.8}
      >
        {/* Top row */}
        <View style={S.wodTop}>
          <View style={S.wodBadges}>
            <View style={[S.badge, { backgroundColor: `${theme.accent}18` }]}>
              <Text style={[S.badgeTxt, { color: theme.accent }]}>{item.wod_type}</Text>
            </View>
            <View style={[S.badge, { backgroundColor: `${levelColor}20` }]}>
              <Text style={[S.badgeTxt, { color: levelColor }]}>{item.level.toUpperCase()}</Text>
            </View>
            {item.is_benchmark && (
              <View style={[S.badge, { backgroundColor: '#F59E0B20' }]}>
                <Text style={[S.badgeTxt, { color: '#F59E0B' }]}>BM</Text>
              </View>
            )}
            {item.duration > 0 && (
              <View style={[S.badge, { backgroundColor: theme.surface }]}>
                <Clock color={theme.textMuted} size={10} />
                <Text style={[S.badgeTxt, { color: theme.textMuted }]}>{item.duration}m</Text>
              </View>
            )}
          </View>
          <View style={S.wodActions}>
            <TouchableOpacity onPress={() => toggleFav(item)} hitSlop={8}>
              <Heart color={item.is_favorite ? '#EF4444' : theme.textMuted} size={16} fill={item.is_favorite ? '#EF4444' : 'transparent'} />
            </TouchableOpacity>
            {isExpanded ? <ChevronUp color={theme.textMuted} size={16} /> : <ChevronDown color={theme.textMuted} size={16} />}
          </View>
        </View>

        {/* Title + date */}
        <Text style={S.wodName}>{item.wod_name}</Text>
        <Text style={S.wodDate}>{formatDate(item.created_at)} · {item.format}</Text>

        {/* Best score if any */}
        {bestScore && (
          <View style={S.bestScoreRow}>
            <Zap color={theme.gold} size={12} />
            <Text style={S.bestScoreTxt}>{t('wodHistory.best', { score: formatScore(bestScore), tag: bestScore.rx ? t('wodHistory.rxTag') : t('wodHistory.scaledTag') })}</Text>
          </View>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <View style={S.expandedContent}>
            <View style={S.movBox}>
              {item.movements.split('\n').map((line, i) => (
                <Text key={i} style={line.startsWith('  ') ? S.movLine : S.movHeader}>{line}</Text>
              ))}
            </View>
            {item.scoring && (
              <View style={S.scoringRow}>
                <Zap color={theme.gold} size={13} />
                <Text style={S.scoringTxt}>{item.scoring}</Text>
              </View>
            )}
            {item.coach_tip && (
              <View style={S.coachBox}>
                <Text style={S.coachTxt}>💡 {item.coach_tip}</Text>
              </View>
            )}

            {/* All scores */}
            {item.scores && item.scores.length > 0 && (
              <View style={S.scoresSection}>
                <Text style={S.scoresTitle}>{t('wodHistory.myScores', { count: item.scores.length })}</Text>
                {item.scores.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()).map(sc => (
                  <View key={sc.id} style={S.scoreRow}>
                    <Text style={S.scoreDate}>{formatDateShort(sc.completed_at)}</Text>
                    <Text style={S.scoreValue}>{formatScore(sc)}</Text>
                    <Text style={S.scoreRx}>{sc.rx ? 'RX' : 'SC'}</Text>
                    {sc.notes ? <Text style={S.scoreNotes} numberOfLines={1}>{sc.notes}</Text> : null}
                  </View>
                ))}
              </View>
            )}

            {/* Delete */}
            <TouchableOpacity style={S.deleteBtn} onPress={() => deleteWod(item)} activeOpacity={0.7}>
              <Trash2 color="#EF4444" size={14} />
              <Text style={S.deleteTxt}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={S.screen}>
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('wodHistory.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Stats row */}
      <View style={S.statsRow}>
        <View style={S.statBox}>
          <Text style={S.statNum}>{totalWods}</Text>
          <Text style={S.statLabel}>{t('wodHistory.statWods')}</Text>
        </View>
        <View style={S.statBox}>
          <Text style={S.statNum}>{totalScores}</Text>
          <Text style={S.statLabel}>{t('wodHistory.statScores')}</Text>
        </View>
        <View style={S.statBox}>
          <Text style={[S.statNum, streak >= 3 && { color: '#EF4444' }]}>{streak}🔥</Text>
          <Text style={S.statLabel}>{t('wodHistory.statStreak')}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={S.filterRow}>
        {([['all', t('wodHistory.filterAll')], ['favorites', t('wodHistory.filterFavorites')], ['benchmark', t('wodHistory.filterBenchmark')]] as const).map(([key, label]) => (
          <TouchableOpacity key={key} onPress={() => setFilter(key)} activeOpacity={0.7}
            style={[S.filterChip, filter === key && S.filterChipSel]}>
            <Text style={[S.filterTxt, filter === key && S.filterTxtSel]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={wods}
          keyExtractor={w => w.id}
          renderItem={renderWod}
          contentContainerStyle={S.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.accent} /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={S.emptyEmoji}>📋</Text>
              <Text style={S.emptyTitle}>{t('wodHistory.emptyTitle')}</Text>
              <Text style={S.emptySub}>{t('wodHistory.emptySub')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  statBox: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900', color: t.text },
  statLabel: { fontSize: 11, fontWeight: '600', color: t.textMuted, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface,
  },
  filterChipSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  filterTxt: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  filterTxtSel: { color: t.accent, fontWeight: '900' },
  list: { padding: 16, gap: 12, paddingBottom: 140 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: t.text },
  emptySub: { fontSize: 13, color: t.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  wodCard: {
    backgroundColor: t.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: t.border, gap: 6,
  },
  wodTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wodBadges: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  badgeTxt: { fontSize: 9, fontWeight: '800' },
  wodActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  wodName: { fontSize: 17, fontWeight: '900', color: t.text },
  wodDate: { fontSize: 11, fontWeight: '600', color: t.textMuted },
  bestScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bestScoreTxt: { fontSize: 12, fontWeight: '700', color: t.gold },
  expandedContent: { gap: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 },
  movBox: { backgroundColor: t.surface, borderRadius: 8, padding: 10, gap: 2 },
  movHeader: { fontSize: 11, fontWeight: '800', color: t.textSecondary },
  movLine: { fontSize: 12, fontWeight: '600', color: t.text },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scoringTxt: { fontSize: 11, fontWeight: '700', color: t.textSecondary, flex: 1 },
  coachBox: { backgroundColor: `${t.gold}12`, borderRadius: 8, padding: 8 },
  coachTxt: { fontSize: 11, color: t.textSecondary, lineHeight: 16 },
  scoresSection: { gap: 4 },
  scoresTitle: { fontSize: 12, fontWeight: '800', color: t.text },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: t.border },
  scoreDate: { fontSize: 11, fontWeight: '600', color: t.textMuted, width: 60 },
  scoreValue: { fontSize: 14, fontWeight: '900', color: t.text },
  scoreRx: { fontSize: 10, fontWeight: '800', color: t.accent, backgroundColor: `${t.accent}15`, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  scoreNotes: { fontSize: 10, color: t.textMuted, flex: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingVertical: 6 },
  deleteTxt: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
}); }
