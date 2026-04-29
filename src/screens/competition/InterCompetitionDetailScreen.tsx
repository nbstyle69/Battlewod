import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import {
  ChevronRight, Globe2, Users, Calendar, Trophy,
  Dumbbell, Lock, Clock, CheckCircle2, XCircle, UserPlus,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'InterCompetitionDetail'>;
type Route = RouteProp<CompetitionStackParamList, 'InterCompetitionDetail'>;

const TABS = ['Infos', 'WODs', 'Inscription', 'Classement'] as const;
type Tab = typeof TABS[number];

const FORMAT_LABEL: Record<string, string> = {
  league: 'Ligue', bracket: 'Élimination', pool: 'Poules', swiss: 'Suisse',
};

export default function InterCompetitionDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { competitionId } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [tab, setTab] = useState<Tab>('Infos');
  const [comp, setComp]               = useState<any>(null);
  const [wods, setWods]               = useState<any[]>([]);
  const [myReg, setMyReg]             = useState<any>(null);
  const [myTeam, setMyTeam]           = useState<any>(null);
  const [standings, setStandings]     = useState<any[]>([]);
  const [myScores, setMyScores]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [registering, setRegistering] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const realtimeRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
    const [{ data: c }, { data: w }, { data: s }] = await Promise.all([
      supabase.from('inter_competitions').select('*').eq('id', competitionId).single(),
      supabase.from('inter_competition_wods').select('*').eq('competition_id', competitionId).order('order_index'),
      supabase.from('inter_standings').select('*').eq('competition_id', competitionId).order('rank'),
    ]);
    setComp(c);
    setWods(w ?? []);
    setStandings(s ?? []);

    if (user) {
      const [{ data: reg }, { data: sc }, { data: tm }] = await Promise.all([
        supabase.from('inter_registrations')
          .select('*').eq('competition_id', competitionId).eq('athlete_id', user.id).maybeSingle(),
        supabase.from('inter_scores')
          .select('*, wod:inter_competition_wods(title, order_index)')
          .eq('competition_id', competitionId).eq('athlete_id', user.id),
        supabase.from('inter_teams')
          .select('*').eq('competition_id', competitionId).eq('captain_id', user.id).maybeSingle(),
      ]);
      setMyReg(reg);
      setMyTeam(tm);
      setMyScores((sc ?? []).map((x: any) => ({ ...x, wod: Array.isArray(x.wod) ? x.wod[0] : x.wod })));
    }
    } catch (e) { captureError(e, { screen: 'InterCompetitionDetail', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [competitionId, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime: refresh standings on new validated score
  useEffect(() => {
    const channel = supabase
      .channel(`inter_scores_${competitionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inter_scores', filter: `competition_id=eq.${competitionId}` }, () => {
        load();
      })
      .subscribe();
    realtimeRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [competitionId]);

  async function handleRegister() {
    if (!user) return;
    setRegistering(true);
    const { error } = await supabase.from('inter_registrations').insert({
      competition_id: competitionId,
      athlete_id: user.id,
      box_id: null,
    });
    if (error) {
      Alert.alert('Erreur', error.code === '23505' ? 'Tu es déjà inscrit.' : error.message);
    } else {
      await load();
    }
    setRegistering(false);
  }

  async function handleUnregister() {
    if (!myReg) return;
    Alert.alert('Se désinscrire', 'Es-tu sûr de vouloir te désinscrire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer', style: 'destructive',
        onPress: async () => {
          await supabase.from('inter_registrations').delete().eq('id', myReg.id);
          await load();
        },
      },
    ]);
  }

  const isRevealed = (w: any) => w.revealed_at && w.revealed_at <= new Date().toISOString();
  const myScoreForWod = (wodId: string) => myScores.find(s => s.wod_id === wodId);
  const now = new Date().toISOString();

  if (loading) return (
    <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );
  if (!comp) return (
    <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
      <Text style={{ color: theme.textMuted }}>Compétition introuvable.</Text>
    </View>
  );

  const canRegister = comp.status === 'open' || comp.status === 'active';

  return (
    <View style={S.container}>
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronRight size={22} color={theme.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <View style={S.headerIcon}>
          <Globe2 size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle} numberOfLines={1}>{comp.title}</Text>
          <Text style={S.headerSub}>
            {FORMAT_LABEL[comp.format] ?? comp.format} · {comp.type === 'individual' ? 'Individuel' : `Équipe ×${comp.team_size}`}
          </Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={S.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[S.tabItem, tab === t && S.tabActive]} onPress={() => setTab(t)}>
            <Text style={[S.tabText, tab === t && S.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
      >

        {/* ── INFOS ── */}
        {tab === 'Infos' && (
          <View style={{ gap: 16 }}>
            {comp.description ? (
              <View style={S.infoCard}>
                <Text style={S.infoLabel}>À propos</Text>
                <Text style={S.infoText}>{comp.description}</Text>
              </View>
            ) : null}

            <View style={S.infoCard}>
              <Text style={S.infoLabel}>Détails</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {[
                  { icon: Trophy,   label: 'Format',    val: FORMAT_LABEL[comp.format] ?? comp.format },
                  { icon: Users,    label: 'Type',      val: comp.type === 'individual' ? 'Individuel' : `Équipe de ${comp.team_size}` },
                  { icon: Users,    label: 'Inscrits',  val: comp.max_participants ? `${myReg ? '✓ ' : ''}/ ${comp.max_participants} max` : 'Illimité' },
                  { icon: Calendar, label: 'Début',     val: comp.starts_at ? new Date(comp.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                  { icon: Calendar, label: 'Fin',       val: comp.ends_at   ? new Date(comp.ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                ].map(({ icon: Icon, label, val }) => (
                  <View key={label} style={S.detailRow}>
                    <Icon size={14} color={theme.textMuted} />
                    <Text style={S.detailLabel}>{label}</Text>
                    <Text style={S.detailVal}>{val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {comp.rules ? (
              <View style={S.infoCard}>
                <Text style={S.infoLabel}>Règlement</Text>
                <Text style={S.infoText}>{comp.rules}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── WODs ── */}
        {tab === 'WODs' && (
          <View style={{ gap: 12 }}>
            {wods.length === 0 ? (
              <View style={S.empty}>
                <Dumbbell size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>Les WODs seront révélés prochainement.</Text>
              </View>
            ) : (
              wods.map(w => {
                const revealed = isRevealed(w);
                const myScore  = myScoreForWod(w.id);
                return (
                  <View key={w.id} style={[S.wodCard, !revealed && S.wodLocked]}>
                    <View style={S.wodHeader}>
                      <View style={S.wodNum}>
                        <Text style={S.wodNumText}>W{w.order_index}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.wodTitle, !revealed && { color: theme.textMuted }]}>
                          {revealed ? w.title : `WOD ${w.order_index} — Non révélé`}
                        </Text>
                        {!revealed && w.revealed_at ? (
                          <Text style={S.wodRevealDate}>
                            Révélé le {new Date(w.revealed_at).toLocaleString('fr-FR')}
                          </Text>
                        ) : null}
                      </View>
                      {!revealed && <Lock size={16} color={theme.textMuted} />}
                    </View>

                    {revealed && w.description ? (
                      <Text style={S.wodDesc}>{w.description}</Text>
                    ) : null}

                    {revealed && (
                      <View style={S.wodMeta}>
                        {w.time_cap ? (
                          <View style={S.metaChip}>
                            <Clock size={11} color={theme.textMuted} />
                            <Text style={S.metaChipText}>{w.time_cap} min cap</Text>
                          </View>
                        ) : null}
                        <View style={S.metaChip}>
                          <Text style={S.metaChipText}>{w.scoring_type}</Text>
                        </View>
                      </View>
                    )}

                    {/* My score or submit button */}
                    {revealed && myReg && (
                      myScore ? (
                        <View style={[S.scoreChip, { backgroundColor: myScore.status === 'validated' ? `${theme.success}15` : myScore.status === 'rejected' ? `${theme.error}15` : `${theme.accent}15` }]}>
                          <Text style={[S.scoreChipVal, { color: myScore.status === 'validated' ? theme.success : myScore.status === 'rejected' ? theme.error : theme.accent }]}>
                            {myScore.score_display ?? myScore.score_value}
                          </Text>
                          <Text style={[S.scoreChipStatus, { color: myScore.status === 'validated' ? theme.success : myScore.status === 'rejected' ? theme.error : theme.textMuted }]}>
                            {myScore.status === 'validated' ? '✓ Validé' : myScore.status === 'rejected' ? '✗ Rejeté' : '⏳ En attente'}
                          </Text>
                        </View>
                      ) : comp.status !== 'closed' ? (
                        <TouchableOpacity
                          style={S.submitBtn}
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('InterScoreSubmit', {
                            competitionId,
                            wodId: w.id,
                            wodTitle: w.title,
                            wodDescription: w.description ?? '',
                            timeCap: w.time_cap,
                            scoringType: w.scoring_type,
                            existingScore: null,
                          })}
                        >
                          <Trophy size={15} color="#fff" />
                          <Text style={S.submitBtnText}>Soumettre mon score</Text>
                        </TouchableOpacity>
                      ) : null
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── INSCRIPTION ── */}
        {tab === 'Inscription' && (
          <View style={{ gap: 16 }}>
            {/* TEAM competition */}
            {comp.type === 'team' ? (
              <>
                {myTeam ? (
                  <View style={S.registeredCard}>
                    <CheckCircle2 size={28} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.registeredTitle}>Équipe « {myTeam.name} »</Text>
                      <Text style={S.registeredSub}>Tu es capitaine de cette équipe.</Text>
                    </View>
                  </View>
                ) : myReg ? (
                  <View style={S.registeredCard}>
                    <CheckCircle2 size={28} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.registeredTitle}>Tu es dans une équipe !</Text>
                      <Text style={S.registeredSub}>Consulte l'onglet WODs pour soumettre tes scores.</Text>
                    </View>
                  </View>
                ) : null}
                {canRegister && (
                  <TouchableOpacity
                    style={S.registerBtn}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('InterTeam', { competitionId, teamSize: comp.team_size })}
                  >
                    <UserPlus size={18} color="#fff" />
                    <Text style={S.registerBtnText}>{myTeam ? 'Gérer mon équipe' : 'Créer / rejoindre une équipe'}</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              /* INDIVIDUAL competition */
              myReg ? (
                <View style={S.registeredCard}>
                  <CheckCircle2 size={28} color={theme.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.registeredTitle}>Tu es inscrit !</Text>
                    <Text style={S.registeredSub}>Consulte l'onglet WODs pour soumettre tes scores.</Text>
                  </View>
                </View>
              ) : canRegister ? (
                <TouchableOpacity style={S.registerBtn} activeOpacity={0.85} onPress={handleRegister} disabled={registering}>
                  {registering
                    ? <ActivityIndicator color="#fff" />
                    : <>
                      <Globe2 size={18} color="#fff" />
                      <Text style={S.registerBtnText}>S'inscrire à cette compétition</Text>
                    </>
                  }
                </TouchableOpacity>
              ) : (
                <View style={S.closedBox}>
                  <XCircle size={28} color={theme.textMuted} />
                  <Text style={S.closedText}>Les inscriptions sont fermées.</Text>
                </View>
              )
            )}

            <View style={S.infoCard}>
              <Text style={S.infoLabel}>Comment ça marche</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {[
                  '1. Inscris-toi ci-dessus',
                  '2. Les 3 WODs seront révélés progressivement',
                  '3. Lance le timer, filme ta performance',
                  '4. Soumets ton score + vidéo YouTube',
                  '5. Le Super Admin valide — le classement se met à jour',
                ].map(step => (
                  <Text key={step} style={S.infoText}>{step}</Text>
                ))}
              </View>
            </View>

            {myReg && comp.status !== 'closed' && (
              <TouchableOpacity style={S.unregisterBtn} activeOpacity={0.8} onPress={handleUnregister}>
                <Text style={S.unregisterBtnText}>Se désinscrire</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── CLASSEMENT ── */}
        {tab === 'Classement' && (
          <View style={{ gap: 16 }}>
            {wods.length === 0 ? (
              <View style={S.empty}>
                <Trophy size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>Aucun WOD disponible.</Text>
              </View>
            ) : wods.filter(w => isRevealed(w)).map(w => {
              const ws = standings.filter(s => s.wod_id === w.id);
              return (
                <View key={w.id} style={S.rankCard}>
                  <View style={S.rankHeader}>
                    <View style={S.wodNum}>
                      <Text style={S.wodNumText}>W{w.order_index}</Text>
                    </View>
                    <Text style={S.rankTitle}>{w.title}</Text>
                  </View>
                  {ws.length === 0 ? (
                    <Text style={S.noScores}>Aucun score validé pour ce WOD.</Text>
                  ) : (
                    ws.map(s => (
                      <View key={s.athlete_id ?? s.team_id}
                        style={[S.rankRow, s.rank <= 3 && { backgroundColor: `${theme.accent}08` }]}>
                        <Text style={[S.rankNum, {
                          color: s.rank === 1 ? '#C9A227' : s.rank === 2 ? '#9CA3AF' : s.rank === 3 ? '#B45309' : theme.textMuted,
                        }]}>
                          {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.rankName, s.athlete_id === user?.id && { color: theme.accent }]}>
                            {s.username ?? '—'}{s.athlete_id === user?.id ? ' (moi)' : ''}
                          </Text>
                          <Text style={S.rankBox}>{s.box_name ?? 'Box inconnue'}</Text>
                        </View>
                        <Text style={S.rankScore}>{s.score_display ?? s.score_value}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
            {wods.filter(w => isRevealed(w)).length === 0 && (
              <View style={S.empty}>
                <Trophy size={40} color={theme.textMuted} />
                <Text style={S.emptyText}>Le classement sera visible une fois les WODs révélés.</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn:    { padding: 4 },
    headerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#C9A22720', justifyContent: 'center', alignItems: 'center' },
    headerTitle:{ fontSize: 17, fontWeight: '800', color: theme.text },
    headerSub:  { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    tabBar: {
      flexDirection: 'row', backgroundColor: theme.card,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    tabItem:      { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive:    { borderBottomColor: theme.accent },
    tabText:      { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    tabTextActive:{ color: theme.accent, fontWeight: '700' },
    content: { padding: 16 },
    infoCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, padding: 16,
    },
    infoLabel: { fontSize: 11, fontWeight: '800', color: theme.accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    infoText:  { fontSize: 13, color: theme.textMuted, lineHeight: 20 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel:{ fontSize: 12, color: theme.textMuted, width: 60 },
    detailVal:  { fontSize: 12, fontWeight: '700', color: theme.text, flex: 1 },
    wodCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, padding: 16,
    },
    wodLocked: { opacity: 0.6 },
    wodHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    wodNum:    { width: 34, height: 34, borderRadius: 10, backgroundColor: '#C9A22715', justifyContent: 'center', alignItems: 'center' },
    wodNumText:{ fontSize: 12, fontWeight: '900', color: '#C9A227' },
    wodTitle:  { fontSize: 15, fontWeight: '700', color: theme.text },
    wodRevealDate: { fontSize: 11, color: theme.accent, marginTop: 2 },
    wodDesc:   { fontSize: 13, color: theme.textMuted, lineHeight: 19, marginBottom: 10 },
    wodMeta:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
    metaChip:  { flexDirection: 'row', gap: 4, backgroundColor: theme.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
    metaChipText: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' },
    scoreChip: { borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    scoreChipVal:    { fontSize: 16, fontWeight: '900' },
    scoreChipStatus: { fontSize: 11, fontWeight: '700' },
    submitBtn: {
      flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#C9A227', borderRadius: 12, padding: 12, marginTop: 4,
    },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    registeredCard: {
      flexDirection: 'row', gap: 12, alignItems: 'center',
      backgroundColor: `${theme.success}12`, borderRadius: 16,
      borderWidth: 1, borderColor: `${theme.success}30`, padding: 16,
    },
    registeredTitle:{ fontSize: 16, fontWeight: '800', color: theme.text },
    registeredSub:  { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    registerBtn: {
      flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#C9A227', borderRadius: 16, padding: 18,
    },
    registerBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    closedBox: {
      flexDirection: 'row', gap: 12, alignItems: 'center',
      backgroundColor: theme.surface, borderRadius: 16, padding: 16,
    },
    closedText: { fontSize: 14, fontWeight: '600', color: theme.textMuted },
    unregisterBtn: {
      alignItems: 'center', padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    unregisterBtnText: { fontSize: 13, fontWeight: '600', color: theme.error ?? '#EF4444' },
    rankCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
    },
    rankHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    rankTitle:  { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1 },
    rankRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
    rankNum:    { width: 32, textAlign: 'center', fontSize: 14, fontWeight: '900' },
    rankName:   { fontSize: 13, fontWeight: '700', color: theme.text },
    rankBox:    { fontSize: 11, color: theme.textMuted },
    rankScore:  { fontSize: 14, fontWeight: '900', color: '#C9A227' },
    noScores:   { fontSize: 13, color: theme.textMuted, padding: 14 },
    empty:      { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  });
}
