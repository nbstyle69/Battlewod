import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Crown, AlertTriangle, Clock, Zap } from 'lucide-react-native';
import { useTheme, AppTheme } from '../context/ThemeContext';
import { SubscriptionStatus } from '../types';

interface Props {
  daysLeft: number;
  status: SubscriptionStatus;
  isEarlyAdopter?: boolean;
  onUpgrade: () => void;
}

export default function TrialBanner({ daysLeft, status, isEarlyAdopter, onUpgrade }: Props) {
  const { theme } = useTheme();

  if (status === 'active') {
    return (
      <View style={[styles.container, { backgroundColor: `${theme.success}12`, borderColor: `${theme.success}30` }]}>
        <Crown color={theme.success} size={18} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.success }]}>Plan Complet actif</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Toutes les fonctionnalités sont débloquées
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'past_due') {
    return (
      <TouchableOpacity
        style={[styles.container, { backgroundColor: `${theme.error}12`, borderColor: `${theme.error}30` }]}
        onPress={onUpgrade}
        activeOpacity={0.8}
      >
        <AlertTriangle color={theme.error} size={18} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.error }]}>Paiement échoué</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Mets à jour ton moyen de paiement pour continuer
          </Text>
        </View>
        <Text style={[styles.cta, { color: theme.error }]}>Gérer →</Text>
      </TouchableOpacity>
    );
  }

  if (status === 'canceled' || status === 'expired' || daysLeft <= 0) {
    return (
      <TouchableOpacity
        style={[styles.container, { backgroundColor: `${theme.error}12`, borderColor: `${theme.error}30` }]}
        onPress={onUpgrade}
        activeOpacity={0.8}
      >
        <AlertTriangle color={theme.error} size={18} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.error }]}>Essai terminé</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Souscris pour continuer à utiliser le back-office
          </Text>
        </View>
        <Text style={[styles.cta, { color: theme.error }]}>Souscrire →</Text>
      </TouchableOpacity>
    );
  }

  // Trial active
  const isUrgent = daysLeft <= 3;
  const isWarning = daysLeft <= 7;
  const color = isUrgent ? theme.error : isWarning ? '#f59e0b' : theme.accent;
  const bgColor = isUrgent ? `${theme.error}12` : isWarning ? '#f59e0b12' : `${theme.accent}08`;
  const borderColor = isUrgent ? `${theme.error}30` : isWarning ? '#f59e0b30' : `${theme.accent}20`;
  const Icon = isUrgent ? AlertTriangle : isWarning ? Clock : Zap;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: bgColor, borderColor }]}
      onPress={onUpgrade}
      activeOpacity={0.8}
    >
      <Icon color={color} size={18} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color }]}>
          {isEarlyAdopter ? '🏅 Fondateur · ' : ''}Essai gratuit · J-{daysLeft}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {isUrgent
            ? 'Plus que quelques jours ! Souscris pour ne rien perdre.'
            : `${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''} sur ton essai`}
        </Text>
      </View>
      <Text style={[styles.cta, { color }]}>Voir →</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '800' },
  subtitle: { fontSize: 11, lineHeight: 15 },
  cta: { fontSize: 12, fontWeight: '800' },
});
