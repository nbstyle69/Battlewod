/**
 * Section « Gymnastique » de la page de records (SPEC §3)
 * =======================================================
 * L'athlète déclare, par famille, le PLUS HAUT palier qu'il maîtrise (GYM_LADDERS).
 * Stocké dans user_generation_settings.gym_declaration — JAMAIS dans
 * profiles.personal_records (qui reste réservé aux 1RM chiffrés).
 * Le niveau Gym déduit sert au choix des variantes de mouvements du générateur.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { useTheme, AppTheme } from '../../context/ThemeContext';
import { GYM_LADDERS, GymDeclaration, gymLevel } from '../../utils/wod/athleteLevels';
import { loadGymDeclaration, saveGymDeclaration } from '../../services/wodPersonalization';

const FAMILY_LABELS: Record<string, string> = {
  pullup: 'Tractions', hspu: 'HSPU', toesToBar: 'Toes-to-Bar',
  doubleUnder: 'Double-unders', pistol: 'Pistols', ropeClimb: 'Corde',
  handstandWalk: 'Handstand Walk',
};

export default function GymDeclarationSection({ userId }: { userId?: string }) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [open, setOpen] = useState(false);
  const [decl, setDecl] = useState<GymDeclaration>({});

  useEffect(() => {
    if (userId) loadGymDeclaration(userId).then(setDecl);
  }, [userId]);

  const families = Object.keys(GYM_LADDERS);
  const suggested = gymLevel(decl).suggested;

  async function pick(family: string, idx: number) {
    const next = { ...decl, [family]: idx };
    setDecl(next);
    if (userId) await saveGymDeclaration(userId, next);
  }

  return (
    <View style={S.category}>
      <TouchableOpacity style={S.header} onPress={() => setOpen((v) => !v)} activeOpacity={0.7}>
        <Text style={S.icon}>🤸</Text>
        <Text style={S.label}>Gymnastique — ce que je maîtrise</Text>
        <Text style={S.count}>{Object.keys(decl).length > 0 ? `niveau ${suggested}` : 'à déclarer'}</Text>
        <ChevronRight color={theme.textMuted} size={16} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} />
      </TouchableOpacity>

      {open && (
        <View style={S.body}>
          <Text style={S.hint}>
            Sers-toi du palier le plus haut que tu tiens en WOD : le générateur choisira la bonne
            variante (les répétitions, elles, ne changent jamais).
          </Text>
          {families.map((fam) => (
            <View key={fam} style={S.familyRow}>
              <Text style={S.familyLabel}>{FAMILY_LABELS[fam] ?? fam}</Text>
              <View style={S.chipRow}>
                {GYM_LADDERS[fam].map((tier, idx) => {
                  const selected = (decl[fam] ?? 0) === idx;
                  return (
                    <TouchableOpacity
                      key={`${fam}-${idx}`}
                      style={[S.chip, selected && { borderColor: theme.accent, backgroundColor: `${theme.accent}20` }]}
                      onPress={() => pick(fam, idx)}
                      activeOpacity={0.8}
                    >
                      <Text style={[S.chipText, selected && { fontWeight: '800' }]}>{tier}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  category: {
    backgroundColor: theme.card, borderRadius: 16, borderWidth: 1,
    borderColor: theme.border, marginBottom: 12, overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  icon: { fontSize: 18 },
  label: { flex: 1, fontSize: 14, fontWeight: '800', color: theme.text },
  count: { fontSize: 11, color: theme.textMuted },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  hint: { fontSize: 12, color: theme.textMuted, lineHeight: 17 },
  familyRow: { gap: 8 },
  familyLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface,
  },
  chipText: { fontSize: 11, color: theme.text, fontWeight: '600' },
}); }
