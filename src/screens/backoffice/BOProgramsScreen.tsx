import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl, Switch, Clipboard,
} from 'react-native';
import { Plus, ChevronLeft, Pencil, Trash2, Copy, Users, Calendar, BookOpen } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { Program } from '../../types';

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function BOProgramsScreen({ navigation }: any) {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProg, setEditProg] = useState<Program | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [progType, setProgType] = useState<'fixed' | 'ongoing'>('fixed');
  const [durationWeeks, setDurationWeeks] = useState('6');
  const [daysPerWeek, setDaysPerWeek] = useState('5');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
      const { data } = await supabase
        .from('programs')
        .select('*, program_members(count)')
        .eq('box_id', currentBox.id)
        .order('created_at', { ascending: false });
      const mapped = (data ?? []).map((p: any) => ({
        ...p,
        member_count: p.program_members?.[0]?.count ?? 0,
      }));
      setPrograms(mapped as Program[]);
    } catch (e: any) {
      captureError(e, { screen: 'BOPrograms', action: 'load' });
    }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openCreate() {
    setEditProg(null);
    setTitle(''); setDescription('');
    setProgType('fixed'); setDurationWeeks('6'); setDaysPerWeek('5');
    setIsActive(true);
    setModalOpen(true);
  }

  function openEdit(p: Program) {
    setEditProg(p);
    setTitle(p.title);
    setDescription(p.description ?? '');
    setProgType(p.type);
    setDurationWeeks(p.duration_weeks ? String(p.duration_weeks) : '');
    setDaysPerWeek(String(p.days_per_week));
    setIsActive(p.is_active);
    setModalOpen(true);
  }

  async function save() {
    if (!title.trim() || !currentBox || !user) return;
    setSubmitting(true);

    const payload: any = {
      box_id: currentBox.id,
      owner_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      price_cents: editProg ? editProg.price_cents : 0,
      type: progType,
      duration_weeks: progType === 'fixed' ? (parseInt(durationWeeks) || 6) : null,
      days_per_week: parseInt(daysPerWeek) || 5,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editProg) {
        const { error } = await supabase.from('programs').update(payload).eq('id', editProg.id);
        if (error) throw error;
      } else {
        let insertError: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          payload.invite_code = genCode();
          const { error } = await supabase.from('programs').insert(payload);
          if (!error) { insertError = null; break; }
          if (error.code !== '23505') { insertError = error; break; }
          insertError = error;
        }
        if (insertError) throw insertError;
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
    setSubmitting(false);
  }

  async function deleteProg(p: Program) {
    Alert.alert(t('bo.programs.deleteTitle'), t('bo.programs.deleteMsg', { title: p.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await supabase.from('programs').delete().eq('id', p.id);
          load();
        },
      },
    ]);
  }

  function copyCode(code: string) {
    Clipboard.setString(code);
    Alert.alert(t('bo.programs.copied'), t('bo.programs.codeMsg', { code }));
  }


  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('bo.programs.title')}</Text>
        <TouchableOpacity onPress={openCreate} style={S.addBtn}>
          <Plus color={theme.accent} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {programs.length === 0 ? (
            <View style={S.emptyCard}>
              <BookOpen color={theme.textMuted} size={40} />
              <Text style={S.emptyTitle}>{t('bo.programs.empty')}</Text>
              <Text style={S.emptySub}>{t('bo.programs.emptySub')}</Text>
              <TouchableOpacity style={S.createBtn} onPress={openCreate} activeOpacity={0.85}>
                <Plus color="#fff" size={16} />
                <Text style={S.createBtnText}>{t('bo.programs.createProgram')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            programs.map(p => (
              <View key={p.id} style={S.progCard}>
                <View style={S.progCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.progTitle}>{p.title}</Text>
                    <Text style={S.progMeta}>
                      {p.type === 'fixed' ? t('bo.programs.weeksShort', { n: p.duration_weeks }) : t('bo.programs.ongoing')} · {t('bo.programs.daysPerWeekShort', { n: p.days_per_week })}
                    </Text>
                  </View>
                </View>

                {p.description ? <Text style={S.progDesc} numberOfLines={2}>{p.description}</Text> : null}

                <View style={S.progStats}>
                  <View style={S.statChip}>
                    <Users color={theme.accent} size={14} />
                    <Text style={S.statText}>{t('bo.programs.buyers', { count: p.member_count ?? 0 })}</Text>
                  </View>
                  <TouchableOpacity style={S.codeChip} onPress={() => copyCode(p.invite_code)} activeOpacity={0.7}>
                    <Copy color={theme.accent} size={12} />
                    <Text style={S.codeText}>{p.invite_code}</Text>
                  </TouchableOpacity>
                  {!p.is_active && <Text style={S.inactiveBadge}>{t('bo.programs.inactive')}</Text>}
                </View>

                <View style={S.progActions}>
                  <TouchableOpacity
                    style={S.actionBtn}
                    onPress={() => navigation.navigate('BOProgramEditor', { programId: p.id, programTitle: p.title, durationWeeks: p.duration_weeks, daysPerWeek: p.days_per_week, progType: p.type })}
                    activeOpacity={0.7}
                  >
                    <Calendar color={theme.accent} size={14} />
                    <Text style={S.actionText}>{t('bo.programs.wods')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.actionBtn} onPress={() => openEdit(p)} activeOpacity={0.7}>
                    <Pencil color={theme.accent} size={14} />
                    <Text style={S.actionText}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.actionBtn} onPress={() => deleteProg(p)} activeOpacity={0.7}>
                    <Trash2 color={theme.error} size={14} />
                    <Text style={[S.actionText, { color: theme.error }]}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Create / Edit Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editProg ? t('bo.programs.editTitle') : t('bo.programs.newProgram')}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={S.mLabel}>{t('bo.programs.labelTitle')}</Text>
              <TextInput style={S.mInput} value={title} onChangeText={setTitle} placeholder={t('bo.programs.titlePlaceholder')} placeholderTextColor={theme.textMuted} />

              <Text style={S.mLabel}>{t('bo.programs.labelDescription')}</Text>
              <TextInput style={[S.mInput, S.mTextarea]} value={description} onChangeText={setDescription} placeholder={t('bo.programs.descPlaceholder')} placeholderTextColor={theme.textMuted} multiline />

              <Text style={S.mLabel}>{t('bo.programs.labelType')}</Text>
              <View style={S.typeRow}>
                <TouchableOpacity style={[S.typeChip, progType === 'fixed' && S.typeChipActive]} onPress={() => setProgType('fixed')}>
                  <Text style={[S.typeChipText, progType === 'fixed' && S.typeChipTextActive]}>{t('bo.programs.typeFixed')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.typeChip, progType === 'ongoing' && S.typeChipActive]} onPress={() => setProgType('ongoing')}>
                  <Text style={[S.typeChipText, progType === 'ongoing' && S.typeChipTextActive]}>{t('bo.programs.ongoing')}</Text>
                </TouchableOpacity>
              </View>

              {progType === 'fixed' && (
                <View style={S.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.mLabel}>{t('bo.programs.labelDuration')}</Text>
                    <TextInput style={S.mInput} value={durationWeeks} onChangeText={setDurationWeeks} keyboardType="numeric" placeholder="6" placeholderTextColor={theme.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.mLabel}>{t('bo.programs.labelDaysPerWeek')}</Text>
                    <TextInput style={S.mInput} value={daysPerWeek} onChangeText={setDaysPerWeek} keyboardType="numeric" placeholder="5" placeholderTextColor={theme.textMuted} />
                  </View>
                </View>
              )}

              <View style={S.publishRow}>
                <Text style={S.publishLabel}>{t('bo.programs.activeVisible')}</Text>
                <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: theme.success }} />
              </View>

              <TouchableOpacity
                style={[S.saveBtn, (!title.trim() || submitting) && S.saveBtnDisabled]}
                onPress={save}
                disabled={!title.trim() || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.saveBtnText}>{editProg ? t('common.save') : t('bo.programs.createProgram')}</Text>}
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
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: t.text },
    addBtn: { padding: 6, backgroundColor: `${t.accent}18`, borderRadius: 8 },

    emptyCard: { alignItems: 'center', padding: 32, marginTop: 40, backgroundColor: t.card, borderRadius: 16, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: t.text },
    emptySub: { fontSize: 14, color: t.textSecondary, textAlign: 'center' },
    createBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
    createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    progCard: { backgroundColor: t.card, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: t.border },
    progCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    progTitle: { fontSize: 16, fontWeight: '800', color: t.text },
    progMeta: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
    priceBadge: { backgroundColor: `${t.success}18`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    priceText: { color: t.success, fontWeight: '800', fontSize: 14 },
    progDesc: { fontSize: 13, color: t.textSecondary, marginTop: 8 },
    progStats: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.accent}12`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statText: { fontSize: 12, color: t.accent, fontWeight: '600' },
    codeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.accent}12`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    codeText: { fontSize: 12, color: t.accent, fontWeight: '700', letterSpacing: 1 },
    inactiveBadge: { fontSize: 11, color: t.error, fontWeight: '700', backgroundColor: `${t.error}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    progActions: { flexDirection: 'row', gap: 8, marginTop: 12, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: `${t.accent}08` },
    actionText: { fontSize: 12, fontWeight: '600', color: t.accent },

    modalContainer: { flex: 1, backgroundColor: t.background },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: t.border },
    modalTitle: { fontSize: 18, fontWeight: '800', color: t.text },
    modalCancel: { fontSize: 15, color: t.accent, fontWeight: '600' },
    modalBody: { padding: 16, gap: 4, paddingBottom: 60 },

    mLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
    mInput: { backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15, borderWidth: 1, borderColor: t.border },
    mTextarea: { minHeight: 80, textAlignVertical: 'top' },

    typeRow: { flexDirection: 'row', gap: 8 },
    typeChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: t.border },
    typeChipActive: { borderColor: t.accent, backgroundColor: t.accent },
    typeChipText: { fontSize: 13, fontWeight: '700', color: t.textSecondary },
    typeChipTextActive: { color: '#fff' },

    row: { flexDirection: 'row', gap: 10 },
    publishRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
    publishLabel: { fontSize: 15, fontWeight: '600', color: t.text },

    saveBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
