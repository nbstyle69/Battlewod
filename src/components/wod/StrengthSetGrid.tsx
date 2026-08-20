/**
 * Grille de saisie des séries de musculation — une ligne par série (lot 4).
 *
 * Avant : une charge unique par mouvement, et le 1RM calculé avec les reps
 * PRESCRITES. Un 5 × 3 réellement fait 5, 5, 3 produisait un 1RM estimé sur
 * 3 reps alors que l'athlète en avait poussé 5 : un chiffre faux, plausible, et
 * invérifiable.
 *
 * La grille est pré-remplie par la prescription (reps, et charge résolue depuis
 * le %1RM) : l'athlète qui a fait exactement ce qui était prescrit valide sans
 * rien toucher, et ne corrige que les lignes qui diffèrent. Aucun repli
 * « toutes identiques » : un repli qui cache des lignes fabrique précisément la
 * donnée supposée qu'on élimine ici.
 */

import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

import { useTheme, AppTheme } from '../../context/ThemeContext';
import { StrengthSetDraft } from '../../services/strengthSets';

interface Props {
  drafts: StrengthSetDraft[];
  onChange: (index: number, patch: Partial<Pick<StrengthSetDraft, 'reps' | 'loadKg'>>) => void;
}

export default function StrengthSetGrid({ drafts, onChange }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  if (drafts.length === 0) return null;

  return (
    <View>
      <Text style={S.label}>SÉRIES RÉALISÉES (MUSCULATION)</Text>
      <Text style={S.hint}>
        Pré-rempli avec ce qui était prescrit. Corrige seulement les séries où tu as fait autre
        chose — ce sont ces valeurs qui mettent à jour ton 1RM.
      </Text>
      {drafts.map((d, i) => {
        const first = i === 0 || drafts[i - 1].entryIndex !== d.entryIndex;
        const deviates =
          d.reps.trim() !== String(d.prescribedReps) ||
          (d.prescribedLoadKg != null && d.loadKg.trim() !== String(d.prescribedLoadKg));
        return (
          <View key={`${d.entryIndex}-${d.setIndex}`}>
            {first && <Text style={S.movement}>{d.name}</Text>}
            <View style={S.row}>
              <Text style={S.setLabel}>Série {d.setIndex}</Text>
              <TextInput
                style={S.input}
                placeholder="reps"
                placeholderTextColor={theme.textMuted}
                value={d.reps}
                onChangeText={txt => onChange(i, { reps: txt })}
                keyboardType="number-pad"
              />
              <Text style={S.times}>×</Text>
              <TextInput
                style={S.input}
                placeholder="kg"
                placeholderTextColor={theme.textMuted}
                value={d.loadKg}
                onChangeText={txt => onChange(i, { loadKg: txt })}
                keyboardType="decimal-pad"
              />
              <Text style={[S.prescribed, deviates && S.prescribedDeviates]}>
                {d.prescribedLoadKg != null
                  ? `prévu ${d.prescribedReps} × ${d.prescribedLoadKg}`
                  : `prévu ${d.prescribedReps} reps`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    label: {
      fontSize: 11, fontWeight: '900', color: theme.textMuted,
      letterSpacing: 1, marginTop: 16, marginBottom: 4,
    },
    hint: { fontSize: 11, color: theme.textMuted, marginBottom: 8, lineHeight: 15 },
    movement: { fontSize: 13, fontWeight: '900', color: theme.text, marginTop: 10, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    setLabel: { fontSize: 12, color: theme.textMuted, width: 62 },
    input: {
      flex: 1, minWidth: 52, backgroundColor: theme.surface, color: theme.text,
      borderWidth: 1, borderColor: theme.border, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, textAlign: 'center',
    },
    times: { fontSize: 12, color: theme.textMuted },
    prescribed: { fontSize: 10, color: theme.textMuted, width: 80, textAlign: 'right' },
    prescribedDeviates: { color: theme.accent, fontWeight: '700' },
  });
}
