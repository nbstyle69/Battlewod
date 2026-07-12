import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import {
  ChevronRight, Globe2, Users, Calendar, Trophy,
  Dumbbell, Lock, Clock, CheckCircle2, XCircle, UserPlus,
  GitBranch, Shield, Swords,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';
import { trackInterCompRegister, trackInterCompScoreSubmit } from '../../lib/analytics';
import GlassBackground from '../../components/glass/GlassBackground';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'InterCompetitionDetail'>;
type Route = RouteProp<CompetitionStackParamList, 'InterCompetitionDetail'>;

type Tab = 'Infos' | 'WODs' | 'Inscription' | 'Classement' | 'Bracket' | 'Ligue' | 'Poules' | 'Suisse';

export default function InterCompetitionDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { competitionId } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';

  const FORMAT_LABEL: Record<string, string> = {
    league: t('interComp.formatLeague'),
    bracket: t('interComp.formatBracket'),
    pool: t('interComp.formatPool'),
    swiss: t('interComp.formatSwiss'),
  };
  const TAB_LABEL: Record<Tab, string> = {
    Infos: t('interDetail.tabInfos'),
    WODs: t('interDetail.tabWods'),
    Inscription: t('interDetail.tabRegistration'),
    Classement: t('interDetail.tabStandings'),
    Bracket: t('interComp.formatBracket'),
    Ligue: t('interComp.formatLeague'),
    Poules: t('interComp.formatPool'),
    Suisse: t('interComp.formatSwiss'),
  };

  const [tab, setTab] = useState<Tab>('Infos');
  const [comp, setComp]               = useState<any>(null);
  const [wods, setWods]               = useState<any[]>([]);
  const [myReg, setMyReg]             = useState<any>(null);
  const [myTeam, setMyTeam]           = useState<any>(null);
  const [standings, setStandings]     = useState<any[]>([]);
  const [myScores, setMyScores]       = useState<any[]>([]);
  const [bracketMatches, setBracketMatches] = useState<any[]>([]);
  const [leagueRounds, setLeagueRounds]     = useState<any[]>([]);
  const [leagueStandings, setLeagueStandings] = useState<any[]>([]);
  const [poolGroups, setPoolGroups]   = useState<any[]>([]);
  const [poolMembers, setPoolMembers] = useState<any[]>([]);
  const [poolMatches, setPoolMatches] = useState<any[]>([]);
  const [swissRounds, setSwissRounds]       = useState<any[]>([]);
  const [swissPairings, setSwissPairings]   = useState<any[]>([]);
  const [swissStandings, setSwissStandings] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [registering, setRegistering] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const realtimeRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
    const [{ data: c }, { data: w }, { data: s }] = await Promise.all([
      supabase.from('inter_competitions').select('*').eq('id', competitionId).single(),
      supabase.from('inter_competition_wods').select('*').eq('competition_id', competitionId).order('order_index'),
      supabase.from('inter_standings').select('*').eq('competition_id', competitionId).order('rank'),
    ]);
    setComp(c);
    setWods(w ?? []);
    setStandings(s ?? []);

    // Load format-specific data
    if (c) {
      const format = c.format;
      if (format === 'bracket' || format === 'swiss') {
        const { data: matches } = await supabase
          .from('inter_bracket_matches').select('*')
          .eq('competition_id', competitionId)
          .order('round').order('match_number');
        if (matches && matches.length > 0) {
          const ids: string[] = Array.from(new Set(
            matches.flatMap((m: any) => [m.participant1_id, m.participant2_id]).filter(Boolean)
          ));
          const { data: profs } = await supabase.from('profiles').select('id, username').in('id', ids);
          const profMap: Record<string, string> = {};
          (profs ?? []).forEach((p: any) => { profMap[p.id] = p.username; });
          setBracketMatches(matches.map((m: any) => ({
            ...m,
            p1_username: m.participant1_id ? profMap[m.participant1_id] ?? '—' : 'BYE',
            p2_username: m.participant2_id ? profMap[m.participant2_id] ?? '—' : 'BYE',
          })));
        } else { setBracketMatches([]); }
      }
      if (format === 'league') {
        const [{ data: rounds }, { data: lstands }] = await Promise.all([
          supabase.from('inter_league_rounds').select('*')
            .eq('competition_id', competitionId).order('round_number'),
          supabase.from('inter_league_standings').select('*')
            .eq('competition_id', competitionId).order('total_points', { ascending: false }),
        ]);
        setLeagueRounds(rounds ?? []);
        const standList = (lstands ?? []) as any[];
        if (standList.length > 0) {
          const sIds = standList.map((x: any) => x.athlete_id).filter(Boolean);
          const { data: sprofs } = await supabase.from('profiles').select('id, username').in('id', sIds);
          const spMap: Record<string, string> = {};
          (sprofs ?? []).forEach((p: any) => { spMap[p.id] = p.username; });
          standList.forEach((x: any) => { x.username = spMap[x.athlete_id] ?? '—'; });
        }
        setLeagueStandings(standList);
      }
      if (format === 'pool') {
        const [{ data: groups }, { data: members }, { data: pmatches }] = await Promise.all([
          supabase.from('inter_pool_groups').select('*')
            .eq('competition_id', competitionId).order('group_index'),
          supabase.from('inter_pool_members').select('*'),
          supabase.from('inter_pool_matches').select('*')
            .eq('competition_id', competitionId).order('group_id'),
        ]);
        setPoolGroups(groups ?? []);
        const groupIds = (groups ?? []).map((g: any) => g.id);
        const compMembers = ((members ?? []) as any[]).filter((m: any) => groupIds.includes(m.group_id));
        const pmIds = [...new Set([
          ...compMembers.map((m: any) => m.athlete_id),
          ...(pmatches ?? []).flatMap((m: any) => [m.athlete1_id, m.athlete2_id]),
        ])].filter(Boolean) as string[];
        const pmProfMap: Record<string, string> = {};
        if (pmIds.length > 0) {
          const { data: profs } = await supabase.from('profiles').select('id, username').in('id', pmIds);
          (profs ?? []).forEach((p: any) => { pmProfMap[p.id] = p.username; });
        }
        compMembers.forEach((m: any) => { m.username = pmProfMap[m.athlete_id] ?? '—'; });
        setPoolMembers(compMembers);
        setPoolMatches(((pmatches ?? []) as any[]).map((m: any) => ({
          ...m,
          a1_username: pmProfMap[m.athlete1_id] ?? '—',
          a2_username: pmProfMap[m.athlete2_id] ?? '—',
        })));
      }
      if (format === 'swiss') {
        const [{ data: rounds }, { data: pairings }, { data: stds }] = await Promise.all([
          supabase.from('inter_swiss_rounds').select('*')
            .eq('competition_id', competitionId).order('round_number'),
          supabase.from('inter_swiss_pairings').select('*')
            .eq('competition_id', competitionId),
          supabase.from('inter_swiss_standings').select('*')
            .eq('competition_id', competitionId).order('points', { ascending: false }),
        ]);
        setSwissRounds(rounds ?? []);
        const swIds = [...new Set([
          ...(pairings ?? []).flatMap((p: any) => [p.athlete1_id, p.athlete2_id]),
          ...(stds ?? []).map((s: any) => s.athlete_id),
        ])].filter(Boolean) as string[];
        const swProfMap: Record<string, string> = {};
        if (swIds.length > 0) {
          const { data: profs } = await supabase.from('profiles').select('id, username').in('id', swIds);
          (profs ?? []).forEach((p: any) => { swProfMap[p.id] = p.username; });
        }
        setSwissPairings(((pairings ?? []) as any[]).map((p: any) => ({
          ...p,
          a1_username: swProfMap[p.athlete1_id] ?? '—',
          a2_username: p.athlete2_id ? swProfMap[p.athlete2_id] ?? '—' : 'BYE',
        })));
        setSwissStandings(((stds ?? []) as any[]).map((s: any) => ({
          ...s,
          username: swProfMap[s.athlete_id] ?? '—',
        })));
      }
    }

    if (user) {
      const [{ data: reg }, { data: sc }, { data: tm }] = await Promise.all([
        supabase.from('inter_registrations')
          .select('*').eq('competition_id', competitionId).eq('athlete_id', user.id).maybeSingle(),
        supabase.from('inter_scores')
          .select('*, wod:inter_competition_wods(title, order_index)')
          .eq('competition_id', competitionId).eq('athlete_id', user.id),
        supabase.from('inter_teams')
          .select('*').eq('competition_id', competitionId).eq('captain_id', user.id).maybeSingle(),
      ]);
      setMyReg(reg);
      setMyTeam(tm);
      setMyScores((sc ?? []).map((x: any) => ({ ...x, wod: Array.isArray(x.wod) ? x.wod[0] : x.wod })));
    }
    } catch (e) { captureError(e, { screen: 'InterCompetitionDetail', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [competitionId, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime: refresh standings on new validated score
  useEffect(() => {
    const channel = supabase
      .channel(`inter_scores_${competitionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inter_scores', filter: `competition_id=eq.${competitionId}` }, () => {
        load();
      })
      .subscribe();
    realtimeRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [competitionId]);

  async function handleRegister() {
    if (!user) return;
    setRegistering(true);
    const { error } = await supabase.from('inter_registrations').insert({
      competition_id: competitionId,
      athlete_id: user.id,
      box_id: null,
    });
    if (error) {
      Alert.alert(t('common.error'), error.code === '23505' ? t('interDetail.alreadyRegistered') : error.message);
    } else {
      trackInterCompRegister(competitionId, comp?.format ?? 'unknown');
      await load();
    }
    setRegistering(false);
  }

  async function handleUnregister() {
    if (!myReg) return;
    Alert.alert(t('interDetail.unregister'), t('interDetail.unregisterConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'), style: 'destructive',
        onPress: async () => {
          await supabase.from('inter_registrations').delete().eq('id', myReg.id);
          await load();
        },
      },
    ]);
  }

  const isRevealed = (w: any) => w.revealed_at && w.revealed_at <= new Date().toISOString();
  const myScoreForWod = (wodId: string) => myScores.find(s => s.wod_id === wodId);
  const now = new Date().toISOString();

  if (loading) return (
    <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );
  if (!comp) return (
    <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
      <Text style={{ color: theme.textMuted }}>{t('interDetail.notFound')}</Text>
    </View>
  );

  const canRegister = comp.status === 'open' || comp.status === 'active';

  return (
    <View style={S.container}>
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronRight size={22} color={theme.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <View style={S.headerIcon}>
          <Globe2 size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle} numberOfLines={1}>{comp.title}</Text>
          <Text style={S.headerSub}>
            {FORMAT_LABEL[comp.format] ?? comp.format} · {comp.type === 'individual' ? t('interComp.individual') : t('interComp.team', { n: comp.team_size })}
          </Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={S.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 0 }}>
        {(['Infos', 'WODs', 'Inscription',
          ...(comp?.format === 'bracket' ? ['Bracket' as Tab] : []),
          ...(comp?.format === 'swiss' ? ['Suisse' as Tab] : []),
          ...(comp?.format === 'league' ? ['Ligue' as Tab] : []),
          ...(comp?.format === 'pool' ? ['Poules' as Tab] : []),
          'Classement',
        ] as Tab[]).map(tabKey => (
          <TouchableOpacity key={tabKey} style={[S.tabItem, tab === tabKey && S.tabActive]} onPress={() => setTab(tabKey)}>
            <Text style={[S.tabText, tab === tabKey && S.tabTextActive]}>{TAB_LABEL[tabKey]}</Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
      >

        {/* ── INFOS ── */}
        {tab === 'Infos' && (
          <View style={{ gap: 16 }}>
            {comp.description ? (
              <View style={S.infoCard}>
                <Text style={S.infoLabel}>{t('interDetail.about')}</Text>
                <Text style={S.infoText}>{comp.description}</Text>
              </View>
            ) : null}

            <View style={S.infoCard}>
              <Text style={S.infoLabel}>{t('interDetail.details')}</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {[
                  { icon: Trophy,   label: t('interDetail.format'),    val: FORMAT_LABEL[comp.format] ?? comp.format },
                  { icon: Users,    label: t('interDetail.type'),      val: comp.type === 'individual' ? t('interComp.individual') : t('interDetail.teamOf', { n: comp.team_size }) },
                  { icon: Users,    label: t('interDetail.registered'),  val: comp.max_participants ? `${myReg ? '✓ ' : ''}/ ${comp.max_participants} max` : t('interDetail.unlimited') },
                  { icon: Calendar, label: t('interDetail.start'),     val: comp.starts_at ? new Date(comp.starts_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                  { icon: Calendar, label: t('interDetail.end'),       val: comp.ends_at   ? new Date(comp.ends_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                ].map(({ icon: Icon, label, val }) => (
                  <View key={label} style={S.detailRow}>
                    <Icon size={14} color={theme.textMuted} />
                    <Text style={S.detailLabel}>{label}</Text>
                    <Text style={S.detailVal}>{val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {comp.rules ? (
              <View style={S.infoCard}>
                <Text style={S.infoLabel}>{t('interDetail.rules')}</Text>
                <Text style={S.infoText}>{comp.rules}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── WODs ── */}
        {tab === 'WODs' && (
          <View style={{ gap: 12 }}>
            {wods.length === 0 ? (
              <View style={S.empty}>
                <Dumbbell size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>{t('interDetail.wodsSoon')}</Text>
              </View>
            ) : (
              wods.map(w => {
                const revealed = isRevealed(w);
                const myScore  = myScoreForWod(w.id);
                return (
                  <View key={w.id} style={[S.wodCard, !revealed && S.wodLocked]}>
                    <View style={S.wodHeader}>
                      <View style={S.wodNum}>
                        <Text style={S.wodNumText}>W{w.order_index}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.wodTitle, !revealed && { color: theme.textMuted }]}>
                          {revealed ? w.title : t('interDetail.wodNotRevealed', { n: w.order_index })}
                        </Text>
                        {!revealed && w.revealed_at ? (
                          <Text style={S.wodRevealDate}>
                            {t('interDetail.revealedOn', { date: new Date(w.revealed_at).toLocaleString(dateLocale) })}
                          </Text>
                        ) : null}
                      </View>
                      {!revealed && <Lock size={16} color={theme.textMuted} />}
                    </View>

                    {revealed && w.description ? (
                      <Text style={S.wodDesc}>{w.description}</Text>
                    ) : null}

                    {revealed && (
                      <View style={S.wodMeta}>
                        {w.time_cap ? (
                          <View style={S.metaChip}>
                            <Clock size={11} color={theme.textMuted} />
                            <Text style={S.metaChipText}>{t('interDetail.minCap', { n: w.time_cap })}</Text>
                          </View>
                        ) : null}
                        <View style={S.metaChip}>
                          <Text style={S.metaChipText}>{w.scoring_type}</Text>
                        </View>
                      </View>
                    )}

                    {/* My score or submit button */}
                    {revealed && myReg && (
                      myScore ? (
                        <View style={[S.scoreChip, { backgroundColor: myScore.status === 'validated' ? `${theme.success}15` : myScore.status === 'rejected' ? `${theme.error}15` : `${theme.accent}15` }]}>
                          <Text style={[S.scoreChipVal, { color: myScore.status === 'validated' ? theme.success : myScore.status === 'rejected' ? theme.error : theme.accent }]}>
                            {myScore.score_display ?? myScore.score_value}
                          </Text>
                          <Text style={[S.scoreChipStatus, { color: myScore.status === 'validated' ? theme.success : myScore.status === 'rejected' ? theme.error : theme.textMuted }]}>
                            {myScore.status === 'validated' ? t('interDetail.validated') : myScore.status === 'rejected' ? t('interDetail.rejected') : t('interDetail.pending')}
                          </Text>
                        </View>
                      ) : comp.status !== 'closed' ? (
                        <TouchableOpacity
                          style={S.submitBtn}
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('InterScoreSubmit', {
                            competitionId,
                            wodId: w.id,
                            wodTitle: w.title,
                            wodDescription: w.description ?? '',
                            timeCap: w.time_cap,
                            scoringType: w.scoring_type,
                            existingScore: null,
                          })}
                        >
                          <Trophy size={15} color="#fff" />
                          <Text style={S.submitBtnText}>{t('interDetail.submitScore')}</Text>
                        </TouchableOpacity>
                      ) : null
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── INSCRIPTION ── */}
        {tab === 'Inscription' && (
          <View style={{ gap: 16 }}>
            {/* TEAM competition */}
            {comp.type === 'team' ? (
              <>
                {myTeam ? (
                  <View style={S.registeredCard}>
                    <CheckCircle2 size={28} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.registeredTitle}>{t('interDetail.teamNamed', { name: myTeam.name })}</Text>
                      <Text style={S.registeredSub}>{t('interDetail.youAreCaptain')}</Text>
                    </View>
                  </View>
                ) : myReg ? (
                  <View style={S.registeredCard}>
                    <CheckCircle2 size={28} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.registeredTitle}>{t('interDetail.inATeam')}</Text>
                      <Text style={S.registeredSub}>{t('interDetail.checkWodsTab')}</Text>
                    </View>
                  </View>
                ) : null}
                {canRegister && (
                  <TouchableOpacity
                    style={S.registerBtn}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('InterTeam', { competitionId, teamSize: comp.team_size })}
                  >
                    <UserPlus size={18} color="#fff" />
                    <Text style={S.registerBtnText}>{myTeam ? t('interDetail.manageTeam') : t('interDetail.createJoinTeam')}</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              /* INDIVIDUAL competition */
              myReg ? (
                <View style={S.registeredCard}>
                  <CheckCircle2 size={28} color={theme.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.registeredTitle}>{t('interDetail.youAreRegistered')}</Text>
                    <Text style={S.registeredSub}>{t('interDetail.checkWodsTab')}</Text>
                  </View>
                </View>
              ) : canRegister ? (
                <TouchableOpacity style={S.registerBtn} activeOpacity={0.85} onPress={handleRegister} disabled={registering}>
                  {registering
                    ? <ActivityIndicator color="#fff" />
                    : <>
                      <Globe2 size={18} color="#fff" />
                      <Text style={S.registerBtnText}>{t('interDetail.registerToComp')}</Text>
                    </>
                  }
                </TouchableOpacity>
              ) : (
                <View style={S.closedBox}>
                  <XCircle size={28} color={theme.textMuted} />
                  <Text style={S.closedText}>{t('interDetail.registrationsClosed')}</Text>
                </View>
              )
            )}

            <View style={S.infoCard}>
              <Text style={S.infoLabel}>{t('interDetail.howItWorks')}</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {(t('interDetail.howSteps', { returnObjects: true }) as string[]).map(step => (
                  <Text key={step} style={S.infoText}>{step}</Text>
                ))}
              </View>
            </View>

            {myReg && comp.status !== 'closed' && (
              <TouchableOpacity style={S.unregisterBtn} activeOpacity={0.8} onPress={handleUnregister}>
                <Text style={S.unregisterBtnText}>{t('interDetail.unregister')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── BRACKET ── */}
        {tab === 'Bracket' && comp?.format === 'bracket' && (
          <View style={{ gap: 12 }}>
            {bracketMatches.length === 0 ? (
              <View style={S.empty}>
                <GitBranch size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>{t('interDetail.bracketNotGenerated')}</Text>
              </View>
            ) : (
              Object.entries(
                bracketMatches.reduce((acc: Record<number, any[]>, m: any) => {
                  (acc[m.round] ??= []).push(m);
                  return acc;
                }, {})
              ).sort(([a], [b]) => Number(a) - Number(b)).map(([round, matches]) => (
                <View key={round} style={S.infoCard}>
                  <Text style={S.infoLabel}>{t('interDetail.round', { n: round })}</Text>
                  {(matches as any[]).map((match: any) => {
                    const isMyMatch = user && (match.participant1_id === user.id || match.participant2_id === user.id);
                    const iWon = match.winner_id === user?.id;
                    const iLost = match.winner_id && match.winner_id !== user?.id && isMyMatch;
                    return (
                      <View key={match.id} style={[S.bracketMatchCard, isMyMatch && { borderColor: theme.accent, borderWidth: 1.5 }]}>
                        <View style={S.bracketMatchRow}>
                          <View style={{ flex: 1, alignItems: 'center' }}>
                            <Text style={[
                              S.bracketPlayer,
                              match.winner_id === match.participant1_id && { color: theme.success },
                              match.participant1_id === user?.id && { color: theme.accent },
                            ]}>
                              {match.p1_username ?? 'BYE'}
                            </Text>
                          </View>
                          <View style={S.bracketVsBadge}>
                            <Text style={S.bracketVsText}>{match.status === 'completed' ? '✓' : match.status === 'bye' ? 'BYE' : 'VS'}</Text>
                          </View>
                          <View style={{ flex: 1, alignItems: 'center' }}>
                            <Text style={[
                              S.bracketPlayer,
                              match.winner_id === match.participant2_id && { color: theme.success },
                              match.participant2_id === user?.id && { color: theme.accent },
                            ]}>
                              {match.p2_username ?? 'BYE'}
                            </Text>
                          </View>
                        </View>
                        {match.status === 'completed' && (
                          <Text style={{ fontSize: 11, color: theme.success, textAlign: 'center', marginTop: 6, fontWeight: '700' }}>
                            {t('interDetail.winner', { name: match.winner_id === match.participant1_id ? match.p1_username : match.p2_username })}
                          </Text>
                        )}
                        {match.status === 'bye' && (
                          <Text style={{ fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
                            {t('interDetail.byeAdvance')}
                          </Text>
                        )}
                        {isMyMatch && match.status === 'pending' && comp.status !== 'closed' && (
                          <TouchableOpacity
                            style={[S.submitBtn, { marginTop: 8 }]}
                            activeOpacity={0.8}
                            onPress={() => {
                              const matchWod = wods.find(w => w.id === match.wod_id) ?? wods[0];
                              if (!matchWod) { Alert.alert(t('interDetail.noWodTitle'), t('interDetail.noWodMsg')); return; }
                              navigation.navigate('InterScoreSubmit', {
                                competitionId,
                                wodId: matchWod.id,
                                wodTitle: matchWod.title,
                                wodDescription: matchWod.description ?? '',
                                timeCap: matchWod.time_cap,
                                scoringType: matchWod.scoring_type,
                                existingScore: null,
                              });
                            }}
                          >
                            <Trophy size={15} color="#fff" />
                            <Text style={S.submitBtnText}>{t('interDetail.submitScore')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── LIGUE ── */}
        {tab === 'Ligue' && comp?.format === 'league' && (
          <View style={{ gap: 16 }}>
            {/* League standings */}
            <View style={S.infoCard}>
              <Text style={S.infoLabel}>{t('interDetail.leagueStandings')}</Text>
              {leagueStandings.length === 0 ? (
                <Text style={S.infoText}>{t('interDetail.noLeagueStandings')}</Text>
              ) : (
                leagueStandings.map((s: any, i: number) => (
                  <View key={s.id} style={[S.rankRow, s.athlete_id === user?.id && { backgroundColor: `${theme.accent}10` }]}>
                    <Text style={[S.rankNum, {
                      color: i === 0 ? '#C9A227' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : theme.textMuted,
                    }]}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[S.rankName, s.athlete_id === user?.id && { color: theme.accent }]}>
                        {s.username ?? '—'}{s.athlete_id === user?.id ? t('interDetail.meSuffix') : ''}
                      </Text>
                      <Text style={S.rankBox}>{t('interDetail.leagueRecord', { wins: s.wins, podiums: s.podiums, rounds: s.rounds_played })}</Text>
                    </View>
                    <Text style={S.rankScore}>{t('interDetail.points', { n: s.total_points })}</Text>
                  </View>
                ))
              )}
            </View>

            {/* League rounds */}
            <View style={S.infoCard}>
              <Text style={S.infoLabel}>{t('interDetail.rounds', { count: leagueRounds.length })}</Text>
              {leagueRounds.length === 0 ? (
                <Text style={S.infoText}>{t('interDetail.noRounds')}</Text>
              ) : (
                leagueRounds.map((r: any) => {
                  const roundWod = wods.find(w => w.id === r.wod_id);
                  return (
                    <View key={r.id} style={[S.leagueRoundCard]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                          {r.title ?? t('interDetail.roundDay', { n: r.round_number })}
                        </Text>
                        <View style={[S.leagueStatusBadge, {
                          backgroundColor: r.status === 'completed' ? `${theme.success}20` : `${theme.accent}20`,
                        }]}>
                          <Text style={[S.leagueStatusText, {
                            color: r.status === 'completed' ? theme.success : theme.accent,
                          }]}>
                            {r.status === 'completed' ? t('interDetail.statusCompleted') : r.status === 'active' ? t('interDetail.statusActive') : t('interDetail.statusUpcoming')}
                          </Text>
                        </View>
                      </View>
                      {roundWod && (
                        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                          {t('interDetail.wodLabel', { title: roundWod.title })}
                        </Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* ── POULES ── */}
        {tab === 'Poules' && comp?.format === 'pool' && (
          <View style={{ gap: 16 }}>
            {poolGroups.length === 0 ? (
              <View style={S.empty}>
                <Users size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>{t('interDetail.poolsNotGenerated')}</Text>
              </View>
            ) : (
              poolGroups.map((group: any) => {
                const members = poolMembers.filter((m: any) => m.group_id === group.id).sort((a: any, b: any) => b.points - a.points);
                const matches = poolMatches.filter((m: any) => m.group_id === group.id);
                const myGroup = members.some((m: any) => m.athlete_id === user?.id);
                return (
                  <View key={group.id} style={[S.infoCard, myGroup && { borderColor: theme.accent, borderWidth: 1.5 }]}>
                    <Text style={S.infoLabel}>
                      {group.group_name}{myGroup ? t('interDetail.myPoolSuffix') : ''}
                    </Text>
                    {/* Group standings */}
                    {members.map((m: any, i: number) => (
                      <View key={m.id} style={[S.rankRow, m.athlete_id === user?.id && { backgroundColor: `${theme.accent}10` }]}>
                        <Text style={[S.rankNum, {
                          color: i === 0 ? '#C9A227' : i === 1 ? '#9CA3AF' : theme.textMuted,
                        }]}>
                          {i + 1}.
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.rankName, m.athlete_id === user?.id && { color: theme.accent }]}>
                            {m.username ?? '—'}{m.athlete_id === user?.id ? t('interDetail.meSuffix') : ''}
                          </Text>
                          <Text style={S.rankBox}>{t('interDetail.poolRecord', { wins: m.wins, draws: m.draws, losses: m.losses, diff: `${m.score_for - m.score_against > 0 ? '+' : ''}${m.score_for - m.score_against}` })}</Text>
                        </View>
                        <Text style={S.rankScore}>{t('interDetail.points', { n: m.points })}</Text>
                      </View>
                    ))}

                    {/* Group matches */}
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: theme.textMuted, marginBottom: 6 }}>
                        {t('interDetail.matches', { done: matches.filter((m: any) => m.status === 'completed').length, total: matches.length })}
                      </Text>
                      {matches.map((match: any) => {
                        const isMyMatch = user && (match.athlete1_id === user.id || match.athlete2_id === user.id);
                        return (
                          <View key={match.id} style={[S.poolMatchRow, isMyMatch && { backgroundColor: `${theme.accent}08` }]}>
                            <Text style={[
                              S.poolMatchPlayer,
                              match.winner_id === match.athlete1_id && { color: theme.success, fontWeight: '800' as any },
                              match.athlete1_id === user?.id && { color: theme.accent },
                            ]}>
                              {match.a1_username}
                            </Text>
                            <Text style={S.poolMatchScore}>
                              {match.status === 'completed' ? `${match.score1} - ${match.score2}` : t('interDetail.vs')}
                            </Text>
                            <Text style={[
                              S.poolMatchPlayer,
                              match.winner_id === match.athlete2_id && { color: theme.success, fontWeight: '800' as any },
                              match.athlete2_id === user?.id && { color: theme.accent },
                            ]}>
                              {match.a2_username}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── SUISSE ── */}
        {tab === 'Suisse' && comp?.format === 'swiss' && (
          <View style={{ gap: 16 }}>
            {swissStandings.length === 0 && swissRounds.length === 0 ? (
              <View style={S.empty}>
                <Swords size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>{t('interDetail.swissNotStarted')}</Text>
              </View>
            ) : (
              <>
                {/* Standings */}
                {swissStandings.length > 0 && (
                  <View style={S.infoCard}>
                    <Text style={S.infoLabel}>{t('interDetail.standings')}</Text>
                    {swissStandings.map((st: any, i: number) => (
                      <View key={st.id} style={[S.rankRow, st.athlete_id === user?.id && { backgroundColor: `${theme.accent}10` }]}>
                        <Text style={[S.rankNum, {
                          color: i === 0 ? '#C9A227' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : theme.textMuted,
                        }]}>
                          {i + 1}.
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.rankName, st.athlete_id === user?.id && { color: theme.accent }]}>
                            {st.username}{st.athlete_id === user?.id ? t('interDetail.meSuffix') : ''}
                          </Text>
                          <Text style={S.rankBox}>{t('interDetail.swissRecord', { wins: st.wins, draws: st.draws, losses: st.losses, buchholz: st.buchholz })}</Text>
                        </View>
                        <Text style={S.rankScore}>{t('interDetail.points', { n: st.points })}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Rounds */}
                {swissRounds.map((round: any) => {
                  const roundPairings = swissPairings.filter((p: any) => p.round_id === round.id);
                  const myPairing = roundPairings.find((p: any) =>
                    p.athlete1_id === user?.id || p.athlete2_id === user?.id
                  );
                  return (
                    <View key={round.id} style={[S.infoCard, myPairing && { borderColor: theme.accent, borderWidth: 1.5 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={S.infoLabel}>{t('interDetail.round', { n: round.round_number })}</Text>
                        <Text style={{ fontSize: 11, color: round.status === 'completed' ? theme.success : theme.textMuted }}>
                          {round.status === 'completed' ? t('interDetail.statusCompleted') : t('interDetail.statusActive')}
                        </Text>
                      </View>
                      {roundPairings.map((pairing: any) => {
                        const isMyPairing = user && (pairing.athlete1_id === user.id || pairing.athlete2_id === user.id);
                        return (
                          <View key={pairing.id} style={[S.poolMatchRow, isMyPairing && { backgroundColor: `${theme.accent}08` }]}>
                            <Text style={[
                              S.poolMatchPlayer,
                              pairing.winner_id === pairing.athlete1_id && { color: theme.success, fontWeight: '800' as any },
                              pairing.athlete1_id === user?.id && { color: theme.accent },
                            ]}>
                              {pairing.a1_username}
                            </Text>
                            <Text style={S.poolMatchScore}>
                              {pairing.status === 'bye' ? 'BYE' :
                               pairing.status === 'completed' ? `${pairing.score1} - ${pairing.score2}` : t('interDetail.vs')}
                            </Text>
                            <Text style={[
                              S.poolMatchPlayer,
                              pairing.winner_id === pairing.athlete2_id && { color: theme.success, fontWeight: '800' as any },
                              pairing.athlete2_id === user?.id && { color: theme.accent },
                            ]}>
                              {pairing.a2_username}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── CLASSEMENT ── */}
        {tab === 'Classement' && (
          <View style={{ gap: 16 }}>
            {wods.length === 0 ? (
              <View style={S.empty}>
                <Trophy size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>{t('interDetail.noWodAvailable')}</Text>
              </View>
            ) : wods.filter(w => isRevealed(w)).map(w => {
              const ws = standings.filter(s => s.wod_id === w.id);
              return (
                <View key={w.id} style={S.rankCard}>
                  <View style={S.rankHeader}>
                    <View style={S.wodNum}>
                      <Text style={S.wodNumText}>W{w.order_index}</Text>
                    </View>
                    <Text style={S.rankTitle}>{w.title}</Text>
                  </View>
                  {ws.length === 0 ? (
                    <Text style={S.noScores}>{t('interDetail.noValidatedScore')}</Text>
                  ) : (
                    ws.map(s => (
                      <View key={s.athlete_id ?? s.team_id}
                        style={[S.rankRow, s.rank <= 3 && { backgroundColor: `${theme.accent}08` }]}>
                        <Text style={[S.rankNum, {
                          color: s.rank === 1 ? '#C9A227' : s.rank === 2 ? '#9CA3AF' : s.rank === 3 ? '#B45309' : theme.textMuted,
                        }]}>
                          {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.rankName, s.athlete_id === user?.id && { color: theme.accent }]}>
                            {s.username ?? '—'}{s.athlete_id === user?.id ? t('interDetail.meSuffix') : ''}
                          </Text>
                          <Text style={S.rankBox}>{s.box_name ?? t('interDetail.unknownBox')}</Text>
                        </View>
                        <Text style={S.rankScore}>{s.score_display ?? s.score_value}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
            {wods.filter(w => isRevealed(w)).length === 0 && (
              <View style={S.empty}>
                <Trophy size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>{t('interDetail.standingsAfterReveal')}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn:    { padding: 4 },
    headerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#C9A22720', justifyContent: 'center', alignItems: 'center' },
    headerTitle:{ fontSize: 17, fontWeight: '800', color: theme.text },
    headerSub:  { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    tabBar: {
      flexDirection: 'row', backgroundColor: theme.card,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    tabItem:      { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive:    { borderBottomColor: theme.accent },
    tabText:      { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    tabTextActive:{ color: theme.accent, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 140 },
    infoCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, padding: 16,
    },
    infoLabel: { fontSize: 11, fontWeight: '800', color: theme.accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    infoText:  { fontSize: 13, color: theme.textMuted, lineHeight: 20 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel:{ fontSize: 12, color: theme.textMuted, width: 60 },
    detailVal:  { fontSize: 12, fontWeight: '700', color: theme.text, flex: 1 },
    wodCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, padding: 16,
    },
    wodLocked: { opacity: 0.6 },
    wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    wodNum:    { width: 34, height: 34, borderRadius: 10, backgroundColor: '#C9A22715', justifyContent: 'center', alignItems: 'center' },
    wodNumText:{ fontSize: 12, fontWeight: '900', color: '#C9A227' },
    wodTitle:  { fontSize: 15, fontWeight: '700', color: theme.text },
    wodRevealDate: { fontSize: 11, color: theme.accent, marginTop: 2 },
    wodDesc:   { fontSize: 13, color: theme.textMuted, lineHeight: 19, marginBottom: 10 },
    wodMeta:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
    metaChip:  { flexDirection: 'row', gap: 4, backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
    metaChipText: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' },
    scoreChip: { borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    scoreChipVal:    { fontSize: 16, fontWeight: '900' },
    scoreChipStatus: { fontSize: 11, fontWeight: '700' },
    submitBtn: {
      flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#C9A227', borderRadius: 12, padding: 12, marginTop: 4,
    },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    registeredCard: {
      flexDirection: 'row', gap: 12, alignItems: 'center',
      backgroundColor: `${theme.success}12`, borderRadius: 16,
      borderWidth: 1, borderColor: `${theme.success}30`, padding: 16,
    },
    registeredTitle:{ fontSize: 16, fontWeight: '800', color: theme.text },
    registeredSub:  { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    registerBtn: {
      flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#C9A227', borderRadius: 16, padding: 18,
    },
    registerBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    closedBox: {
      flexDirection: 'row', gap: 12, alignItems: 'center',
      backgroundColor: theme.surface, borderRadius: 16, padding: 16,
    },
    closedText: { fontSize: 14, fontWeight: '600', color: theme.textMuted },
    unregisterBtn: {
      alignItems: 'center', padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    unregisterBtnText: { fontSize: 13, fontWeight: '600', color: theme.error ?? '#EF4444' },
    rankCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
    },
    rankHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    rankTitle:  { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    rankRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    rankNum:    { width: 32, textAlign: 'center', fontSize: 14, fontWeight: '900' },
    rankName:   { fontSize: 13, fontWeight: '700', color: theme.text },
    rankBox:    { fontSize: 11, color: theme.textMuted },
    rankScore:  { fontSize: 14, fontWeight: '900', color: '#C9A227' },
    noScores:   { fontSize: 13, color: theme.textMuted, padding: 14 },
    empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
    // Bracket styles
    bracketMatchCard: {
      backgroundColor: theme.surface, borderRadius: 12,
      padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.border,
    },
    bracketMatchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bracketPlayer:   { fontSize: 13, fontWeight: '700', color: theme.text },
    bracketVsBadge:  { width: 36, height: 36, borderRadius: 18, backgroundColor: `${theme.accent}15`, justifyContent: 'center', alignItems: 'center' },
    bracketVsText:   { fontSize: 11, fontWeight: '900', color: theme.accent },
    // League styles
    leagueRoundCard: { backgroundColor: theme.surface, borderRadius: 10, padding: 12, marginTop: 8 },
    leagueStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    leagueStatusText:  { fontSize: 10, fontWeight: '800' },
    // Pool styles
    poolMatchRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 6, marginBottom: 2 },
    poolMatchPlayer: { fontSize: 12, fontWeight: '600', color: theme.text, flex: 1, textAlign: 'center' },
    poolMatchScore:  { fontSize: 12, fontWeight: '700', color: theme.textMuted, marginHorizontal: 8 },
  });
}
