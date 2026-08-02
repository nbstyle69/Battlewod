// Portage de ranker.verify.ts (9 assertions) — déterminisme, diversité, zones, rotation, prefs.
import { rankCF, EMPTY_PROFILE, UserWodProfile } from '../utils/wod/ranker';
import { movementHitsZones } from '../utils/wod/movementZones';
import { CFParams } from '../utils/wod/engineCrossFit';

const params: CFParams = {
  level: 'RX', duration_min: 20, intent: 'Mixed', method: 'For Time',
  format: 'Solo', equipment: [], benchmark: false,
};
const seeds = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const GENERIC = new Set(['run', 'row', 'bike erg', 'skierg', 'bikeerg', 'echo bike']);

const a = rankCF(params, EMPTY_PROFILE, seeds);
const target = a[0].movementNames.find((n) => !['run', 'row', 'skierg'].includes(n))!;

describe('ranker', () => {
  it('est déterministe : mêmes seeds + profil → même top 3', () => {
    const b = rankCF(params, EMPTY_PROFILE, seeds);
    expect(b.map((x) => x.signature)).toEqual(a.map((x) => x.signature));
  });

  it('renvoie 3 suggestions', () => {
    expect(a).toHaveLength(3);
  });

  it('diversifie : recouvrement ≤ 1 mouvement OU méthodes distinctes', () => {
    const overlap = (x: typeof a[number], y: typeof a[number]) =>
      x.movementNames.filter((n) => !GENERIC.has(n) && y.movementNames.includes(n)).length;
    const maxOverlap = Math.max(overlap(a[0], a[1]), overlap(a[0], a[2]), overlap(a[1], a[2]));
    const methods = new Set(a.map((x) => x.method));
    expect(maxOverlap <= 1 || methods.size >= 2).toBe(true);
  });

  it('élimine les mouvements des zones à ménager', () => {
    const profile: UserWodProfile = { ...EMPTY_PROFILE, avoidZones: ['shoulder'] };
    const leak = rankCF(params, profile, seeds)
      .flatMap((x) => x.movementNames)
      .filter((n) => movementHitsZones(n, ['shoulder']));
    expect(leak).toEqual([]);
  });

  it('écarte une signature récente du top 3', () => {
    const sig = a[0].signature;
    const blocked = rankCF(params, { ...EMPTY_PROFILE, recentSignatures: [sig] }, seeds);
    expect(blocked.some((x) => x.signature === sig)).toBe(false);
  });

  it('fait reculer un mouvement fait la veille (rotation)', () => {
    const rotated = rankCF(params, { ...EMPTY_PROFILE, daysSinceMovement: { [target]: 1 } }, seeds);
    const before = a.findIndex((x) => x.movementNames.includes(target));
    const after = rotated.findIndex((x) => x.movementNames.includes(target));
    expect(after === -1 || after > before || rotated[after].score < a[before].score).toBe(true);
  });

  it('remonte un mouvement préféré', () => {
    const boosted = rankCF(params, { ...EMPTY_PROFILE, prefs: { [target]: 1 } }, seeds);
    expect(boosted.some((x) => x.movementNames.includes(target))).toBe(true);
  });

  it('goal=progress : la carte Défi cible le mouvement faible (si pool éligible)', () => {
    const weak: UserWodProfile = { ...EMPTY_PROFILE, goal: 'progress', weakMovements: [target] };
    const defi = rankCF(params, weak, seeds).find((x) => x.isChallenge);
    expect(!defi || defi.movementNames.includes(target)).toBe(true);
  });

  it('donne une ligne « pourquoi » à chaque carte', () => {
    expect(a.every((x) => x.why.length > 10)).toBe(true);
  });
});
