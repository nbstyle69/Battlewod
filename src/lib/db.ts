import { captureError } from './sentry';

// `data` n'est PAS `T | null` : les réponses PostgREST sont une union
// discriminée (succès `{data, error: null}` / échec `{data: null, error}`), et
// un paramètre en `T | null` fait inférer `T = never` sur cette union.
type QueryResult<T> = { data: T; error: unknown };

/**
 * Lit une requête Supabase en REMONTANT l'erreur (Sentry + contexte écran) au
 * lieu de l'avaler. Comportement utilisateur INCHANGÉ : renvoie les données
 * telles quelles (ou null). But : un refus RLS / une panne réseau deviennent
 * visibles en minutes au lieu de rester un écran vide silencieux.
 *
 * Contexte (build/Lot 5) : ~187 lectures faisaient `const { data } = await …`
 * sans jamais lire `error` — c'est ce qui a laissé l'écran BO membres vide
 * 9 jours sans le moindre signal. On n'INTERROMPT pas (pas d'exception) : on
 * observe. À appliquer aux lectures sensibles (tables durcies, « 0 ligne »
 * plausible), pas en masse.
 */
export async function readRows<T>(
  query: PromiseLike<QueryResult<T>>,
  ctx: { screen: string; action: string },
): Promise<T | null> {
  const { data, error } = await query;
  if (error) captureError(error, ctx);
  return data ?? null;
}

/**
 * Variante pour une écriture : renvoie true si OK, remonte l'erreur sinon.
 * Ne masque pas l'échec — l'appelant décide quoi afficher, mais l'erreur est
 * toujours tracée.
 */
export async function writeOk(
  query: PromiseLike<{ error: unknown }>,
  ctx: { screen: string; action: string },
): Promise<boolean> {
  const { error } = await query;
  if (error) { captureError(error, ctx); return false; }
  return true;
}
