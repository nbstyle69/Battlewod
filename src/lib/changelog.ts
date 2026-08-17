import { supabase } from './supabase';
import { readRows } from './db';

/**
 * Fenêtre des nouveautés : l'écran Nouveautés n'affiche que les N entrées les
 * plus récentes, donc il ne peut marquer « lu » que celles-là. Le compteur de
 * la cloche DOIT porter sur la même fenêtre, sinon il compte des entrées que
 * l'utilisateur n'a aucun moyen d'atteindre — c'est ce qui figeait le badge sur
 * « 9+ » (68 entrées en base, 50 marquables : résidu 18 permanent).
 */
export const CHANGELOG_WINDOW = 50;

/** Ids des nouveautés de la fenêtre, de la plus récente à la plus ancienne. */
export async function fetchChangelogWindowIds(
  ctx: { screen: string; action: string },
): Promise<string[]> {
  const rows = await readRows(
    supabase
      .from('app_changelog')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(CHANGELOG_WINDOW),
    ctx,
  );
  return (rows ?? []).map(r => r.id);
}

/**
 * Nombre de nouveautés non lues : anti-jointure sur la fenêtre affichable, pas
 * une soustraction de deux totaux. Le compteur retombe donc réellement à 0
 * après une visite de l'écran, relance comprise.
 */
export async function countUnreadChangelog(
  userId: string,
  ctx: { screen: string; action: string },
): Promise<number> {
  const ids = await fetchChangelogWindowIds(ctx);
  if (ids.length === 0) return 0;

  const read = await readRows(
    supabase
      .from('changelog_reads')
      .select('changelog_id')
      .eq('user_id', userId)
      .in('changelog_id', ids),
    ctx,
  );
  return Math.max(0, ids.length - (read ?? []).length);
}
