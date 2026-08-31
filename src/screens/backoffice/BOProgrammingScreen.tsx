import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Linking,
} from 'react-native';
import { ChevronLeft, Search, Check, Store, Globe } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { WEB_URL } from '../../lib/urls';
import GlassBackground from '../../components/glass/GlassBackground';

const DISCIPLINES = ['crossfit', 'hyrox', 'hybrid', 'haltero', 'endurance'];

interface CatalogueItem {
  id: string;
  publisher_box_id: string;
  title: string;
  description: string | null;
  discipline: string | null;
  level: string | null;
  days_per_week: number | null;
  weeks_count: number;
  billing: string;
  price_cents: number;
  currency: string;
  publisher_name: string;
}

export default function BOProgrammingScreen({ navigation }: any) {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [fDiscipline, setFDiscipline] = useState('');
  const [fFree, setFFree] = useState(false);

  const levelLabel = (lvl: string | null): string => {
    switch (lvl) {
      case 'beginner': return t('bo.programming.levelBeginner');
      case 'intermediate': return t('bo.programming.levelIntermediate');
      case 'advanced': return t('bo.programming.levelAdvanced');
      default: return t('bo.programming.levelAll');
    }
  };

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
      const { data: cat } = await supabase
        .from('box_programming')
        .select('id, publisher_box_id, title, description, discipline, level, days_per_week, weeks_count, billing, price_cents, currency, boxes:publisher_box_id(name)')
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      const items: CatalogueItem[] = (cat ?? [])
        .filter((p) => p.publisher_box_id !== currentBox.id)
        .map((p) => {
          const box = Array.isArray(p.boxes) ? p.boxes[0] : p.boxes;
          return {
            id: p.id,
            publisher_box_id: p.publisher_box_id,
            title: p.title,
            description: p.description,
            discipline: p.discipline,
            level: p.level,
            days_per_week: p.days_per_week,
            weeks_count: p.weeks_count,
            billing: p.billing,
            price_cents: p.price_cents,
            currency: p.currency,
            publisher_name: box?.name ?? t('bo.programming.aBox'),
          };
        });
      setCatalogue(items);

      const { data: subs } = await supabase
        .from('box_programming_subscriptions')
        .select('programming_id, status')
        .eq('subscriber_box_id', currentBox.id)
        .eq('status', 'active');
      setSubscribedIds(new Set((subs ?? []).map((s) => s.programming_id)));
    } catch (e) {
      captureError(e, { screen: 'BOProgramming', action: 'load' });
    }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function subscribeFree(item: CatalogueItem) {
    if (!currentBox || !user) return;
    setSubscribing(item.id);
    try {
      const { error } = await supabase.rpc('subscribe_free_programming', {
        p_programming_id: item.id,
        p_subscriber_box_id: currentBox.id,
      });
      if (error) throw error;
      setSubscribedIds((prev) => new Set(prev).add(item.id));
      Alert.alert(t('bo.programming.subscribedOk'), t('bo.programming.revealNote'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message ?? String(e));
    }
    setSubscribing(null);
  }

  function onSubscribe(item: CatalogueItem) {
    const priceLabel = `${(item.price_cents / 100).toFixed(0)}${item.currency === 'eur' ? '€' : ''}${item.billing === 'monthly' ? t('bo.programming.perMonth') : ''}`;
    if (item.billing === 'free') {
      Alert.alert(
        t('bo.programming.subscribeConfirmTitle'),
        t('bo.programming.subscribeConfirmMsg', { title: item.title, box: currentBox?.name ?? '' }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('bo.programming.subscribe'), onPress: () => subscribeFree(item) },
        ],
      );
      return;
    }
    // Paid offer — Stripe Connect checkout lives on the web (App Store compliant).
    Alert.alert(
      t('bo.programming.paidTitle'),
      t('bo.programming.paidMsg', { price: priceLabel }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bo.programming.payOnWeb'), onPress: () => Linking.openURL(`${WEB_URL}/programming`) },
      ],
    );
  }

  const visible = catalogue.filter((p) => {
    if (q && !p.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (fDiscipline && p.discipline !== fDiscipline) return false;
    if (fFree && p.billing !== 'free') return false;
    return true;
  });

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('bo.programming.title')}</Text>
        <Store color={theme.accent} size={20} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <Text style={S.subtitle}>{t('bo.programming.subtitle')}</Text>

          <View style={S.searchRow}>
            <Search size={15} color={theme.textMuted} style={{ marginLeft: 10 }} />
            <TextInput
              style={S.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder={t('bo.programming.searchPlaceholder')}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterRow}>
            <TouchableOpacity
              onPress={() => setFFree(!fFree)}
              style={[S.filterChip, fFree && S.filterChipActive]}
              activeOpacity={0.8}
            >
              <Text style={[S.filterChipText, fFree && S.filterChipTextActive]}>{t('bo.programming.free')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFDiscipline('')}
              style={[S.filterChip, !fDiscipline && S.filterChipActive]}
              activeOpacity={0.8}
            >
              <Text style={[S.filterChipText, !fDiscipline && S.filterChipTextActive]}>{t('bo.programming.allDisciplines')}</Text>
            </TouchableOpacity>
            {DISCIPLINES.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setFDiscipline(fDiscipline === d ? '' : d)}
                style={[S.filterChip, fDiscipline === d && S.filterChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[S.filterChipText, fDiscipline === d && S.filterChipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {visible.length === 0 ? (
            <View style={S.emptyCard}>
              <Store color={theme.textMuted} size={40} />
              <Text style={S.emptySub}>{t('bo.programming.empty')}</Text>
            </View>
          ) : (
            visible.map((p) => {
              const subscribed = subscribedIds.has(p.id);
              const priceLabel = p.billing === 'free'
                ? t('bo.programming.free')
                : `${(p.price_cents / 100).toFixed(0)}${p.currency === 'eur' ? '€' : ''}${p.billing === 'monthly' ? t('bo.programming.perMonth') : ''}`;
              return (
                <View key={p.id} style={S.card}>
                  <View style={S.cardTop}>
                    <Text style={S.cardTitle}>{p.title}</Text>
                    <View style={[S.priceBadge, p.billing === 'free' && S.priceBadgeFree]}>
                      <Text style={[S.priceText, p.billing === 'free' && S.priceTextFree]}>{priceLabel}</Text>
                    </View>
                  </View>
                  <Text style={S.publisher}>{t('bo.programming.by', { name: p.publisher_name })}</Text>
                  {p.description ? <Text style={S.desc} numberOfLines={3}>{p.description}</Text> : null}
                  <View style={S.tagRow}>
                    {p.discipline ? <Tag theme={theme}>{p.discipline}</Tag> : null}
                    <Tag theme={theme}>{levelLabel(p.level)}</Tag>
                    {p.days_per_week ? <Tag theme={theme}>{t('bo.programming.daysPerWeek', { n: p.days_per_week })}</Tag> : null}
                    <Tag theme={theme}>{t('bo.programming.weeks', { n: p.weeks_count })}</Tag>
                  </View>
                  {subscribed ? (
                    <View style={S.subscribedRow}>
                      <Check color={theme.success} size={15} />
                      <Text style={S.subscribedText}>{t('bo.programming.subscribed')}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={S.subscribeBtn}
                      onPress={() => onSubscribe(p)}
                      disabled={subscribing === p.id}
                      activeOpacity={0.85}
                    >
                      {subscribing === p.id
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={S.subscribeBtnText}>{t('bo.programming.subscribe')}</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}

          <View style={S.footerNote}>
            <Globe color={theme.textMuted} size={13} />
            <Text style={S.footerNoteText}>{t('bo.programming.revealNote')}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Tag({ children, theme }: { children: React.ReactNode; theme: AppTheme }) {
  return (
    <View style={{ backgroundColor: `${theme.accent}12`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
      <Text style={{ fontSize: 11, color: theme.accent, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    back: { padding: 4, marginRight: 8 },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: t.text },
    subtitle: { fontSize: 13, color: t.textSecondary, marginTop: 16, marginBottom: 12 },

    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 10, borderWidth: 1, borderColor: t.border, marginBottom: 10 },
    searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, color: t.text, fontSize: 14 },

    filterRow: { gap: 8, paddingVertical: 2, paddingRight: 16 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: t.border, backgroundColor: t.card },
    filterChipActive: { borderColor: t.accent, backgroundColor: t.accent },
    filterChipText: { fontSize: 12, fontWeight: '700', color: t.textSecondary },
    filterChipTextActive: { color: '#fff' },

    emptyCard: { alignItems: 'center', padding: 32, marginTop: 40, backgroundColor: t.card, borderRadius: 16, gap: 12 },
    emptySub: { fontSize: 14, color: t.textSecondary, textAlign: 'center' },

    card: { backgroundColor: t.card, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: t.border },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: t.text },
    priceBadge: { backgroundColor: `${t.accent}18`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    priceBadgeFree: { backgroundColor: `${t.success}18` },
    priceText: { color: t.accent, fontWeight: '800', fontSize: 13 },
    priceTextFree: { color: t.success },
    publisher: { fontSize: 12, color: t.textMuted, marginTop: 3 },
    desc: { fontSize: 13, color: t.textSecondary, marginTop: 8 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },

    subscribeBtn: { backgroundColor: t.accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 14 },
    subscribeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    subscribedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: `${t.success}12`, borderRadius: 10, paddingVertical: 11, marginTop: 14 },
    subscribedText: { color: t.success, fontWeight: '700', fontSize: 14 },

    footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 20, paddingHorizontal: 4 },
    footerNoteText: { flex: 1, fontSize: 11, color: t.textMuted, lineHeight: 15 },
  });
}
