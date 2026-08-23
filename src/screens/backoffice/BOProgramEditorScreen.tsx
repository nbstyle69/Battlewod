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
import { formatCap, parseCap } from '../../utils/scoreFormat';
import {
  listProgramWods, createProgramWod, updateProgramWod, deleteProgramWod,
  duplicateProgramWeek, ProgramWod,
} from '../../services/programContent';

/** Lundi (ISO) de la semaine d'une date `YYYY-MM-DD`. */
function lundiDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function decalerJours(iso: string, jours: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

function jourCourt(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

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

  const [wods, setWods] = useState<ProgramWod[]>([]);
  const [loading, setLoading] = useState(true);
  // La box du programme : c'est elle qui porte le WOD canonique.
  const [boxId, setBoxId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [weekIdx, setWeekIdx] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editWod, setEditWod] = useState<ProgramWod | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fType, setFType] = useState('custom');
  const [fTimeCap, setFTimeCap] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fDate, setFDate] = useState(lundiDe(new Date().toISOString().slice(0, 10)));

  const load = useCallback(async () => {
    setErreur(null);
    try {
      const { data: prog, error: erreurProg } = await supabase
        .from('programs')
        .select('box_id')
        .eq('id', programId)
        .single();
      if (erreurProg) throw erreurProg;
      setBoxId(prog.box_id);
      setWods(await listProgramWods(programId));
    } catch (e) {
      captureError(e, { screen: 'BOProgramEditor', action: 'load' });
      setErreur(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [programId]);

  useEffect(() => { load(); }, [load]);

  // Le contenu est daté au calendrier : la navigation va de semaine civile en
  // semaine civile, à partir de la semaine en cours.
  const lundiSemaine = decalerJours(lundiDe(new Date().toISOString().slice(0, 10)), weekIdx * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => decalerJours(lundiSemaine, i));

  function wodsForDate(date: string) {
    return wods.filter(w => w.scheduled_date === date);
  }

  function openCreate(date: string) {
    setEditWod(null);
    setFTitle(''); setFDesc(''); setFType('custom');
    setFTimeCap(''); setFNotes('');
    setFDate(date);
    setModalOpen(true);
  }

  function openEdit(w: ProgramWod) {
    setEditWod(w);
    setFTitle(w.title);
    setFDesc(w.description ?? '');
    setFType(w.wod_type ?? 'custom');
    setFTimeCap(formatCap(w.time_cap_seconds));
    setFNotes(w.notes ?? '');
    setFDate(w.scheduled_date);
    setModalOpen(true);
  }

  async function save() {
    if (!fTitle.trim() || !fDesc.trim()) return;
    if (!boxId) { Alert.alert(t('common.error'), t('bo.programEditor.unknownBox')); return; }
    setSubmitting(true);
    const input = {
      title: fTitle.trim(),
      description: fDesc.trim(),
      wod_type: fType,
      time_cap_seconds: parseCap(fTimeCap),
      notes: fNotes.trim() || null,
      scheduled_date: fDate,
    };
    try {
      if (editWod) {
        await updateProgramWod(editWod.id, { ...input, sort_order: editWod.sort_order });
      } else {
        await createProgramWod(programId, boxId, { ...input, sort_order: wodsForDate(fDate).length });
      }
      setModalOpen(false);
      load();
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    }
    setSubmitting(false);
  }

  async function deleteWod(w: ProgramWod) {
    Alert.alert(t('bo.programEditor.deleteWodTitle'), w.title, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          try {
            await deleteProgramWod(w.id);
          } catch (e) {
            Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
          }
          load();
        },
      },
    ]);
  }

  async function duplicateWeek() {
    const currentWods = weekDates.flatMap(wodsForDate);
    if (currentWods.length === 0) { Alert.alert(t('bo.programEditor.emptyTitle'), t('bo.programEditor.emptyWeekMsg')); return; }
    if (!boxId) { Alert.alert(t('common.error'), t('bo.programEditor.unknownBox')); return; }
    try {
      await duplicateProgramWeek(programId, boxId, currentWods);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
      return;
    }
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
        <TouchableOpacity onPress={() => setWeekIdx(w => w - 1)} style={S.weekArrow}>
          <ChevronLeft color={theme.text} size={20} />
        </TouchableOpacity>
        <Text style={S.weekLabel}>
          {jourCourt(lundiSemaine)} – {jourCourt(weekDates[6])}
        </Text>
        <TouchableOpacity onPress={() => setWeekIdx(w => w + 1)} style={S.weekArrow}>
          <ChevronRight color={theme.text} size={20} />
        </TouchableOpacity>
      </View>

      {/* Duplicate week */}
      <TouchableOpacity style={S.dupBtn} onPress={duplicateWeek} activeOpacity={0.7}>
        <Copy color={theme.accent} size={14} />
        <Text style={S.dupText}>{t('bo.programEditor.duplicateNext')}</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
      ) : erreur ? (
        <View style={S.errorBlock}>
          <Text style={S.errorText}>{erreur}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          {weekDates.map((date, i) => {
            const dayWods = wodsForDate(date);
            const isRest = i >= dpw;
            return (
              <View key={date} style={S.dayBlock}>
                <View style={[S.dayHeader, isRest && { opacity: 0.4 }]}>
                  <Text style={S.dayLabel}>{DAY_LABELS[i]} {jourCourt(date)}</Text>
                  {isRest && <Text style={S.restBadge}>{t('bo.programEditor.rest')}</Text>}
                  <TouchableOpacity onPress={() => openCreate(date)} style={S.addDayBtn}>
                    <Plus color={theme.accent} size={16} />
                  </TouchableOpacity>
                </View>
                {dayWods.length === 0 ? (
                  <TouchableOpacity style={S.emptyDay} onPress={() => openCreate(date)} activeOpacity={0.7}>
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
              <Text style={S.modalTitle}>{editWod ? t('bo.programEditor.editWod') : jourCourt(fDate)}</Text>
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

    errorBlock: { padding: 20 },
    errorText: { fontSize: 14, color: t.error, lineHeight: 20 },

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
