import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Video, Upload, Clock, Zap, CheckCircle, XCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors, LevelColors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

const MOCK_MATCH = {
  id: '3',
  opponent: { username: 'MaxPower', elo: 1445, level: 'rx+' },
  wod: {
    title: 'Fran Modified',
    type: 'For Time',
    duration: 5,
    level: 'inter',
    movements: ['21-15-9 Thrusters (43kg)', '21-15-9 Pull-ups'],
    scoring: 'Temps le plus court (cap 5 min)',
  },
  status: 'active',
  myScore: null,
  opponentScore: '3:42',
  eloRisk: 18,
};

export default function MatchScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerColor = timeLeft < 30 ? Colors.error : timeLeft < 60 ? Colors.warning : Colors.success;

  function handleSubmit() {
    Alert.alert(
      'Soumettre le score',
      'Confirmes-tu la soumission de ta vidéo et ton temps ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Soumettre', onPress: () => {
            setSubmitted(true);
            setIsRunning(false);
          }
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft color={Colors.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match 1v1</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}20` }]}>
          <Text style={[styles.statusText, { color: Colors.success }]}>🔴 En cours</Text>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.vsRow}>
          <View style={styles.athlete}>
            <View style={[styles.avatar, { borderColor: Colors.primary }]}>
              <Text style={styles.avatarText}>{user?.username?.[0] ?? 'A'}</Text>
            </View>
            <Text style={styles.athleteName}>{user?.username ?? 'Toi'}</Text>
            <Text style={styles.athleteElo}>ELO {user?.elo ?? 1000}</Text>
          </View>

          <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.vsCircle}>
            <Text style={styles.vsText}>VS</Text>
          </LinearGradient>

          <View style={styles.athlete}>
            <View style={[styles.avatar, { borderColor: LevelColors[MOCK_MATCH.opponent.level] }]}>
              <Text style={styles.avatarText}>{MOCK_MATCH.opponent.username[0]}</Text>
            </View>
            <Text style={styles.athleteName}>{MOCK_MATCH.opponent.username}</Text>
            <Text style={styles.athleteElo}>ELO {MOCK_MATCH.opponent.elo}</Text>
          </View>
        </View>

        <View style={styles.eloRisk}>
          <Zap color={Colors.gold} size={16} />
          <Text style={styles.eloRiskText}>±{MOCK_MATCH.eloRisk} ELO en jeu</Text>
        </View>

        <View style={styles.wodCard}>
          <View style={styles.wodHeader}>
            <View style={[styles.badge, { backgroundColor: `${Colors.primary}25` }]}>
              <Text style={[styles.badgeText, { color: Colors.primary }]}>{MOCK_MATCH.wod.type}</Text>
            </View>
            <View style={styles.duration}>
              <Clock color={Colors.textMuted} size={14} />
              <Text style={styles.durationText}>{MOCK_MATCH.wod.duration} min</Text>
            </View>
          </View>
          <Text style={styles.wodTitle}>{MOCK_MATCH.wod.title}</Text>
          {MOCK_MATCH.wod.movements.map((m, i) => (
            <Text key={i} style={styles.movement}>• {m}</Text>
          ))}
          <View style={styles.scoringBox}>
            <Zap color={Colors.gold} size={14} />
            <Text style={styles.scoringText}>{MOCK_MATCH.wod.scoring}</Text>
          </View>
        </View>

        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Chronomètre</Text>
          <Text style={[styles.timer, { color: timerColor }]}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <View style={styles.timerButtons}>
            <TouchableOpacity
              onPress={() => setIsRunning(!isRunning)}
              style={[styles.timerBtn, { backgroundColor: isRunning ? Colors.warning : Colors.success }]}
            >
              <Text style={styles.timerBtnText}>{isRunning ? '⏸ Pause' : '▶ Démarrer'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setTimeLeft(300); setIsRunning(false); }}
              style={[styles.timerBtn, { backgroundColor: Colors.surface }]}
            >
              <Text style={[styles.timerBtnText, { color: Colors.textSecondary }]}>↺ Reset</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.scoresRow}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Mon score</Text>
            <Text style={[styles.scoreValue, { color: submitted ? Colors.success : Colors.textMuted }]}>
              {submitted ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : '--:--'}
            </Text>
            {submitted && <CheckCircle color={Colors.success} size={16} />}
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>{MOCK_MATCH.opponent.username}</Text>
            <Text style={[styles.scoreValue, { color: Colors.text }]}>{MOCK_MATCH.opponentScore}</Text>
            <CheckCircle color={Colors.success} size={16} />
          </View>
        </View>

        {!submitted ? (
          <View style={styles.submitSection}>
            <TouchableOpacity style={styles.videoButton} activeOpacity={0.8}>
              <Video color={Colors.primary} size={24} />
              <View>
                <Text style={styles.videoButtonTitle}>Enregistrer ma vidéo</Text>
                <Text style={styles.videoButtonSub}>Overlay chrono automatique</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSubmit} activeOpacity={0.8}>
              <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.submitButton}>
                <Upload color="#fff" size={20} />
                <Text style={styles.submitButtonText}>SOUMETTRE MON SCORE</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.submittedCard}>
            <CheckCircle color={Colors.success} size={40} />
            <Text style={styles.submittedTitle}>Score soumis !</Text>
            <Text style={styles.submittedSub}>En attente de validation par le juge ou l'organisateur.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { marginRight: 4 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: Colors.text, flex: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 16 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  athlete: { alignItems: 'center', flex: 1 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, marginBottom: 8,
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: Colors.text },
  athleteName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  athleteElo: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  vsCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  vsText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  eloRisk: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${Colors.gold}15`, borderRadius: 10, padding: 10, marginBottom: 16,
  },
  eloRiskText: { fontSize: 13, color: Colors.gold, fontWeight: '700' },
  wodCard: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { fontSize: 12, color: Colors.textMuted },
  wodTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 10 },
  movement: { fontSize: 14, color: Colors.text, marginBottom: 4 },
  scoringBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  scoringText: { fontSize: 13, color: Colors.gold, fontWeight: '600' },
  timerCard: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 24,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  timerLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  timer: { fontSize: 64, fontWeight: '900', letterSpacing: 4, marginBottom: 16 },
  timerButtons: { flexDirection: 'row', gap: 12 },
  timerBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  timerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  scoresRow: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 16,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  scoreCard: { flex: 1, alignItems: 'center', gap: 6 },
  scoreDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  scoreLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  scoreValue: { fontSize: 24, fontWeight: '900' },
  submitSection: { gap: 12 },
  videoButton: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: Colors.cardBorder,
  },
  videoButtonTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  videoButtonSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, padding: 18, gap: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  submittedCard: {
    backgroundColor: `${Colors.success}15`, borderRadius: 18, padding: 24,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: `${Colors.success}40`,
  },
  submittedTitle: { fontSize: 20, fontWeight: '900', color: Colors.success },
  submittedSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
