// Lecture de SON propre profil.
//
// Lot 0-bis : `full_name`, `gender` et `personal_records` ne sont plus lisibles
// en COLONNE par `authenticated` (elles l'étaient sur n'importe quel profil).
// Un droit de colonne révoqué fait échouer TOUTE la requête qui la mentionne :
// un `select('personal_records')`, même sur sa propre ligne, tombe en 42501.
// La lecture « soi » passe donc par `get_my_profile()`, seul lecteur autorisé
// de ces champs pour le compte courant.

import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';

export type MyProfileRow = Database['public']['Tables']['profiles']['Row'];

/** Profil complet du compte connecté, ou `null` si la lecture échoue. */
export async function fetchMyProfile(): Promise<MyProfileRow | null> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) return null;
  const rows = (data ?? []) as MyProfileRow[];
  return rows[0] ?? null;
}

/** 1RM du compte connecté (`{}` si la page Records est vide ou illisible). */
export async function fetchMyPersonalRecords(): Promise<Record<string, unknown>> {
  const profile = await fetchMyProfile();
  return (profile?.personal_records ?? {}) as Record<string, unknown>;
}
