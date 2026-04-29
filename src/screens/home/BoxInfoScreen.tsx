import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Linking,
} from 'react-native';
import { ArrowLeft, MapPin, Globe, Mail, Users, Calendar, Trophy, Building2, Phone, Navigation, User } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';

interface BoxInfo {
  name: string;
  description: string | null;
  logo_url: string | null;
  address: string | null;
  website_url: string | null;
  contact_email: string | null;
  phone: string | null;
  google_maps_url: string | null;
  founded_at: string | null;
  created_at: string;
  memberCount: number;
  avgElo: number;
  joinedAt: string | null;
  ownerName: string | null;
  coaches: { id: string; username: string; avatar_url: string | null }[];
}

export default function BoxInfoScreen({ navigation }: any) {
  const { currentBox, user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [info, setInfo] = useState<BoxInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentBox || !user) return;
    (async () => {
      try {
        const [{ data: boxRaw }, { count }, { data: elos }, { data: membership }] = await Promise.all([
          supabase.from('boxes').select('name, description, logo_url, address, website_url, contact_email, phone, google_maps_url, founded_at, owner_id, created_at').eq('id', currentBox.id).single(),
          supabase.from('box_members').select('*', { count: 'exact', head: true }).eq('box_id', currentBox.id).eq('status', 'active'),
          supabase.from('box_members').select('member_id, profiles(elo)').eq('box_id', currentBox.id).eq('status', 'active'),
          supabase.from('box_members').select('joined_at').eq('box_id', currentBox.id).eq('member_id', user.id).eq('status', 'active').maybeSingle(),
        ]);
        const box = boxRaw as any;

        const eloValues = (elos ?? []).map((e: any) => e.profiles?.elo).filter((v: any) => typeof v === 'number');
        const avgElo = eloValues.length > 0 ? Math.round(eloValues.reduce((a: number, b: number) => a + b, 0) / eloValues.length) : 0;

        // Fetch owner name
        let ownerName: string | null = null;
        if (box?.owner_id) {
          const { data: ownerProfile } = await supabase.from('profiles').select('username').eq('id', box.owner_id).single();
          ownerName = ownerProfile?.username ?? null;
        }

        // Fetch coaches
        const { data: coachMembers } = await supabase
          .from('box_members')
          .select('member_id, profiles:member_id(username, avatar_url)')
          .eq('box_id', currentBox.id)
          .eq('role', 'coach');
        const coaches = (coachMembers ?? []).map((c: any) => ({
          id: c.member_id,
          username: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles)?.username ?? 'Coach',
          avatar_url: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles)?.avatar_url ?? null,
        }));

        setInfo({
          name: box?.name ?? currentBox.name,
          description: box?.description ?? null,
          logo_url: box?.logo_url ?? currentBox.logo_url ?? null,
          address: box?.address ?? null,
          website_url: box?.website_url ?? null,
          contact_email: box?.contact_email ?? null,
          phone: box?.phone ?? null,
          google_maps_url: box?.google_maps_url ?? null,
          founded_at: box?.founded_at ?? null,
          created_at: box?.created_at ?? currentBox.created_at,
          memberCount: count ?? 0,
          avgElo,
          joinedAt: membership?.joined_at ?? null,
          ownerName,
          coaches,
        });
      } catch (e) {
        captureError(e, { screen: 'BoxInfo', action: 'load' });
      }
      setLoading(false);
    })();
  }, [currentBox, user]);

  if (loading) {
    return (
      <View style={[S.container, S.center]}>
      <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!info) {
    return (
      <View style={[S.container, S.center]}>
      <GlassBackground />
        <Text style={{ color: theme.textMuted }}>Aucune information disponible</Text>
      </View>
    );
  }

  const foundedDate = info.founded_at ? new Date(info.founded_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const createdDate = new Date(info.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const joinedDate = info.joinedAt ? new Date(info.joinedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Informations</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {/* Logo + Name */}
        <View style={S.heroSection}>
          {info.logo_url ? (
            <Image source={{ uri: info.logo_url }} style={S.logo} />
          ) : (
            <View style={[S.logo, S.logoPlaceholder]}>
              <Building2 color={theme.textMuted} size={40} />
            </View>
          )}
          <Text style={S.boxName}>{info.name}</Text>
          {info.description ? (
            <Text style={S.boxDesc}>{info.description}</Text>
          ) : null}
        </View>

        {/* Stats row */}
        <View style={S.statsRow}>
          <View style={S.statCard}>
            <Users color={theme.accent} size={20} />
            <Text style={S.statValue}>{info.memberCount}</Text>
            <Text style={S.statLabel}>Membres</Text>
          </View>
          <View style={S.statCard}>
            <Trophy color={theme.gold} size={20} />
            <Text style={S.statValue}>{info.avgElo}</Text>
            <Text style={S.statLabel}>ELO moyen</Text>
          </View>
          <View style={S.statCard}>
            <Calendar color={theme.textSecondary} size={20} />
            <Text style={S.statValue}>{new Date(info.created_at).getFullYear()}</Text>
            <Text style={S.statLabel}>Création</Text>
          </View>
        </View>

        {/* Info cards */}
        <View style={S.infoSection}>
          {info.address ? (
            <View style={S.infoRow}>
              <MapPin color={theme.accent} size={18} />
              <View style={S.infoContent}>
                <Text style={S.infoLabel}>ADRESSE</Text>
                <Text style={S.infoValue}>{info.address}</Text>
              </View>
            </View>
          ) : null}

          {info.website_url ? (
            <TouchableOpacity style={S.infoRow} onPress={() => Linking.openURL(info.website_url!)} activeOpacity={0.7}>
              <Globe color={theme.accent} size={18} />
              <View style={S.infoContent}>
                <Text style={S.infoLabel}>SITE WEB</Text>
                <Text style={[S.infoValue, { color: theme.accent }]}>{info.website_url}</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {info.contact_email ? (
            <TouchableOpacity style={S.infoRow} onPress={() => Linking.openURL(`mailto:${info.contact_email}`)} activeOpacity={0.7}>
              <Mail color={theme.accent} size={18} />
              <View style={S.infoContent}>
                <Text style={S.infoLabel}>CONTACT</Text>
                <Text style={[S.infoValue, { color: theme.accent }]}>{info.contact_email}</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {info.phone ? (
            <TouchableOpacity style={S.infoRow} onPress={() => Linking.openURL(`tel:${info.phone}`)} activeOpacity={0.7}>
              <Phone color={theme.accent} size={18} />
              <View style={S.infoContent}>
                <Text style={S.infoLabel}>TÉLÉPHONE</Text>
                <Text style={[S.infoValue, { color: theme.accent }]}>{info.phone}</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {info.google_maps_url ? (
            <TouchableOpacity style={S.infoRow} onPress={() => Linking.openURL(info.google_maps_url!)} activeOpacity={0.7}>
              <Navigation color={theme.accent} size={18} />
              <View style={S.infoContent}>
                <Text style={S.infoLabel}>LOCALISATION</Text>
                <Text style={[S.infoValue, { color: theme.accent }]}>Voir sur Google Maps</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Owner & coaches */}
        {(info.ownerName || info.coaches.length > 0) ? (
          <View style={S.infoSection}>
            {info.ownerName ? (
              <View style={S.infoRow}>
                <User color={theme.accent} size={18} />
                <View style={S.infoContent}>
                  <Text style={S.infoLabel}>PROPRIÉTAIRE</Text>
                  <Text style={S.infoValue}>{info.ownerName}</Text>
                </View>
              </View>
            ) : null}
            {info.coaches.length > 0 ? (
              <View style={S.infoRow}>
                <Users color={theme.accent} size={18} />
                <View style={S.infoContent}>
                  <Text style={S.infoLabel}>COACHS</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {info.coaches.map(c => (
                      <View key={c.id} style={S.coachChip}>
                        <UserAvatar uri={c.avatar_url} name={c.username} size={22} borderRadius={11} backgroundColor={`${theme.accent}30`} textColor={theme.accent} fontSize={9} />
                        <Text style={S.coachName}>{c.username}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Dates */}
        <View style={S.datesCard}>
          {foundedDate ? (
            <View style={S.dateRow}>
              <Text style={S.dateLabel}>Ouverture de la salle</Text>
              <Text style={S.dateValue}>{foundedDate}</Text>
            </View>
          ) : null}
          <View style={[S.dateRow, foundedDate ? { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 } : {}]}>
            <Text style={S.dateLabel}>Création de la box</Text>
            <Text style={S.dateValue}>{createdDate}</Text>
          </View>
          {joinedDate ? (
            <View style={[S.dateRow, { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 }]}>
              <Text style={S.dateLabel}>Inscrit depuis le</Text>
              <Text style={S.dateValue}>{joinedDate}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  heroSection: { alignItems: 'center', gap: 12 },
  logo: { width: 100, height: 100, borderRadius: 24, backgroundColor: t.surface },
  logoPlaceholder: { justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: t.border, borderStyle: 'dashed' },
  boxName: { fontSize: 24, fontWeight: '900', color: t.text, textAlign: 'center' },
  boxDesc: { fontSize: 13, color: t.textSecondary, textAlign: 'center', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: t.card, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: t.border,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: t.text },
  statLabel: { fontSize: 10, color: t.textMuted, fontWeight: '600' },
  infoSection: {
    backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 1 },
  infoValue: { fontSize: 14, fontWeight: '600', color: t.text },
  datesCard: {
    backgroundColor: t.card, borderRadius: 14, padding: 16, gap: 12,
    borderWidth: 1, borderColor: t.border,
  },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { fontSize: 13, fontWeight: '600', color: t.textSecondary },
  dateValue: { fontSize: 13, fontWeight: '700', color: t.text },
  coachChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    backgroundColor: t.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: t.border,
  },
  coachAvatar: { width: 20, height: 20, borderRadius: 10 },
  coachName: { fontSize: 12, fontWeight: '600' as const, color: t.text },
}); }
