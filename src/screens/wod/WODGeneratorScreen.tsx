import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, ActivityIndicator,
} from 'react-native';
import { Sparkles, ChevronLeft, Clock, Zap, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors, LevelColors } from '../../theme/colors';
import { AthleteLevel, WODType } from '../../types';

const LEVELS: AthleteLevel[] = ['scaled', 'inter', 'rx', 'rx+', 'gx', 'pro'];
const DURATIONS = [5, 10, 15, 20];
const WOD_TYPES: WODType[] = ['AMRAP', 'For Time', 'EMOM', 'Tabata', 'Max Reps'];

const EQUIPMENT_OPTIONS = [
  'Barre + Disques', 'Haltères', 'Kettlebell', 'Box', 'Corde à sauter',
  'Barre de traction', 'Anneaux', 'Rameur', 'Vélo Assault', 'Aucun matériel',
];

interface GeneratedWOD {
  title: string;
  type: WODType;
  duration: number;
  level: AthleteLevel;
  movements: string[];
  scoring: string;
  tip: string;
}

function generateWOD(level: AthleteLevel, duration: number, type: WODType, equipment: string[]): GeneratedWOD {
  const hasBarbell = equipment.includes('Barre + Disques');
  const hasJumpRope = equipment.includes('Corde à sauter');
  const hasBox = equipment.includes('Box');
  const noEquip = equipment.includes('Aucun matériel') || equipment.length === 0;

  const wodsByType: Record<string, GeneratedWOD> = {
    'AMRAP': {
      title: noEquip ? 'Body Blaster' : hasBarbell ? 'Iron Storm' : 'Battle Circuit',
      type: 'AMRAP',
      duration,
      level,
      movements: noEquip
        ? ['10 Burpees', '15 Air Squats', '20 Mountain Climbers', '10 Push-ups']
        : hasBarbell
        ? [`10 Hang Power Clean (${level === 'rx' ? '60' : level === 'scaled' ? '30' : '70'}kg)`, '15 Box Jumps', '20 Double Unders']
        : ['12 Kettlebell Swings', '10 Box Jumps', '15 Push-ups'],
      scoring: `Max rounds en ${duration} minutes`,
      tip: 'Garde un rythme constant. Évite de partir trop vite sur le 1er round.',
    },
    'For Time': {
      title: hasBarbell ? 'Grace Remix' : 'Speed Demon',
      type: 'For Time',
      duration,
      level,
      movements: hasBarbell
        ? [`21-15-9 Thrusters (${level === 'scaled' ? '35' : '43'}kg)`, '21-15-9 Pull-ups']
        : ['50 Burpees', '400m Course', '50 Air Squats'],
      scoring: `Temps le plus court possible (cap ${duration} min)`,
      tip: 'Gère ton souffle sur les barres. Les transitions rapides font la différence.',
    },
    'EMOM': {
      title: 'Minute Warrior',
      type: 'EMOM',
      duration,
      level,
      movements: [
        `Min 1 : 10 ${hasBarbell ? 'Deadlifts' : 'Burpees'}`,
        `Min 2 : 15 ${hasBox ? 'Box Jumps' : 'Squats'}`,
        `Min 3 : 20 ${hasJumpRope ? 'Double Unders' : 'Mountain Climbers'}`,
      ],
      scoring: 'Complète chaque minute. Score = rounds terminés.',
      tip: "L'objectif est de finir chaque minute avec du temps de repos.",
    },
    'Tabata': {
      title: 'Tabata Fury',
      type: 'Tabata',
      duration: 4,
      level,
      movements: [
        '20s Burpees / 10s Repos × 8',
        '20s Air Squats / 10s Repos × 8',
        '20s Push-ups / 10s Repos × 8',
      ],
      scoring: 'Score = total de reps',
      tip: "Chaque round de 20s doit être à 100%. Le repos de 10s est sacré.",
    },
    'Max Reps': {
      title: 'Peak Performance',
      type: 'Max Reps',
      duration,
      level,
      movements: [
        `Max Pull-ups en ${duration} min (sans lâcher)`,
        hasBarbell ? `Max Clean & Jerk (${level === 'rx' ? '70' : '50'}kg)` : 'Max Burpees',
      ],
      scoring: 'Score = total de reps',
      tip: 'Teste tes vraies limites. Pousse jusqu\'au bout.',
    },
  };

  return wodsByType[type] ?? wodsByType['AMRAP'];
}

export default function WODGeneratorScreen() {
  const navigation = useNavigation();
  const [level, setLevel] = useState<AthleteLevel>('rx');
  const [duration, setDuration] = useState(5);
  const [wodType, setWODType] = useState<WODType>('AMRAP');
  const [equipment, setEquipment] = useState<string[]>(['Barre + Disques', 'Corde à sauter']);
  const [generatedWOD, setGeneratedWOD] = useState<GeneratedWOD | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleEquipment(item: string) {
    setEquipment(prev =>
      prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item]
    );
  }

  async function handleGenerate() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const wod = generateWOD(level, duration, wodType, equipment);
    setGeneratedWOD(wod);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft color={Colors.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Générateur WOD</Text>
        <Text style={styles.headerSub}>Crée ton WOD sur mesure</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ton niveau</Text>
          <View style={styles.chipRow}>
            {LEVELS.map(l => (
              <TouchableOpacity
                key={l}
                onPress={() => setLevel(l)}
                style={[styles.chip, level === l && { backgroundColor: `${LevelColors[l]}25`, borderColor: LevelColors[l] }]}
              >
                <Text style={[styles.chipText, level === l && { color: LevelColors[l] }]}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Durée</Text>
          <View style={styles.chipRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                onPress={() => setDuration(d)}
                style={[styles.chip, duration === d && styles.chipSelected]}
              >
                <Clock color={duration === d ? Colors.primary : Colors.textMuted} size={14} />
                <Text style={[styles.chipText, duration === d && { color: Colors.primary }]}>{d} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type de WOD</Text>
          <View style={styles.chipRow}>
            {WOD_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setWODType(t)}
                style={[styles.chip, wodType === t && styles.chipSelected]}
              >
                <Text style={[styles.chipText, wodType === t && { color: Colors.primary }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Matériel disponible</Text>
          <View style={styles.equipGrid}>
            {EQUIPMENT_OPTIONS.map(item => (
              <TouchableOpacity
                key={item}
                onPress={() => toggleEquipment(item)}
                style={[styles.equipChip, equipment.includes(item) && styles.equipChipActive]}
              >
                <Text style={[styles.equipText, equipment.includes(item) && { color: Colors.primary }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity onPress={handleGenerate} disabled={loading} activeOpacity={0.8} style={[styles.generateBtn, styles.generateGradient]}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                <Sparkles color="#fff" size={20} />
                <Text style={styles.generateText}>GÉNÉRER MON WOD</Text>
              </>
            }
        </TouchableOpacity>

        {generatedWOD && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={styles.resultBadges}>
                <View style={[styles.badge, { backgroundColor: `${Colors.primary}25` }]}>
                  <Text style={[styles.badgeText, { color: Colors.primary }]}>{generatedWOD.type}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: `${LevelColors[generatedWOD.level]}25` }]}>
                  <Text style={[styles.badgeText, { color: LevelColors[generatedWOD.level] }]}>
                    {generatedWOD.level.toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: Colors.surface }]}>
                  <Clock color={Colors.textMuted} size={12} />
                  <Text style={[styles.badgeText, { color: Colors.textMuted }]}>{generatedWOD.duration} min</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleGenerate}>
                <RefreshCw color={Colors.primary} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={styles.resultTitle}>{generatedWOD.title}</Text>

            <View style={styles.movementsList}>
              {generatedWOD.movements.map((m, i) => (
                <View key={i} style={styles.movementItem}>
                  <View style={styles.movementDot} />
                  <Text style={styles.movementText}>{m}</Text>
                </View>
              ))}
            </View>

            <View style={styles.scoringBox}>
              <Zap color={Colors.gold} size={16} />
              <Text style={styles.scoringText}>{generatedWOD.scoring}</Text>
            </View>

            <View style={styles.tipBox}>
              <Text style={styles.tipLabel}>💡 Conseil coach</Text>
              <Text style={styles.tipText}>{generatedWOD.tip}</Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} style={styles.startButton}>
                <Zap color="#fff" size={18} />
                <Text style={styles.startButtonText}>LANCER CE WOD</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  chipSelected: { backgroundColor: `${Colors.primary}25`, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  equipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  equipChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  equipChipActive: { backgroundColor: `${Colors.primary}20`, borderColor: Colors.primary },
  equipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  generateBtn: { marginVertical: 8 },
  generateGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, padding: 18, gap: 10,
    backgroundColor: Colors.primary,
  },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  resultCard: {
    backgroundColor: Colors.card, borderRadius: 20,
    padding: 20, marginTop: 20, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resultBadges: { flexDirection: 'row', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  resultTitle: { fontSize: 22, fontWeight: '900', color: Colors.text, marginBottom: 16 },
  movementsList: { gap: 8, marginBottom: 16 },
  movementItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movementDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 6 },
  movementText: { fontSize: 14, color: Colors.text, flex: 1, lineHeight: 20 },
  scoringBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.gold}15`, borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  scoringText: { fontSize: 13, color: Colors.gold, fontWeight: '600' },
  tipBox: {
    backgroundColor: Colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 16,
  },
  tipLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  tipText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, padding: 16, gap: 8,
    backgroundColor: Colors.primary,
  },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
