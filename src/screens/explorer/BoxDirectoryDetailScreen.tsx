import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Linking,
} from 'react-native';
import {
  ChevronLeft, MapPin, Globe, Mail, Phone, Users, Calendar,
  Instagram, Clock, Dumbbell, ExternalLink,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { BOX_COLUMNS } from '../../lib/boxColumns';
import { captureError } from '../../lib/sentry';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { Box } from '../../types';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;
type Route = RouteProp<ExplorerStackParamList, 'BoxDirectoryDetail'>;

const SPORT_LABELS: Record<string, string> = {
  crossfit: 'Functional', weightlifting: 'Haltérophilie', gymnastics: 'Gymnastique',
  hiit: 'HIIT', yoga: 'Yoga', boxing: 'Boxe', mma: 'MMA',
  functional: 'Functional', hyrox: 'Hybrid',
};

const SERVICE_LABELS: Record<string, string> = {
  parking: 'Parking', showers: 'Douches', lockers: 'Casiers',
  shop: 'Boutique', nutrition: 'Nutrition', physio: 'Kiné',
  childcare: 'Garderie', sauna: 'Sauna', openGym: 'Open Gym',
};

export default function BoxDirectoryDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const s = createStyles(theme);

  const boxId = route.params?.boxId;
  const [box, setBox] = useState<Box | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boxId) return;
    (async () => {
      try {
        const [{ data: boxData }, { count }] = await Promise.all([
          supabase.from('boxes').select(BOX_COLUMNS).eq('id', boxId).single(),
          supabase.from('box_members').select('id', { count: 'exact', head: true }).eq('box_id', boxId).eq('status', 'active'),
        ]);
        setBox(boxData as unknown as Box);
        setMemberCount(count ?? 0);
      } catch (e) {
        captureError(e, { screen: 'BoxDirectoryDetail', action: 'load' });
      }
      setLoading(false);
    })();
  }, [boxId]);

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!box) {
    return (
      <View style={[s.container, s.center]}>
        <GlassBackground />
        <Text style={s.emptyText}>Box introuvable</Text>
      </View>
    );
  }

  function openLink(url?: string) {
    if (url) Linking.openURL(url).catch(() => {});
  }

  const sports = (box.sport_type ?? []).map(s => SPORT_LABELS[s] ?? s);
  const services = (box.services ?? []).map(s => SERVICE_LABELS[s] ?? s);

  return (
    <View style={s.container}>
      <GlassBackground />
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{box.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Cover / Logo */}
        <View style={s.heroWrap}>
          {box.cover_url ? (
            <Image source={{ uri: box.cover_url }} style={s.cover} />
          ) : (
            <View style={[s.cover, { backgroundColor: `${theme.accent}10` }]} />
          )}
          <View style={s.logoWrap}>
            {box.logo_url ? (
              <Image source={{ uri: box.logo_url }} style={s.logo} />
            ) : (
              <View style={[s.logo, s.logoPlaceholder]}>
                <Text style={s.logoLetter}>{box.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.body}>
          {/* Name & tagline */}
          <Text style={s.name}>{box.name}</Text>
          {box.tagline ? <Text style={s.tagline}>{box.tagline}</Text> : null}

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Users size={14} color={theme.accent} />
              <Text style={s.statVal}>{memberCount}</Text>
              <Text style={s.statLabel}>membres</Text>
            </View>
            {box.founded_at ? (
              <View style={s.statItem}>
                <Calendar size={14} color={theme.accent} />
                <Text style={s.statVal}>{new Date(box.founded_at).getFullYear()}</Text>
                <Text style={s.statLabel}>fondée</Text>
              </View>
            ) : null}
            {sports.length > 0 ? (
              <View style={s.statItem}>
                <Dumbbell size={14} color={theme.accent} />
                <Text style={s.statVal}>{sports.length}</Text>
                <Text style={s.statLabel}>sports</Text>
              </View>
            ) : null}
          </View>

          {/* Description */}
          {box.description ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>À propos</Text>
              <Text style={s.descText}>{box.description}</Text>
            </View>
          ) : null}

          {/* Sports */}
          {sports.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Sports</Text>
              <View style={s.badgeRow}>
                {sports.map(sp => (
                  <View key={sp} style={s.badge}>
                    <Text style={s.badgeText}>{sp}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Services */}
          {services.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Services</Text>
              <View style={s.badgeRow}>
                {services.map(sv => (
                  <View key={sv} style={[s.badge, s.serviceBadge]}>
                    <Text style={s.badgeText}>{sv}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Contact info */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Contact</Text>
            <View style={s.infoList}>
              {box.address && (
                <TouchableOpacity style={s.infoRow} onPress={() => openLink(box.google_maps_url)}>
                  <MapPin size={15} color={theme.accent} />
                  <Text style={s.infoText}>{box.address}{box.city ? `, ${box.city}` : ''}</Text>
                  {box.google_maps_url && <ExternalLink size={13} color={theme.textMuted} />}
                </TouchableOpacity>
              )}
              {box.phone && (
                <TouchableOpacity style={s.infoRow} onPress={() => Linking.openURL(`tel:${box.phone}`)}>
                  <Phone size={15} color={theme.accent} />
                  <Text style={s.infoText}>{box.phone}</Text>
                </TouchableOpacity>
              )}
              {box.contact_email && (
                <TouchableOpacity style={s.infoRow} onPress={() => Linking.openURL(`mailto:${box.contact_email}`)}>
                  <Mail size={15} color={theme.accent} />
                  <Text style={s.infoText}>{box.contact_email}</Text>
                </TouchableOpacity>
              )}
              {box.website_url && (
                <TouchableOpacity style={s.infoRow} onPress={() => openLink(box.website_url)}>
                  <Globe size={15} color={theme.accent} />
                  <Text style={s.infoText}>{box.website_url}</Text>
                </TouchableOpacity>
              )}
              {box.instagram_url && (
                <TouchableOpacity style={s.infoRow} onPress={() => openLink(box.instagram_url)}>
                  <Instagram size={15} color={theme.accent} />
                  <Text style={s.infoText}>Instagram</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Opening hours */}
          {box.opening_hours && Object.keys(box.opening_hours).length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Horaires</Text>
              {Object.entries(box.opening_hours).map(([day, hours]) => (
                <View key={day} style={s.hoursRow}>
                  <Text style={s.hoursDay}>{day}</Text>
                  <Text style={s.hoursVal}>{hours}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}


function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: 14, color: t.textMuted },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: t.text },
    heroWrap: { position: 'relative' },
    cover: { width: '100%', height: 160 },
    logoWrap: {
      position: 'absolute', bottom: -30, left: 20,
      borderRadius: 18, borderWidth: 3, borderColor: t.card,
      overflow: 'hidden',
    },
    logo: { width: 64, height: 64, borderRadius: 16 },
    logoPlaceholder: {
      backgroundColor: `${t.accent}15`, alignItems: 'center', justifyContent: 'center',
    },
    logoLetter: { fontSize: 26, fontWeight: '900', color: t.accent },
    body: { paddingHorizontal: 20, paddingTop: 40 },
    name: { fontSize: 24, fontWeight: '900', color: t.text },
    tagline: { fontSize: 14, color: t.textSecondary, marginTop: 4 },
    statsRow: {
      flexDirection: 'row', gap: 20, marginTop: 20,
      paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: t.border,
    },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statVal: { fontSize: 15, fontWeight: '800', color: t.text },
    statLabel: { fontSize: 12, color: t.textMuted },
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: t.text, marginBottom: 10 },
    descText: { fontSize: 14, color: t.textSecondary, lineHeight: 22 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    badge: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 8, backgroundColor: `${t.accent}15`,
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: t.textSecondary },
    serviceBadge: { backgroundColor: t.surface },
    infoList: { gap: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    infoText: { fontSize: 13, color: t.textSecondary, flex: 1 },
    hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    hoursDay: { fontSize: 13, fontWeight: '600', color: t.text, textTransform: 'capitalize' },
    hoursVal: { fontSize: 13, color: t.textSecondary },
  });
}
