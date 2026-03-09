import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Swords, Clock, Zap, ChevronRight } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { CompetitionStackParamList } from '../../navigation';

type Props = {
  navigation: NativeStackNavigationProp<CompetitionStackParamList, 'MatchWOD'>;
  route: RouteProp<CompetitionStackParamList, 'MatchWOD'>;
};

export default function MatchWODScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);
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
    <View style={S.container}>
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={S.header}>
        <View style={S.vsRow}>
          <View style={S.playerCard}>
            <View style={S.playerAvatar}>
              <Text style={S.playerAvatarText}>T</Text>
            </View>
            <Text style={S.playerName}>Toi</Text>
          </View>

          <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.vsCircle}>
            <Swords color="#fff" size={20} />
          </LinearGradient>

          <View style={S.playerCard}>
            <View style={[S.playerAvatar, { borderColor: LevelColors[opponentLevel] ?? theme.accent }]}>
              <Text style={S.playerAvatarText}>{opponentName[0]?.toUpperCase()}</Text>
            </View>
            <Text style={S.playerName}>{opponentName}</Text>
          </View>
        </View>

        <View style={S.eloRow}>
          <View style={[S.levelPill, { backgroundColor: `${LevelColors[opponentLevel] ?? theme.accent}20` }]}>
            <Text style={[S.levelText, { color: LevelColors[opponentLevel] ?? theme.accent }]}>
              {(opponentLevel ?? 'rx').toUpperCase()}
            </Text>
          </View>
          <Text style={S.eloText}>ELO {opponentElo}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[S.wodCard, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
          <View style={S.wodHeader}>
            <View style={S.wodBadges}>
              <View style={[S.badge, { backgroundColor: `${theme.accent}25` }]}>
                <Text style={[S.badgeText, { color: theme.accent }]}>{wodType}</Text>
              </View>
              <View style={[S.badge, { backgroundColor: theme.surface }]}>
                <Clock color={theme.textMuted} size={12} />
                <Text style={[S.badgeText, { color: theme.textMuted }]}>{wodDuration} min</Text>
              </View>
            </View>
          </View>

          <Text style={S.wodTitle}>{wodTitle}</Text>

          <View style={S.movementsList}>
            {movements.map((m, i) => (
              <View key={i} style={S.movementRow}>
                <View style={S.movementDot} />
                <Text style={S.movementText}>{m}</Text>
              </View>
            ))}
          </View>

          <View style={S.scoringBox}>
            <Zap color={theme.gold} size={16} />
            <Text style={S.scoringText}>{wodScoring}</Text>
          </View>
        </Animated.View>

        <View style={S.rulesCard}>
          <Text style={S.rulesTitle}>📋 Règles</Text>
          {[
            'Filme ton WOD en entier avec la caméra frontale',
            'Le chrono démarre automatiquement',
            'Soumets ton score honnêtement',
            'Le WOD sera validé par un admin',
          ].map((rule, i) => (
            <Text key={i} style={S.ruleText}>• {rule}</Text>
          ))}
        </View>

        {ready ? (
          <View style={S.countdownBox}>
            <Text style={S.countdownLabel}>Démarrage dans</Text>
            <Text style={S.countdownValue}>{countdown}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleReady} activeOpacity={0.85}>
            <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.startBtn}>
              <Zap color="#fff" size={22} />
              <Text style={S.startText}>JE SUIS PRÊT !</Text>
              <ChevronRight color="#fff" size={22} />
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  playerCard: { alignItems: 'center', flex: 1, gap: 8 },
  playerAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: theme.accent,
  },
  playerAvatarText: { fontSize: 26, fontWeight: '900', color: '#fff' },
  playerName: { fontSize: 13, fontWeight: '700', color: '#fff' },
  vsCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  eloRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  levelPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  levelText: { fontSize: 11, fontWeight: '800' },
  eloText: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  content: { padding: 16 },
  wodCard: {
    backgroundColor: theme.card, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: theme.cardBorder, marginBottom: 16,
  },
  wodHeader: { marginBottom: 12 },
  wodBadges: { flexDirection: 'row', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  wodTitle: { fontSize: 26, fontWeight: '900', color: theme.text, marginBottom: 16 },
  movementsList: { gap: 10, marginBottom: 16 },
  movementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movementDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, marginTop: 6 },
  movementText: { fontSize: 15, color: theme.text, flex: 1, lineHeight: 22 },
  scoringBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${theme.gold}15`, borderRadius: 12, padding: 12,
  },
  scoringText: { fontSize: 13, color: theme.gold, fontWeight: '700' },
  rulesCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.cardBorder, marginBottom: 20, gap: 6,
  },
  rulesTitle: { fontSize: 14, fontWeight: '800', color: theme.text, marginBottom: 4 },
  ruleText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  countdownBox: { alignItems: 'center', paddingVertical: 20 },
  countdownLabel: { fontSize: 14, color: theme.textSecondary, marginBottom: 8 },
  countdownValue: { fontSize: 72, fontWeight: '900', color: theme.accent },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, padding: 20, gap: 12,
  },
  startText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },
}); }
