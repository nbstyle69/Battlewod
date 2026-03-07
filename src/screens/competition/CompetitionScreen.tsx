import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Swords, Trophy, Users, Clock, Zap, ChevronRight, Plus } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, LevelColors } from '../../theme/colors';
import { CompetitionStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';

type Nav = NativeStackNavigationProp<CompetitionStackParamList, 'CompetitionList'>;

const TABS = ['Matchs 1v1', 'Tournois', 'Mini-Tournoi'];

const MOCK_MATCHES = [
  { id: '1', opponent: 'FlexKing42', elo: 1312, level: 'rx', status: 'pending', wod: 'Grace Sprint' },
  { id: '2', opponent: 'IronJane', elo: 1198, level: 'inter', status: 'pending', wod: 'Cindy Modified' },
  { id: '3', opponent: 'MaxPower', elo: 1445, level: 'rx+', status: 'active', wod: 'Fran Modified' },
];


const MOCK_MINI = [
  { id: '1', name: 'Daily Battle #47', participants: 4, max: 5, level: 'rx', timeLeft: '2h 30min' },
  { id: '2', name: 'Flash Fight AM', participants: 2, max: 5, level: 'inter', timeLeft: '5h 00min' },
];

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
  const [activeTab,    setActiveTab]    = useState(0);
  const [tournaments,  setTournaments]  = useState<Tournament[]>([]);
  const [tLoading,     setTLoading]     = useState(false);
  const [tRefreshing,  setTRefreshing]  = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});

  const loadTournaments = useCallback(async () => {
    setTLoading(true);
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, level, status, max_participants, prize, start_date')
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
    }
    setTLoading(false);
    setTRefreshing(false);
  }, []);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Compétitions</Text>
        <Text style={styles.headerSub}>Bats-toi. Grimpe. Domine.</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(i)}
            style={[styles.tab, activeTab === i && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {activeTab === 0 && (
          <>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.createButton, styles.createGradient]}
              onPress={() => navigation.navigate('Matchmaking')}
            >
                <Plus color="#fff" size={20} />
                <Text style={styles.createText}>Défier un athlète</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Défis en attente</Text>
            {MOCK_MATCHES.map(match => (
              <TouchableOpacity
                key={match.id}
                style={styles.matchCard}
                onPress={() => navigation.navigate('Match', { matchId: match.id })}
                activeOpacity={0.8}
              >
                <View style={styles.matchLeft}>
                  <View style={styles.vsAvatar}>
                    <Text style={styles.vsAvatarText}>{match.opponent[0]}</Text>
                  </View>
                  <View>
                    <Text style={styles.matchOpponent}>{match.opponent}</Text>
                    <View style={styles.matchMeta}>
                      <Text style={styles.matchElo}>ELO {match.elo}</Text>
                      <View style={[styles.levelPill, { backgroundColor: `${LevelColors[match.level]}20` }]}>
                        <Text style={[styles.levelPillText, { color: LevelColors[match.level] }]}>
                          {match.level.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.matchWod}>{match.wod}</Text>
                  </View>
                </View>
                <View style={styles.matchRight}>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: match.status === 'active' ? `${Colors.success}20` : `${Colors.warning}20` },
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: match.status === 'active' ? Colors.success : Colors.warning },
                    ]}>
                      {match.status === 'active' ? 'En cours' : 'Attente'}
                    </Text>
                  </View>
                  <ChevronRight color={Colors.textMuted} size={18} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {activeTab === 1 && (
          <>
            <Text style={styles.sectionTitle}>Tournois disponibles</Text>
            {tLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
            ) : tournaments.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🏆</Text>
                <Text style={styles.emptyText}>Aucun tournoi ouvert pour l'instant.</Text>
              </View>
            ) : (
              tournaments.map(t => {
                const participants = participantCounts[t.id] ?? 0;
                const pct = t.max_participants > 0 ? (participants / t.max_participants) * 100 : 0;
                const levelColor = LevelColors[t.level as keyof typeof LevelColors] ?? Colors.primary;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.tournamentCard}
                    onPress={() => navigation.navigate('Tournament', { tournamentId: t.id })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.tHeader}>
                      <Text style={styles.tName}>{t.name}</Text>
                      <View style={[
                        styles.tStatus,
                        { backgroundColor: t.status === 'active' ? `${Colors.success}20` : `${Colors.primary}20` },
                      ]}>
                        <Text style={[
                          styles.tStatusText,
                          { color: t.status === 'active' ? Colors.success : Colors.primary },
                        ]}>
                          {t.status === 'active' ? '🔴 Live' : '🟢 Ouvert'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.tInfo}>
                      <View style={styles.tInfoItem}>
                        <Users color={Colors.textMuted} size={14} />
                        <Text style={styles.tInfoText}>{participants}/{t.max_participants}</Text>
                      </View>
                      <View style={[styles.levelPill, { backgroundColor: `${levelColor}20` }]}>
                        <Text style={[styles.levelPillText, { color: levelColor }]}>
                          {(t.level ?? 'RX').toUpperCase()}
                        </Text>
                      </View>
                      {t.prize ? <Text style={styles.tPrize}>{t.prize}</Text> : null}
                    </View>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {activeTab === 2 && (
          <>
            <View style={styles.miniInfo}>
              <Zap color={Colors.gold} size={16} />
              <Text style={styles.miniInfoText}>5 athlètes max • 1 mini-tournoi par jour • Système ELO</Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} style={[styles.createButton, styles.createGradient]}>
                <Plus color="#fff" size={20} />
                <Text style={styles.createText}>Créer un Daily Battle</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Ouverts aujourd'hui</Text>
            {MOCK_MINI.map(m => (
              <TouchableOpacity key={m.id} style={styles.miniCard} activeOpacity={0.8}>
                <View style={styles.miniHeader}>
                  <Text style={styles.miniName}>{m.name}</Text>
                  <View style={[styles.levelPill, { backgroundColor: `${LevelColors[m.level]}20` }]}>
                    <Text style={[styles.levelPillText, { color: LevelColors[m.level] }]}>
                      {m.level.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.miniFooter}>
                  <View style={styles.miniParticipants}>
                    {Array.from({ length: m.max }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.participantDot,
                          { backgroundColor: i < m.participants ? Colors.primary : Colors.surface },
                        ]}
                      />
                    ))}
                    <Text style={styles.miniParticipantsText}>{m.participants}/{m.max}</Text>
                  </View>
                  <View style={styles.miniTime}>
                    <Clock color={Colors.textMuted} size={13} />
                    <Text style={styles.miniTimeText}>{m.timeLeft}</Text>
                  </View>
                </View>
                {m.participants < m.max && (
                  <TouchableOpacity activeOpacity={0.8} style={styles.joinButton}>
                    <Text style={styles.joinButtonText}>REJOINDRE</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 26, fontWeight: '900', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  tabs: {
    flexDirection: 'row', backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary, fontWeight: '800' },
  content: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 12, marginTop: 8 },
  createButton: { marginBottom: 16 },
  createGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, padding: 16, gap: 8,
    backgroundColor: Colors.primary,
  },
  createText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  matchCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  matchLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  vsAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.primary,
  },
  vsAvatarText: { fontSize: 18, fontWeight: '900', color: Colors.text },
  matchOpponent: { fontSize: 15, fontWeight: '800', color: Colors.text },
  matchMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  matchElo: { fontSize: 12, color: Colors.textMuted },
  matchWod: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  levelPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  levelPillText: { fontSize: 10, fontWeight: '700' },
  matchRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  tournamentCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  tHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tName: { fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1 },
  tStatus: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tStatusText: { fontSize: 11, fontWeight: '700' },
  tInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tInfoText: { fontSize: 12, color: Colors.textMuted },
  tPrize: { fontSize: 12, color: Colors.gold, fontWeight: '700' },
  progressBar: {
    height: 4, backgroundColor: Colors.surface,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  miniInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.gold}15`, borderRadius: 10,
    padding: 12, marginBottom: 16,
  },
  miniInfoText: { fontSize: 12, color: Colors.gold, flex: 1 },
  miniCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  miniName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  miniFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  miniParticipants: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  participantDot: { width: 10, height: 10, borderRadius: 5 },
  miniParticipantsText: { fontSize: 12, color: Colors.textSecondary, marginLeft: 4 },
  miniTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniTimeText: { fontSize: 12, color: Colors.textMuted },
  joinButton: {
    borderRadius: 12, padding: 12, alignItems: 'center',
    backgroundColor: Colors.primary, marginTop: 4,
  },
  joinButtonText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  emptyBox:   { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyEmoji: { fontSize: 36 },
  emptyText:  { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
