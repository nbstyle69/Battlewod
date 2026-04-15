import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Image, ActivityIndicator, Linking,
} from 'react-native';
import { ChevronLeft, Building2, ExternalLink, Globe } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;

interface BoxWithPrograms {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  city: string | null;
  tagline: string | null;
  program_count: number;
}

const SITE_BASE_URL = 'https://the-hub-rho.vercel.app';

export default function BoxProgramsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = createStyles(theme);
  const [boxes, setBoxes] = useState<BoxWithPrograms[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBoxes(); }, []);

  async function loadBoxes() {
    try {
      // Fetch boxes that have at least one active program
      const { data: progs } = await (supabase.from as any)('box_programs')
        .select('box_id')
        .eq('is_active', true);

      if (!progs || progs.length === 0) {
        setBoxes([]);
        setLoading(false);
        return;
      }

      // Count programs per box
      const countMap: Record<string, number> = {};
      progs.forEach((p: any) => {
        countMap[p.box_id] = (countMap[p.box_id] ?? 0) + 1;
      });
      const boxIds = Object.keys(countMap);

      const { data: boxData, error } = await supabase
        .from('boxes')
        .select('id, name, slug, logo_url, city, tagline')
        .in('id', boxIds)
        .eq('is_active', true);

      if (error) throw error;

      const list: BoxWithPrograms[] = ((boxData ?? []) as any[]).map(b => ({
        ...b,
        program_count: countMap[b.id] ?? 0,
      }));
      list.sort((a, b) => b.program_count - a.program_count);
      setBoxes(list);
    } catch (e) {
      captureError(e, { screen: 'BoxPrograms', action: 'load' });
    }
    setLoading(false);
  }

  function openBoxPage(box: BoxWithPrograms) {
    if (box.slug) {
      Linking.openURL(`${SITE_BASE_URL}/box/${box.slug}`);
    }
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Programmes des Boxes</Text>
          <Text style={s.headerSub}>{boxes.length} box{boxes.length > 1 ? 'es' : ''} avec programmation</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={boxes}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.center}>
              <Building2 color={theme.textMuted} size={40} />
              <Text style={s.emptyTxt}>Aucune box ne propose de programme pour le moment</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.85}
              onPress={() => openBoxPage(item)}
              disabled={!item.slug}
            >
              <View style={s.cardLeft}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={s.logo} />
                ) : (
                  <View style={[s.logoPlaceholder]}>
                    <Text style={s.logoInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <View style={s.cardContent}>
                <Text style={s.cardName}>{item.name}</Text>
                {item.city && <Text style={s.cardCity}>{item.city}</Text>}
                {item.tagline && <Text style={s.cardDesc} numberOfLines={1}>{item.tagline}</Text>}
                <View style={s.badgeRow}>
                  <View style={s.badge}>
                    <Text style={s.badgeTxt}>{item.program_count} programme{item.program_count > 1 ? 's' : ''}</Text>
                  </View>
                </View>
              </View>
              <View style={s.openIcon}>
                {item.slug ? (
                  <ExternalLink color={theme.accent} size={18} />
                ) : (
                  <Globe color={theme.textMuted} size={18} />
                )}
              </View>
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
  emptyTxt: { fontSize: 13, color: t.textMuted, textAlign: 'center', paddingHorizontal: 30 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: t.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: t.border, marginBottom: 12,
  },
  cardLeft: {},
  logo: { width: 52, height: 52, borderRadius: 14 },
  logoPlaceholder: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#3B82F615',
    alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: { fontSize: 22, fontWeight: '900', color: '#3B82F6' },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '900', color: t.text },
  cardCity: { fontSize: 11, color: t.textMuted, marginTop: 1 },
  cardDesc: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 6, gap: 6 },
  badge: {
    backgroundColor: '#3B82F615', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: '#3B82F6' },
  openIcon: { padding: 4 },
}); }
