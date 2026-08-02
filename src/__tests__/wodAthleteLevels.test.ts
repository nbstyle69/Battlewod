// Portage de athleteLevels.verify.ts (8 assertions) — niveaux Force / Gym / contextuel.
import {
  strengthLevel, gymLevel, effectiveLevel, scaleReps, movementDomain,
} from '../utils/wod/athleteLevels';

const strong = strengthLevel({ snatch: 100, clean: 130, deadlift: 220, back_squat: 190 });
const gym = gymLevel({ pullup: 2, hspu: 1, doubleUnder: 2, toesToBar: 2, pistol: 0 });

describe('athleteLevels', () => {
  it('déduit la Force depuis les PR', () => {
    expect(strong.perLift['snatch']).toBe('Elite');
    const rel = strengthLevel({ snatch: 100 }, 70); // relatif au poids de corps
    expect(['Elite', 'Pro']).toContain(rel.suggested);
  });

  it('déduit le niveau Gym du palier déclaré', () => {
    expect(gym.suggested).not.toBe('Elite');
    expect(gym.suggested).not.toBe('Pro');
  });

  it('applique un niveau CONTEXTUEL : fort en barre, moyen en gym', () => {
    const F = strong.suggested;
    const G = gym.suggested;
    expect(effectiveLevel('Power Snatch', F, G)).toBe('Elite');
    const mu = effectiveLevel('Bar Muscle-ups', F, G);
    expect(mu).toBe(G);
    expect(mu).not.toBe('Elite');
  });

  it('classe les domaines de mouvements', () => {
    expect(movementDomain('Power Snatch')).toBe('barbell');
    expect(movementDomain('Ring Muscle-ups')).toBe('gym');
  });

  it('couple charge et reps : plus le niveau monte, moins de reps', () => {
    expect(scaleReps([21, 15, 9], 'Elite')[0]).toBeLessThan(scaleReps([21, 15, 9], 'RX')[0]);
  });
});
