import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList,
} from 'react-native';
import { Zap, Clock, ChevronRight, Filter, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/designTokens';
import { AthleteLevel, WOD } from '../../types';
import { WODStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<WODStackParamList, 'WODList'>;

const LEVELS: AthleteLevel[] = ['scaled', 'inter', 'rx', 'rx+', 'elite', 'pro'];

const MOCK_WODS: WOD[] = [
  {
    id: '1', title: 'Fire Breather', type: 'AMRAP', duration_minutes: 5,
    level: 'rx', scoring: 'Max rounds',
    description: 'Un AMRAP intense pour tester ta résistance.',
    movements: [
      { name: 'Burpees Box Jump', reps: 10 },
      { name: 'Wall Balls 9kg', reps: 15 },
      { name: 'Double Unders', reps: 20 },
    ],
    equipment: ['Box', 'Wall Ball', 'Corde à sauter'], created_at: '',
  },
  {
    id: '2', title: 'Grace Sprint', type: 'For Time', duration_minutes: 5,
    level: 'rx+', scoring: 'Temps',
    description: '30 Clean & Jerk for time.',
    movements: [{ name: 'Clean & Jerk 60kg', reps: 30 }],
    equipment: ['Barre', 'Disques'], created_at: '',
  },
  {
    id: '3', title: 'Cindy Light', type: 'AMRAP', duration_minutes: 10,
    level: 'scaled', scoring: 'Max rounds',
    description: 'Version allégée du classique Cindy.',
    movements: [
      { name: 'Pull-ups assistés', reps: 5 },
      { name: 'Push-ups genoux', reps: 10 },
      { name: 'Air Squats', reps: 15 },
    ],
    equipment: ['Barre de traction'], created_at: '',
  },
  {
    id: '4', title: 'Fran Modified', type: 'For Time', duration_minutes: 5,
    level: 'inter', scoring: 'Temps',
    description: '21-15-9 Thrusters + Pull-ups.',
    movements: [
      { name: 'Thrusters 43kg', reps: 21 },
      { name: 'Pull-ups', reps: 21 },
    ],
    equipment: ['Barre', 'Disques', 'Barre de traction'], created_at: '',
  },
];

export default function WODScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [selectedLevel, setSelectedLevel] = useState<AthleteLevel | 'all'>('all');

  const filtered = selectedLevel === 'all'
    ? MOCK_WODS
    : MOCK_WODS.filter(w => w.level === selectedLevel);

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.headerTitle}>WOD</Text>
            <Text style={S.headerSubtitle}>Workouts of the Day</Text>
          </View>
          <TouchableOpacity
            style={S.generateButton}
            onPress={() => navigation.navigate('WODGenerator')}
            activeOpacity={0.8}
          >
            <Sparkles color="#fff" size={18} />
            <Text style={S.generateText}>Générer</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={S.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filters}>
          <TouchableOpacity
            onPress={() => setSelectedLevel('all')}
            style={[S.filterChip, selectedLevel === 'all' && S.filterChipActive]}
          >
            <Text style={[S.filterText, selectedLevel === 'all' && S.filterTextActive]}>Tous</Text>
          </TouchableOpacity>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => setSelectedLevel(l)}
              style={[
                S.filterChip,
                selectedLevel === l && { backgroundColor: `${LevelColors[l]}25`, borderColor: LevelColors[l] },
              ]}
            >
              <Text style={[S.filterText, selectedLevel === l && { color: LevelColors[l] }]}>
                {l.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={S.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity style={S.wodCard} activeOpacity={0.8}>
            <View style={S.wodCardHeader}>
              <View style={S.wodMeta}>
                <View style={[S.typeBadge, { backgroundColor: `${theme.accent}20` }]}>
                  <Text style={[S.typeText, { color: theme.accent }]}>{item.type}</Text>
                </View>
                <View style={[S.typeBadge, { backgroundColor: `${LevelColors[item.level]}20` }]}>
                  <Text style={[S.typeText, { color: LevelColors[item.level] }]}>
                    {item.level.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={S.duration}>
                <Clock color={theme.textMuted} size={14} />
                <Text style={S.durationText}>{item.duration_minutes} min</Text>
              </View>
            </View>
            <Text style={S.wodTitle}>{item.title}</Text>
            <Text style={S.wodDesc}>{item.description}</Text>
            <View style={S.movements}>
              {item.movements.slice(0, 3).map((m, i) => (
                <Text key={i} style={S.movement}>• {m.reps} {m.name}</Text>
              ))}
            </View>
            <View style={S.wodFooter}>
              <View style={S.equipmentList}>
                {item.equipment.slice(0, 2).map((e, i) => (
                  <View key={i} style={S.equipTag}>
                    <Text style={S.equipText}>{e}</Text>
                  </View>
                ))}
              </View>
              <View style={S.scoringRow}>
                <Zap color={theme.accent} size={14} />
                <Text style={S.scoringText}>{item.scoring}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: theme.text },
  headerSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  generateButton: { borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.25)', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.8)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  generateGradient: {},
  generateText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  filterRow: { paddingTop: 12 },
  filters: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  filterChipActive: { backgroundColor: `${theme.accent}25`, borderColor: theme.accent },
  filterText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
  filterTextActive: { color: theme.accent },
  list: { padding: 16, gap: 12, paddingBottom: 140 },
  wodCard: {
    backgroundColor: theme.card, borderRadius: 18,
    padding: 18, borderWidth: 1, borderColor: theme.cardBorder,
  },
  wodCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  wodMeta: { flexDirection: 'row', gap: 6 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeText: { fontSize: 11, fontWeight: '700' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { fontSize: 12, color: theme.textMuted },
  wodTitle: { fontSize: 18, fontWeight: '900', color: theme.text, marginBottom: 6 },
  wodDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
  movements: { gap: 3, marginBottom: 12 },
  movement: { fontSize: 13, color: theme.text },
  wodFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  equipmentList: { flexDirection: 'row', gap: 6 },
  equipTag: {
    backgroundColor: theme.surface, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  equipText: { fontSize: 11, color: theme.textMuted },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoringText: { fontSize: 12, color: theme.accent, fontWeight: '600' },
}); }
