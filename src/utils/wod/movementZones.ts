/**
 * AthleX — Mapping mouvement → zones du corps sollicitées
 * =======================================================
 * Sert au filtre « Zones à ménager » du ranker (SPEC §8).
 * Matching par regex sur le NOM AFFICHÉ du mouvement (couvre les variantes
 * de scaling des GYM_TIERS : "Ring Rows", "Chest-to-Bar", etc.).
 * On stocke une ZONE, jamais une blessure.
 */

export type BodyZone = 'shoulder' | 'knee' | 'back' | 'wrist' | 'ankle' | 'hip';

export const ZONE_LABELS: Record<BodyZone, string> = {
  shoulder: 'Épaule', knee: 'Genou', back: 'Dos',
  wrist: 'Poignet', ankle: 'Cheville', hip: 'Hanche',
};

interface ZoneRule { pattern: RegExp; zones: BodyZone[] }

// Ordre sans importance : toutes les règles qui matchent s'appliquent.
const RULES: ZoneRule[] = [
  // — Overhead / épaules dominantes
  { pattern: /hspu|handstand|pike push/i,                zones: ['shoulder', 'wrist'] },
  { pattern: /overhead squat|ohs/i,                      zones: ['shoulder'] },
  { pattern: /snatch/i,                                  zones: ['shoulder'] },
  { pattern: /push press|push jerk|jerk|s2oh|shoulder-to-overhead/i, zones: ['shoulder'] },
  { pattern: /thruster|cluster/i,                        zones: ['shoulder', 'knee'] },
  { pattern: /wall ball/i,                               zones: ['shoulder', 'knee'] },
  { pattern: /muscle-up|pull-up|chest-to-bar|c2b|ring row|rope climb|rope pull/i, zones: ['shoulder'] },
  { pattern: /ring dip|bench dip|dip/i,                  zones: ['shoulder'] },
  { pattern: /skierg/i,                                  zones: ['shoulder'] },
  { pattern: /devils press|db snatch|kb swing|swing/i,   zones: ['shoulder', 'back'] },
  { pattern: /farmers carry/i,                           zones: ['shoulder', 'back'] },
  // — Chaîne postérieure / dos
  { pattern: /deadlift|sdhp|sumo|bent over row|good morning/i, zones: ['back'] },
  { pattern: /clean/i,                                   zones: ['back', 'knee'] },
  { pattern: /over-the-shoulder|sandbag/i,               zones: ['back'] },
  { pattern: /sled pull/i,                               zones: ['back'] },
  { pattern: /toes-to-bar|t2b|knee raise|knees-to-elbow|sit-up|hollow/i, zones: ['hip'] },
  // — Genoux / jambes dominantes
  { pattern: /squat|pistol/i,                            zones: ['knee'] },
  { pattern: /lunge/i,                                   zones: ['knee', 'hip'] },
  { pattern: /box jump|box step|jump-over|broad jump/i,  zones: ['knee', 'ankle'] },
  { pattern: /sled push/i,                               zones: ['knee'] },
  { pattern: /run|shuttle/i,                             zones: ['ankle', 'knee'] },
  { pattern: /double-under|single-under|triple-under/i,  zones: ['ankle'] },
  // — Poignets
  { pattern: /front squat|front rack/i,                  zones: ['wrist', 'knee'] },
  { pattern: /burpee|push-up/i,                          zones: ['wrist', 'shoulder'] },
  { pattern: /bear crawl|handstand walk/i,               zones: ['wrist', 'shoulder'] },
];

/** Zones sollicitées par un mouvement (nom affiché). */
export function zonesForMovement(movementName: string): BodyZone[] {
  const out = new Set<BodyZone>();
  for (const r of RULES) {
    if (r.pattern.test(movementName)) r.zones.forEach((z) => out.add(z));
  }
  return [...out];
}

/** true si le mouvement touche l'une des zones à ménager. */
export function movementHitsZones(movementName: string, avoid: BodyZone[]): boolean {
  if (avoid.length === 0) return false;
  const zones = zonesForMovement(movementName);
  return zones.some((z) => avoid.includes(z));
}

/** Liste (dédupliquée) des mouvements d'une banque exclus par des zones —
 *  pour l'aperçu « Sera exclu de tes WODs : … » (SPEC §8). */
export function excludedMovementNames(allNames: string[], avoid: BodyZone[]): string[] {
  return [...new Set(allNames.filter((n) => movementHitsZones(n, avoid)))];
}
