import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Users, Calendar, Zap, CheckCircle,
  Lock, Clock, Timer, UserX, Shield, Star,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { AthleteLevel } from '../../types';
import { CompetitionStackParamList } from '../../navigation';
import {
  TournamentWOD, TournamentScore,
  MOVEMENT_BADGE_LEVELS, formatDate,
} from '../../utils/tournamentUtils';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'Tournament'>;
type Route = RouteProp<CompetitionStackParamList, 'Tournament'>;

function wodStatusColor(status: string, theme: AppTheme) {
  if (status === 'active')  return theme.success;
  if (status === 'closed')  return theme.textMuted;
  return theme.warning;
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
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'box_owner';
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [activeTab,    setActiveTab]    = useState<'infos' | 'wods' | 'scores' | 'participants'>('infos');
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
        .select('athlete_id, score, created_at, profile:profiles(id, username, elo, level, box_members(box:boxes(name)))')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }),
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
    if (!user || isRegistered) return;
    setRegistering(true);
    const { error } = await supabase.from('tournament_participants')
      .upsert(
        { tournament_id: tournamentId, athlete_id: user.id, score: 0 },
        { onConflict: 'tournament_id,athlete_id', ignoreDuplicates: true },
      );
    setRegistering(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setIsRegistered(true);
    setParticipants(prev =>
      prev.some(p => p.athlete_id === user.id)
        ? prev
        : [...prev, { athlete_id: user.id, score: 0, created_at: new Date().toISOString() }]
    );
  }

  async function handleKick(athleteId: string, username: string) {
    if (!isAdmin) return;
    Alert.alert(
      'Exclure le participant',
      `Exclure ${username} du tournoi ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Exclure', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('tournament_participants')
            .delete()
            .eq('tournament_id', tournamentId)
            .eq('athlete_id', athleteId);
          if (error) { Alert.alert('Erreur', error.message); return; }
          load();
        }},
      ]
    );
  }

  async function handleLeave() {
    if (!user) return;
    Alert.alert(
      'Quitter le tournoi',
      'Es-tu sûr(e) de vouloir te désinscrire de ce tournoi ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('tournament_participants')
            .delete()
            .eq('tournament_id', tournamentId)
            .eq('athlete_id', user.id);
          if (error) { Alert.alert('Erreur', error.message); return; }
          setIsRegistered(false);
          load();
        }},
      ]
    );
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
    <View style={S.loadingContainer}><ActivityIndicator size="large" color={theme.accent} /></View>
  );
  if (!tournament) return (
    <View style={S.loadingContainer}><Text style={S.errorText}>Tournoi introuvable.</Text></View>
  );

  const levelColor  = LevelColors[tournament.level as AthleteLevel] ?? theme.accent;
  const isFull      = participants.length >= tournament.max_participants;
  const canRegister = tournament.status === 'open' && !isRegistered && !isFull;

  return (
    <View style={S.container}>
      {/* ── Header ── */}
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color="rgba(255,255,255,0.7)" size={24} />
        </TouchableOpacity>
        <View style={S.headerInfo}>
          <Text style={S.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <View style={S.headerMeta}>
            <View style={[S.levelBadge, { backgroundColor: `${levelColor}20` }]}>
              <Text style={[S.levelBadgeText, { color: levelColor }]}>
                {(tournament.level ?? 'RX').toUpperCase()}
              </Text>
            </View>
            <View style={[S.statusBadge, {
              backgroundColor: tournament.status === 'open' ? `${theme.success}20`
                : tournament.status === 'active' ? `${theme.accent}20` : `${theme.textMuted}20`,
            }]}>
              <Text style={[S.statusBadgeText, {
                color: tournament.status === 'open' ? theme.success
                  : tournament.status === 'active' ? theme.accent : theme.textMuted,
              }]}>
                {tournament.status === 'open' ? 'Inscriptions' : tournament.status === 'active' ? 'En cours' : 'Terminé'}
              </Text>
            </View>
          </View>
          <View style={S.headerStats}>
            <View style={S.metaItem}>
              <Users color="rgba(255,255,255,0.5)" size={13} />
              <Text style={S.metaText}>{participants.length}/{tournament.max_participants}</Text>
            </View>
            {tournament.start_date && (
              <View style={S.metaItem}>
                <Calendar color="rgba(255,255,255,0.5)" size={13} />
                <Text style={S.metaText}>{formatDate(tournament.start_date)}</Text>
              </View>
            )}
            {tournament.prize ? <Text style={S.prize}>{tournament.prize}</Text> : null}
          </View>
        </View>
      </LinearGradient>

      {/* ── Tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={S.tabsScroll} contentContainerStyle={S.tabsContent}>
        {(['infos', 'wods', 'participants', 'scores'] as const).map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={[S.tab, activeTab === tab && S.tabActive]}>
            <Text style={[S.tabText, activeTab === tab && S.tabTextActive]}>
              {tab === 'infos' ? 'Infos'
                : tab === 'wods' ? `WODs (${wods.length})`
                : tab === 'participants' ? `Participants (${participants.length})`
                : 'Classement'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        {/* ══ INFOS ══ */}
        {activeTab === 'infos' && (
          <>
            {tournament.description ? (
              <View style={S.card}>
                <Text style={S.cardLabel}>À PROPOS</Text>
                <Text style={S.descText}>{tournament.description}</Text>
              </View>
            ) : null}

            <View style={S.card}>
              <Text style={S.cardLabel}>RÈGLEMENT</Text>
              {['📹 Chaque WOD doit être filmé intégralement',
                '⏱ Score à soumettre dans les 24h après le WOD',
                '🔗 Lien YouTube requis pour valider le score',
                '⚖️ Validation par un admin avant publication',
                '🏆 Classement mis à jour après chaque validation',
                '⚡ ELO distribué à la clôture du tournoi',
              ].map((rule, i) => (
                <Text key={i} style={S.ruleText}>{rule}</Text>
              ))}
            </View>

            {canRegister && (
              <TouchableOpacity style={S.registerBtn} onPress={handleRegister}
                disabled={registering} activeOpacity={0.85}>
                <LinearGradient
                  colors={registering ? [theme.surface, theme.surface] : [theme.accent, theme.secondary ?? theme.accent]}
                  style={S.registerBtnInner}>
                  {registering
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Zap color="#fff" size={18} /><Text style={S.registerBtnText}>S'inscrire au tournoi</Text></>}
                </LinearGradient>
              </TouchableOpacity>
            )}
            {isRegistered && (
              <View style={S.registeredBlock}>
                <View style={S.registeredBadge}>
                  <CheckCircle color={theme.success} size={20} />
                  <Text style={S.registeredText}>Tu participes à ce tournoi ✓</Text>
                </View>
                {tournament.status === 'open' && (
                  <TouchableOpacity style={S.leaveBtn} onPress={handleLeave} activeOpacity={0.8}>
                    <Text style={S.leaveBtnText}>Se désinscrire</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {isFull && !isRegistered && (
              <View style={[S.registeredBadge, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}30` }]}>
                <Lock color={theme.error} size={18} />
                <Text style={[S.registeredText, { color: theme.error }]}>Tournoi complet</Text>
              </View>
            )}
          </>
        )}

        {/* ══ WODS ══ */}
        {activeTab === 'wods' && (
          <>
            {wods.length === 0 ? (
              <View style={S.emptyState}>
                <Text style={S.emptyEmoji}>🏋️</Text>
                <Text style={S.emptyTitle}>WODs à venir</Text>
                <Text style={S.emptyText}>Les WODs seront publiés prochainement.</Text>
              </View>
            ) : wods.map((wod, i) => {
              const myScore = myScores.find(s => s.tournament_wod_id === wod.id);
              const canDo   = isRegistered && wod.status === 'active' && !myScore;
              const statusColor = wodStatusColor(wod.status, theme);
              return (
                <View key={wod.id} style={[S.wodCard,
                  myScore && S.wodCardDone,
                  wod.status === 'closed' && S.wodCardClosed]}>
                  <View style={S.wodCardHeader}>
                    <View style={S.wodIndexBadge}><Text style={S.wodIndexText}>WOD {i + 1}</Text></View>
                    <View style={S.wodTypeBadge}><Text style={S.wodTypeText}>{wod.type}</Text></View>
                    <View style={S.wodDurationRow}>
                      <Clock color={theme.textMuted} size={12} />
                      <Text style={S.wodDurationText}>{wod.duration_minutes} min</Text>
                    </View>
                    <View style={[S.wodStatusPill, { backgroundColor: `${statusColor}15` }]}>
                      <Text style={[S.wodStatusText, { color: statusColor }]}>
                        {wodStatusLabel(wod.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={S.wodTitle}>{wod.title}</Text>
                  {wod.description ? <Text style={S.wodDesc}>{wod.description}</Text> : null}
                  {Array.isArray(wod.movements) && wod.movements.length > 0 && (
                    <View style={S.movementsBox}>
                      {wod.movements.map((m, mi) => (
                        <Text key={mi} style={S.movementLine}>• {m}</Text>
                      ))}
                    </View>
                  )}
                  <View style={S.wodScoringRow}>
                    <Zap color={theme.gold} size={13} />
                    <Text style={S.wodScoringText}>{wod.scoring}</Text>
                  </View>
                  {wod.status === 'active' && (
                    <View style={S.deadlineRow}>
                      <Clock color={theme.warning} size={13} />
                      <Text style={S.deadlineText}>Délai de soumission : {wod.deadline_hours}h</Text>
                    </View>
                  )}
                  {myScore && (
                    <View style={S.myScoreBadge}>
                      <CheckCircle color={theme.success} size={16} />
                      <View style={{ flex: 1 }}>
                        <Text style={S.myScoreValue}>Score soumis : {myScore.score_value}</Text>
                        <Text style={S.myScoreStatus}>
                          {myScore.status === 'pending' ? '⏳ En attente de validation'
                            : myScore.status === 'validated' ? '✅ Validé' : '❌ Rejeté'}
                        </Text>
                      </View>
                    </View>
                  )}
                  {canDo && (
                    <TouchableOpacity style={S.wodActionBtn} onPress={() => goToWOD(wod)} activeOpacity={0.85}>
                      <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.wodActionBtnInner}>
                        <Timer color="#fff" size={16} />
                        <Text style={S.wodActionBtnText}>Lancer le WOD</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                  {!isRegistered && wod.status === 'active' && (
                    <TouchableOpacity style={S.wodLockedBtn} onPress={() => setActiveTab('infos')} activeOpacity={0.8}>
                      <Lock color={theme.textMuted} size={14} />
                      <Text style={S.wodLockedText}>Inscription requise</Text>
                    </TouchableOpacity>
                  )}
                  {myScore?.status === 'rejected' && (
                    <TouchableOpacity style={S.wodActionBtn} onPress={() => goToWOD(wod)} activeOpacity={0.85}>
                      <LinearGradient colors={['#EF4444', '#DC2626']} style={S.wodActionBtnInner}>
                        <Timer color="#fff" size={16} />
                        <Text style={S.wodActionBtnText}>Soumettre à nouveau</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ══ PARTICIPANTS ══ */}
        {activeTab === 'participants' && (
          <>
            {isAdmin && (
              <View style={S.adminBanner}>
                <Shield color={theme.accent} size={14} />
                <Text style={S.adminBannerText}>Mode admin — tu peux exclure des participants</Text>
              </View>
            )}
            {participants.length === 0 ? (
              <View style={S.emptyState}>
                <Text style={S.emptyEmoji}>👥</Text>
                <Text style={S.emptyTitle}>Aucun inscrit</Text>
                <Text style={S.emptyText}>Les inscriptions apparaîtront ici.</Text>
              </View>
            ) : participants.map((p: any, i: number) => {
              const isMe = user?.id === p.athlete_id;
              const boxName = p.profile?.box_members?.[0]?.box?.name ?? null;
              const regDate = p.created_at
                ? new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
              const levelColor = LevelColors[p.profile?.level as AthleteLevel] ?? theme.textMuted;
              return (
                <View key={p.athlete_id} style={[S.partRow, isMe && S.partRowMe]}>
                  <View style={S.partAvatar}>
                    <Text style={S.partAvatarText}>
                      {(p.profile?.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={S.partInfo}>
                    <View style={S.partNameRow}>
                      <Text style={[S.partName, isMe && { color: theme.accent }]}>
                        {p.profile?.username ?? '?'}{isMe ? ' (toi)' : ''}
                      </Text>
                      {p.profile?.level && (
                        <View style={[S.partLevelBadge, { backgroundColor: `${levelColor}20` }]}>
                          <Text style={[S.partLevelText, { color: levelColor }]}>
                            {p.profile.level.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={S.partMeta}>
                      <Star color={theme.gold} size={11} />
                      <Text style={S.partMetaText}>ELO {p.profile?.elo ?? 1000}</Text>
                      {boxName && (
                        <><Text style={S.partMetaDot}>·</Text>
                        <Text style={S.partMetaText}>{boxName}</Text></>
                      )}
                    </View>
                    <Text style={S.partDate}>Inscrit le {regDate}</Text>
                  </View>
                  {isAdmin && !isMe && (
                    <TouchableOpacity style={S.kickBtn}
                      onPress={() => handleKick(p.athlete_id, p.profile?.username ?? '?')}
                      activeOpacity={0.7}>
                      <UserX color={theme.error} size={16} />
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
              <View style={S.emptyState}>
                <Text style={S.emptyEmoji}>🏆</Text>
                <Text style={S.emptyTitle}>Classement vide</Text>
                <Text style={S.emptyText}>Les scores apparaîtront ici dès les premières validations.</Text>
              </View>
            ) : participants.map((p: any, i: number) => {
              const isMe = user?.id === p.athlete_id;
              return (
                <View key={p.athlete_id} style={[S.rankRow, isMe && S.rankRowMe]}>
                  <View style={S.rankBadge}>
                    {i === 0 ? <Text style={S.rankEmoji}>🥇</Text>
                      : i === 1 ? <Text style={S.rankEmoji}>🥈</Text>
                      : i === 2 ? <Text style={S.rankEmoji}>🥉</Text>
                      : <Text style={S.rankNumber}>#{i + 1}</Text>}
                  </View>
                  <View style={S.rankAvatar}>
                    <Text style={S.rankAvatarText}>
                      {(p.profile?.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={S.rankInfo}>
                    <Text style={[S.rankName, isMe && { color: theme.accent }]}>
                      {p.profile?.username ?? '?'}{isMe ? ' (toi)' : ''}
                    </Text>
                    <Text style={S.rankElo}>ELO {p.profile?.elo ?? 1000}</Text>
                  </View>
                  <Text style={S.rankScore}>{p.score ?? 0} pts</Text>
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

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container:        { flex: 1, backgroundColor: theme.background },
  loadingContainer: { flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' },
  errorText:        { fontSize: 14, color: theme.textMuted },
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
  prize:       { fontSize: 13, color: theme.gold, fontWeight: '700' },
  tabsScroll:  { backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  tabsContent: { flexDirection: 'row', paddingHorizontal: 8 },
  tab:           { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: theme.accent },
  tabText:       { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  tabTextActive: { color: theme.accent },
  content: { padding: 16, paddingTop: 14 },
  card:      { backgroundColor: theme.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.cardBorder, gap: 8, marginBottom: 14 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1.5 },
  descText:  { fontSize: 14, color: theme.textSecondary, lineHeight: 22 },
  ruleText:  { fontSize: 13, color: theme.textSecondary, lineHeight: 22 },
  registerBtn:      { marginBottom: 12 },
  registerBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, padding: 18 },
  registerBtnText:  { color: '#fff', fontSize: 16, fontWeight: '900' },
  registeredBlock:  { marginBottom: 12, gap: 8 },
  registeredBadge:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${theme.success}15`, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${theme.success}30` },
  registeredText:   { fontSize: 14, fontWeight: '700', color: theme.success },
  leaveBtn:         { alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: `${theme.error}40`, backgroundColor: `${theme.error}10` },
  leaveBtnText:     { fontSize: 13, fontWeight: '700', color: theme.error },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: theme.text },
  emptyText:  { fontSize: 13, color: theme.textMuted, textAlign: 'center' },
  wodCard:       { backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.cardBorder, gap: 10, marginBottom: 14 },
  wodCardDone:   { borderColor: `${theme.success}40` },
  wodCardClosed: { opacity: 0.7 },
  wodCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  wodIndexBadge: { backgroundColor: `${theme.accent}15`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  wodIndexText:  { fontSize: 11, fontWeight: '800', color: theme.accent },
  wodTypeBadge:  { backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  wodTypeText:   { fontSize: 11, fontWeight: '700', color: theme.textSecondary },
  wodDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wodDurationText:{ fontSize: 11, color: theme.textMuted },
  wodStatusPill:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  wodStatusText:  { fontSize: 10, fontWeight: '700' },
  wodTitle:      { fontSize: 17, fontWeight: '900', color: theme.text },
  wodDesc:       { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  movementsBox:  { backgroundColor: theme.surface, borderRadius: 10, padding: 12, gap: 3 },
  movementLine:  { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  wodScoringRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wodScoringText:{ fontSize: 12, color: theme.gold, fontWeight: '600' },
  deadlineRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deadlineText:  { fontSize: 12, color: theme.warning, fontWeight: '600' },
  myScoreBadge:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: `${theme.success}10`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${theme.success}25` },
  myScoreValue:  { fontSize: 14, fontWeight: '800', color: theme.success },
  myScoreStatus: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  wodActionBtn:      { marginTop: 4 },
  wodActionBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  wodActionBtnText:  { color: '#fff', fontSize: 14, fontWeight: '900' },
  wodLockedBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  wodLockedText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  rankRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.cardBorder },
  rankRowMe:    { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
  rankBadge:    { width: 36, alignItems: 'center' },
  rankEmoji:    { fontSize: 22 },
  rankNumber:   { fontSize: 15, fontWeight: '800', color: theme.textSecondary },
  rankAvatar:   { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  rankAvatarText:{ fontSize: 16, fontWeight: '800', color: theme.text },
  rankInfo:     { flex: 1 },
  rankName:     { fontSize: 14, fontWeight: '800', color: theme.text },
  rankElo:      { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  rankScore:    { fontSize: 16, fontWeight: '900', color: theme.accent },
  adminBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${theme.accent}15`, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: `${theme.accent}25` },
  adminBannerText: { fontSize: 12, fontWeight: '700', color: theme.accent, flex: 1 },
  partRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.cardBorder },
  partRowMe:    { borderColor: theme.accent, backgroundColor: `${theme.accent}08` },
  partAvatar:   { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  partAvatarText: { fontSize: 17, fontWeight: '800', color: theme.text },
  partInfo:     { flex: 1, gap: 3 },
  partNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partName:     { fontSize: 14, fontWeight: '800', color: theme.text },
  partLevelBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  partLevelText:  { fontSize: 10, fontWeight: '800' },
  partMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  partMetaText: { fontSize: 12, color: theme.textSecondary },
  partMetaDot:  { fontSize: 12, color: theme.textMuted },
  partDate:     { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  kickBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: `${theme.error}12`, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: `${theme.error}30` },
}); }
