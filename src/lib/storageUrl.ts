// ────────────────────────────────────────────────────────────────────────────
// Résolution d'URL de fichier Supabase Storage (buckets PRIVÉS).
//
// Contexte (Lot 1C-c) : les buckets `documents` et `message-attachments` étaient
// PUBLICS — n'importe qui avec l'URL lisait un PDF de box ou une photo de
// conversation, sans compte. En les passant privés, toutes les URL déjà
// stockées en base (`box_documents.file_url`, `group_messages.attachment_url`)
// cessent de fonctionner : ce sont des URL « /object/public/… » figées.
//
// Ce module absorbe la bascule sans reprise de données. Il accepte les TROIS
// formes qui cohabitent en base et rend une URL affichable :
//   1. URL publique historique  → on en extrait le chemin, puis on signe.
//   2. Chemin nu (nouveaux écrits, ex. `<uid>/1712345.pdf`) → on signe.
//   3. URL externe (GIF Giphy/Tenor, transitant par la même colonne) → rendue
//      telle quelle, jamais signée.
//
// Les fonctions de parsing sont pures et testées ; la signature réseau est
// injectable (`signer`) pour rester hors des tests unitaires.
// ────────────────────────────────────────────────────────────────────────────

/** Durée de vie par défaut d'une URL signée (secondes). */
export const SIGNED_URL_TTL = 3600;

/** Marge avant expiration : on re-signe un peu avant la fin pour éviter un 400. */
const CACHE_MARGIN_S = 120;

/**
 * Extrait le chemin objet (`<uid>/1712345.pdf`) d'une valeur stockée en base.
 * Renvoie `null` si la valeur ne concerne PAS ce bucket (URL externe, autre
 * bucket, valeur vide) — l'appelant doit alors utiliser la valeur telle quelle.
 */
export function storagePathFromValue(value: string | null | undefined, bucket: string): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  // Cas 2 : chemin nu (pas de schéma). On refuse les chemins absolus/parents.
  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith('/') || raw.includes('..')) return null;
    return raw;
  }

  // Cas 1 : URL Supabase Storage — public, signée, ou authentifiée.
  //   /storage/v1/object/public/<bucket>/<path>
  //   /storage/v1/object/sign/<bucket>/<path>?token=…
  //   /storage/v1/object/<bucket>/<path>
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    return null;
  }
  const marker = '/storage/v1/object/';
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null; // cas 3 : URL externe

  let rest = pathname.slice(idx + marker.length);
  for (const prefix of ['public/', 'sign/', 'authenticated/']) {
    if (rest.startsWith(prefix)) { rest = rest.slice(prefix.length); break; }
  }
  const expected = `${bucket}/`;
  if (!rest.startsWith(expected)) return null; // objet d'un AUTRE bucket
  const path = rest.slice(expected.length);
  if (!path) return null;

  try { return decodeURIComponent(path); } catch { return path; }
}

/** true si la valeur doit être affichée telle quelle (GIF externe, http tiers). */
export function isExternalValue(value: string | null | undefined, bucket: string): boolean {
  const raw = (value ?? '').trim();
  return !!raw && /^https?:\/\//i.test(raw) && storagePathFromValue(raw, bucket) === null;
}

export type Signer = (bucket: string, path: string, expiresIn: number) => Promise<string | null>;

type CacheEntry = { url: string; expiresAtMs: number };
const cache = new Map<string, CacheEntry>();

/** Vide le cache (changement de compte, tests). */
export function clearSignedUrlCache(): void { cache.clear(); }

/** Signer par défaut : Supabase. Import paresseux → aucun effet de bord en test. */
const defaultSigner: Signer = async (bucket, path, expiresIn) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { supabase } = require('./supabase');
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
};

/**
 * Rend une URL affichable pour une valeur stockée en base.
 * - URL externe → renvoyée telle quelle.
 * - Objet du bucket → URL signée (mise en cache jusqu'à peu avant expiration).
 * - Échec de signature → on renvoie la valeur d'origine (dégradation douce :
 *   on n'affiche jamais un écran cassé à cause du storage).
 */
export async function resolveStorageUrl(
  value: string | null | undefined,
  bucket: string,
  opts: { signer?: Signer; expiresIn?: number; now?: () => number } = {},
): Promise<string | null> {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  const path = storagePathFromValue(raw, bucket);
  if (path === null) return raw; // externe / non concerné

  const expiresIn = opts.expiresIn ?? SIGNED_URL_TTL;
  const now = (opts.now ?? Date.now)();
  const key = `${bucket}:${path}`;

  const hit = cache.get(key);
  if (hit && hit.expiresAtMs > now) return hit.url;

  const signer = opts.signer ?? defaultSigner;
  const signed = await signer(bucket, path, expiresIn);
  if (!signed) return raw; // dégradation douce

  cache.set(key, { url: signed, expiresAtMs: now + Math.max(0, expiresIn - CACHE_MARGIN_S) * 1000 });
  return signed;
}

/** Version multiple : résout un lot de valeurs (listes de messages/documents). */
export async function resolveStorageUrls(
  values: Array<string | null | undefined>,
  bucket: string,
  opts: { signer?: Signer; expiresIn?: number; now?: () => number } = {},
): Promise<Array<string | null>> {
  return Promise.all(values.map((v) => resolveStorageUrl(v, bucket, opts)));
}
