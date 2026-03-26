import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Users, CalendarClock, Timer } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface ClassSchedule {
  id: string;
  box_id: string;
  title: string;
  description: string | null;
  coach: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  created_at: string;
  confirmed_count: number;
  waiting_count: number;
}

const CLASS_TYPES = [
  'WOD', 'Haltérophilie', 'Cardio', 'Open Gym', 'Strength', 'Mobility', 'Kids', 'Teens', 'Autre',
];

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

export default function BOScheduleScreen({ navigation }: any) {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [schedules,   setSchedules]   = useState<ClassSchedule[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editItem,    setEditItem]    = useState<ClassSchedule | null>(null);

  const [title,       setTitle]       = useState('WOD');
  const [customTitle, setCustomTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coach,       setCoach]       = useState('');
  const [date,        setDate]        = useState('');
  const [startTime,   setStartTime]   = useState('09:00');
  const [endTime,     setEndTime]     = useState('10:00');
  const [maxCapacity, setMaxCapacity] = useState('15');
  const [submitting,  setSubmitting]  = useState(false);

  const weekDates = getWeekDates(weekOffset);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    const start = toISO(weekDates[0]);
    const end   = toISO(weekDates[6]);

    const { data } = await supabase
      .from('class_schedules')
      .select('*')
      .eq('box_id', currentBox.id)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date')
      .order('start_time');

    const rawItems = (data ?? []) as Omit<ClassSchedule, 'confirmed_count' | 'waiting_count'>[];

    let items: ClassSchedule[] = rawItems.map(s => ({ ...s, confirmed_count: 0, waiting_count: 0 }));

    if (rawItems.length > 0) {
      const ids = rawItems.map(s => s.id);
      const { data: resCounts } = await supabase
        .from('class_reservations')
        .select('schedule_id, status')
        .in('schedule_id', ids);

      const confirmedMap: Record<string, number> = {};
      const waitingMap:   Record<string, number> = {};
      ids.forEach(id => { confirmedMap[id] = 0; waitingMap[id] = 0; });
      (resCounts ?? []).forEach((r: any) => {
        if (r.status === 'waiting') { if (waitingMap[r.schedule_id] !== undefined) waitingMap[r.schedule_id]++; }
        else                        { if (confirmedMap[r.schedule_id] !== undefined) confirmedMap[r.schedule_id]++; }
      });
      items = items.map(s => ({ ...s, confirmed_count: confirmedMap[s.id] ?? 0, waiting_count: waitingMap[s.id] ?? 0 }));
    }

    setSchedules(items);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, weekOffset]);

  useEffect(() => { load(); }, [load]);

  function openCreate(selectedDate: string) {
    setEditItem(null);
    setTitle('WOD'); setCustomTitle(''); setDescription('');
    setCoach(''); setDate(selectedDate);
    setStartTime('09:00'); setEndTime('10:00'); setMaxCapacity('15');
    setModalOpen(true);
  }

  function openEdit(item: ClassSchedule) {
    setEditItem(item);
    const isPreset = CLASS_TYPES.includes(item.title);
    setTitle(isPreset ? item.title : 'Autre');
    setCustomTitle(isPreset ? '' : item.title);
    setDescription(item.description ?? '');
    setCoach(item.coach ?? '');
    setDate(item.scheduled_date);
    setStartTime(item.start_time);
    setEndTime(item.end_time);
    setMaxCapacity(String(item.max_capacity));
    setModalOpen(true);
  }

  async function save() {
    const finalTitle = title === 'Autre' ? customTitle.trim() : title;
    if (!finalTitle || !date || !startTime || !endTime || !currentBox || !user) return;
    const cap = parseInt(maxCapacity);
    if (isNaN(cap) || cap < 1) { Alert.alert('Capacité invalide'); return; }

    setSubmitting(true);
    const payload = {
      box_id: currentBox.id,
      title: finalTitle,
      description: description.trim() || null,
      coach: coach.trim() || null,
      scheduled_date: date,
      start_time: startTime,
      end_time: endTime,
      max_capacity: cap,
    };

    const { error } = editItem
      ? await supabase.from('class_schedules').update(payload).eq('id', editItem.id)
      : await supabase.from('class_schedules').insert(payload);

    setSubmitting(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setModalOpen(false);
    load();
  }

  async function deleteItem(item: ClassSchedule) {
    Alert.alert('Supprimer ce créneau ?', `${item.title} — ${item.start_time}`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await supabase.from('class_schedules').delete().eq('id', item.id);
          load();
        },
      },
    ]);
  }

  const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const todayISO = toISO(new Date());

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.headerTitle}>Horaires & Créneaux</Text>
        <Text style={S.headerSub}>{currentBox?.name ?? ''}</Text>
      </View>

      <View style={S.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={S.weekArrow}>
          <ChevronLeft color={theme.text} size={20} />
        </TouchableOpacity>
        <Text style={S.weekLabel}>
          {weekDates[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          {' — '}
          {weekDates[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={S.weekArrow}>
          <ChevronRight color={theme.text} size={20} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
        : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {weekDates.map((d, i) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              const dayItems = schedules.filter(s => s.scheduled_date === iso);
              return (
                <View key={iso} style={S.dayBlock}>
                  <View style={[S.dayHeader, isToday && S.dayHeaderToday]}>
                    <Text style={[S.dayLabel, isToday && S.dayLabelToday]}>
                      {DAY_LABELS[i]} {d.getDate()}
                    </Text>
                    {isToday && <Text style={S.todayBadge}>Aujourd'hui</Text>}
                    <TouchableOpacity onPress={() => openCreate(iso)} style={S.addDayBtn}>
                      <Plus color={isToday ? theme.card : theme.accent} size={16} />
                    </TouchableOpacity>
                  </View>

                  {dayItems.length === 0 ? (
                    <TouchableOpacity style={S.emptyDay} onPress={() => openCreate(iso)} activeOpacity={0.7}>
                      <Text style={S.emptyDayText}>+ Ajouter un créneau</Text>
                    </TouchableOpacity>
                  ) : (
                    dayItems.map(item => (
                      <View key={item.id} style={S.slotCard}>
                        <View style={S.slotLeft}>
                          <Text style={S.slotTime}>{item.start_time} – {item.end_time}</Text>
                          <Text style={S.slotTitle}>{item.title}</Text>
                          {item.coach ? <Text style={S.slotCoach}>👤 {item.coach}</Text> : null}
                        </View>
                        <View style={S.slotRight}>
                          <View style={S.capacityRow}>
                            <View style={[
                              S.capacityBadge,
                              item.confirmed_count >= item.max_capacity && S.capacityFull,
                            ]}>
                              <Users color={item.confirmed_count >= item.max_capacity ? theme.error : theme.accent} size={12} />
                              <Text style={[S.capacityText, item.confirmed_count >= item.max_capacity && { color: theme.error }]}>
                                {item.confirmed_count}/{item.max_capacity}
                              </Text>
                            </View>
                            {item.waiting_count > 0 && (
                              <View style={S.waitingBadge}>
                                <Timer color="#f59e0b" size={11} />
                                <Text style={S.waitingText}>{item.waiting_count}</Text>
                              </View>
                            )}
                          </View>
                          <View style={S.slotActions}>
                            <TouchableOpacity onPress={() => openEdit(item)} style={S.actionBtn}>
                              <Pencil color={theme.textMuted} size={16} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteItem(item)} style={S.actionBtn}>
                              <Trash2 color={theme.error} size={16} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </ScrollView>
        )
      }

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.modalOverlay}
        >
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editItem ? 'Modifier le créneau' : 'Nouveau créneau'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={S.fieldLabel}>Type de cours</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {CLASS_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[S.typePill, title === t && S.typePillActive]}
                    onPress={() => setTitle(t)}
                  >
                    <Text style={[S.typePillText, title === t && S.typePillTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {title === 'Autre' && (
                <>
                  <Text style={S.fieldLabel}>Nom personnalisé</Text>
                  <TextInput
                    style={S.input}
                    value={customTitle}
                    onChangeText={setCustomTitle}
                    placeholder="Ex : Yoga, Pilates…"
                    placeholderTextColor={theme.textMuted}
                  />
                </>
              )}

              <Text style={S.fieldLabel}>Coaches (optionnel)</Text>
              <TextInput
                style={S.input}
                value={coach}
                onChangeText={setCoach}
                placeholder="Nom du coach"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={S.fieldLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={S.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-03-15"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
              />

              <View style={S.row}>
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>Début</Text>
                  <TextInput
                    style={S.input}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="09:00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>Fin</Text>
                  <TextInput
                    style={S.input}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="10:00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>Capacité</Text>
                  <TextInput
                    style={S.input}
                    value={maxCapacity}
                    onChangeText={setMaxCapacity}
                    placeholder="15"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={S.fieldLabel}>Description (optionnel)</Text>
              <TextInput
                style={[S.input, { height: 72, textAlignVertical: 'top' }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Détails du cours…"
                placeholderTextColor={theme.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[S.saveBtn, submitting && { opacity: 0.6 }]}
                onPress={save}
                disabled={submitting}
              >
                <Text style={S.saveBtnText}>{submitting ? 'Enregistrement…' : editItem ? 'Modifier' : 'Créer le créneau'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container:       { flex: 1, backgroundColor: t.background },
    header:          { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
    headerTitle:     { fontSize: 26, fontWeight: '900', color: t.text, letterSpacing: -0.5 },
    headerSub:       { fontSize: 13, color: t.textMuted, marginTop: 2 },
    weekNav:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    weekArrow:       { padding: 6 },
    weekLabel:       { fontSize: 13, fontWeight: '700', color: t.text },
    dayBlock:        { marginHorizontal: 16, marginTop: 16 },
    dayHeader:       { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: t.border },
    dayHeaderToday:  { backgroundColor: t.accent, borderColor: t.accent },
    dayLabel:        { fontSize: 13, fontWeight: '700', color: t.text, flex: 1 },
    dayLabelToday:   { color: t.card },
    todayBadge:      { fontSize: 11, fontWeight: '700', color: t.card, marginRight: 8 },
    addDayBtn:       { padding: 4 },
    emptyDay:        { borderWidth: 1, borderColor: t.border, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    emptyDayText:    { fontSize: 13, color: t.textMuted },
    slotCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border },
    slotLeft:        { flex: 1 },
    slotTime:        { fontSize: 12, fontWeight: '700', color: t.accent, marginBottom: 2 },
    slotTitle:       { fontSize: 15, fontWeight: '800', color: t.text },
    slotCoach:       { fontSize: 12, color: t.textMuted, marginTop: 2 },
    slotRight:       { alignItems: 'flex-end', gap: 8 },
    capacityRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
    capacityBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.accent}12`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    capacityFull:    { backgroundColor: `${t.error}12` },
    capacityText:    { fontSize: 12, fontWeight: '700', color: t.accent },
    waitingBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
    waitingText:     { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
    slotActions:     { flexDirection: 'row', gap: 8 },
    actionBtn:       { padding: 6 },
    row:             { flexDirection: 'row', marginBottom: 0 },
    modalOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet:      { backgroundColor: t.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
    modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle:      { fontSize: 18, fontWeight: '900', color: t.text },
    modalClose:      { fontSize: 20, color: t.textMuted, padding: 4 },
    fieldLabel:      { fontSize: 12, fontWeight: '700', color: t.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    input:           { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, color: t.text, fontSize: 15, marginBottom: 4 },
    typePill:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, marginRight: 8 },
    typePillActive:  { backgroundColor: t.accent, borderColor: t.accent },
    typePillText:    { fontSize: 13, fontWeight: '600', color: t.textMuted },
    typePillTextActive: { color: '#fff' },
    saveBtn:         { backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
    saveBtnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },
  });
}
