import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, Dumbbell, Zap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';

const HYROX_ORANGE = '#FF6B00';
type Nav = NativeStackNavigationProp<ExplorerStackParamList>;

export default function ProgrammationScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = createStyles(theme);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Programmation</Text>
          <Text style={s.headerSub}>Choisis ton type d'entraînement</Text>
        </View>
      </View>

      <View style={s.content}>
        {/* Functional Fitness */}
        <TouchableOpacity
          style={s.categoryBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ProgramAffiliates', { category: 'functional' })}
        >
          <View style={[s.categoryIcon, { backgroundColor: `${theme.accent}15` }]}>
            <Dumbbell color={theme.accent} size={28} />
          </View>
          <View style={s.categoryContent}>
            <Text style={s.categoryTitle}>Functional Fitness</Text>
            <Text style={s.categoryDesc}>HWPO, Mayhem, CompTrain, FitProcess, EMF...</Text>
          </View>
          <View style={[s.categoryArrow, { backgroundColor: `${theme.accent}15` }]}>
            <Text style={[s.categoryArrowTxt, { color: theme.accent }]}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Hybrid */}
        <TouchableOpacity
          style={s.categoryBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ProgramAffiliates', { category: 'hybrid' })}
        >
          <View style={[s.categoryIcon, { backgroundColor: `${HYROX_ORANGE}15` }]}>
            <Zap color={HYROX_ORANGE} size={28} />
          </View>
          <View style={s.categoryContent}>
            <Text style={s.categoryTitle}>Hybrid / Hyrox</Text>
            <Text style={s.categoryDesc}>HYROX Training Club, The Progrm, Hybrid Performance...</Text>
          </View>
          <View style={[s.categoryArrow, { backgroundColor: `${HYROX_ORANGE}15` }]}>
            <Text style={[s.categoryArrowTxt, { color: HYROX_ORANGE }]}>→</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
  },
  back: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: t.text },
  headerSub: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 14 },
  categoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: t.card, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: t.border,
  },
  categoryIcon: {
    width: 58, height: 58, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryContent: { flex: 1 },
  categoryTitle: { fontSize: 17, fontWeight: '900', color: t.text },
  categoryDesc: { fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 17 },
  categoryArrow: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryArrowTxt: { fontSize: 18, fontWeight: '900' },
}); }
