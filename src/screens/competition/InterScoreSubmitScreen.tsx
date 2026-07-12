import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ChevronRight, Trophy, Timer, Video, Send, Dumbbell, Clock } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';
import { trackInterCompScoreSubmit } from '../../lib/analytics';
import GlassBackground from '../../components/glass/GlassBackground';
import { useTranslation } from 'react-i18next';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'InterScoreSubmit'>;
type Route = RouteProp<CompetitionStackParamList, 'InterScoreSubmit'>;

export default function InterScoreSubmitScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { competitionId, wodId, wodTitle, wodDescription, timeCap, scoringType, existingScore } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const SCORING_PLACEHOLDER: Record<string, string> = {
    reps:        t('interScore.phReps'),
    time:        t('interScore.phTime'),
    weight:      t('interScore.phWeight'),
    rounds_reps: t('interScore.phRoundsReps'),
  };
  const S = createStyles(theme);

  const [scoreValue,  setScoreValue]  = useState(existingScore?.score_value?.toString() ?? '');
  const [videoUrl,    setVideoUrl]    = useState(existingScore?.video_url ?? '');
  const [notes,       setNotes]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  async function handleSubmit() {
    if (!user) return;
    const trimmed = scoreValue.trim();
    if (!trimmed) {
      Alert.alert(t('interScore.scoreRequired'), t('interScore.scoreRequiredMsg'));
      return;
    }

    // Validate video URL if provided
    const trimmedVideo = videoUrl.trim();
    if (trimmedVideo && !/^https?:\/\/.+/i.test(trimmedVideo)) {
      Alert.alert(t('interScore.invalidVideo'), t('interScore.invalidVideoMsg'));
      return;
    }

    setSubmitting(true);
    const payload = {
      competition_id: competitionId,
      wod_id: wodId,
      athlete_id: user.id,
      score_value: trimmed,
      score_display: trimmed,
      video_url: trimmedVideo || null,
      notes: notes.trim() || null,
      status: 'pending',
    };

    let error: any = null;
    if (existingScore) {
      ({ error } = await supabase.from('inter_scores').update({ ...payload, reviewed_at: null, rejection_reason: null }).eq('id', existingScore.id));
    } else {
      ({ error } = await supabase.from('inter_scores').insert(payload));
    }

    setSubmitting(false);
    if (error) {
      if (error.code === '23505') Alert.alert(t('interScore.alreadySubmitted'), t('interScore.alreadySubmittedMsg'));
      else Alert.alert(t('common.error'), error.message);
      return;
    }
    trackInterCompScoreSubmit(competitionId, scoringType, !!trimmedVideo);
    Alert.alert(
      t('interScore.submittedTitle'),
      t('interScore.submittedMsg'),
      [{ text: t('common.ok'), onPress: () => navigation.goBack() }],
    );
  }

  function handleLaunchTimer() {
    navigation.navigate('TimerRun', {
      timerType: 'for-time',
      countdown: 10,
      totalSeconds: 0,
      maxTime: timeCap ? timeCap * 60 : 0,
      interval: 0,
      rounds: 0,
      workTime: 0,
      restTime: 0,
      withCamera: true,
      sequence: '[]',
      videoTitle: wodTitle,
      withTimestamp: true,
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={S.container}>
      <GlassBackground />
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <ChevronRight size={22} color={theme.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View>
            <Text style={S.headerTitle}>{t('interScore.title')}</Text>
            <Text style={S.headerSub}>{wodTitle}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">

          {/* WOD info */}
          <View style={S.wodCard}>
            <View style={S.wodHeader}>
              <View style={S.wodIcon}>
                <Dumbbell size={16} color={theme.accent} />
              </View>
              <Text style={S.wodTitle}>{wodTitle}</Text>
            </View>
            {wodDescription ? <Text style={S.wodDesc}>{wodDescription}</Text> : null}
            <View style={S.wodMeta}>
              {timeCap && (
                <View style={S.chip}>
                  <Clock size={10} color={theme.textMuted} />
                  <Text style={S.chipText}>{t('interScore.minCap', { n: timeCap })}</Text>
                </View>
              )}
              <View style={S.chip}>
                <Text style={S.chipText}>{scoringType}</Text>
              </View>
            </View>
          </View>

          {/* Launch timer */}
          <View style={S.section}>
            <Text style={S.sectionLabel}>{t('interScore.step1')}</Text>
            <TouchableOpacity style={S.timerBtn} activeOpacity={0.85} onPress={handleLaunchTimer}>
              <Timer size={20} color="#fff" />
              <View>
                <Text style={S.timerBtnTitle}>{t('interScore.launchTimerCamera')}</Text>
                <Text style={S.timerBtnSub}>{t('interScore.launchTimerCameraSub')}</Text>
              </View>
            </TouchableOpacity>
            <Text style={S.orText}>{t('interScore.orEnterBelow')}</Text>
          </View>

          {/* Score input */}
          <View style={S.section}>
            <Text style={S.sectionLabel}>{t('interScore.step2')}</Text>
            <View style={S.inputWrapper}>
              <Trophy size={16} color={theme.textMuted} />
              <TextInput
                style={S.input}
                value={scoreValue}
                onChangeText={setScoreValue}
                placeholder={SCORING_PLACEHOLDER[scoringType] ?? t('interScore.enterScore')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Video URL */}
          <View style={S.section}>
            <Text style={S.sectionLabel}>{t('interScore.step3')}</Text>
            <Text style={S.sectionHint}>{t('interScore.step3Hint')}</Text>
            <View style={S.inputWrapper}>
              <Video size={16} color={theme.textMuted} />
              <TextInput
                style={S.input}
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="https://youtube.com/..."
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </View>

          {/* Notes */}
          <View style={S.section}>
            <Text style={S.sectionLabel}>{t('interScore.notes')}</Text>
            <TextInput
              style={[S.inputWrapper, { height: 80, alignItems: 'flex-start', paddingTop: 12 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('interScore.notesPlaceholder')}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Info */}
          <View style={S.infoBox}>
            <Text style={S.infoText}>
              {t('interScore.infoPrefix')}{' '}
              <Text style={{ fontWeight: '700', color: theme.accent }}>{t('interScore.pending')}</Text>.
              {'\n'}{t('interScore.infoSuffix')}
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[S.submitBtn, submitting && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <>
                <Send size={18} color="#fff" />
                <Text style={S.submitBtnText}>
                  {existingScore ? t('interScore.update') : t('interScore.title')}
                </Text>
              </>
            }
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container:  { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn:      { padding: 4 },
    headerTitle:  { fontSize: 18, fontWeight: '800', color: theme.text },
    headerSub:    { fontSize: 12, color: theme.textMuted, marginTop: 1 },
    content:      { padding: 16, paddingBottom: 140 },
    wodCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border,
      padding: 16, marginBottom: 20,
    },
    wodHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    wodIcon:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#C9A22718', justifyContent: 'center', alignItems: 'center' },
    wodTitle:   { fontSize: 15, fontWeight: '700', color: theme.text, flex: 1 },
    wodDesc:    { fontSize: 13, color: theme.textMuted, lineHeight: 18, marginBottom: 10 },
    wodMeta:    { flexDirection: 'row', gap: 8 },
    chip:       { flexDirection: 'row', gap: 4, backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
    chipText:   { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' },
    section:    { marginBottom: 20 },
    sectionLabel:{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 },
    sectionHint: { fontSize: 11, color: theme.textMuted, marginBottom: 8, marginTop: -4 },
    timerBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: '#C9A227', borderRadius: 14, padding: 16,
    },
    timerBtnTitle:{ fontSize: 15, fontWeight: '700', color: '#fff' },
    timerBtnSub:  { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
    orText: { textAlign: 'center', fontSize: 12, color: theme.textMuted, marginTop: 12 },
    inputWrapper: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: theme.card, borderRadius: 12,
      borderWidth: 1, borderColor: theme.border,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    input: { flex: 1, fontSize: 14, color: theme.text },
    infoBox: {
      backgroundColor: `${theme.accent}12`, borderRadius: 12,
      borderWidth: 1, borderColor: `${theme.accent}25`,
      padding: 14, marginBottom: 20,
    },
    infoText: { fontSize: 13, color: theme.textMuted, lineHeight: 19 },
    submitBtn: {
      flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#C9A227', borderRadius: 16, padding: 18,
    },
    submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
}
