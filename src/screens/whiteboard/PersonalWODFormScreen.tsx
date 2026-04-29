import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWODType } from '../../types';
import { WhiteboardStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';
import EmeraldCTAButton from '../../components/glass/EmeraldCTAButton';

type Nav = NativeStackNavigationProp<WhiteboardStackParamList, 'PersonalWODForm'>;
type Rt = RouteProp<WhiteboardStackParamList, 'PersonalWODForm'>;

const WOD_TYPES: { value: BoxWODType; label: string }[] = [
  { value: 'for-time', label: 'For Time' },
  { value: 'amrap',    label: 'AMRAP' },
  { value: 'emom',     label: 'EMOM' },
  { value: 'tabata',   label: 'Tabata' },
  { value: 'strength', label: 'Force' },
  { value: 'custom',   label: 'Custom' },
];

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function PersonalWODFormScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const S = createStyles(theme);

  const editId = route.params?.wodId ?? null;
  const initialDate = route.params?.date ?? toISO(new Date());

  // Form state
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [wodType, setWodType]           = useState<BoxWODType>('amrap');
  const [date, setDate]                 = useState(initialDate);
  const [timeCap, setTimeCap]           = useState('');
  const [rounds, setRounds]             = useState('');
  const [emomInterval, setEmomInterval] = useState('1');
  const [tabataWork, setTabataWork]     = useState('20');
  const [tabataRest, setTabataRest]     = useState('10');
  const [notes, setNotes]               = useState('');

  const [loading, setLoading]       = useState(!!editId);
  const [submitting, setSubmitting] = useState(false);

  // Load existing WOD if editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: row, error } = await supabase
        .from('box_wods')
        .select('*')
        .eq('id', editId)
        .maybeSingle();
      if (error || !row) { setLoading(false); return; }
      const data = row as any;
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setWodType((data.wod_type as BoxWODType) ?? 'amrap');
      setDate(data.scheduled_date);
      setTimeCap(data.time_cap_seconds ? String(Math.floor(data.time_cap_seconds / 60)) : '');
      setRounds(data.rounds ? String(data.rounds) : '');
      setEmomInterval(data.emom_interval_minutes ? String(data.emom_interval_minutes) : '1');
      setTabataWork(data.tabata_work_seconds ? String(data.tabata_work_seconds) : '20');
      setTabataRest(data.tabata_rest_seconds ? String(data.tabata_rest_seconds) : '10');
      setNotes(data.notes ?? '');
      setLoading(false);
    })();
  }, [editId]);

  async function save() {
    if (!user || !title.trim() || !date) {
      Alert.alert('Champs requis', 'Le titre et la date sont obligatoires.');
      return;
    }
    setSubmitting(true);
    const payload: any = {
      box_id: null,                         // ← marqueur WOD perso
      created_by: user.id,
      title: title.trim(),
      description: description.trim() || null,
      wod_type: wodType,
      scheduled_date: date,
      time_cap_seconds: timeCap ? parseInt(timeCap) * 60 : null,
      rounds: rounds ? parseInt(rounds) : null,
      notes: notes.trim() || null,
      is_published: true,
      leaderboard_enabled: false,
    };
    if (wodType === 'emom') {
      payload.emom_interval_minutes = emomInterval ? parseInt(emomInterval) : 1;
    }
    if (wodType === 'tabata') {
      payload.tabata_work_seconds = tabataWork ? parseInt(tabataWork) : 20;
      payload.tabata_rest_seconds = tabataRest ? parseInt(tabataRest) : 10;
    }
    try {
      if (editId) {
        const { error } = await supabase.from('box_wods').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('box_wods').insert({ ...payload, sort_order: 0 });
        if (error) throw error;
      }
      navigation.goBack();
    } catch (e: any) {
      captureError(e, { screen: 'PersonalWODForm', action: editId ? 'update' : 'insert' });
      Alert.alert('Erreur', e.message ?? 'Impossible de sauvegarder le WOD.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!editId) return;
    Alert.alert('Supprimer ce WOD ?', title, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('box_wods').delete().eq('id', editId);
          if (error) Alert.alert('Erreur', error.message);
          else navigation.goBack();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={S.container}
    >
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{editId ? 'Modifier mon WOD' : 'Créer un WOD'}</Text>
        {editId ? (
          <TouchableOpacity onPress={remove} style={S.back}>
            <Trash2 color={theme.error} size={20} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={S.body} keyboardShouldPersistTaps="handled">
        <View style={S.row}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>DATE *</Text>
            <TextInput
              style={S.input}
              value={date}
              onChangeText={setDate}
              placeholder="2026-04-27"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>

        <Text style={S.label}>TITRE *</Text>
        <TextInput
          style={S.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Fran, Cindy, mon WOD perso…"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={S.label}>TYPE</Text>
        <View style={S.typeGrid}>
          {WOD_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[
                S.typeChip,
                wodType === t.value && { backgroundColor: TYPE_COLORS[t.value], borderColor: TYPE_COLORS[t.value] },
              ]}
              onPress={() => setWodType(t.value)}
              activeOpacity={0.8}
            >
              <Text style={[S.typeChipText, wodType === t.value && { color: '#fff' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={S.label}>DESCRIPTION</Text>
        <TextInput
          style={[S.input, S.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="21-15-9 Thrusters + Pull-ups…"
          placeholderTextColor={theme.textMuted}
          multiline
        />

        <View style={S.row}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>TIME CAP (min)</Text>
            <TextInput
              style={S.input}
              value={timeCap}
              onChangeText={setTimeCap}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor={theme.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>ROUNDS</Text>
            <TextInput
              style={S.input}
              value={rounds}
              onChangeText={setRounds}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>

        {wodType === 'emom' && (
          <>
            <Text style={S.label}>INTERVALLE EMOM (min)</Text>
            <TextInput
              style={S.input}
              value={emomInterval}
              onChangeText={setEmomInterval}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={theme.textMuted}
            />
          </>
        )}

        {wodType === 'tabata' && (
          <View style={S.row}>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>WORK (sec)</Text>
              <TextInput
                style={S.input}
                value={tabataWork}
                onChangeText={setTabataWork}
                keyboardType="numeric"
                placeholder="20"
                placeholderTextColor={theme.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>REST (sec)</Text>
              <TextInput
                style={S.input}
                value={tabataRest}
                onChangeText={setTabataRest}
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={theme.textMuted}
              />
            </View>
          </View>
        )}

        <Text style={S.label}>NOTES</Text>
        <TextInput
          style={[S.input, S.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Scaling, conseils, intentions…"
          placeholderTextColor={theme.textMuted}
          multiline
        />

        <EmeraldCTAButton
          onPress={save}
          disabled={!title.trim()}
          loading={submitting}
          style={{ marginTop: 8 }}
        >
          {editId ? 'Enregistrer' : 'Créer le WOD'}
        </EmeraldCTAButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    back: { padding: 2, width: 26 },
    headerTitle: { fontSize: 18, fontWeight: '900', color: theme.text },
    body: { padding: 20, gap: 10, paddingBottom: 60 },
    label: { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
    input: {
      backgroundColor: theme.card, borderRadius: 10,
      borderWidth: 1, borderColor: theme.border,
      paddingHorizontal: 12, paddingVertical: 11,
      fontSize: 14, color: theme.text,
    },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 10 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    },
    typeChipText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
    saveBtn: {
      backgroundColor: theme.accent, borderRadius: 14,
      padding: 18, alignItems: 'center', marginTop: 8,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  });
}
