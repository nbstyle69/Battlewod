// Portage de movementLoadability.verify.ts (8 assertions) — charges basées sur les PR.
import { resolveLoad, formatResolvedLoad, PRMap } from '../utils/wod/movementLoadability';

const strong: PRMap = { deadlift: 200, clean: 120, snatch: 95, thruster: 90, front_squat: 150 };
const light: PRMap = { deadlift: 110, clean: 80, snatch: 60, thruster: 60, front_squat: 95 };

describe('movementLoadability', () => {
  it('à 1RM égal, la chargeabilité ordonne Deadlift > Thruster ≥ Snatch', () => {
    const eq = { deadlift: 100, thruster: 100, snatch: 100 };
    const dl = resolveLoad('deadlift', 'RX', eq)!.kg;
    const th = resolveLoad('thruster', 'RX', eq)!.kg;
    const sn = resolveLoad('snatch', 'RX', eq)!.kg;
    expect(dl).toBeGreaterThan(th);
    expect(th).toBeGreaterThanOrEqual(sn);
  });

  it('la charge personnalisée suit le 1RM', () => {
    expect(resolveLoad('deadlift', 'RX', strong)!.kg)
      .toBeGreaterThan(resolveLoad('deadlift', 'RX', light)!.kg);
  });

  it('replie sur RX quand le PR est absent', () => {
    const noPR = resolveLoad('deadlift', 'RX', {})!;
    expect(noPR.source).toBe('rx');
    expect(noPR.kg).toBe(102.5);
  });

  it('ignore un PR aberrant (repli RX)', () => {
    expect(resolveLoad('deadlift', 'RX', { deadlift: 9999 })!.source).toBe('rx');
  });

  it('Pro ≥ Scaled à PR égal', () => {
    expect(resolveLoad('deadlift', 'Pro', strong)!.kg)
      .toBeGreaterThanOrEqual(resolveLoad('deadlift', 'Scaled', strong)!.kg);
  });

  it('affiche une valeur simple avec PR, une paire M/F en repli', () => {
    expect(formatResolvedLoad('deadlift', 'RX', strong)!).toMatch(/^[0-9.]+ kg$/);
    expect(formatResolvedLoad('deadlift', 'RX', {})!).toMatch(/\//);
  });

  it('renvoie null pour un mouvement sans charge', () => {
    expect(resolveLoad('nope', 'RX', strong)).toBeNull();
  });
});
