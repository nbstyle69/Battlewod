import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, CheckCircle, XCircle, Video, Clock, Users, Trophy, LogOut, Youtube, AlertTriangle, Zap, Plus, Trash2, Megaphone } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { formatScoreValue } from '../../utils/scoreFormat';

const TABS = ['Scores', 'Matchs', 'Tournois', 'Daily WOD', 'Changelog'];

interface ChangelogItem {
  id: string;
  title: string;
  body: string;
  type: 'fix' | 'feature' | 'update';
  created_at: string;
}

const CL_TYPES: { key: 'fix' | 'feature' | 'update'; label: string; icon: string }[] = [
  { key: 'feature', label: 'Nouveauté', icon: '✨' },
  { key: 'fix',     label: 'Correction', icon: '🐛' },
  { key: 'update',  label: 'Mise à jour', icon: '🔄' },
];

interface PendingScore {
  id: string;
  athlete: string;
  wod: string;
  value: string;
  level: string;
  hasVideo: boolean;
  submitted: string;
}

interface ContestedDaily {
  id: string;
  tournament_id: string;
  tournament_name: string;
  athlete: string;
  athlete_id: string;
  score_value: number;
  score_mode: string;
  rx: boolean;
  video_url: string | null;
  contest_reason: string | null;
  contested_by_name: string;
  submitted_at: string;
}

export default function AdminScreen() {
  const { user, signOut } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);
  const [activeTab, setActiveTab]     = useState(0);
  const [pendingScores, setPendingScores] = useState<PendingScore[]>([]);
  const [loadingScores, setLoadingScores] = useState(true);
  const [contestedDailies, setContestedDailies] = useState<ContestedDaily[]>([]);
  const [loadingDailies, setLoadingDailies] = useState(true);
  // Changelog
  const [changelogItems, setChangelogItems] = useState<ChangelogItem[]>([]);
  const [loadingChangelog, setLoadingChangelog] = useState(true);
  const [clModal, setClModal]     = useState(false);
  const [clTitle, setClTitle]     = useState('');
  const [clBody, setClBody]       = useState('');
  const [clType, setClType]       = useState<'fix' | 'feature' | 'update'>('feature');
  const [clSaving, setClSaving]   = useState(false);

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

  const loadDailies = useCallback(async () => {
    setLoadingDailies(true);
    const { data } = await supabase
      .from('daily_tournament_scores')
      .select('*, tournament:daily_tournaments(wod_name, score_mode), profile:profiles!daily_tournament_scores_user_id_profiles_fkey(username), contester:profiles!daily_tournament_scores_contested_by_fkey(username)')
      .eq('status', 'contested')
      .order('submitted_at', { ascending: false });

    const mapped: ContestedDaily[] = (data ?? []).map((s: any) => {
      const tournament = Array.isArray(s.tournament) ? s.tournament[0] : s.tournament;
      const profile = Array.isArray(s.profile) ? s.profile[0] : s.profile;
      const contester = Array.isArray(s.contester) ? s.contester[0] : s.contester;
      return {
        id: s.id,
        tournament_id: s.tournament_id,
        tournament_name: tournament?.wod_name ?? '—',
        athlete: profile?.username ?? 'Inconnu',
        athlete_id: s.user_id,
        score_value: s.score_value,
        score_mode: tournament?.score_mode ?? 'time',
        rx: s.rx,
        video_url: s.video_url,
        contest_reason: s.contest_reason,
        contested_by_name: contester?.username ?? 'Inconnu',
        submitted_at: s.submitted_at,
      };
    });
    setContestedDailies(mapped);
    setLoadingDailies(false);
  }, []);

  const loadChangelog = useCallback(async () => {
    setLoadingChangelog(true);
    const { data } = await supabase
      .from('app_changelog')
      .select('id, title, body, type, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    setChangelogItems((data ?? []) as ChangelogItem[]);
    setLoadingChangelog(false);
  }, []);

  useEffect(() => { loadScores(); loadDailies(); loadChangelog(); }, [loadScores, loadDailies, loadChangelog]);

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

  async function handleDailyValidate(item: ContestedDaily) {
    Alert.alert('Valider le score', `Confirmer la validation du score de ${item.athlete} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Valider', onPress: async () => {
          await supabase.from('daily_tournament_scores')
            .update({ status: 'validated' })
            .eq('tournament_id', item.tournament_id)
            .eq('user_id', item.athlete_id);
          setContestedDailies(prev => prev.filter(d => d.id !== item.id));
        },
      },
    ]);
  }

  async function handleCreateChangelog() {
    if (!clTitle.trim()) { Alert.alert('Titre requis'); return; }
    setClSaving(true);
    const { error } = await supabase.from('app_changelog').insert({
      title: clTitle.trim(),
      body: clBody.trim(),
      type: clType,
      created_by: user?.id,
    });
    setClSaving(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setClModal(false);
    setClTitle('');
    setClBody('');
    setClType('feature');
    loadChangelog();
  }

  async function handleDeleteChangelog(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette entrée changelog ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          await supabase.from('app_changelog').delete().eq('id', id);
          setChangelogItems(prev => prev.filter(c => c.id !== id));
        },
      },
    ]);
  }

  async function handleDailyReject(item: ContestedDaily) {
    Alert.alert('Rejeter le score', `Rejeter le score de ${item.athlete} et le supprimer ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Rejeter', style: 'destructive', onPress: async () => {
          await supabase.from('daily_tournament_scores')
            .delete()
            .eq('tournament_id', item.tournament_id)
            .eq('user_id', item.athlete_id);
          setContestedDailies(prev => prev.filter(d => d.id !== item.id));
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

        {activeTab === 3 && (
          <>
            {loadingDailies ? (
              <View style={S.emptyState}>
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            ) : contestedDailies.length === 0 ? (
              <View style={S.emptyState}>
                <CheckCircle color={theme.success} size={48} />
                <Text style={S.emptyTitle}>Aucune contestation</Text>
                <Text style={S.emptySub}>Tous les scores Daily WOD sont validés.</Text>
              </View>
            ) : (
              contestedDailies.map(item => (
                <View key={item.id} style={S.scoreCard}>
                  <View style={S.scoreHeader}>
                    <View style={S.athleteRow}>
                      <View style={[S.avatar, { backgroundColor: `${theme.error}20` }]}>
                        <AlertTriangle color={theme.error} size={18} />
                      </View>
                      <View>
                        <Text style={S.athleteName}>{item.athlete}</Text>
                        <Text style={S.dailyTournamentName}>{item.tournament_name}</Text>
                      </View>
                    </View>
                    <View style={S.contestedBadge}>
                      <Text style={S.contestedBadgeText}>CONTESTÉ</Text>
                    </View>
                  </View>

                  <View style={S.scoreInfo}>
                    <View>
                      <Text style={S.scoreWod}>Score soumis</Text>
                      <Text style={S.dailyScoreDetail}>{item.rx ? 'RX' : 'Scaled'}</Text>
                    </View>
                    <Text style={S.scoreValue}>{formatScoreValue(item.score_value, item.score_mode)}</Text>
                  </View>

                  {item.contest_reason ? (
                    <View style={S.contestReasonBox}>
                      <AlertTriangle color={theme.warning} size={14} />
                      <View style={{ flex: 1 }}>
                        <Text style={S.contestReasonLabel}>Raison ({item.contested_by_name}) :</Text>
                        <Text style={S.contestReasonText}>{item.contest_reason}</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={S.videoRow}>
                    {item.video_url ? (
                      <TouchableOpacity style={S.videoButton} onPress={() => Linking.openURL(item.video_url!)}>
                        <Youtube color="#FF0000" size={16} />
                        <Text style={[S.videoButtonText, { color: '#FF0000' }]}>Voir la vidéo</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={S.noVideo}>
                        <Text style={S.noVideoText}>⚠️ Pas de vidéo soumise</Text>
                      </View>
                    )}
                  </View>

                  <View style={S.actionRow}>
                    <TouchableOpacity onPress={() => handleDailyReject(item)} style={S.rejectButton}>
                      <XCircle color={theme.error} size={18} />
                      <Text style={S.rejectText}>Rejeter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDailyValidate(item)} activeOpacity={0.8} style={{ flex: 1 }}>
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

        {activeTab === 4 && (
          <>
            <TouchableOpacity
              style={[S.validateButton, { marginBottom: 16, alignSelf: 'stretch' }]}
              onPress={() => setClModal(true)}
              activeOpacity={0.8}
            >
              <Plus color="#fff" size={18} />
              <Text style={S.validateText}>Nouvelle entrée</Text>
            </TouchableOpacity>

            {loadingChangelog ? (
              <View style={S.emptyState}>
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            ) : changelogItems.length === 0 ? (
              <View style={S.emptyState}>
                <Megaphone color={theme.textMuted} size={48} />
                <Text style={S.emptyTitle}>Aucune entrée</Text>
                <Text style={S.emptySub}>Publie une nouveauté pour tes utilisateurs.</Text>
              </View>
            ) : (
              changelogItems.map(item => {
                const meta = CL_TYPES.find(t => t.key === item.type) ?? CL_TYPES[2];
                return (
                  <View key={item.id} style={S.scoreCard}>
                    <View style={S.scoreHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: theme.textMuted }}>
                          {meta.icon} {meta.label} · {new Date(item.created_at).toLocaleDateString('fr-FR')}
                        </Text>
                        <Text style={[S.athleteName, { marginTop: 4 }]}>{item.title}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteChangelog(item.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Trash2 color={theme.error} size={18} />
                      </TouchableOpacity>
                    </View>
                    {item.body ? <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6 }}>{item.body}</Text> : null}
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Changelog create modal */}
      <Modal visible={clModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.modalOverlay}>
          <View style={S.modalCard}>
            <Text style={S.modalTitle}>Nouvelle entrée changelog</Text>

            <View style={S.clTypeRow}>
              {CL_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setClType(t.key)}
                  style={[S.clTypeBtn, clType === t.key && { backgroundColor: theme.accent }]}
                >
                  <Text style={[S.clTypeBtnText, clType === t.key && { color: '#fff' }]}>
                    {t.icon} {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={S.clInput}
              placeholder="Titre"
              placeholderTextColor={theme.textMuted}
              value={clTitle}
              onChangeText={setClTitle}
            />
            <TextInput
              style={[S.clInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Description (optionnel)"
              placeholderTextColor={theme.textMuted}
              value={clBody}
              onChangeText={setClBody}
              multiline
            />

            <View style={S.actionRow}>
              <TouchableOpacity onPress={() => setClModal(false)} style={S.rejectButton}>
                <Text style={S.rejectText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateChangelog} activeOpacity={0.8} style={{ flex: 1 }}>
                <LinearGradient colors={[theme.accent, theme.accentDark ?? theme.accent]} style={S.validateButton}>
                  {clSaving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <><Plus color="#fff" size={18} /><Text style={S.validateText}>Publier</Text></>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  // Daily WOD tab
  dailyTournamentName: { fontSize: 11, color: theme.textMuted, fontWeight: '600', marginTop: 1 },
  dailyScoreDetail: { fontSize: 11, color: theme.textMuted, fontWeight: '600', marginTop: 2 },
  contestedBadge: {
    backgroundColor: `${theme.error}15`, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: `${theme.error}30`,
  },
  contestedBadgeText: { fontSize: 10, fontWeight: '900', color: theme.error, letterSpacing: 0.5 },
  contestReasonBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: `${theme.warning}10`, borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: `${theme.warning}20`,
  },
  contestReasonLabel: { fontSize: 11, fontWeight: '800', color: theme.warning, marginBottom: 2 },
  contestReasonText: { fontSize: 13, color: theme.text, fontWeight: '600' },
  // Changelog modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: {
    backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 16 },
  clTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  clTypeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  clTypeBtnText: { fontSize: 12, fontWeight: '700', color: theme.text },
  clInput: {
    backgroundColor: theme.surface, borderRadius: 12, padding: 14,
    fontSize: 15, color: theme.text, marginBottom: 12,
    borderWidth: 1, borderColor: theme.border,
  },
}); }
