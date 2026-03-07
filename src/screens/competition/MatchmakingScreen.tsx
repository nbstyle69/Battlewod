import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Zap, Swords, Clock } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, LevelColors } from '../../theme/colors';
import { CompetitionStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<CompetitionStackParamList, 'Matchmaking'> };

const MATCH_WODS = [
  { title: 'Battle Royale', type: 'AMRAP', duration: 5, scoring: 'Max rounds',
    movements: ['10 Burpees', '15 Air Squats', '10 Push-ups', '5 Pull-ups'] },
  { title: 'Speed Demon', type: 'For Time', duration: 5, scoring: 'Temps le plus court',
    movements: ['21 Thrusters 43kg', '21 Pull-ups', '15 Thrusters', '15 Pull-ups', '9 Thrusters', '9 Pull-ups'] },
  { title: 'Iron Storm', type: 'AMRAP', duration: 7, scoring: 'Max rounds',
    movements: ['12 Kettlebell Swings', '10 Box Jumps', '8 Ring Dips'] },
  { title: 'Fran Duel', type: 'For Time', duration: 5, scoring: 'Temps le plus court',
    movements: ['21-15-9 Thrusters 43kg', '21-15-9 Pull-ups'] },
];

export default function MatchmakingScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [countdown, setCountdown] = useState(30);
  const [phase, setPhase] = useState<'searching' | 'found' | 'timeout'>('searching');
  const [statusText, setStatusText] = useState('Recherche en cours...');

  const pulse1 = useRef(new Animated.Value(0.3)).current;
  const pulse2 = useRef(new Animated.Value(0.3)).current;
  const pulse3 = useRef(new Animated.Value(0.3)).current;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchedRef = useRef(false);

  useEffect(() => {
    animatePulse();
    startSearch();
    return () => { cleanup(); };
  }, []);

  useEffect(() => {
    if (phase !== 'searching') return;
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { handleTimeout(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  function animatePulse() {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
        ])
      );
    Animated.parallel([
      createPulse(pulse1, 0),
      createPulse(pulse2, 400),
      createPulse(pulse3, 800),
    ]).start();
  }

  async function startSearch() {
    if (!user) return;
    await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);
    const { error } = await supabase.from('matchmaking_queue').insert({
      user_id: user.id,
      username: user.username ?? 'Athlète',
      elo: user.elo ?? 1000,
      level: user.level ?? 'rx',
    });
    if (error) { Alert.alert('Erreur', 'Impossible de rejoindre la file'); navigation.goBack(); return; }
    await checkForOpponent();
    subscribeToQueue();
    startPolling();
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      if (matchedRef.current) return;
      await checkIfMatched();
      await checkForOpponent();
    }, 2500);
  }

  async function checkIfMatched() {
    if (!user || matchedRef.current) return;
    const { data } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.match_id && !matchedRef.current) {
      matchedRef.current = true;
      const wod = data.wod_data ?? MATCH_WODS[0];
      setPhase('found');
      setStatusText('Adversaire trouvé ! ⚡');
      setTimeout(() => navigateToWOD(
        data.match_id,
        data.opponent_username ?? 'Adversaire',
        data.opponent_elo ?? 1000,
        data.opponent_level ?? 'rx',
        wod,
      ), 1500);
    }
  }

  async function checkForOpponent() {
    if (!user || matchedRef.current) return;
    const userElo = user.elo ?? 1000;
    const { data: opponents } = await supabase
      .from('matchmaking_queue')
      .select('*')
      .neq('user_id', user.id)
      .is('match_id', null)
      .gte('elo', userElo - 400)
      .lte('elo', userElo + 400)
      .order('created_at', { ascending: true })
      .limit(1);

    if (opponents && opponents.length > 0 && !matchedRef.current) {
      await createMatch(opponents[0]);
    }
  }

  async function createMatch(opponent: any) {
    if (!user || matchedRef.current) return;
    matchedRef.current = true;
    const wod = MATCH_WODS[Math.floor(Math.random() * MATCH_WODS.length)];
    const { data: match } = await supabase
      .from('matches')
      .insert({ athlete1_id: user.id, athlete2_id: opponent.user_id, status: 'active' })
      .select().single();
    if (!match) { matchedRef.current = false; return; }
    await Promise.all([
      supabase.from('matchmaking_queue').update({
        match_id: match.id,
        opponent_username: opponent.username,
        opponent_elo: opponent.elo,
        opponent_level: opponent.level,
        wod_data: wod,
      }).eq('user_id', user.id),
      supabase.from('matchmaking_queue').update({
        match_id: match.id,
        opponent_username: user.username,
        opponent_elo: user.elo,
        opponent_level: user.level,
        wod_data: wod,
      }).eq('user_id', opponent.user_id),
    ]);
    setPhase('found');
    setStatusText(`Adversaire trouvé ! ⚡`);
    setTimeout(() => navigateToWOD(match.id, opponent.username, opponent.elo, opponent.level, wod), 1500);
  }

  function subscribeToQueue() {
    if (!user) return;
    channelRef.current = supabase.channel(`match-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matchmaking_queue',
        filter: `user_id=eq.${user.id}`,
      }, async (payload: any) => {
        if (payload.new.match_id && !matchedRef.current) {
          matchedRef.current = true;
          const wod = payload.new.wod_data ?? MATCH_WODS[0];
          setPhase('found');
          setStatusText('Adversaire trouvé ! ⚡');
          setTimeout(() => navigateToWOD(
            payload.new.match_id,
            payload.new.opponent_username,
            payload.new.opponent_elo,
            payload.new.opponent_level,
            wod,
          ), 1500);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'matchmaking_queue',
      }, () => { checkForOpponent(); })
      .subscribe();
  }

  function navigateToWOD(matchId: string, opponentName: string, opponentElo: number, opponentLevel: string, wod: any) {
    navigation.replace('MatchWOD', {
      matchId,
      opponentName: opponentName ?? 'Adversaire',
      opponentElo: opponentElo ?? 1000,
      opponentLevel: opponentLevel ?? 'rx',
      wodTitle: wod.title,
      wodType: wod.type,
      wodDuration: wod.duration,
      wodMovements: JSON.stringify(wod.movements),
      wodScoring: wod.scoring,
    });
  }

  function handleTimeout() {
    if (matchedRef.current) return;
    setPhase('timeout');
    setStatusText('Aucun adversaire disponible');
    cleanup();
  }

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (user) supabase.from('matchmaking_queue').delete().eq('user_id', user.id);
  }

  function handleCancel() { cleanup(); navigation.goBack(); }

  const ringStyle = (anim: Animated.Value, size: number) => ({
    width: size, height: size, borderRadius: size / 2,
    borderWidth: 2, borderColor: Colors.primary,
    position: 'absolute' as const,
    opacity: anim,
    transform: [{ scale: anim.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.4] }) }],
  });

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <TouchableOpacity onPress={handleCancel} style={styles.closeBtn}>
        <X color={Colors.textSecondary} size={24} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.radarContainer}>
          <Animated.View style={ringStyle(pulse1, 240)} />
          <Animated.View style={ringStyle(pulse2, 180)} />
          <Animated.View style={ringStyle(pulse3, 120)} />
          <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.radarCenter}>
            <Swords color="#fff" size={36} />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Recherche d'adversaire</Text>
        <Text style={[styles.statusText, phase === 'found' && { color: Colors.success }]}>
          {statusText}
        </Text>

        <View style={styles.eloCard}>
          <Zap color={Colors.primary} size={16} />
          <Text style={styles.eloLabel}>Ton ELO</Text>
          <Text style={styles.eloValue}>{user?.elo ?? 1000}</Text>
          <Text style={styles.eloRange}>± 400</Text>
        </View>

        {phase === 'searching' && (
          <View style={styles.countdownRow}>
            <Clock color={Colors.textMuted} size={16} />
            <Text style={styles.countdown}>
              Expiration dans <Text style={{ color: countdown <= 10 ? Colors.error : Colors.primary }}>
                {countdown}s
              </Text>
            </Text>
          </View>
        )}

        {phase === 'timeout' && (
          <TouchableOpacity onPress={() => { matchedRef.current = false; setCountdown(30); setPhase('searching'); setStatusText('Recherche en cours...'); startSearch(); }} activeOpacity={0.8}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.retryBtn}>
              <Text style={styles.retryText}>Relancer la recherche</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: { position: 'absolute', top: 56, right: 20, zIndex: 10, padding: 8 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  radarContainer: { width: 240, height: 240, justifyContent: 'center', alignItems: 'center', marginBottom: 48 },
  radarCenter: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, marginBottom: 8, letterSpacing: 1 },
  statusText: { fontSize: 15, color: Colors.textSecondary, marginBottom: 32 },
  eloCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 24, width: '100%',
  },
  eloLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  eloValue: { fontSize: 22, fontWeight: '900', color: Colors.primary },
  eloRange: { fontSize: 12, color: Colors.textMuted },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countdown: { fontSize: 14, color: Colors.textMuted },
  retryBtn: { borderRadius: 16, paddingHorizontal: 32, paddingVertical: 16, marginTop: 16 },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
