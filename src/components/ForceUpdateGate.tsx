import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Platform, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

// iOS App Store & Android Play Store URLs — update with your real IDs
const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/athlex/id6744381102',
  android: 'https://play.google.com/store/apps/details?id=com.athlex.app',
}) ?? '';

/** Compare semver strings: returns true if current < required */
function isVersionLower(current: string, required: string): boolean {
  const c = current.split('.').map(Number);
  const r = required.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const cv = c[i] ?? 0;
    const rv = r[i] ?? 0;
    if (cv < rv) return true;
    if (cv > rv) return false;
  }
  return false;
}

interface Props {
  children: React.ReactNode;
}

export default function ForceUpdateGate({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'min_version')
          .single();

        const minVersion = data?.value ?? '0.0.0';
        if (isVersionLower(APP_VERSION, minVersion)) {
          setBlocked(true);
        }
      } catch {
        // If check fails, don't block the user
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🔄</Text>
        <Text style={styles.title}>Mise à jour requise</Text>
        <Text style={styles.subtitle}>
          Une nouvelle version d'AthleX est disponible.{'\n'}
          Mets à jour pour continuer à utiliser l'app.
        </Text>
        <Text style={styles.version}>Version installée : {APP_VERSION}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openURL(STORE_URL)}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Mettre à jour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  version: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
