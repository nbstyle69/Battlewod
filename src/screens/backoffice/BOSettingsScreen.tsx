import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Settings, ArrowLeft, Save } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

export default function BOSettingsScreen({ navigation }: any) {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = styles(theme);
  const DAYS = t('bo.settings.days', { returnObjects: true }) as string[];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dailyHour, setDailyHour] = useState('06');
  const [weeklyDay, setWeeklyDay] = useState(0);
  const [weeklyHour, setWeeklyHour] = useState('18');

  useEffect(() => {
    if (!currentBox) return;
    (async () => {
      try {
      const { data } = await supabase
        .from('boxes')
        .select('daily_publish_hour, weekly_publish_day, weekly_publish_hour')
        .eq('id', currentBox.id)
        .single();
      if (data) {
        setDailyHour(String(data.daily_publish_hour ?? 6).padStart(2, '0'));
        setWeeklyDay(data.weekly_publish_day ?? 0);
        setWeeklyHour(String(data.weekly_publish_hour ?? 18).padStart(2, '0'));
      }
      } catch (e) { captureError(e, { screen: 'BOSettings', action: 'loadSettings' }); }
      setLoading(false);
    })();
  }, [currentBox]);

  async function handleSave() {
    if (!currentBox) return;
    const dh = Math.min(23, Math.max(0, parseInt(dailyHour) || 6));
    const wh = Math.min(23, Math.max(0, parseInt(weeklyHour) || 18));
    setSaving(true);
    const { error } = await supabase.from('boxes').update({
      daily_publish_hour: dh,
      weekly_publish_day: weeklyDay,
      weekly_publish_hour: wh,
    }).eq('id', currentBox.id);
    setSaving(false);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    Alert.alert(t('bo.settings.savedTitle'), t('bo.settings.savedMsg'));
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Settings color={theme.accent} size={20} />
        <Text style={S.headerTitle}>{t('bo.settings.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 140 }}>
        {/* Daily publish hour */}
        <View style={S.card}>
          <Text style={S.cardTitle}>{t('bo.settings.wodOfDay')}</Text>
          <Text style={S.cardDesc}>
            {t('bo.settings.dailyDesc')}
          </Text>
          <View style={S.hourRow}>
            <TextInput
              style={S.hourInput}
              value={dailyHour}
              onChangeText={v => setDailyHour(v.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text style={S.hourLabel}>{t('bo.settings.hourSuffix')}</Text>
          </View>
        </View>

        {/* Weekly publish settings */}
        <View style={S.card}>
          <Text style={S.cardTitle}>{t('bo.settings.weeklyTitle')}</Text>
          <Text style={S.cardDesc}>
            {t('bo.settings.weeklyDesc')}
          </Text>

          <Text style={S.subLabel}>{t('bo.settings.day')}</Text>
          <View style={S.dayGrid}>
            {DAYS.map((d, i) => (
              <TouchableOpacity
                key={d}
                style={[S.dayChip, weeklyDay === i && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                onPress={() => setWeeklyDay(i)}
              >
                <Text style={[S.dayChipText, weeklyDay === i && { color: '#fff' }]}>{d.slice(0, 3)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[S.subLabel, { marginTop: 10 }]}>{t('bo.settings.hour')}</Text>
          <View style={S.hourRow}>
            <TextInput
              style={S.hourInput}
              value={weeklyHour}
              onChangeText={v => setWeeklyHour(v.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text style={S.hourLabel}>{t('bo.settings.hourSuffix')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[S.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Save color="#fff" size={16} />
          <Text style={S.saveBtnText}>{saving ? t('bo.settings.saving') : t('common.save')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function styles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: theme.text, flex: 1 },
  card: {
    backgroundColor: theme.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
  cardDesc: { fontSize: 12, color: theme.textMuted, lineHeight: 18 },
  subLabel: { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourInput: {
    backgroundColor: theme.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, fontWeight: '900',
    color: theme.text, width: 60, textAlign: 'center',
  },
  hourLabel: { fontSize: 16, fontWeight: '700', color: theme.textSecondary },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  dayChipText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  saveBtn: {
    backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
}); }
