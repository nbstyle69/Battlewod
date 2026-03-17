import React, { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Users, Calendar, Zap, CheckCircle,
  Lock, Clock, Timer, UserX, Shield, Star, XCircle, RotateCcw, MessageSquare,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
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

  const [activeTab,    setActiveTab]    = useState<'infos' | 'wods' | 'scores' | 'participants' | 'validate'>('infos');
  const [tournament,   setTournament]   = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [myScores,     setMyScores]     = useState<TournamentScore[]>([]);
  const [allScores,    setAllScores]    = useState<TournamentScore[]>([]);
  const [wods,         setWods]         = useState<TournamentWOD[]>([]);
  const [processing,   setProcessing]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [registering,       setRegistering]       = useState(false);
  const [isRegistered,      setIsRegistered]      = useState(false);
  const [wodValidatedScores, setWodValidatedScores] = useState<any[]>([]);
  const [rankTab,            setRankTab]            = useState<string>('general');

  const load = useCallback(async () => {
    const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'box_owner';
    const [{ data: t }, { data: tw }, { data: tp }, { data: ms }, { data: as_ }, { data: vs }, { data: myReg }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
      supabase.from('tournament_wods').select('*').eq('tournament_id', tournamentId).order('order_index'),
      supabase.rpc('get_tournament_participants', { p_tournament_id: tournamentId }),
      user ? supabase.from('tournament_scores')
        .select('*').eq('tournament_id', tournamentId).eq('athlete_id', user.id) : { data: [] },
      isAdminUser ? supabase.from('tournament_scores')
        .select('*, tw:tournament_wods(title, type)')
        .eq('tournament_id', tournamentId)
        .order('submitted_at', { ascending: false }) : { data: [] },
      supabase.rpc('get_tournament_validated_scores', { p_tournament_id: tournamentId }),
      user ? supabase.from('tournament_participants')
        .select('athlete_id, score')
        .eq('tournament_id', tournamentId)
        .eq('athlete_id', user.id)
        .maybeSingle() : { data: null },
    ]);
    setTournament(t);
    setWods((tw ?? []) as TournamentWOD[]);

    // Merge server result with local cache (handles RLS SELECT blocks)
    const cacheKey = `@athlex:registered:${user?.id}:${tournamentId}`;
    const cached   = await AsyncStorage.getItem(cacheKey);
    const registered = !!myReg || cached === 'true';
    setIsRegistered(registered);
    // Keep cache in sync with server
    if (myReg)   await AsyncStorage.setItem(cacheKey, 'true');
    else if (!myReg && !registered) await AsyncStorage.removeItem(cacheKey);

    // ── Separate profile fetch to bypass FK ambiguity ──────────────────────
    const participantList = tp ?? [];
    const allScoreList    = as_ ?? [];
    const allAthleteIds   = [...new Set([
      ...participantList.map((p: any) => p.athlete_id),
      ...allScoreList.map((s: any)   => s.athlete_id),
      ...(user && registered ? [user.id] : []),
    ])];
    let profileMap: Record<string, any> = {};
    if (allAthleteIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, elo, level, box_members(box:boxes(name))')
        .in('id', allAthleteIds);
      (profs ?? []).forEach((p: any) => { profileMap[p.id] = p; });
    }

    // Build participants list — inject current user if registered but RLS blocks full SELECT
    let mappedParticipants = participantList.map((p: any) => ({ ...p, profile: profileMap[p.athlete_id] ?? null }));
    if (user && registered && !mappedParticipants.some((p: any) => p.athlete_id === user.id)) {
      mappedParticipants = [
        ...mappedParticipants,
        {
          athlete_id:  user.id,
          score:       myReg?.score ?? 0,
          profile:     profileMap[user.id] ?? { id: user.id, username: user.username, elo: user.elo, level: user.level },
        },
      ];
    }
    setParticipants(mappedParticipants);

    setMyScores((ms ?? []) as TournamentScore[]);
    setWodValidatedScores(vs ?? []);
    if (isAdminUser) setAllScores(allScoreList.map((s: any) => ({
      ...s,
      profile: profileMap[s.athlete_id] ?? null,
      tw: Array.isArray(s.tw) ? s.tw[0] : s.tw,
    })));
    setLoading(false);
    setRefreshing(false);
  }, [tournamentId, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleRegister() {
    if (!user || isRegistered) return;
    setRegistering(true);
    try {
      const { error } = await supabase.from('tournament_participants')
        .insert({ tournament_id: tournamentId, athlete_id: user.id, score: 0 });
      if (error && error.code !== '23505') {
        Alert.alert('Erreur inscription', error.message);
        return;
      }
      // Persist registration locally so cold-restart survives RLS
      await AsyncStorage.setItem(`@athlex:registered:${user.id}:${tournamentId}`, 'true');
      setIsRegistered(true);
      setParticipants(prev =>
        prev.some(p => p.athlete_id === user.id)
          ? prev
          : [...prev, {
              athlete_id: user.id,
              score: 0,
              profile: {
                id: user.id,
                username: user.username,
                elo: user.elo,
                level: user.level,
              },
            }]
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Inscription impossible');
    } finally {
      setRegistering(false);
    }
  }

  async function recalcLeaderboard(tournamentWods: TournamentWOD[], validatedScores: TournamentScore[]) {
    const pointsMap: Record<string, number> = {};
    tournamentWods.forEach(wod => {
      const wodScores = validatedScores.filter(s => s.tournament_wod_id === wod.id);
      const sorted = [...wodScores].sort((a, b) => parseFloat(String(b.score_value)) - parseFloat(String(a.score_value)));
      sorted.forEach((s, i) => {
        const pts = Math.max(1, 100 - i * 3);
        pointsMap[s.athlete_id] = (pointsMap[s.athlete_id] ?? 0) + pts;
      });
    });
    for (const [athleteId, pts] of Object.entries(pointsMap)) {
      await supabase.from('tournament_participants')
        .update({ score: pts })
        .eq('tournament_id', tournamentId)
        .eq('athlete_id', athleteId);
    }
  }

  async function handleValidateScore(scoreId: string) {
    setProcessing(scoreId);
    const { error } = await supabase.from('tournament_scores')
      .update({ status: 'validated', validated_at: new Date().toISOString() })
      .eq('id', scoreId);
    if (error) { Alert.alert('Erreur', error.message); setProcessing(null); return; }
    const updated = allScores.map(s => s.id === scoreId ? { ...s, status: 'validated' as const } : s);
    setAllScores(updated);
    const validated = updated.filter(s => s.status === 'validated');
    await recalcLeaderboard(wods, validated);
    setProcessing(null);
    load();
  }

  async function handleRejectScore(scoreId: string) {
    setProcessing(scoreId);
    const { error } = await supabase.from('tournament_scores')
      .update({ status: 'rejected' })
      .eq('id', scoreId);
    if (error) { Alert.alert('Erreur', error.message); setProcessing(null); return; }
    setAllScores(prev => prev.map(s => s.id === scoreId ? { ...s, status: 'rejected' as const } : s));
    setProcessing(null);
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
          await AsyncStorage.removeItem(`@athlex:registered:${user.id}:${tournamentId}`);
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
        {(['infos', 'wods', 'participants', 'scores', ...(isAdmin ? ['validate'] : [])] as const).map((tab: any) => {
            const pendingCount = allScores.filter(s => s.status === 'pending').length;
            return (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
                style={[S.tab, activeTab === tab && S.tabActive]}>
                <Text style={[S.tabText, activeTab === tab && S.tabTextActive]}>
                  {tab === 'infos'       ? 'Infos'
                    : tab === 'wods'       ? `WODs (${wods.length})`
                    : tab === 'participants'? `Participants (${participants.length})`
                    : tab === 'validate'   ? `⚖️ Valider${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                    : 'Classement'}
                </Text>
              </TouchableOpacity>
            );
          })}
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
                        {(myScore as any).admin_message ? (
                          <View style={S.adminMsgBox}>
                            <MessageSquare color={theme.accent} size={12} />
                            <Text style={S.adminMsgText}>{(myScore as any).admin_message}</Text>
                          </View>
                        ) : null}
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
            {/* Sub-tabs: Général + WOD 1, WOD 2... */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
              {(['general', ...wods.map((_: any, i: number) => `wod_${i}`)] as string[]).map(tab => (
                <TouchableOpacity key={tab} onPress={() => setRankTab(tab)}
                  style={[S.rankSubTab, rankTab === tab && S.rankSubTabActive]}>
                  <Text style={[S.rankSubTabText, rankTab === tab && S.rankSubTabTextActive]}>
                    {tab === 'general' ? '🏆 Général'
                      : `WOD ${parseInt(tab.split('_')[1]) + 1} — ${wods[parseInt(tab.split('_')[1])]?.title ?? ''}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Général */}
            {rankTab === 'general' && (
              participants.length === 0 ? (
                <View style={S.emptyState}>
                  <Text style={S.emptyEmoji}>🏆</Text>
                  <Text style={S.emptyTitle}>Classement vide</Text>
                  <Text style={S.emptyText}>Les scores apparaîtront ici dès les premières validations.</Text>
                </View>
              ) : participants
                  .slice()
                  .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
                  .map((p: any, i: number) => {
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
                      <Text style={S.rankAvatarText}>{(p.profile?.username ?? '?')[0].toUpperCase()}</Text>
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
              })
            )}

            {/* Par WOD */}
            {wods.map((wod: any, idx: number) => rankTab === `wod_${idx}` && (() => {
              const wodScores = wodValidatedScores
                .filter((s: any) => s.tournament_wod_id === wod.id)
                .slice()
                .sort((a: any, b: any) => parseFloat(b.score_value) - parseFloat(a.score_value));
              return (
                <View key={wod.id}>
                  <View style={S.wodRankHeader}>
                    <Text style={S.wodRankHeaderText}>WOD {idx + 1} — {wod.title}</Text>
                  </View>
                  {wodScores.length === 0 ? (
                    <View style={S.emptyState}>
                      <Text style={S.emptyEmoji}>📋</Text>
                      <Text style={S.emptyTitle}>Aucun score validé</Text>
                    </View>
                  ) : wodScores.map((s: any, i: number) => {
                    const profile = participants.find((p: any) => p.athlete_id === s.athlete_id)?.profile;
                    const isMe = user?.id === s.athlete_id;
                    return (
                      <View key={s.athlete_id} style={[S.rankRow, isMe && S.rankRowMe]}>
                        <View style={S.rankBadge}>
                          {i === 0 ? <Text style={S.rankEmoji}>🥇</Text>
                            : i === 1 ? <Text style={S.rankEmoji}>🥈</Text>
                            : i === 2 ? <Text style={S.rankEmoji}>🥉</Text>
                            : <Text style={S.rankNumber}>#{i + 1}</Text>}
                        </View>
                        <View style={S.rankAvatar}>
                          <Text style={S.rankAvatarText}>{(profile?.username ?? '?')[0].toUpperCase()}</Text>
                        </View>
                        <View style={S.rankInfo}>
                          <Text style={[S.rankName, isMe && { color: theme.accent }]}>
                            {profile?.username ?? '?'}{isMe ? ' (toi)' : ''}
                          </Text>
                        </View>
                        <Text style={S.rankScore}>{s.score_value}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })())}
          </>
        )}

        {/* ══ VALIDER (admin only) ══ */}
        {activeTab === 'validate' && isAdmin && (
          <>
            {/* Recalc button */}
            <TouchableOpacity
              style={S.recalcBtn}
              onPress={async () => {
                const validated = allScores.filter(s => s.status === 'validated');
                await recalcLeaderboard(wods, validated);
                await load();
                Alert.alert('✅', 'Classement recalculé.');
              }}
              activeOpacity={0.8}>
              <RotateCcw color={theme.accent} size={13} />
              <Text style={S.recalcBtnText}>Recalculer le classement</Text>
            </TouchableOpacity>

            {allScores.length === 0 ? (
              <View style={S.emptyState}>
                <Text style={S.emptyEmoji}>📋</Text>
                <Text style={S.emptyTitle}>Aucun score soumis</Text>
                <Text style={S.emptyText}>Les scores des athlètes apparaîtront ici.</Text>
              </View>
            ) : allScores.map(score => {
              const statusColor = score.status === 'validated' ? theme.success
                : score.status === 'rejected' ? theme.error : theme.warning;
              const statusLabel = score.status === 'validated' ? '✅ Validé'
                : score.status === 'rejected' ? '❌ Rejeté' : '⏳ En attente';
              const isProcessing = processing === score.id;
              return (
                <View key={score.id} style={S.scoreCard}>
                  <View style={S.scoreCardHeader}>
                    <View style={S.scoreAvatarWrap}>
                      <Text style={S.scoreAvatarText}>
                        {((score as any).profile?.username ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.scoreUsername}>{(score as any).profile?.username ?? '?'}</Text>
                      <Text style={S.scoreWodTitle}>{(score as any).tw?.title ?? ''}</Text>
                    </View>
                    <View style={[S.scoreStatusPill, { backgroundColor: `${statusColor}20` }]}>
                      <Text style={[S.scoreStatusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>

                  <View style={S.scoreValueRow}>
                    <Zap color={theme.gold} size={14} />
                    <Text style={S.scoreValue}>{score.score_value}</Text>
                    {score.tiebreak_value != null && (
                      <Text style={S.scoreTiebreak}>TB: {score.tiebreak_value}</Text>
                    )}
                  </View>

                  {score.notes ? (
                    <Text style={S.scoreNotes}>{score.notes}</Text>
                  ) : null}

                  {score.status === 'pending' && (
                    <View style={S.scoreActions}>
                      <TouchableOpacity
                        style={[S.scoreBtn, S.scoreBtnReject]}
                        onPress={() => handleRejectScore(score.id)}
                        disabled={isProcessing}
                        activeOpacity={0.8}>
                        {isProcessing
                          ? <ActivityIndicator size="small" color={theme.error} />
                          : <><XCircle color={theme.error} size={14} /><Text style={[S.scoreBtnText, { color: theme.error }]}>Rejeter</Text></>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[S.scoreBtn, S.scoreBtnValidate]}
                        onPress={() => handleValidateScore(score.id)}
                        disabled={isProcessing}
                        activeOpacity={0.8}>
                        {isProcessing
                          ? <ActivityIndicator size="small" color={theme.success} />
                          : <><CheckCircle color={theme.success} size={14} /><Text style={[S.scoreBtnText, { color: theme.success }]}>Valider</Text></>}
                      </TouchableOpacity>
                    </View>
                  )}
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
  adminMsgBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6, backgroundColor: `${theme.accent}10`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  adminMsgText:  { fontSize: 11, color: theme.textSecondary, flex: 1, lineHeight: 16 },
  wodActionBtn:      { marginTop: 4 },
  wodActionBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  wodActionBtnText:  { color: '#fff', fontSize: 14, fontWeight: '900' },
  wodLockedBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  wodLockedText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  rankSubTab:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: theme.border },
  rankSubTabActive:     { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
  rankSubTabText:       { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  rankSubTabTextActive: { color: theme.accent },
  wodRankHeader:        { backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  wodRankHeaderText:    { fontSize: 13, fontWeight: '800', color: theme.text },
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
  recalcBtn:     { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: `${theme.accent}12`, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: `${theme.accent}25` },
  recalcBtnText: { fontSize: 13, fontWeight: '700' as const, color: theme.accent },
  scoreCard:       { backgroundColor: theme.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.cardBorder, gap: 10 },
  scoreCardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  scoreAvatarWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: `${theme.accent}20`, justifyContent: 'center' as const, alignItems: 'center' as const },
  scoreAvatarText: { fontSize: 15, fontWeight: '800' as const, color: theme.accent },
  scoreUsername:   { fontSize: 14, fontWeight: '800' as const, color: theme.text },
  scoreWodTitle:   { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  scoreStatusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  scoreStatusText: { fontSize: 11, fontWeight: '700' as const },
  scoreValueRow:   { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: theme.surface, borderRadius: 10, padding: 10 },
  scoreValue:      { fontSize: 16, fontWeight: '900' as const, color: theme.text, flex: 1 },
  scoreTiebreak:   { fontSize: 12, color: theme.textMuted },
  scoreNotes:      { fontSize: 12, color: theme.textSecondary, backgroundColor: theme.surface, borderRadius: 8, padding: 8, fontStyle: 'italic' as const },
  scoreActions:    { flexDirection: 'row' as const, gap: 8 },
  scoreBtn:        { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: 12, paddingVertical: 11, borderWidth: 1 },
  scoreBtnReject:  { backgroundColor: `${theme.error}10`, borderColor: `${theme.error}30` },
  scoreBtnValidate:{ backgroundColor: `${theme.success}10`, borderColor: `${theme.success}30` },
  scoreBtnText:    { fontSize: 13, fontWeight: '700' as const },
}); }
