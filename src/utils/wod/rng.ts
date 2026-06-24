/**
 * BattleWOD — RNG à graine partagé (mulberry32)
 * =============================================
 * Générateur pseudo-aléatoire déterministe utilisé par les moteurs de WOD.
 *   - même seed  -> même séquence (reproductible)
 *   - autre seed -> autre séquence
 * Aucune dépendance, aucun appel réseau.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private r: () => number;
  constructor(seed: number) { this.r = mulberry32(seed); }
  float() { return this.r(); }
  int(min: number, max: number) { return Math.floor(this.r() * (max - min + 1)) + min; }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.r() * arr.length)]; }
  sample<T>(arr: T[], n: number): T[] { return this.shuffle([...arr]).slice(0, n); }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const randomSeed = () => Math.floor(Math.random() * 1e9);
