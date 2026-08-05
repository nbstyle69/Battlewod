import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { FileText, Download, Users, Trophy, ClipboardList, TrendingUp, Flame } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface MonthlyReport {
  month: string;
  totalMembers: number;
  newMembers: number;
  totalScores: number;
  totalWODs: number;
  topAthlete: { username: string; scores: number } | null;
  mostPopularWOD: { title: string; scores: number } | null;
  avgScoresPerMember: number;
  retentionRate: number;
}

export default function BOReportScreen() {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const S = styles(theme);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(0); // 0 = current, 1 = last, etc.

  const getMonthRange = (offset: number) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const label = start.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
    return { start, end, label };
  };

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const boxId = currentBox.id;
    const { start, end, label } = getMonthRange(selectedMonth);

    // Total active members
    const { count: totalMembers } = await supabase
      .from('box_members').select('id', { count: 'exact', head: true })
      .eq('box_id', boxId).eq('status', 'active');

    // New members this month
    const { count: newMembers } = await supabase
      .from('box_members').select('id', { count: 'exact', head: true })
      .eq('box_id', boxId)
      .gte('joined_at', start.toISOString())
      .lt('joined_at', end.toISOString());

    // Total scores this month
    const { data: scores } = await supabase
      .from('wod_scores')
      .select('athlete_id, profiles(username), wod_id, box_wods(title)')
      .eq('box_id', boxId)
      .gte('submitted_at', start.toISOString())
      .lt('submitted_at', end.toISOString());

    const totalScores = scores?.length ?? 0;

    // Total WODs published this month
    const { count: totalWODs } = await supabase
      .from('box_wods').select('*', { count: 'exact', head: true })
      .eq('box_id', boxId).eq('is_published', true)
      .gte('scheduled_date', start.toISOString().split('T')[0])
      .lt('scheduled_date', end.toISOString().split('T')[0]);

    // Top athlete
    const athleteMap = new Map<string, { username: string; count: number }>();
    (scores ?? []).forEach((s: any) => {
      const e = athleteMap.get(s.athlete_id);
      if (e) e.count++;
      else athleteMap.set(s.athlete_id, { username: s.profiles?.username ?? '?', count: 1 });
    });
    const sortedAthletes = Array.from(athleteMap.values()).sort((a, b) => b.count - a.count);
    const topAthlete = sortedAthletes[0] ? { username: sortedAthletes[0].username, scores: sortedAthletes[0].count } : null;

    // Most popular WOD
    const wodMap = new Map<string, { title: string; count: number }>();
    (scores ?? []).forEach((s: any) => {
      const key = s.wod_id;
      const e = wodMap.get(key);
      if (e) e.count++;
      else wodMap.set(key, { title: s.box_wods?.title ?? '?', count: 1 });
    });
    const sortedWODs = Array.from(wodMap.values()).sort((a, b) => b.count - a.count);
    const mostPopularWOD = sortedWODs[0] ? { title: sortedWODs[0].title, scores: sortedWODs[0].count } : null;

    // Avg scores per member
    const uniqueAthletes = new Set((scores ?? []).map((s: any) => s.athlete_id));
    const avgScoresPerMember = uniqueAthletes.size > 0 ? Math.round(totalScores / uniqueAthletes.size * 10) / 10 : 0;

    // Retention: unique scorers / total members
    const retentionRate = totalMembers && totalMembers > 0
      ? Math.round((uniqueAthletes.size / totalMembers) * 100) : 0;

    setReport({
      month: label,
      totalMembers: totalMembers ?? 0,
      newMembers: newMembers ?? 0,
      totalScores,
      totalWODs: totalWODs ?? 0,
      topAthlete,
      mostPopularWOD,
      avgScoresPerMember,
      retentionRate,
    });
    } catch (e) { captureError(e, { screen: 'BOReport', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, selectedMonth]);

  useEffect(() => { load(); }, [load]);

  async function shareReport() {
    if (!report) return;
    const text = t('bo.report.shareTitle', { month: report.month }) + '\n\n' +
      t('bo.report.shareMembers', { total: report.totalMembers, new: report.newMembers }) + '\n' +
      t('bo.report.shareScores', { count: report.totalScores }) + '\n' +
      t('bo.report.shareWods', { count: report.totalWODs }) + '\n' +
      t('bo.report.shareRetention', { rate: report.retentionRate }) + '\n' +
      t('bo.report.shareAvg', { avg: report.avgScoresPerMember }) + '\n' +
      (report.topAthlete ? t('bo.report.shareTop', { name: report.topAthlete.username, count: report.topAthlete.scores }) + '\n' : '') +
      (report.mostPopularWOD ? t('bo.report.sharePopular', { title: report.mostPopularWOD.title, count: report.mostPopularWOD.scores }) + '\n' : '') +
      t('bo.report.shareFooter');
    await Share.share({ message: text });
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
      <View style={S.header}>
        <FileText color={theme.accent} size={22} />
        <Text style={S.headerTitle}>{t('bo.report.title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Month selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0, 1, 2, 3].map(offset => {
              const { label } = getMonthRange(offset);
              const active = offset === selectedMonth;
              return (
                <TouchableOpacity
                  key={offset}
                  style={[S.monthPill, active && S.monthPillActive]}
                  onPress={() => { setSelectedMonth(offset); setLoading(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={[S.monthPillText, active && S.monthPillTextActive]}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {report && (
          <>
            {/* Title */}
            <View style={S.reportHeader}>
              <Text style={S.reportTitle}>
                {report.month.charAt(0).toUpperCase() + report.month.slice(1)}
              </Text>
              <TouchableOpacity style={S.shareBtn} onPress={shareReport} activeOpacity={0.8}>
                <Download color={theme.accent} size={16} />
                <Text style={S.shareBtnText}>{t('bo.report.share')}</Text>
              </TouchableOpacity>
            </View>

            {/* KPI Grid */}
            <View style={S.kpiGrid}>
              {[
                { icon: Users, label: t('bo.report.kpiMembers'), value: String(report.totalMembers), sub: t('bo.report.kpiNew', { count: report.newMembers }), color: theme.accent },
                { icon: ClipboardList, label: t('bo.report.kpiWods'), value: String(report.totalWODs), sub: null, color: theme.accent },
                { icon: Trophy, label: t('bo.report.kpiScores'), value: String(report.totalScores), sub: t('bo.report.kpiAvg', { avg: report.avgScoresPerMember }), color: theme.accent },
                { icon: TrendingUp, label: t('bo.report.kpiRetention'), value: `${report.retentionRate}%`, sub: t('bo.report.kpiActiveMembers'), color: report.retentionRate >= 50 ? theme.success : theme.warning },
              ].map(({ icon: Icon, label, value, sub, color }) => (
                <View key={label} style={S.kpiCard}>
                  <Icon color={color} size={18} />
                  <Text style={[S.kpiValue, { color }]}>{value}</Text>
                  <Text style={S.kpiLabel}>{label}</Text>
                  {sub && <Text style={S.kpiSub}>{sub}</Text>}
                </View>
              ))}
            </View>

            {/* Highlights */}
            {report.topAthlete && (
              <View style={S.highlightCard}>
                <Trophy color={theme.gold} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={S.highlightLabel}>{t('bo.report.topAthlete')}</Text>
                  <Text style={S.highlightValue}>{report.topAthlete.username}</Text>
                  <Text style={S.highlightSub}>{t('bo.report.scoresSubmitted', { count: report.topAthlete.scores })}</Text>
                </View>
              </View>
            )}

            {report.mostPopularWOD && (
              <View style={S.highlightCard}>
                <Flame color={theme.accent} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={S.highlightLabel}>{t('bo.report.popularWod')}</Text>
                  <Text style={S.highlightValue}>{report.mostPopularWOD.title}</Text>
                  <Text style={S.highlightSub}>{t('bo.report.participations', { count: report.mostPopularWOD.scores })}</Text>
                </View>
              </View>
            )}
          </>
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
  monthPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  monthPillActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  monthPillText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  monthPillTextActive: { color: theme.card },
  reportHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginTop: 20, marginBottom: 14,
  },
  reportTitle: { fontSize: 18, fontWeight: '900', color: theme.text },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: `${theme.accent}10`, borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  shareBtnText: { fontSize: 12, fontWeight: '700', color: theme.accent },
  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10,
  },
  kpiCard: {
    width: '47%', backgroundColor: theme.card, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.border,
  },
  kpiValue: { fontSize: 24, fontWeight: '900', color: theme.text },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
  kpiSub: { fontSize: 10, color: theme.textMuted },
  highlightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginTop: 14, backgroundColor: theme.card,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.border,
  },
  highlightLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  highlightValue: { fontSize: 16, fontWeight: '900', color: theme.text, marginTop: 2 },
  highlightSub: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
}); }
