import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Share, Alert,
} from 'react-native';
import { Users, ClipboardList, Trophy, Copy, LogOut } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../theme/colors';

interface Stats {
  memberCount: number;
  todayWOD: { title: string; wod_type: string } | null;
  recentScores: { username: string; score_value: number; score_type: string; rx: boolean; wod_title: string }[];
}

export default function BODashboardScreen({ navigation }: any) {
  const { user, currentBox, signOut } = useAuth();
  const [stats, setStats]         = useState<Stats>({ memberCount: 0, todayWOD: null, recentScores: [] });
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
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
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, today]);

  useEffect(() => { load(); }, [load]);

  async function copyCode() {
    if (!currentBox) return;
    await Share.share({ message: `Rejoins ma box sur BattleWOD ! Code : ${currentBox.invite_code}` });
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTop}>BACK OFFICE</Text>
          <Text style={s.headerTitle}>{currentBox?.name ?? 'Ma Box'}</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Déconnexion', 'Confirmer ?', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Déconnexion', style: 'destructive', onPress: signOut },
        ])} style={s.logoutBtn}>
          <LogOut color={Colors.textMuted} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Code d'invitation */}
        <View style={s.inviteCard}>
          <Text style={s.inviteLabel}>CODE D'INVITATION</Text>
          <View style={s.inviteRow}>
            <Text style={s.inviteCode}>{currentBox?.invite_code ?? '------'}</Text>
            <TouchableOpacity style={[s.copyBtn, codeCopied && s.copyBtnDone]} onPress={copyCode} activeOpacity={0.8}>
              <Copy color={codeCopied ? Colors.success : Colors.primary} size={16} />
              <Text style={[s.copyBtnText, codeCopied && { color: Colors.success }]}>
                {codeCopied ? 'Copié !' : 'Copier'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={s.inviteHint}>Partage ce code à tes adhérents pour qu'ils rejoignent la box</Text>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <TouchableOpacity style={s.statCard} onPress={() => navigation.navigate('Members')} activeOpacity={0.8}>
            <Users color={Colors.primary} size={22} />
            <Text style={s.statValue}>{stats.memberCount}</Text>
            <Text style={s.statLabel}>Membres actifs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.statCard} onPress={() => navigation.navigate('WODs')} activeOpacity={0.8}>
            <ClipboardList color={Colors.primary} size={22} />
            <Text style={s.statValue}>{stats.todayWOD ? '1' : '0'}</Text>
            <Text style={s.statLabel}>WOD du jour</Text>
          </TouchableOpacity>
          <View style={s.statCard}>
            <Trophy color={Colors.gold} size={22} />
            <Text style={s.statValue}>{stats.recentScores.length}</Text>
            <Text style={s.statLabel}>Scores récents</Text>
          </View>
        </View>

        {/* WOD du jour */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>WOD du jour</Text>
            <TouchableOpacity onPress={() => navigation.navigate('WODs')} activeOpacity={0.7}>
              <Text style={s.seeAll}>Gérer</Text>
            </TouchableOpacity>
          </View>
          {stats.todayWOD ? (
            <View style={s.wodPreview}>
              <View style={s.wodTypePill}>
                <Text style={s.wodTypePillText}>{(stats.todayWOD.wod_type ?? 'WOD').toUpperCase()}</Text>
              </View>
              <Text style={s.wodPreviewTitle}>{stats.todayWOD.title}</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.noWod} onPress={() => navigation.navigate('WODs')} activeOpacity={0.8}>
              <Text style={s.noWodText}>Aucun WOD publié aujourd'hui</Text>
              <Text style={s.noWodCta}>+ Créer un WOD →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Derniers scores */}
        {stats.recentScores.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Derniers scores soumis</Text>
            <View style={s.scoreList}>
              {stats.recentScores.map((sc, i) => (
                <View key={i} style={s.scoreRow}>
                  <View style={s.scoreAvatar}>
                    <Text style={s.scoreAvatarText}>{sc.username[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.scoreName}>{sc.username}</Text>
                    <Text style={s.scoreWod}>{sc.wod_title}</Text>
                  </View>
                  <View style={s.scoreRight}>
                    <Text style={s.scoreValue}>
                      {sc.score_type === 'time'
                        ? `${Math.floor(sc.score_value / 60)}:${String(Math.round(sc.score_value % 60)).padStart(2, '0')}`
                        : `${sc.score_value} ${sc.score_type}`}
                    </Text>
                    <Text style={[s.rxTag, { color: sc.rx ? Colors.success : Colors.warning }]}>
                      {sc.rx ? 'RX' : 'Scaled'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Actions rapides</Text>
          <View style={s.quickActions}>
            {[
              { label: 'Créer un WOD',      icon: ClipboardList, onPress: () => navigation.navigate('WODs') },
              { label: 'Gérer les membres', icon: Users,         onPress: () => navigation.navigate('Members') },
              { label: 'Tournois & Scores', icon: Trophy,        onPress: () => navigation.navigate('BOTournament') },
            ].map(({ label, icon: Icon, onPress }) => (
              <TouchableOpacity key={label} style={s.quickBtn} onPress={onPress} activeOpacity={0.8}>
                <Icon color={Colors.primary} size={18} />
                <Text style={s.quickBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTop:    { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 2 },
  headerTitle:  { fontSize: 22, fontWeight: '900', color: Colors.text },
  logoutBtn:    { padding: 6 },

  inviteCard: {
    margin: 16, borderRadius: 16, padding: 18,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  inviteLabel:   { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.5 },
  inviteRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCode:    { fontSize: 32, fontWeight: '900', color: Colors.text, letterSpacing: 8 },
  copyBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: `${Colors.primary}08`, borderWidth: 1, borderColor: Colors.border },
  copyBtnDone:   { backgroundColor: `${Colors.success}10`, borderColor: Colors.success },
  copyBtnText:   { fontSize: 12, fontWeight: '700', color: Colors.primary },
  inviteHint:    { fontSize: 11, color: Colors.textMuted },

  statsRow:  { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },

  section:       { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: '900', color: Colors.text },
  seeAll:        { fontSize: 13, color: Colors.primary, fontWeight: '700' },

  wodPreview: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  wodTypePill: { backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  wodTypePillText: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5 },
  wodPreviewTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },

  noWod: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 20,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', gap: 6,
  },
  noWodText: { fontSize: 13, color: Colors.textMuted },
  noWodCta:  { fontSize: 14, color: Colors.primary, fontWeight: '800' },

  scoreList: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  scoreRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  scoreAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  scoreAvatarText: { fontSize: 13, fontWeight: '800', color: Colors.text },
  scoreName:   { fontSize: 13, fontWeight: '700', color: Colors.text },
  scoreWod:    { fontSize: 11, color: Colors.textMuted },
  scoreRight:  { alignItems: 'flex-end', gap: 2 },
  scoreValue:  { fontSize: 14, fontWeight: '900', color: Colors.text },
  rxTag:       { fontSize: 10, fontWeight: '800' },

  quickActions: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickBtnText: { fontSize: 13, fontWeight: '800', color: Colors.text },
});
