import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Share, Alert,
} from 'react-native';
import { Users, ClipboardList, Trophy, Copy, LogOut, BarChart3, FileText, Bell, Award, Newspaper, Settings, Building2, CreditCard, BookOpen, Globe2, Store } from 'lucide-react-native';
import TrialBanner from '../../components/TrialBanner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { formatScoreValue } from '../../utils/scoreFormat';
import UserAvatar from '../../components/UserAvatar';
import InteractiveTour, { BO_TOUR_STEPS } from '../../components/InteractiveTour';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';

interface Stats {
  memberCount: number;
  todayWOD: { title: string; wod_type: string | null } | null;
  recentScores: { username: string; score_value: number; score_type: string; rx: boolean; wod_title: string }[];
}

interface InterBoxStats {
  totalCompetitions: number;
  activeCompetitions: number;
  totalParticipants: number;
  formatBreakdown: Record<string, number>;
  recentCompetitions: { id: string; title: string; format: string; status: string; participantCount: number }[];
}

export default function BODashboardScreen({ navigation }: any) {
  const { user, currentBox, signOut, boxSubscription, isBoxActive, daysLeftTrial } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);
  const formatLabel = (fmt: string) => fmt === 'bracket' ? t('bo.dashboard.fmtBracket') : fmt === 'league' ? t('bo.dashboard.fmtLeague') : fmt === 'pool' ? t('bo.dashboard.fmtPool') : fmt === 'swiss' ? t('bo.dashboard.fmtSwiss') : fmt;
  const statusLabel = (status: string) => status === 'draft' ? t('bo.dashboard.statusDraft') : status === 'open' ? t('bo.dashboard.statusOpen') : status === 'active' ? t('bo.dashboard.statusActive') : t('bo.dashboard.statusClosed');
  const [stats, setStats]         = useState<Stats>({ memberCount: 0, todayWOD: null, recentScores: [] });
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [interBoxStats, setInterBoxStats] = useState<InterBoxStats>({
    totalCompetitions: 0, activeCompetitions: 0, totalParticipants: 0,
    formatBreakdown: {}, recentCompetitions: [],
  });

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const [{ count }, { data: wods }, { data: scores }] = await Promise.all([
      supabase.from('box_members').select('*', { count: 'exact', head: true })
        .eq('box_id', currentBox.id).eq('status', 'active'),
      supabase.from('box_wods').select('title, wod_type')
        .eq('box_id', currentBox.id).eq('scheduled_date', today).eq('is_published', true).limit(1),
      supabase.from('wod_scores')
        .select('score_value, score_type, rx, box_wods(title), profiles(username)')
        .eq('box_id', currentBox.id)
        .order('submitted_at', { ascending: false })
        .limit(6),
    ]);
    setStats({
      memberCount: count ?? 0,
      todayWOD: wods?.[0] ?? null,
      recentScores: (scores ?? []).map((s: any) => ({
        username: s.profiles?.username ?? '?',
        score_value: s.score_value,
        score_type: s.score_type,
        rx: s.rx,
        wod_title: s.box_wods?.title ?? '',
      })),
    });
    // Load inter-box competition stats
    const { data: comps } = await supabase
      .from('inter_competitions')
      .select('id, title, format, status')
      .order('created_at', { ascending: false });
    if (comps && comps.length > 0) {
      const formatBreakdown: Record<string, number> = {};
      let activeCount = 0;
      comps.forEach((c: any) => {
        formatBreakdown[c.format] = (formatBreakdown[c.format] ?? 0) + 1;
        if (c.status === 'active' || c.status === 'open') activeCount++;
      });
      const compIds = comps.map((c: any) => c.id);
      const { count: totalParticipants } = await supabase
        .from('inter_registrations')
        .select('id', { count: 'exact', head: true })
        .in('competition_id', compIds)
        .eq('status', 'active');
      // Get participant counts per competition
      const recent = comps.slice(0, 5);
      const recentWithCounts = await Promise.all(
        recent.map(async (c: any) => {
          const { count } = await supabase.from('inter_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('competition_id', c.id).eq('status', 'active');
          return { ...c, participantCount: count ?? 0 };
        })
      );
      setInterBoxStats({
        totalCompetitions: comps.length,
        activeCompetitions: activeCount,
        totalParticipants: totalParticipants ?? 0,
        formatBreakdown,
        recentCompetitions: recentWithCounts,
      });
    }

    } catch (e) { captureError(e, { screen: 'BODashboard', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, today]);

  useEffect(() => { load(); }, [load]);

  async function copyCode() {
    if (!currentBox) return;
    await Share.share({ message: t('bo.dashboard.shareMsg', { code: currentBox.invite_code }) });
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
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
        <View>
          <Text style={S.headerTop}>{t('bo.dashboard.backOffice')}</Text>
          <Text style={S.headerTitle}>{currentBox?.name ?? t('bo.dashboard.myBox')}</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert(t('bo.dashboard.logout'), t('bo.dashboard.logoutConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('bo.dashboard.logout'), style: 'destructive', onPress: signOut },
        ])} style={S.logoutBtn}>
          <LogOut color={theme.textMuted} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Subscription Banner */}
        {boxSubscription && (
          <TrialBanner
            daysLeft={daysLeftTrial}
            status={boxSubscription.status}
            isEarlyAdopter={boxSubscription.is_early_adopter}
            onUpgrade={() => navigation.navigate('BOSubscription')}
          />
        )}

        {/* Code d'invitation */}
        <View style={S.inviteCard}>
          <Text style={S.inviteLabel}>{t('bo.dashboard.inviteCode')}</Text>
          <View style={S.inviteRow}>
            <Text style={S.inviteCode}>{currentBox?.invite_code ?? '------'}</Text>
            <TouchableOpacity style={[S.copyBtn, codeCopied && S.copyBtnDone]} onPress={copyCode} activeOpacity={0.8}>
              <Copy color={codeCopied ? theme.success : theme.accent} size={16} />
              <Text style={[S.copyBtnText, codeCopied && { color: theme.success }]}>
                {codeCopied ? t('bo.dashboard.copied') : t('bo.dashboard.copy')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={S.inviteHint}>{t('bo.dashboard.inviteHint')}</Text>
        </View>

        {/* Stats */}
        <View style={S.statsRow}>
          <TouchableOpacity style={S.statCard} onPress={() => navigation.navigate('Members')} activeOpacity={0.8}>
            <Users color={theme.accent} size={22} />
            <Text style={S.statValue}>{stats.memberCount}</Text>
            <Text style={S.statLabel}>{t('bo.dashboard.activeMembers')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.statCard} onPress={() => navigation.navigate('WODs')} activeOpacity={0.8}>
            <ClipboardList color={theme.accent} size={22} />
            <Text style={S.statValue}>{stats.todayWOD ? '1' : '0'}</Text>
            <Text style={S.statLabel}>{t('bo.dashboard.todayWod')}</Text>
          </TouchableOpacity>
          <View style={S.statCard}>
            <Trophy color={theme.gold} size={22} />
            <Text style={S.statValue}>{stats.recentScores.length}</Text>
            <Text style={S.statLabel}>{t('bo.dashboard.recentScores')}</Text>
          </View>
        </View>

        {/* WOD du jour */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>{t('bo.dashboard.todayWod')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('WODs')} activeOpacity={0.7}>
              <Text style={S.seeAll}>{t('bo.dashboard.manage')}</Text>
            </TouchableOpacity>
          </View>
          {stats.todayWOD ? (
            <View style={S.wodPreview}>
              <View style={S.wodTypePill}>
                <Text style={S.wodTypePillText}>{(stats.todayWOD.wod_type ?? 'WOD').toUpperCase()}</Text>
              </View>
              <Text style={S.wodPreviewTitle}>{stats.todayWOD.title}</Text>
            </View>
          ) : (
            <TouchableOpacity style={S.noWod} onPress={() => navigation.navigate('WODs')} activeOpacity={0.8}>
              <Text style={S.noWodText}>{t('bo.dashboard.noWodToday')}</Text>
              <Text style={S.noWodCta}>{t('bo.dashboard.createWodCta')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Derniers scores */}
        {stats.recentScores.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>{t('bo.dashboard.latestScores')}</Text>
            <View style={S.scoreList}>
              {stats.recentScores.map((sc, i) => (
                <View key={i} style={S.scoreRow}>
                  <UserAvatar uri={(sc as any).avatar_url} name={sc.username} size={32} borderRadius={10} backgroundColor={`${theme.accent}20`} textColor={theme.accent} fontSize={12} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.scoreName}>{sc.username}</Text>
                    <Text style={S.scoreWod}>{sc.wod_title}</Text>
                  </View>
                  <View style={S.scoreRight}>
                    <Text style={S.scoreValue}>
                      {formatScoreValue(sc.score_value, sc.score_type)}
                    </Text>
                    <Text style={[S.rxTag, { color: sc.rx ? theme.success : theme.warning }]}>
                      {sc.rx ? t('bo.dashboard.rx') : t('bo.dashboard.scaled')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick actions */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>{t('bo.dashboard.quickActions')}</Text>
          <View style={S.quickActions}>
            {[
              { label: t('bo.dashboard.qaSubscription'),  icon: CreditCard,    onPress: () => navigation.navigate('BOSubscription') },
              { label: t('bo.dashboard.qaBoxInfo'),       icon: Building2,     onPress: () => navigation.navigate('BOBoxInfo') },
              { label: t('bo.dashboard.qaCreateWod'),     icon: ClipboardList, onPress: () => navigation.navigate('WODs') },
              { label: t('bo.dashboard.qaManageMembers'), icon: Users,         onPress: () => navigation.navigate('Members') },
              { label: t('bo.dashboard.qaTournaments'),   icon: Trophy,        onPress: () => navigation.navigate('BOTournament') },
              { label: t('bo.dashboard.qaInterBox'),      icon: Globe2,        onPress: () => navigation.navigate('BOInterCompetition') },
              { label: t('bo.dashboard.qaPrograms'),      icon: BookOpen,      onPress: () => navigation.navigate('BOPrograms') },
              { label: t('bo.dashboard.qaProgramming'),   icon: Store,         onPress: () => navigation.navigate('BOProgramming') },
            ].map(({ label, icon: Icon, onPress }) => (
              <TouchableOpacity key={label} style={S.quickBtn} onPress={onPress} activeOpacity={0.8}>
                <Icon color={theme.accent} size={18} />
                <Text style={S.quickBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Inter-box stats */}
        {interBoxStats.totalCompetitions > 0 && (
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionTitle}>{t('bo.dashboard.interBox')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('BOInterCompetition')} activeOpacity={0.7}>
                <Text style={S.seeAll}>{t('bo.dashboard.manage')}</Text>
              </TouchableOpacity>
            </View>
            <View style={S.statsRow}>
              <View style={S.statCard}>
                <Globe2 color={theme.accent} size={20} />
                <Text style={S.statValue}>{interBoxStats.totalCompetitions}</Text>
                <Text style={S.statLabel}>{t('bo.dashboard.competitions')}</Text>
              </View>
              <View style={S.statCard}>
                <Trophy color={theme.gold} size={20} />
                <Text style={S.statValue}>{interBoxStats.activeCompetitions}</Text>
                <Text style={S.statLabel}>{t('bo.dashboard.inProgress')}</Text>
              </View>
              <View style={S.statCard}>
                <Users color={theme.accent} size={20} />
                <Text style={S.statValue}>{interBoxStats.totalParticipants}</Text>
                <Text style={S.statLabel}>{t('bo.dashboard.participants')}</Text>
              </View>
            </View>
            {/* Format breakdown */}
            {Object.keys(interBoxStats.formatBreakdown).length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {Object.entries(interBoxStats.formatBreakdown).map(([fmt, cnt]) => (
                  <View key={fmt} style={{ backgroundColor: `${theme.accent}15`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, color: theme.accent, fontWeight: '600' }}>
                      {formatLabel(fmt)} ({cnt})
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {/* Recent competitions */}
            {interBoxStats.recentCompetitions.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {interBoxStats.recentCompetitions.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}
                    onPress={() => navigation.navigate('BOInterCompetition')}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text }}>{c.title}</Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>
                        {formatLabel(c.format)} · {t('bo.dashboard.participantCount', { count: c.participantCount })}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: c.status === 'active' ? `${theme.success}20` : c.status === 'open' ? `${theme.accent}20` : `${theme.textMuted}20`,
                      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
                    }}>
                      <Text style={{
                        fontSize: 10, fontWeight: '700',
                        color: c.status === 'active' ? theme.success : c.status === 'open' ? theme.accent : theme.textMuted,
                      }}>
                        {statusLabel(c.status)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Analytics & Tools */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>{t('bo.dashboard.analyticsTools')}</Text>
          <View style={S.quickActions}>
            {[
              { label: t('bo.dashboard.qaStats'),         icon: BarChart3, onPress: () => navigation.navigate('BOStats') },
              { label: t('bo.dashboard.qaGamification'),  icon: Award,      onPress: () => navigation.navigate('BOGamification') },
              { label: t('bo.dashboard.qaReport'),        icon: FileText,   onPress: () => navigation.navigate('BOReport') },
              { label: t('bo.dashboard.qaNotifications'), icon: Bell,       onPress: () => navigation.navigate('BONotifications') },
              { label: t('bo.dashboard.qaArticles'),      icon: Newspaper,  onPress: () => navigation.navigate('BOArticles') },
              { label: t('bo.dashboard.qaPublication'),   icon: Settings,   onPress: () => navigation.navigate('BOSettings') },
            ].map(({ label, icon: Icon, onPress }) => (
              <TouchableOpacity key={label} style={S.quickBtn} onPress={onPress} activeOpacity={0.8}>
                <Icon color={theme.accent} size={18} />
                <Text style={S.quickBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      <InteractiveTour steps={BO_TOUR_STEPS} />
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTop: { 
    ...typography.overline, 
    color: theme.accent, 
  },
  headerTitle: { 
    ...typography.h3, 
    color: theme.text,
  },
  logoutBtn: { padding: spacing.xs },
  inviteCard: {
    margin: spacing.lg, 
    borderRadius: borderRadius.lg, 
    padding: spacing.lg,
    backgroundColor: theme.card, 
    borderWidth: 1, 
    borderColor: theme.border, 
    gap: spacing.sm,
    ...shadows.sm,
  },
  inviteLabel: { 
    ...typography.overline, 
    color: theme.textMuted,
  },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCode: { 
    ...typography.h2, 
    color: theme.text, 
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.xs, 
    paddingHorizontal: spacing.sm, 
    paddingVertical: spacing.xs, 
    borderRadius: borderRadius.md, 
    backgroundColor: `${theme.accent}10`, 
    borderWidth: 1, 
    borderColor: theme.border,
  },
  copyBtnDone: { backgroundColor: `${theme.success}15`, borderColor: theme.success },
  copyBtnText: { 
    ...typography.buttonSmall, 
    color: theme.accent,
  },
  inviteHint: { 
    ...typography.caption, 
    color: theme.textMuted,
  },
  statsRow: { 
    flexDirection: 'row', 
    paddingHorizontal: spacing.lg, 
    gap: spacing.sm, 
    marginBottom: spacing.xs,
  },
  statCard: {
    flex: 1, 
    backgroundColor: theme.card, 
    borderRadius: borderRadius.lg, 
    padding: spacing.md,
    alignItems: 'center', 
    gap: spacing.xs, 
    borderWidth: 1, 
    borderColor: theme.border,
    ...shadows.sm,
  },
  statValue: { 
    ...typography.h2, 
    color: theme.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { 
    ...typography.caption, 
    color: theme.textMuted, 
    fontWeight: '600', 
    textAlign: 'center',
  },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: spacing.sm,
  },
  sectionTitle: { 
    ...typography.h4, 
    color: theme.text,
  },
  seeAll: { 
    ...typography.button, 
    color: theme.accent,
  },
  wodPreview: {
    backgroundColor: theme.card, 
    borderRadius: borderRadius.lg, 
    padding: spacing.md,
    borderWidth: 1, 
    borderColor: theme.border, 
    gap: spacing.sm,
    ...shadows.sm,
  },
  wodTypePill: { 
    backgroundColor: theme.surface, 
    borderRadius: borderRadius.sm, 
    paddingHorizontal: spacing.sm, 
    paddingVertical: spacing.xs, 
    alignSelf: 'flex-start',
  },
  wodTypePillText: { 
    ...typography.overline, 
    color: theme.textSecondary,
  },
  wodPreviewTitle: { 
    ...typography.h4, 
    color: theme.text,
  },
  noWod: {
    backgroundColor: theme.card, 
    borderRadius: borderRadius.lg, 
    padding: spacing.lg,
    borderWidth: 1.5, 
    borderColor: theme.border, 
    borderStyle: 'dashed',
    alignItems: 'center', 
    gap: spacing.xs,
  },
  noWodText: { 
    ...typography.bodySmall, 
    color: theme.textMuted,
  },
  noWodCta: { 
    ...typography.button, 
    color: theme.accent,
  },
  scoreList: { 
    backgroundColor: theme.card, 
    borderRadius: borderRadius.lg, 
    borderWidth: 1, 
    borderColor: theme.border, 
    overflow: 'hidden',
    ...shadows.sm,
  },
  scoreRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: spacing.md, 
    gap: spacing.sm, 
    borderBottomWidth: 1, 
    borderBottomColor: theme.border,
  },
  scoreAvatar: { 
    width: 32, height: 32, 
    borderRadius: 16, 
    backgroundColor: theme.surface, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  scoreAvatarText: { 
    ...typography.button, 
    color: theme.text,
  },
  scoreName: { 
    ...typography.button, 
    color: theme.text,
  },
  scoreWod: { 
    ...typography.caption, 
    color: theme.textMuted,
  },
  scoreRight: { alignItems: 'flex-end', gap: spacing.xxs },
  scoreValue: { 
    ...typography.buttonLarge, 
    color: theme.text,
    fontVariant: ['tabular-nums'],
  },
  rxTag: { 
    ...typography.overline, 
    fontSize: 9,
  },
  quickActions: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: spacing.sm,
  },
  quickBtn: {
    flexBasis: '47%', 
    flexGrow: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: spacing.sm,
    backgroundColor: theme.card, 
    borderRadius: borderRadius.lg, 
    padding: spacing.md,
    borderWidth: 1, 
    borderColor: theme.border,
    ...shadows.sm,
  },
  quickBtnText: { 
    ...typography.button, 
    color: theme.text,
  },
}); }
