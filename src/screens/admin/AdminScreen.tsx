import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, CheckCircle, XCircle, Video, Clock, Users, Trophy, LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';
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
    <View style={styles.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.adminBadge}>
            <Shield color={Colors.primary} size={20} />
            <Text style={styles.adminBadgeText}>ADMIN</Text>
          </View>
          <TouchableOpacity onPress={signOut}>
            <LogOut color={Colors.textMuted} size={20} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Panneau Admin</Text>
        <Text style={styles.headerSub}>Bonjour, {user?.username}</Text>

        <View style={styles.statsRow}>
          <View style={styles.adminStat}>
            <Text style={styles.adminStatValue}>{pendingScores.length}</Text>
            <Text style={styles.adminStatLabel}>En attente</Text>
          </View>
          <View style={styles.adminStat}>
            <Text style={styles.adminStatValue}>2</Text>
            <Text style={styles.adminStatLabel}>Matchs actifs</Text>
          </View>
          <View style={styles.adminStat}>
            <Text style={styles.adminStatValue}>3</Text>
            <Text style={styles.adminStatLabel}>Tournois ouverts</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.tabs}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(i)}
            style={[styles.tab, activeTab === i && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{tab}</Text>
            {i === 0 && pendingScores.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingScores.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {activeTab === 0 && (
          <>
            {loadingScores ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : pendingScores.length === 0 ? (
              <View style={styles.emptyState}>
                <CheckCircle color={Colors.success} size={48} />
                <Text style={styles.emptyTitle}>Tout est validé !</Text>
                <Text style={styles.emptySub}>Aucun score en attente.</Text>
              </View>
            ) : (
              pendingScores.map(score => (
                <View key={score.id} style={styles.scoreCard}>
                  <View style={styles.scoreHeader}>
                    <View style={styles.athleteRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{score.athlete[0]}</Text>
                      </View>
                      <View>
                        <Text style={styles.athleteName}>{score.athlete}</Text>
                        <View style={[styles.levelPill, { backgroundColor: `${LevelColors[score.level]}20` }]}>
                          <Text style={[styles.levelPillText, { color: LevelColors[score.level] }]}>
                            {score.level.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.timeBadge}>
                      <Clock color={Colors.textMuted} size={12} />
                      <Text style={styles.timeText}>{score.submitted}</Text>
                    </View>
                  </View>

                  <View style={styles.scoreInfo}>
                    <Text style={styles.scoreWod}>{score.wod}</Text>
                    <Text style={styles.scoreValue}>{score.value}</Text>
                  </View>

                  <View style={styles.videoRow}>
                    {score.hasVideo ? (
                      <TouchableOpacity style={styles.videoButton}>
                        <Video color={Colors.primary} size={16} />
                        <Text style={styles.videoButtonText}>Voir la vidéo</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.noVideo}>
                        <Text style={styles.noVideoText}>⚠️ Pas de vidéo</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={() => handleReject(score.id)}
                      style={styles.rejectButton}
                    >
                      <XCircle color={Colors.error} size={18} />
                      <Text style={styles.rejectText}>Rejeter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleValidate(score.id)}
                      activeOpacity={0.8}
                      style={{ flex: 1 }}
                    >
                      <LinearGradient colors={[Colors.success, '#00E676']} style={styles.validateButton}>
                        <CheckCircle color="#fff" size={18} />
                        <Text style={styles.validateText}>Valider</Text>
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
              <View key={match.id} style={styles.matchCard}>
                <Text style={styles.matchTitle}>{match.wod}</Text>
                <View style={styles.matchAthletes}>
                  <Text style={styles.matchAthlete}>{match.a1}</Text>
                  <View style={styles.vsBox}>
                    <Text style={styles.vsText}>VS</Text>
                  </View>
                  <Text style={styles.matchAthlete}>{match.a2}</Text>
                </View>
                <View style={[
                  styles.matchStatus,
                  { backgroundColor: match.status === 'both_submitted' ? `${Colors.success}20` : `${Colors.warning}20` },
                ]}>
                  <Text style={[
                    styles.matchStatusText,
                    { color: match.status === 'both_submitted' ? Colors.success : Colors.warning },
                  ]}>
                    {match.status === 'both_submitted' ? '✓ Les 2 scores soumis — À valider' : '⏳ En attente de scores'}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {activeTab === 2 && (
          <View style={styles.emptyState}>
            <Trophy color={Colors.gold} size={48} />
            <Text style={styles.emptyTitle}>Gestion tournois</Text>
            <Text style={styles.emptySub}>Fonctionnalité complète disponible prochainement.</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.primary}20`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  adminBadgeText: { fontSize: 12, fontWeight: '900', color: Colors.primary, letterSpacing: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: Colors.text },
  headerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10 },
  adminStat: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 12,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.cardBorder,
  },
  adminStatValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  adminStatLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  tabs: {
    flexDirection: 'row', backgroundColor: Colors.card,
    marginHorizontal: 16, marginTop: 12, borderRadius: 14,
    padding: 4, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: '#fff' },
  badge: {
    backgroundColor: Colors.error, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '900' },
  content: { padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textMuted },
  scoreCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  athleteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: Colors.text },
  athleteName: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  levelPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  levelPillText: { fontSize: 10, fontWeight: '700' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 11, color: Colors.textMuted },
  scoreInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scoreWod: { fontSize: 14, color: Colors.textSecondary },
  scoreValue: { fontSize: 18, fontWeight: '900', color: Colors.primary },
  videoRow: { marginBottom: 12 },
  videoButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.primary}15`, borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: `${Colors.primary}30`,
  },
  videoButtonText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  noVideo: {
    backgroundColor: `${Colors.warning}15`, borderRadius: 10, padding: 10,
  },
  noVideoText: { fontSize: 12, color: Colors.warning, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10 },
  rejectButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${Colors.error}15`, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: `${Colors.error}30`,
  },
  rejectText: { color: Colors.error, fontWeight: '700', fontSize: 14 },
  validateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, padding: 12,
  },
  validateText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  matchCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  matchTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  matchAthletes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  matchAthlete: { fontSize: 15, fontWeight: '800', color: Colors.text },
  vsBox: {
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  vsText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  matchStatus: { borderRadius: 10, padding: 10 },
  matchStatusText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
