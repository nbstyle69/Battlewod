import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Linking, Alert,
} from 'react-native';
import {
  ChevronLeft, Globe, Instagram, Tag, Copy, ExternalLink, Handshake,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { Partner } from '../../types';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;
type Route = RouteProp<ExplorerStackParamList, 'PartnerDetail'>;

const CATEGORY_LABELS: Record<string, string> = {
  nutrition: 'Nutrition', equipment: 'Équipement', apparel: 'Vêtements',
  supplements: 'Compléments', recovery: 'Récupération', coaching: 'Coaching',
  software: 'Logiciel', other: 'Autres',
};

export default function PartnerDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const s = createStyles(theme);

  const partnerId = (route.params as any)?.partnerId;
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerId) return;
    (async () => {
      try {
        const { data, error } = await (supabase.from as any)('partners')
          .select('*')
          .eq('id', partnerId)
          .single();
        if (error) throw error;
        setPartner(data as Partner);
      } catch (e) {
        captureError(e, { screen: 'PartnerDetail', action: 'load' });
      }
      setLoading(false);
    })();
  }, [partnerId]);

  function copyCode(code: string) {
    try {
      const { Clipboard: RNClipboard } = require('react-native');
      RNClipboard?.setString?.(code);
    } catch (_) {}
    Alert.alert('Code copié !', `Le code "${code}" a été copié dans le presse-papier.`);
  }

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!partner) {
    return (
      <View style={[s.container, s.center]}>
        <GlassBackground />
        <Text style={s.emptyText}>Partenaire introuvable</Text>
      </View>
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
        <Text style={s.headerTitle} numberOfLines={1}>{partner.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Logo + info */}
        <View style={s.heroSection}>
          {partner.logo_url ? (
            <Image source={{ uri: partner.logo_url }} style={s.logo} />
          ) : (
            <View style={[s.logo, s.logoPlaceholder]}>
              <Handshake size={36} color={theme.accent} />
            </View>
          )}
          <Text style={s.name}>{partner.name}</Text>
          <View style={s.categoryBadge}>
            <Text style={s.categoryText}>{CATEGORY_LABELS[partner.category] ?? partner.category}</Text>
          </View>
        </View>

        <View style={s.body}>
          {/* Description */}
          {partner.description ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>À propos</Text>
              <Text style={s.descText}>{partner.description}</Text>
            </View>
          ) : null}

          {/* Offer */}
          {(partner.offer_title || partner.offer_description) && (
            <View style={s.offerCard}>
              <View style={s.offerHeader}>
                <Tag size={16} color={theme.accent} />
                <Text style={s.offerTitle}>{partner.offer_title ?? 'Offre spéciale'}</Text>
              </View>
              {partner.offer_description ? (
                <Text style={s.offerDesc}>{partner.offer_description}</Text>
              ) : null}
              {partner.offer_code ? (
                <TouchableOpacity
                  style={s.codeBtn}
                  onPress={() => copyCode(partner.offer_code!)}
                  activeOpacity={0.8}
                >
                  <Text style={s.codeText}>{partner.offer_code}</Text>
                  <Copy size={14} color={theme.accent} />
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Links */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Liens</Text>
            <View style={s.linkList}>
              {partner.website_url && (
                <TouchableOpacity
                  style={s.linkBtn}
                  onPress={() => Linking.openURL(partner.website_url!)}
                >
                  <Globe size={16} color={theme.accent} />
                  <Text style={s.linkText}>Site web</Text>
                  <ExternalLink size={13} color={theme.textMuted} />
                </TouchableOpacity>
              )}
              {partner.instagram_url && (
                <TouchableOpacity
                  style={s.linkBtn}
                  onPress={() => Linking.openURL(partner.instagram_url!)}
                >
                  <Instagram size={16} color={theme.accent} />
                  <Text style={s.linkText}>Instagram</Text>
                  <ExternalLink size={13} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
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
    heroSection: { alignItems: 'center', paddingVertical: 32 },
    logo: { width: 80, height: 80, borderRadius: 20 },
    logoPlaceholder: {
      backgroundColor: `${t.accent}15`, alignItems: 'center', justifyContent: 'center',
    },
    name: { fontSize: 22, fontWeight: '900', color: t.text, marginTop: 16 },
    categoryBadge: {
      marginTop: 8, paddingHorizontal: 12, paddingVertical: 4,
      borderRadius: 8, backgroundColor: `${t.accent}15`,
    },
    categoryText: { fontSize: 11, fontWeight: '700', color: t.accent },
    body: { paddingHorizontal: 20 },
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: t.text, marginBottom: 10 },
    descText: { fontSize: 14, color: t.textSecondary, lineHeight: 22 },
    offerCard: {
      marginTop: 24, padding: 18, borderRadius: 16,
      backgroundColor: `${t.accent}08`,
      borderWidth: 1, borderColor: `${t.accent}25`,
    },
    offerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    offerTitle: { fontSize: 16, fontWeight: '800', color: t.text },
    offerDesc: { fontSize: 13, color: t.textSecondary, lineHeight: 20, marginBottom: 12 },
    codeBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: t.card, borderRadius: 10, paddingVertical: 12,
      borderWidth: 1, borderColor: t.border, borderStyle: 'dashed',
    },
    codeText: { fontSize: 16, fontWeight: '900', color: t.accent, letterSpacing: 2 },
    linkList: { gap: 10 },
    linkBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.card, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: t.border,
    },
    linkText: { flex: 1, fontSize: 14, fontWeight: '600', color: t.text },
  });
}
