import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { ChevronLeft, ChevronRight, Check, Clock, StickyNote } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { WODScore } from '../../types';
import { formatCap, formatScoreValue } from '../../utils/scoreFormat';
import { annotateStrengthLoads } from '../../utils/strengthBlock';
import { useMyOneRepMax } from '../../hooks/useMyOneRepMax';
import { listProgramWods, ProgramWod } from '../../services/programContent';

const WOD_TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444',
  amrap: '#3B82F6',
  emom: '#8B5CF6',
  strength: '#16A34A',
  custom: '#6B7280',
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Lundi (ISO) de la semaine d'une date `YYYY-MM-DD`, au même format. */
function lundiDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const jour = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - jour);
  return d.toISOString().slice(0, 10);
}

function libelleSemaine(lundi: string): string {
  const d = new Date(lundi + 'T00:00:00');
  const fin = new Date(d);
  fin.setDate(fin.getDate() + 6);
  const fmt = (x: Date) => `${x.getDate()}/${x.getMonth() + 1}`;
  return `${fmt(d)} – ${fmt(fin)}`;
}

export default function ProgramDetailScreen({ navigation, route }: any) {
  const { programId, programTitle, startDate, progType, durationWeeks, daysPerWeek } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const oneRepMaxFor = useMyOneRepMax();

  const dpw = daysPerWeek ?? 5;

  const [wods, setWods] = useState<ProgramWod[]>([]);
  const [scores, setScores] = useState<Record<string, WODScore>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Une lecture refusée ou en panne ne doit pas ressembler à « pas de séance » :
  // c'est exactement ce qui a laissé l'athlète devant une page vide sans signal.
  const [erreur, setErreur] = useState<string | null>(null);

  const [selected, setSelected] = useState<ProgramWod | null>(null);

  const load = useCallback(async () => {
    setErreur(null);
    try {
      const list = await listProgramWods(programId);
      setWods(list);

      if (user && list.length > 0) {
        const { data: scoreData, error } = await supabase
          .from('wod_scores')
          .select('id, wod_id, member_id, score_type, score_value, rx, capped, notes, submitted_at')
          .eq('member_id', user.id)
          .in('wod_id', list.map(w => w.id));
        if (error) throw error;
        const map: Record<string, WODScore> = {};
        for (const s of scoreData ?? []) {
          if (s.wod_id) map[s.wod_id] = s as WODScore;
        }
        setScores(map);
      } else {
        setScores({});
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      captureError(e, { screen: 'ProgramDetail', action: 'load' });
      setErreur(message);
    }
    setLoading(false);
    setRefreshing(false);
  }, [programId, user]);

  useEffect(() => { load(); }, [load]);

  // Les semaines existantes viennent du contenu réellement publié, pas d'un
  // compteur théorique : une semaine sans séance ne s'invente pas.
  const semaines = useMemo(() => {
    const parLundi = new Map<string, ProgramWod[]>();
    for (const w of wods) {
      const lundi = lundiDe(w.scheduled_date);
      const liste = parLundi.get(lundi);
      if (liste) liste.push(w); else parLundi.set(lundi, [w]);
    }
    return [...parLundi.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([lundi, liste]) => ({ lundi, wods: liste }));
  }, [wods]);

  const [weekIdx, setWeekIdx] = useState(0);

  // On ouvre sur la semaine en cours si le programme en a une, sinon sur la
  // première publiée — un athlète qui achète après le début tombe sur du
  // contenu, jamais sur du vide.
  useEffect(() => {
    if (semaines.length === 0) return;
    const lundiAujourdhui = lundiDe(new Date().toISOString().slice(0, 10));
    const idx = semaines.findIndex(s => s.lundi >= lundiAujourdhui);
    setWeekIdx(idx >= 0 ? idx : semaines.length - 1);
  }, [semaines]);

  const semaine = semaines[weekIdx];
  const lundiAujourdhui = lundiDe(new Date().toISOString().slice(0, 10));

  const wodsDuJour = (offset: number) => {
    if (!semaine) return [];
    const d = new Date(semaine.lundi + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    return semaine.wods.filter(w => w.scheduled_date === iso);
  };

  const doneCount = Object.keys(scores).length;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle} numberOfLines={1}>{programTitle}</Text>
          <Text style={S.headerSub}>
            {progType === 'fixed' ? `${durationWeeks ?? semaines.length} semaines · ${dpw}j/sem` : `Ongoing · ${dpw}j/sem`}
            {startDate ? ` · depuis le ${startDate.split('-').reverse().join('/')}` : ''}
            {doneCount > 0 ? ` · ${doneCount} WOD${doneCount > 1 ? 's' : ''} fait${doneCount > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
      </View>

      {semaines.length > 0 && (
        <View style={S.weekNav}>
          <TouchableOpacity onPress={() => setWeekIdx(w => Math.max(0, w - 1))} style={S.weekArrow} disabled={weekIdx === 0}>
            <ChevronLeft color={weekIdx === 0 ? theme.textMuted : theme.text} size={20} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={S.weekLabel}>
              Semaine {weekIdx + 1} / {semaines.length} · {libelleSemaine(semaine.lundi)}
            </Text>
            {semaine.lundi === lundiAujourdhui && <Text style={S.weekNow}>Semaine en cours</Text>}
          </View>
          <TouchableOpacity
            onPress={() => setWeekIdx(w => Math.min(semaines.length - 1, w + 1))}
            style={S.weekArrow}
            disabled={weekIdx >= semaines.length - 1}
          >
            <ChevronRight color={weekIdx >= semaines.length - 1 ? theme.textMuted : theme.text} size={20} />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
      ) : erreur ? (
        <View style={S.emptyBlock}>
          <Text style={S.emptyTitle}>Programmation indisponible</Text>
          <Text style={S.emptyText}>{erreur}</Text>
          <TouchableOpacity style={S.retryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={S.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : semaines.length === 0 ? (
        <View style={S.emptyBlock}>
          <Text style={S.emptyTitle}>Aucune séance publiée</Text>
          <Text style={S.emptyText}>
            Ton coach n'a pas encore publié de séance sur ce programme. Elles apparaîtront ici dès
            qu'il les mettra en ligne.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {DAY_LABELS.map((label, i) => {
            const dayWods = wodsDuJour(i);
            const isRest = dayWods.length === 0;
            return (
              <View key={label} style={S.dayBlock}>
                <View style={S.dayHeader}>
                  <Text style={S.dayLabel}>{label}</Text>
                  {isRest && <Text style={S.restBadge}>Repos</Text>}
                </View>
                {dayWods.map(w => {
                  const tc = WOD_TYPE_COLORS[w.wod_type ?? 'custom'] ?? '#6B7280';
                  const score = scores[w.id];
                  return (
                    <TouchableOpacity key={w.id} style={S.wodRow} onPress={() => setSelected(w)} activeOpacity={0.7}>
                      <View style={[S.wodTypeBar, { backgroundColor: tc }]} />
                      <View style={S.wodContent}>
                        <Text style={S.wodType}>{(w.wod_type ?? 'WOD').toUpperCase()}</Text>
                        <Text style={S.wodTitle}>{w.title}</Text>
                        <Text style={S.wodDesc} numberOfLines={2}>{w.description}</Text>
                      </View>
                      {score ? (
                        <View style={S.doneChip}>
                          <Check color={theme.success} size={12} />
                          <Text style={S.doneText}>
                            {formatScoreValue(score.score_value, score.score_type, score.capped)}
                          </Text>
                        </View>
                      ) : (
                        <ChevronRight color={theme.textMuted} size={16} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <View style={S.modalContainer}>
          <View style={S.modalHeader}>
            <Text style={S.modalTitle} numberOfLines={1}>{selected?.title}</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={S.modalCancel}>Fermer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={S.modalBody}>
            <View style={S.detailBadges}>
              <View style={[S.typeBadge, { backgroundColor: `${WOD_TYPE_COLORS[selected?.wod_type ?? 'custom'] ?? '#6B7280'}22` }]}>
                <Text style={[S.typeBadgeText, { color: WOD_TYPE_COLORS[selected?.wod_type ?? 'custom'] ?? '#6B7280' }]}>
                  {(selected?.wod_type ?? 'WOD').toUpperCase()}
                </Text>
              </View>
              {!!selected?.time_cap_seconds && (
                <View style={S.metaBadge}>
                  <Clock color={theme.textSecondary} size={13} />
                  <Text style={S.metaBadgeText}>Cap {formatCap(selected.time_cap_seconds)}</Text>
                </View>
              )}
            </View>

            <Text style={S.sectionLabel}>SÉANCE</Text>
            <Text style={S.detailDesc}>
              {annotateStrengthLoads(selected?.description ?? '', oneRepMaxFor)}
            </Text>

            {!!selected?.notes && (
              <>
                <View style={S.noteHeader}>
                  <StickyNote color={theme.accent} size={14} />
                  <Text style={S.sectionLabel}>NOTES COACH</Text>
                </View>
                <Text style={S.detailNotes}>{selected.notes}</Text>
              </>
            )}

            {selected && scores[selected.id] && (
              <View style={S.myScoreCard}>
                <Text style={S.myScoreLabel}>TON RÉSULTAT</Text>
                <Text style={S.myScoreValue}>
                  {formatScoreValue(
                    scores[selected.id].score_value,
                    scores[selected.id].score_type,
                    scores[selected.id].capped,
                  )}{scores[selected.id].rx ? ' · RX' : ''}
                </Text>
              </View>
            )}

            {/* La saisie de score, la grille de force, les 1RM et le classement
                vivent dans l'écran de WOD : un seul chemin de score, celui du
                contenu canonique. Dupliquer ici ferait diverger les deux. */}
            <TouchableOpacity
              style={S.logBtn}
              activeOpacity={0.85}
              onPress={() => {
                const wodId = selected?.id;
                setSelected(null);
                if (wodId) navigation.navigate('WODDetail', { wodId });
              }}
            >
              <Text style={S.logBtnText}>
                {selected && scores[selected.id] ? 'Voir / modifier mon résultat' : 'Ouvrir la séance'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background },

    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 50, paddingBottom: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: t.border },
    back: { padding: 6 },
    headerTitle: { fontSize: 17, fontWeight: '800', color: t.text },
    headerSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },

    weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
    weekArrow: { padding: 8 },
    weekLabel: { fontSize: 15, fontWeight: '800', color: t.text },
    weekNow: { fontSize: 11, color: t.accent, fontWeight: '700', marginTop: 2 },

    emptyBlock: { padding: 24, alignItems: 'center', gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: t.text, marginTop: 24 },
    emptyText: { fontSize: 14, color: t.textSecondary, textAlign: 'center', lineHeight: 20 },
    retryBtn: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: t.border },
    retryText: { color: t.text, fontWeight: '700', fontSize: 14 },

    dayBlock: { paddingHorizontal: 16, paddingTop: 16 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    dayLabel: { fontSize: 13, fontWeight: '800', color: t.textSecondary, letterSpacing: 0.3 },
    restBadge: { fontSize: 11, color: t.textMuted, fontWeight: '600' },

    wodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: t.border },
    wodTypeBar: { width: 4, alignSelf: 'stretch' },
    wodContent: { flex: 1, padding: 12 },
    wodType: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5 },
    wodTitle: { fontSize: 15, fontWeight: '700', color: t.text, marginTop: 2 },
    wodDesc: { fontSize: 13, color: t.textSecondary, marginTop: 2 },
    doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.success}18`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 12 },
    doneText: { fontSize: 12, fontWeight: '700', color: t.success },

    modalContainer: { flex: 1, backgroundColor: t.background },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: t.border, gap: 12 },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: t.text },
    modalCancel: { fontSize: 15, color: t.accent, fontWeight: '600' },
    modalBody: { padding: 16, paddingBottom: 60 },

    detailBadges: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    typeBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
    metaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    metaBadgeText: { fontSize: 12, fontWeight: '600', color: t.textSecondary },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.5, marginBottom: 6 },
    detailDesc: { fontSize: 15, color: t.text, lineHeight: 22, marginBottom: 16 },
    noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    detailNotes: { fontSize: 14, color: t.textSecondary, lineHeight: 20, marginBottom: 16, fontStyle: 'italic' },

    myScoreCard: { backgroundColor: `${t.success}12`, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: `${t.success}30` },
    myScoreLabel: { fontSize: 11, fontWeight: '700', color: t.success, letterSpacing: 0.5 },
    myScoreValue: { fontSize: 20, fontWeight: '800', color: t.text, marginTop: 2 },

    logBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    logBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
