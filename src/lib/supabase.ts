import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Ces valeurs sont inlinées au moment du bundle : absentes, l'app est livrée
// sans aucun moyen d'atteindre le serveur. `createClient` lève alors
// « supabaseUrl is required. », un message qui ne dit pas d'où vient le trou.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuration Supabase absente du bundle (EXPO_PUBLIC_SUPABASE_URL / '
    + "EXPO_PUBLIC_SUPABASE_ANON_KEY) : l'update a été publié sans ses variables "
    + "d'environnement.",
  );
}

const getStorage = () => {
  if (Platform.OS === 'web') return undefined;
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  return AsyncStorage;
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
