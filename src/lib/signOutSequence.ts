/**
 * Ordre de déconnexion : le jeton de notification s'efface AVANT de fermer la
 * session Supabase — `push_tokens` est verrouillé par RLS, donc après le
 * logout le DELETE tombe en 401 et le téléphone garderait les notifications
 * de l'ancien compte. Un échec d'effacement est remonté (Sentry), pas avalé,
 * et n'empêche jamais la déconnexion.
 */
export type SignOutDeps = {
  removePushToken: (() => Promise<void>) | null;
  signOut: () => Promise<unknown>;
  onRemovePushError: (e: unknown) => void;
};

export async function runSignOutSequence({ removePushToken, signOut, onRemovePushError }: SignOutDeps): Promise<void> {
  if (removePushToken) {
    try {
      await removePushToken();
    } catch (e) {
      onRemovePushError(e);
    }
  }
  await signOut();
}
