import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList,
} from 'react-native';
import { Zap, Clock, ChevronRight, Filter, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, LevelColors } from '../../theme/colors';
import { AthleteLevel, WOD } from '../../types';
import { WODStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<WODStackParamList, 'WODList'>;

const LEVELS: AthleteLevel[] = ['scaled', 'inter', 'rx', 'rx+', 'gx', 'pro'];

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
  const [selectedLevel, setSelectedLevel] = useState<AthleteLevel | 'all'>('all');

  const filtered = selectedLevel === 'all'
    ? MOCK_WODS
    : MOCK_WODS.filter(w => w.level === selectedLevel);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>WOD</Text>
            <Text style={styles.headerSubtitle}>Workouts of the Day</Text>
          </View>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => navigation.navigate('WODGenerator')}
            activeOpacity={0.8}
          >
            <Sparkles color="#fff" size={18} />
            <Text style={styles.generateText}>Générer</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <TouchableOpacity
            onPress={() => setSelectedLevel('all')}
            style={[styles.filterChip, selectedLevel === 'all' && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, selectedLevel === 'all' && styles.filterTextActive]}>Tous</Text>
          </TouchableOpacity>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => setSelectedLevel(l)}
              style={[
                styles.filterChip,
                selectedLevel === l && { backgroundColor: `${LevelColors[l]}25`, borderColor: LevelColors[l] },
              ]}
            >
              <Text style={[styles.filterText, selectedLevel === l && { color: LevelColors[l] }]}>
                {l.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.wodCard} activeOpacity={0.8}>
            <View style={styles.wodCardHeader}>
              <View style={styles.wodMeta}>
                <View style={[styles.typeBadge, { backgroundColor: `${Colors.primary}20` }]}>
                  <Text style={[styles.typeText, { color: Colors.primary }]}>{item.type}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: `${LevelColors[item.level]}20` }]}>
                  <Text style={[styles.typeText, { color: LevelColors[item.level] }]}>
                    {item.level.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.duration}>
                <Clock color={Colors.textMuted} size={14} />
                <Text style={styles.durationText}>{item.duration_minutes} min</Text>
              </View>
            </View>
            <Text style={styles.wodTitle}>{item.title}</Text>
            <Text style={styles.wodDesc}>{item.description}</Text>
            <View style={styles.movements}>
              {item.movements.slice(0, 3).map((m, i) => (
                <Text key={i} style={styles.movement}>• {m.reps} {m.name}</Text>
              ))}
            </View>
            <View style={styles.wodFooter}>
              <View style={styles.equipmentList}>
                {item.equipment.slice(0, 2).map((e, i) => (
                  <View key={i} style={styles.equipTag}>
                    <Text style={styles.equipText}>{e}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.scoringRow}>
                <Zap color={Colors.primary} size={14} />
                <Text style={styles.scoringText}>{item.scoring}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: Colors.text },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  generateButton: { borderRadius: 12, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  generateGradient: {},
  generateText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  filterRow: { paddingTop: 12 },
  filters: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  filterChipActive: { backgroundColor: `${Colors.primary}25`, borderColor: Colors.primary },
  filterText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: Colors.primary },
  list: { padding: 16, gap: 12 },
  wodCard: {
    backgroundColor: Colors.card, borderRadius: 18,
    padding: 18, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  wodCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  wodMeta: { flexDirection: 'row', gap: 6 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeText: { fontSize: 11, fontWeight: '700' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { fontSize: 12, color: Colors.textMuted },
  wodTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 6 },
  wodDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
  movements: { gap: 3, marginBottom: 12 },
  movement: { fontSize: 13, color: Colors.text },
  wodFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  equipmentList: { flexDirection: 'row', gap: 6 },
  equipTag: {
    backgroundColor: Colors.surface, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  equipText: { fontSize: 11, color: Colors.textMuted },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoringText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
});
