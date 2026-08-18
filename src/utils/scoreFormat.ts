/**
 * Shared score formatting utility.
 *
 * Convention « capped » (temps limite atteint) sur un for-time :
 *   finisher → score_value = TEMPS en secondes, capped = false ;
 *   capped   → score_value = REPS complétées,   capped = true.
 *
 * Encodage HÉRITÉ (avant la colonne `capped`) : score_value = DNF_BASE + reps.
 * Il subsiste en base ; `normalizeScore` le ramène à la convention actuelle,
 * exactement comme le font les fonctions de classement côté serveur.
 */

export const DNF_BASE = 999999;

export interface NormalizedScore {
  /** Secondes si non capped, reps si capped. */
  value: number;
  capped: boolean;
}

/**
 * Ramène un couple (score_value, capped) — y compris l'encodage hérité
 * DNF_BASE + reps — à la convention actuelle. Miroir exact du serveur.
 */
export function normalizeScore(value: number, capped: boolean | null | undefined, isTime: boolean): NormalizedScore {
  if (!isTime) return { value, capped: false };
  if (value >= DNF_BASE) return { value: value - DNF_BASE, capped: true };
  return { value, capped: !!capped };
}

/**
 * Traduit une saisie for-time en ce qui part en base.
 * capped ⇒ on stocke les reps, jamais le temps.
 */
export function mapForTimeScore(input:
  | { capped: true; reps: number }
  | { capped: false; minutes: number; seconds: number }
): { score_value: number; capped: boolean } {
  if (input.capped) return { score_value: input.reps, capped: true };
  return { score_value: input.minutes * 60 + input.seconds, capped: false };
}

/**
 * Format a score value for display based on score type.
 * @param value  - raw numeric score value
 * @param type   - 'time' | 'reps' | 'weight' | 'rounds'
 * @param capped - drapeau « temps limite atteint » (for-time uniquement)
 */
export function formatScoreValue(value: number, type: string, capped?: boolean | null): string {
  if (type === 'time') {
    const n = normalizeScore(Math.round(value), capped, true);
    if (n.capped) return `CAP + ${n.value} reps`;
    const m = Math.floor(n.value / 60);
    const s = n.value % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const units: Record<string, string> = { reps: ' reps', weight: ' kg', rounds: ' rnds' };
  return `${value}${units[type] ?? ''}`;
}

/**
 * Le time cap d'un WOD se saisit et s'affiche en `mm:ss` — comme la saisie de
 * score — alors que la colonne `time_cap_seconds` est en secondes. `formatCap`
 * puis `parseCap` doivent redonner la valeur d'origine à la seconde : sinon un
 * simple « Enregistrer » réécrit la donnée, et 30 secondes comptent sur un
 * for-time (le cap alimente la convention `capped`).
 */
export function formatCap(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** `mm:ss` → secondes. Un nombre nu est lu comme des minutes (`12` → 720). */
export function parseCap(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;
  const [minPart, secPart] = raw.split(':');
  const minutes = parseInt(minPart, 10);
  if (Number.isNaN(minutes)) return null;
  if (secPart === undefined) return minutes * 60;
  const seconds = parseInt(secPart, 10);
  return minutes * 60 + (Number.isNaN(seconds) ? 0 : seconds);
}

/**
 * Comparateur de classement, miroir bit-à-bit de l'ORDER BY serveur :
 * rx d'abord, puis finishers avant capped, puis temps croissant (finishers)
 * / reps décroissantes (capped) / reps décroissantes (non chronométré).
 */
export function compareScores(
  a: { rx?: boolean | null; score_value: number; capped?: boolean | null },
  b: { rx?: boolean | null; score_value: number; capped?: boolean | null },
  isTime: boolean,
): number {
  const rxDiff = (a.rx ? 0 : 1) - (b.rx ? 0 : 1);
  if (rxDiff !== 0) return rxDiff;

  const na = normalizeScore(a.score_value, a.capped, isTime);
  const nb = normalizeScore(b.score_value, b.capped, isTime);

  const cappedDiff = (na.capped ? 1 : 0) - (nb.capped ? 1 : 0);
  if (cappedDiff !== 0) return cappedDiff;

  if (isTime && !na.capped) return na.value - nb.value;
  return nb.value - na.value;
}
