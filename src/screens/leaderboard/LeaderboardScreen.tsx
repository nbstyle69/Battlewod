import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert,
} from 'react-native';
import { Trophy, Zap, Users, MapPin, Plus, X, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
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
  const { theme } = useTheme();
  const S = createStyles(theme);
  if (rank === 1) return <Text style={S.rankEmoji}>🥇</Text>;
  if (rank === 2) return <Text style={S.rankEmoji}>🥈</Text>;
  if (rank === 3) return <Text style={S.rankEmoji}>🥉</Text>;
  return <Text style={S.rankNum}>#{rank}</Text>;
}

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Leaderboard'>;

export default function LeaderboardScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const S = createStyles(theme);
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
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Classement</Text>
        <Text style={S.headerSub}>Qui domine BattleWOD ?</Text>

        <View style={S.podium}>
          {[top3[1], top3[0], top3[2]].map((p, idx) => {
            const heights = [56, 76, 44];
            const medals = ['🥈', '🥇', '🥉'];
            return (
              <View key={idx} style={S.podiumCol}>
                <View style={[S.podiumAvatar, idx === 1 && S.podiumAvatarFirst]}>
                  <Text style={S.podiumAvatarText}>{p?.username[0]}</Text>
                </View>
                <View style={[S.podiumBase, { height: heights[idx] }]}>
                  <Text style={S.podiumMedal}>{medals[idx]}</Text>
                  <Text style={S.podiumName} numberOfLines={1}>{p?.username}</Text>
                  <Text style={S.podiumElo}>{p?.elo}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={S.mainTabs}>
        {MAIN_TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setMainTab(i)}
            style={[S.mainTab, mainTab === i && S.mainTabActive]}>
            <Text style={[S.mainTabText, mainTab === i && S.mainTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mainTab === 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.levelFilters}>
            {LEVELS.map((l) => (
              <TouchableOpacity key={l} onPress={() => setSelectedLevel(l)}
                style={[S.chip, selectedLevel === l && S.chipActive]}>
                <Text style={[S.chipText, selectedLevel === l && S.chipTextActive]}>
                  {l === 'all' ? 'Tous' : l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={S.list} showsVerticalScrollIndicator={false}>
            {filtered.map((item) => (
              <View key={item.rank} style={[S.row, item.isMe && S.rowMe]}>
                <View style={S.rankCell}><RankBadge rank={item.rank} /></View>
                <View style={[S.avatarBox, { borderColor: LevelColors[item.level] }]}>
                  <Text style={S.avatarText}>{item.username[0]}</Text>
                </View>
                <View style={S.info}>
                  <Text style={[S.name, item.isMe && { color: theme.accent }]}>
                    {item.username}{item.isMe ? ' 👈' : ''}
                  </Text>
                  <View style={S.metaRow}>
                    <View style={[S.lvlPill, { backgroundColor: `${LevelColors[item.level]}18` }]}>
                      <Text style={[S.lvlText, { color: LevelColors[item.level] }]}>
                        {item.level.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={S.winsText}>{item.wins}V – {item.matches - item.wins}D</Text>
                    {item.streak > 0 && (
                      <View style={S.streakPill}>
                        <Zap color={theme.warning} size={9} />
                        <Text style={S.streakText}>{item.streak}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={S.eloCell}>
                  <Text style={S.eloValue}>{item.elo}</Text>
                  <Text style={S.eloLabel}>ELO</Text>
                </View>
              </View>
            ))}
            <View style={{ height: 24 }} />
          </ScrollView>
        </>
      )}

      {mainTab === 1 && (
        <ScrollView contentContainerStyle={S.list} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={S.createTeamBtn} onPress={() => setShowCreateTeam(true)} activeOpacity={0.8}>
            <Plus color={theme.accent} size={18} />
            <Text style={S.createTeamText}>Créer une équipe</Text>
          </TouchableOpacity>

          {MOCK_TEAMS.map((team) => (
            <TouchableOpacity key={team.rank} style={S.teamRow} activeOpacity={0.7}>
              <View style={S.rankCell}><RankBadge rank={team.rank} /></View>
              <View style={S.teamAvatar}>
                <Text style={{ fontSize: 22 }}>{team.tag}</Text>
              </View>
              <View style={S.info}>
                <Text style={S.name}>{team.name}</Text>
                <View style={S.metaRow}>
                  <MapPin color={theme.textMuted} size={11} />
                  <Text style={S.gymText}>{team.gym}</Text>
                  <Users color={theme.textMuted} size={11} />
                  <Text style={S.gymText}>{team.members} membres</Text>
                </View>
              </View>
              <View style={S.eloCell}>
                <Text style={S.eloValue}>{team.avgElo}</Text>
                <Text style={S.eloLabel}>ELO moy.</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {mainTab === 2 && (
        <ScrollView contentContainerStyle={S.list} showsVerticalScrollIndicator={false}>
          <Text style={S.sectionHint}>
            Classement des box par ELO moyen de leurs athlètes
          </Text>
          {MOCK_GYMS.map((gym) => (
            <TouchableOpacity key={gym.rank} style={S.gymRow} activeOpacity={0.7}>
              <View style={S.rankCell}><RankBadge rank={gym.rank} /></View>
              <View style={S.gymIcon}>
                <MapPin color={theme.accent} size={20} />
              </View>
              <View style={S.info}>
                <Text style={S.name}>{gym.name}</Text>
                <View style={S.metaRow}>
                  <Text style={S.gymText}>{gym.city}</Text>
                  <Text style={S.dotSep}>·</Text>
                  <Text style={S.gymText}>{gym.athletes} athlètes</Text>
                  <Text style={S.dotSep}>·</Text>
                  <Text style={S.gymText}>Top: {gym.topAthlete}</Text>
                </View>
              </View>
              <View style={S.eloCell}>
                <Text style={S.eloValue}>{gym.avgElo}</Text>
                <Text style={S.eloLabel}>ELO moy.</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      <Modal visible={showCreateTeam} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Nouvelle équipe</Text>
              <TouchableOpacity onPress={() => setShowCreateTeam(false)}>
                <X color={theme.textMuted} size={22} />
              </TouchableOpacity>
            </View>
            <Text style={S.modalLabel}>Nom de l'équipe *</Text>
            <TextInput
              style={S.modalInput}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="Ex: CrossFit Alpha"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={S.modalLabel}>Box CrossFit (optionnel)</Text>
            <TextInput
              style={S.modalInput}
              value={teamGym}
              onChangeText={setTeamGym}
              placeholder="Ex: CrossFit Paris 11"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={S.modalHint}>
              Tu seras capitaine. Tu pourras inviter jusqu'à 4 coéquipiers depuis leur profil.
            </Text>
            <TouchableOpacity style={S.modalCreateBtn} onPress={handleCreateTeam} activeOpacity={0.85}>
              <Text style={S.modalCreateText}>Créer l'équipe</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { marginBottom: 12 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: theme.text },
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2, marginBottom: 20 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    marginBottom: 6, borderWidth: 2, borderColor: theme.border,
  },
  podiumAvatarFirst: { width: 48, height: 48, borderRadius: 24, borderColor: theme.gold },
  podiumAvatarText: { fontSize: 18, fontWeight: '900', color: theme.text },
  podiumBase: {
    width: '100%', backgroundColor: theme.surface, borderRadius: 8,
    alignItems: 'center', justifyContent: 'flex-end', padding: 6,
    borderWidth: 1, borderColor: theme.border,
  },
  podiumMedal: { fontSize: 14 },
  podiumName: { fontSize: 9, fontWeight: '800', color: theme.text, marginTop: 2 },
  podiumElo: { fontSize: 11, fontWeight: '900', color: theme.accent },
  mainTabs: {
    flexDirection: 'row', backgroundColor: theme.background,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  mainTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: theme.accent },
  mainTabText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },
  mainTabTextActive: { color: theme.accent, fontWeight: '800' },
  levelFilters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 11, fontWeight: '700', color: theme.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
  list: { padding: 16, gap: 8 },
  sectionHint: { fontSize: 12, color: theme.textMuted, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  rowMe: { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
  rankCell: { width: 32, alignItems: 'center' },
  rankEmoji: { fontSize: 18 },
  rankNum: { fontSize: 13, fontWeight: '800', color: theme.textMuted },
  avatarBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 15, fontWeight: '900', color: theme.text },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  lvlPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  lvlText: { fontSize: 9, fontWeight: '800' },
  winsText: { fontSize: 11, color: theme.textMuted },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: `${theme.warning}18`, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  streakText: { fontSize: 10, color: theme.warning, fontWeight: '700' },
  eloCell: { alignItems: 'flex-end' },
  eloValue: { fontSize: 17, fontWeight: '900', color: theme.text },
  eloLabel: { fontSize: 8, color: theme.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  createTeamBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' as any,
    borderColor: theme.accent, padding: 14,
    justifyContent: 'center',
  },
  createTeamText: { fontSize: 14, fontWeight: '700', color: theme.accent },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  teamAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
  },
  gymRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  gymIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
  },
  gymText: { fontSize: 11, color: theme.textMuted },
  dotSep: { color: theme.border, fontSize: 11 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
  modalLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: theme.surface, borderRadius: 12, padding: 14,
    fontSize: 15, color: theme.text, marginBottom: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  modalHint: { fontSize: 12, color: theme.textMuted, lineHeight: 18, marginBottom: 20 },
  modalCreateBtn: {
    backgroundColor: theme.accent, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  modalCreateText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
}); }
