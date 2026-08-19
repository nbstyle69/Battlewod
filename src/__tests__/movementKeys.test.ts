import { normalizeMovement, isKnownMovementKey, MOVEMENT_KEYS } from '../utils/tournamentUtils';
import { MOVEMENT_BADGE_PREFIX, MOVEMENT_BADGE_ROLLUP } from '../services/gamification';

/**
 * Lot 1 muscu — une seule clé de mouvement dans toute l'application.
 * Avant, trois normaliseurs coexistaient : celui-ci (`pull_up`), un slug
 * snake_case côté gamification (`pull-ups`) et un troisième côté web
 * (`pullup`). Chacun écrivait dans les mêmes tables : les compteurs se
 * divisaient et les badges lisaient une clé que personne n'écrivait.
 */
describe('clé canonique de mouvement', () => {
  it('ramène les variantes de saisie sur une seule clé', () => {
    const cases: [string, string][] = [
      ['Pull-ups', 'pull_up'],
      ['Pull up', 'pull_up'],
      ['pullup', 'pull_up'],
      ['Kipping Pull-ups', 'pull_up'],
      ['Wall Ball', 'wall_ball'],
      ['Wall balls', 'wall_ball'],
      ['Push-ups', 'push_up'],
      ['Push up', 'push_up'],
      ['Double-unders', 'double_under'],
      ['Double Unders', 'double_under'],
      ['Air Squats', 'air_squat'],
      ['air squat', 'air_squat'],
      ['Sit-ups', 'sit_up'],
      ['Handstand Push-ups', 'hspu'],
      ['Thrusters', 'thruster'],
      ['Deadlifts', 'deadlift'],
      ['Alternating Lunges', 'lunge'],
      ['Power Clean', 'clean'],
      ['Hang Squat Clean', 'clean'],
      ['Power Snatch', 'snatch'],
      ['Clean & Jerk', 'clean_and_jerk'],
      ['Toes to bar', 'toes_to_bar'],
      ['Burpees', 'burpee'],
    ];
    for (const [raw, key] of cases) {
      expect([raw, normalizeMovement(raw).key]).toEqual([raw, key]);
    }
  });

  it('ignore la prescription accolée au mouvement', () => {
    expect(normalizeMovement('21-15-9 Thrusters 42.5kg').key).toBe('thruster');
    expect(normalizeMovement('10 Wall Balls 9kg').key).toBe('wall_ball');
  });

  it('ne reconnaît pas les lignes de WOD qui ne sont pas des mouvements', () => {
    // Ces clés existent en production dans movement_logs / user_movement_stats :
    // elles viennent de lignes de format ou de texte libre comptées comme des
    // mouvements. Aucun badge ni aucun écran ne les lit.
    const notMovements = [
      'Rest',
      '3 Rounds',
      'Work HSW',
      'Work inverted',
      'WOD du jour ou Hyrox',
      'Snatch renfo',
      '10+10 Cuban press + neck press snatch grip',
    ];
    for (const raw of notMovements) {
      expect([raw, isKnownMovementKey(normalizeMovement(raw).key)]).toEqual([raw, false]);
    }
  });

  it('contrôle négatif : une sonde fausse doit échouer', () => {
    expect(normalizeMovement('Pull-ups').key).not.toBe('pullup');
    expect(isKnownMovementKey('pull-ups')).toBe(false);
  });
});

describe('jonction clé canonique → badge', () => {
  it("n'attache un badge qu'à une clé que le normaliseur peut produire", () => {
    for (const key of Object.keys(MOVEMENT_BADGE_PREFIX)) {
      expect([key, MOVEMENT_KEYS.has(key)]).toEqual([key, true]);
    }
  });

  it('ne totalise que des clés canoniques dans les cumuls', () => {
    for (const keys of Object.values(MOVEMENT_BADGE_ROLLUP)) {
      for (const key of keys) expect([key, MOVEMENT_KEYS.has(key)]).toEqual([key, true]);
    }
  });

  it('cumule sur un préfixe de badge qui existe', () => {
    const prefixes = new Set(Object.values(MOVEMENT_BADGE_PREFIX));
    for (const prefix of Object.keys(MOVEMENT_BADGE_ROLLUP)) {
      expect([prefix, prefixes.has(prefix)]).toEqual([prefix, true]);
    }
  });
});
