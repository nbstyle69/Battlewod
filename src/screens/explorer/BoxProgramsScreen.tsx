import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SectionList,
  Image, ActivityIndicator, Linking,
} from 'react-native';
import { ChevronLeft, Building2, ExternalLink, Calendar } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import GlassBackground from '../../components/glass/GlassBackground';
import { WEB_URL } from '../../lib/urls';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;

interface ProgramItem {
  id: string;
  title: string;
  description: string | null;
  type: 'fixed' | 'ongoing';
  duration_weeks: number | null;
  days_per_week: number;
  box_id: string;
  box_name: string;
  box_logo: string | null;
  box_city: string | null;
  box_slug: string | null;
}

const SITE_BASE_URL = WEB_URL;

export default function BoxProgramsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = createStyles(theme);
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data, error } = await supabase
        .from('programs')
        .select('id, title, description, type, duration_weeks, days_per_week, box_id, boxes(name, logo_url, city, slug)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list: ProgramItem[] = ((data ?? []) as any[]).map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        type: p.type,
        duration_weeks: p.duration_weeks,
        days_per_week: p.days_per_week,
        box_id: p.box_id,
        box_name: p.boxes?.name ?? '',
        box_logo: p.boxes?.logo_url ?? null,
        box_city: p.boxes?.city ?? null,
        box_slug: p.boxes?.slug ?? null,
      }));
      setPrograms(list);
    } catch (e) {
      captureError(e, { screen: 'BoxPrograms', action: 'load' });
    }
    setLoading(false);
  }

  const sections = useMemo(() => {
    const map: Record<string, { box_name: string; box_logo: string | null; box_city: string | null; box_slug: string | null; data: ProgramItem[] }> = {};
    programs.forEach(p => {
      if (!map[p.box_id]) {
        map[p.box_id] = { box_name: p.box_name, box_logo: p.box_logo, box_city: p.box_city, box_slug: p.box_slug, data: [] };
      }
      map[p.box_id].data.push(p);
    });
    return Object.entries(map).map(([, v]) => ({
      title: v.box_name,
      box_logo: v.box_logo,
      box_city: v.box_city,
      box_slug: v.box_slug,
      data: v.data,
    }));
  }, [programs]);

  function openBoxPage(slug: string | null) {
    if (slug) Linking.openURL(`${SITE_BASE_URL}/box/${slug}`);
  }

  return (
    <View style={s.container}>
      <GlassBackground />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Programmes des Boxes</Text>
          <Text style={s.headerSub}>{programs.length} programme{programs.length > 1 ? 's' : ''} disponible{programs.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={s.center}>
              <Building2 color={theme.textMuted} size={40} />
              <Text style={s.emptyTxt}>Aucune box ne propose de programme pour le moment</Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <TouchableOpacity style={s.sectionRow} activeOpacity={0.8} onPress={() => openBoxPage(section.box_slug)}>
              {section.box_logo ? (
                <Image source={{ uri: section.box_logo }} style={s.sectionLogo} />
              ) : (
                <View style={s.sectionLogoFallback}>
                  <Text style={s.sectionInitial}>{section.title.charAt(0)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.sectionName}>{section.title}</Text>
                {section.box_city && <Text style={s.sectionCity}>{section.box_city}</Text>}
              </View>
              {section.box_slug && <ExternalLink color={theme.textMuted} size={16} />}
            </TouchableOpacity>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => openBoxPage(item.box_slug)}>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={s.cardName} numberOfLines={1}>{item.title}</Text>
                  <View style={[s.typeBadge, { backgroundColor: item.type === 'fixed' ? '#3B82F615' : '#8B5CF615' }]}>
                    <Text style={[s.typeTxt, { color: item.type === 'fixed' ? '#3B82F6' : '#8B5CF6' }]}>
                      {item.type === 'fixed' ? `${item.duration_weeks} sem.` : 'Ongoing'}
                    </Text>
                  </View>
                </View>
                {item.description && <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>}
                <View style={s.metaRow}>
                  <Calendar color={theme.textMuted} size={12} />
                  <Text style={s.metaTxt}>{item.days_per_week} jours/semaine</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  sectionLogo: { width: 36, height: 36, borderRadius: 10 },
  sectionLogoFallback: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: `${t.accent}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionInitial: { fontSize: 16, fontWeight: '900', color: t.accent },
  sectionName: { fontSize: 14, fontWeight: '900', color: t.text },
  sectionCity: { fontSize: 11, color: t.textMuted, marginTop: 1 },
  card: {
    backgroundColor: t.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: t.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '800', color: t.text, flex: 1 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeTxt: { fontSize: 10, fontWeight: '800' },
  cardDesc: { fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  metaTxt: { fontSize: 11, color: t.textMuted },
}); }
