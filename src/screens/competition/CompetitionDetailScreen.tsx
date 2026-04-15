import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { ChevronLeft, Calendar, Users, Zap, Clock, Timer } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { AthleteLevel } from '../../types';
import { HomeStackParamList, TimerType } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import UserAvatar from '../../components/UserAvatar';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'CompetitionDetail'>;
  route: RouteProp<HomeStackParamList, 'CompetitionDetail'>;
};

export default function CompetitionDetailScreen({ navigation, route }: Props) {
  const { competition } = route.params;
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [tab, setTab] = useState(0);
  const TABS = ['Infos', 'WODs', 'Participants'];

  interface Participant {
    athlete_id: string;
    username: string;
    avatar_url: string | null;
    elo: number;
    score: number;
  }
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    if (tab === 2) loadParticipants();
  }, [tab]);

  async function loadParticipants() {
    setLoadingParticipants(true);
    try {
      const { data } = await supabase
        .from('tournament_participants')
        .select('athlete_id, score, profiles:athlete_id(username, avatar_url, elo)')
        .eq('tournament_id', competition.id)
        .order('score', { ascending: false });

      const mapped: Participant[] = (data ?? []).map((row: any) => ({
        athlete_id: row.athlete_id,
        username: row.profiles?.username ?? 'Inconnu',
        avatar_url: row.profiles?.avatar_url ?? null,
        elo: row.profiles?.elo ?? 1000,
        score: row.score ?? 0,
      }));
      setParticipants(mapped);
    } catch (e) { captureError(e, { screen: 'CompetitionDetail', action: 'loadParticipants' }); }
    setLoadingParticipants(false);
  }

  function handleLaunchTimer(wod: { title: string; type: string; duration: number }) {
    navigation.navigate('TimerRun', {
      timerType: (wod.type.toLowerCase().includes('amrap') ? 'amrap'
        : wod.type.toLowerCase().includes('emom') ? 'emom' : 'for-time') as TimerType,
      countdown: 10,
      totalSeconds: wod.duration * 60,
      maxTime: wod.type.toLowerCase().includes('for') ? wod.duration * 60 : 0,
      interval: 60,
      rounds: 1,
      workTime: 20,
      restTime: 10,
      withCamera: true,
      sequence: '[]',
      videoTitle: wod.title,
      withTimestamp: true,
    });
  }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={S.headerCenter}>
          <Text style={S.headerTitle} numberOfLines={1}>{competition.name}</Text>
          <View style={[S.statusPill, { backgroundColor: competition.status === 'open' ? `${theme.success}20` : `${theme.warning}20` }]}>
            <Text style={[S.statusText, { color: competition.status === 'open' ? theme.success : theme.warning }]}>
              {competition.status === 'open' ? 'Inscriptions ouvertes' : competition.status === 'active' ? 'En cours' : 'Terminé'}
            </Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={S.tabs}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setTab(i)} style={[S.tab, tab === i && S.tabActive]}>
            <Text style={[S.tabText, tab === i && S.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        {tab === 0 && (
          <>
            {/* Hero */}
            <View style={S.heroCard}>
              <Text style={S.heroEmoji}>🏆</Text>
              <Text style={S.heroName}>{competition.name}</Text>
              {competition.description ? (
                <Text style={S.heroDesc}>{competition.description}</Text>
              ) : null}
              <View style={S.heroPills}>
                <View style={[S.levelPill, { backgroundColor: `${LevelColors[competition.level as AthleteLevel] ?? theme.accent}20` }]}>
                  <Text style={[S.levelPillText, { color: LevelColors[competition.level as AthleteLevel] ?? theme.accent }]}>
                    {(competition.level ?? 'RX').toUpperCase()}
                  </Text>
                </View>
                <View style={S.prizePill}>
                  <Text style={S.prizePillText}>{competition.prize}</Text>
                </View>
              </View>
            </View>

            {/* Dates */}
            <View style={S.infoCard}>
              <Text style={S.infoCardTitle}>Dates & Inscriptions</Text>
              <View style={S.infoRow}>
                <Calendar color={theme.accent} size={16} />
                <Text style={S.infoRowText}>Début : {competition.startDate}</Text>
              </View>
              <View style={S.infoRow}>
                <Calendar color={theme.textMuted} size={16} />
                <Text style={S.infoRowText}>Fin : {competition.endDate}</Text>
              </View>
              <View style={S.infoRow}>
                <Users color={theme.success} size={16} />
                <Text style={S.infoRowText}>{competition.participants}/{competition.maxParticipants} participants</Text>
              </View>
            </View>

            {/* Règles */}
            <View style={S.infoCard}>
              <Text style={S.infoCardTitle}>Règlement</Text>
              {[
                'Tous les WODs doivent être filmés',
                'Score soumis dans les 24h après le WOD',
                'Validation par un admin ou juge désigné',
                'Résultats publiés sur le leaderboard en direct',
              ].map((rule, i) => (
                <View key={i} style={S.ruleRow}>
                  <View style={S.ruleDot} />
                  <Text style={S.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            {competition.status === 'open' && (
              <TouchableOpacity style={S.registerBtn} activeOpacity={0.85}>
                <Zap color="#fff" size={18} />
                <Text style={S.registerBtnText}>S'inscrire à la compétition</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {tab === 1 && (
          <>
            <Text style={S.sectionTitle}>WODs de la compétition</Text>
            {competition.wods?.map((wod: any, i: number) => (
              <View key={i} style={S.wodCard}>
                <View style={S.wodHeader}>
                  <View style={S.wodIndexCircle}>
                    <Text style={S.wodIndex}>WOD {i + 1}</Text>
                  </View>
                  <View style={S.wodTypeBadge}>
                    <Text style={S.wodTypeText}>{wod.type}</Text>
                  </View>
                  <View style={S.wodDuration}>
                    <Clock color={theme.textMuted} size={12} />
                    <Text style={S.wodDurationText}>{wod.duration} min</Text>
                  </View>
                </View>
                <Text style={S.wodTitle}>{wod.title}</Text>
                <Text style={S.wodMovements}>{wod.movements}</Text>

                {wod.hasTimer && (
                  <TouchableOpacity style={S.timerBtn} onPress={() => handleLaunchTimer(wod)} activeOpacity={0.85}>
                    <Timer color="#fff" size={15} />
                    <Text style={S.timerBtnText}>Lancer le minuteur vidéo</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {(!competition.wods || competition.wods.length === 0) && (
              <View style={S.emptyState}>
                <Text style={S.emptyText}>Les WODs seront publiés prochainement.</Text>
              </View>
            )}
          </>
        )}

        {tab === 2 && (
          <>
            <Text style={S.sectionTitle}>Participants ({participants.length})</Text>
            {loadingParticipants ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
            ) : participants.length === 0 ? (
              <View style={S.emptyState}>
                <Text style={S.emptyText}>Aucun participant pour le moment.</Text>
              </View>
            ) : (
              participants.map((p, i) => (
                <View key={p.athlete_id} style={S.participantRow}>
                  <View style={S.participantRank}>
                    <Text style={S.participantRankText}>{i + 1}</Text>
                  </View>
                  <UserAvatar
                    uri={p.avatar_url}
                    name={p.username ?? '?'}
                    size={38}
                    borderRadius={19}
                    backgroundColor={`${theme.accent}20`}
                    textColor={theme.accent}
                    fontSize={16}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={S.participantName}>{p.username}</Text>
                    <Text style={S.participantElo}>ELO {p.elo}</Text>
                  </View>
                  <Text style={S.participantScore}>{p.score > 0 ? `${p.score} pts` : '—'}</Text>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 56,
    paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: theme.text },
  statusPill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  tabs: {
    flexDirection: 'row', backgroundColor: theme.card,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: theme.accent },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
  tabTextActive: { color: theme.accent },
  content: { padding: 16, gap: 14 },
  heroCard: {
    backgroundColor: theme.card, borderRadius: 18,
    borderWidth: 1, borderColor: theme.border,
    padding: 20, alignItems: 'center', gap: 8,
  },
  heroEmoji: { fontSize: 40 },
  heroName: { fontSize: 20, fontWeight: '900', color: theme.text, textAlign: 'center' },
  heroDesc: { fontSize: 13, color: theme.textMuted, textAlign: 'center', lineHeight: 18 },
  heroPills: { flexDirection: 'row', gap: 8, marginTop: 4 },
  levelPill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  levelPillText: { fontSize: 11, fontWeight: '800' },
  prizePill: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: `${theme.gold}20`,
  },
  prizePillText: { fontSize: 11, fontWeight: '800', color: theme.gold },
  infoCard: {
    backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, padding: 16, gap: 10,
  },
  infoCardTitle: { fontSize: 13, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoRowText: { fontSize: 14, color: theme.text, fontWeight: '600' },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent, marginTop: 5 },
  ruleText: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, flex: 1 },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent, borderRadius: 14, padding: 16,
  },
  registerBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.text, marginBottom: 4 },
  wodCard: {
    backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, padding: 16, gap: 10,
  },
  wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wodIndexCircle: {
    backgroundColor: `${theme.accent}15`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  wodIndex: { fontSize: 11, fontWeight: '800', color: theme.accent },
  wodTypeBadge: { backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  wodTypeText: { fontSize: 11, fontWeight: '700', color: theme.textSecondary },
  wodDuration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wodDurationText: { fontSize: 11, color: theme.textMuted },
  wodTitle: { fontSize: 16, fontWeight: '900', color: theme.text },
  wodMovements: { fontSize: 13, color: theme.textSecondary, lineHeight: 20 },
  timerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#CC1A1A', borderRadius: 10, padding: 12, marginTop: 4,
  },
  timerBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 13, color: theme.textMuted },
  participantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border, marginBottom: 8,
  },
  participantRank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
  },
  participantRankText: { fontSize: 12, fontWeight: '900', color: theme.text },
  participantAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${theme.accent}20`, justifyContent: 'center', alignItems: 'center',
  },
  participantAvatarText: { fontSize: 16, fontWeight: '900', color: theme.accent },
  participantAvatarImg: {
    width: 38, height: 38, borderRadius: 19,
  },
  participantName: { fontSize: 14, fontWeight: '700', color: theme.text },
  participantElo: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  participantScore: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
}); }
