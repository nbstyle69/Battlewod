import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, Linking } from 'react-native';
import { ChevronLeft, ExternalLink, ShoppingCart } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { supabase } from '../../lib/supabase';

type Route = RouteProp<ExplorerStackParamList, 'AffiliateDetail'>;

interface Program {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  url: string;
  image_url: string | null;
}

export default function AffiliateDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { affiliateId, affiliateName } = route.params;
  const s = createStyles(theme);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from as any)('programs')
      .select('id, name, description, price, currency, url, image_url')
      .eq('affiliate_id', affiliateId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setPrograms((data as Program[]) ?? []);
    setLoading(false);
  }, [affiliateId]);

  useEffect(() => { load(); }, [load]);

  const formatPrice = (price: number | null, currency: string) => {
    if (price == null) return 'Gratuit';
    const sym = currency === 'EUR' ? '\u20AC' : currency === 'USD' ? '$' : currency;
    return `${price.toFixed(2)}${sym}/mois`;
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{affiliateName}</Text>
          <Text style={s.headerSub}>{programs.length} programme{programs.length > 1 ? 's' : ''} disponible{programs.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={programs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.center}>
              <ShoppingCart color={theme.textMuted} size={40} />
              <Text style={s.emptyTxt}>Aucun programme disponible</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              {item.image_url && (
                <Image source={{ uri: item.image_url }} style={s.cardImage} />
              )}
              <View style={s.cardBody}>
                <Text style={s.cardName}>{item.name}</Text>
                {item.description && <Text style={s.cardDesc} numberOfLines={3}>{item.description}</Text>}

                <View style={s.cardFooter}>
                  <View style={s.priceTag}>
                    <Text style={s.priceTxt}>{formatPrice(item.price, item.currency)}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.buyBtn}
                    activeOpacity={0.8}
                    onPress={() => Linking.openURL(item.url)}
                  >
                    <ExternalLink color="#FFF" size={14} />
                    <Text style={s.buyBtnTxt}>Acheter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
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
    backgroundColor: t.card, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: t.border, marginBottom: 14,
  },
  cardImage: { width: '100%', height: 140, resizeMode: 'cover' },
  cardBody: { padding: 16 },
  cardName: { fontSize: 16, fontWeight: '900', color: t.text },
  cardDesc: { fontSize: 12, color: t.textMuted, marginTop: 6, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  priceTag: {
    backgroundColor: `${t.accent}15`, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  priceTxt: { fontSize: 14, fontWeight: '900', color: t.accent },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: t.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  buyBtnTxt: { fontSize: 13, fontWeight: '800', color: '#FFF' },
}); }
