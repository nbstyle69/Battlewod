import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Users, Calendar, Zap, CheckCircle,
  Lock, Clock, Timer,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';
import { AthleteLevel } from '../../types';
import { CompetitionStackParamList } from '../../navigation';
import {
  TournamentWOD, TournamentScore,
  MOVEMENT_BADGE_LEVELS, formatDate,
} from '../../utils/tournamentUtils';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'Tournament'>;
type Route = RouteProp<CompetitionStackParamList, 'Tournament'>;

function wodStatusColor(status: string) {
  if (status === 'active')  return Colors.success;
  if (status === 'closed')  return Colors.textMuted;
  return Colors.warning;
}
function wodStatusLabel(status: string) {
  if (status === 'active')  return 'En cours';
  if (status === 'closed')  return 'Terminé';
  return 'À venir';
}

export default function TournamentScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { tournamentId } = route.params;
  const { user } = useAuth();

  const [activeTab,    setActiveTab]    = useState<'infos' | 'wods' | 'scores'>('infos');
  const [tournament,   setTournament]   = useState<any>(null);
  const [wods,         setWods]         = useState<TournamentWOD[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [myScores,     setMyScores]     = useState<TournamentScore[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [registering,  setRegistering]  = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  const load = useCallback(async () => {
    const [{ data: t }, { data: tw }, { data: tp }, { data: ms }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
      supabase.from('tournament_wods').select('*').eq('tournament_id', tournamentId).order('order_index'),
      supabase.from('tournament_participants')
        .select('athlete_id, score, profile:profiles(id, username, elo, level)')
        .eq('tournament_id', tournamentId)
        .order('score', { ascending: false }),
      user ? supabase.from('tournament_scores')
        .select('*').eq('tournament_id', tournamentId).eq('athlete_id', user.id) : { data: [] },
    ]);
    setTournament(t);
    setWods((tw ?? []) as TournamentWOD[]);
    setParticipants(tp ?? []);
    setMyScores((ms ?? []) as TournamentScore[]);
    if (user) setIsRegistered((tp ?? []).some((p: any) => p.athlete_id === user.id));
    setLoading(false);
    setRefreshing(false);
  }, [tournamentId, user]);

  useEffect(() => { load(); }, [load]);

  async function handleRegister() {
    if (!user) return;
    setRegistering(true);
    const { error } = await supabase.from('tournament_participants')
      .insert({ tournament_id: tournamentId, athlete_id: user.id, score: 0 });
    setRegistering(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    Alert.alert('✅ Inscrit !', 'Tu es maintenant inscrit(e) à ce tournoi.');
    load();
  }

  function goToWOD(wod: TournamentWOD) {
    const existing = myScores.find(s => s.tournament_wod_id === wod.id) ?? null;
    (navigation as any).navigate('TournamentWOD', {
      tournamentId,
      tournamentName: tournament?.name ?? '',
      wod,
      existingScore: existing ? {
        tournament_wod_id: existing.tournament_wod_id,
        score_value: existing.score_value,
        video_url: existing.video_url,
        status: existing.status,
      } : null,
    });
  }

  if (loading) return (
    <View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.primary} /></View>
  );
  if (!tournament) return (
    <View style={styles.loadingContainer}><Text style={styles.errorText}>Tournoi introuvable.</Text></View>
  );

  const levelColor  = LevelColors[tournament.level as AthleteLevel] ?? Colors.primary;
  const isFull      = participants.length >= tournament.max_participants;
  const canRegister = tournament.status === 'open' && !isRegistered && !isFull;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft color={Colors.textSecondary} size={24} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <View style={styles.headerMeta}>
            <View style={[styles.levelBadge, { backgroundColor: `${levelColor}20` }]}>
              <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                {(tournament.level ?? 'RX').toUpperCase()}
              </Text>
            </View>
            <View style={[styles.statusBadge, {
              backgroundColor: tournament.status === 'open' ? `${Colors.success}20`
                : tournament.status === 'active' ? `${Colors.primary}20` : `${Colors.textMuted}20`,
            }]}>
              <Text style={[styles.statusBadgeText, {
                color: tournament.status === 'open' ? Colors.success
                  : tournament.status === 'active' ? Colors.primary : Colors.textMuted,
              }]}>
                {tournament.status === 'open' ? 'Inscriptions' : tournament.status === 'active' ? 'En cours' : 'Terminé'}
              </Text>
            </View>
          </View>
          <View style={styles.headerStats}>
            <View style={styles.metaItem}>
              <Users color={Colors.textMuted} size={13} />
              <Text style={styles.metaText}>{participants.length}/{tournament.max_participants}</Text>
            </View>
            {tournament.start_date && (
              <View style={styles.metaItem}>
                <Calendar color={Colors.textMuted} size={13} />
                <Text style={styles.metaText}>{formatDate(tournament.start_date)}</Text>
              </View>
            )}
            {tournament.prize ? <Text style={styles.prize}>{tournament.prize}</Text> : null}
          </View>
        </View>
      </LinearGradient>

      {/* ── Tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {(['infos', 'wods', 'scores'] as const).map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'infos' ? 'Infos' : tab === 'wods' ? `WODs (${wods.length})` : 'Classement'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        {/* ══ INFOS ══ */}
        {activeTab === 'infos' && (
          <>
            {tournament.description ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>À PROPOS</Text>
                <Text style={styles.descText}>{tournament.description}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>RÈGLEMENT</Text>
              {['📹 Chaque WOD doit être filmé intégralement',
                '⏱ Score à soumettre dans les 24h après le WOD',
                '🔗 Lien YouTube requis pour valider le score',
                '⚖️ Validation par un admin avant publication',
                '🏆 Classement mis à jour après chaque validation',
                '⚡ ELO distribué à la clôture du tournoi',
              ].map((rule, i) => (
                <Text key={i} style={styles.ruleText}>{rule}</Text>
              ))}
            </View>

            {canRegister && (
              <TouchableOpacity style={styles.registerBtn} onPress={handleRegister}
                disabled={registering} activeOpacity={0.85}>
                <LinearGradient
                  colors={registering ? [Colors.surface, Colors.surface] : [Colors.primary, Colors.secondary]}
                  style={styles.registerBtnInner}>
                  {registering
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Zap color="#fff" size={18} /><Text style={styles.registerBtnText}>S'inscrire au tournoi</Text></>}
                </LinearGradient>
              </TouchableOpacity>
            )}
            {isRegistered && (
              <View style={styles.registeredBadge}>
                <CheckCircle color={Colors.success} size={20} />
                <Text style={styles.registeredText}>Tu es inscrit(e) à ce tournoi !</Text>
              </View>
            )}
            {isFull && !isRegistered && (
              <View style={[styles.registeredBadge, { backgroundColor: `${Colors.error}15`, borderColor: `${Colors.error}30` }]}>
                <Lock color={Colors.error} size={18} />
                <Text style={[styles.registeredText, { color: Colors.error }]}>Tournoi complet</Text>
              </View>
            )}
          </>
        )}

        {/* ══ WODS ══ */}
        {activeTab === 'wods' && (
          <>
            {wods.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏋️</Text>
                <Text style={styles.emptyTitle}>WODs à venir</Text>
                <Text style={styles.emptyText}>Les WODs seront publiés prochainement.</Text>
              </View>
            ) : wods.map((wod, i) => {
              const myScore = myScores.find(s => s.tournament_wod_id === wod.id);
              const canDo   = isRegistered && wod.status === 'active' && !myScore;
              return (
                <View key={wod.id} style={[styles.wodCard,
                  myScore && styles.wodCardDone,
                  wod.status === 'closed' && styles.wodCardClosed]}>
                  <View style={styles.wodCardHeader}>
                    <View style={styles.wodIndexBadge}><Text style={styles.wodIndexText}>WOD {i + 1}</Text></View>
                    <View style={styles.wodTypeBadge}><Text style={styles.wodTypeText}>{wod.type}</Text></View>
                    <View style={styles.wodDurationRow}>
                      <Clock color={Colors.textMuted} size={12} />
                      <Text style={styles.wodDurationText}>{wod.duration_minutes} min</Text>
                    </View>
                    <View style={[styles.wodStatusPill, { backgroundColor: `${wodStatusColor(wod.status)}15` }]}>
                      <Text style={[styles.wodStatusText, { color: wodStatusColor(wod.status) }]}>
                        {wodStatusLabel(wod.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.wodTitle}>{wod.title}</Text>
                  {wod.description ? <Text style={styles.wodDesc}>{wod.description}</Text> : null}
                  {Array.isArray(wod.movements) && wod.movements.length > 0 && (
                    <View style={styles.movementsBox}>
                      {wod.movements.map((m, mi) => (
                        <Text key={mi} style={styles.movementLine}>• {m}</Text>
                      ))}
                    </View>
                  )}
                  <View style={styles.wodScoringRow}>
                    <Zap color={Colors.gold} size={13} />
                    <Text style={styles.wodScoringText}>{wod.scoring}</Text>
                  </View>
                  {wod.status === 'active' && (
                    <View style={styles.deadlineRow}>
                      <Clock color={Colors.warning} size={13} />
                      <Text style={styles.deadlineText}>Délai de soumission : {wod.deadline_hours}h</Text>
                    </View>
                  )}
                  {myScore && (
                    <View style={styles.myScoreBadge}>
                      <CheckCircle color={Colors.success} size={16} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.myScoreValue}>Score soumis : {myScore.score_value}</Text>
                        <Text style={styles.myScoreStatus}>
                          {myScore.status === 'pending' ? '⏳ En attente de validation'
                            : myScore.status === 'validated' ? '✅ Validé' : '❌ Rejeté'}
                        </Text>
                      </View>
                    </View>
                  )}
                  {canDo && (
                    <TouchableOpacity style={styles.wodActionBtn} onPress={() => goToWOD(wod)} activeOpacity={0.85}>
                      <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.wodActionBtnInner}>
                        <Timer color="#fff" size={16} />
                        <Text style={styles.wodActionBtnText}>Lancer le WOD</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                  {!isRegistered && wod.status === 'active' && (
                    <TouchableOpacity style={styles.wodLockedBtn} onPress={() => setActiveTab('infos')} activeOpacity={0.8}>
                      <Lock color={Colors.textMuted} size={14} />
                      <Text style={styles.wodLockedText}>Inscription requise</Text>
                    </TouchableOpacity>
                  )}
                  {myScore?.status === 'rejected' && (
                    <TouchableOpacity style={styles.wodActionBtn} onPress={() => goToWOD(wod)} activeOpacity={0.85}>
                      <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.wodActionBtnInner}>
                        <Timer color="#fff" size={16} />
                        <Text style={styles.wodActionBtnText}>Soumettre à nouveau</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ══ CLASSEMENT ══ */}
        {activeTab === 'scores' && (
          <>
            {participants.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏆</Text>
                <Text style={styles.emptyTitle}>Classement vide</Text>
                <Text style={styles.emptyText}>Les scores apparaîtront ici dès les premières validations.</Text>
              </View>
            ) : participants.map((p: any, i: number) => {
              const isMe = user?.id === p.athlete_id;
              return (
                <View key={p.athlete_id} style={[styles.rankRow, isMe && styles.rankRowMe]}>
                  <View style={styles.rankBadge}>
                    {i === 0 ? <Text style={styles.rankEmoji}>�</Text>
                      : i === 1 ? <Text style={styles.rankEmoji}>🥈</Text>
                      : i === 2 ? <Text style={styles.rankEmoji}>🥉</Text>
                      : <Text style={styles.rankNumber}>#{i + 1}</Text>}
                  </View>
                  <View style={styles.rankAvatar}>
                    <Text style={styles.rankAvatarText}>
                      {(p.profile?.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={[styles.rankName, isMe && { color: Colors.primary }]}>
                      {p.profile?.username ?? '?'}{isMe ? ' (toi)' : ''}
                    </Text>
                    <Text style={styles.rankElo}>ELO {p.profile?.elo ?? 1000}</Text>
                  </View>
                  <Text style={styles.rankScore}>{p.score ?? 0} pts</Text>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  errorText:        { fontSize: 14, color: Colors.textMuted },
  header:      { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20, flexDirection: 'row', gap: 12 },
  back:        { paddingTop: 4 },
  headerInfo:  { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 8 },
  headerMeta:  { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  levelBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  levelBadgeText:  { fontSize: 11, fontWeight: '700' },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  metaItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:    { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  prize:       { fontSize: 13, color: Colors.gold, fontWeight: '700' },

  tabsScroll:  { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabsContent: { flexDirection: 'row', paddingHorizontal: 8 },
  tab:           { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: Colors.primary },
  tabText:       { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  content: { padding: 16, paddingTop: 14 },

  card:      { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.cardBorder, gap: 8, marginBottom: 14 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.5 },
  descText:  { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  ruleText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },

  registerBtn:      { marginBottom: 12 },
  registerBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, padding: 18 },
  registerBtnText:  { color: '#fff', fontSize: 16, fontWeight: '900' },
  registeredBadge:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${Colors.success}15`, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${Colors.success}30`, marginBottom: 12 },
  registeredText:   { fontSize: 14, fontWeight: '700', color: Colors.success },

  emptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },
  emptyText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  wodCard:       { backgroundColor: Colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.cardBorder, gap: 10, marginBottom: 14 },
  wodCardDone:   { borderColor: `${Colors.success}40` },
  wodCardClosed: { opacity: 0.7 },
  wodCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  wodIndexBadge: { backgroundColor: `${Colors.primary}15`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  wodIndexText:  { fontSize: 11, fontWeight: '800', color: Colors.primary },
  wodTypeBadge:  { backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  wodTypeText:   { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  wodDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wodDurationText:{ fontSize: 11, color: Colors.textMuted },
  wodStatusPill:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  wodStatusText:  { fontSize: 10, fontWeight: '700' },
  wodTitle:      { fontSize: 17, fontWeight: '900', color: Colors.text },
  wodDesc:       { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  movementsBox:  { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, gap: 3 },
  movementLine:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  wodScoringRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wodScoringText:{ fontSize: 12, color: Colors.gold, fontWeight: '600' },
  deadlineRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deadlineText:  { fontSize: 12, color: Colors.warning, fontWeight: '600' },
  myScoreBadge:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: `${Colors.success}10`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${Colors.success}25` },
  myScoreValue:  { fontSize: 14, fontWeight: '800', color: Colors.success },
  myScoreStatus: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  wodActionBtn:      { marginTop: 4 },
  wodActionBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  wodActionBtnText:  { color: '#fff', fontSize: 14, fontWeight: '900' },
  wodLockedBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  wodLockedText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  rankRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.cardBorder },
  rankRowMe:    { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  rankBadge:    { width: 36, alignItems: 'center' },
  rankEmoji:    { fontSize: 22 },
  rankNumber:   { fontSize: 15, fontWeight: '800', color: Colors.textSecondary },
  rankAvatar:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  rankAvatarText:{ fontSize: 16, fontWeight: '800', color: Colors.text },
  rankInfo:     { flex: 1 },
  rankName:     { fontSize: 14, fontWeight: '800', color: Colors.text },
  rankElo:      { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  rankScore:    { fontSize: 16, fontWeight: '900', color: Colors.primary },
});
