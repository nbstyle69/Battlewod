import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { ChevronLeft, Calendar, Users, Zap, Clock, Timer } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, LevelColors } from '../../theme/colors';
import { AthleteLevel } from '../../types';
import { HomeStackParamList, TimerType } from '../../navigation';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'CompetitionDetail'>;
  route: RouteProp<HomeStackParamList, 'CompetitionDetail'>;
};

export default function CompetitionDetailScreen({ navigation, route }: Props) {
  const { competition } = route.params;
  const [tab, setTab] = useState(0);
  const TABS = ['Infos', 'WODs', 'Participants'];

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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{competition.name}</Text>
          <View style={[styles.statusPill, { backgroundColor: competition.status === 'open' ? `${Colors.success}20` : `${Colors.warning}20` }]}>
            <Text style={[styles.statusText, { color: competition.status === 'open' ? Colors.success : Colors.warning }]}>
              {competition.status === 'open' ? 'Inscriptions ouvertes' : competition.status === 'active' ? 'En cours' : 'Terminé'}
            </Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setTab(i)} style={[styles.tab, tab === i && styles.tabActive]}>
            <Text style={[styles.tabText, tab === i && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 0 && (
          <>
            {/* Hero */}
            <View style={styles.heroCard}>
              <Text style={styles.heroEmoji}>🏆</Text>
              <Text style={styles.heroName}>{competition.name}</Text>
              {competition.description ? (
                <Text style={styles.heroDesc}>{competition.description}</Text>
              ) : null}
              <View style={styles.heroPills}>
                <View style={[styles.levelPill, { backgroundColor: `${LevelColors[competition.level as AthleteLevel] ?? Colors.primary}20` }]}>
                  <Text style={[styles.levelPillText, { color: LevelColors[competition.level as AthleteLevel] ?? Colors.primary }]}>
                    {(competition.level ?? 'RX').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.prizePill}>
                  <Text style={styles.prizePillText}>{competition.prize}</Text>
                </View>
              </View>
            </View>

            {/* Dates */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Dates & Inscriptions</Text>
              <View style={styles.infoRow}>
                <Calendar color={Colors.primary} size={16} />
                <Text style={styles.infoRowText}>Début : {competition.startDate}</Text>
              </View>
              <View style={styles.infoRow}>
                <Calendar color={Colors.textMuted} size={16} />
                <Text style={styles.infoRowText}>Fin : {competition.endDate}</Text>
              </View>
              <View style={styles.infoRow}>
                <Users color={Colors.success} size={16} />
                <Text style={styles.infoRowText}>{competition.participants}/{competition.maxParticipants} participants</Text>
              </View>
            </View>

            {/* Règles */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Règlement</Text>
              {[
                'Tous les WODs doivent être filmés',
                'Score soumis dans les 24h après le WOD',
                'Validation par un admin ou juge désigné',
                'Résultats publiés sur le leaderboard en direct',
              ].map((rule, i) => (
                <View key={i} style={styles.ruleRow}>
                  <View style={styles.ruleDot} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            {competition.status === 'open' && (
              <TouchableOpacity style={styles.registerBtn} activeOpacity={0.85}>
                <Zap color="#fff" size={18} />
                <Text style={styles.registerBtnText}>S'inscrire à la compétition</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {tab === 1 && (
          <>
            <Text style={styles.sectionTitle}>WODs de la compétition</Text>
            {competition.wods?.map((wod: any, i: number) => (
              <View key={i} style={styles.wodCard}>
                <View style={styles.wodHeader}>
                  <View style={styles.wodIndexCircle}>
                    <Text style={styles.wodIndex}>WOD {i + 1}</Text>
                  </View>
                  <View style={styles.wodTypeBadge}>
                    <Text style={styles.wodTypeText}>{wod.type}</Text>
                  </View>
                  <View style={styles.wodDuration}>
                    <Clock color={Colors.textMuted} size={12} />
                    <Text style={styles.wodDurationText}>{wod.duration} min</Text>
                  </View>
                </View>
                <Text style={styles.wodTitle}>{wod.title}</Text>
                <Text style={styles.wodMovements}>{wod.movements}</Text>

                {wod.hasTimer && (
                  <TouchableOpacity style={styles.timerBtn} onPress={() => handleLaunchTimer(wod)} activeOpacity={0.85}>
                    <Timer color="#fff" size={15} />
                    <Text style={styles.timerBtnText}>Lancer le minuteur vidéo</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {(!competition.wods || competition.wods.length === 0) && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Les WODs seront publiés prochainement.</Text>
              </View>
            )}
          </>
        )}

        {tab === 2 && (
          <>
            <Text style={styles.sectionTitle}>Participants ({competition.participants})</Text>
            {Array.from({ length: Math.min(competition.participants, 10) }, (_, i) => (
              <View key={i} style={styles.participantRow}>
                <View style={styles.participantRank}>
                  <Text style={styles.participantRankText}>{i + 1}</Text>
                </View>
                <View style={styles.participantAvatar}>
                  <Text style={styles.participantAvatarText}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.participantName}>Athlète {i + 1}</Text>
                  <Text style={styles.participantElo}>ELO {1000 + Math.round(Math.random() * 500)}</Text>
                </View>
                <Text style={styles.participantScore}>—</Text>
              </View>
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
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 56,
    paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  statusPill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  content: { padding: 16, gap: 14 },

  heroCard: {
    backgroundColor: Colors.card, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20, alignItems: 'center', gap: 8,
  },
  heroEmoji: { fontSize: 40 },
  heroName: { fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  heroDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  heroPills: { flexDirection: 'row', gap: 8, marginTop: 4 },
  levelPill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  levelPillText: { fontSize: 11, fontWeight: '800' },
  prizePill: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: `${Colors.gold}20`,
  },
  prizePillText: { fontSize: 11, fontWeight: '800', color: Colors.gold },

  infoCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10,
  },
  infoCardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoRowText: { fontSize: 14, color: Colors.text, fontWeight: '600' },

  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 5 },
  ruleText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, flex: 1 },

  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 14, padding: 16,
  },
  registerBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },

  sectionTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, marginBottom: 4 },

  wodCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10,
  },
  wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wodIndexCircle: {
    backgroundColor: `${Colors.primary}15`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  wodIndex: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  wodTypeBadge: { backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  wodTypeText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  wodDuration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wodDurationText: { fontSize: 11, color: Colors.textMuted },
  wodTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  wodMovements: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  timerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#CC1A1A', borderRadius: 10, padding: 12, marginTop: 4,
  },
  timerBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  participantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  participantRank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  participantRankText: { fontSize: 12, fontWeight: '900', color: Colors.text },
  participantAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${Colors.primary}20`, justifyContent: 'center', alignItems: 'center',
  },
  participantAvatarText: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  participantName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  participantElo: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  participantScore: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
});
