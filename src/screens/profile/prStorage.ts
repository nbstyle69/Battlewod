// Stable storage helpers for personal records (PR) kept in profiles.personal_records.
//
// Storage keys used to be prefixed with the (hardcoded) category display label,
// e.g. `Haltérophilie_Back Squat`. That coupled the DB keys to a human label:
// renaming a category in code would orphan every PR already saved under the old
// label. We now key on a stable, language-agnostic slug (`weightlifting_…`) and
// keep a read-time fallback to the legacy prefixes so pre-migration data still
// resolves. The one-off migration rewrites existing keys to the new slugs.

export const PR_CATEGORY_SLUGS = ['weightlifting', 'gymnastics', 'benchmarks', 'cardio'] as const;
export type PrCategorySlug = (typeof PR_CATEGORY_SLUGS)[number];

// Legacy label prefix -> stable slug (drives both read fallback and migration).
export const LEGACY_PREFIX_TO_SLUG: Record<string, PrCategorySlug> = {
  'Haltérophilie': 'weightlifting',
  'Gymnastics': 'gymnastics',
  'Benchmarks CrossFit': 'benchmarks',
  'Cardio & Endurance': 'cardio',
};

const SLUG_TO_LEGACY_PREFIX: Record<PrCategorySlug, string> = Object.fromEntries(
  Object.entries(LEGACY_PREFIX_TO_SLUG).map(([label, slug]) => [slug, label]),
) as Record<PrCategorySlug, string>;

// Libellés d'haltérophilie de la page Records : ce sont eux qui composent les
// clés `weightlifting_<Label>` en base. Un seul espace de libellés — l'écran
// Records ET l'alimentation automatique des 1RM (services/strengthPR) lisent
// cette liste, sinon un 1RM écrit par une séance atterrirait sur une clé que la
// page n'affiche pas (leçon du lot 1 sur les clés de mouvement).
export const WEIGHTLIFTING_PR_MOVEMENTS = [
  'Back Squat', 'Front Squat', 'Deadlift', 'Bench Press', 'Strict Press',
  'Push Press', 'Push Jerk', 'Split Jerk', 'Squat Clean', 'Power Clean',
  'Hang Power Clean', 'Hang Squat Clean', 'Squat Snatch', 'Power Snatch',
  'Hang Power Snatch', 'Hang Squat Snatch', 'Clean & Jerk', 'Overhead Squat',
  'Thruster',
] as const;

const LOWER_TO_WEIGHTLIFTING_LABEL: Record<string, string> = Object.fromEntries(
  WEIGHTLIFTING_PR_MOVEMENTS.map(m => [m.toLowerCase(), m]),
);

/** Libellé exact de la page Records pour un nom de mouvement, sinon `null`. */
export function weightliftingPrLabel(name: string): string | null {
  return LOWER_TO_WEIGHTLIFTING_LABEL[(name ?? '').toLowerCase().trim()] ?? null;
}

export function prKey(slug: PrCategorySlug, movement: string): string {
  return `${slug}_${movement}`;
}

export function prDateKey(slug: PrCategorySlug, movement: string): string {
  return `${slug}_${movement}_date`;
}

/**
 * Clé de provenance : `strength_set_logs.id` de la série qui a établi ce record.
 *
 * Un record sans provenance n'est pas auditable — ni par l'athlète qui se
 * demande d'où sort ce chiffre, ni par le coach. La déduire de la date la plus
 * proche mentirait dès qu'il y a deux séances le même jour ; on stocke donc
 * l'identifiant exact. Absente = record saisi à la main.
 */
export function prSourceKey(slug: PrCategorySlug, movement: string): string {
  return `${slug}_${movement}_src`;
}

// Reads a PR value tolerating both the new slug key and the legacy label key.
export function readPr(
  records: Record<string, string> | undefined,
  slug: PrCategorySlug,
  movement: string,
): string | undefined {
  if (!records) return undefined;
  const modern = records[prKey(slug, movement)];
  if (modern !== undefined) return modern;
  return records[`${SLUG_TO_LEGACY_PREFIX[slug]}_${movement}`];
}

export function readPrDate(
  records: Record<string, string> | undefined,
  slug: PrCategorySlug,
  movement: string,
): string | undefined {
  if (!records) return undefined;
  const modern = records[prDateKey(slug, movement)];
  if (modern !== undefined) return modern;
  return records[`${SLUG_TO_LEGACY_PREFIX[slug]}_${movement}_date`];
}

// Rewrites legacy label-prefixed keys to stable slug keys and drops the
// `_featured_badges` slot (moved to its own column). Idempotent: already-slugged
// keys pass through untouched. Modern keys win over legacy ones on collision.
export function normalizePrRecords(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const rewritten: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(raw)) {
    if (key === '_featured_badges') continue;
    // 4.6 : tolerer les valeurs NUMERIQUES (coercition) au lieu de les jeter —
    // un PR enregistre comme number etait silencieusement perdu.
    let value: string;
    if (typeof rawValue === 'string') value = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) value = String(rawValue);
    else continue;
    const legacyPrefix = Object.keys(LEGACY_PREFIX_TO_SLUG).find(p => key.startsWith(`${p}_`));
    if (legacyPrefix) {
      const slug = LEGACY_PREFIX_TO_SLUG[legacyPrefix];
      rewritten[`${slug}_${key.slice(legacyPrefix.length + 1)}`] = value;
    } else {
      out[key] = value;
    }
  }
  return { ...rewritten, ...out };
}
