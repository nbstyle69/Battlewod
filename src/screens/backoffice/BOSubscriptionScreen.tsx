import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState, Platform,
} from 'react-native';
import { ArrowLeft, Crown, Clock, CreditCard, ExternalLink, Shield, Zap, Check } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { openExternalUrl, pollUntilTrue } from '../../lib/openCheckout';
import { supabase } from '../../lib/supabase';

const PRICING_URL = 'https://the-hub-rho.vercel.app/pricing';

const FEATURES = [
  'Membres illimités',
  'Coachs illimités',
  'WODs illimités',
  'Horaires & Réservations',
  'Messages & Groupes illimités',
  'Analytics box avancés',
  'Export CSV',
  'Notifications push custom',
  'Tournois & Compétitions',
  'Référencement annuaire AthleX',
  'Gamification (badges, ELO)',
  'Rapport mensuel auto',
  'Support prioritaire',
];

export default function BOSubscriptionScreen({ navigation }: any) {
  const { currentBox, boxSubscription, isBoxActive, daysLeftTrial, refreshSubscription } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refreshSubscription();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refreshSubscription]);

  const status = boxSubscription?.status ?? 'trialing';
  const isTrialing = status === 'trialing';
  const isActive = status === 'active';
  const isPastDue = status === 'past_due';
  const isExpired = status === 'canceled' || status === 'expired' || (!isBoxActive && isTrialing);

  async function handleCheckout() {
    if (!currentBox) return;
    setLoadingCheckout(true);
    const url = `${PRICING_URL}?box_id=${currentBox.id}`;
    const opened = await openExternalUrl(url, 'Impossible d\'ouvrir la page de souscription.');
    if (!opened) { setLoadingCheckout(false); return; }

    // Poll DB every 2s for up to 60s to detect the new subscription status.
    const currentStatus = boxSubscription?.status;
    pollUntilTrue(async () => {
      const { data } = await supabase.from('box_subscriptions')
        .select('status')
        .eq('box_id', currentBox.id)
        .maybeSingle();
      return !!data && (data as any).status !== currentStatus;
    }).finally(() => {
      refreshSubscription();
      setLoadingCheckout(false);
    });
  }

  async function handlePortal() {
    if (!currentBox) return;
    const opened = await openExternalUrl(
      `${PRICING_URL}/manage?box_id=${currentBox.id}`,
      'Impossible d\'ouvrir le portail.',
    );
    if (!opened) return;
    // Refresh once the user comes back (AppState listener will also fire).
    setTimeout(() => refreshSubscription(), 3000);
  }

  function getStatusLabel() {
    if (isActive) return { text: 'Plan Complet actif', color: theme.success, icon: Crown };
    if (isPastDue) return { text: 'Paiement en attente', color: theme.error, icon: CreditCard };
    if (isExpired) return { text: 'Essai terminé', color: theme.error, icon: Clock };
    if (isTrialing && daysLeftTrial > 0) return { text: `Essai gratuit · J-${daysLeftTrial}`, color: theme.accent, icon: Zap };
    return { text: 'Aucun abonnement', color: theme.textMuted, icon: Shield };
  }

  const statusInfo = getStatusLabel();
  const StatusIcon = statusInfo.icon;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Mon abonnement</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {/* Status card */}
        <View style={[S.statusCard, { borderColor: `${statusInfo.color}30` }]}>
          <View style={[S.statusIcon, { backgroundColor: `${statusInfo.color}15` }]}>
            <StatusIcon color={statusInfo.color} size={28} />
          </View>
          <Text style={[S.statusTitle, { color: statusInfo.color }]}>{statusInfo.text}</Text>
          {boxSubscription?.is_early_adopter && (
            <Text style={[S.earlyBadge, { color: theme.gold }]}>🏅 Box Fondateur</Text>
          )}
          {isTrialing && daysLeftTrial > 0 && (
            <Text style={S.statusDesc}>
              Ton essai expire le{' '}
              {boxSubscription?.trial_ends_at
                ? new Date(boxSubscription.trial_ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}
            </Text>
          )}
          {isActive && boxSubscription?.current_period_end && (
            <Text style={S.statusDesc}>
              Prochain renouvellement le{' '}
              {new Date(boxSubscription.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          )}
        </View>

        {/* Plan card */}
        <View style={S.planCard}>
          <View style={S.planHeader}>
            <Text style={S.planName}>Plan Complet</Text>
            <View style={S.priceRow}>
              <Text style={S.priceAmount}>79€</Text>
              <Text style={S.pricePeriod}>/mois</Text>
            </View>
          </View>
          <Text style={S.planAnnual}>ou 749€/an (2 mois offerts)</Text>

          <View style={S.featureList}>
            {FEATURES.map((f) => (
              <View key={f} style={S.featureRow}>
                <Check color={theme.success} size={14} />
                <Text style={S.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        {Platform.OS === 'ios' ? (
          <View style={S.iosNotice}>
            <Text style={S.iosNoticeTitle}>Gestion de l'abonnement via le web</Text>
            <Text style={S.iosNoticeText}>
              Pour souscrire, modifier ou annuler ton abonnement AthleX Pro, connecte-toi sur
              athlex.app depuis un navigateur. Les changements sont automatiquement synchronisés dans l'app.
            </Text>
          </View>
        ) : (
          <>
            {!isActive && (
              <TouchableOpacity
                style={S.primaryBtn}
                onPress={handleCheckout}
                disabled={loadingCheckout}
                activeOpacity={0.85}
              >
                {loadingCheckout ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <CreditCard color="#fff" size={18} />
                    <Text style={S.primaryBtnText}>
                      {isExpired ? 'Souscrire — 79€/mois' : 'Souscrire maintenant'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {(isActive || isPastDue) && boxSubscription?.stripe_customer_id && (
              <TouchableOpacity
                style={S.secondaryBtn}
                onPress={handlePortal}
                activeOpacity={0.85}
              >
                <ExternalLink color={theme.accent} size={16} />
                <Text style={S.secondaryBtnText}>Gérer mon abonnement</Text>
              </TouchableOpacity>
            )}

            {isExpired && (
              <Text style={S.retentionText}>
                Tes données sont conservées 30 jours. Souscris pour retrouver ton back-office complet.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  content: { padding: 20, gap: 20, paddingBottom: 140 },
  statusCard: {
    backgroundColor: t.card, borderRadius: 18, padding: 24,
    borderWidth: 1.5, alignItems: 'center', gap: 10,
  },
  statusIcon: {
    width: 60, height: 60, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  statusTitle: { fontSize: 18, fontWeight: '900' },
  earlyBadge: { fontSize: 13, fontWeight: '800' },
  statusDesc: { fontSize: 12, color: t.textSecondary, textAlign: 'center' },
  planCard: {
    backgroundColor: t.card, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: t.border,
  },
  planHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
  },
  planName: { fontSize: 18, fontWeight: '900', color: t.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceAmount: { fontSize: 32, fontWeight: '900', color: t.accent },
  pricePeriod: { fontSize: 14, fontWeight: '700', color: t.textSecondary },
  planAnnual: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  featureList: { marginTop: 16, gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: t.text, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: t.accent, borderRadius: 16, paddingVertical: 18,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: t.card, borderRadius: 16, paddingVertical: 16,
    borderWidth: 1.5, borderColor: t.border,
  },
  secondaryBtnText: { color: t.accent, fontSize: 14, fontWeight: '800' },
  retentionText: {
    fontSize: 12, color: t.textMuted, textAlign: 'center',
    lineHeight: 18, paddingHorizontal: 12,
  },
  iosNotice: {
    backgroundColor: t.card, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: t.border, gap: 8,
  },
  iosNoticeTitle: { fontSize: 15, fontWeight: '800', color: t.text, textAlign: 'center' },
  iosNoticeText: { fontSize: 13, color: t.textSecondary, lineHeight: 20, textAlign: 'center' },
}); }
