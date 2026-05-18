import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Target, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';

const STORAGE_KEY = '@athlex:1rm_calc';

const PR_MOVEMENTS = [
  'Back Squat', 'Front Squat', 'Deadlift', 'Bench Press',
  'Strict Press', 'Push Press', 'Push Jerk', 'Split Jerk',
  'Squat Clean', 'Power Clean', 'Hang Power Clean', 'Hang Squat Clean',
  'Squat Snatch', 'Power Snatch', 'Hang Power Snatch', 'Hang Squat Snatch',
  'Clean & Jerk', 'Overhead Squat', 'Thruster',
];

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
  const { theme } = useTheme();
  const { user } = useAuth();
  const S = createStyles(theme);
  const [input, setInput] = useState('');
  const [isLbs, setIsLbs] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [prData, setPrData] = useState<Record<string, string>>({});
  const [showPRList, setShowPRList] = useState(false);

  // Restore persisted values on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(json => {
      if (!json) return;
      try {
        const saved = JSON.parse(json);
        if (saved.input) setInput(saved.input);
        if (saved.movement) setSelectedMovement(saved.movement);
        if (saved.isLbs !== undefined) setIsLbs(saved.isLbs);
      } catch (e) { captureError(e, { screen: 'OneRMCalculator', action: 'restoreState' }); }
    });
  }, []);

  // Persist on change
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      input,
      movement: selectedMovement,
      isLbs,
    })).catch(e => captureError(e, { action: 'persistOneRM' }));
  }, [input, selectedMovement, isLbs]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('personal_records')
        .eq('id', user.id)
        .single();
      if (data?.personal_records && typeof data.personal_records === 'object') {
        setPrData(data.personal_records as Record<string, string>);
      }
    })();
  }, [user?.id]);

  const savedPRs = PR_MOVEMENTS
    .map(name => {
      const key = `Haltérophilie_${name}`;
      const val = prData[key];
      const num = parseFloat(val ?? '');
      return { name, key, value: val, num };
    })
    .filter(pr => pr.value && !isNaN(pr.num) && pr.num > 0);

  function selectPR(pr: { name: string; num: number; value: string }) {
    setSelectedMovement(pr.name);
    setInput(pr.value);
    setShowPRList(false);
  }

  const unit = isLbs ? 'lbs' : 'kg';
  const step = isLbs ? 5 : 2.5;
  const raw = parseFloat(input.replace(',', '.'));
  const valid = !isNaN(raw) && raw > 0;

  return (
    <SafeAreaView style={S.screen}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn} activeOpacity={0.7}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View style={S.headerCenter}>
          <Target color={theme.success} size={18} />
          <Text style={S.headerTitle}>Calculateur 1RM</Text>
        </View>
        <View style={S.backBtn} />
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

        {/* PR Quick Select */}
        {savedPRs.length > 0 && (
          <View style={S.prSection}>
            <GlassCard radius={14} variant="emerald">
              <TouchableOpacity
                style={S.prToggle}
                onPress={() => setShowPRList(!showPRList)}
                activeOpacity={0.7}
              >
                <Dumbbell color={theme.accent} size={16} />
                <Text style={S.prToggleText}>
                  {selectedMovement ?? 'Choisir un mouvement (mes PR)'}
                </Text>
                {showPRList
                  ? <ChevronUp color={theme.textMuted} size={16} />
                  : <ChevronDown color={theme.textMuted} size={16} />}
              </TouchableOpacity>
            </GlassCard>

            {showPRList && (
              <GlassCard radius={14} style={{ marginTop: 6 }}>
                <View>
                  {savedPRs.map(pr => (
                    <TouchableOpacity
                      key={pr.key}
                      style={[S.prItem, selectedMovement === pr.name && S.prItemActive]}
                      onPress={() => selectPR(pr)}
                      activeOpacity={0.7}
                    >
                      <Text style={[S.prItemName, selectedMovement === pr.name && { color: theme.accent }]}>
                        {pr.name}
                      </Text>
                      <Text style={S.prItemValue}>{pr.value} kg</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassCard>
            )}
          </View>
        )}

        {/* Input */}
        <GlassCard radius={16} style={{ marginTop: 20, marginBottom: 20 }}>
          <View style={S.inputCardInner}>
            <Text style={S.inputLabel}>
              {selectedMovement ? `1RM — ${selectedMovement}` : 'TON 1RM'}
            </Text>
            <View style={S.inputRow}>
              <TextInput
                style={S.input}
                value={input}
                onChangeText={(v) => { setInput(v); setSelectedMovement(null); }}
                keyboardType="decimal-pad"
                placeholder="ex: 100"
                placeholderTextColor={theme.textMuted}
                maxLength={6}
              />
              <Text style={S.inputUnit}>{unit}</Text>
            </View>

            <View style={S.toggleRow}>
              <Text style={[S.toggleLabel, !isLbs && { color: theme.success, fontWeight: '800' }]}>KG</Text>
              <Switch
                value={isLbs}
                onValueChange={setIsLbs}
                trackColor={{ false: theme.success, true: '#FF3B30' }}
                thumbColor="#fff"
              />
              <Text style={[S.toggleLabel, isLbs && { color: '#FF3B30', fontWeight: '800' }]}>LBS</Text>
            </View>
          </View>
        </GlassCard>

        {/* Table header */}
        <GlassCard radius={10} style={{ marginBottom: 4 }}>
          <View style={S.tableHeader}>
            <Text style={[S.thTxt, { flex: 0.7 }]}>%</Text>
            <Text style={[S.thTxt, { flex: 1 }]}>Charge</Text>
            <Text style={[S.thTxt, { flex: 1.5 }]}>Zone</Text>
            <Text style={[S.thTxt, { flex: 1.3 }]}>Reps</Text>
          </View>
        </GlassCard>

        {/* Table rows */}
        {ZONES.map((z) => {
          const load = valid ? round(raw * z.pct / 100, step) : null;
          return (
            <View key={z.pct} style={[S.row, { backgroundColor: z.bg }]}>
              <View style={[S.pctBadge, { borderColor: z.color }]}>
                <Text style={[S.pctTxt, { color: z.color }]}>{z.pct}%</Text>
              </View>
              <Text style={[S.loadTxt, { flex: 1, color: load ? '#fff' : theme.textMuted }]}>
                {load != null ? `${load} ${unit}` : '—'}
              </Text>
              <Text style={[S.zoneTxt, { flex: 1.5, color: z.color }]}>{z.zone}</Text>
              <Text style={[S.repsTxt, { flex: 1.3 }]}>{z.reps}</Text>
            </View>
          );
        })}

        <View style={S.footer}>
          <Text style={S.footerTxt}>
            Charges arrondiées au {step} {unit} le plus proche.{'\n'}
            Au-delà de 100% : excentrique, partiel ou assisté uniquement.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: theme.text, letterSpacing: 0.2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 140 },
  inputCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 20,
    marginTop: 20, marginBottom: 20,
    borderWidth: 1, borderColor: theme.border,
  },
  inputCardInner: { padding: 20 },
  inputLabel: {
    fontSize: 10, fontWeight: '800', color: theme.success,
    letterSpacing: 1.5, marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  input: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 28, fontWeight: '900', color: theme.text,
    borderWidth: 1, borderColor: theme.border,
  },
  inputUnit: { fontSize: 20, fontWeight: '800', color: theme.textMuted },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: theme.textMuted, letterSpacing: 1 },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    borderRadius: 10,
  },
  thTxt: { fontSize: 9, fontWeight: '800', color: theme.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
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
  repsTxt: { fontSize: 10, fontWeight: '600', color: theme.textSecondary },
  footer: { marginTop: 20, paddingHorizontal: 4 },
  footerTxt: { fontSize: 11, color: theme.textMuted, lineHeight: 18, textAlign: 'center' },
  prSection: { marginTop: 20, marginBottom: 0 },
  prToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  prToggleText: {
    flex: 1, fontSize: 14, fontWeight: '700', color: theme.text,
  },
  prList: { overflow: 'hidden' },
  prItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  prItemActive: {
    backgroundColor: `${theme.accent}12`,
  },
  prItemName: {
    fontSize: 14, fontWeight: '700', color: theme.text,
  },
  prItemValue: {
    fontSize: 14, fontWeight: '900', color: theme.success,
  },
}); }
