import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Share, Alert,
} from 'react-native';
import { Users, ClipboardList, Trophy, Copy, LogOut, BarChart3, FileText, Bell, Award, Newspaper, Settings, Building2, CreditCard, BookOpen } from 'lucide-react-native';
import TrialBanner from '../../components/TrialBanner';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { formatScoreValue } from '../../utils/scoreFormat';
import UserAvatar from '../../components/UserAvatar';

interface Stats {
  memberCount: number;
  todayWOD: { title: string; wod_type: string | null } | null;
  recentScores: { username: string; score_value: number; score_type: string; rx: boolean; wod_title: string }[];
}

export default function BODashboardScreen({ navigation }: any) {
  const { user, currentBox, signOut, boxSubscription, isBoxActive, daysLeftTrial } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [stats, setStats]         = useState<Stats>({ memberCount: 0, todayWOD: null, recentScores: [] });
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

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
    } catch (e) { captureError(e, { screen: 'BODashboard', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, today]);

  useEffect(() => { load(); }, [load]);

  async function copyCode() {
    if (!currentBox) return;
    await Share.share({ message: `Rejoins ma box sur AthleX ! Code : ${currentBox.invite_code}` });
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
          <Text style={S.headerTop}>BACK OFFICE</Text>
          <Text style={S.headerTitle}>{currentBox?.name ?? 'Ma Box'}</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Déconnexion', 'Confirmer ?', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Déconnexion', style: 'destructive', onPress: signOut },
        ])} style={S.logoutBtn}>
          <LogOut color={theme.textMuted} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
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
          <Text style={S.inviteLabel}>CODE D'INVITATION</Text>
          <View style={S.inviteRow}>
            <Text style={S.inviteCode}>{currentBox?.invite_code ?? '------'}</Text>
            <TouchableOpacity style={[S.copyBtn, codeCopied && S.copyBtnDone]} onPress={copyCode} activeOpacity={0.8}>
              <Copy color={codeCopied ? theme.success : theme.accent} size={16} />
              <Text style={[S.copyBtnText, codeCopied && { color: theme.success }]}>
                {codeCopied ? 'Copié !' : 'Copier'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={S.inviteHint}>Partage ce code à tes adhérents pour qu'ils rejoignent la box</Text>
        </View>

        {/* Stats */}
        <View style={S.statsRow}>
          <TouchableOpacity style={S.statCard} onPress={() => navigation.navigate('Members')} activeOpacity={0.8}>
            <Users color={theme.accent} size={22} />
            <Text style={S.statValue}>{stats.memberCount}</Text>
            <Text style={S.statLabel}>Membres actifs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.statCard} onPress={() => navigation.navigate('WODs')} activeOpacity={0.8}>
            <ClipboardList color={theme.accent} size={22} />
            <Text style={S.statValue}>{stats.todayWOD ? '1' : '0'}</Text>
            <Text style={S.statLabel}>WOD du jour</Text>
          </TouchableOpacity>
          <View style={S.statCard}>
            <Trophy color={theme.gold} size={22} />
            <Text style={S.statValue}>{stats.recentScores.length}</Text>
            <Text style={S.statLabel}>Scores récents</Text>
          </View>
        </View>

        {/* WOD du jour */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>WOD du jour</Text>
            <TouchableOpacity onPress={() => navigation.navigate('WODs')} activeOpacity={0.7}>
              <Text style={S.seeAll}>Gérer</Text>
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
              <Text style={S.noWodText}>Aucun WOD publié aujourd'hui</Text>
              <Text style={S.noWodCta}>+ Créer un WOD →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Derniers scores */}
        {stats.recentScores.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Derniers scores soumis</Text>
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
                      {sc.rx ? 'RX' : 'Scaled'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick actions */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Actions rapides</Text>
          <View style={S.quickActions}>
            {[
              { label: 'Abonnement',        icon: CreditCard,    onPress: () => navigation.navigate('BOSubscription') },
              { label: 'Infos box',         icon: Building2,     onPress: () => navigation.navigate('BOBoxInfo') },
              { label: 'Créer un WOD',      icon: ClipboardList, onPress: () => navigation.navigate('WODs') },
              { label: 'Gérer les membres', icon: Users,         onPress: () => navigation.navigate('Members') },
              { label: 'Tournois & Scores', icon: Trophy,        onPress: () => navigation.navigate('BOTournament') },
              { label: 'Programmes',        icon: BookOpen,      onPress: () => navigation.navigate('BOPrograms') },
            ].map(({ label, icon: Icon, onPress }) => (
              <TouchableOpacity key={label} style={S.quickBtn} onPress={onPress} activeOpacity={0.8}>
                <Icon color={theme.accent} size={18} />
                <Text style={S.quickBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Analytics & Tools */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Analytics & Outils</Text>
          <View style={S.quickActions}>
            {[
              { label: 'Statistiques',   icon: BarChart3, onPress: () => navigation.navigate('BOStats') },
              { label: 'Gamification',   icon: Award,      onPress: () => navigation.navigate('BOGamification') },
              { label: 'Rapport',        icon: FileText,   onPress: () => navigation.navigate('BOReport') },
              { label: 'Notifications',  icon: Bell,       onPress: () => navigation.navigate('BONotifications') },
              { label: 'Actualités',    icon: Newspaper,  onPress: () => navigation.navigate('BOArticles') },
              { label: 'Publication',   icon: Settings,   onPress: () => navigation.navigate('BOSettings') },
            ].map(({ label, icon: Icon, onPress }) => (
              <TouchableOpacity key={label} style={S.quickBtn} onPress={onPress} activeOpacity={0.8}>
                <Icon color={theme.accent} size={18} />
                <Text style={S.quickBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTop:    { fontSize: 10, fontWeight: '800', color: theme.accent, letterSpacing: 2 },
  headerTitle:  { fontSize: 22, fontWeight: '900', color: theme.text },
  logoutBtn:    { padding: 6 },
  inviteCard: {
    margin: 16, borderRadius: 16, padding: 18,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, gap: 8,
  },
  inviteLabel:   { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1.5 },
  inviteRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCode:    { fontSize: 32, fontWeight: '900', color: theme.text, letterSpacing: 8 },
  copyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: `${theme.accent}08`, borderWidth: 1, borderColor: theme.border },
  copyBtnDone:   { backgroundColor: `${theme.success}10`, borderColor: theme.success },
  copyBtnText:   { fontSize: 12, fontWeight: '700', color: theme.accent },
  inviteHint:    { fontSize: 11, color: theme.textMuted },
  statsRow:  { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: theme.card, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.border,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: theme.text },
  statLabel: { fontSize: 10, color: theme.textMuted, fontWeight: '600', textAlign: 'center' },
  section:       { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: '900', color: theme.text },
  seeAll:        { fontSize: 13, color: theme.accent, fontWeight: '700' },
  wodPreview: {
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border, gap: 8,
  },
  wodTypePill: { backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  wodTypePillText: { fontSize: 10, fontWeight: '800', color: theme.textSecondary, letterSpacing: 0.5 },
  wodPreviewTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
  noWod: {
    backgroundColor: theme.card, borderRadius: 14, padding: 20,
    borderWidth: 1.5, borderColor: theme.border, borderStyle: 'dashed',
    alignItems: 'center', gap: 6,
  },
  noWodText: { fontSize: 13, color: theme.textMuted },
  noWodCta:  { fontSize: 14, color: theme.accent, fontWeight: '800' },
  scoreList: { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  scoreRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  scoreAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  scoreAvatarText: { fontSize: 13, fontWeight: '800', color: theme.text },
  scoreName:   { fontSize: 13, fontWeight: '700', color: theme.text },
  scoreWod:    { fontSize: 11, color: theme.textMuted },
  scoreRight:  { alignItems: 'flex-end', gap: 2 },
  scoreValue:  { fontSize: 14, fontWeight: '900', color: theme.text },
  rxTag:       { fontSize: 10, fontWeight: '800' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: {
    flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  quickBtnText: { fontSize: 13, fontWeight: '800', color: theme.text },
}); }
