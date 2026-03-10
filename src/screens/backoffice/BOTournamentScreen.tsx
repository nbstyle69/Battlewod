import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, Linking,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Trophy, Clock, CheckCircle, XCircle, Youtube,
  ChevronDown, ChevronUp, Bot, BarChart2, Lock, Zap,
  RotateCcw, AlertTriangle, Users, UserX, Star,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';
import {
  TournamentScore, MOVEMENT_BADGE_LEVELS,
  rankWodScores, cfPoints, calcTournamentElo,
  normalizeMovement, formatDateTime,
} from '../../utils/tournamentUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const color = status === 'pending' ? Colors.warning
    : status === 'validated' ? Colors.success : Colors.error;
  const label = status === 'pending' ? 'En attente' : status === 'validated' ? 'Validé' : 'Rejeté';
  return (
    <View style={[pill.wrap, { backgroundColor: `${color}20` }]}>
      <Text style={[pill.txt, { color }]}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  txt:  { fontSize: 11, fontWeight: '800' },
});

// ═════════════════════════════════════════════════════════════════════════════
export default function BOTournamentScreen() {
  const navigation = useNavigation();
  const { currentBox } = useAuth();

  const [tournaments,     setTournaments]     = useState<any[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [scores,          setScores]          = useState<TournamentScore[]>([]);
  const [wods,            setWods]            = useState<any[]>([]);
  const [participants,    setParticipants]    = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [tab,             setTab]             = useState<'leaderboard' | 'participants' | 'validate'>('leaderboard');
  const [filterStatus,    setFilterStatus]    = useState<'all' | 'pending' | 'validated' | 'rejected'>('all');
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [rankFrom,        setRankFrom]        = useState('1');
  const [rankTo,          setRankTo]          = useState('');
  const [closingTourn,    setClosingTourn]    = useState(false);
  const [aiLoading,       setAiLoading]       = useState<string | null>(null);
  const [rejectModal,     setRejectModal]     = useState<TournamentScore | null>(null);
  const [rejectReason,    setRejectReason]    = useState('');
  const [aiModal,         setAiModal]         = useState<{ score: TournamentScore; analysis: string } | null>(null);

  // ── Load tournaments list ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentBox) { setLoading(false); return; }
    supabase.from('tournaments')
      .select('id, name, status')
      .eq('box_id', currentBox.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTournaments(data ?? []);
        if (data && data.length > 0) setSelectedId(data[0].id);
        setLoading(false);
      });
  }, [currentBox]);

  // ── Load tournament data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedId) return;
    const [{ data: sc }, { data: tw }, { data: tp }] = await Promise.all([
      supabase.from('tournament_scores')
        .select('*, profile:profiles!athlete_id(username, level, elo), tw:tournament_wods(title, type, movements), t:tournaments(name)')
        .eq('tournament_id', selectedId)
        .order('submitted_at', { ascending: false }),
      supabase.from('tournament_wods').select('*').eq('tournament_id', selectedId).order('order_index'),
      supabase.from('tournament_participants')
        .select('athlete_id, score, created_at, profile:profiles!athlete_id(id, username, elo, level, box_members(box:boxes(name)))')
        .eq('tournament_id', selectedId)
        .order('created_at', { ascending: true }),
    ]);
    setScores(((sc ?? []) as any[]).map((s: any) => ({
      ...s,
      profile: Array.isArray(s.profile) ? s.profile[0] : s.profile,
      tw:      Array.isArray(s.tw)      ? s.tw[0]      : s.tw,
    })) as TournamentScore[]);
    setWods(tw ?? []);
    setParticipants((tp ?? []).map((p: any) => ({
      ...p,
      profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
    })));
    setRankTo(String((tp ?? []).length));
    setRefreshing(false);
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = {
    total:     scores.length,
    pending:   scores.filter(s => s.status === 'pending').length,
    validated: scores.filter(s => s.status === 'validated').length,
    rejected:  scores.filter(s => s.status === 'rejected').length,
  };

  const selectedTourn = tournaments.find(t => t.id === selectedId);

  // ── Kick participant
  async function handleKick(athleteId: string, username: string) {
    Alert.alert(
      'Exclure le participant',
      `Exclure ${username} du tournoi ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Exclure', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('tournament_participants')
            .delete()
            .eq('tournament_id', selectedId!)
            .eq('athlete_id', athleteId);
          if (error) { Alert.alert('Erreur', error.message); return; }
          loadData();
        }},
      ]
    );
  }

  // ── Recalc leaderboard ────────────────────────────────────────────────────
  async function recalcLeaderboard() {
    if (!selectedId) return;
    const { data: allScores } = await supabase.from('tournament_scores')
      .select('*').eq('tournament_id', selectedId).eq('status', 'validated');
    if (!allScores) return;

    const pointsMap: Record<string, number> = {};
    wods.forEach(wod => {
      const ranked = rankWodScores(allScores as TournamentScore[], wod.type);
      ranked.forEach(rs => {
        pointsMap[rs.athlete_id] = (pointsMap[rs.athlete_id] ?? 0) + rs.cfPoints;
      });
    });
    for (const [athleteId, points] of Object.entries(pointsMap)) {
      await supabase.from('tournament_participants')
        .update({ score: points })
        .eq('tournament_id', selectedId)
        .eq('athlete_id', athleteId);
    }
  }

  // ── Validate score ────────────────────────────────────────────────────────
  async function handleValidate(score: TournamentScore) {
    Alert.alert('Valider ce score ?', `${score.profile?.username} — ${score.score_value}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Valider', onPress: async () => {
        const { error } = await supabase.from('tournament_scores').update({
          status: 'validated', validated_at: new Date().toISOString(),
        }).eq('id', score.id);
        if (error) { Alert.alert('Erreur', error.message); return; }

        // Update movement rep counts + badges
        const movements: string[] = (score.tw as any)?.movements ?? [];
        const newBadges: string[] = [];
        for (const movement of movements) {
          const match = movement.match(/^(\d+)\s+(.+)$/);
          if (!match) continue;
          const reps = parseInt(match[1]);
          const { key, label } = normalizeMovement(match[2]);

          const { data: existing } = await supabase.from('movement_rep_counts')
            .select('id, total_reps').eq('athlete_id', score.athlete_id).eq('movement_key', key).maybeSingle();

          const newTotal = (existing?.total_reps ?? 0) + reps;
          if (existing) {
            await supabase.from('movement_rep_counts')
              .update({ total_reps: newTotal, last_updated: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await supabase.from('movement_rep_counts')
              .insert({ athlete_id: score.athlete_id, movement_key: key, movement_label: label, total_reps: newTotal });
          }
          for (const tier of MOVEMENT_BADGE_LEVELS) {
            if (newTotal >= tier.reps && (existing?.total_reps ?? 0) < tier.reps) {
              const badgeKey = `movement_${key}_level_${tier.level}`;
              await supabase.from('athlete_badges')
                .upsert({ athlete_id: score.athlete_id, badge_key: badgeKey }, { onConflict: 'athlete_id,badge_key', ignoreDuplicates: true });
              newBadges.push(`${tier.emoji} ${label} ${tier.label}`);
            }
          }
        }

        await recalcLeaderboard();
        const msg = newBadges.length > 0
          ? `\n\n🏅 Nouveau badge pour ${score.profile?.username} :\n${newBadges.join('\n')}`
          : '';
        Alert.alert('✅ Score validé !', `Score de ${score.profile?.username} validé.${msg}`);
        loadData();
      }},
    ]);
  }

  // ── Reject score ──────────────────────────────────────────────────────────
  async function confirmReject() {
    if (!rejectModal) return;
    const { error } = await supabase.from('tournament_scores').update({
      status: 'rejected', notes: rejectReason || null,
    }).eq('id', rejectModal.id);
    setRejectModal(null);
    setRejectReason('');
    if (error) { Alert.alert('Erreur', error.message); return; }
    loadData();
  }

  // ── AI analysis ───────────────────────────────────────────────────────────
  async function runAI(score: TournamentScore) {
    setAiLoading(score.id);
    try {
      const prompt = `Tu es un coach CrossFit expert qui évalue la crédibilité des scores de compétition.

IMPORTANT : Tu n'as pas accès à la vidéo. Tu évalues uniquement la vraisemblance du score déclaré sur la base des données textuelles.

Données du score :
🏆 Tournoi : ${selectedTourn?.name ?? ''}
🏋️ WOD : ${score.tw?.title ?? ''} (${score.tw?.type ?? ''})
🔢 Score déclaré : ${score.score_value}${score.tiebreak_value != null ? `\n🔗 Tie-break : ${score.tiebreak_value} reps` : ''}
👤 Athlète : ${score.profile?.username ?? ''} (Niveau ${score.profile?.level ?? ''}, ELO ${score.profile?.elo ?? ''})
📝 Notes : ${score.notes ?? 'Aucune'}

Évalue ce score en 4 points :
1. **Vraisemblance** : cohérence avec le niveau, ELO et type de WOD.
2. **Points d'attention** : éléments à vérifier sur la vidéo (range of motion, no-reps, standards).
3. **Verdict** : VRAISEMBLABLE / À VÉRIFIER / SUSPECT — avec justification courte.
4. **Priorité de révision** : HAUTE / NORMALE / BASSE.

Rappelle en fin de réponse que la validation finale requiert la révision manuelle de la vidéo.
Réponds en français, sois concis et factuel.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const analysis = data.content?.map((c: any) => c.text ?? '').join('\n') ?? 'Analyse indisponible.';
      await supabase.from('tournament_scores').update({ ai_analysis: analysis }).eq('id', score.id);
      setAiLoading(null);
      setAiModal({ score: { ...score, ai_analysis: analysis }, analysis });
      loadData();
    } catch (e: any) {
      setAiLoading(null);
      Alert.alert('Erreur IA', e?.message ?? 'Impossible de contacter l\'API.');
    }
  }

  // ── Close tournament + ELO ────────────────────────────────────────────────
  async function handleCloseTournament() {
    if (!selectedId) return;
    if (stats.pending > 0) {
      Alert.alert('Scores en attente', `${stats.pending} score(s) non traité(s). Valide ou rejette-les d'abord.`);
      return;
    }
    Alert.alert(
      'Clôturer le tournoi ?',
      'Les points ELO seront calculés et distribués. Action irréversible.',
      [{ text: 'Annuler', style: 'cancel' }, {
        text: 'Clôturer', style: 'destructive', onPress: async () => {
          setClosingTourn(true);
          const { data: tp } = await supabase.from('tournament_participants')
            .select('athlete_id, score, profile:profiles!athlete_id(id, username, elo)')
            .eq('tournament_id', selectedId).order('score', { ascending: false });
          if (!tp || tp.length === 0) { setClosingTourn(false); return; }

          const getProfile = (p: any) => Array.isArray(p.profile) ? p.profile[0] : p.profile;
          const avgElo = Math.round(tp.reduce((sum: number, p: any) => sum + (getProfile(p)?.elo ?? 1000), 0) / tp.length);
          const eloChanges: { name: string; rank: number; change: number }[] = [];

          for (let i = 0; i < tp.length; i++) {
            const p = tp[i];
            const prof = getProfile(p);
            const athleteElo = prof?.elo ?? 1000;
            const rank = i + 1;
            const change = calcTournamentElo(athleteElo, rank, tp.length, avgElo);
            const newElo = Math.max(100, athleteElo + change);
            await supabase.from('profiles').update({ elo: newElo }).eq('id', p.athlete_id);
            await supabase.from('tournament_elo_history').upsert({
              tournament_id: selectedId, athlete_id: p.athlete_id,
              final_rank: rank, participants_count: tp.length,
              avg_opponent_elo: avgElo, elo_before: athleteElo,
              elo_after: newElo, elo_change: change,
            }, { onConflict: 'tournament_id,athlete_id' });
            eloChanges.push({ name: prof?.username ?? '?', rank, change });
          }
          await supabase.from('tournaments').update({ status: 'completed' }).eq('id', selectedId);
          setClosingTourn(false);

          const recap = eloChanges.slice(0, 5).map(e =>
            `${e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`} ${e.name}: ${e.change >= 0 ? '+' : ''}${e.change} ELO`
          ).join('\n');
          Alert.alert('✅ Tournoi clôturé !', `ELO distribué :\n\n${recap}\n${eloChanges.length > 5 ? `...et ${eloChanges.length - 5} autres` : ''}`);
          loadData();
        },
      }],
    );
  }

  // ── Build leaderboard ─────────────────────────────────────────────────────
  function buildLeaderboard() {
    const pointsMap: Record<string, { name: string; level: string; elo: number; totalPts: number; wodResults: Record<string, { rank: number; pts: number }> }> = {};
    participants.forEach(p => {
      pointsMap[p.athlete_id] = { name: p.profile?.username ?? '?', level: p.profile?.level ?? 'rx', elo: p.profile?.elo ?? 1000, totalPts: 0, wodResults: {} };
    });
    wods.forEach(wod => {
      const wodScores = scores.filter(s => s.tournament_wod_id === wod.id);
      const ranked = rankWodScores(wodScores, wod.type);
      ranked.forEach(rs => {
        if (!pointsMap[rs.athlete_id]) return;
        pointsMap[rs.athlete_id].totalPts += rs.cfPoints;
        pointsMap[rs.athlete_id].wodResults[wod.id] = { rank: rs.rank, pts: rs.cfPoints };
      });
    });
    const rows = Object.entries(pointsMap)
      .map(([athleteId, data]) => ({ athleteId, ...data }))
      .sort((a, b) => b.totalPts - a.totalPts);
    const from = Math.max(1, parseInt(rankFrom) || 1) - 1;
    const to   = parseInt(rankTo) || rows.length;
    return rows.slice(from, to);
  }

  // ── Filtered scores ───────────────────────────────────────────────────────
  const filteredScores = filterStatus === 'all' ? scores : scores.filter(s => s.status === filterStatus);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={s.loadingWrap}><ActivityIndicator size="large" color={Colors.primary} /></View>
  );

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <LinearGradient colors={['#12121A', '#0A0A0F']} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={s.headerTexts}>
          <Text style={s.headerLabel}>BACK OFFICE</Text>
          <Text style={s.headerTitle}>Tournois & Scores</Text>
        </View>
        {stats.pending > 0 && (
          <View style={s.pendingBadge}><Text style={s.pendingBadgeTxt}>{stats.pending}</Text></View>
        )}
      </LinearGradient>

      {/* ── Tournament selector ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tournamentScroll} contentContainerStyle={s.tournamentScrollContent}>
        {tournaments.map(t => {
          const pendingCount = t.id === selectedId ? stats.pending : 0;
          return (
            <TouchableOpacity key={t.id} onPress={() => setSelectedId(t.id)}
              style={[s.tournamentChip, t.id === selectedId && s.tournamentChipActive]}>
              <Text style={[s.tournamentChipTxt, t.id === selectedId && s.tournamentChipTxtActive]}>
                {t.name}
              </Text>
              {pendingCount > 0 && (
                <View style={s.chipBadge}><Text style={s.chipBadgeTxt}>{pendingCount}</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Stats ── */}
      <View style={s.statsRow}>
        {[
          { label: 'Total',     value: stats.total,     color: Colors.textSecondary },
          { label: 'Attente',   value: stats.pending,   color: Colors.warning },
          { label: 'Validés',   value: stats.validated, color: Colors.success },
          { label: 'Rejetés',   value: stats.rejected,  color: Colors.error },
        ].map(stat => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* ══ Tabs ══ */}
      <View style={s.tabs}>
        {(['leaderboard', 'participants', 'validate'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]} numberOfLines={1}>
              {t === 'leaderboard' ? '🏆 Classement'
                : t === 'participants' ? `👥 (${participants.length})`
                : `⚖️${stats.pending > 0 ? ` (${stats.pending})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}>

        {/* ══ LEADERBOARD ══ */}
        {tab === 'leaderboard' && (
          <>
            {/* Rank filter */}
            <View style={s.rankFilterRow}>
              <Text style={s.rankFilterLabel}>Du rang</Text>
              <TextInput style={s.rankFilterInput} value={rankFrom} onChangeText={setRankFrom} keyboardType="numeric" />
              <Text style={s.rankFilterLabel}>au rang</Text>
              <TextInput style={s.rankFilterInput} value={rankTo} onChangeText={setRankTo} keyboardType="numeric" />
              <TouchableOpacity onPress={() => { setRankFrom('1'); setRankTo(String(participants.length)); }} style={s.rankResetBtn}>
                <RotateCcw color={Colors.textMuted} size={14} />
              </TouchableOpacity>
            </View>

            {/* Recalc button */}
            <TouchableOpacity style={s.recalcBtn} onPress={async () => { await recalcLeaderboard(); await loadData(); Alert.alert('✅', 'Classement recalculé.'); }} activeOpacity={0.8}>
              <RotateCcw color={Colors.primary} size={14} />
              <Text style={s.recalcTxt}>Recalculer le classement</Text>
            </TouchableOpacity>

            {/* Table */}
            {buildLeaderboard().length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>🏆</Text>
                <Text style={s.emptyTxt}>Aucun participant dans ce filtre.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  {/* Header row */}
                  <View style={[s.tableRow, s.tableHeaderRow]}>
                    <Text style={[s.tableCell, s.colRank, s.tableHeaderTxt]}>#</Text>
                    <Text style={[s.tableCell, s.colName, s.tableHeaderTxt]}>Athlète</Text>
                    {wods.map(w => (
                      <Text key={w.id} style={[s.tableCell, s.colWod, s.tableHeaderTxt]} numberOfLines={1}>
                        {w.title.slice(0, 8)}
                      </Text>
                    ))}
                    <Text style={[s.tableCell, s.colTotal, s.tableHeaderTxt]}>Total</Text>
                  </View>
                  {buildLeaderboard().map((row, i) => {
                    const levelColor = LevelColors[row.level] ?? Colors.primary;
                    return (
                      <View key={row.athleteId} style={[s.tableRow, i % 2 === 0 ? s.tableRowEven : s.tableRowOdd]}>
                        <View style={[s.tableCell, s.colRank]}>
                          {i === 0 ? <Text style={s.rankEmoji}>🥇</Text>
                            : i === 1 ? <Text style={s.rankEmoji}>🥈</Text>
                            : i === 2 ? <Text style={s.rankEmoji}>🥉</Text>
                            : <Text style={s.rankNumTxt}>#{i + 1}</Text>}
                        </View>
                        <View style={[s.tableCell, s.colName]}>
                          <Text style={s.athleteName} numberOfLines={1}>{row.name}</Text>
                          <View style={[s.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                            <Text style={[s.levelBadgeTxt, { color: levelColor }]}>{row.level.toUpperCase()}</Text>
                          </View>
                        </View>
                        {wods.map(w => {
                          const res = row.wodResults[w.id];
                          const bg  = !res ? 'transparent' : res.rank === 1 ? `${Colors.success}20` : res.rank <= 3 ? `${Colors.gold}15` : 'transparent';
                          return (
                            <View key={w.id} style={[s.tableCell, s.colWod, { backgroundColor: bg }]}>
                              {res
                                ? <Text style={s.wodCell}>{`${res.rank === 1 ? '🥇' : res.rank === 2 ? '🥈' : res.rank === 3 ? '🥉' : `#${res.rank}`} ${res.pts}pts`}</Text>
                                : <Text style={s.wodCellEmpty}>—</Text>}
                            </View>
                          );
                        })}
                        <View style={[s.tableCell, s.colTotal]}>
                          <Text style={s.totalPts}>{row.totalPts}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {/* Close tournament button */}
            {selectedTourn?.status !== 'completed' && (
              <TouchableOpacity style={s.closeBtn} onPress={handleCloseTournament}
                disabled={closingTourn} activeOpacity={0.85}>
                {closingTourn
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Lock color="#fff" size={16} /><Text style={s.closeBtnTxt}>Clôturer le tournoi</Text></>}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ══ PARTICIPANTS ══ */}
        {tab === 'participants' && (
          <>
            <View style={s.partHeader}>
              <Users color={Colors.primary} size={14} />
              <Text style={s.partHeaderTxt}>{participants.length} inscrits — admin : exclure en appuyant sur 🗑</Text>
            </View>
            {participants.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>👥</Text>
                <Text style={s.emptyTxt}>Aucun inscrit pour ce tournoi.</Text>
              </View>
            ) : participants.map((p: any) => {
              const levelColor = LevelColors[p.profile?.level ?? ''] ?? Colors.primary;
              const boxName = p.profile?.box_members?.[0]?.box?.name ?? null;
              const regDate = p.created_at
                ? new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
              return (
                <View key={p.athlete_id} style={s.partRow}>
                  <View style={[s.partAvatar, { backgroundColor: `${levelColor}25` }]}>
                    <Text style={[s.partAvatarTxt, { color: levelColor }]}>
                      {(p.profile?.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.partInfo}>
                    <View style={s.partNameRow}>
                      <Text style={s.partName}>{p.profile?.username ?? '?'}</Text>
                      {p.profile?.level && (
                        <View style={[s.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                          <Text style={[s.levelBadgeTxt, { color: levelColor }]}>
                            {p.profile.level.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={s.partMeta}>
                      <Star color={Colors.gold} size={10} />
                      <Text style={s.partMetaTxt}>ELO {p.profile?.elo ?? 1000}</Text>
                      {boxName && (
                        <><Text style={s.partMetaDot}>·</Text>
                        <Text style={s.partMetaTxt}>{boxName}</Text></>
                      )}
                    </View>
                    <Text style={s.partDate}>Inscrit le {regDate}</Text>
                  </View>
                  <TouchableOpacity style={s.kickBtn}
                    onPress={() => handleKick(p.athlete_id, p.profile?.username ?? '?')}
                    activeOpacity={0.7}>
                    <UserX color={Colors.error} size={16} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {/* ══ VALIDATE ══ */}
        {tab === 'validate' && (
          <>
            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {(['all', 'pending', 'validated', 'rejected'] as const).map(f => (
                <TouchableOpacity key={f} onPress={() => setFilterStatus(f)}
                  style={[s.filterChip, filterStatus === f && s.filterChipActive]}>
                  <Text style={[s.filterChipTxt, filterStatus === f && s.filterChipTxtActive]}>
                    {f === 'all' ? 'Tous' : f === 'pending' ? `En attente (${stats.pending})` : f === 'validated' ? 'Validés' : 'Rejetés'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredScores.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyEmoji}>📋</Text>
                <Text style={s.emptyTxt}>Aucun score dans cette catégorie.</Text>
              </View>
            ) : filteredScores.map(score => {
              const isExpanded = expandedId === score.id;
              const levelColor = LevelColors[score.profile?.level ?? ''] ?? Colors.primary;
              return (
                <View key={score.id} style={s.scoreCard}>
                  {/* Card header (always visible) */}
                  <TouchableOpacity
                    style={s.scoreCardHeader}
                    onPress={() => setExpandedId(isExpanded ? null : score.id)}
                    activeOpacity={0.8}>
                    <View style={[s.scoreAvatar, { backgroundColor: `${levelColor}20` }]}>
                      <Text style={[s.scoreAvatarTxt, { color: levelColor }]}>
                        {(score.profile?.username ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.scoreCardInfo}>
                      <View style={s.scoreCardRow}>
                        <Text style={s.scoreAthleteNm}>{score.profile?.username ?? '?'}</Text>
                        <View style={[s.levelBadge, { backgroundColor: `${levelColor}20` }]}>
                          <Text style={[s.levelBadgeTxt, { color: levelColor }]}>
                            {(score.profile?.level ?? 'rx').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.scoreWodNm} numberOfLines={1}>{score.tw?.title ?? ''} · {score.tw?.type ?? ''}</Text>
                      <View style={s.scoreCardRow}>
                        <Text style={s.scoreDate}>{formatDateTime(score.submitted_at)}</Text>
                        <Text style={s.scoreValue}>{score.score_value}</Text>
                      </View>
                    </View>
                    <View style={s.scoreCardRight}>
                      <StatusPill status={score.status} />
                      {isExpanded
                        ? <ChevronUp color={Colors.textMuted} size={16} />
                        : <ChevronDown color={Colors.textMuted} size={16} />}
                    </View>
                  </TouchableOpacity>

                  {/* Expandable body */}
                  {isExpanded && (
                    <View style={s.scoreCardBody}>
                      {score.notes ? (
                        <View style={s.scoreNote}>
                          <Text style={s.scoreNoteLabel}>Notes athlète</Text>
                          <Text style={s.scoreNoteTxt}>{score.notes}</Text>
                        </View>
                      ) : null}
                      {score.tiebreak_value != null && (
                        <Text style={s.tiebreakTxt}>🔗 Tie-break : {score.tiebreak_value} reps</Text>
                      )}
                      {score.deadline_at && (
                        <Text style={s.deadlineTxt}>
                          <Clock color={Colors.textMuted} size={12} /> Deadline : {formatDateTime(score.deadline_at)}
                        </Text>
                      )}

                      {/* YouTube */}
                      {score.video_url ? (
                        <TouchableOpacity style={s.ytBtn} onPress={() => Linking.openURL(score.video_url!)} activeOpacity={0.85}>
                          <Youtube color="#FF0000" size={16} />
                          <Text style={s.ytBtnTxt}>Voir la vidéo YouTube</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={s.ytWarning}>
                          <AlertTriangle color={Colors.error} size={14} />
                          <Text style={s.ytWarningTxt}>Aucun lien vidéo soumis</Text>
                        </View>
                      )}

                      {/* AI analysis preview */}
                      {score.ai_analysis ? (
                        <View style={s.aiPreview}>
                          <Text style={s.aiPreviewLabel}>🤖 Analyse IA</Text>
                          <Text style={s.aiPreviewTxt} numberOfLines={3}>{score.ai_analysis}</Text>
                          <TouchableOpacity onPress={() => setAiModal({ score, analysis: score.ai_analysis! })}>
                            <Text style={s.aiPreviewMore}>Voir tout →</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {/* Action buttons */}
                      {score.status === 'pending' && (
                        <View style={s.actionRow}>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${Colors.success}15`, borderColor: `${Colors.success}30` }]}
                            onPress={() => handleValidate(score)} activeOpacity={0.8}>
                            <CheckCircle color={Colors.success} size={16} />
                            <Text style={[s.actionBtnTxt, { color: Colors.success }]}>Valider</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${Colors.error}15`, borderColor: `${Colors.error}30` }]}
                            onPress={() => { setRejectModal(score); setRejectReason(''); }} activeOpacity={0.8}>
                            <XCircle color={Colors.error} size={16} />
                            <Text style={[s.actionBtnTxt, { color: Colors.error }]}>Rejeter</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${Colors.primary}10`, borderColor: `${Colors.primary}20`, flex: 1.2 }]}
                            onPress={() => runAI(score)} disabled={aiLoading === score.id} activeOpacity={0.8}>
                            {aiLoading === score.id
                              ? <ActivityIndicator size="small" color={Colors.primary} />
                              : <><Bot color={Colors.primary} size={15} /><Text style={[s.actionBtnTxt, { color: Colors.primary }]}>Évaluation du score</Text></>}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Reject modal ── */}
      <Modal visible={!!rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Rejeter le score</Text>
            <Text style={s.modalSub}>{rejectModal?.profile?.username} — {rejectModal?.score_value}</Text>
            <TextInput
              style={s.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Motif du rejet (optionnel)"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <TouchableOpacity style={s.rejectConfirmBtn} onPress={confirmReject} activeOpacity={0.85}>
              <Text style={s.rejectConfirmTxt}>Confirmer le rejet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRejectModal(null)}>
              <Text style={s.modalCancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── AI analysis modal ── */}
      <Modal visible={!!aiModal} transparent animationType="slide" onRequestClose={() => setAiModal(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>🤖 Évaluation du score</Text>
            <Text style={s.modalSub}>{aiModal?.score.profile?.username} — {aiModal?.score.score_value}</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <Text style={s.aiAnalysisTxt}>{aiModal?.analysis}</Text>
            </ScrollView>
            <View style={[s.aiWarningBox, { marginTop: 12 }]}>
              <AlertTriangle color={Colors.warning} size={14} />
              <Text style={s.aiWarningTxt}>
                Analyse basée sur le score déclaré uniquement — vérification vidéo manuelle obligatoire.
              </Text>
            </View>
            {aiModal?.score.video_url ? (
              <TouchableOpacity style={s.ytBtn} onPress={() => Linking.openURL(aiModal!.score.video_url!)} activeOpacity={0.85}>
                <Youtube color="#FF0000" size={16} />
                <Text style={s.ytBtnTxt}>Voir la vidéo</Text>
              </TouchableOpacity>
            ) : null}
            {aiModal?.score.status === 'pending' && (
              <View style={s.actionRow}>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${Colors.success}15`, borderColor: `${Colors.success}30` }]}
                  onPress={() => { setAiModal(null); if (aiModal) handleValidate(aiModal.score); }} activeOpacity={0.8}>
                  <CheckCircle color={Colors.success} size={16} />
                  <Text style={[s.actionBtnTxt, { color: Colors.success }]}>Valider</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: `${Colors.error}15`, borderColor: `${Colors.error}30` }]}
                  onPress={() => { setAiModal(null); if (aiModal) { setRejectModal(aiModal.score); setRejectReason(''); } }} activeOpacity={0.8}>
                  <XCircle color={Colors.error} size={16} />
                  <Text style={[s.actionBtnTxt, { color: Colors.error }]}>Rejeter</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setAiModal(null)}>
              <Text style={s.modalCancelTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },

  header:      { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backTxt:     { fontSize: 22, color: '#fff' },
  headerTexts: { flex: 1 },
  headerLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  pendingBadge:    { backgroundColor: Colors.warning, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeTxt: { fontSize: 13, fontWeight: '900', color: '#fff' },

  tournamentScroll:        { backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tournamentScrollContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tournamentChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tournamentChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tournamentChipTxt:       { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  tournamentChipTxtActive: { color: '#fff' },
  chipBadge:    { backgroundColor: Colors.warning, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  chipBadgeTxt: { fontSize: 10, fontWeight: '900', color: '#fff' },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  statCard:  { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.cardBorder },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', marginTop: 2 },

  tabs:       { flexDirection: 'row', backgroundColor: Colors.card, marginHorizontal: 12, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 4 },
  tab:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive:  { backgroundColor: Colors.primary },
  tabTxt:     { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  tabTxtActive:{ color: '#fff' },

  content: { padding: 12, paddingTop: 8 },

  rankFilterRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rankFilterLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  rankFilterInput: { backgroundColor: Colors.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '800', color: Colors.text, borderWidth: 1, borderColor: Colors.border, width: 48, textAlign: 'center' },
  rankResetBtn:    { padding: 6 },
  recalcBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, marginBottom: 12 },
  recalcTxt:       { fontSize: 12, fontWeight: '700', color: Colors.primary },

  tableRow:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableHeaderRow: { backgroundColor: Colors.surface },
  tableRowEven:   { backgroundColor: Colors.card },
  tableRowOdd:    { backgroundColor: Colors.background },
  tableCell:      { paddingHorizontal: 8, paddingVertical: 10, justifyContent: 'center' },
  tableHeaderTxt: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8 },
  colRank:   { width: 48 },
  colName:   { width: 120, gap: 3 },
  colWod:    { width: 90, borderRadius: 4 },
  colTotal:  { width: 70 },
  rankEmoji: { fontSize: 18 },
  rankNumTxt:{ fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  athleteName:    { fontSize: 12, fontWeight: '800', color: Colors.text },
  levelBadge:     { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  levelBadgeTxt:  { fontSize: 9, fontWeight: '800' },
  wodCell:        { fontSize: 11, fontWeight: '700', color: Colors.text },
  wodCellEmpty:   { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  totalPts:       { fontSize: 15, fontWeight: '900', color: Colors.primary, textAlign: 'center' },

  closeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.error, borderRadius: 14, padding: 15, marginTop: 16 },
  closeBtnTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },

  filterRow:       { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  filterChip:      { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive:{ backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipTxt:   { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  filterChipTxtActive: { color: '#fff' },

  scoreCard:       { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, marginBottom: 10, overflow: 'hidden' },
  scoreCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  scoreAvatar:     { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scoreAvatarTxt:  { fontSize: 18, fontWeight: '900' },
  scoreCardInfo:   { flex: 1, gap: 3 },
  scoreCardRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreAthleteNm:  { fontSize: 14, fontWeight: '800', color: Colors.text },
  scoreWodNm:      { fontSize: 11, color: Colors.textMuted },
  scoreDate:       { fontSize: 11, color: Colors.textMuted },
  scoreValue:      { fontSize: 14, fontWeight: '900', color: Colors.primary },
  scoreCardRight:  { alignItems: 'flex-end', gap: 6 },

  scoreCardBody: { padding: 12, paddingTop: 0, gap: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  scoreNote:     { backgroundColor: Colors.surface, borderRadius: 10, padding: 10, gap: 4 },
  scoreNoteLabel:{ fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1 },
  scoreNoteTxt:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  tiebreakTxt:   { fontSize: 12, color: Colors.textSecondary },
  deadlineTxt:   { fontSize: 12, color: Colors.textMuted },

  ytBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${Colors.error}10`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${Colors.error}20` },
  ytBtnTxt:     { fontSize: 13, fontWeight: '700', color: '#FF0000' },
  ytWarning:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${Colors.error}10`, borderRadius: 8, padding: 10 },
  ytWarningTxt: { fontSize: 12, color: Colors.error, fontWeight: '600' },

  aiPreview:      { backgroundColor: `${Colors.primary}08`, borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: `${Colors.primary}15` },
  aiPreviewLabel: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
  aiPreviewTxt:   { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  aiPreviewMore:  { fontSize: 12, color: Colors.primary, fontWeight: '700', marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 10, borderWidth: 1 },
  actionBtnTxt:  { fontSize: 12, fontWeight: '800' },

  emptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTxt:   { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  partHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${Colors.primary}10`, borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: `${Colors.primary}20` },
  partHeaderTxt: { fontSize: 12, color: Colors.primary, fontWeight: '600', flex: 1 },
  partRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.cardBorder },
  partAvatar:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  partAvatarTxt: { fontSize: 18, fontWeight: '900' },
  partInfo:      { flex: 1, gap: 2 },
  partNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partName:      { fontSize: 14, fontWeight: '800', color: Colors.text },
  partMeta:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  partMetaTxt:   { fontSize: 11, color: Colors.textSecondary },
  partMetaDot:   { fontSize: 11, color: Colors.textMuted },
  partDate:      { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  kickBtn:       { width: 34, height: 34, borderRadius: 9, backgroundColor: `${Colors.error}12`, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: `${Colors.error}30` },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  modalTitle:     { fontSize: 17, fontWeight: '900', color: Colors.text },
  modalSub:       { fontSize: 13, color: Colors.textMuted },
  rejectInput:    { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, fontSize: 13, color: Colors.text, borderWidth: 1, borderColor: Colors.border, minHeight: 80, textAlignVertical: 'top' },
  rejectConfirmBtn:{ backgroundColor: Colors.error, borderRadius: 14, padding: 15, alignItems: 'center' },
  rejectConfirmTxt:{ color: '#fff', fontSize: 15, fontWeight: '900' },
  modalCancelBtn: { alignItems: 'center', padding: 12 },
  modalCancelTxt: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },

  aiAnalysisTxt: { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
  aiWarningBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${Colors.warning}12`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${Colors.warning}25` },
  aiWarningTxt:  { fontSize: 12, color: Colors.warning, lineHeight: 18, flex: 1 },
});
