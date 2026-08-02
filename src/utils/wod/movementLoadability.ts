/**
 * AthleX — Charges basées sur les PR de l'utilisateur (SPEC §6bis)
 * ===============================================================
 * Cascade de prescription de charge, pour le GÉNÉRATEUR PERSONNEL uniquement
 * (jamais les benchmarks ni les WOD de box) :
 *
 *   1. PR du mouvement connu  → 1RM × bande de conditioning du mouvement
 *   2. sinon                  → repli sur RX × facteur de niveau (moteur actuel)
 *   3. garde-fou              → PR hors plage physiologique ([20,400] kg) ignoré → repli RX
 *                               (un PR mal saisi retombe sur le comportement moteur actuel)
 *   4. calibration ±10 %      → appliquée par-dessus, ailleurs (ranker)
 *
 * Idée clé : chaque mouvement a une « chargeabilité » propre. Le Deadlift tolère
 * un % de 1RM bien plus élevé qu'un Snatch → à PR égal, le Deadlift sort plus lourd.
 */

// Doit rester synchro avec RX_LOADS de engineCrossFit.ts (idéalement à exporter de là).
const RX_LOADS: Record<string, [number, number]> = {
  thruster: [43, 30], clean: [61, 43], snatch: [43, 30], cleanJerk: [61, 43],
  deadlift: [102, 70], frontSquat: [43, 30], backSquat: [61, 43], ohSquat: [43, 30],
  pushPress: [43, 30], pushJerk: [52, 35], sdhp: [43, 30], db: [22.5, 15],
  kb: [24, 16], wallBall: [9, 6],
};
const LEVEL_FACTOR: Record<string, number> = {
  Scaled: 0.65, Inter: 0.82, RX: 1.0, 'RX+': 1.1, Elite: 1.18, Pro: 1.25,
};
const LEVEL_RANK: Record<string, number> = {
  Scaled: 0, Inter: 1, RX: 2, 'RX+': 3, Elite: 4, Pro: 5,
};

/** Bande d'intensité de conditioning (% du 1RM) par mouvement, min→max selon le niveau.
 *  Le Scaled prend le bas de la bande, le Pro le haut. */
export const LOADABILITY: Record<string, [number, number]> = {
  deadlift:   [0.50, 0.65],  // chaîne postérieure, sûr à charger en volume
  sdhp:       [0.45, 0.58],
  clean:      [0.52, 0.62],
  cleanJerk:  [0.50, 0.60],
  backSquat:  [0.50, 0.62],
  frontSquat: [0.48, 0.58],
  pushPress:  [0.45, 0.55],
  pushJerk:   [0.45, 0.55],
  thruster:   [0.38, 0.48],  // bridé par le passage overhead
  ohSquat:    [0.38, 0.48],
  snatch:     [0.38, 0.46],  // technique + overhead
  // Haltères / kettlebell / wall ball : pas de 1RM classique → restent en absolu (null plus bas)
};

/** Plage physiologique d'un 1RM (kg) : hors de là = saisie douteuse → on ignore le PR. */
export const PR_SANITY: [number, number] = [20, 400];

/** loadKey (moteur) → clé de PR dans profiles.personal_records (nom normalisé).
 *  Plusieurs variantes de barre retombent sur le même 1RM de référence. */
const PR_KEY: Record<string, string[]> = {
  deadlift: ['deadlift'],
  clean: ['clean'], squatClean: ['clean'],
  cleanJerk: ['clean_jerk', 'clean'], squatCleanJerk: ['clean_jerk', 'clean'], cluster: ['clean_jerk', 'clean'],
  snatch: ['snatch'], squatSnatch: ['snatch'],
  frontSquat: ['front_squat', 'clean', 'back_squat'], backSquat: ['back_squat', 'front_squat'], ohSquat: ['snatch'],
  pushPress: ['push_press', 'push_jerk'], pushJerk: ['push_jerk', 'push_press'], sdhp: ['deadlift'],
  thruster: ['thruster', 'front_squat', 'clean'],
};

const STEP = (loadKey: string) => (loadKey === 'db' ? 0.5 : loadKey === 'kb' || loadKey === 'wallBall' ? 1 : 2.5);
const roundTo = (x: number, step: number) => Math.round(x / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type PRMap = Record<string, number>; // { deadlift: 180, clean: 110, snatch: 85, ... } en kg

/** Charge RX-niveau de référence (repli / borne), côté Homme par défaut ; gender pour la borne. */
function rxLevelLoad(loadKey: string, level: string, gender: 0 | 1): number {
  const ref = RX_LOADS[loadKey];
  if (!ref) return NaN;
  return roundTo(ref[gender] * (LEVEL_FACTOR[level] ?? 1), STEP(loadKey));
}

/**
 * Charge personnalisée pour UN athlète (une seule valeur, pas de paire M/F).
 * @returns kg, ou null si le mouvement n'est pas piloté par charge (gym/cardio) ou pas de repli.
 */
export function resolveLoad(
  loadKey: string,
  level: string,
  prs: PRMap,
  gender: 0 | 1 = 0,
): { kg: number; source: 'pr' | 'rx' } | null {
  const band = LOADABILITY[loadKey];
  const keys = PR_KEY[loadKey] ?? [];
  let pr: number | undefined;
  for (const k of keys) { if (prs[k] != null) { pr = prs[k]; break; } }

  const rxRef = rxLevelLoad(loadKey, level, gender);

  // Cas PR connu, plausible, et mouvement %-able → charge = 1RM × % de conditioning.
  // Pas de clamp sur le RX absolu : ce serait absurde pour un athlète peu chargé.
  // La bande de conditioning (0.38–0.65) est l'enveloppe de sécurité ; la plage PR
  // physiologique protège des saisies aberrantes.
  const prOk = pr && pr >= PR_SANITY[0] && pr <= PR_SANITY[1];
  if (band && prOk) {
    const rank = LEVEL_RANK[level] ?? 2;
    const pct = band[0] + (band[1] - band[0]) * (rank / 5);
    return { kg: roundTo(pr! * pct, STEP(loadKey)), source: 'pr' };
  }

  // Repli : charge RX × facteur (comportement moteur actuel)
  if (!Number.isNaN(rxRef)) return { kg: rxRef, source: 'rx' };
  return null;
}

/** Formatage d'affichage : PR → une valeur (« 110 kg »), repli RX → paire (« 42.5/30 kg »). */
export function formatResolvedLoad(loadKey: string, level: string, prs: PRMap): string | null {
  const r = resolveLoad(loadKey, level, prs, 0);
  if (!r) return null;
  if (r.source === 'pr') return `${r.kg} kg`;
  const f = rxLevelLoad(loadKey, level, 1);
  return `${r.kg}/${f} kg`;
}

// ============================ Pont avec la page PR (profiles.personal_records) ============================
//
// La page Records stocke les 1RM sous des clés `<slug>_<Label>` (ex. `weightlifting_Back Squat`),
// avec repli legacy `Haltérophilie_<Label>` (voir src/screens/profile/prStorage.ts). Les valeurs
// sont des CHAÎNES. `parsePersonalRecords` normalise tout ça en un `PRMap` chiffré consommable
// par `resolveLoad`. Les variantes (Squat/Power/Hang Clean → « clean ») sont fusionnées au MAX,
// car le 1RM de référence est la valeur la plus lourde soulevée sur la famille.

/** Label de mouvement (page PR) normalisé → clé canonique du PRMap.
 *  Les familles clean/snatch pointent toutes vers 'clean' / 'snatch' (fusion au max). */
const PR_LABEL_TO_KEY: Record<string, string> = {
  'back squat': 'back_squat',
  'front squat': 'front_squat',
  'overhead squat': 'overhead_squat',
  'deadlift': 'deadlift',
  'push press': 'push_press',
  'strict press': 'push_press',   // repli utile si push_press absent
  'push jerk': 'push_jerk',
  'split jerk': 'push_jerk',
  'clean & jerk': 'clean_jerk',
  'thruster': 'thruster',
  // Famille Clean → 'clean' (max des variantes)
  'squat clean': 'clean',
  'power clean': 'clean',
  'hang power clean': 'clean',
  'hang squat clean': 'clean',
  'clean': 'clean',
  // Famille Snatch → 'snatch' (max des variantes)
  'squat snatch': 'snatch',
  'power snatch': 'snatch',
  'hang power snatch': 'snatch',
  'hang squat snatch': 'snatch',
  'snatch': 'snatch',
};

// Préfixes de catégorie retirés avant lookup du label (slug moderne + labels legacy).
const PR_CATEGORY_PREFIXES = [
  'weightlifting_', 'gymnastics_', 'benchmarks_', 'cardio_',
  'Haltérophilie_', 'Gymnastics_', 'Benchmarks CrossFit_', 'Cardio & Endurance_',
];

const stripPrefix = (key: string): string => {
  for (const p of PR_CATEGORY_PREFIXES) if (key.startsWith(p)) return key.slice(p.length);
  return key; // clé déjà « nue » (tolérance)
};

/**
 * Convertit `profiles.personal_records` (jsonb, clés `<slug>_<Label>`, valeurs chaînes)
 * en `PRMap` chiffré prêt pour `resolveLoad`. Ignore les clés `_date`, `_featured_badges`,
 * les valeurs non numériques ou hors [1, 1000]. Fusionne les variantes d'une famille au max.
 */
export function parsePersonalRecords(
  records: Record<string, unknown> | null | undefined,
): PRMap {
  const out: PRMap = {};
  if (!records) return out;
  for (const [rawKey, rawVal] of Object.entries(records)) {
    if (rawKey === '_featured_badges' || rawKey.endsWith('_date')) continue;
    const label = stripPrefix(rawKey).toLowerCase().trim();
    const canon = PR_LABEL_TO_KEY[label];
    if (!canon) continue;
    const n = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(',', '.'));
    if (!Number.isFinite(n) || n < 1 || n > 1000) continue;
    // Fusion au max : la variante la plus lourde fait foi pour la famille.
    if (out[canon] === undefined || n > out[canon]) out[canon] = n;
  }
  return out;
}

// ============================ Pont avec l'affichage (WODSuggestionsScreen) ============================
//
// Le moteur émet des mouvements `{ name, prescription, load }` SANS loadKey (le loadKey vit sur
// le catalogue interne MOVES, indexé par name). Pour personnaliser la charge affichée, on remappe
// le nom affiché → loadKey. Ne couvre QUE les mouvements à barre chargés par un 1RM ; le reste
// (haltères, kettlebell, gym, cardio) garde la charge d'origine du moteur.

/** Nom affiché (catalogue moteur) → loadKey de resolveLoad. Barre uniquement. */
const NAME_TO_LOADKEY: Record<string, string> = {
  'thruster': 'thruster',
  'power clean': 'clean', 'squat clean': 'clean',
  'power snatch': 'snatch', 'squat snatch': 'snatch',
  'clean & jerk': 'cleanJerk', 'squat clean & jerk': 'cleanJerk', 'cluster': 'cleanJerk',
  'deadlift': 'deadlift',
  'front squat': 'frontSquat', 'back squat': 'backSquat', 'overhead squat': 'ohSquat',
  'push press': 'pushPress', 'push jerk': 'pushJerk',
  'sumo deadlift high pull': 'sdhp',
};

/**
 * Charge à AFFICHER pour un mouvement du générateur personnel.
 * - Si le mouvement est chargé par un 1RM ET qu'un PR utilisable existe → « 110 kg » (valeur perso).
 * - Sinon (pas de PR, ou mouvement non barre) → on garde la charge d'origine du moteur (paire RX).
 * Ainsi les reps ne bougent jamais ; seule la charge barre se personnalise, et l'absence de PR
 * est parfaitement transparente (comportement moteur actuel). `originalLoad` = m.load du moteur.
 */
export function personalizedLoadDisplay(
  name: string,
  originalLoad: string | null,
  level: string,
  prs: PRMap,
): string | null {
  const loadKey = NAME_TO_LOADKEY[name.toLowerCase().trim()];
  if (!loadKey) return originalLoad;            // haltères / gym / cardio → inchangé
  const r = resolveLoad(loadKey, level, prs, 0);
  if (r && r.source === 'pr') return `${r.kg} kg`;
  return originalLoad;                          // pas de PR utilisable → repli moteur (paire RX)
}
