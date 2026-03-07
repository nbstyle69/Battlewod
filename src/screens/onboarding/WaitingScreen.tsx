import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Hash, Building2, LogOut, ArrowRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../theme/colors';

export default function WaitingScreen({ navigation }: any) {
  const { user, signOut, skipBox } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.emoji}>🏋️</Text>
        <Text style={styles.title}>Rejoins ta box</Text>
        <Text style={styles.subtitle}>
          Bonjour {user?.username ?? 'Athlète'} !{'\n'}
          Pour accéder au contenu, tu dois rejoindre une box avec un code d'invitation
          ou créer la tienne.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('JoinBox')}
            activeOpacity={0.85}
          >
            <Hash color="#fff" size={18} />
            <Text style={styles.primaryBtnText}>J'ai un code d'invitation</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('CreateBox')}
            activeOpacity={0.85}
          >
            <Building2 color={Colors.primary} size={18} />
            <Text style={styles.secondaryBtnText}>Je suis gérant · créer ma box</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={skipBox}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>Je n'ai pas de code d'invitation</Text>
            <ArrowRight color={Colors.textMuted} size={14} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
        <LogOut color={Colors.textMuted} size={16} />
        <Text style={styles.signOutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, gap: 20,
  },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 15, color: Colors.textSecondary, textAlign: 'center',
    lineHeight: 22,
  },
  actions: { width: '100%', gap: 12, marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary,
    borderRadius: 16, padding: 18,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.card,
    borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  secondaryBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '800' },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
  },
  skipBtnText: { fontSize: 13, color: Colors.textMuted, textDecorationLine: 'underline' },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', paddingBottom: 48,
  },
  signOutText: { fontSize: 13, color: Colors.textMuted },
});
