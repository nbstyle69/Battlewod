/**
 * Variété des formats de WOD (chantier « formats similaires »).
 * Avant : For Time 20 min → TOUJOURS « 5 rounds for time » ou l'une de 4 ladders.
 * Après : chipper, échelle montante, pyramide, reps croisées, buy-in/cash-out, ERFT,
 * AMRAP montant/intervalles/FGB, EMOM Chelsea/E2MOM/Death by, Tabata Something Else…
 * Ces tests mesurent la DISTRIBUTION sur N seeds et verrouillent les invariants
 * (déterminisme, reps identiques entre niveaux, méthodes reconnues par le timer).
 */
import { generateCFWod, cfSignature, CFParams, Level } from '../utils/wod/engineCrossFit';

const base: CFParams = {
  level: 'RX', duration_min: 20, intent: 'Mixed', method: 'For Time',
  format: 'Solo', equipment: [], benchmark: false,
};
const SEEDS = Array.from({ length: 300 }, (_, i) => 100 + i * 13);

/** Famille de schéma (on neutralise les nombres pour compter les FORMES, pas les tirages). */
const shape = (scheme: string) => scheme.replace(/\d+/g, 'N');

const distinctShapes = (params: CFParams) =>
  new Set(SEEDS.map((s) => shape(generateCFWod(params, s).blocks[0].scheme)));

describe('variété des formats', () => {
  it('For Time 20 min : ≥ 6 formes distinctes (avant : 5 possibles, « N rounds » dominant)', () => {
    const shapes = distinctShapes(base);
    expect(shapes.size).toBeGreaterThanOrEqual(6);
  });

  it('For Time 30 min : le chipper, le buy-in et l’ERFT apparaissent', () => {
    const shapes = [...distinctShapes({ ...base, duration_min: 30 })].join(' § ');
    expect(shapes).toMatch(/Chipper/);
    expect(shapes).toMatch(/Buy-in/);
    expect(shapes).toMatch(/chronométré/);
  });

  it('For Time 10 min : pas de chipper/ERFT (gating par durée), mais ≥ 4 formes', () => {
    const shapes = distinctShapes({ ...base, duration_min: 10 });
    const joined = [...shapes].join(' § ');
    expect(joined).not.toMatch(/Chipper/);
    expect(joined).not.toMatch(/chronométré/);
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  it('AMRAP 20 min : ≥ 4 formes (classique, montant, intervalles, FGB, buy-in)', () => {
    expect(distinctShapes({ ...base, method: 'AMRAP' }).size).toBeGreaterThanOrEqual(4);
  });

  it('EMOM 20 min : ≥ 3 formes (alterné, Chelsea, E2MOM, Death by)', () => {
    expect(distinctShapes({ ...base, method: 'EMOM' }).size).toBeGreaterThanOrEqual(3);
  });

  it('Tabata : ≥ 2 formes (classique, Something Else, alterné)', () => {
    expect(distinctShapes({ ...base, method: 'Tabata', duration_min: 4 }).size).toBeGreaterThanOrEqual(2);
  });

  it('les rounds RFT ne sont plus figés à 5 pour 20 min', () => {
    const rounds = new Set<string>();
    for (const s of SEEDS) {
      const scheme = generateCFWod(base, s).blocks[0].scheme;
      const m = scheme.match(/^(\d+) rounds for time$/);
      if (m) rounds.add(m[1]);
    }
    expect(rounds.size).toBeGreaterThanOrEqual(2); // avant : toujours « 5 »
  });
});

describe('invariants préservés', () => {
  it('déterminisme : même seed → même WOD (schéma inclus)', () => {
    for (const s of SEEDS.slice(0, 30)) {
      const a = generateCFWod(base, s);
      const b = generateCFWod(base, s);
      expect(b.blocks[0].scheme).toBe(a.blocks[0].scheme);
      expect(cfSignature(b)).toBe(cfSignature(a));
    }
  });

  it('reps IDENTIQUES entre niveaux : mêmes prescriptions Scaled vs Pro (comparabilité)', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const scaled = generateCFWod({ ...base, level: 'Scaled' as Level }, s);
      const pro = generateCFWod({ ...base, level: 'Pro' as Level }, s);
      expect(pro.blocks[0].scheme).toBe(scaled.blocks[0].scheme);
      expect(pro.blocks[0].movements.map((m) => m.prescription))
        .toEqual(scaled.blocks[0].movements.map((m) => m.prescription));
    }
  });

  it('la méthode reste dans le vocabulaire du timer (FOR TIME / AMRAP / EMOM / TABATA / MAX REPS)', () => {
    const known = /^(FOR TIME|AMRAP|EMOM|TABATA|MAX REPS)/;
    for (const method of ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'] as const) {
      for (const s of SEEDS.slice(0, 40)) {
        const w = generateCFWod({ ...base, method }, s);
        expect(w.method).toMatch(known);
      }
    }
  });

  it('la signature distingue deux formes différentes à mouvements égaux', () => {
    // Deux WODs avec les mêmes mouvements mais des schémas différents → signatures différentes.
    const byMoves = new Map<string, Set<string>>();
    for (const s of SEEDS) {
      const w = generateCFWod(base, s);
      const moves = w.blocks[0].movements.map((m) => m.name).sort().join('|');
      (byMoves.get(moves) ?? byMoves.set(moves, new Set()).get(moves)!)
        .add(`${shape(w.blocks[0].scheme)}→${cfSignature(w)}`);
    }
    for (const variants of byMoves.values()) {
      const shapes = new Set([...variants].map((v) => v.split('→')[0]));
      const sigs = new Set([...variants].map((v) => v.split('→')[1]));
      // autant de signatures que de formes pour un même set de mouvements
      expect(sigs.size).toBeGreaterThanOrEqual(shapes.size);
    }
  });

  it('cohérence : jamais deux mouvements de la même famille dans un même metcon', () => {
    // Familles par NOM AFFICHÉ au niveau RX (miroir de PATTERN dans le moteur).
    // Un WOD ne doit pas contenir Front Squat + Goblet Squat, Push Press + Push Jerk,
    // Burpees + Burpees Over Bar, etc. (Le bloc Force séparé n'est pas concerné :
    // Force Back Squat + metcon Front Squat est une programmation normale.)
    const FAMILIES: Record<string, string[]> = {
      squat: ['Front Squat', 'Back Squat', 'Overhead Squat', 'Goblet Squat', 'Air Squats',
              'Pistols', 'Thruster', 'DB Thruster', 'Wall Balls', 'Squat Clean', 'Squat Snatch',
              'Squat Clean & Jerk', 'Cluster'],
      hinge: ['Deadlift', 'DB Deadlift', 'Sumo Deadlift High Pull', 'KB Swing'],
      press: ['Push Press', 'Push Jerk', 'DB Push Press', 'Handstand Push-ups', 'Thruster',
              'DB Thruster', 'Wall Balls', 'Clean & Jerk', 'DB Clean & Jerk', 'Squat Clean & Jerk',
              'Cluster', 'Devils Press'],
      clean: ['Power Clean', 'Squat Clean', 'KB Clean', 'Clean & Jerk', 'DB Clean & Jerk',
              'Squat Clean & Jerk', 'Cluster'],
      snatch: ['Power Snatch', 'Squat Snatch', 'Alt DB Snatch'],
      pull: ['Pull-ups', 'Chest-to-Bar Pull-ups', 'Bar Muscle-ups', 'Ring Muscle-ups', 'Rope Climbs'],
      pushH: ['Push-ups', 'Ring Dips', 'Handstand Push-ups'],
      burpee: ['Burpees', 'Burpees Over the Bar', 'Facing Burpees Over the Bar', 'Devils Press'],
      box: ['Box Jumps', 'Box Jump-overs', 'Box Step-ups'],
    };
    for (const method of ['For Time', 'AMRAP', 'EMOM', 'Tabata'] as const) {
      for (const s of SEEDS) {
        const w = generateCFWod({ ...base, method }, s);
        const names = w.blocks[0].movements.map((m) => m.name);
        for (const [fam, members] of Object.entries(FAMILIES)) {
          const hits = names.filter((n) => members.includes(n));
          expect({ method, seed: s, fam, hits }).toEqual({ method, seed: s, fam, hits: hits.slice(0, 1) });
        }
      }
    }
  });

  it('chaque WOD a toujours des mouvements, un cap cohérent et un score', () => {
    for (const method of ['For Time', 'AMRAP', 'EMOM', 'Tabata'] as const) {
      for (const s of SEEDS.slice(0, 60)) {
        const w = generateCFWod({ ...base, method }, s);
        expect(w.blocks[0].movements.length).toBeGreaterThan(0);
        expect(w.time_cap_min).toBeGreaterThan(0);
        expect(w.score_type.length).toBeGreaterThan(0);
        for (const m of w.blocks[0].movements) expect(m.prescription.length).toBeGreaterThan(0);
      }
    }
  });
});
