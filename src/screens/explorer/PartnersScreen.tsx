import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, ChevronRight, Handshake, Tag } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { Partner, PartnerCategory } from '../../types';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;

const CATEGORY_LABELS: Record<PartnerCategory, string> = {
  nutrition: 'Nutrition',
  equipment: 'Équipement',
  apparel: 'Vêtements',
  supplements: 'Compléments',
  recovery: 'Récupération',
  coaching: 'Coaching',
  software: 'Logiciel',
  other: 'Autres',
};

const CATEGORY_ORDER: PartnerCategory[] = [
  'nutrition', 'equipment', 'apparel', 'supplements', 'recovery', 'coaching', 'software', 'other',
];

export default function PartnersScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = createStyles(theme);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPartners();
  }, []);

  async function loadPartners() {
    try {
      const { data, error } = await supabase.from('partners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setPartners((data ?? []) as Partner[]);
    } catch (e) {
      captureError(e, { screen: 'Partners', action: 'load' });
    }
    setLoading(false);
  }

  const sections = useMemo(() => {
    const grouped: Record<string, Partner[]> = {};
    partners.forEach(p => {
      const cat = p.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    return CATEGORY_ORDER
      .filter(cat => grouped[cat]?.length)
      .map(cat => ({ title: CATEGORY_LABELS[cat], data: grouped[cat] }));
  }, [partners]);

  function renderPartner({ item }: { item: Partner }) {
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PartnerDetail', { partnerId: item.id })}
      >
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={s.logo} />
        ) : (
          <View style={[s.logo, s.logoPlaceholder]}>
            <Handshake size={20} color={theme.accent} />
          </View>
        )}
        <View style={s.cardContent}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          {item.offer_title ? (
            <View style={s.offerRow}>
              <Tag size={11} color={theme.accent} />
              <Text style={s.offerText} numberOfLines={1}>{item.offer_title}</Text>
            </View>
          ) : item.description ? (
            <Text style={s.cardDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>
        <ChevronRight size={16} color={theme.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.container}>
      <GlassBackground />
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Partenaires</Text>
          <Text style={s.headerSub}>Offres exclusives pour les athlètes AthleX</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : sections.length === 0 ? (
        <View style={s.center}>
          <Handshake size={40} color={theme.textMuted} />
          <Text style={s.emptyText}>Aucun partenaire pour le moment</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderPartner}
          renderSectionHeader={({ section }) => (
            <Text style={s.sectionHeader}>{section.title}</Text>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 20, fontWeight: '900', color: t.text },
    headerSub: { fontSize: 11, color: t.textMuted, marginTop: 1 },
    sectionHeader: {
      fontSize: 13, fontWeight: '800', color: t.textMuted,
      textTransform: 'uppercase', letterSpacing: 1,
      marginTop: 24, marginBottom: 10, paddingLeft: 2,
    },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: t.border,
    },
    logo: { width: 48, height: 48, borderRadius: 12 },
    logoPlaceholder: {
      backgroundColor: `${t.accent}15`, alignItems: 'center', justifyContent: 'center',
    },
    cardContent: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '800', color: t.text },
    cardDesc: { fontSize: 12, color: t.textSecondary, marginTop: 3 },
    offerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    offerText: { fontSize: 12, fontWeight: '600', color: t.accent },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 14, color: t.textMuted },
  });
}
