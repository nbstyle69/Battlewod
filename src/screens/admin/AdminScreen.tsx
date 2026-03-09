import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, CheckCircle, XCircle, Video, Clock, Users, Trophy, LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';

const TABS = ['Scores', 'Matchs', 'Tournois'];

interface PendingScore {
  id: string;
  athlete: string;
  wod: string;
  value: string;
  level: string;
  hasVideo: boolean;
  submitted: string;
}

export default function AdminScreen() {
  const { user, signOut } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);
  const [activeTab, setActiveTab]     = useState(0);
  const [pendingScores, setPendingScores] = useState<PendingScore[]>([]);
  const [loadingScores, setLoadingScores] = useState(true);

  const loadScores = useCallback(async () => {
    setLoadingScores(true);
    const { data } = await supabase
      .from('tournament_scores')
      .select('id, score_value, video_url, submitted_at, status, profile:profiles(username, level), tw:tournament_wods(title)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false });

    const mapped: PendingScore[] = (data ?? []).map((s: any) => {
      const profile = Array.isArray(s.profile) ? s.profile[0] : s.profile;
      const tw      = Array.isArray(s.tw)      ? s.tw[0]      : s.tw;
      const mins = Math.floor((Date.now() - new Date(s.submitted_at).getTime()) / 60000);
      return {
        id:        s.id,
        athlete:   profile?.username ?? 'Inconnu',
        wod:       tw?.title ?? '—',
        value:     s.score_value,
        level:     profile?.level ?? 'rx',
        hasVideo:  !!s.video_url,
        submitted: mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)}h ago`,
      };
    });
    setPendingScores(mapped);
    setLoadingScores(false);
  }, []);

  useEffect(() => { loadScores(); }, [loadScores]);

  async function handleValidate(id: string) {
    Alert.alert('Valider le score', 'Confirmer la validation de ce score ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Valider', onPress: async () => {
          await supabase.from('tournament_scores').update({ status: 'approved' }).eq('id', id);
          setPendingScores(prev => prev.filter(s => s.id !== id));
        },
      },
    ]);
  }

  async function handleReject(id: string) {
    Alert.alert('Rejeter le score', "Rejeter ce score ? L'athlète devra soumettre à nouveau.", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Rejeter', style: 'destructive', onPress: async () => {
          await supabase.from('tournament_scores').update({ status: 'rejected' }).eq('id', id);
          setPendingScores(prev => prev.filter(s => s.id !== id));
        },
      },
    ]);
  }

  return (
    <View style={S.container}>
      <LinearGradient colors={mode === 'dark' ? ['#12121A', '#0A0A0F'] : [theme.accent, theme.accentDark ?? theme.accent]} style={S.header}>
        <View style={S.headerRow}>
          <View style={S.adminBadge}>
            <Shield color="#fff" size={20} />
            <Text style={S.adminBadgeText}>ADMIN</Text>
          </View>
          <TouchableOpacity onPress={signOut}>
            <LogOut color="rgba(255,255,255,0.7)" size={20} />
          </TouchableOpacity>
        </View>
        <Text style={S.headerTitle}>Panneau Admin</Text>
        <Text style={S.headerSub}>Bonjour, {user?.username}</Text>

        <View style={S.statsRow}>
          <View style={S.adminStat}>
            <Text style={S.adminStatValue}>{pendingScores.length}</Text>
            <Text style={S.adminStatLabel}>En attente</Text>
          </View>
          <View style={S.adminStat}>
            <Text style={S.adminStatValue}>2</Text>
            <Text style={S.adminStatLabel}>Matchs actifs</Text>
          </View>
          <View style={S.adminStat}>
            <Text style={S.adminStatValue}>3</Text>
            <Text style={S.adminStatLabel}>Tournois ouverts</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={S.tabs}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(i)}
            style={[S.tab, activeTab === i && S.tabActive]}
          >
            <Text style={[S.tabText, activeTab === i && S.tabTextActive]}>{tab}</Text>
            {i === 0 && pendingScores.length > 0 && (
              <View style={S.badge}>
                <Text style={S.badgeText}>{pendingScores.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {activeTab === 0 && (
          <>
            {loadingScores ? (
              <View style={S.emptyState}>
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            ) : pendingScores.length === 0 ? (
              <View style={S.emptyState}>
                <CheckCircle color={theme.success} size={48} />
                <Text style={S.emptyTitle}>Tout est validé !</Text>
                <Text style={S.emptySub}>Aucun score en attente.</Text>
              </View>
            ) : (
              pendingScores.map(score => (
                <View key={score.id} style={S.scoreCard}>
                  <View style={S.scoreHeader}>
                    <View style={S.athleteRow}>
                      <View style={S.avatar}>
                        <Text style={S.avatarText}>{score.athlete[0]}</Text>
                      </View>
                      <View>
                        <Text style={S.athleteName}>{score.athlete}</Text>
                        <View style={[S.levelPill, { backgroundColor: `${LevelColors[score.level]}20` }]}>
                          <Text style={[S.levelPillText, { color: LevelColors[score.level] }]}>
                            {score.level.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={S.timeBadge}>
                      <Clock color={theme.textMuted} size={12} />
                      <Text style={S.timeText}>{score.submitted}</Text>
                    </View>
                  </View>

                  <View style={S.scoreInfo}>
                    <Text style={S.scoreWod}>{score.wod}</Text>
                    <Text style={S.scoreValue}>{score.value}</Text>
                  </View>

                  <View style={S.videoRow}>
                    {score.hasVideo ? (
                      <TouchableOpacity style={S.videoButton}>
                        <Video color={theme.accent} size={16} />
                        <Text style={S.videoButtonText}>Voir la vidéo</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={S.noVideo}>
                        <Text style={S.noVideoText}>⚠️ Pas de vidéo</Text>
                      </View>
                    )}
                  </View>

                  <View style={S.actionRow}>
                    <TouchableOpacity
                      onPress={() => handleReject(score.id)}
                      style={S.rejectButton}
                    >
                      <XCircle color={theme.error} size={18} />
                      <Text style={S.rejectText}>Rejeter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleValidate(score.id)}
                      activeOpacity={0.8}
                      style={{ flex: 1 }}
                    >
                      <LinearGradient colors={[theme.success, '#00E676']} style={S.validateButton}>
                        <CheckCircle color="#fff" size={18} />
                        <Text style={S.validateText}>Valider</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 1 && (
          <>
            {([] as any[]).map(match => (
              <View key={match.id} style={S.matchCard}>
                <Text style={S.matchTitle}>{match.wod}</Text>
                <View style={S.matchAthletes}>
                  <Text style={S.matchAthlete}>{match.a1}</Text>
                  <View style={S.vsBox}>
                    <Text style={S.vsText}>VS</Text>
                  </View>
                  <Text style={S.matchAthlete}>{match.a2}</Text>
                </View>
                <View style={[
                  S.matchStatus,
                  { backgroundColor: match.status === 'both_submitted' ? `${theme.success}20` : `${theme.warning}20` },
                ]}>
                  <Text style={[
                    S.matchStatusText,
                    { color: match.status === 'both_submitted' ? theme.success : theme.warning },
                  ]}>
                    {match.status === 'both_submitted' ? '✓ Les 2 scores soumis — À valider' : '⏳ En attente de scores'}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {activeTab === 2 && (
          <View style={S.emptyState}>
            <Trophy color={theme.gold} size={48} />
            <Text style={S.emptyTitle}>Gestion tournois</Text>
            <Text style={S.emptySub}>Fonctionnalité complète disponible prochainement.</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  adminBadgeText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10 },
  adminStat: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  adminStatValue: { fontSize: 22, fontWeight: '900', color: '#fff' },
  adminStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginTop: 2 },
  tabs: {
    flexDirection: 'row', backgroundColor: theme.card,
    marginHorizontal: 16, marginTop: 12, borderRadius: 14,
    padding: 4, borderWidth: 1, borderColor: theme.cardBorder,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabActive: { backgroundColor: theme.accent },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
  tabTextActive: { color: '#fff' },
  badge: {
    backgroundColor: theme.error, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '900' },
  content: { padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
  emptySub: { fontSize: 13, color: theme.textMuted },
  scoreCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: theme.cardBorder,
  },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  athleteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: theme.text },
  athleteName: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 4 },
  levelPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  levelPillText: { fontSize: 10, fontWeight: '700' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 11, color: theme.textMuted },
  scoreInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scoreWod: { fontSize: 14, color: theme.textSecondary },
  scoreValue: { fontSize: 18, fontWeight: '900', color: theme.accent },
  videoRow: { marginBottom: 12 },
  videoButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${theme.accent}15`, borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  videoButtonText: { fontSize: 13, color: theme.accent, fontWeight: '600' },
  noVideo: {
    backgroundColor: `${theme.warning}15`, borderRadius: 10, padding: 10,
  },
  noVideoText: { fontSize: 12, color: theme.warning, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10 },
  rejectButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${theme.error}15`, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: `${theme.error}30`,
  },
  rejectText: { color: theme.error, fontWeight: '700', fontSize: 14 },
  validateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, padding: 12,
  },
  validateText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  matchCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: theme.cardBorder,
  },
  matchTitle: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 12 },
  matchAthletes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  matchAthlete: { fontSize: 15, fontWeight: '800', color: theme.text },
  vsBox: {
    backgroundColor: theme.accent, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  vsText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  matchStatus: { borderRadius: 10, padding: 10 },
  matchStatusText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
}); }
