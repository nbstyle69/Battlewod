import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, Clock, Zap, Trophy } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<CompetitionStackParamList, 'MatchScore'>;
  route: RouteProp<CompetitionStackParamList, 'MatchScore'>;
};

export default function MatchScoreScreen({ navigation, route }: Props) {
  const { matchId, recordedSeconds, wodTitle, wodType, wodScoring } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [scoreInput, setScoreInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isForTime = wodType === 'For Time';

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function getScorePlaceholder() {
    if (isForTime) return 'Ex: 4:35 ou DNF';
    if (wodType === 'AMRAP') return 'Ex: 12 rounds + 8 reps';
    if (wodType === 'Max Reps') return 'Ex: 47 reps';
    return 'Ton score';
  }

  async function handleSubmit() {
    const finalScore = scoreInput.trim() || (isForTime ? formatTime(recordedSeconds) : '');
    if (!finalScore) {
      Alert.alert('Score requis', 'Entre ton score avant de soumettre.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('scores').insert({
      match_id: matchId,
      athlete_id: user?.id,
      value: finalScore,
      notes: notes.trim() || null,
      status: 'pending',
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('Erreur', `Impossible de soumettre : ${error.message}`);
    } else {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <View style={S.container}>
        <LinearGradient colors={['#0A0A0F', '#12121A']} style={S.successContainer}>
          <View style={S.successIcon}>
            <CheckCircle color={theme.success} size={72} />
          </View>
          <Text style={S.successTitle}>Score soumis !</Text>
          <Text style={S.successSub}>
            Ton score est en attente de validation par un admin.{'\n'}
            Le résultat ELO sera mis à jour après validation.
          </Text>

          <View style={S.summaryCard}>
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>WOD</Text>
              <Text style={S.summaryValue}>{wodTitle}</Text>
            </View>
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>Temps chrono</Text>
              <Text style={S.summaryValue}>{formatTime(recordedSeconds)}</Text>
            </View>
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>Score soumis</Text>
              <Text style={[S.summaryValue, { color: theme.accent }]}>{scoreInput || formatTime(recordedSeconds)}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('CompetitionList')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.homeBtn}>
              <Trophy color="#fff" size={20} />
              <Text style={S.homeBtnText}>RETOUR AUX COMPÉTITIONS</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <Text style={S.headerTitle}>Confirme ton score</Text>
        <Text style={S.headerSub}>{wodTitle} · {wodType}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        <View style={S.chronoCard}>
          <Clock color={theme.accent} size={28} />
          <View>
            <Text style={S.chronoLabel}>Temps chrono enregistré</Text>
            <Text style={S.chronoValue}>{formatTime(recordedSeconds)}</Text>
          </View>
        </View>

        <View style={S.scoringInfo}>
          <Zap color={theme.gold} size={16} />
          <Text style={S.scoringText}>Scoring : {wodScoring}</Text>
        </View>

        <View style={S.inputSection}>
          <Text style={S.inputLabel}>
            {isForTime ? '⏱ Ton temps final' : '🔢 Ton score final'}
          </Text>
          <Text style={S.inputHint}>
            {isForTime
              ? 'Le chrono est indicatif. Saisis ton temps exact ou laisse vide pour utiliser le chrono.'
              : 'Reps, rounds ou unité selon le WOD.'}
          </Text>
          <TextInput
            style={S.scoreInput}
            value={scoreInput}
            onChangeText={setScoreInput}
            placeholder={getScorePlaceholder()}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
        </View>

        <View style={S.inputSection}>
          <Text style={S.inputLabel}>📝 Notes (optionnel)</Text>
          <TextInput
            style={[S.scoreInput, S.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: standards respectés, scaling utilisé..."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={S.honestBox}>
          <Text style={S.honestTitle}>⚖️ Code d'honneur BattleWOD</Text>
          <Text style={S.honestText}>
            En soumettant ce score, je certifie avoir respecté tous les standards du WOD.
            Un faux score entraîne une disqualification et perte d'ELO.
          </Text>
        </View>

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
          <LinearGradient
            colors={submitting ? [theme.surface, theme.surface] : [theme.accent, theme.secondary ?? theme.accent]}
            style={S.submitBtn}
          >
            <CheckCircle color="#fff" size={22} />
            <Text style={S.submitText}>
              {submitting ? 'Envoi en cours...' : 'SOUMETTRE MON SCORE'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  content: { padding: 16 },
  chronoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: `${theme.accent}15`, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: `${theme.accent}30`, marginBottom: 12,
  },
  chronoLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
  chronoValue: { fontSize: 40, fontWeight: '900', color: theme.accent, letterSpacing: 2 },
  scoringInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${theme.gold}15`, borderRadius: 10, padding: 12, marginBottom: 20,
  },
  scoringText: { fontSize: 13, color: theme.gold, fontWeight: '600' },
  inputSection: { marginBottom: 20 },
  inputLabel: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 4 },
  inputHint: { fontSize: 12, color: theme.textMuted, marginBottom: 10, lineHeight: 16 },
  scoreInput: {
    backgroundColor: theme.card, borderRadius: 14, padding: 16,
    color: theme.text, fontSize: 18, fontWeight: '700',
    borderWidth: 1, borderColor: theme.border,
  },
  notesInput: { fontSize: 14, fontWeight: '400', height: 80, textAlignVertical: 'top' },
  honestBox: {
    backgroundColor: `${theme.warning}10`, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: `${theme.warning}30`, marginBottom: 20, gap: 6,
  },
  honestTitle: { fontSize: 13, fontWeight: '800', color: theme.warning },
  honestText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, padding: 20, gap: 10,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  successIcon: { marginBottom: 8 },
  successTitle: { fontSize: 32, fontWeight: '900', color: '#fff' },
  successSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 },
  summaryCard: {
    backgroundColor: theme.card, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: theme.cardBorder, width: '100%', gap: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: theme.textSecondary },
  summaryValue: { fontSize: 15, fontWeight: '800', color: theme.text },
  homeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 28, gap: 10, marginTop: 8,
  },
  homeBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
}); }
