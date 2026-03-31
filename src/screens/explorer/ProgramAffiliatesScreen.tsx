import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';

const HYROX_ORANGE = '#FF6B00';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;
type Route = RouteProp<ExplorerStackParamList, 'ProgramAffiliates'>;

interface Affiliate {
  id: string;
  name: string;
  logo_url: string | null;
  category: string;
  description: string | null;
}

export default function ProgramAffiliatesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const category = route.params?.category ?? 'functional';
  const s = createStyles(theme);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  const categoryLabel = category === 'hybrid' ? 'Hybrid' : 'Functional Fitness';

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from as any)('program_affiliates')
      .select('id, name, logo_url, category, description')
      .eq('is_active', true)
      .eq('category', category)
      .order('sort_order', { ascending: true });
    setAffiliates((data as Affiliate[]) ?? []);
    setLoading(false);
  }, [category]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{categoryLabel}</Text>
          <Text style={s.headerSub}>{affiliates.length} programmeur{affiliates.length > 1 ? 's' : ''} disponible{affiliates.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={affiliates}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.center}>
              <BookOpen color={theme.textMuted} size={40} />
              <Text style={s.emptyTxt}>Aucun programmeur disponible</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('AffiliateDetail', { affiliateId: item.id, affiliateName: item.name })}
            >
              <View style={s.cardLeft}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={s.logo} />
                ) : (
                  <View style={[s.logoPlaceholder, { backgroundColor: item.category === 'hybrid' ? `${HYROX_ORANGE}15` : `${theme.accent}15` }]}>
                    <Text style={s.logoInitial}>{item.name[0]}</Text>
                  </View>
                )}
              </View>
              <View style={s.cardContent}>
                <View style={s.cardNameRow}>
                  <Text style={s.cardName}>{item.name}</Text>
                  <View style={[s.catBadge, { backgroundColor: item.category === 'hybrid' ? `${HYROX_ORANGE}15` : `${theme.accent}15` }]}>
                    <Text style={[s.catBadgeTxt, { color: category === 'hybrid' ? HYROX_ORANGE : theme.accent }]}>
                      {categoryLabel}
                    </Text>
                  </View>
                </View>
                {item.description && <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>}
              </View>
              <ChevronRight color={theme.textMuted} size={18} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
  },
  back: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: t.text },
  headerSub: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyTxt: { fontSize: 13, color: t.textMuted },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: t.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: t.border, marginBottom: 10,
  },
  cardLeft: {},
  logo: { width: 52, height: 52, borderRadius: 14 },
  logoPlaceholder: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: { fontSize: 22, fontWeight: '900', color: t.text },
  cardContent: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '900', color: t.text },
  catBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeTxt: { fontSize: 10, fontWeight: '700' },
  cardDesc: { fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 16 },
}); }
