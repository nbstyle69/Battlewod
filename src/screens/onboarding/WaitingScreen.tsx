import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Hash, Building2, LogOut, ArrowRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import GlassBackground from '../../components/glass/GlassBackground';
import { OWNER_ONBOARDING_URL } from '../../lib/urls';

export default function WaitingScreen({ navigation }: any) {
  const { user, signOut, skipBox } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.inner}>
        <Text style={S.emoji}>🏋️</Text>
        <Text style={S.title}>Rejoins ta box</Text>
        <Text style={S.subtitle}>
          Bonjour {user?.username ?? 'Athlète'} !{'\n'}
          Pour accéder au contenu, tu dois rejoindre une box avec un code d'invitation
          ou créer la tienne.
        </Text>

        <View style={S.actions}>
          <TouchableOpacity
            style={S.primaryBtn}
            onPress={() => navigation.navigate('JoinBox')}
            activeOpacity={0.85}
          >
            <Hash color="#fff" size={18} />
            <Text style={S.primaryBtnText}>J'ai un code d'invitation</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={S.secondaryBtn}
            onPress={() => Linking.openURL(OWNER_ONBOARDING_URL)}
            activeOpacity={0.85}
          >
            <Building2 color={theme.accent} size={18} />
            <Text style={S.secondaryBtnText}>Je suis gérant · s'abonner sur athlex.app</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={S.skipBtn}
            onPress={skipBox}
            activeOpacity={0.7}
          >
            <Text style={S.skipBtnText}>Je n'ai pas de code d'invitation</Text>
            <ArrowRight color={theme.textMuted} size={14} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={S.signOutBtn} onPress={signOut} activeOpacity={0.7}>
        <LogOut color={theme.textMuted} size={16} />
        <Text style={S.signOutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  inner: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, gap: 20,
  },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: '900', color: theme.text, textAlign: 'center' },
  subtitle: {
    fontSize: 15, color: theme.textSecondary, textAlign: 'center',
    lineHeight: 22,
  },
  actions: { width: '100%', gap: 12, marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent,
    borderRadius: 16, padding: 18,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.card,
    borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: theme.border,
  },
  secondaryBtnText: { color: theme.accent, fontSize: 15, fontWeight: '800' },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
  },
  skipBtnText: { fontSize: 13, color: theme.textMuted, textDecorationLine: 'underline' },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', paddingBottom: 48,
  },
  signOutText: { fontSize: 13, color: theme.textMuted },
}); }
