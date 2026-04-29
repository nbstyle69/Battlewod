import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, AppState,
} from 'react-native';
import { Lock, CreditCard, Check, LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { openExternalUrl, pollUntilTrue } from '../../lib/openCheckout';
import { supabase } from '../../lib/supabase';

const PRICING_URL = 'https://the-hub-rho.vercel.app/pricing';

const FEATURES = [
  'Membres illimités',
  'Coachs illimités',
  'WODs & Réservations',
  'Analytics & Rapports',
  'Notifications push',
  'Annuaire AthleX',
  'Gamification complète',
  'Support prioritaire',
];

export default function BOPaywallScreen() {
  const { currentBox, signOut, refreshSubscription } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [loading, setLoading] = useState(false);
  const appState = useRef(AppState.currentState);

  // Refresh subscription whenever the user returns to the app (e.g. after
  // completing the Stripe checkout in a browser).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refreshSubscription();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refreshSubscription]);

  async function handleCheckout() {
    if (!currentBox) return;
    setLoading(true);
    const url = `${PRICING_URL}?box_id=${currentBox.id}`;
    const opened = await openExternalUrl(url, 'Impossible d\'ouvrir la page de souscription.');
    if (!opened) { setLoading(false); return; }

    // Poll DB every 2s for up to 60s to detect the new subscription status.
    pollUntilTrue(async () => {
      const { data } = await (supabase.from as any)('box_subscriptions')
        .select('status')
        .eq('box_id', currentBox.id)
        .maybeSingle();
      return !!data && (data as any).status === 'active';
    }).finally(() => {
      refreshSubscription();
      setLoading(false);
    });
  }

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={S.inner} showsVerticalScrollIndicator={false}>
        <View style={S.lockIcon}>
          <Lock color={theme.error} size={40} />
        </View>

        <Text style={S.title}>Ton essai est terminé</Text>
        <Text style={S.subtitle}>
          Souscris au plan complet pour retrouver l'accès à ton back-office et continuer à gérer ta box.
        </Text>

        <View style={S.planCard}>
          <View style={S.planHeader}>
            <Text style={S.planName}>Plan Complet</Text>
            <View style={S.priceRow}>
              <Text style={S.price}>79€</Text>
              <Text style={S.pricePeriod}>/mois</Text>
            </View>
          </View>

          <View style={S.features}>
            {FEATURES.map((f) => (
              <View key={f} style={S.featureRow}>
                <Check color={theme.success} size={14} />
                <Text style={S.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={S.primaryBtn}
          onPress={handleCheckout}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <CreditCard color="#fff" size={18} />
              <Text style={S.primaryBtnText}>Souscrire — 79€/mois</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={S.retention}>
          Tes données (membres, WODs, scores) sont conservées 30 jours.{'\n'}
          Souscris maintenant pour ne rien perdre.
        </Text>

        <TouchableOpacity
          style={S.logoutBtn}
          onPress={() => Alert.alert('Déconnexion', 'Confirmer ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Déconnexion', style: 'destructive', onPress: signOut },
          ])}
          activeOpacity={0.7}
        >
          <LogOut color={theme.textMuted} size={16} />
          <Text style={S.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  inner: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 48, gap: 20,
  },
  lockIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: `${t.error}12`,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 26, fontWeight: '900', color: t.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: t.textSecondary, textAlign: 'center', lineHeight: 22,
    paddingHorizontal: 8,
  },
  planCard: {
    width: '100%', backgroundColor: t.card, borderRadius: 18, padding: 20,
    borderWidth: 1.5, borderColor: `${t.accent}30`, gap: 14,
  },
  planHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
  },
  planName: { fontSize: 18, fontWeight: '900', color: t.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontSize: 28, fontWeight: '900', color: t.accent },
  pricePeriod: { fontSize: 13, fontWeight: '700', color: t.textSecondary },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: t.text, fontWeight: '600' },
  primaryBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: t.accent, borderRadius: 16, paddingVertical: 18,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  retention: {
    fontSize: 12, color: t.textMuted, textAlign: 'center',
    lineHeight: 18, paddingHorizontal: 12,
  },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12,
  },
  logoutText: { fontSize: 13, color: t.textMuted },
}); }
