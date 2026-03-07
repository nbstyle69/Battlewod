import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Target } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

const ZONES: Array<{
  pct: number;
  zone: string;
  reps: string;
  color: string;
  bg: string;
}> = [
  { pct: 50,  zone: 'Récupération',  reps: '20+ reps', color: '#60A5FA', bg: '#1E3A5F' },
  { pct: 55,  zone: 'Endurance',     reps: '16–20 reps', color: '#60A5FA', bg: '#1E3A5F' },
  { pct: 60,  zone: 'Endurance',     reps: '12–16 reps', color: '#34D399', bg: '#1A3D2E' },
  { pct: 65,  zone: 'Hypertrophie',  reps: '10–12 reps', color: '#34D399', bg: '#1A3D2E' },
  { pct: 70,  zone: 'Hypertrophie',  reps: '8–10 reps',  color: '#34D399', bg: '#1A3D2E' },
  { pct: 75,  zone: 'Hypertrophie',  reps: '6–8 reps',   color: '#FBBF24', bg: '#3D2E0F' },
  { pct: 80,  zone: 'Force',         reps: '4–6 reps',   color: '#FBBF24', bg: '#3D2E0F' },
  { pct: 85,  zone: 'Force',         reps: '3–5 reps',   color: '#F97316', bg: '#3D1A0A' },
  { pct: 90,  zone: 'Force Max',     reps: '2–3 reps',   color: '#F97316', bg: '#3D1A0A' },
  { pct: 95,  zone: 'Force Max',     reps: '1–2 reps',   color: '#EF4444', bg: '#3D0F0F' },
  { pct: 100, zone: '1RM',           reps: '1 rep',      color: '#EF4444', bg: '#3D0F0F' },
  { pct: 105, zone: 'Supra-max',     reps: 'Partiel/excentrique', color: '#A855F7', bg: '#2E1048' },
  { pct: 110, zone: 'Supra-max',     reps: 'Excentrique seul',    color: '#A855F7', bg: '#2E1048' },
  { pct: 115, zone: 'Potentiation',  reps: 'Assistance',          color: '#EC4899', bg: '#3D0A24' },
  { pct: 120, zone: 'Potentiation',  reps: 'Assistance',          color: '#EC4899', bg: '#3D0A24' },
  { pct: 125, zone: 'Overloading',   reps: 'Technique guidée',    color: '#EC4899', bg: '#3D0A24' },
  { pct: 130, zone: 'Overloading',   reps: 'Technique guidée',    color: '#EC4899', bg: '#3D0A24' },
];

function round(val: number, step: number): number {
  return Math.round(val / step) * step;
}

export default function OneRMCalculatorScreen() {
  const navigation = useNavigation();
  const [input, setInput] = useState('');
  const [isLbs, setIsLbs] = useState(false);

  const unit = isLbs ? 'lbs' : 'kg';
  const step = isLbs ? 5 : 2.5;
  const raw = parseFloat(input.replace(',', '.'));
  const valid = !isNaN(raw) && raw > 0;

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Target color="#00ff88" size={18} />
          <Text style={s.headerTitle}>Calculateur 1RM</Text>
        </View>
        <View style={s.backBtn} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Input */}
        <View style={s.inputCard}>
          <Text style={s.inputLabel}>TON 1RM</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              keyboardType="decimal-pad"
              placeholder="ex: 100"
              placeholderTextColor="#444"
              maxLength={6}
            />
            <Text style={s.inputUnit}>{unit}</Text>
          </View>

          <View style={s.toggleRow}>
            <Text style={[s.toggleLabel, !isLbs && { color: '#00ff88', fontWeight: '800' }]}>KG</Text>
            <Switch
              value={isLbs}
              onValueChange={setIsLbs}
              trackColor={{ false: '#00ff88', true: '#FF3B30' }}
              thumbColor="#fff"
            />
            <Text style={[s.toggleLabel, isLbs && { color: '#FF3B30', fontWeight: '800' }]}>LBS</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.thTxt, { flex: 0.7 }]}>%</Text>
          <Text style={[s.thTxt, { flex: 1 }]}>Charge</Text>
          <Text style={[s.thTxt, { flex: 1.5 }]}>Zone</Text>
          <Text style={[s.thTxt, { flex: 1.3 }]}>Reps</Text>
        </View>

        {/* Table rows */}
        {ZONES.map((z) => {
          const load = valid ? round(raw * z.pct / 100, step) : null;
          return (
            <View key={z.pct} style={[s.row, { backgroundColor: z.bg }]}>
              <View style={[s.pctBadge, { borderColor: z.color }]}>
                <Text style={[s.pctTxt, { color: z.color }]}>{z.pct}%</Text>
              </View>
              <Text style={[s.loadTxt, { flex: 1, color: load ? '#fff' : '#333' }]}>
                {load != null ? `${load} ${unit}` : '—'}
              </Text>
              <Text style={[s.zoneTxt, { flex: 1.5, color: z.color }]}>{z.zone}</Text>
              <Text style={[s.repsTxt, { flex: 1.3 }]}>{z.reps}</Text>
            </View>
          );
        })}

        <View style={s.footer}>
          <Text style={s.footerTxt}>
            Charges arrondies au {step} {unit} le plus proche.{'\n'}
            Au-delà de 100% : excentrique, partiel ou assisté uniquement.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  inputCard: {
    backgroundColor: '#111', borderRadius: 16, padding: 20,
    marginTop: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#222',
  },
  inputLabel: {
    fontSize: 10, fontWeight: '800', color: '#00ff88',
    letterSpacing: 1.5, marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  input: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 28, fontWeight: '900', color: '#fff',
    borderWidth: 1, borderColor: '#333',
  },
  inputUnit: { fontSize: 20, fontWeight: '800', color: '#555' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: '#444', letterSpacing: 1 },

  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: '#111', borderRadius: 10, marginBottom: 4,
  },
  thTxt: { fontSize: 9, fontWeight: '800', color: '#555', letterSpacing: 1, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 11,
    borderRadius: 10, marginBottom: 3,
    gap: 4,
  },
  pctBadge: {
    flex: 0.7, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: 6, paddingVertical: 3, marginRight: 4,
  },
  pctTxt: { fontSize: 12, fontWeight: '900' },
  loadTxt: { fontSize: 13, fontWeight: '800' },
  zoneTxt: { fontSize: 11, fontWeight: '700' },
  repsTxt: { fontSize: 10, fontWeight: '600', color: '#aaa' },

  footer: { marginTop: 20, paddingHorizontal: 4 },
  footerTxt: { fontSize: 11, color: '#444', lineHeight: 18, textAlign: 'center' },
});
