import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Copy } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ProgramWOD } from '../../types';
import { formatCap, parseCap } from '../../utils/scoreFormat';

const WOD_TYPES: { value: string; labelKey: string; color: string }[] = [
  { value: 'for-time', labelKey: 'bo.programEditor.typeForTime', color: '#EF4444' },
  { value: 'amrap',    labelKey: 'bo.programEditor.typeAmrap',   color: '#3B82F6' },
  { value: 'emom',     labelKey: 'bo.programEditor.typeEmom',    color: '#8B5CF6' },
  { value: 'strength', labelKey: 'bo.programEditor.typeStrength', color: '#16A34A' },
  { value: 'custom',   labelKey: 'bo.programEditor.typeCustom',  color: '#6B7280' },
];

export default function BOProgramEditorScreen({ navigation, route }: any) {
  const { programId, programTitle, durationWeeks, daysPerWeek, progType } = route.params;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const DAY_LABELS = t('bo.programEditor.dayLabels', { returnObjects: true }) as string[];
  const S = createStyles(theme);

  const totalWeeks = durationWeeks ?? 12;
  const dpw = daysPerWeek ?? 5;

  const [wods, setWods] = useState<ProgramWOD[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekIdx, setWeekIdx] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editWod, setEditWod] = useState<ProgramWOD | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fType, setFType] = useState('custom');
  const [fTimeCap, setFTimeCap] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fDayNumber, setFDayNumber] = useState(1);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('program_wods')
        .select('*')
        .eq('program_id', programId)
        .order('day_number')
        .order('sort_order');
      setWods((data ?? []) as ProgramWOD[]);
    } catch (e: any) {
      captureError(e, { screen: 'BOProgramEditor', action: 'load' });
    }
    setLoading(false);
  }, [programId]);

  useEffect(() => { load(); }, [load]);

  // Days for current week
  const weekStart = weekIdx * 7;
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i + 1);

  function wodsForDay(dayNum: number) {
    return wods.filter(w => w.day_number === dayNum);
  }

  function openCreate(dayNumber: number) {
    setEditWod(null);
    setFTitle(''); setFDesc(''); setFType('custom');
    setFTimeCap(''); setFNotes('');
    setFDayNumber(dayNumber);
    setModalOpen(true);
  }

  function openEdit(w: ProgramWOD) {
    setEditWod(w);
    setFTitle(w.title);
    setFDesc(w.description);
    setFType(w.wod_type ?? 'custom');
    setFTimeCap(formatCap(w.time_cap_seconds));
    setFNotes(w.notes ?? '');
    setFDayNumber(w.day_number ?? 1);
    setModalOpen(true);
  }

  async function save() {
    if (!fTitle.trim() || !fDesc.trim()) return;
    setSubmitting(true);
    const weekNumber = Math.ceil(fDayNumber / 7);
    const payload: any = {
      program_id: programId,
      day_number: fDayNumber,
      week_number: weekNumber,
      title: fTitle.trim(),
      description: fDesc.trim(),
      wod_type: fType,
      time_cap_seconds: parseCap(fTimeCap),
      notes: fNotes.trim() || null,
    };
    try {
      if (editWod) {
        const { error } = await supabase.from('program_wods').update(payload).eq('id', editWod.id);
        if (error) throw error;
      } else {
        const dayCount = wodsForDay(fDayNumber).length;
        payload.sort_order = dayCount;
        const { error } = await supabase.from('program_wods').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
    setSubmitting(false);
  }

  async function deleteWod(w: ProgramWOD) {
    Alert.alert(t('bo.programEditor.deleteWodTitle'), w.title, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await supabase.from('program_wods').delete().eq('id', w.id);
          load();
        },
      },
    ]);
  }

  async function duplicateWeek() {
    const currentWods = wods.filter(w => (w.day_number ?? 0) > weekStart && (w.day_number ?? 0) <= weekStart + 7);
    if (currentWods.length === 0) { Alert.alert(t('bo.programEditor.emptyTitle'), t('bo.programEditor.emptyWeekMsg')); return; }
    const nextWeekStart = weekStart + 7;
    const inserts = currentWods.map(w => ({
      program_id: programId,
      day_number: (w.day_number ?? 1) + 7,
      week_number: (w.week_number ?? 1) + 1,
      title: w.title,
      description: w.description,
      wod_type: w.wod_type,
      time_cap_seconds: w.time_cap_seconds,
      notes: w.notes,
      sort_order: w.sort_order,
    }));
    const { error } = await supabase.from('program_wods').insert(inserts);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setWeekIdx(prev => prev + 1);
    load();
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle} numberOfLines={1}>{programTitle}</Text>
          <Text style={S.headerSub}>
            {progType === 'fixed' ? t('bo.programEditor.headerSub', { weeks: totalWeeks, days: dpw }) : t('bo.programEditor.headerOngoing')}
          </Text>
        </View>
      </View>

      {/* Week navigation */}
      <View style={S.weekNav}>
        <TouchableOpacity onPress={() => setWeekIdx(w => Math.max(0, w - 1))} style={S.weekArrow} disabled={weekIdx === 0}>
          <ChevronLeft color={weekIdx === 0 ? theme.textMuted : theme.text} size={20} />
        </TouchableOpacity>
        <Text style={S.weekLabel}>{t('bo.programEditor.week', { n: weekIdx + 1 })}{progType === 'fixed' ? ` / ${totalWeeks}` : ''}</Text>
        <TouchableOpacity
          onPress={() => setWeekIdx(w => progType === 'fixed' ? Math.min(totalWeeks - 1, w + 1) : w + 1)}
          style={S.weekArrow}
          disabled={progType === 'fixed' && weekIdx >= totalWeeks - 1}
        >
          <ChevronRight color={progType === 'fixed' && weekIdx >= totalWeeks - 1 ? theme.textMuted : theme.text} size={20} />
        </TouchableOpacity>
      </View>

      {/* Duplicate week */}
      <TouchableOpacity style={S.dupBtn} onPress={duplicateWeek} activeOpacity={0.7}>
        <Copy color={theme.accent} size={14} />
        <Text style={S.dupText}>{t('bo.programEditor.duplicateTo', { n: weekIdx + 2 })}</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          {weekDays.map((dayNum, i) => {
            const dayWods = wodsForDay(dayNum);
            const isRest = i >= dpw;
            return (
              <View key={dayNum} style={S.dayBlock}>
                <View style={[S.dayHeader, isRest && { opacity: 0.4 }]}>
                  <Text style={S.dayLabel}>{t('bo.programEditor.dayHeader', { day: DAY_LABELS[i], n: dayNum })}</Text>
                  {isRest && <Text style={S.restBadge}>{t('bo.programEditor.rest')}</Text>}
                  <TouchableOpacity onPress={() => openCreate(dayNum)} style={S.addDayBtn}>
                    <Plus color={theme.accent} size={16} />
                  </TouchableOpacity>
                </View>
                {dayWods.length === 0 ? (
                  <TouchableOpacity style={S.emptyDay} onPress={() => openCreate(dayNum)} activeOpacity={0.7}>
                    <Text style={S.emptyDayText}>{t('bo.programEditor.addWod')}</Text>
                  </TouchableOpacity>
                ) : (
                  dayWods.map(w => {
                    const tc = WOD_TYPES.find(wt => wt.value === w.wod_type)?.color ?? '#6B7280';
                    return (
                      <View key={w.id} style={S.wodRow}>
                        <View style={[S.wodTypeBar, { backgroundColor: tc }]} />
                        <View style={S.wodContent}>
                          <Text style={S.wodType}>{(w.wod_type ?? 'WOD').toUpperCase()}</Text>
                          <Text style={S.wodTitle}>{w.title}</Text>
                          <Text style={S.wodDesc} numberOfLines={2}>{w.description}</Text>
                        </View>
                        <View style={S.wodActions}>
                          <TouchableOpacity onPress={() => openEdit(w)} style={S.iconBtn}>
                            <Pencil color={theme.accent} size={14} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteWod(w)} style={S.iconBtn}>
                            <Trash2 color={theme.error} size={14} />
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

      {/* WOD Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editWod ? t('bo.programEditor.editWod') : t('bo.programEditor.dayN', { n: fDayNumber })}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={S.mLabel}>{t('bo.programEditor.labelTitle')}</Text>
              <TextInput style={S.mInput} value={fTitle} onChangeText={setFTitle} placeholder={t('bo.programEditor.titlePlaceholder')} placeholderTextColor={theme.textMuted} />

              <Text style={S.mLabel}>{t('bo.programEditor.labelType')}</Text>
              <View style={S.typeGrid}>
                {WOD_TYPES.map(wt => (
                  <TouchableOpacity
                    key={wt.value}
                    style={[S.typeChip, fType === wt.value && { backgroundColor: wt.color, borderColor: wt.color }]}
                    onPress={() => setFType(wt.value)}
                  >
                    <Text style={[S.typeChipText, fType === wt.value && { color: '#fff' }]}>{t(wt.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.mLabel}>{t('bo.programEditor.labelDescription')}</Text>
              <TextInput
                style={[S.mInput, S.mTextarea]}
                value={fDesc} onChangeText={setFDesc}
                placeholder={"A. Back Squat 5×5 @ 80%\nB. 3 RFT:\n  15 Wall Balls\n  10 T2B"}
                placeholderTextColor={theme.textMuted} multiline
              />

              <Text style={S.mLabel}>{t('bo.programEditor.labelTimeCap')}</Text>
              <TextInput style={S.mInput} value={fTimeCap} onChangeText={setFTimeCap} keyboardType="numbers-and-punctuation" placeholder="12:30" placeholderTextColor={theme.textMuted} />

              <Text style={S.mLabel}>{t('bo.programEditor.labelNotes')}</Text>
              <TextInput style={[S.mInput, { minHeight: 60 }]} value={fNotes} onChangeText={setFNotes} placeholder={t('bo.programEditor.notesPlaceholder')} placeholderTextColor={theme.textMuted} multiline />

              <TouchableOpacity
                style={[S.saveBtn, (!fTitle.trim() || !fDesc.trim() || submitting) && S.saveBtnDisabled]}
                onPress={save}
                disabled={!fTitle.trim() || !fDesc.trim() || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.saveBtnText}>{editWod ? t('common.save') : t('bo.programEditor.addWodBtn')}</Text>}
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
    container: { flex: 1, backgroundColor: t.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    back: { padding: 4, marginRight: 8 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: t.text },
    headerSub: { fontSize: 12, color: t.textSecondary, marginTop: 2 },

    weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    weekArrow: { padding: 6 },
    weekLabel: { fontSize: 16, fontWeight: '700', color: t.text },

    dupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: `${t.accent}08`, borderBottomWidth: 1, borderBottomColor: t.border },
    dupText: { fontSize: 13, color: t.accent, fontWeight: '600' },

    dayBlock: { marginBottom: 2 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    dayLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: t.text },
    restBadge: { fontSize: 11, color: t.error, fontWeight: '700', backgroundColor: `${t.error}18`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8 },
    addDayBtn: { padding: 4 },

    emptyDay: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: t.border },
    emptyDayText: { fontSize: 13, color: t.textMuted },

    wodRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.background },
    wodTypeBar: { width: 3, height: '80%', borderRadius: 2, marginRight: 10 },
    wodContent: { flex: 1 },
    wodType: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5 },
    wodTitle: { fontSize: 14, fontWeight: '700', color: t.text, marginTop: 1 },
    wodDesc: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
    wodActions: { flexDirection: 'row', gap: 8 },
    iconBtn: { padding: 6 },

    modalContainer: { flex: 1, backgroundColor: t.background },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: t.border },
    modalTitle: { fontSize: 18, fontWeight: '800', color: t.text },
    modalCancel: { fontSize: 15, color: t.accent, fontWeight: '600' },
    modalBody: { padding: 16, gap: 4, paddingBottom: 60 },

    mLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
    mInput: { backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15, borderWidth: 1, borderColor: t.border },
    mTextarea: { minHeight: 120, textAlignVertical: 'top' },

    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: t.border },
    typeChipText: { fontSize: 12, fontWeight: '700', color: t.textSecondary },

    saveBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
