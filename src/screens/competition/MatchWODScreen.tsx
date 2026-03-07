import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Swords, Clock, Zap, ChevronRight } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, LevelColors } from '../../theme/colors';
import { CompetitionStackParamList } from '../../navigation';

type Props = {
  navigation: NativeStackNavigationProp<CompetitionStackParamList, 'MatchWOD'>;
  route: RouteProp<CompetitionStackParamList, 'MatchWOD'>;
};

export default function MatchWODScreen({ navigation, route }: Props) {
  const {
    matchId, opponentName, opponentElo, opponentLevel,
    wodTitle, wodType, wodDuration, wodMovements, wodScoring,
  } = route.params;

  const movements: string[] = JSON.parse(wodMovements);
  const [countdown, setCountdown] = useState(10);
  const [ready, setReady] = useState(false);
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (countdown === 0) { handleStart(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, ready]);

  function handleReady() {
    setReady(true);
  }

  function handleStart() {
    navigation.replace('MatchCamera', {
      matchId,
      wodTitle,
      wodType,
      wodDuration,
      wodMovements,
      wodScoring,
    });
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={styles.header}>
        <View style={styles.vsRow}>
          <View style={styles.playerCard}>
            <View style={styles.playerAvatar}>
              <Text style={styles.playerAvatarText}>T</Text>
            </View>
            <Text style={styles.playerName}>Toi</Text>
          </View>

          <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.vsCircle}>
            <Swords color="#fff" size={20} />
          </LinearGradient>

          <View style={styles.playerCard}>
            <View style={[styles.playerAvatar, { borderColor: LevelColors[opponentLevel] ?? Colors.secondary }]}>
              <Text style={styles.playerAvatarText}>{opponentName[0]?.toUpperCase()}</Text>
            </View>
            <Text style={styles.playerName}>{opponentName}</Text>
          </View>
        </View>

        <View style={styles.eloRow}>
          <View style={[styles.levelPill, { backgroundColor: `${LevelColors[opponentLevel] ?? Colors.secondary}20` }]}>
            <Text style={[styles.levelText, { color: LevelColors[opponentLevel] ?? Colors.secondary }]}>
              {(opponentLevel ?? 'rx').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.eloText}>ELO {opponentElo}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.wodCard, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
          <View style={styles.wodHeader}>
            <View style={styles.wodBadges}>
              <View style={[styles.badge, { backgroundColor: `${Colors.primary}25` }]}>
                <Text style={[styles.badgeText, { color: Colors.primary }]}>{wodType}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: Colors.surface }]}>
                <Clock color={Colors.textMuted} size={12} />
                <Text style={[styles.badgeText, { color: Colors.textMuted }]}>{wodDuration} min</Text>
              </View>
            </View>
          </View>

          <Text style={styles.wodTitle}>{wodTitle}</Text>

          <View style={styles.movementsList}>
            {movements.map((m, i) => (
              <View key={i} style={styles.movementRow}>
                <View style={styles.movementDot} />
                <Text style={styles.movementText}>{m}</Text>
              </View>
            ))}
          </View>

          <View style={styles.scoringBox}>
            <Zap color={Colors.gold} size={16} />
            <Text style={styles.scoringText}>{wodScoring}</Text>
          </View>
        </Animated.View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>📋 Règles</Text>
          {[
            'Filme ton WOD en entier avec la caméra frontale',
            'Le chrono démarre automatiquement',
            'Soumets ton score honnêtement',
            'Le WOD sera validé par un admin',
          ].map((rule, i) => (
            <Text key={i} style={styles.ruleText}>• {rule}</Text>
          ))}
        </View>

        {ready ? (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownLabel}>Démarrage dans</Text>
            <Text style={styles.countdownValue}>{countdown}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleReady} activeOpacity={0.85}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.startBtn}>
              <Zap color="#fff" size={22} />
              <Text style={styles.startText}>JE SUIS PRÊT !</Text>
              <ChevronRight color="#fff" size={22} />
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  playerCard: { alignItems: 'center', flex: 1, gap: 8 },
  playerAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.primary,
  },
  playerAvatarText: { fontSize: 26, fontWeight: '900', color: Colors.text },
  playerName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  vsCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  eloRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  levelPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  levelText: { fontSize: 11, fontWeight: '800' },
  eloText: { fontSize: 12, color: Colors.textMuted },
  content: { padding: 16 },
  wodCard: {
    backgroundColor: Colors.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 16,
  },
  wodHeader: { marginBottom: 12 },
  wodBadges: { flexDirection: 'row', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  wodTitle: { fontSize: 26, fontWeight: '900', color: Colors.text, marginBottom: 16 },
  movementsList: { gap: 10, marginBottom: 16 },
  movementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movementDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
  movementText: { fontSize: 15, color: Colors.text, flex: 1, lineHeight: 22 },
  scoringBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.gold}15`, borderRadius: 12, padding: 12,
  },
  scoringText: { fontSize: 13, color: Colors.gold, fontWeight: '700' },
  rulesCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 20, gap: 6,
  },
  rulesTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  ruleText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  countdownBox: { alignItems: 'center', paddingVertical: 20 },
  countdownLabel: { fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  countdownValue: { fontSize: 72, fontWeight: '900', color: Colors.primary },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, padding: 20, gap: 12,
  },
  startText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },
});
