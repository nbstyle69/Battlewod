import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl, FlatList,
} from 'react-native';
import { ChevronLeft, Clock, Plus, RotateCcw, MessageSquare, Trophy, Heart, Send, X, Smile, Share2 } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import ShareScoreCard from '../../components/ShareScoreCard';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWOD, WODScore, ScoreType, GenderTarget } from '../../types';
import { WhiteboardStackParamList } from '../../navigation';
import { sendScoreNotification, sendScoreOvertakenNotification, cancelTodayScoreReminder } from '../../services/notifications';
import { incrementCounter, logMovementReps } from '../../services/gamification';
import { formatScoreValue, DNF_BASE } from '../../utils/scoreFormat';
import { computeCompletedMovements } from '../../utils/movementParser';

type Nav   = NativeStackNavigationProp<WhiteboardStackParamList>;
type Route = RouteProp<WhiteboardStackParamList, 'WODDetail'>;

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

function allowedScoreTypes(wodType?: string | null): { types: ScoreType[]; default: ScoreType } {
  switch (wodType) {
    case 'for-time': return { types: ['time'],            default: 'time'   };
    case 'amrap':    return { types: ['reps'],            default: 'reps'   };
    case 'emom':     return { types: ['reps', 'rounds'],  default: 'rounds' };
    case 'tabata':   return { types: ['reps'],            default: 'reps'   };
    case 'strength': return { types: ['weight'],          default: 'weight' };
    default:         return { types: ['time', 'reps', 'weight', 'rounds'], default: 'reps' };
  }
}

function formatScore(score: WODScore): string {
  return formatScoreValue(score.score_value, score.score_type);
}

// ── ELO Calculation ──────────────────────────────────────────────────────
const K = 32;

function calculateEloDeltas(rankedScores: { member_id: string; elo: number; rank: number }[]) {
  const n = rankedScores.length;
  if (n < 2) return rankedScores.map(s => ({ ...s, delta: 0 }));

  const results: { member_id: string; elo: number; rank: number; delta: number }[] = [];

  for (const player of rankedScores) {
    let expectedScore = 0;
    let actualScore = 0;

    for (const opponent of rankedScores) {
      if (opponent.member_id === player.member_id) continue;
      const exp = 1 / (1 + Math.pow(10, (opponent.elo - player.elo) / 400));
      expectedScore += exp;

      if (player.rank < opponent.rank) actualScore += 1;
      else if (player.rank === opponent.rank) actualScore += 0.5;
    }

    const delta = Math.round((K / (n - 1)) * (actualScore - expectedScore));
    results.push({ ...player, delta });
  }

  return results;
}

async function computeAndSaveElo(wodId: string, boxId: string, scores: WODScore[], isTimeBased: boolean) {
  if (scores.length < 2) return;

  // Get current ELO for all participants
  const memberIds = scores.map(s => s.member_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, elo')
    .in('id', memberIds);

  if (!profiles) return;

  const eloMap: Record<string, number> = {};
  for (const p of profiles) eloMap[p.id] = p.elo ?? 1000;

  // Sort scores: for time => ascending (lower is better), else descending (higher is better)
  const sorted = [...scores].sort((a, b) =>
    isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value
  );

  // Assign ranks (handle ties)
  const ranked = sorted.map((s, i) => {
    let rank = i + 1;
    if (i > 0 && sorted[i].score_value === sorted[i - 1].score_value) {
      rank = ranked[i - 1]?.rank ?? rank;
    }
    return { member_id: s.member_id, elo: eloMap[s.member_id] ?? 1000, rank };
  });

  const deltas = calculateEloDeltas(ranked);

  // Upsert elo_history
  const historyRows = deltas.map(d => ({
    box_id: boxId,
    wod_id: wodId,
    member_id: d.member_id,
    elo_before: d.elo,
    elo_after: d.elo + d.delta,
    elo_delta: d.delta,
    rank: d.rank,
  }));

  await supabase.from('elo_history').upsert(historyRows, { onConflict: 'wod_id,member_id' });

  // Update profiles
  for (const d of deltas) {
    await supabase
      .from('profiles')
      .update({ elo: d.elo + d.delta })
      .eq('id', d.member_id);
  }
}

// ─────────────────────────────────────────────────────────────────────────

export default function WODDetailScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { wodId, scrollToLeaderboard } = route.params;
  const S = createStyles(theme);
  const scrollRef = useRef<ScrollView>(null);
  const leaderboardY = useRef(0);

  const [wod,         setWod]         = useState<BoxWOD | null>(null);
  const [scores,      setScores]      = useState<WODScore[]>([]);
  const [myScore,     setMyScore]     = useState<WODScore | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [modalOpen,   setModalOpen]   = useState(false);

  // Score form
  const [scoreType,  setScoreType]  = useState<ScoreType>('reps');
  const [scoreInput, setScoreInput] = useState('');
  const [timeMin,    setTimeMin]    = useState('');
  const [timeSec,    setTimeSec]    = useState('');
  const secRef = useRef<TextInput>(null);
  const [isRx,       setIsRx]       = useState(true);
  const [noteInput,  setNoteInput]  = useState('');
  const [dnf,        setDnf]        = useState(false);
  const [capReps,    setCapReps]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Score detail modal
  const [selectedScore, setSelectedScore] = useState<WODScore | null>(null);
  const [comments, setComments]     = useState<any[]>([]);
  const [reactions, setReactions]   = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);

  const EMOJI_LIST = ['❤️', '🔥', '💪', '👏', '🎯', '⚡', '🏆', '💥', '👊', '🙌', '😤', '🫡'];

  // Reaction/comment counts per score
  const [scoreMeta, setScoreMeta] = useState<Record<string, { reactions: number; comments: number }>>({});
  const [genderFilter, setGenderFilter] = useState<GenderTarget>('mix');
  const [eloDeltas, setEloDeltas] = useState<Record<string, number>>({});
  const [shareModal, setShareModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  const load = useCallback(async () => {
    const { data: wodData } = await supabase.from('box_wods').select('*').eq('id', wodId).single();
    const w = wodData as BoxWOD | null;
    setWod(w);

    if (w) {
      const { data: scoreData } = await supabase
        .from('wod_scores')
        .select('*, profile:profiles(id, username, avatar_url, level, elo, gender)')
        .eq('wod_id', w.id)
        .order('score_value', { ascending: w.wod_type === 'for-time' });

      const list = (scoreData ?? []) as WODScore[];
      setScores(list);
      setMyScore(list.find(sc => sc.member_id === user?.id) ?? null);
      setScoreType(allowedScoreTypes(w.wod_type).default);

      // Load reaction & comment counts for each score
      const scoreIds = list.map(s => s.id);
      if (scoreIds.length > 0) {
        const [{ data: rxnData }, { data: cmtData }] = await Promise.all([
          supabase.from('score_reactions').select('score_id').in('score_id', scoreIds),
          supabase.from('score_comments').select('score_id').in('score_id', scoreIds),
        ]);
        const meta: Record<string, { reactions: number; comments: number }> = {};
        scoreIds.forEach(id => { meta[id] = { reactions: 0, comments: 0 }; });
        (rxnData ?? []).forEach((r: any) => { if (meta[r.score_id]) meta[r.score_id].reactions++; });
        (cmtData ?? []).forEach((c: any) => { if (meta[c.score_id]) meta[c.score_id].comments++; });
        setScoreMeta(meta);
      }

      // Load ELO deltas for this WOD
      const { data: eloHist } = await supabase
        .from('elo_history')
        .select('member_id, elo_delta')
        .eq('wod_id', w.id);
      const dMap: Record<string, number> = {};
      (eloHist ?? []).forEach((h: any) => { dMap[h.member_id] = h.elo_delta; });
      setEloDeltas(dMap);
    }
    setLoading(false);
    setRefreshing(false);
  }, [wodId, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll to leaderboard when coming from "Classement" button
  useEffect(() => {
    if (scrollToLeaderboard && !loading && scores.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: leaderboardY.current, animated: true });
      }, 300);
    }
  }, [scrollToLeaderboard, loading, scores.length]);

  // Midnight cutoff: disable score submission after the WOD's scheduled date
  const isExpired = wod ? new Date() >= new Date(wod.scheduled_date + 'T00:00:00') && new Date() >= (() => {
    const d = new Date(wod.scheduled_date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d;
  })() : false;

  async function handleShare() {
    if (!viewShotRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      const available = await Sharing.isAvailableAsync();
      if (!available) { Alert.alert('Partage non disponible sur cet appareil'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partager ma performance' });
    } catch (e: any) {
      if (!e?.message?.includes('cancel')) {
        Alert.alert('Erreur', 'Impossible de partager la card.');
      }
    } finally {
      setSharing(false);
    }
  }

  async function submitScore() {
    if (!wod || !user || !currentBox) return;
    let value = 0;
    if (scoreType === 'time' && dnf) {
      const reps = parseInt(capReps) || 0;
      if (reps <= 0) { Alert.alert('Score invalide', 'Entre le nombre de répétitions complétées.'); return; }
      value = DNF_BASE + reps;
    } else if (scoreType === 'time') {
      const m = parseInt(timeMin) || 0;
      const s = parseInt(timeSec) || 0;
      value = m * 60 + s;
    } else {
      value = parseFloat(scoreInput);
    }
    if (isNaN(value) || value <= 0) { Alert.alert('Score invalide'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('wod_scores').upsert({
      wod_id: wod.id,
      member_id: user.id,
      box_id: currentBox.id,
      score_type: scoreType,
      score_value: value,
      rx: isRx,
      scaled: !isRx,
      notes: noteInput.trim() || null,
    }, { onConflict: 'wod_id,member_id' });

    if (error) { setSubmitting(false); Alert.alert('Erreur', error.message); return; }
    incrementCounter(user.id, 'total_scores_submitted').catch(() => {});
    cancelTodayScoreReminder().catch(() => {});

    // Log movement reps for badges (parse description as movement lines)
    if (wod.description) {
      const lines = wod.description.split('\n').filter(Boolean);
      const wodFormat = wod.wod_type === 'for-time' ? 'For Time' : wod.wod_type === 'amrap' ? 'AMRAP' : wod.wod_type === 'emom' ? 'EMOM' : wod.wod_type ?? 'For Time';
      const completed = computeCompletedMovements(lines, wodFormat, value, scoreType);
      logMovementReps(user.id, completed, 'whiteboard', wod.id).catch(() => {});
    }

    // Snapshot old rankings before reload
    const oldScores = [...scores];

    // Reload scores then compute ELO
    const { data: updatedScores } = await supabase
      .from('wod_scores')
      .select('*, profile:profiles(id, username, avatar_url, level, elo)')
      .eq('wod_id', wod.id)
      .order('score_value', { ascending: wod.wod_type === 'for-time' });

    const list = (updatedScores ?? []) as WODScore[];

    // Detect overtaken users: users who were ranked above my new position before
    const myNewIdx = list.findIndex(s => s.member_id === user.id);
    if (myNewIdx >= 0 && oldScores.length > 0) {
      const overtaken = list
        .slice(myNewIdx + 1)
        .filter(s => {
          const oldIdx = oldScores.findIndex(os => os.member_id === s.member_id);
          return oldIdx >= 0 && oldIdx < oldScores.findIndex(os => os.member_id === user.id);
        })
        .map(s => s.member_id)
        .filter(id => id !== user.id);
      if (overtaken.length > 0) {
        sendScoreOvertakenNotification(overtaken, user.username, wod.title).catch(() => {});
      }
    }
    setScores(list);
    setMyScore(list.find(sc => sc.member_id === user.id) ?? null);

    // ELO calculation (only if leaderboard enabled)
    if (wod.leaderboard_enabled !== false) {
      await computeAndSaveElo(wod.id, currentBox.id, list, wod.wod_type === 'for-time');
    }

    setSubmitting(false);
    setModalOpen(false);
    setScoreInput('');
    setTimeMin('');
    setTimeSec('');
    setNoteInput('');
    setDnf(false);
    setCapReps('');
    setShareModal(true);
  }

  async function openScoreDetail(sc: WODScore) {
    setSelectedScore(sc);
    setCommentText('');
    setShowEmojis(false);
    await loadScoreDetail(sc.id);
  }

  async function loadScoreDetail(scoreId: string) {
    const [{ data: cmts }, { data: rxns }] = await Promise.all([
      supabase
        .from('score_comments')
        .select('*, author:profiles!score_comments_author_id_fkey(id, username)')
        .eq('score_id', scoreId)
        .order('created_at', { ascending: true }),
      supabase
        .from('score_reactions')
        .select('*, reactor:profiles!score_reactions_user_id_fkey(username)')
        .eq('score_id', scoreId),
    ]);
    setComments(cmts ?? []);
    setReactions(rxns ?? []);
  }

  async function sendComment() {
    if (!selectedScore || !user || !currentBox || !commentText.trim()) return;
    setSendingComment(true);
    const { error } = await supabase.from('score_comments').insert({
      score_id: selectedScore.id,
      box_id: currentBox.id,
      author_id: user.id,
      content: commentText.trim(),
    });
    if (!error) {
      setCommentText('');
      await loadScoreDetail(selectedScore.id);
      // Update leaderboard count
      setScoreMeta(prev => ({
        ...prev,
        [selectedScore.id]: {
          ...prev[selectedScore.id],
          comments: (prev[selectedScore.id]?.comments ?? 0) + 1,
        },
      }));
      // Notify score owner (don't notify yourself)
      if (selectedScore.member_id !== user.id) {
        sendScoreNotification(
          selectedScore.member_id,
          user.username ?? 'Quelqu\'un',
          'comment',
        ).catch(() => {});
      }
    }
    setSendingComment(false);
  }

  async function toggleReaction(emoji: string) {
    if (!selectedScore || !user) return;
    const existing = reactions.find(r => r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from('score_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('score_reactions').insert({
        score_id: selectedScore.id,
        user_id: user.id,
        emoji,
      });
      // Notify score owner (don't notify yourself)
      if (selectedScore.member_id !== user.id) {
        sendScoreNotification(
          selectedScore.member_id,
          user.username ?? 'Quelqu\'un',
          'reaction',
          emoji,
        ).catch(() => {});
      }
    }
    await loadScoreDetail(selectedScore.id);
    // Recalculate leaderboard reaction count from fresh data
    const { data: freshRxns } = await supabase
      .from('score_reactions').select('score_id').eq('score_id', selectedScore.id);
    setScoreMeta(prev => ({
      ...prev,
      [selectedScore.id]: {
        ...prev[selectedScore.id],
        reactions: freshRxns?.length ?? 0,
      },
    }));
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!wod) {
    return (
      <View style={S.container}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <ChevronLeft color={theme.text} size={22} />
          </TouchableOpacity>
          <Text style={S.headerTitle}>WOD introuvable</Text>
        </View>
      </View>
    );
  }

  const color = TYPE_COLORS[wod.wod_type ?? 'custom'] ?? '#6B7280';
  const myRank = myScore ? scores.findIndex(s => s.id === myScore.id) + 1 : null;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>{wod.title}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* WOD info card */}
        <View style={S.wodCard}>
          <View style={S.wodMeta}>
            <View style={[S.typeBadge, { backgroundColor: `${color}18` }]}>
              <Text style={[S.typeBadgeText, { color }]}>{(wod.wod_type ?? 'custom').toUpperCase()}</Text>
            </View>
            
            {wod.time_cap_seconds && (
              <View style={S.timeCap}>
                <Clock color={theme.textMuted} size={12} />
                <Text style={S.timeCapText}>Cap {Math.floor(wod.time_cap_seconds / 60)} min</Text>
              </View>
            )}
          </View>

          <Text style={S.wodDate}>
            {new Date(wod.scheduled_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>

          {wod.description && <Text style={S.wodDesc}>{wod.description}</Text>}
          {wod.notes && (
            <View style={S.notesBox}>
              <Text style={S.notesLabel}>Notes coach</Text>
              <Text style={S.notesText}>{wod.notes}</Text>
            </View>
          )}

          {/* My score */}
          {myScore ? (
            <View style={S.myScoreRow}>
              <View style={S.myScoreBadge}>
                <Text style={S.myScoreLabel}>Mon score</Text>
                <Text style={S.myScoreValue}>{formatScore(myScore)}</Text>
                <Text style={S.myScoreRx}>{myScore.rx ? 'RX' : 'Scaled'}</Text>
              </View>
              {wod.leaderboard_enabled !== false && myRank && (
                <View style={S.myRankBadge}>
                  <Trophy color={myRank <= 3 ? theme.gold : theme.textMuted} size={14} />
                  <Text style={[S.myRankText, myRank <= 3 && { color: theme.gold }]}>#{myRank}</Text>
                </View>
              )}
              <TouchableOpacity style={S.shareScoreBtn} onPress={() => setShareModal(true)} activeOpacity={0.7}>
                <Share2 color={theme.accent} size={14} />
                <Text style={S.editScoreBtnText}>Partager</Text>
              </TouchableOpacity>
              {!isExpired && (
                <TouchableOpacity style={S.editScoreBtn} onPress={() => setModalOpen(true)} activeOpacity={0.7}>
                  <RotateCcw color={theme.accent} size={14} />
                  <Text style={S.editScoreBtnText}>Modifier</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isExpired ? (
            <View style={S.expiredBanner}>
              <Clock color={theme.textMuted} size={14} />
              <Text style={S.expiredText}>Soumission de score terminée (minuit passé)</Text>
            </View>
          ) : (
            <TouchableOpacity style={S.enterScoreBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
              <Plus color="#fff" size={18} />
              <Text style={S.enterScoreBtnText}>Entrer mon score</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Leaderboard */}
        {scores.length > 0 && wod.leaderboard_enabled !== false && (
          <View
            style={S.section}
            onLayout={e => { leaderboardY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={S.sectionTitle}>Classement · {scores.length} score{scores.length > 1 ? 's' : ''}</Text>
            <View style={S.genderFilterRow}>
              {([['mix', 'Tous'], ['male', 'Homme'], ['female', 'Femme']] as [GenderTarget, string][]).map(([val, lbl]) => (
                <TouchableOpacity
                  key={val}
                  style={[S.genderChip, genderFilter === val && S.genderChipActive]}
                  onPress={() => setGenderFilter(val)}
                  activeOpacity={0.7}
                >
                  <Text style={[S.genderChipText, genderFilter === val && S.genderChipTextActive]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={S.leaderboard}>
              {scores.filter(sc => genderFilter === 'mix' || (sc.profile as any)?.gender === genderFilter).map((sc, i) => {
                const isMe = sc.member_id === user?.id;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                const elo = (sc.profile as any)?.elo ?? 1000;
                return (
                  <TouchableOpacity
                    key={sc.id}
                    style={[S.leaderRow, isMe && S.leaderRowMe]}
                    onPress={() => openScoreDetail(sc)}
                    activeOpacity={0.75}
                  >
                    <Text style={S.leaderRank}>{medal ?? `${i + 1}`}</Text>
                    <View style={S.leaderAvatar}>
                      <Text style={S.leaderAvatarText}>
                        {((sc.profile as any)?.username?.[0] ?? '?').toUpperCase()}
                      </Text>
                    </View>
                    <View style={S.leaderMid}>
                      <Text style={S.leaderName}>
                        {(sc.profile as any)?.username ?? 'Athlète'}{isMe ? ' (moi)' : ''}
                      </Text>
                      <View style={S.leaderSubRow}>
                        <Text style={S.leaderElo}>{elo} ELO</Text>
                        {eloDeltas[sc.member_id] != null && (
                          <Text style={{ fontSize: 10, fontWeight: '800', color: eloDeltas[sc.member_id] > 0 ? '#22c55e' : eloDeltas[sc.member_id] < 0 ? '#ef4444' : theme.textMuted }}>
                            {eloDeltas[sc.member_id] > 0 ? '+' : ''}{eloDeltas[sc.member_id]}
                          </Text>
                        )}
                        {(scoreMeta[sc.id]?.reactions ?? 0) > 0 && (
                          <View style={S.leaderMetaChip}>
                            <Heart color="#EC4899" size={10} fill="#EC4899" />
                            <Text style={S.leaderMetaCount}>{scoreMeta[sc.id].reactions}</Text>
                          </View>
                        )}
                        {(scoreMeta[sc.id]?.comments ?? 0) > 0 && (
                          <View style={S.leaderMetaChip}>
                            <MessageSquare color="#3B82F6" size={10} />
                            <Text style={S.leaderMetaCount}>{scoreMeta[sc.id].comments}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={S.leaderRight}>
                      <Text style={[S.leaderScore, i === 0 && S.leaderScoreGold]}>{formatScore(sc)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Score Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Entrer mon score</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalCloseText}>Annuler</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={S.modalWodName}>{wod.title}</Text>

              {/* Score type */}
              {(() => {
                const allowed = allowedScoreTypes(wod.wod_type);
                if (allowed.types.length === 1) {
                  return (
                    <>
                      <Text style={S.modalLabel}>TYPE DE SCORE</Text>
                      <View style={S.typeRow}>
                        <View style={[S.typeChip, S.typeChipActive]}>
                          <Text style={[S.typeChipText, S.typeChipTextActive]}>{allowed.types[0].toUpperCase()}</Text>
                        </View>
                      </View>
                    </>
                  );
                }
                return (
                  <>
                    <Text style={S.modalLabel}>TYPE DE SCORE</Text>
                    <View style={S.typeRow}>
                      {allowed.types.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[S.typeChip, scoreType === t && S.typeChipActive]}
                          onPress={() => setScoreType(t)}
                        >
                          <Text style={[S.typeChipText, scoreType === t && S.typeChipTextActive]}>
                            {t.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                );
              })()}

              {scoreType === 'time' && (
                <TouchableOpacity
                  style={S.dnfRow}
                  onPress={() => { setDnf(!dnf); setScoreInput(''); setCapReps(''); }}
                  activeOpacity={0.7}
                >
                  <View style={[S.dnfCheck, dnf && S.dnfCheckActive]}>
                    {dnf && <Text style={S.dnfCheckMark}>✓</Text>}
                  </View>
                  <Text style={S.dnfLabel}>WOD pas fini (CAP)</Text>
                </TouchableOpacity>
              )}

              {scoreType === 'time' && dnf ? (
                <>
                  <Text style={S.modalLabel}>NOMBRE DE RÉPÉTITIONS COMPLÉTÉES</Text>
                  <TextInput
                    style={S.scoreInput}
                    placeholder="Ex: 87"
                    placeholderTextColor={theme.textMuted}
                    value={capReps}
                    onChangeText={setCapReps}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <Text style={S.modalLabel}>
                    {scoreType === 'time' ? 'TEMPS (MM:SS)' : scoreType === 'weight' ? 'POIDS (kg)' : scoreType === 'reps' ? 'REPS' : 'ROUNDS'}
                  </Text>
                  {scoreType === 'time' ? (
                    <View style={S.timeRow}>
                      <TextInput
                        style={[S.scoreInput, S.timeInput]}
                        placeholder="MM"
                        placeholderTextColor={theme.textMuted}
                        value={timeMin}
                        onChangeText={(t) => {
                          const d = t.replace(/\D/g, '').slice(0, 2);
                          setTimeMin(d);
                          if (d.length === 2) secRef.current?.focus();
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        autoFocus
                      />
                      <Text style={S.timeColon}>:</Text>
                      <TextInput
                        ref={secRef}
                        style={[S.scoreInput, S.timeInput]}
                        placeholder="SS"
                        placeholderTextColor={theme.textMuted}
                        value={timeSec}
                        onChangeText={(t) => setTimeSec(t.replace(/\D/g, '').slice(0, 2))}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  ) : (
                    <TextInput
                      style={S.scoreInput}
                      placeholder="150"
                      placeholderTextColor={theme.textMuted}
                      value={scoreInput}
                      onChangeText={setScoreInput}
                      keyboardType="number-pad"
                      autoFocus
                    />
                  )}
                </>
              )}

              <Text style={S.modalLabel}>NIVEAU</Text>
              <View style={S.rxRow}>
                <TouchableOpacity style={[S.rxChip, isRx && S.rxChipActive]} onPress={() => setIsRx(true)}>
                  <Text style={[S.rxChipText, isRx && S.rxChipTextActive]}>RX</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.rxChip, !isRx && S.rxChipActiveScaled]} onPress={() => setIsRx(false)}>
                  <Text style={[S.rxChipText, !isRx && S.rxChipTextActive]}>Scaled</Text>
                </TouchableOpacity>
              </View>

              <Text style={S.modalLabel}>NOTES (optionnel)</Text>
              <TextInput
                style={[S.scoreInput, { minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Commentaire, mouvements adaptés…"
                placeholderTextColor={theme.textMuted}
                value={noteInput}
                onChangeText={setNoteInput}
                multiline
              />

              <TouchableOpacity
                style={[S.submitBtn, (!(dnf ? capReps.trim() : scoreInput.trim()) || submitting) && S.submitBtnDisabled]}
                onPress={submitScore}
                disabled={!(dnf ? capReps.trim() : scoreInput.trim()) || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.submitBtnText}>Valider le score</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Share Modal */}
      <Modal visible={shareModal} animationType="fade" transparent onRequestClose={() => setShareModal(false)}>
        <View style={S.shareOverlay}>
          <View style={S.shareContainer}>
            <View style={S.shareHeader}>
              <Text style={S.shareTitle}>Partager ma perf 📸</Text>
              <TouchableOpacity onPress={() => setShareModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={theme.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            {myScore && wod && (
              <>
                <View style={S.sharePreview}>
                  <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
                    <ShareScoreCard
                      wodTitle={wod.title}
                      wodType={wod.wod_type ?? null}
                      score={myScore.score_value}
                      scoreType={myScore.score_type}
                      rx={myScore.rx}
                      rank={myRank}
                      totalParticipants={scores.length}
                      username={user?.username ?? 'Athlète'}
                      boxName={currentBox?.name ?? 'Ma Box'}
                      date={wod.scheduled_date}
                    />
                  </ViewShot>
                </View>

                <TouchableOpacity
                  style={S.shareCTA}
                  onPress={handleShare}
                  disabled={sharing}
                  activeOpacity={0.85}
                >
                  {sharing
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Share2 color="#fff" size={18} />
                        <Text style={S.shareCTAText}>Partager ma performance</Text>
                      </>
                  }
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => setShareModal(false)} style={S.shareSkip} activeOpacity={0.7}>
              <Text style={S.shareSkipText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Score Detail Modal */}
      <Modal visible={!!selectedScore} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedScore(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.sdContainer}>
            {/* Header */}
            <View style={S.sdHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.sdTitle}>
                  {(selectedScore?.profile as any)?.username ?? 'Athlète'}
                </Text>
                <Text style={S.sdSub}>
                  {selectedScore ? formatScore(selectedScore) : ''} · {selectedScore?.rx ? 'RX' : 'Scaled'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedScore(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={theme.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            {/* Score card */}
            {selectedScore && (
              <View style={S.sdScoreCard}>
                <View style={S.sdScoreRow}>
                  <View style={S.sdAvatar}>
                    <Text style={S.sdAvatarText}>
                      {((selectedScore.profile as any)?.username?.[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.sdAthleteName}>{(selectedScore.profile as any)?.username}</Text>
                    <Text style={S.sdLevel}>{(selectedScore.profile as any)?.level?.toUpperCase()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={S.sdScoreValue}>{formatScore(selectedScore)}</Text>
                    <View style={[S.sdRxTag, { backgroundColor: selectedScore.rx ? `${theme.success}15` : `${theme.warning}15` }]}>
                      <Text style={[S.sdRxText, { color: selectedScore.rx ? theme.success : theme.warning }]}>
                        {selectedScore.rx ? 'RX' : 'Scaled'}
                      </Text>
                    </View>
                  </View>
                </View>
                {selectedScore.notes ? (
                  <View style={S.sdNotesBox}>
                    <Text style={S.sdNotesText}>{selectedScore.notes}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Reactions summary */}
            {reactions.length > 0 && (
              <View style={S.sdReactionsRow}>
                {(() => {
                  const grouped: Record<string, { count: number; mine: boolean }> = {};
                  reactions.forEach(r => {
                    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false };
                    grouped[r.emoji].count++;
                    if (r.user_id === user?.id) grouped[r.emoji].mine = true;
                  });
                  return Object.entries(grouped).map(([emoji, { count, mine }]) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[S.sdReactionChip, mine && S.sdReactionChipMine]}
                      onPress={() => toggleReaction(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={S.sdReactionEmoji}>{emoji}</Text>
                      <Text style={[S.sdReactionCount, mine && S.sdReactionCountMine]}>{count}</Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            )}

            {/* Emoji picker */}
            <View style={S.sdEmojiRow}>
              <TouchableOpacity onPress={() => setShowEmojis(!showEmojis)} style={S.sdEmojiToggle}>
                <Smile color={showEmojis ? theme.accent : theme.textMuted} size={20} />
              </TouchableOpacity>
              {showEmojis && (
                <View style={S.sdEmojiGrid}>
                  {EMOJI_LIST.map(e => (
                    <TouchableOpacity key={e} onPress={() => toggleReaction(e)} style={S.sdEmojiBtn}>
                      <Text style={S.sdEmojiBtnText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!showEmojis && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {EMOJI_LIST.slice(0, 6).map(e => (
                    <TouchableOpacity key={e} onPress={() => toggleReaction(e)} style={S.sdQuickEmoji}>
                      <Text style={{ fontSize: 18 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Comments */}
            <View style={{ flex: 1 }}>
              <Text style={S.sdCommentsTitle}>
                <MessageSquare color={theme.textMuted} size={14} /> Commentaires ({comments.length})
              </Text>
              <FlatList
                data={comments}
                keyExtractor={c => c.id}
                contentContainerStyle={S.sdCommentsList}
                renderItem={({ item }) => {
                  const author = Array.isArray(item.author) ? item.author[0] : item.author;
                  const isMyComment = author?.id === user?.id;
                  const ago = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 60000);
                  const timeLabel = ago < 60 ? `${ago}min` : ago < 1440 ? `${Math.floor(ago / 60)}h` : `${Math.floor(ago / 1440)}j`;
                  return (
                    <View style={[S.sdComment, isMyComment && S.sdCommentMine]}>
                      <View style={S.sdCommentHeader}>
                        <View style={S.sdCommentAvatar}>
                          <Text style={S.sdCommentAvatarText}>{(author?.username?.[0] ?? '?').toUpperCase()}</Text>
                        </View>
                        <Text style={S.sdCommentAuthor}>{author?.username ?? 'Inconnu'}</Text>
                        <Text style={S.sdCommentTime}>{timeLabel}</Text>
                      </View>
                      <Text style={S.sdCommentContent}>{item.content}</Text>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={S.sdEmptyComments}>
                    <MessageSquare color={theme.textMuted} size={24} />
                    <Text style={S.sdEmptyText}>Aucun commentaire</Text>
                    <Text style={S.sdEmptySubText}>Sois le premier à commenter !</Text>
                  </View>
                }
              />
            </View>

            {/* Comment input */}
            <View style={S.sdInputRow}>
              <TextInput
                style={S.sdInput}
                placeholder="Écrire un commentaire..."
                placeholderTextColor={theme.textMuted}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={sendComment}
                disabled={!commentText.trim() || sendingComment}
                style={[S.sdSendBtn, (!commentText.trim() || sendingComment) && { opacity: 0.4 }]}
              >
                {sendingComment
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Send color="#fff" size={16} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  };
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: theme.card,
    borderBottomWidth: isDark ? 1 : 0, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center' },
  wodCard: {
    margin: 16, backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
    ...cardShadow,
  },
  wodMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  blockBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: `${theme.accent}12`, borderWidth: 1, borderColor: `${theme.accent}25`,
  },
  blockBadgeText: { fontSize: 10, fontWeight: '700', color: theme.accent },
  timeCap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeCapText: { fontSize: 11, color: theme.textMuted },
  wodDate: { fontSize: 12, color: theme.textMuted, fontWeight: '500', textTransform: 'capitalize' },
  wodDesc: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  notesBox: { backgroundColor: theme.surface, borderRadius: 10, padding: 10, gap: 4 },
  notesLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5 },
  notesText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  myScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  myScoreLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '500' },
  myScoreValue: { fontSize: 20, fontWeight: '900', color: theme.text },
  myScoreRx: {
    fontSize: 11, fontWeight: '700', color: theme.success,
    backgroundColor: `${theme.success}12`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  myRankBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 },
  myRankText: { fontSize: 16, fontWeight: '900', color: theme.text },
  editScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 },
  editScoreBtnText: { fontSize: 12, color: theme.accent, fontWeight: '700' },
  enterScoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: theme.accent, borderRadius: 14, padding: 14, marginTop: 4,
  },
  enterScoreBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  expiredBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.surface, borderRadius: 12, padding: 12, marginTop: 4,
    borderWidth: 1, borderColor: theme.border,
  },
  expiredText: { fontSize: 12, color: theme.textMuted, fontWeight: '600', flex: 1 },
  section: { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12, letterSpacing: -0.2 },
  genderFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  genderChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  genderChipActive: { backgroundColor: `${theme.accent}15`, borderColor: theme.accent },
  genderChipText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  genderChipTextActive: { color: theme.accent },
  leaderboard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
    ...cardShadow,
  },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  leaderRowMe: { backgroundColor: `${theme.accent}08` },
  leaderRank: { width: 24, fontSize: 16, textAlign: 'center' },
  leaderAvatar: { width: 32, height: 32, borderRadius: 12, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  leaderAvatarText: { fontSize: 13, fontWeight: '700', color: theme.text },
  leaderMid: { flex: 1 },
  leaderName: { fontSize: 13, fontWeight: '700', color: theme.text },
  leaderElo: { fontSize: 10, color: theme.textSecondary, fontWeight: '700' },
  leaderSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  leaderMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  leaderMetaCount: { fontSize: 10, fontWeight: '700', color: theme.textMuted },
  leaderRight: { alignItems: 'flex-end' },
  leaderScore: { fontSize: 15, fontWeight: '900', color: theme.text, fontVariant: ['tabular-nums'] },
  leaderScoreGold: { color: theme.gold },
  modalContainer: { flex: 1, backgroundColor: theme.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  modalCloseText: { fontSize: 14, color: theme.accent, fontWeight: '700' },
  modalBody: { padding: 20, gap: 12 },
  modalWodName: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
  modalLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 1 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  typeChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  typeChipText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
  typeChipTextActive: { color: '#fff' },
  scoreInput: {
    backgroundColor: isDark ? theme.card : theme.background, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 18, color: theme.text, fontWeight: '700',
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, textAlign: 'center', fontSize: 22 },
  timeColon: { fontSize: 24, fontWeight: '700', color: theme.text },
  dnfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 4 },
  dnfCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: theme.surface,
  },
  dnfCheckActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  dnfCheckMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dnfLabel: { fontSize: 14, fontWeight: '600', color: theme.text },
  rxRow: { flexDirection: 'row', gap: 10 },
  rxChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    alignItems: 'center',
  },
  rxChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  rxChipActiveScaled: { backgroundColor: theme.warning, borderColor: theme.warning },
  rxChipText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
  rxChipTextActive: { color: '#fff' },
  submitBtn: {
    backgroundColor: theme.accent, borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Score Detail Modal ──
  sdContainer: { flex: 1, backgroundColor: theme.background },
  sdHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  sdTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  sdSub: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  sdScoreCard: {
    margin: 16, backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 12,
    ...cardShadow,
  },
  sdScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sdAvatar: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: theme.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  sdAvatarText: { fontSize: 16, fontWeight: '900', color: theme.text },
  sdAthleteName: { fontSize: 15, fontWeight: '700', color: theme.text },
  sdLevel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, letterSpacing: 0.5 },
  sdScoreValue: { fontSize: 22, fontWeight: '900', color: theme.accent },
  sdRxTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  sdRxText: { fontSize: 10, fontWeight: '700' },
  sdNotesBox: {
    backgroundColor: theme.surface, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: theme.border,
  },
  sdNotesText: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },

  // Reactions
  sdReactionsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  sdReactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: theme.border,
  },
  sdReactionChipMine: { borderColor: theme.accent, backgroundColor: `${theme.accent}12` },
  sdReactionEmoji: { fontSize: 16 },
  sdReactionCount: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  sdReactionCountMine: { color: theme.accent },

  // Emoji picker
  sdEmojiRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  sdEmojiToggle: { padding: 4 },
  sdEmojiGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1,
  },
  sdEmojiBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: theme.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  sdEmojiBtnText: { fontSize: 18 },
  sdQuickEmoji: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: theme.surface,
    justifyContent: 'center', alignItems: 'center',
  },

  // Comments
  sdCommentsTitle: {
    fontSize: 13, fontWeight: '700', color: theme.textMuted,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  sdCommentsList: { paddingHorizontal: 16, gap: 10, paddingBottom: 12 },
  sdComment: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  sdCommentMine: { borderColor: `${theme.accent}30` },
  sdCommentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sdCommentAvatar: {
    width: 24, height: 24, borderRadius: 8, backgroundColor: theme.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  sdCommentAvatarText: { fontSize: 10, fontWeight: '700', color: theme.text },
  sdCommentAuthor: { fontSize: 12, fontWeight: '700', color: theme.text, flex: 1 },
  sdCommentTime: { fontSize: 10, color: theme.textMuted },
  sdCommentContent: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginLeft: 32 },
  sdEmptyComments: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  sdEmptyText: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
  sdEmptySubText: { fontSize: 12, color: theme.textMuted },

  // Comment input
  sdInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.card,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
  },
  sdInput: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100,
    fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.border,
  },
  sdSendBtn: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: theme.accent,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Share Modal ──
  shareOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  shareContainer: {
    width: '100%', maxWidth: 400, backgroundColor: theme.card,
    borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: theme.border,
  },
  shareHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  shareTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
  sharePreview: {
    alignItems: 'center', justifyContent: 'center', padding: 16,
    transform: [{ scale: 0.28 }],
    height: 1920 * 0.28 + 32,
    marginTop: -1920 * 0.36 + 200,
    marginBottom: -1920 * 0.36 + 200,
  },
  shareCTA: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent, marginHorizontal: 20,
    borderRadius: 14, padding: 16,
  },
  shareCTAText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  shareSkip: { alignItems: 'center', paddingVertical: 16 },
  shareSkipText: { fontSize: 13, color: theme.textMuted, fontWeight: '600' },
}); }
