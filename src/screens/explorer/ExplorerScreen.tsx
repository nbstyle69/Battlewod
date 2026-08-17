import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BookOpen, ChevronRight, Compass, Building2, Handshake } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;

export default function ExplorerScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = createStyles(theme);

  return (
    <View style={s.container}>
      <GlassBackground />
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Compass color={theme.accent} size={22} />
        </View>
        <View>
          <Text style={s.headerTitle}>Explorer</Text>
          <Text style={s.headerSub}>Découvre les boxs, programmes et partenaires</Text>
        </View>
      </View>

      <ScrollView style={s.content} contentContainerStyle={{ paddingBottom: 140, gap: 10 }}>
        {/* Annuaire des Boxes */}
        <TouchableOpacity
          style={s.sectionBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('BoxDirectory')}
        >
          <View style={[s.sectionIcon, { backgroundColor: `${theme.accent}15` }]}>
            <Building2 color={theme.accent} size={24} />
          </View>
          <View style={s.sectionContent}>
            <Text style={s.sectionTitle}>Annuaire des Boxs</Text>
            <Text style={s.sectionDesc}>Trouve une box près de chez toi, explore la carte</Text>
          </View>
          <ChevronRight color={theme.textMuted} size={20} />
        </TouchableOpacity>

        {/* Programmation */}
        <TouchableOpacity
          style={s.sectionBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Programmation')}
        >
          <View style={[s.sectionIcon, { backgroundColor: `${theme.accent}15` }]}>
            <BookOpen color={theme.accent} size={24} />
          </View>
          <View style={s.sectionContent}>
            <Text style={s.sectionTitle}>Programmation</Text>
            <Text style={s.sectionDesc}>Programmes d'entraînement par les meilleurs coachs</Text>
          </View>
          <ChevronRight color={theme.textMuted} size={20} />
        </TouchableOpacity>

        {/* Partenaires */}
        <TouchableOpacity
          style={s.sectionBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Partners')}
        >
          <View style={[s.sectionIcon, { backgroundColor: `${theme.accent}15` }]}>
            <Handshake color={theme.accent} size={24} />
          </View>
          <View style={s.sectionContent}>
            <Text style={s.sectionTitle}>Partenaires</Text>
            <Text style={s.sectionDesc}>Offres exclusives de nos marques partenaires</Text>
          </View>
          <ChevronRight color={theme.textMuted} size={20} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
  },
  headerIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: `${t.accent}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: t.text },
  headerSub: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: t.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: t.border,
  },
  sectionIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionContent: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: t.text },
  sectionDesc: { fontSize: 12, color: t.textMuted, marginTop: 3 },
}); }
