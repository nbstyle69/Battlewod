/**
 * Historique des séries de musculation réalisées (lot 4), sous les 1RM.
 *
 * C'est l'endroit qui donne son sens au chiffre affiché juste au-dessus : un
 * record sans provenance n'est auditable par personne — ni par l'athlète qui se
 * demande d'où sort ce 1RM, ni par le coach. La série qui a établi le record
 * porte donc une marque, et cette marque vient de l'`id` stocké dans le profil
 * (clé `<catégorie>_<mouvement>_src`), pas d'un rapprochement par date : deux
 * séances le même jour rendraient ce rapprochement faux sans le dire.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme, AppTheme } from '../../context/ThemeContext';
import { StrengthSession } from '../../services/strengthSets';

interface Props {
  sessions: StrengthSession[];
  /** ids de séries qui ont établi un record, lus dans profiles.personal_records. */
  prSourceIds: Set<string>;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function StrengthHistory({ sessions, prSourceIds }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);

  return (
    <View style={S.wrap}>
      <Text style={S.title}>SÉRIES RÉALISÉES</Text>
      {sessions.length === 0 ? (
        <Text style={S.empty}>
          Aucune série enregistrée pour l'instant. Les blocs de musculation que tu valides
          depuis un WOD ou un programme apparaîtront ici, série par série.
        </Text>
      ) : (
        sessions.map(s => {
          const establishedPr = s.sets.some(set => prSourceIds.has(set.id));
          return (
            <View key={s.key} style={S.session}>
              <View style={S.head}>
                <Text style={S.movement}>{s.movementLabel ?? s.movement}</Text>
                <Text style={S.date}>{formatDay(s.performedAt)}</Text>
              </View>
              <Text style={S.source} numberOfLines={1}>
                {s.sourceTitle ?? 'Séance supprimée'}
                {' · '}
                {s.sourceType === 'program' ? 'programme' : 'WOD de box'}
              </Text>
              {s.sets.map(set => (
                <View key={set.id} style={S.row}>
                  <Text style={S.setLabel}>Série {set.setIndex}</Text>
                  <Text style={S.setValue}>
                    {set.reps} reps{set.loadKg != null ? ` × ${set.loadKg} kg` : ''}
                  </Text>
                  {prSourceIds.has(set.id) && <Text style={S.prTag}>1RM</Text>}
                </View>
              ))}
              {establishedPr && (
                <Text style={S.prNote}>Ton 1RM affiché vient de cette séance.</Text>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  wrap: { marginTop: 20 },
  title: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 8 },
  empty: { fontSize: 13, color: theme.textMuted, lineHeight: 19 },
  session: {
    backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    padding: 14, marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  movement: { fontSize: 14, fontWeight: '700', color: theme.text, flexShrink: 1 },
  date: { fontSize: 12, color: theme.textMuted },
  source: { fontSize: 11, color: theme.textMuted, marginTop: 2, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  setLabel: { fontSize: 12, color: theme.textMuted, width: 66 },
  setValue: { fontSize: 13, color: theme.text, fontWeight: '600' },
  prTag: {
    fontSize: 10, fontWeight: '800', color: theme.accent, borderWidth: 1, borderColor: theme.accent,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  prNote: { fontSize: 11, color: theme.textSecondary, marginTop: 8 },
});
