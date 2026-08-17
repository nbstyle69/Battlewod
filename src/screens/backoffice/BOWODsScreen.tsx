import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl, Switch,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Eye, EyeOff, Upload, Clock } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { readRows } from '../../lib/db';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { sendWodPublishedNotification } from '../../services/notifications';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWOD, BoxWODType } from '../../types';
import DateField from '../../components/DateField';
import InteractiveTour, { COACH_TOUR_STEPS } from '../../components/InteractiveTour';
import { MOVEMENT_CATALOG, isWeightedMovement, serializeMovement, parseMovementRow } from '../../utils/movementsCatalog';

const WOD_TYPES: { value: BoxWODType; labelKey: string }[] = [
  { value: 'for-time', labelKey: 'bo.wods.typeForTime' },
  { value: 'amrap',    labelKey: 'bo.wods.typeAmrap' },
  { value: 'emom',     labelKey: 'bo.wods.typeEmom' },
  { value: 'tabata',   labelKey: 'bo.wods.typeTabata' },
  { value: 'strength', labelKey: 'bo.wods.typeStrength' },
  { value: 'custom',   labelKey: 'bo.wods.typeCustom' },
];

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function BOWODsScreen({ navigation }: any) {
  const { user, currentBox, boxRole } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const S = createStyles(theme);

  const [wods,      setWods]      = useState<BoxWOD[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editWOD,    setEditWOD]    = useState<BoxWOD | null>(null);

  // Form state
  const [title,       setTitle]       = useState('');
  const [movements,   setMovements]   = useState<string[]>([]);
  const [wodType,     setWodType]      = useState<BoxWODType>('amrap');
  const [date,        setDate]        = useState('');
  const [timeCap,     setTimeCap]     = useState('');
  const [rounds,      setRounds]      = useState('');
  const [notes,       setNotes]       = useState('');
  const [blockName,   setBlockName]   = useState('');
  const [published,   setPublished]   = useState(true);
  const [publishMode,  setPublishMode] = useState<'now' | 'scheduled'>('now');
  const [publishHour,  setPublishHour] = useState('06');
  const [publishMin,   setPublishMin]  = useState('00');
  const [submitting,  setSubmitting]  = useState(false);

  const weekDates = getWeekDates(weekOffset);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    const start = toISO(weekDates[0]);
    const end   = toISO(weekDates[6]);
    const data = await readRows(
      supabase
        .from('box_wods')
        .select('*')
        .eq('box_id', currentBox.id)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .order('scheduled_date')
        .order('sort_order'),
      { screen: 'BOWODs', action: 'load' },
    );
    setWods((data ?? []) as BoxWOD[]);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, weekOffset]);

  useEffect(() => { load(); }, [load]);

  function openCreate(selectedDate: string) {
    setEditWOD(null);
    setTitle(''); setMovements([]); setWodType('amrap');
    setDate(selectedDate); setTimeCap(''); setRounds('');
    setNotes(''); setBlockName(''); setPublished(true);
    setPublishMode('now'); setPublishHour('06'); setPublishMin('00');
    setModalOpen(true);
  }

  function openEdit(wod: BoxWOD) {
    setEditWOD(wod);
    setTitle(wod.title);
    setMovements(wod.description ? wod.description.split('\n').map(l => l.trim()).filter(Boolean) : []);
    setWodType(wod.wod_type ?? 'amrap');
    setDate(wod.scheduled_date);
    setTimeCap(wod.time_cap_seconds ? String(Math.floor(wod.time_cap_seconds / 60)) : '');
    setRounds(wod.rounds ? String(wod.rounds) : '');
    setNotes(wod.notes ?? '');
    setBlockName(wod.block_name ?? '');
    setPublished(wod.is_published);
    if (wod.publish_at) {
      const pa = new Date(wod.publish_at);
      setPublishMode('scheduled');
      setPublishHour(String(pa.getHours()).padStart(2, '0'));
      setPublishMin(String(pa.getMinutes()).padStart(2, '0'));
    } else {
      setPublishMode('now'); setPublishHour('06'); setPublishMin('00');
    }
    setModalOpen(true);
  }

  async function saveWOD() {
    if (!title.trim() || !date || !currentBox || !user) return;
    setSubmitting(true);
    const payload = {
      box_id: currentBox.id,
      created_by: user.id,
      title: title.trim(),
      description: movements.map(l => l.trim()).filter(Boolean).join('\n') || null,
      wod_type: wodType,
      scheduled_date: date,
      time_cap_seconds: timeCap ? parseInt(timeCap) * 60 : null,
      rounds: rounds ? parseInt(rounds) : null,
      notes: notes.trim() || null,
      block_name: blockName.trim() || null,
      is_published: published,
      publish_at: (published && publishMode === 'scheduled' && date)
        ? `${date}T${publishHour.padStart(2, '0')}:${publishMin.padStart(2, '0')}:00`
        : null,
    };
    let dbError: any;
    if (editWOD) {
      const { error } = await supabase.from('box_wods').update(payload).eq('id', editWOD.id);
      dbError = error;
    } else {
      const dayCount = wods.filter(w => w.scheduled_date === date).length;
      const { error } = await supabase.from('box_wods').insert({ ...payload, sort_order: dayCount });
      dbError = error;
    }
    const error = dbError;
    setSubmitting(false);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    // Only send notification if publishing now (no future schedule)
    if (published && publishMode === 'now' && currentBox && user) {
      sendWodPublishedNotification(currentBox.id, title.trim(), user.id).catch(e => captureError(e, { action: 'sendWodPublishedNotif' }));
    }
    setModalOpen(false);
    load();
  }

  async function togglePublish(wod: BoxWOD) {
    const newPublished = !wod.is_published;
    await supabase.from('box_wods').update({ is_published: newPublished }).eq('id', wod.id);
    if (newPublished && currentBox && user) {
      sendWodPublishedNotification(currentBox.id, wod.title, user.id).catch(e => captureError(e, { action: 'sendWodPublishedNotif' }));
    }
    load();
  }

  async function deleteWOD(wod: BoxWOD) {
    Alert.alert(t('bo.wods.deleteTitle'), wod.title, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await supabase.from('box_wods').delete().eq('id', wod.id);
          load();
        },
      },
    ]);
  }

  // ── Import CSV / JSON ──
  // CSV : date,title,type,description,timecap,rounds,notes,block,published,rank,groups
  // JSON: { date, title, type, description, timecap, rounds, notes, block, published, rank, groups }
  //   published = true/false  (défaut true)
  //   rank      = true/false  (défaut true) → leaderboard_enabled
  //   groups    = ["Nom A","Nom B"] (noms) — si vide/absent → visible par tous
  //   (CSV : groupes séparés par | dans la dernière colonne)
  async function importWODs() {
    if (!currentBox || !user) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);

      const parseBool = (v: any, fb = true): boolean => {
        if (v === undefined || v === null || v === '') return fb;
        if (typeof v === 'boolean') return v;
        const s = String(v).toLowerCase();
        return !(s === 'false' || s === '0' || s === 'non');
      };

      let rows: any[] = [];

      if (file.name?.endsWith('.json')) {
        const parsed = JSON.parse(content);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // CSV: date,title,type,description,timecap,rounds,notes,block,published,rank,groups
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('date') && header.includes('title');
        const dataLines = hasHeader ? lines.slice(1) : lines;
        for (const line of dataLines) {
          const cols = line.split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 2) continue;
          rows.push({
            scheduled_date: cols[0] || toISO(new Date()),
            title: cols[1] || t('bo.wods.importedWod'),
            wod_type: cols[2] || 'custom',
            description: cols[3] || null,
            time_cap_seconds: cols[4] ? parseInt(cols[4]) * 60 : null,
            rounds: cols[5] ? parseInt(cols[5]) : null,
            notes: cols[6] || null,
            block_name: cols[7] || null,
            published: parseBool(cols[8]),
            rank: parseBool(cols[9]),
            groups: cols[10] ? cols[10].split('|').map((g: string) => g.trim()).filter(Boolean) : [],
          });
        }
      }

      if (rows.length === 0) { Alert.alert(t('bo.wods.import'), t('bo.wods.noWodInFile')); return; }

      // Résoudre noms de groupes → IDs
      const allGroupNames = [...new Set(rows.flatMap((r: any) => r.groups ?? []))] as string[];
      const groupMap: Record<string, string> = {};
      if (allGroupNames.length > 0) {
        const { data: grps } = await supabase
          .from('message_groups')
          .select('id, name')
          .eq('box_id', currentBox!.id)
          .in('name', allGroupNames);
        if (grps) grps.forEach((g: any) => { groupMap[g.name] = g.id; });
        const missing = allGroupNames.filter(n => !groupMap[n]);
        if (missing.length > 0) {
          Alert.alert(t('bo.wods.unknownGroups'), t('bo.wods.unknownGroupsMsg', { groups: missing.join(', ') }));
        }
      }

      const VALID_TYPES: string[] = ['for-time','amrap','emom','tabata','strength','custom'];
      const payloads = rows.map((r: any) => ({
        box_id: currentBox!.id,
        created_by: user!.id,
        title: String(r.title || t('bo.wods.importedWod')).trim(),
        description: r.description || null,
        wod_type: VALID_TYPES.includes(r.wod_type ?? r.type ?? '') ? (r.wod_type ?? r.type) : 'custom',
        scheduled_date: r.scheduled_date ?? r.date ?? toISO(new Date()),
        time_cap_seconds: r.time_cap_seconds ?? (r.timecap ? parseInt(r.timecap) * 60 : null),
        rounds: r.rounds ? parseInt(String(r.rounds)) : null,
        notes: r.notes || null,
        block_name: r.block_name ?? r.block ?? null,
        is_published: parseBool(r.published ?? r.is_published),
        leaderboard_enabled: parseBool(r.rank ?? r.leaderboard_enabled),
      }));

      const { data: inserted, error } = await supabase.from('box_wods').insert(payloads).select('id');
      if (error || !inserted) { Alert.alert(t('bo.wods.importError'), error?.message ?? t('bo.wods.unknownError')); return; }

      // Insérer wod_group_access
      const accessRows: { wod_id: string; group_id: string }[] = [];
      inserted.forEach((wod: any, i: number) => {
        const grpNames: string[] = rows[i].groups ?? [];
        for (const gn of grpNames) {
          if (groupMap[gn]) accessRows.push({ wod_id: wod.id, group_id: groupMap[gn] });
        }
      });
      if (accessRows.length > 0) {
        const { error: gErr } = await supabase.from('wod_group_access').insert(accessRows);
        if (gErr) Alert.alert(t('bo.wods.warning'), t('bo.wods.groupError', { msg: gErr.message }));
      }

      Alert.alert(t('bo.wods.importSuccess'), t('bo.wods.importSuccessMsg', { count: inserted.length }));
      load();
    } catch (e: any) {
      captureError(e, { screen: 'BOWODs', action: 'importCSV' });
      Alert.alert(t('common.error'), e.message || t('bo.wods.importFailed'));
    }
  }

  const DAY_LABELS = t('bo.wods.dayLabels', { returnObjects: true }) as string[];
  const todayISO = toISO(new Date());

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('bo.wods.title')}</Text>
        <TouchableOpacity onPress={importWODs} style={S.importBtn}>
          <Upload color={theme.accent} size={18} />
        </TouchableOpacity>
      </View>

      {/* Week navigation */}
      <View style={S.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={S.weekArrow}>
          <ChevronLeft color={theme.text} size={20} />
        </TouchableOpacity>
        <Text style={S.weekLabel}>
          {weekDates[0].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
          {' — '}
          {weekDates[6].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={S.weekArrow}>
          <ChevronRight color={theme.text} size={20} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
        : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {weekDates.map((d, i) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              const dayWODs = wods.filter(w => w.scheduled_date === iso);
              return (
                <View key={iso} style={S.dayBlock}>
                  <View style={[S.dayHeader, isToday && S.dayHeaderToday]}>
                    <Text style={[S.dayLabel, isToday && S.dayLabelToday]}>
                      {DAY_LABELS[i]} {d.getDate()}
                    </Text>
                    {isToday && <Text style={S.todayBadge}>{t('bo.wods.today')}</Text>}
                    <TouchableOpacity onPress={() => openCreate(iso)} style={S.addDayBtn}>
                      <Plus color={isToday ? theme.card : theme.accent} size={16} />
                    </TouchableOpacity>
                  </View>

                  {dayWODs.length === 0 ? (
                    <TouchableOpacity style={S.emptyDay} onPress={() => openCreate(iso)} activeOpacity={0.7}>
                      <Text style={S.emptyDayText}>{t('bo.wods.addWod')}</Text>
                    </TouchableOpacity>
                  ) : (
                    dayWODs.map(wod => {
                      const tc = TYPE_COLORS[wod.wod_type ?? 'custom'] ?? '#6B7280';
                      return (
                        <View key={wod.id} style={[S.wodRow, !wod.is_published && S.wodRowDraft]}>
                          <View style={[S.wodTypeBar, { backgroundColor: tc }]} />
                          <View style={S.wodRowContent}>
                            <Text style={S.wodRowType}>{(wod.wod_type ?? 'WOD').toUpperCase()}</Text>
                            <Text style={S.wodRowTitle}>{wod.title}</Text>
                            {!wod.is_published && <Text style={S.draftTag}>{t('bo.wods.draft')}</Text>}
                            {wod.is_published && wod.publish_at && new Date(wod.publish_at) > new Date() && (
                              <Text style={[S.draftTag, { color: theme.accent }]}>
                                {t('bo.wods.scheduledAt', { time: new Date(wod.publish_at).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) })}
                              </Text>
                            )}
                          </View>
                          <View style={S.wodRowActions}>
                            <TouchableOpacity onPress={() => togglePublish(wod)} style={S.iconBtn}>
                              {wod.is_published
                                ? <Eye color={theme.success} size={16} />
                                : <EyeOff color={theme.textMuted} size={16} />}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => openEdit(wod)} style={S.iconBtn}>
                              <Pencil color={theme.accent} size={16} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteWOD(wod)} style={S.iconBtn}>
                              <Trash2 color={theme.error} size={16} />
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
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editWOD ? t('bo.wods.editWod') : t('bo.wods.createWod')}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">

              <View style={S.mRow}>
                <View style={{ flex: 1 }}>
                  <Text style={S.mLabel}>{t('bo.wods.labelDate')}</Text>
                  <DateField style={S.mInput} value={date} onChangeText={setDate} theme={theme} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.mLabel}>{t('bo.wods.labelBlock')}</Text>
                  <TextInput style={S.mInput} value={blockName} onChangeText={setBlockName} placeholder={t('bo.wods.blockPlaceholder')} placeholderTextColor={theme.textMuted} />
                </View>
              </View>

              <Text style={S.mLabel}>{t('bo.wods.labelTitle')}</Text>
              <TextInput style={S.mInput} value={title} onChangeText={setTitle} placeholder={t('bo.wods.titlePlaceholder')} placeholderTextColor={theme.textMuted} />

              <Text style={S.mLabel}>{t('bo.wods.labelType')}</Text>
              <View style={S.typeGrid}>
                {WOD_TYPES.map(wt => (
                  <TouchableOpacity
                    key={wt.value}
                    style={[S.typeChip, wodType === wt.value && { backgroundColor: TYPE_COLORS[wt.value], borderColor: TYPE_COLORS[wt.value] }]}
                    onPress={() => setWodType(wt.value)}
                  >
                    <Text style={[S.typeChipText, wodType === wt.value && { color: '#fff' }]}>{t(wt.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.mLabel}>{t('bo.wods.labelMovements')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.chipRow} contentContainerStyle={{ gap: 6 }}>
                {MOVEMENT_CATALOG.map(mv => (
                  <TouchableOpacity
                    key={mv.name}
                    style={S.catChip}
                    onPress={() => setMovements(m => [...m, serializeMovement(0, mv.name, null).replace(/^0\s*/, '').trim()])}
                  >
                    <Text style={S.catChipText}>{mv.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {movements.map((line, i) => {
                const parsed = parseMovementRow(line);
                const showWeight = parsed.weightKg != null || parsed.weightKgWomen != null || isWeightedMovement(parsed.name);
                const update = (reps: number | null, name: string, weightKg: number | null, weightKgWomen: number | null) => {
                  const w = showWeight ? weightKg : null;
                  const wW = showWeight ? weightKgWomen : null;
                  const serialized = reps == null
                    ? serializeMovement(0, name, w, wW).replace(/^0\s*/, '').trim()
                    : serializeMovement(reps, name, w, wW);
                  setMovements(m => m.map((x, idx) => idx === i ? serialized : x));
                };
                return (
                  <View key={i} style={S.moveRow}>
                    <TextInput
                      style={[S.mInput, S.moveReps]}
                      value={parsed.reps != null ? String(parsed.reps) : ''}
                      onChangeText={txt => update(txt === '' ? null : (parseInt(txt, 10) || null), parsed.name, parsed.weightKg, parsed.weightKgWomen)}
                      keyboardType="numeric" placeholder="Reps" placeholderTextColor={theme.textMuted}
                    />
                    <TextInput
                      style={[S.mInput, { flex: 1 }]}
                      value={parsed.name}
                      onChangeText={txt => update(parsed.reps, txt, parsed.weightKg, parsed.weightKgWomen)}
                      placeholder={t('bo.wods.movementNamePlaceholder')} placeholderTextColor={theme.textMuted}
                    />
                    {showWeight && (
                      <>
                        <TextInput
                          style={[S.mInput, S.moveKg]}
                          value={parsed.weightKg != null ? String(parsed.weightKg) : ''}
                          onChangeText={txt => update(parsed.reps, parsed.name, txt === '' ? null : (parseFloat(txt) || null), parsed.weightKgWomen)}
                          keyboardType="numeric" placeholder="♂ kg" placeholderTextColor={theme.textMuted}
                        />
                        <TextInput
                          style={[S.mInput, S.moveKg]}
                          value={parsed.weightKgWomen != null ? String(parsed.weightKgWomen) : ''}
                          onChangeText={txt => update(parsed.reps, parsed.name, parsed.weightKg, txt === '' ? null : (parseFloat(txt) || null))}
                          keyboardType="numeric" placeholder="♀ kg" placeholderTextColor={theme.textMuted}
                        />
                      </>
                    )}
                    <TouchableOpacity onPress={() => setMovements(m => m.filter((_, idx) => idx !== i))} style={S.moveDel}>
                      <Trash2 size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
              <TouchableOpacity onPress={() => setMovements(m => [...m, ''])} style={S.moveAdd}>
                <Plus size={14} color={theme.accent} />
                <Text style={S.moveAddText}>{t('bo.wods.addMovement')}</Text>
              </TouchableOpacity>
              <Text style={S.moveHint}>{t('bo.wods.movementsHint')}</Text>

              <View style={S.mRow}>
                <View style={{ flex: 1 }}>
                  <Text style={S.mLabel}>{t('bo.wods.labelTimeCap')}</Text>
                  <TextInput style={S.mInput} value={timeCap} onChangeText={setTimeCap} keyboardType="numeric" placeholder="20" placeholderTextColor={theme.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.mLabel}>{t('bo.wods.labelRounds')}</Text>
                  <TextInput style={S.mInput} value={rounds} onChangeText={setRounds} keyboardType="numeric" placeholder="5" placeholderTextColor={theme.textMuted} />
                </View>
              </View>

              <Text style={S.mLabel}>{t('bo.wods.labelNotes')}</Text>
              <TextInput
                style={[S.mInput, S.mTextarea]}
                value={notes} onChangeText={setNotes}
                placeholder={t('bo.wods.notesPlaceholder')}
                placeholderTextColor={theme.textMuted} multiline
              />

              <View style={S.publishRow}>
                <Text style={S.publishLabel}>{t('bo.wods.publish')}</Text>
                <Switch value={published} onValueChange={setPublished} trackColor={{ true: theme.success }} />
              </View>

              {published && (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[S.typeChip, publishMode === 'now' && { backgroundColor: theme.success, borderColor: theme.success }]}
                      onPress={() => setPublishMode('now')}
                    >
                      <Text style={[S.typeChipText, publishMode === 'now' && { color: '#fff' }]}>{t('bo.wods.now')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.typeChip, publishMode === 'scheduled' && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                      onPress={() => setPublishMode('scheduled')}
                    >
                      <Clock size={12} color={publishMode === 'scheduled' ? '#fff' : theme.textSecondary} />
                      <Text style={[S.typeChipText, publishMode === 'scheduled' && { color: '#fff' }]}> {t('bo.wods.schedule')}</Text>
                    </TouchableOpacity>
                  </View>
                  {publishMode === 'scheduled' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={S.mLabel}>{t('bo.wods.hour')}</Text>
                      <TextInput
                        style={[S.mInput, { width: 50, textAlign: 'center' }]}
                        value={publishHour}
                        onChangeText={v => setPublishHour(v.replace(/[^0-9]/g, '').slice(0, 2))}
                        keyboardType="numeric"
                        maxLength={2}
                        placeholder="06"
                        placeholderTextColor={theme.textMuted}
                      />
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>:</Text>
                      <TextInput
                        style={[S.mInput, { width: 50, textAlign: 'center' }]}
                        value={publishMin}
                        onChangeText={v => setPublishMin(v.replace(/[^0-9]/g, '').slice(0, 2))}
                        keyboardType="numeric"
                        maxLength={2}
                        placeholder="00"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[S.saveBtn, (!title.trim() || submitting) && S.saveBtnDisabled]}
                onPress={saveWOD}
                disabled={!title.trim() || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.saveBtnText}>{editWOD ? t('common.save') : t('bo.wods.createWodBtn')}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Premier onglet du coach : c'est ici que son tour est expliqué. Le gérant
          traverse aussi cet écran, son tour vit sur son tableau de bord. */}
      {boxRole === 'coach' && <InteractiveTour steps={COACH_TOUR_STEPS} />}
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  back:        { padding: 2 },
  importBtn:   { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: theme.text },
  weekNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  weekArrow: { padding: 6 },
  weekLabel: { fontSize: 13, fontWeight: '700', color: theme.text },
  dayBlock:  { marginHorizontal: 16, marginTop: 14 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  dayHeaderToday: { backgroundColor: theme.accent },
  dayLabel:  { fontSize: 13, fontWeight: '800', color: theme.textSecondary, flex: 1 },
  dayLabelToday: { color: '#fff' },
  todayBadge: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  addDayBtn: { padding: 2 },
  emptyDay:  { borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border, padding: 12, alignItems: 'center' },
  emptyDayText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  wodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  wodRowDraft: { opacity: 0.65 },
  wodTypeBar: { width: 4, alignSelf: 'stretch' },
  wodRowContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  wodRowType:  { fontSize: 9, fontWeight: '800', color: theme.textMuted, letterSpacing: 0.8 },
  wodRowTitle: { fontSize: 14, fontWeight: '800', color: theme.text },
  draftTag:    { fontSize: 9, fontWeight: '700', color: theme.warning, letterSpacing: 0.5 },
  wodRowActions: { flexDirection: 'row', paddingRight: 8, gap: 2 },
  iconBtn:     { padding: 8 },
  modalContainer: { flex: 1, backgroundColor: theme.background },
  modalHeader: {
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: theme.border,
    backgroundColor: theme.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  modalTitle:  { fontSize: 18, fontWeight: '900', color: theme.text },
  modalCancel: { fontSize: 14, color: theme.accent, fontWeight: '700' },
  modalBody:   { padding: 20, gap: 10 },
  mLabel:      { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
  mInput: {
    backgroundColor: theme.card, borderRadius: 10,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: theme.text,
  },
  mTextarea:   { minHeight: 80, textAlignVertical: 'top' },
  mRow:        { flexDirection: 'row', gap: 10 },
  chipRow:     { flexGrow: 0, marginBottom: 4 },
  catChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  catChipText: { fontSize: 11, fontWeight: '700', color: theme.textSecondary },
  moveRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moveReps:    { width: 60, textAlign: 'center' },
  moveKg:      { width: 64, textAlign: 'center' },
  moveDel:     { padding: 8 },
  moveAdd:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border },
  moveAddText: { fontSize: 13, fontWeight: '800', color: theme.accent },
  moveHint:    { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  typeGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  typeChipText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  publishRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border },
  publishLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
  saveBtn:     { backgroundColor: theme.accent, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
}); }
