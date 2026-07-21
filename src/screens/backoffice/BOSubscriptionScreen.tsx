import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState, Platform,
} from 'react-native';
import { ArrowLeft, Crown, Clock, CreditCard, ExternalLink, Shield, Zap, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { openExternalUrl, pollUntilTrue } from '../../lib/openCheckout';
import { supabase } from '../../lib/supabase';

const PRICING_URL = 'https://the-hub-rho.vercel.app/pricing';

export default function BOSubscriptionScreen({ navigation }: any) {
  const { currentBox, boxSubscription, isBoxActive, daysLeftTrial, refreshSubscription } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const S = createStyles(theme);
  const FEATURES = t('bo.subscription.features', { returnObjects: true }) as string[];
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
    const opened = await openExternalUrl(url, t('bo.subscription.cantOpenSub'));
    if (!opened) { setLoadingCheckout(false); return; }

    // Poll DB every 2s for up to 60s to detect the new subscription status.
    const currentStatus = boxSubscription?.status;
    pollUntilTrue(async () => {
      const { data } = await supabase.from('box_subscriptions')
        .select('status')
        .eq('box_id', currentBox.id)
        .maybeSingle();
      return !!data && data.status !== currentStatus;
    }).finally(() => {
      refreshSubscription();
      setLoadingCheckout(false);
    });
  }

  async function handlePortal() {
    if (!currentBox) return;
    const opened = await openExternalUrl(
      `${PRICING_URL}/manage?box_id=${currentBox.id}`,
      t('bo.subscription.cantOpenPortal'),
    );
    if (!opened) return;
    // Refresh once the user comes back (AppState listener will also fire).
    setTimeout(() => refreshSubscription(), 3000);
  }

  function getStatusLabel() {
    if (isActive) return { text: t('bo.subscription.statusActive'), color: theme.success, icon: Crown };
    if (isPastDue) return { text: t('bo.subscription.statusPastDue'), color: theme.error, icon: CreditCard };
    if (isExpired) return { text: t('bo.subscription.statusExpired'), color: theme.error, icon: Clock };
    if (isTrialing && daysLeftTrial > 0) return { text: t('bo.subscription.statusTrial', { n: daysLeftTrial }), color: theme.accent, icon: Zap };
    return { text: t('bo.subscription.statusNone'), color: theme.textMuted, icon: Shield };
  }

  const statusInfo = getStatusLabel();
  const StatusIcon = statusInfo.icon;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('bo.subscription.title')}</Text>
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
            <Text style={[S.earlyBadge, { color: theme.gold }]}>{t('bo.subscription.earlyAdopter')}</Text>
          )}
          {isTrialing && daysLeftTrial > 0 && (
            <Text style={S.statusDesc}>
              {t('bo.subscription.trialExpires', { date: boxSubscription?.trial_ends_at
                ? new Date(boxSubscription.trial_ends_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
                : '—' })}
            </Text>
          )}
          {isActive && boxSubscription?.current_period_end && (
            <Text style={S.statusDesc}>
              {t('bo.subscription.nextRenewal', { date: new Date(boxSubscription.current_period_end).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </Text>
          )}
        </View>

        {/* Plan card */}
        <View style={S.planCard}>
          <View style={S.planHeader}>
            <Text style={S.planName}>{t('bo.subscription.planName')}</Text>
            <View style={S.priceRow}>
              <Text style={S.priceAmount}>79€</Text>
              <Text style={S.pricePeriod}>{t('bo.subscription.perMonth')}</Text>
            </View>
          </View>
          <Text style={S.planAnnual}>{t('bo.subscription.annual')}</Text>

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
            <Text style={S.iosNoticeTitle}>{t('bo.subscription.iosTitle')}</Text>
            <Text style={S.iosNoticeText}>
              {t('bo.subscription.iosText')}
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
                      {isExpired ? t('bo.subscription.subscribePrice') : t('bo.subscription.subscribeNow')}
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
                <Text style={S.secondaryBtnText}>{t('bo.subscription.managePlan')}</Text>
              </TouchableOpacity>
            )}

            {isExpired && (
              <Text style={S.retentionText}>
                {t('bo.subscription.retention')}
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
