import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { captureError } from './sentry';

/**
 * « Présentation vue » appartient au COMPTE (profiles.onboarding_completed_at),
 * pas à l'appareil. La clé locale n'est qu'un cache : elle porte l'id du compte
 * qui vient de terminer, pour ne pas rejouer la présentation dans la même
 * session si l'écriture serveur n'est pas encore relue ou a échoué (hors
 * ligne). Elle est purgée au signOut (3.8) : à la reconnexion, seul le serveur
 * décide. Le tutoriel guidé de l'interface (@athlex:tourDone) est un autre
 * sujet, lié à l'appareil, et ne passe pas par ici.
 */
export const ONBOARDING_KEY = '@athlex:onboardingDone';

export interface OnboardingSources {
  /** profiles.onboarding_completed_at relu par get_my_profile. */
  serverCompletedAt: string | null | undefined;
  /** Valeur de la clé locale (id du compte qui a terminé sur cet appareil). */
  cachedUserId: string | null;
  userId: string;
}

/** Le serveur décide ; le cache ne compte que pour le même compte. */
export function resolveOnboardingDone({ serverCompletedAt, cachedUserId, userId }: OnboardingSources): boolean {
  if (serverCompletedAt) return true;
  return cachedUserId === userId;
}

export async function readOnboardingCache(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ONBOARDING_KEY);
  } catch {
    return null;
  }
}

/**
 * Fin de présentation : le serveur d'abord (idempotent, premier horodatage
 * conservé), le cache ensuite. Un échec serveur ne bloque pas l'utilisateur —
 * il part dans Sentry et le cache couvre la session en cours.
 */
export async function markOnboardingCompleted(userId: string): Promise<string | null> {
  let completedAt: string | null = null;
  try {
    const { data, error } = await supabase.rpc('mark_onboarding_completed');
    if (error) throw error;
    completedAt = data ?? null;
  } catch (e) {
    captureError(e, { action: 'markOnboardingCompleted', userId });
  }
  await AsyncStorage.setItem(ONBOARDING_KEY, userId).catch(() => {});
  return completedAt;
}
