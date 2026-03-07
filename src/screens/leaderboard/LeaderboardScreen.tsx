import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert,
} from 'react-native';
import { Trophy, Zap, Users, MapPin, Plus, X, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation';
import { Colors, LevelColors } from '../../theme/colors';
import { AthleteLevel } from '../../types';

const LEVELS: (AthleteLevel | 'all')[] = ['all', 'scaled', 'inter', 'rx', 'rx+', 'gx', 'pro'];
const MAIN_TABS = ['Individuel', 'Équipes', 'Box'];

const MOCK_ATHLETES = [
  { rank: 1,  username: 'MaxPower',    elo: 1892, level: 'pro',  wins: 87, matches: 95,  streak: 12 },
  { rank: 2,  username: 'IronJane',    elo: 1744, level: 'gx',   wins: 72, matches: 89,  streak: 8  },
  { rank: 3,  username: 'FlexKing42',  elo: 1698, level: 'rx+',  wins: 65, matches: 82,  streak: 5  },
  { rank: 4,  username: 'CrossBeast',  elo: 1623, level: 'rx+',  wins: 58, matches: 76,  streak: 3  },
  { rank: 5,  username: 'FitWarrior',  elo: 1567, level: 'rx',   wins: 54, matches: 71,  streak: 6  },
  { rank: 6,  username: 'WodQueen',    elo: 1512, level: 'rx',   wins: 49, matches: 67,  streak: 2  },
  { rank: 7,  username: 'AthleteYou',  elo: 1247, level: 'rx',   wins: 28, matches: 42,  streak: 5, isMe: true },
  { rank: 8,  username: 'SweatMachine',elo: 1198, level: 'inter', wins: 24, matches: 38, streak: 1  },
  { rank: 9,  username: 'PushPull99',  elo: 1145, level: 'inter', wins: 21, matches: 35, streak: 0  },
  { rank: 10, username: 'GrindDaily',  elo: 1089, level: 'scaled',wins: 18, matches: 30, streak: 2  },
];

const MOCK_TEAMS = [
  { rank: 1, name: 'CrossFire Alpha', gym: 'CF Paris 11', members: 5, avgElo: 1680, wins: 124, tag: '🔥' },
  { rank: 2, name: 'Iron Wolves',     gym: 'CF Lyon',     members: 4, avgElo: 1540, wins: 98,  tag: '🐺' },
  { rank: 3, name: 'Box Warriors',    gym: 'CF Bordeaux', members: 5, avgElo: 1490, wins: 87,  tag: '⚔️' },
  { rank: 4, name: 'Storm Squad',     gym: 'CF Lille',    members: 3, avgElo: 1345, wins: 61,  tag: '⚡' },
  { rank: 5, name: 'Gainz Factory',   gym: 'CF Nantes',   members: 4, avgElo: 1290, wins: 52,  tag: '🏭' },
];

const MOCK_GYMS = [
  { rank: 1, name: 'CrossFit Paris 11', city: 'Paris',    athletes: 34, avgElo: 1520, topAthlete: 'MaxPower'    },
  { rank: 2, name: 'CrossFit Lyon',     city: 'Lyon',     athletes: 28, avgElo: 1440, topAthlete: 'IronJane'    },
  { rank: 3, name: 'CrossFit Bordeaux', city: 'Bordeaux', athletes: 22, avgElo: 1380, topAthlete: 'FlexKing42'  },
  { rank: 4, name: 'CrossFit Marseille',city: 'Marseille',athletes: 19, avgElo: 1320, topAthlete: 'CrossBeast'  },
  { rank: 5, name: 'CrossFit Lille',   city: 'Lille',    athletes: 15, avgElo: 1270, topAthlete: 'FitWarrior'  },
  { rank: 6, name: 'CrossFit Nantes',  city: 'Nantes',   athletes: 12, avgElo: 1240, topAthlete: 'WodQueen'    },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={styles.rankEmoji}>�</Text>;
  if (rank === 2) return <Text style={styles.rankEmoji}>🥈</Text>;
  if (rank === 3) return <Text style={styles.rankEmoji}>🥉</Text>;
  return <Text style={styles.rankNum}>#{rank}</Text>;
}

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Leaderboard'>;

export default function LeaderboardScreen() {
  const navigation = useNavigation<Nav>();
  const [mainTab, setMainTab] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<AthleteLevel | 'all'>('all');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamGym, setTeamGym] = useState('');

  const filtered = selectedLevel === 'all'
    ? MOCK_ATHLETES
    : MOCK_ATHLETES.filter(e => e.level === selectedLevel);

  const top3 = MOCK_ATHLETES.slice(0, 3);

  function handleCreateTeam() {
    if (!teamName.trim()) { Alert.alert('Nom requis', 'Entre un nom pour ton équipe.'); return; }
    Alert.alert('Équipe créée !', `"${teamName}" a été créée. Invite tes coéquipiers.`);
    setShowCreateTeam(false);
    setTeamName('');
    setTeamGym('');
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={Colors.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Classement</Text>
        <Text style={styles.headerSub}>Qui domine BattleWOD ?</Text>

        <View style={styles.podium}>
          {[top3[1], top3[0], top3[2]].map((p, idx) => {
            const heights = [56, 76, 44];
            const medals = ['🥈', '🥇', '🥉'];
            return (
              <View key={idx} style={styles.podiumCol}>
                <View style={[styles.podiumAvatar, idx === 1 && styles.podiumAvatarFirst]}>
                  <Text style={styles.podiumAvatarText}>{p?.username[0]}</Text>
                </View>
                <View style={[styles.podiumBase, { height: heights[idx] }]}>
                  <Text style={styles.podiumMedal}>{medals[idx]}</Text>
                  <Text style={styles.podiumName} numberOfLines={1}>{p?.username}</Text>
                  <Text style={styles.podiumElo}>{p?.elo}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.mainTabs}>
        {MAIN_TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setMainTab(i)}
            style={[styles.mainTab, mainTab === i && styles.mainTabActive]}>
            <Text style={[styles.mainTabText, mainTab === i && styles.mainTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mainTab === 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.levelFilters}>
            {LEVELS.map((l) => (
              <TouchableOpacity key={l} onPress={() => setSelectedLevel(l)}
                style={[styles.chip, selectedLevel === l && styles.chipActive]}>
                <Text style={[styles.chipText, selectedLevel === l && styles.chipTextActive]}>
                  {l === 'all' ? 'Tous' : l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {filtered.map((item) => (
              <View key={item.rank} style={[styles.row, item.isMe && styles.rowMe]}>
                <View style={styles.rankCell}><RankBadge rank={item.rank} /></View>
                <View style={[styles.avatarBox, { borderColor: LevelColors[item.level] }]}>
                  <Text style={styles.avatarText}>{item.username[0]}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, item.isMe && { color: Colors.primary }]}>
                    {item.username}{item.isMe ? ' 👈' : ''}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.lvlPill, { backgroundColor: `${LevelColors[item.level]}18` }]}>
                      <Text style={[styles.lvlText, { color: LevelColors[item.level] }]}>
                        {item.level.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.winsText}>{item.wins}V – {item.matches - item.wins}D</Text>
                    {item.streak > 0 && (
                      <View style={styles.streakPill}>
                        <Zap color={Colors.warning} size={9} />
                        <Text style={styles.streakText}>{item.streak}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.eloCell}>
                  <Text style={styles.eloValue}>{item.elo}</Text>
                  <Text style={styles.eloLabel}>ELO</Text>
                </View>
              </View>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        </>
      )}

      {mainTab === 1 && (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.createTeamBtn} onPress={() => setShowCreateTeam(true)} activeOpacity={0.8}>
            <Plus color={Colors.primary} size={18} />
            <Text style={styles.createTeamText}>Créer une équipe</Text>
          </TouchableOpacity>

          {MOCK_TEAMS.map((team) => (
            <TouchableOpacity key={team.rank} style={styles.teamRow} activeOpacity={0.7}>
              <View style={styles.rankCell}><RankBadge rank={team.rank} /></View>
              <View style={styles.teamAvatar}>
                <Text style={{ fontSize: 22 }}>{team.tag}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{team.name}</Text>
                <View style={styles.metaRow}>
                  <MapPin color={Colors.textMuted} size={11} />
                  <Text style={styles.gymText}>{team.gym}</Text>
                  <Users color={Colors.textMuted} size={11} />
                  <Text style={styles.gymText}>{team.members} membres</Text>
                </View>
              </View>
              <View style={styles.eloCell}>
                <Text style={styles.eloValue}>{team.avgElo}</Text>
                <Text style={styles.eloLabel}>ELO moy.</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {mainTab === 2 && (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionHint}>
            Classement des box par ELO moyen de leurs athlètes
          </Text>
          {MOCK_GYMS.map((gym) => (
            <TouchableOpacity key={gym.rank} style={styles.gymRow} activeOpacity={0.7}>
              <View style={styles.rankCell}><RankBadge rank={gym.rank} /></View>
              <View style={styles.gymIcon}>
                <MapPin color={Colors.primary} size={20} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{gym.name}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.gymText}>{gym.city}</Text>
                  <Text style={styles.dotSep}>·</Text>
                  <Text style={styles.gymText}>{gym.athletes} athlètes</Text>
                  <Text style={styles.dotSep}>·</Text>
                  <Text style={styles.gymText}>Top: {gym.topAthlete}</Text>
                </View>
              </View>
              <View style={styles.eloCell}>
                <Text style={styles.eloValue}>{gym.avgElo}</Text>
                <Text style={styles.eloLabel}>ELO moy.</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      <Modal visible={showCreateTeam} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle équipe</Text>
              <TouchableOpacity onPress={() => setShowCreateTeam(false)}>
                <X color={Colors.textMuted} size={22} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Nom de l'équipe *</Text>
            <TextInput
              style={styles.modalInput}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="Ex: CrossFire Alpha"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.modalLabel}>Box CrossFit (optionnel)</Text>
            <TextInput
              style={styles.modalInput}
              value={teamGym}
              onChangeText={setTeamGym}
              placeholder="Ex: CrossFit Paris 11"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.modalHint}>
              Tu seras capitaine. Tu pourras inviter jusqu'à 4 coéquipiers depuis leur profil.
            </Text>
            <TouchableOpacity style={styles.modalCreateBtn} onPress={handleCreateTeam} activeOpacity={0.85}>
              <Text style={styles.modalCreateText}>Créer l'équipe</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { marginBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, marginBottom: 20 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    marginBottom: 6, borderWidth: 2, borderColor: Colors.border,
  },
  podiumAvatarFirst: { width: 48, height: 48, borderRadius: 24, borderColor: Colors.gold },
  podiumAvatarText: { fontSize: 18, fontWeight: '900', color: Colors.text },
  podiumBase: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: 8,
    alignItems: 'center', justifyContent: 'flex-end', padding: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  podiumMedal: { fontSize: 14 },
  podiumName: { fontSize: 9, fontWeight: '800', color: Colors.text, marginTop: 2 },
  podiumElo: { fontSize: 11, fontWeight: '900', color: Colors.primary },
  mainTabs: {
    flexDirection: 'row', backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mainTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: Colors.primary },
  mainTabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  mainTabTextActive: { color: Colors.primary, fontWeight: '800' },
  levelFilters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
  list: { padding: 16, gap: 8 },
  sectionHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowMe: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}06` },
  rankCell: { width: 32, alignItems: 'center' },
  rankEmoji: { fontSize: 18 },
  rankNum: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  avatarBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 15, fontWeight: '900', color: Colors.text },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  lvlPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  lvlText: { fontSize: 9, fontWeight: '800' },
  winsText: { fontSize: 11, color: Colors.textMuted },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: `${Colors.warning}18`, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  streakText: { fontSize: 10, color: Colors.warning, fontWeight: '700' },
  eloCell: { alignItems: 'flex-end' },
  eloValue: { fontSize: 17, fontWeight: '900', color: Colors.text },
  eloLabel: { fontSize: 8, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  createTeamBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' as any,
    borderColor: Colors.primary, padding: 14,
    justifyContent: 'center',
  },
  createTeamText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  teamAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  gymRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  gymIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  gymText: { fontSize: 11, color: Colors.textMuted },
  dotSep: { color: Colors.border, fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.text },
  modalLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    fontSize: 15, color: Colors.text, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalHint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 20 },
  modalCreateBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  modalCreateText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});
