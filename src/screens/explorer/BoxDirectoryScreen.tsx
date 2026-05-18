import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Search, MapPin, Users, Map, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { Box } from '../../types';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;

const SPORT_LABELS: Record<string, string> = {
  crossfit: 'CrossFit',
  weightlifting: 'Haltérophilie',
  gymnastics: 'Gymnastique',
  hiit: 'HIIT',
  yoga: 'Yoga',
  boxing: 'Boxe',
  mma: 'MMA',
  functional: 'Functional',
  hyrox: 'Hyrox',
};

export default function BoxDirectoryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = createStyles(theme);

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<string | null>(null);

  useEffect(() => {
    loadBoxes();
  }, []);

  async function loadBoxes() {
    try {
      const { data, error } = await supabase
        .from('boxes')
        .select('*')
        .eq('is_listed', true)
        .eq('is_active', true);
      if (error) throw error;
      const list = (data ?? []) as unknown as Box[];

      // Fetch real member counts from box_members
      if (list.length > 0) {
        const boxIds = list.map(b => b.id);
        const { data: members } = await supabase
          .from('box_members')
          .select('box_id')
          .in('box_id', boxIds)
          .eq('status', 'active');
        const countMap: Record<string, number> = {};
        (members ?? []).forEach((m: any) => {
          countMap[m.box_id] = (countMap[m.box_id] ?? 0) + 1;
        });
        list.forEach(b => { b.member_count = countMap[b.id] ?? 0; });
      }

      list.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0));
      setBoxes(list);
    } catch (e) {
      captureError(e, { screen: 'BoxDirectory', action: 'load' });
    }
    setLoading(false);
  }

  const allSports = useMemo(() => {
    const set = new Set<string>();
    boxes.forEach(b => (b.sport_type ?? []).forEach(s => set.add(s)));
    return Array.from(set).sort();
  }, [boxes]);

  const filtered = useMemo(() => {
    let list = boxes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) ||
        (b.city ?? '').toLowerCase().includes(q) ||
        (b.tagline ?? '').toLowerCase().includes(q)
      );
    }
    if (selectedSport) {
      list = list.filter(b => (b.sport_type ?? []).includes(selectedSport));
    }
    return list;
  }, [boxes, search, selectedSport]);

  function renderBox({ item }: { item: Box }) {
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('BoxDirectoryDetail', { boxId: item.id })}
      >
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={s.logo} />
        ) : (
          <View style={[s.logo, s.logoPlaceholder]}>
            <Text style={s.logoLetter}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.cardContent}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          {item.tagline ? (
            <Text style={s.cardTagline} numberOfLines={1}>{item.tagline}</Text>
          ) : null}
          <View style={s.cardMeta}>
            {item.city ? (
              <View style={s.metaRow}>
                <MapPin size={11} color={theme.textMuted} />
                <Text style={s.metaText}>{item.city}</Text>
              </View>
            ) : null}
            <View style={s.metaRow}>
              <Users size={11} color={theme.textMuted} />
              <Text style={s.metaText}>{item.member_count ?? 0} membres</Text>
            </View>
          </View>
          {(item.sport_type ?? []).length > 0 && (
            <View style={s.sportRow}>
              {(item.sport_type ?? []).slice(0, 3).map(sp => (
                <View key={sp} style={s.sportBadge}>
                  <Text style={s.sportBadgeText}>{SPORT_LABELS[sp] ?? sp}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
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
          <Text style={s.headerTitle}>Annuaire des Boxes</Text>
          <Text style={s.headerSub}>{filtered.length} box{filtered.length > 1 ? 'es' : ''} référencée{filtered.length > 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={s.mapBtn}
          onPress={() => navigation.navigate('BoxDirectoryMap', { boxes: filtered.filter(b => b.latitude && b.longitude) })}
        >
          <Map size={18} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Search size={16} color={theme.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Rechercher une box ou une ville..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sport filters */}
      {allSports.length > 0 && (
        <View style={s.filtersWrap}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={allSports}
            keyExtractor={i => i}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            renderItem={({ item: sp }) => (
              <TouchableOpacity
                style={[s.filterChip, selectedSport === sp && s.filterChipActive]}
                onPress={() => setSelectedSport(selectedSport === sp ? null : sp)}
              >
                <Text style={[s.filterChipText, selectedSport === sp && s.filterChipTextActive]}>
                  {SPORT_LABELS[sp] ?? sp}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>Aucune box trouvée</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={b => b.id}
          renderItem={renderBox}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
    mapBtn: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: `${t.accent}15`, alignItems: 'center', justifyContent: 'center',
    },
    searchWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      margin: 16, paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: t.card, borderRadius: 12,
      borderWidth: 1, borderColor: t.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: t.text, padding: 0 },
    filtersWrap: { marginBottom: 8 },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 20, backgroundColor: t.card,
      borderWidth: 1, borderColor: t.border,
    },
    filterChipActive: {
      backgroundColor: `${t.accent}15`, borderColor: t.accent,
    },
    filterChipText: { fontSize: 12, fontWeight: '600', color: t.textSecondary },
    filterChipTextActive: { color: t.accent },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: t.card, borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: t.border,
    },
    logo: { width: 56, height: 56, borderRadius: 14 },
    logoPlaceholder: {
      backgroundColor: `${t.accent}15`,
      alignItems: 'center', justifyContent: 'center',
    },
    logoLetter: { fontSize: 22, fontWeight: '900', color: t.accent },
    cardContent: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '800', color: t.text },
    cardTagline: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: t.textMuted },
    sportRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    sportBadge: {
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 6, backgroundColor: t.surface,
    },
    sportBadgeText: { fontSize: 10, fontWeight: '700', color: t.textSecondary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 14, color: t.textMuted },
  });
}
