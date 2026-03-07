import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, Clock, Zap, Trophy } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
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
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A0F', '#12121A']} style={styles.successContainer}>
          <View style={styles.successIcon}>
            <CheckCircle color={Colors.success} size={72} />
          </View>
          <Text style={styles.successTitle}>Score soumis !</Text>
          <Text style={styles.successSub}>
            Ton score est en attente de validation par un admin.{'\n'}
            Le résultat ELO sera mis à jour après validation.
          </Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>WOD</Text>
              <Text style={styles.summaryValue}>{wodTitle}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Temps chrono</Text>
              <Text style={styles.summaryValue}>{formatTime(recordedSeconds)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Score soumis</Text>
              <Text style={[styles.summaryValue, { color: Colors.primary }]}>{scoreInput || formatTime(recordedSeconds)}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('CompetitionList')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.homeBtn}>
              <Trophy color="#fff" size={20} />
              <Text style={styles.homeBtnText}>RETOUR AUX COMPÉTITIONS</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={styles.header}>
        <Text style={styles.headerTitle}>Confirme ton score</Text>
        <Text style={styles.headerSub}>{wodTitle} · {wodType}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.chronoCard}>
          <Clock color={Colors.primary} size={28} />
          <View>
            <Text style={styles.chronoLabel}>Temps chrono enregistré</Text>
            <Text style={styles.chronoValue}>{formatTime(recordedSeconds)}</Text>
          </View>
        </View>

        <View style={styles.scoringInfo}>
          <Zap color={Colors.gold} size={16} />
          <Text style={styles.scoringText}>Scoring : {wodScoring}</Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>
            {isForTime ? '⏱ Ton temps final' : '🔢 Ton score final'}
          </Text>
          <Text style={styles.inputHint}>
            {isForTime
              ? 'Le chrono est indicatif. Saisis ton temps exact ou laisse vide pour utiliser le chrono.'
              : 'Reps, rounds ou unité selon le WOD.'}
          </Text>
          <TextInput
            style={styles.scoreInput}
            value={scoreInput}
            onChangeText={setScoreInput}
            placeholder={getScorePlaceholder()}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>📝 Notes (optionnel)</Text>
          <TextInput
            style={[styles.scoreInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: standards respectés, scaling utilisé..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.honestBox}>
          <Text style={styles.honestTitle}>⚖️ Code d'honneur BattleWOD</Text>
          <Text style={styles.honestText}>
            En soumettant ce score, je certifie avoir respecté tous les standards du WOD.
            Un faux score entraîne une disqualification et perte d'ELO.
          </Text>
        </View>

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
          <LinearGradient
            colors={submitting ? [Colors.surface, Colors.surface] : [Colors.primary, Colors.secondary]}
            style={styles.submitBtn}
          >
            <CheckCircle color="#fff" size={22} />
            <Text style={styles.submitText}>
              {submitting ? 'Envoi en cours...' : 'SOUMETTRE MON SCORE'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: Colors.text },
  headerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  content: { padding: 16 },
  chronoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: `${Colors.primary}15`, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: `${Colors.primary}30`, marginBottom: 12,
  },
  chronoLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  chronoValue: { fontSize: 40, fontWeight: '900', color: Colors.primary, letterSpacing: 2 },
  scoringInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.gold}15`, borderRadius: 10, padding: 12, marginBottom: 20,
  },
  scoringText: { fontSize: 13, color: Colors.gold, fontWeight: '600' },
  inputSection: { marginBottom: 20 },
  inputLabel: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  inputHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 10, lineHeight: 16 },
  scoreInput: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 16,
    color: Colors.text, fontSize: 18, fontWeight: '700',
    borderWidth: 1, borderColor: Colors.border,
  },
  notesInput: { fontSize: 14, fontWeight: '400', height: 80, textAlignVertical: 'top' },
  honestBox: {
    backgroundColor: `${Colors.warning}10`, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: `${Colors.warning}30`, marginBottom: 20, gap: 6,
  },
  honestTitle: { fontSize: 13, fontWeight: '800', color: Colors.warning },
  honestText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, padding: 20, gap: 10,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  successIcon: { marginBottom: 8 },
  successTitle: { fontSize: 32, fontWeight: '900', color: Colors.text },
  successSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  summaryCard: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: Colors.cardBorder, width: '100%', gap: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: Colors.textSecondary },
  summaryValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  homeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 28, gap: 10, marginTop: 8,
  },
  homeBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
});
