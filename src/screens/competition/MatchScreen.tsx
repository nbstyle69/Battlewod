import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Video, Upload, Clock, Zap, CheckCircle, XCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
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
  const { theme } = useTheme();
  const S = createStyles(theme);
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
  const timerColor = timeLeft < 30 ? theme.error : timeLeft < 60 ? theme.warning : theme.success;

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
    <View style={S.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color="rgba(255,255,255,0.7)" size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Match 1v1</Text>
        <View style={[S.statusBadge, { backgroundColor: `${theme.success}20` }]}>
          <Text style={[S.statusText, { color: theme.success }]}>🔴 En cours</Text>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        <View style={S.vsRow}>
          <View style={S.athlete}>
            <View style={[S.avatar, { borderColor: theme.accent }]}>
              <Text style={S.avatarText}>{user?.username?.[0] ?? 'A'}</Text>
            </View>
            <Text style={S.athleteName}>{user?.username ?? 'Toi'}</Text>
            <Text style={S.athleteElo}>ELO {user?.elo ?? 1000}</Text>
          </View>

          <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.vsCircle}>
            <Text style={S.vsText}>VS</Text>
          </LinearGradient>

          <View style={S.athlete}>
            <View style={[S.avatar, { borderColor: LevelColors[MOCK_MATCH.opponent.level] }]}>
              <Text style={S.avatarText}>{MOCK_MATCH.opponent.username[0]}</Text>
            </View>
            <Text style={S.athleteName}>{MOCK_MATCH.opponent.username}</Text>
            <Text style={S.athleteElo}>ELO {MOCK_MATCH.opponent.elo}</Text>
          </View>
        </View>

        <View style={S.eloRisk}>
          <Zap color={theme.gold} size={16} />
          <Text style={S.eloRiskText}>±{MOCK_MATCH.eloRisk} ELO en jeu</Text>
        </View>

        <View style={S.wodCard}>
          <View style={S.wodHeader}>
            <View style={[S.badge, { backgroundColor: `${theme.accent}25` }]}>
              <Text style={[S.badgeText, { color: theme.accent }]}>{MOCK_MATCH.wod.type}</Text>
            </View>
            <View style={S.duration}>
              <Clock color={theme.textMuted} size={14} />
              <Text style={S.durationText}>{MOCK_MATCH.wod.duration} min</Text>
            </View>
          </View>
          <Text style={S.wodTitle}>{MOCK_MATCH.wod.title}</Text>
          {MOCK_MATCH.wod.movements.map((m, i) => (
            <Text key={i} style={S.movement}>• {m}</Text>
          ))}
          <View style={S.scoringBox}>
            <Zap color={theme.gold} size={14} />
            <Text style={S.scoringText}>{MOCK_MATCH.wod.scoring}</Text>
          </View>
        </View>

        <View style={S.timerCard}>
          <Text style={S.timerLabel}>Chronomètre</Text>
          <Text style={[S.timer, { color: timerColor }]}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <View style={S.timerButtons}>
            <TouchableOpacity
              onPress={() => setIsRunning(!isRunning)}
              style={[S.timerBtn, { backgroundColor: isRunning ? theme.warning : theme.success }]}
            >
              <Text style={S.timerBtnText}>{isRunning ? '⏸ Pause' : '▶ Démarrer'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setTimeLeft(300); setIsRunning(false); }}
              style={[S.timerBtn, { backgroundColor: theme.surface }]}
            >
              <Text style={[S.timerBtnText, { color: theme.textSecondary }]}>↺ Reset</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={S.scoresRow}>
          <View style={S.scoreCard}>
            <Text style={S.scoreLabel}>Mon score</Text>
            <Text style={[S.scoreValue, { color: submitted ? theme.success : theme.textMuted }]}>
              {submitted ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : '--:--'}
            </Text>
            {submitted && <CheckCircle color={theme.success} size={16} />}
          </View>
          <View style={S.scoreDivider} />
          <View style={S.scoreCard}>
            <Text style={S.scoreLabel}>{MOCK_MATCH.opponent.username}</Text>
            <Text style={[S.scoreValue, { color: theme.text }]}>{MOCK_MATCH.opponentScore}</Text>
            <CheckCircle color={theme.success} size={16} />
          </View>
        </View>

        {!submitted ? (
          <View style={S.submitSection}>
            <TouchableOpacity style={S.videoButton} activeOpacity={0.8}>
              <Video color={theme.accent} size={24} />
              <View>
                <Text style={S.videoButtonTitle}>Enregistrer ma vidéo</Text>
                <Text style={S.videoButtonSub}>Overlay chrono automatique</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSubmit} activeOpacity={0.8}>
              <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.submitButton}>
                <Upload color="#fff" size={20} />
                <Text style={S.submitButtonText}>SOUMETTRE MON SCORE</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={S.submittedCard}>
            <CheckCircle color={theme.success} size={40} />
            <Text style={S.submittedTitle}>Score soumis !</Text>
            <Text style={S.submittedSub}>En attente de validation par le juge ou l'organisateur.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { marginRight: 4 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', flex: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 16 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  athlete: { alignItems: 'center', flex: 1 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, marginBottom: 8,
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: theme.text },
  athleteName: { fontSize: 14, fontWeight: '800', color: theme.text },
  athleteElo: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  vsCircle: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  vsText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  eloRisk: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${theme.gold}15`, borderRadius: 10, padding: 10, marginBottom: 16,
  },
  eloRiskText: { fontSize: 13, color: theme.gold, fontWeight: '700' },
  wodCard: {
    backgroundColor: theme.card, borderRadius: 18, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: theme.cardBorder,
  },
  wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { fontSize: 12, color: theme.textMuted },
  wodTitle: { fontSize: 18, fontWeight: '900', color: theme.text, marginBottom: 10 },
  movement: { fontSize: 14, color: theme.text, marginBottom: 4 },
  scoringBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  scoringText: { fontSize: 13, color: theme.gold, fontWeight: '600' },
  timerCard: {
    backgroundColor: theme.card, borderRadius: 18, padding: 24,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: theme.cardBorder,
  },
  timerLabel: { fontSize: 13, color: theme.textSecondary, marginBottom: 8, fontWeight: '600' },
  timer: { fontSize: 64, fontWeight: '900', letterSpacing: 4, marginBottom: 16 },
  timerButtons: { flexDirection: 'row', gap: 12 },
  timerBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  timerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  scoresRow: {
    flexDirection: 'row', backgroundColor: theme.card, borderRadius: 16,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.cardBorder,
  },
  scoreCard: { flex: 1, alignItems: 'center', gap: 6 },
  scoreDivider: { width: 1, backgroundColor: theme.border, marginHorizontal: 16 },
  scoreLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  scoreValue: { fontSize: 24, fontWeight: '900' },
  submitSection: { gap: 12 },
  videoButton: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: theme.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: theme.cardBorder,
  },
  videoButtonTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  videoButtonSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, padding: 18, gap: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  submittedCard: {
    backgroundColor: `${theme.success}15`, borderRadius: 18, padding: 24,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: `${theme.success}40`,
  },
  submittedTitle: { fontSize: 20, fontWeight: '900', color: theme.success },
  submittedSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
}); }
