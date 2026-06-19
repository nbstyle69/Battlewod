import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, Users, Calendar, Zap, CheckCircle,
  Lock, Clock, Timer, UserX, Shield, Star, XCircle, RotateCcw, MessageSquare, Share2,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import UserAvatar from '../../components/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { scheduleTournamentReminder } from '../../services/notifications';
import { LevelColors } from '../../theme/designTokens';
import { AthleteLevel } from '../../types';
import { CompetitionStackParamList } from '../../navigation';
import {
  TournamentWOD, TournamentScore,
  MOVEMENT_BADGE_LEVELS, formatDate,
} from '../../utils/tournamentUtils';
import GlassBackground from '../../components/glass/GlassBackground';
import TournamentBracketView from './TournamentBracketView';
import TournamentDivisionsView from './TournamentDivisionsView';

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
const BRACKET_STAGE_LABELS = ['Finale', 'Demi-finale', 'Quart de finale', '8e de finale', '16e de finale', '32e de finale'];
function bracketStageLabel(stage: number) {
  return BRACKET_STAGE_LABELS[stage] ?? `Étape ${stage}`;
}

export default function TournamentScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { tournamentId } = route.params;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'box_owner';
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [activeTab,    setActiveTab]    = useState<'infos' | 'wods' | 'scores' | 'participants' | 'validate' | 'bracket' | 'divisions'>('infos');
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
  const [divisions,          setDivisions]          = useState<any[]>([]);
  const [divisionMembers,    setDivisionMembers]    = useState<any[]>([]);

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
    // For league_div tournaments, only show WODs from the current season.
    const allWods = (tw ?? []) as any[];
    const t_ = t as any;
    const filteredWods = (t_?.format === 'league_div')
      ? allWods.filter(w => (w.season_number ?? 1) === (t_?.current_season ?? 1))
      : allWods;
    setWods(filteredWods as TournamentWOD[]);

    // Server is the single source of truth (self SELECT policy guarantees read)
    const registered = !!myReg;
    setIsRegistered(registered);

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
        .select('id, username, elo, level, avatar_url, box_members(box:boxes(name))')
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

    // ── Divisions (league_div only) ─────────────────────────────────────
    if ((t as any)?.format === 'league_div') {
      const { data: divs } = await (supabase as any)
        .from('tournament_divisions')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('level');
      const divList = divs ?? [];
      setDivisions(divList);
      const divIds = divList.map((d: any) => d.id);
      if (divIds.length > 0) {
        const { data: mems } = await (supabase as any)
          .from('tournament_division_members')
          .select('*')
          .in('division_id', divIds);
        setDivisionMembers(mems ?? []);
      } else {
        setDivisionMembers([]);
      }
      // Default to first division (no "Général" tab for league_div)
      setRankTab(prev => (prev === 'general' && divList.length > 0) ? `div_${(divList[0] as any).id}` : prev);
    } else {
      setDivisions([]);
      setDivisionMembers([]);
    }
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
      setIsRegistered(true);
      if (tournament?.start_date) {
        scheduleTournamentReminder(tournamentId, tournament.name, tournament.start_date).catch(e => captureError(e, { action: 'scheduleTournamentReminder' }));
      }
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
      captureError(e, { screen: 'Tournament', action: 'register' });
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
      <GlassBackground />
      {/* ── Header ── */}
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color="rgba(255,255,255,0.7)" size={24} />
        </TouchableOpacity>
        <View style={S.headerInfo}>
          <TouchableOpacity onPress={() => Share.share({ message: `${tournament?.name ?? 'Tournoi'} — Inscris-toi sur AthleX ! athlex://tournament/${tournamentId}` })} style={{ position: 'absolute', right: 0, top: 0, padding: 4 }}>
            <Share2 color="rgba(255,255,255,0.7)" size={20} />
          </TouchableOpacity>
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

          {/* ── Personal registration status (persistent, all tabs) ── */}
          {user && (
            isRegistered ? (
              <View style={[S.myStatusPill, { backgroundColor: `${theme.success}22`, borderColor: `${theme.success}55` }]}>
                <CheckCircle color={theme.success} size={15} />
                <Text style={[S.myStatusText, { color: theme.success }]}>
                  {myScores.length > 0 ? 'Inscrit · score soumis' : 'Tu es inscrit'}
                </Text>
              </View>
            ) : isFull ? (
              <View style={[S.myStatusPill, { backgroundColor: `${theme.error}22`, borderColor: `${theme.error}55` }]}>
                <Lock color={theme.error} size={15} />
                <Text style={[S.myStatusText, { color: theme.error }]}>Tournoi complet</Text>
              </View>
            ) : tournament.status === 'open' ? (
              <View style={[S.myStatusPill, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)' }]}>
                <Zap color="rgba(255,255,255,0.85)" size={15} />
                <Text style={[S.myStatusText, { color: 'rgba(255,255,255,0.85)' }]}>Tu n'es pas encore inscrit</Text>
              </View>
            ) : null
          )}
        </View>
      </LinearGradient>

      {/* ── Tabs ── */}
      <View style={S.tabsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.tabsContent}>
          {((): any[] => {
              const fmt = tournament?.format ?? 'simple';
              const base: any[] = ['infos'];
              if (fmt === 'bracket' || fmt === 'swiss') base.push('bracket');
              if (fmt === 'league_div') base.push('scores'); // "Divisions" right after Infos
              base.push('wods', 'participants');
              if (fmt !== 'league_div') base.push('scores'); // "Classement" at the end for other formats
              if (isAdmin) base.push('validate');
              return base;
            })().map((tab: any) => {
              const pendingCount = allScores.filter(s => s.status === 'pending').length;
              return (
                <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
                  style={[S.tab, activeTab === tab && S.tabActive]}>
                  <Text style={[S.tabText, activeTab === tab && S.tabTextActive]} numberOfLines={1}>
                    {tab === 'infos'       ? 'Infos'
                      : tab === 'wods'       ? `WODs (${wods.length})`
                      : tab === 'participants'? `Participants (${participants.length})`
                      : tab === 'bracket'    ? 'Bracket'
                      : tab === 'validate'   ? `⚖️ Valider${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                      : tournament?.format === 'league_div' ? 'Divisions'
                      : 'Classement'}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        {/* ══ INFOS ══ */}
        {activeTab === 'infos' && (
          <>
            {/* ── "Comment ça marche" — stepper adapté au format ── */}
            {(() => {
              const fmt = tournament.format ?? 'simple';
              const isBracket = fmt === 'bracket' || fmt === 'swiss';
              const isLeague  = fmt === 'league_div';
              const steps = [
                { key: 'register', emoji: '📝', label: 'Inscription' },
                { key: 'wod',      emoji: isBracket ? '⚔️' : '🏋️', label: isBracket ? 'Affronte' : 'WODs' },
                { key: 'score',    emoji: '⏱️', label: 'Score' },
                { key: 'rank',     emoji: isLeague ? '🔱' : '🏆', label: isLeague ? 'Divisions' : 'Classement' },
              ];
              // Current step: 0 = à inscrire, 1 = faire les WODs, 2 = score soumis (suivre le classement)
              const currentIndex = !isRegistered ? 0 : (myScores.length === 0 ? 1 : 2);
              const hint = !isRegistered
                ? (tournament.status === 'open' ? 'Inscris-toi pour participer.' : 'Les inscriptions sont fermées.')
                : myScores.length === 0
                  ? (isBracket ? 'Tu es inscrit. Va dans l\'onglet Bracket pour voir ton adversaire, puis soumets ton score.'
                    : 'Tu es inscrit. Lance les WODs actifs et soumets ton score.')
                  : (isLeague ? 'Score soumis ! Suis ta position dans ta division.'
                    : 'Score soumis ! Suis ta progression dans le classement.');
              return (
                <View style={S.card}>
                  <Text style={S.cardLabel}>COMMENT ÇA MARCHE</Text>
                  <View style={S.stepperRow}>
                    {steps.map((st, i) => {
                      const done   = i < currentIndex;
                      const active = i === currentIndex;
                      const color  = done ? theme.success : active ? theme.accent : theme.textMuted;
                      return (
                        <React.Fragment key={st.key}>
                          <View style={S.stepItem}>
                            <View style={[S.stepCircle, {
                              borderColor: color,
                              backgroundColor: done ? `${theme.success}20` : active ? `${theme.accent}20` : 'transparent',
                            }]}>
                              {done
                                ? <CheckCircle color={theme.success} size={18} />
                                : <Text style={S.stepEmoji}>{st.emoji}</Text>}
                            </View>
                            <Text style={[S.stepLabel, { color, fontWeight: active ? '900' : '700' }]} numberOfLines={1}>
                              {st.label}
                            </Text>
                          </View>
                          {i < steps.length - 1 && (
                            <View style={[S.stepConnector, { backgroundColor: i < currentIndex ? theme.success : theme.border }]} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                  <View style={S.stepHintBox}>
                    <Text style={S.stepHintText}>{hint}</Text>
                  </View>
                </View>
              );
            })()}

            {tournament.description ? (
              <View style={S.card}>
                <Text style={S.cardLabel}>À PROPOS</Text>
                <Text style={S.descText}>{tournament.description}</Text>
              </View>
            ) : null}

            {/* Format banner */}
            {(tournament.format === 'bracket' || tournament.format === 'swiss' || tournament.format === 'league_div') && (
              <View style={[S.card, { borderColor: '#A855F740', borderWidth: 1, backgroundColor: 'rgba(168,85,247,0.06)' }]}>
                <Text style={[S.cardLabel, { color: '#A855F7' }]}>FORMAT</Text>
                <Text style={[S.descText, { fontWeight: '900' }]}>
                  {tournament.format === 'bracket' ? '🏆 Bracket — Élimination directe' :
                   tournament.format === 'swiss'   ? '🏆 Swiss — Double élimination (WB + LB)' :
                                                     '🏆 Ligue avec divisions — Promotion/relégation'}
                </Text>
                {tournament.require_video_proof && (
                  <Text style={[S.ruleText, { color: '#F59E0B', marginTop: 8 }]}>
                    📹 Preuve vidéo obligatoire pour la validation des scores.
                  </Text>
                )}
              </View>
            )}

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
              <TouchableOpacity style={[S.registerBtn, S.registerBtnInner, registering && { opacity: 0.6 }]} onPress={handleRegister}
                disabled={registering} activeOpacity={0.85}>
                {registering
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Zap color="#fff" size={18} /><Text style={S.registerBtnText}>{tournament?.format === 'league_div' ? 'Rejoindre la league' : "S'inscrire au tournoi"}</Text></>}
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
                    {(tournament.format === 'bracket' || tournament.format === 'swiss') && (wod as any).bracket_stage != null && (
                      <View style={S.wodStageBadge}>
                        <Text style={S.wodStageText}>{bracketStageLabel((wod as any).bracket_stage)}</Text>
                      </View>
                    )}
                    {tournament.format === 'league_div' && (() => {
                      const d = (wod as any).division_id ? divisions.find((x: any) => x.id === (wod as any).division_id) : null;
                      return (
                        <View style={d ? S.wodDivBadge : S.wodGenBadge}>
                          <Text style={d ? S.wodDivText : S.wodGenText}>
                            {d ? `🔱 D${d.level} · ${d.name}` : '🌐 Général'}
                          </Text>
                        </View>
                      );
                    })()}
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
                    <TouchableOpacity style={[S.wodActionBtn, S.wodActionBtnInner]} onPress={() => goToWOD(wod)} activeOpacity={0.85}>
                      <Timer color="#fff" size={16} />
                      <Text style={S.wodActionBtnText}>Lancer le WOD</Text>
                    </TouchableOpacity>
                  )}
                  {!isRegistered && wod.status === 'active' && (
                    <TouchableOpacity style={S.wodLockedBtn} onPress={() => setActiveTab('infos')} activeOpacity={0.8}>
                      <Lock color={theme.textMuted} size={14} />
                      <Text style={S.wodLockedText}>Inscription requise</Text>
                    </TouchableOpacity>
                  )}
                  {myScore?.status === 'rejected' && (
                    <TouchableOpacity style={[S.wodActionBtn, S.wodActionBtnRejected]} onPress={() => goToWOD(wod)} activeOpacity={0.85}>
                      <Timer color="#fff" size={16} />
                      <Text style={S.wodActionBtnText}>Soumettre à nouveau</Text>
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

        {/* ══ BRACKET (bracket / swiss) ══ */}
        {activeTab === 'bracket' && (
          <TournamentBracketView
            tournamentId={tournamentId}
            format={tournament.format === 'swiss' ? 'swiss' : 'bracket'}
            currentUserId={user?.id}
          />
        )}

        {/* ══ CLASSEMENT / DIVISIONS ══ */}
        {activeTab === 'scores' && (
          <>
            {/* Sub-tabs: Général + Divisions (league_div) + WOD 1, WOD 2... */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
              {([
                ...(tournament?.format === 'league_div' ? [] : ['general']),
                ...divisions.map((d: any) => `div_${d.id}`),
                ...wods.map((_: any, i: number) => `wod_${i}`),
              ] as string[]).map(tab => {
                let label = '';
                if (tab === 'general') label = '🏆 Général';
                else if (tab.startsWith('div_')) {
                  const d = divisions.find((dd: any) => `div_${dd.id}` === tab);
                  label = d ? `🔱 D${d.level} · ${d.name}` : '';
                } else {
                  const idx = parseInt(tab.split('_')[1]);
                  label = `WOD ${idx + 1} — ${wods[idx]?.title ?? ''}`;
                }
                return (
                  <TouchableOpacity key={tab} onPress={() => setRankTab(tab)}
                    style={[S.rankSubTab, rankTab === tab && S.rankSubTabActive]}>
                    <Text style={[S.rankSubTabText, rankTab === tab && S.rankSubTabTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
                const memberRow = divisionMembers.find((m: any) => m.athlete_id === p.athlete_id);
                const myDiv    = memberRow ? divisions.find((d: any) => d.id === memberRow.division_id) : null;
                return (
                  <View key={p.athlete_id} style={[S.rankRow, isMe && S.rankRowMe]}>
                    <View style={S.rankBadge}>
                      {i === 0 ? <Text style={S.rankEmoji}>🥇</Text>
                        : i === 1 ? <Text style={S.rankEmoji}>🥈</Text>
                        : i === 2 ? <Text style={S.rankEmoji}>🥉</Text>
                        : <Text style={S.rankNumber}>#{i + 1}</Text>}
                    </View>
                    <UserAvatar
                      uri={p.profile?.avatar_url}
                      name={p.profile?.username ?? '?'}
                      size={40}
                      borderRadius={20}
                      backgroundColor={theme.surface}
                      textColor={theme.text}
                    />
                    <View style={S.rankInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[S.rankName, isMe && { color: theme.accent }]}>
                          {p.profile?.username ?? '?'}{isMe ? ' (toi)' : ''}
                        </Text>
                        {myDiv && (
                          <View style={S.divBadge}>
                            <Text style={S.divBadgeText}>D{myDiv.level} · {myDiv.name}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={S.rankElo}>ELO {p.profile?.elo ?? 1000}</Text>
                    </View>
                    <Text style={S.rankScore}>{p.score ?? 0} pts</Text>
                  </View>
                );
              })
            )}

            {/* Par division (league_div) */}
            {divisions.map((div: any) => rankTab === `div_${div.id}` && (() => {
              const divMembers = divisionMembers.filter((m: any) => m.division_id === div.id);
              const ranked = divMembers
                .map((m: any) => {
                  const part = participants.find((p: any) => p.athlete_id === m.athlete_id);
                  return { ...m, profile: part?.profile, score: m.points ?? part?.score ?? 0 };
                })
                .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
              return (
                <View key={div.id}>
                  <View style={S.wodRankHeader}>
                    <Text style={S.wodRankHeaderText}>🔱 Division {div.level} — {div.name}</Text>
                    <Text style={S.divSubInfo}>
                      {ranked.length}/{div.max_members} · {div.promote_count > 0 ? `↑${div.promote_count} promus` : ''} {div.relegate_count > 0 ? `· ↓${div.relegate_count} relégués` : ''}
                    </Text>
                  </View>
                  {ranked.length === 0 ? (
                    <View style={S.emptyState}>
                      <Text style={S.emptyEmoji}>👥</Text>
                      <Text style={S.emptyTitle}>Division vide</Text>
                    </View>
                  ) : ranked.map((m: any, i: number) => {
                    const isMe = user?.id === m.athlete_id;
                    const isPromoted = i < (div.promote_count ?? 0);
                    const isRelegated = i >= ranked.length - (div.relegate_count ?? 0) && (div.relegate_count ?? 0) > 0;
                    return (
                      <View key={m.athlete_id} style={[S.rankRow, isMe && S.rankRowMe]}>
                        <View style={S.rankBadge}>
                          {i === 0 ? <Text style={S.rankEmoji}>🥇</Text>
                            : i === 1 ? <Text style={S.rankEmoji}>🥈</Text>
                            : i === 2 ? <Text style={S.rankEmoji}>🥉</Text>
                            : <Text style={S.rankNumber}>#{i + 1}</Text>}
                        </View>
                        <UserAvatar
                          uri={m.profile?.avatar_url}
                          name={m.profile?.username ?? '?'}
                          size={40}
                          borderRadius={20}
                          backgroundColor={theme.surface}
                          textColor={theme.text}
                        />
                        <View style={S.rankInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={[S.rankName, isMe && { color: theme.accent }]}>
                              {m.profile?.username ?? '?'}{isMe ? ' (toi)' : ''}
                            </Text>
                            {isPromoted && (
                              <View style={[S.divBadge, { backgroundColor: `${theme.success}20`, borderColor: `${theme.success}40` }]}>
                                <Text style={[S.divBadgeText, { color: theme.success }]}>↑ Promu</Text>
                              </View>
                            )}
                            {isRelegated && (
                              <View style={[S.divBadge, { backgroundColor: `${theme.error}20`, borderColor: `${theme.error}40` }]}>
                                <Text style={[S.divBadgeText, { color: theme.error }]}>↓ Relégué</Text>
                              </View>
                            )}
                          </View>
                          <Text style={S.rankElo}>ELO {m.profile?.elo ?? 1000}</Text>
                        </View>
                        <Text style={S.rankScore}>{m.score ?? 0} pts</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })())}

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
                        <UserAvatar
                          uri={profile?.avatar_url}
                          name={profile?.username ?? '?'}
                          size={40}
                          borderRadius={20}
                          backgroundColor={theme.surface}
                          textColor={theme.text}
                        />
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
  container:        { flex: 1, backgroundColor: 'transparent' },
  loadingContainer: { flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' },
  errorText:        { fontSize: 14, color: theme.textMuted },
  header:      { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', gap: 12 },
  back:        { paddingTop: 6 },
  headerInfo:  { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.3, marginBottom: 10 },
  headerMeta:  { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  levelBadge:      { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  levelBadgeText:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  myStatusPill:  { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  myStatusText:  { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  metaItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:    { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  prize:       { fontSize: 13, color: theme.gold, fontWeight: '700' },
  tabsBar:     { height: 46, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  tabsContent: { flexDirection: 'row', paddingHorizontal: 8, alignItems: 'stretch' },
  tab:           { paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: theme.accent },
  tabText:       { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  tabTextActive: { color: theme.accent, fontWeight: '700' },
  content: { padding: 16, paddingTop: 14 },
  card:      { backgroundColor: theme.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.cardBorder, gap: 8, marginBottom: 14 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1.5 },
  stepperRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stepItem:      { alignItems: 'center', width: 64 },
  stepCircle:    { width: 42, height: 42, borderRadius: 21, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  stepEmoji:     { fontSize: 18 },
  stepLabel:     { fontSize: 11, textAlign: 'center' },
  stepConnector: { flex: 1, height: 2, marginHorizontal: 2, marginBottom: 22, borderRadius: 1 },
  stepHintBox:   { marginTop: 12, backgroundColor: theme.surface, borderRadius: 10, padding: 12 },
  stepHintText:  { fontSize: 13, color: theme.textSecondary, lineHeight: 19, fontWeight: '600' },
  descText:  { fontSize: 14, color: theme.textSecondary, lineHeight: 22 },
  ruleText:  { fontSize: 13, color: theme.textSecondary, lineHeight: 22 },
  registerBtn:      { marginBottom: 12 },
  registerBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, padding: 18, backgroundColor: 'rgba(16,185,129,0.25)', borderWidth: 2, borderColor: 'rgba(16,185,129,0.8)' },
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
  wodStageBadge:  { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  wodStageText:   { fontSize: 10, fontWeight: '800', color: '#C4A0F5' },
  wodDivBadge:    { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  wodDivText:     { fontSize: 10, fontWeight: '800', color: '#C4A0F5' },
  wodGenBadge:    { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  wodGenText:     { fontSize: 10, fontWeight: '800', color: '#7FB0F5' },
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
  wodActionBtn:      { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: 'rgba(16,185,129,0.25)', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.8)' },
  wodActionBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, backgroundColor: 'rgba(16,185,129,0.25)', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.8)' },
  wodActionBtnRejected: { backgroundColor: 'rgba(239,68,68,0.25)', borderColor: 'rgba(239,68,68,0.8)' },
  wodActionBtnText:  { color: '#fff', fontSize: 14, fontWeight: '900' },
  wodLockedBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  wodLockedText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  divBadge:     { backgroundColor: `${theme.accent}20`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: `${theme.accent}40` },
  divBadgeText: { fontSize: 10, fontWeight: '800', color: theme.accent, letterSpacing: 0.2 },
  divSubInfo:   { fontSize: 11, color: theme.textMuted, marginTop: 2 },
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
