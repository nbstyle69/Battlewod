import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl, Switch,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Eye, EyeOff } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../theme/colors';
import { BoxWOD, BoxWODType } from '../../types';

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

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function BOWODsScreen({ navigation }: any) {
  const { user, currentBox } = useAuth();

  const [wods,      setWods]      = useState<BoxWOD[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editWOD,    setEditWOD]    = useState<BoxWOD | null>(null);

  // Form state
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [wodType,     setWodType]      = useState<BoxWODType>('amrap');
  const [date,        setDate]        = useState('');
  const [timeCap,     setTimeCap]     = useState('');
  const [rounds,      setRounds]      = useState('');
  const [notes,       setNotes]       = useState('');
  const [published,   setPublished]   = useState(true);
  const [submitting,  setSubmitting]  = useState(false);

  const weekDates = getWeekDates(weekOffset);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    const start = toISO(weekDates[0]);
    const end   = toISO(weekDates[6]);
    const { data } = await supabase
      .from('box_wods')
      .select('*')
      .eq('box_id', currentBox.id)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date');
    setWods((data ?? []) as BoxWOD[]);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, weekOffset]);

  useEffect(() => { load(); }, [load]);

  function openCreate(selectedDate: string) {
    setEditWOD(null);
    setTitle(''); setDescription(''); setWodType('amrap');
    setDate(selectedDate); setTimeCap(''); setRounds('');
    setNotes(''); setPublished(true);
    setModalOpen(true);
  }

  function openEdit(wod: BoxWOD) {
    setEditWOD(wod);
    setTitle(wod.title);
    setDescription(wod.description ?? '');
    setWodType(wod.wod_type ?? 'amrap');
    setDate(wod.scheduled_date);
    setTimeCap(wod.time_cap_seconds ? String(Math.floor(wod.time_cap_seconds / 60)) : '');
    setRounds(wod.rounds ? String(wod.rounds) : '');
    setNotes(wod.notes ?? '');
    setPublished(wod.is_published);
    setModalOpen(true);
  }

  async function saveWOD() {
    if (!title.trim() || !date || !currentBox || !user) return;
    setSubmitting(true);
    const payload = {
      box_id: currentBox.id,
      created_by: user.id,
      title: title.trim(),
      description: description.trim() || null,
      wod_type: wodType,
      scheduled_date: date,
      time_cap_seconds: timeCap ? parseInt(timeCap) * 60 : null,
      rounds: rounds ? parseInt(rounds) : null,
      notes: notes.trim() || null,
      is_published: published,
    };
    const { error } = editWOD
      ? await supabase.from('box_wods').update(payload).eq('id', editWOD.id)
      : await supabase.from('box_wods').insert(payload);
    setSubmitting(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setModalOpen(false);
    load();
  }

  async function togglePublish(wod: BoxWOD) {
    await supabase.from('box_wods').update({ is_published: !wod.is_published }).eq('id', wod.id);
    load();
  }

  async function deleteWOD(wod: BoxWOD) {
    Alert.alert('Supprimer ce WOD ?', wod.title, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await supabase.from('box_wods').delete().eq('id', wod.id);
          load();
        },
      },
    ]);
  }

  const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const todayISO = toISO(new Date());

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={Colors.text} size={22} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Calendrier WODs</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Week navigation */}
      <View style={s.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={s.weekArrow}>
          <ChevronLeft color={Colors.text} size={20} />
        </TouchableOpacity>
        <Text style={s.weekLabel}>
          {weekDates[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          {' — '}
          {weekDates[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={s.weekArrow}>
          <ChevronRight color={Colors.text} size={20} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.primary} />
        : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {weekDates.map((d, i) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              const dayWODs = wods.filter(w => w.scheduled_date === iso);
              return (
                <View key={iso} style={s.dayBlock}>
                  <View style={[s.dayHeader, isToday && s.dayHeaderToday]}>
                    <Text style={[s.dayLabel, isToday && s.dayLabelToday]}>
                      {DAY_LABELS[i]} {d.getDate()}
                    </Text>
                    {isToday && <Text style={s.todayBadge}>Aujourd'hui</Text>}
                    <TouchableOpacity onPress={() => openCreate(iso)} style={s.addDayBtn}>
                      <Plus color={isToday ? Colors.card : Colors.primary} size={16} />
                    </TouchableOpacity>
                  </View>

                  {dayWODs.length === 0 ? (
                    <TouchableOpacity style={s.emptyDay} onPress={() => openCreate(iso)} activeOpacity={0.7}>
                      <Text style={s.emptyDayText}>+ Ajouter un WOD</Text>
                    </TouchableOpacity>
                  ) : (
                    dayWODs.map(wod => {
                      const tc = TYPE_COLORS[wod.wod_type ?? 'custom'] ?? '#6B7280';
                      return (
                        <View key={wod.id} style={[s.wodRow, !wod.is_published && s.wodRowDraft]}>
                          <View style={[s.wodTypeBar, { backgroundColor: tc }]} />
                          <View style={s.wodRowContent}>
                            <Text style={s.wodRowType}>{(wod.wod_type ?? 'WOD').toUpperCase()}</Text>
                            <Text style={s.wodRowTitle}>{wod.title}</Text>
                            {!wod.is_published && <Text style={s.draftTag}>Brouillon</Text>}
                          </View>
                          <View style={s.wodRowActions}>
                            <TouchableOpacity onPress={() => togglePublish(wod)} style={s.iconBtn}>
                              {wod.is_published
                                ? <Eye color={Colors.success} size={16} />
                                : <EyeOff color={Colors.textMuted} size={16} />}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => openEdit(wod)} style={s.iconBtn}>
                              <Pencil color={Colors.primary} size={16} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteWOD(wod)} style={s.iconBtn}>
                              <Trash2 color={Colors.error} size={16} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

      {/* Create / Edit Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editWOD ? 'Modifier le WOD' : 'Créer un WOD'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={s.modalCancel}>Annuler</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">

              <Text style={s.mLabel}>DATE *</Text>
              <TextInput style={s.mInput} value={date} onChangeText={setDate} placeholder="2025-01-15" placeholderTextColor={Colors.textMuted} />

              <Text style={s.mLabel}>TITRE *</Text>
              <TextInput style={s.mInput} value={title} onChangeText={setTitle} placeholder="Fran, Cindy, Helen…" placeholderTextColor={Colors.textMuted} />

              <Text style={s.mLabel}>TYPE</Text>
              <View style={s.typeGrid}>
                {WOD_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.typeChip, wodType === t.value && { backgroundColor: TYPE_COLORS[t.value], borderColor: TYPE_COLORS[t.value] }]}
                    onPress={() => setWodType(t.value)}
                  >
                    <Text style={[s.typeChipText, wodType === t.value && { color: '#fff' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.mLabel}>DESCRIPTION</Text>
              <TextInput
                style={[s.mInput, s.mTextarea]}
                value={description} onChangeText={setDescription}
                placeholder="21-15-9 Thrusters + Pull-ups…"
                placeholderTextColor={Colors.textMuted} multiline
              />

              <View style={s.mRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mLabel}>TIME CAP (min)</Text>
                  <TextInput style={s.mInput} value={timeCap} onChangeText={setTimeCap} keyboardType="numeric" placeholder="20" placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mLabel}>ROUNDS</Text>
                  <TextInput style={s.mInput} value={rounds} onChangeText={setRounds} keyboardType="numeric" placeholder="5" placeholderTextColor={Colors.textMuted} />
                </View>
              </View>

              <Text style={s.mLabel}>NOTES COACH</Text>
              <TextInput
                style={[s.mInput, s.mTextarea]}
                value={notes} onChangeText={setNotes}
                placeholder="Conseils, scaling options…"
                placeholderTextColor={Colors.textMuted} multiline
              />

              <View style={s.publishRow}>
                <Text style={s.publishLabel}>Publier maintenant</Text>
                <Switch value={published} onValueChange={setPublished} trackColor={{ true: Colors.success }} />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, (!title.trim() || submitting) && s.saveBtnDisabled]}
                onPress={saveWOD}
                disabled={!title.trim() || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>{editWOD ? 'Enregistrer' : 'Créer le WOD'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  back:        { padding: 2 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },

  weekNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  weekArrow: { padding: 6 },
  weekLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },

  dayBlock:  { marginHorizontal: 16, marginTop: 14 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  dayHeaderToday: { backgroundColor: Colors.primary },
  dayLabel:  { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, flex: 1 },
  dayLabelToday: { color: '#fff' },
  todayBadge: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  addDayBtn: { padding: 2 },

  emptyDay:  { borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border, padding: 12, alignItems: 'center' },
  emptyDayText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  wodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  wodRowDraft: { opacity: 0.65 },
  wodTypeBar: { width: 4, alignSelf: 'stretch' },
  wodRowContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  wodRowType:  { fontSize: 9, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8 },
  wodRowTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  draftTag:    { fontSize: 9, fontWeight: '700', color: Colors.warning, letterSpacing: 0.5 },
  wodRowActions: { flexDirection: 'row', paddingRight: 8, gap: 2 },
  iconBtn:     { padding: 8 },

  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle:  { fontSize: 18, fontWeight: '900', color: Colors.text },
  modalCancel: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  modalBody:   { padding: 20, gap: 10 },
  mLabel:      { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1 },
  mInput: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: Colors.text,
  },
  mTextarea:   { minHeight: 80, textAlignVertical: 'top' },
  mRow:        { flexDirection: 'row', gap: 10 },
  typeGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  typeChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  publishRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  publishLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  saveBtn:     { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
