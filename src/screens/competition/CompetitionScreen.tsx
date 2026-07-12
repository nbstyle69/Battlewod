import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Alert, LayoutAnimation,
} from 'react-native';
import { Trophy, Users, Clock, Zap, ChevronRight, ChevronLeft, Plus, MapPin, Flame, Globe2, Info, CheckCircle } from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/designTokens';
import { CompetitionStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import GlassBackground from '../../components/glass/GlassBackground';
import { useTranslation } from 'react-i18next';

type Nav = NativeStackNavigationProp<CompetitionStackParamList, 'CompetitionList'>;



interface MiniTournament {
  id: string;
  wod_name: string;
  wod_type: string;
  level: string;
  score_mode: string;
  max_players: number;
  status: string;
  elo_reward: number;
  ends_at: string;
  participant_count: number;
  has_joined: boolean;
  creator_name: string;
}

interface OfficialWod {
  id: string;
  wod_name: string;
  wod_type: string;
  level: string;
  ends_at: string;
  participant_count: number;
  has_scored: boolean;
}

interface Tournament {
  id: string;
  name: string;
  level: string;
  status: string;
  max_participants: number;
  prize: string | null;
  start_date: string | null;
}

export default function CompetitionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<CompetitionStackParamList, 'CompetitionList'>>();
  const { theme } = useTheme();
  const { currentBox } = useAuth();
  const { t } = useTranslation();
  const TABS = [t('competition.tabTournaments'), t('competition.tabMini'), t('competition.tabPhysical'), t('competition.tabInter')];
  const S = createStyles(theme);
  const [activeTab,    setActiveTab]    = useState(route.params?.initialTab ?? 0);
  const [tournaments,  setTournaments]  = useState<Tournament[]>([]);
  const [tLoading,     setTLoading]     = useState(false);
  const [tRefreshing,  setTRefreshing]  = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [myRegistered, setMyRegistered] = useState<Record<string, boolean>>({});
  const [miniTournaments, setMiniTournaments] = useState<MiniTournament[]>([]);
  const [miniLoading, setMiniLoading] = useState(false);
  const [officialWod, setOfficialWod] = useState<OfficialWod | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (route.params?.initialTab !== undefined) setActiveTab(route.params.initialTab);
  }, [route.params?.initialTab]);

  const loadTournaments = useCallback(async () => {
    setTLoading(true);
    if (!currentBox) { setTLoading(false); setTRefreshing(false); return; }
    try {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, level, status, max_participants, prize, start_date')
      .eq('box_id', currentBox.id)
      .in('status', ['open', 'active'])
      .order('created_at', { ascending: false });
    const list = (data ?? []) as Tournament[];
    setTournaments(list);
    // Fetch participant counts
    if (list.length > 0) {
      const counts: Record<string, number> = {};
      await Promise.all(list.map(async t => {
        const { count } = await supabase
          .from('tournament_participants')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', t.id);
        counts[t.id] = count ?? 0;
      }));
      setParticipantCounts(counts);

      // Fetch my registration status across all listed tournaments (all formats)
      if (user) {
        const ids = list.map(t => t.id);
        const { data: myRows } = await supabase
          .from('tournament_participants')
          .select('tournament_id')
          .eq('athlete_id', user.id)
          .in('tournament_id', ids);
        const reg: Record<string, boolean> = {};
        (myRows ?? []).forEach((r: any) => { reg[r.tournament_id] = true; });
        setMyRegistered(reg);
      } else {
        setMyRegistered({});
      }
    }
    } catch (e) { captureError(e, { screen: 'Competition', action: 'loadTournaments' }); }
    setTLoading(false);
    setTRefreshing(false);
  }, [currentBox, user]);

  const loadMiniTournaments = useCallback(async () => {
    if (!user) return;
    setMiniLoading(true);
    try {
    const { data } = await supabase
      .from('daily_tournaments')
      .select(`
        *,
        participants:daily_tournament_participants(user_id),
        creator:profiles!creator_id(username)
      `)
      .eq('is_official', false)
      .in('status', ['open', 'active'])
      .order('created_at', { ascending: false })
      .limit(20);

    const mapped: MiniTournament[] = (data ?? []).map((t: any) => ({
      id: t.id,
      wod_name: t.wod_name,
      wod_type: t.wod_type,
      level: t.level,
      score_mode: t.score_mode,
      max_players: t.max_players,
      status: t.status,
      elo_reward: t.elo_reward,
      ends_at: t.ends_at,
      participant_count: t.participants?.length ?? 0,
      has_joined: (t.participants ?? []).some((p: any) => p.user_id === user.id),
      creator_name: (Array.isArray(t.creator) ? t.creator[0] : t.creator)?.username ?? '—',
    }));
    setMiniTournaments(mapped);
    } catch (e) { captureError(e, { screen: 'Competition', action: 'loadMiniTournaments' }); }
    setMiniLoading(false);
  }, [user]);

  const loadOfficialWod = useCallback(async () => {
    if (!user) return;
    try {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('daily_tournaments')
        .select(`
          id, wod_name, wod_type, level, ends_at,
          participants:daily_tournament_participants(user_id),
          scores:daily_tournament_scores(user_id)
        `)
        .eq('is_official', true)
        .gt('ends_at', nowIso)
        .order('official_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) { setOfficialWod(null); return; }
      setOfficialWod({
        id: data.id,
        wod_name: data.wod_name,
        wod_type: data.wod_type,
        level: data.level,
        ends_at: data.ends_at,
        participant_count: (data.participants ?? []).length,
        has_scored: (data.scores ?? []).some((s: { user_id: string }) => s.user_id === user.id),
      });
    } catch (e) { captureError(e, { screen: 'Competition', action: 'loadOfficialWod' }); }
  }, [user]);

  useEffect(() => { loadTournaments(); }, [loadTournaments, currentBox]);

  useFocusEffect(useCallback(() => { loadMiniTournaments(); loadOfficialWod(); }, [loadMiniTournaments, loadOfficialWod]));

  async function handleJoinMini(tournamentId: string) {
    if (!user) return;
    const { error } = await supabase.from('daily_tournament_participants').insert({
      tournament_id: tournamentId,
      user_id: user.id,
    });
    if (error) {
      if (error.code === '23505') Alert.alert(t('competition.alreadyJoined'), t('competition.alreadyParticipating'));
      else Alert.alert(t('common.error'), error.message);
      return;
    }
    loadMiniTournaments();
  }

  function timeLeft(endsAt: string): string {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return t('competition.finished');
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <View>
          <Text style={S.headerTitle}>{t('competition.title')}</Text>
          <Text style={S.headerSub}>{t('competition.subtitle')}</Text>
        </View>
      </View>

      <View style={S.tabs}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab(i); }}
            style={[S.tab, activeTab === i && S.tabActive]}
          >
            <Text style={[S.tabText, activeTab === i && S.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {activeTab === 0 && (
          <>
            <Text style={S.sectionTitle}>{t('competition.availableTournaments')}</Text>
            {tLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} />
            ) : tournaments.length === 0 ? (
              <View style={S.emptyBox}>
                <Text style={S.emptyEmoji}>🏆</Text>
                <Text style={S.emptyText}>{t('competition.noTournament')}</Text>
              </View>
            ) : (
              tournaments.map(tour => {
                const participants = participantCounts[tour.id] ?? 0;
                const pct = tour.max_participants > 0 ? (participants / tour.max_participants) * 100 : 0;
                const levelColor = LevelColors[tour.level as keyof typeof LevelColors] ?? theme.accent;
                return (
                  <TouchableOpacity
                    key={tour.id}
                    style={S.tournamentCard}
                    onPress={() => navigation.navigate('Tournament', { tournamentId: tour.id })}
                    activeOpacity={0.8}
                  >
                    <View style={S.tHeader}>
                      <Text style={S.tName}>{tour.name}</Text>
                      <View style={[
                        S.tStatus,
                        { backgroundColor: tour.status === 'active' ? `${theme.success}20` : `${theme.accent}20` },
                      ]}>
                        <Text style={[
                          S.tStatusText,
                          { color: tour.status === 'active' ? theme.success : theme.accent },
                        ]}>
                          {tour.status === 'active' ? t('competition.live') : t('competition.open')}
                        </Text>
                      </View>
                    </View>
                    {myRegistered[tour.id] && (
                      <View style={S.regBadge}>
                        <CheckCircle color={theme.success} size={13} />
                        <Text style={S.regBadgeText}>{t('competition.registered')}</Text>
                      </View>
                    )}
                    <View style={S.tInfo}>
                      <View style={S.tInfoItem}>
                        <Users color={theme.textMuted} size={14} />
                        <Text style={S.tInfoText}>{participants}/{tour.max_participants}</Text>
                      </View>
                      <View style={[S.levelPill, { backgroundColor: `${levelColor}20` }]}>
                        <Text style={[S.levelPillText, { color: levelColor }]}>
                          {(tour.level ?? 'RX').toUpperCase()}
                        </Text>
                      </View>
                      {tour.prize ? <Text style={S.tPrize}>{tour.prize}</Text> : null}
                    </View>
                    <View style={S.progressBar}>
                      <View style={[S.progressFill, { width: `${pct}%` as any }]} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {activeTab === 1 && (
          <>
            {officialWod && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={S.officialCard}
                onPress={() => navigation.navigate('DailyTournamentDetail', { tournamentId: officialWod.id })}
              >
                <View style={S.officialBadgeRow}>
                  <View style={S.officialBadge}>
                    <Flame color="#fff" size={13} />
                    <Text style={S.officialBadgeTxt}>{t('competition.wodOfDay')}</Text>
                  </View>
                  <Text style={S.officialTime}>{timeLeft(officialWod.ends_at)}</Text>
                </View>
                <Text style={S.officialName}>{officialWod.wod_name}</Text>
                <Text style={S.officialSub}>{officialWod.wod_type} · {officialWod.level.toUpperCase()}</Text>
                <View style={S.officialFooter}>
                  <View style={S.officialParticipants}>
                    <Users color={theme.textMuted} size={13} />
                    <Text style={S.officialParticipantsTxt}>
                      {t('competition.wodOfDayPlayers', { count: officialWod.participant_count })}
                    </Text>
                  </View>
                  <View style={[S.officialCta, officialWod.has_scored && { backgroundColor: `${theme.accent}15` }]}>
                    <Text style={[S.officialCtaTxt, officialWod.has_scored && { color: theme.accent }]}>
                      {officialWod.has_scored ? t('competition.wodOfDayScored') : t('competition.wodOfDayPlay')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            <View style={S.miniInfo}>
              <Zap color={theme.gold} size={16} />
              <Text style={S.miniInfoText}>{t('competition.miniInfo')}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[S.createButton, S.createGradient]}
              onPress={() => navigation.navigate('DailyTournaments')}
            >
                <Plus color="#fff" size={20} />
                <Text style={S.createText}>{t('competition.createDaily')}</Text>
            </TouchableOpacity>

            <Text style={S.sectionTitle}>{t('competition.openNow')}</Text>
            {miniLoading ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} />
            ) : miniTournaments.length === 0 ? (
              <View style={S.emptyBox}>
                <Text style={S.emptyEmoji}>⚡</Text>
                <Text style={S.emptyText}>{t('competition.noMini')}</Text>
              </View>
            ) : (
              miniTournaments.map(m => {
                const levelColor = LevelColors[m.level] ?? theme.textMuted;
                const isFull = m.participant_count >= m.max_players;
                const remaining = timeLeft(m.ends_at);
                const isFinished = new Date(m.ends_at).getTime() - Date.now() <= 0;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={S.miniCard}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('DailyTournamentDetail', { tournamentId: m.id })}
                  >
                    <View style={S.miniHeader}>
                      <Text style={S.miniName}>{m.wod_name}</Text>
                      <View style={[S.levelPill, { backgroundColor: `${levelColor}20` }]}>
                        <Text style={[S.levelPillText, { color: levelColor }]}>
                          {m.level.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6 }}>{t('competition.byCreator', { name: m.creator_name, type: m.wod_type })}</Text>
                    <View style={S.miniFooter}>
                      <View style={S.miniParticipants}>
                        {Array.from({ length: m.max_players }).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              S.participantDot,
                              { backgroundColor: i < m.participant_count ? theme.accent : theme.surface },
                            ]}
                          />
                        ))}
                        <Text style={S.miniParticipantsText}>{m.participant_count}/{m.max_players}</Text>
                      </View>
                      <View style={S.miniTime}>
                        <Flame color={isFinished ? theme.error : theme.accent} size={13} />
                        <Text style={[S.miniTimeText, isFinished && { color: theme.error }]}>{remaining}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Trophy color={theme.gold} size={12} />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.gold }}>+{m.elo_reward}</Text>
                      </View>
                    </View>
                    {!m.has_joined && !isFull ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={S.joinButton}
                        onPress={(e) => { e.stopPropagation(); handleJoinMini(m.id); }}
                      >
                        <Text style={S.joinButtonText}>{t('competition.join')}</Text>
                      </TouchableOpacity>
                    ) : m.has_joined ? (
                      <View style={[S.joinButton, { backgroundColor: `${theme.accent}15` }]}>
                        <Text style={[S.joinButtonText, { color: theme.accent }]}>{t('competition.joined')}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}

            {miniTournaments.length > 0 && (
              <TouchableOpacity
                style={{ alignItems: 'center', paddingVertical: 12 }}
                onPress={() => navigation.navigate('DailyTournaments')}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{t('competition.seeAllMini')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {activeTab === 2 && (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={S.physModeCard}
              onPress={() => navigation.navigate('PhysicalCompetition', { mode: 'qualification' })}
            >
              <View style={[S.physModeIcon, { backgroundColor: '#8B5CF620' }]}>
                <Zap color="#8B5CF6" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.physModeTitle}>{t('competition.onlineQualif')}</Text>
                <Text style={S.physModeDesc}>{t('competition.onlineQualifDesc')}</Text>
              </View>
              <ChevronRight color={theme.textMuted} size={18} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={S.physModeCard}
              onPress={() => navigation.navigate('PhysicalCompetition', { mode: 'info' })}
            >
              <View style={[S.physModeIcon, { backgroundColor: '#3B82F620' }]}>
                <Info color="#3B82F6" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.physModeTitle}>{t('competition.noQualif')}</Text>
                <Text style={S.physModeDesc}>{t('competition.noQualifDesc')}</Text>
              </View>
              <ChevronRight color={theme.textMuted} size={18} />
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 3 && (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[S.createButton, S.createGradient, { backgroundColor: 'rgba(201,162,39,0.25)', borderColor: 'rgba(201,162,39,0.8)' }]}
              onPress={() => navigation.navigate('InterCompetitionList')}
            >
              <Globe2 color="#fff" size={20} />
              <Text style={S.createText}>{t('competition.seeInterBox')}</Text>
            </TouchableOpacity>
            <View style={[S.physInfoBox, { borderColor: '#C9A22725', backgroundColor: '#C9A22710' }]}>
              <Text style={[S.physInfoTitle, { color: '#C9A227' }]}>{t('competition.interBoxTitle')}</Text>
              <Text style={S.physInfoText}>{t('competition.interBoxInfo')}</Text>
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  };
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card,
    borderBottomWidth: isDark ? 1 : 0, borderBottomColor: theme.border,
    ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: theme.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  tabs: {
    flexDirection: 'row', backgroundColor: theme.card,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.accent },
  tabText: { fontSize: 12, fontWeight: '600', color: theme.textMuted, textAlign: 'center' },
  tabTextActive: { color: theme.accent, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 140 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 12, marginTop: 8 },
  createButton: { marginBottom: 16 },
  createGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, padding: 16, gap: 8,
    backgroundColor: theme.ctaBg,
    borderWidth: 2, borderColor: theme.ctaBorder,
  },
  createText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  vsAvatar: {
    width: 46, height: 46, borderRadius: 16,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: theme.accent,
  },
  vsAvatarText: { fontSize: 18, fontWeight: '900', color: theme.text },
  levelPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  levelPillText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  tournamentCard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  tHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tName: { fontSize: 15, fontWeight: '700', color: theme.text, flex: 1 },
  tStatus: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tStatusText: { fontSize: 11, fontWeight: '700' },
  regBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: `${theme.success}15`, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, marginBottom: 10,
    borderWidth: 1, borderColor: `${theme.success}30`,
  },
  regBadgeText: { fontSize: 11, fontWeight: '800', color: theme.success },
  tInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tInfoText: { fontSize: 12, color: theme.textMuted },
  tPrize: { fontSize: 12, color: theme.gold, fontWeight: '700' },
  progressBar: {
    height: 4, backgroundColor: theme.surface,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 2 },
  miniInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${theme.gold}12`, borderRadius: 12,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: `${theme.gold}25`,
  },
  miniInfoText: { fontSize: 12, color: theme.gold, flex: 1 },
  officialCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1.5, borderColor: theme.accent,
    ...cardShadow,
  },
  officialBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  officialBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  officialBadgeTxt: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  officialTime: { fontSize: 12, fontWeight: '800', color: theme.accent },
  officialName: { fontSize: 18, fontWeight: '900', color: theme.text },
  officialSub: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginTop: 2 },
  officialFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  officialParticipants: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  officialParticipantsTxt: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  officialCta: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  officialCtaTxt: { fontSize: 12, fontWeight: '800', color: '#fff' },
  miniCard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  miniName: { fontSize: 15, fontWeight: '700', color: theme.text },
  miniFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  miniParticipants: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  participantDot: { width: 10, height: 10, borderRadius: 5 },
  miniParticipantsText: { fontSize: 12, color: theme.textSecondary, marginLeft: 4 },
  miniTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniTimeText: { fontSize: 12, color: theme.textMuted },
  joinButton: {
    borderRadius: 14, padding: 12, alignItems: 'center',
    backgroundColor: theme.accent, marginTop: 4,
  },
  joinButtonText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  emptyBox:   { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyEmoji: { fontSize: 36 },
  emptyText:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  physInfoBox: {
    backgroundColor: `#8B5CF610`, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: `#8B5CF625`, marginTop: 8,
  },
  physInfoTitle: { fontSize: 15, fontWeight: '700', color: '#8B5CF6', marginBottom: 6 },
  physInfoText:  { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  physModeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  physModeIcon: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  physModeTitle: { fontSize: 15, fontWeight: '800', color: theme.text },
  physModeDesc:  { fontSize: 12, color: theme.textMuted, marginTop: 2 },
}); }
