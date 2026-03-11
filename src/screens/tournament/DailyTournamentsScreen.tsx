import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
  ScrollView,
} from 'react-native';
import {
  ArrowLeft, Plus, Users, Clock, Zap, Trophy, ChevronRight, Flame,
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';

type Nav = NativeStackNavigationProp<any>;

interface DailyTournament {
  id: string;
  creator_id: string;
  wod_name: string;
  wod_type: string;
  duration: number;
  level: string;
  movements: string;
  scoring: string | null;
  score_mode: string;
  max_players: number;
  status: string;
  elo_reward: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  participant_count: number;
  has_joined: boolean;
  has_scored: boolean;
  creator_name: string;
}

const WOD_TYPES = ['For Time', 'AMRAP', 'EMOM'] as const;
const SCORE_MODES: { key: string; label: string }[] = [
  { key: 'time', label: 'Temps' },
  { key: 'reps', label: 'Reps' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'weight', label: 'Poids (kg)' },
];

export default function DailyTournamentsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  const [tournaments, setTournaments] = useState<DailyTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);

  // Create form
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('For Time');
  const [formDuration, setFormDuration] = useState('12');
  const [formLevel, setFormLevel] = useState('rx');
  const [formMovements, setFormMovements] = useState('');
  const [formScoreMode, setFormScoreMode] = useState('time');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('daily_tournaments')
      .select(`
        *,
        participants:daily_tournament_participants(user_id),
        scores:daily_tournament_scores(user_id),
        creator:profiles!creator_id(username)
      `)
      .in('status', ['open', 'active'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) { console.error(error); }

    const mapped: DailyTournament[] = (data ?? []).map((t: any) => ({
      ...t,
      participant_count: t.participants?.length ?? 0,
      has_joined: (t.participants ?? []).some((p: any) => p.user_id === user.id),
      has_scored: (t.scores ?? []).some((s: any) => s.user_id === user.id),
      creator_name: (Array.isArray(t.creator) ? t.creator[0] : t.creator)?.username ?? '—',
    }));

    setTournaments(mapped);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleJoin(tournamentId: string) {
    if (!user) return;
    const { error } = await supabase.from('daily_tournament_participants').insert({
      tournament_id: tournamentId,
      user_id: user.id,
    });
    if (error) {
      if (error.code === '23505') Alert.alert('Déjà inscrit', 'Tu participes déjà à ce mini-tournoi.');
      else Alert.alert('Erreur', error.message);
      return;
    }
    load();
  }

  async function handleCreate() {
    if (!user || !formName.trim() || !formMovements.trim()) return;
    setCreating(true);

    const { data, error } = await supabase.from('daily_tournaments').insert({
      creator_id: user.id,
      wod_name: formName.trim(),
      wod_type: formType,
      duration: parseInt(formDuration) || 12,
      level: formLevel,
      movements: formMovements.trim(),
      score_mode: formScoreMode,
      status: 'open',
      ends_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    setCreating(false);
    if (error) { Alert.alert('Erreur', error.message); return; }

    // Auto-join
    if (data) {
      await supabase.from('daily_tournament_participants').insert({
        tournament_id: data.id,
        user_id: user.id,
      });
    }

    setCreateModal(false);
    resetForm();
    load();
  }

  function resetForm() {
    setFormName('');
    setFormType('For Time');
    setFormDuration('12');
    setFormLevel('rx');
    setFormMovements('');
    setFormScoreMode('time');
  }

  function timeLeft(endsAt: string): string {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return 'Terminé';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  function renderTournament({ item }: { item: DailyTournament }) {
    const levelColor = LevelColors[item.level] ?? Colors.textMuted;
    const isFull = item.participant_count >= item.max_players;
    const remaining = timeLeft(item.ends_at);

    return (
      <TouchableOpacity
        style={S.card}
        onPress={() => navigation.navigate('DailyTournamentDetail', { tournamentId: item.id })}
        activeOpacity={0.8}
      >
        {/* Badges */}
        <View style={S.cardTop}>
          <View style={S.badges}>
            <View style={[S.badge, { backgroundColor: `${Colors.primary}12` }]}>
              <Text style={[S.badgeTxt, { color: Colors.primary }]}>{item.wod_type}</Text>
            </View>
            <View style={[S.badge, { backgroundColor: `${levelColor}20` }]}>
              <Text style={[S.badgeTxt, { color: levelColor }]}>{item.level.toUpperCase()}</Text>
            </View>
            {item.duration > 0 && (
              <View style={[S.badge, { backgroundColor: Colors.surface }]}>
                <Clock color={Colors.textMuted} size={9} />
                <Text style={[S.badgeTxt, { color: Colors.textMuted }]}>{item.duration}m</Text>
              </View>
            )}
          </View>
          <View style={[S.badge, { backgroundColor: remaining === 'Terminé' ? '#EF444420' : `${Colors.accent}15` }]}>
            <Flame color={remaining === 'Terminé' ? '#EF4444' : Colors.accent} size={9} />
            <Text style={[S.badgeTxt, { color: remaining === 'Terminé' ? '#EF4444' : Colors.accent }]}>{remaining}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={S.cardName}>{item.wod_name}</Text>
        <Text style={S.cardCreator}>par {item.creator_name}</Text>

        {/* Movements preview */}
        <Text style={S.cardMovements} numberOfLines={2}>{item.movements}</Text>

        {/* Footer */}
        <View style={S.cardFooter}>
          <View style={S.playersRow}>
            <Users color={Colors.textMuted} size={14} />
            <Text style={[S.playersTxt, isFull && { color: '#EF4444' }]}>
              {item.participant_count}/{item.max_players}
            </Text>
          </View>
          <View style={S.rewardRow}>
            <Trophy color={Colors.gold} size={13} />
            <Text style={S.rewardTxt}>+{item.elo_reward} ELO</Text>
          </View>
          {!item.has_joined && !isFull && (
            <TouchableOpacity
              style={S.joinBtn}
              onPress={(e) => { e.stopPropagation(); handleJoin(item.id); }}
              activeOpacity={0.8}
            >
              <Text style={S.joinBtnTxt}>Rejoindre</Text>
            </TouchableOpacity>
          )}
          {item.has_joined && !item.has_scored && (
            <View style={S.joinedBadge}>
              <Text style={S.joinedTxt}>Inscrit ✓</Text>
            </View>
          )}
          {item.has_scored && (
            <View style={[S.joinedBadge, { backgroundColor: `${Colors.gold}15` }]}>
              <Text style={[S.joinedTxt, { color: Colors.gold }]}>Score ✓</Text>
            </View>
          )}
          <ChevronRight color={Colors.textMuted} size={16} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={S.screen}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft color={Colors.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Mini-Tournois</Text>
        <TouchableOpacity onPress={() => setCreateModal(true)} hitSlop={12}>
          <Plus color={Colors.accent} size={22} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={S.statsRow}>
        <View style={S.statBox}>
          <Text style={S.statNum}>{tournaments.length}</Text>
          <Text style={S.statLabel}>Actifs</Text>
        </View>
        <View style={S.statBox}>
          <Text style={S.statNum}>{tournaments.filter(t => t.has_joined).length}</Text>
          <Text style={S.statLabel}>Mes inscrits</Text>
        </View>
        <View style={S.statBox}>
          <Text style={S.statNum}>{tournaments.filter(t => t.has_scored).length}</Text>
          <Text style={S.statLabel}>Scorés</Text>
        </View>
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={t => t.id}
          renderItem={renderTournament}
          contentContainerStyle={S.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={S.emptyEmoji}>⚡</Text>
              <Text style={S.emptyTitle}>Aucun mini-tournoi en cours</Text>
              <Text style={S.emptySub}>Crée le premier et défie la communauté !</Text>
              <TouchableOpacity style={S.emptyBtn} onPress={() => setCreateModal(true)} activeOpacity={0.8}>
                <Plus color="#fff" size={16} />
                <Text style={S.emptyBtnTxt}>Créer un mini-tournoi</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Create modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>Nouveau mini-tournoi</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <Text style={S.label}>Nom du WOD</Text>
              <TextInput style={S.input} value={formName} onChangeText={setFormName} placeholder="Ex: Flash Burner" placeholderTextColor={Colors.textMuted} />

              <Text style={S.label}>Type</Text>
              <View style={S.chipRow}>
                {WOD_TYPES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setFormType(t)} activeOpacity={0.7}
                    style={[S.chip, formType === t && S.chipSel]}>
                    <Text style={[S.chipTxt, formType === t && S.chipTxtSel]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.label}>Durée (min)</Text>
              <TextInput style={S.input} value={formDuration} onChangeText={setFormDuration} keyboardType="numeric" placeholder="12" placeholderTextColor={Colors.textMuted} />

              <Text style={S.label}>Niveau</Text>
              <View style={S.chipRow}>
                {Object.keys(LevelColors).map(l => (
                  <TouchableOpacity key={l} onPress={() => setFormLevel(l)} activeOpacity={0.7}
                    style={[S.chip, formLevel === l && { backgroundColor: `${LevelColors[l]}15`, borderColor: LevelColors[l] }]}>
                    <Text style={[S.chipTxt, formLevel === l && { color: LevelColors[l], fontWeight: '900' }]}>{l.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.label}>Mode de score</Text>
              <View style={S.chipRow}>
                {SCORE_MODES.map(m => (
                  <TouchableOpacity key={m.key} onPress={() => setFormScoreMode(m.key)} activeOpacity={0.7}
                    style={[S.chip, formScoreMode === m.key && S.chipSel]}>
                    <Text style={[S.chipTxt, formScoreMode === m.key && S.chipTxtSel]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.label}>Mouvements</Text>
              <TextInput
                style={[S.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={formMovements}
                onChangeText={setFormMovements}
                multiline
                placeholder="21-15-9&#10;Thrusters (43/30 kg)&#10;Pull-ups"
                placeholderTextColor={Colors.textMuted}
              />
            </ScrollView>

            <TouchableOpacity
              style={[S.createBtn, (!formName.trim() || !formMovements.trim() || creating) && { opacity: 0.5 }]}
              onPress={handleCreate}
              disabled={!formName.trim() || !formMovements.trim() || creating}
              activeOpacity={0.85}
            >
              {creating ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Zap color="#fff" size={16} />
                  <Text style={S.createBtnTxt}>Lancer le mini-tournoi</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setCreateModal(false)} style={S.cancelBtn}>
              <Text style={S.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.text },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statBox: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, marginTop: 2 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, marginTop: 8,
  },
  emptyBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  card: {
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  badgeTxt: { fontSize: 9, fontWeight: '800' },
  cardName: { fontSize: 17, fontWeight: '900', color: Colors.text },
  cardCreator: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
  cardMovements: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  playersRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playersTxt: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rewardTxt: { fontSize: 11, fontWeight: '800', color: Colors.gold },
  joinBtn: {
    marginLeft: 'auto', backgroundColor: Colors.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  joinBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  joinedBadge: {
    marginLeft: 'auto', backgroundColor: `${Colors.accent}15`, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  joinedTxt: { fontSize: 11, fontWeight: '800', color: Colors.accent },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40, gap: 10,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5, marginTop: 8 },
  input: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    padding: 12, fontSize: 14, color: Colors.text, marginTop: 4,
  },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipSel: { backgroundColor: `${Colors.accent}15`, borderColor: Colors.accent },
  chipTxt: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  chipTxtSel: { color: Colors.accent, fontWeight: '900' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, padding: 14, marginTop: 8,
  },
  createBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelTxt: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
