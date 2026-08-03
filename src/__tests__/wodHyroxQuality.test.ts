/**
 * Qualité de la génération Hybrid/Hyrox (chantier « le Force et d'autres types ont
 * un problème »). Verrouille les correctifs, alignés sur la programmation réelle :
 * volumes par tour bornés (fin du double scaling), Force en séries lourdes courtes
 * + accessoires 8-12 + grip/gainage, vrais intervalles avec repos, race sim à run
 * fixe, cohérence par familles, déterminisme.
 */
import { generateHyroxWod, hyroxSignature, HyroxParams } from '../utils/wod/engineHyrox';

const base: HyroxParams = {
  category: 'Men', duration_min: 45, session_type: 'Engine', format: 'Solo',
  training_type: 'Station Training',
  equipment: ['SkiErg', 'RowErg', 'BikeErg', 'Sled Push', 'Sled Pull', 'Farmers Carry',
    'Sandbag Lunge', 'Wall Balls', 'Sandbag', 'Kettlebell', 'Haltères'],
  vest: 'off',
};
const SEEDS = Array.from({ length: 200 }, (_, i) => 100 + i * 17);

describe('volumes bornés (fin du double scaling)', () => {
  it('aucune prescription par tour > 30 reps, même à 60 min', () => {
    for (const st of ['Engine', 'Aerobic', 'Interval'] as const) {
      for (const d of [30, 45, 60] as const) {
        for (const s of SEEDS.slice(0, 60)) {
          const w = generateHyroxWod({ ...base, session_type: st, duration_min: d }, s);
          for (const b of w.blocks) for (const m of b.movements) {
            const r = m.prescription.match(/(\d+) reps/);
            // Chipper = une passe unique : plafonné à 50 (« Filthy Fifty »), tout le reste ≤ 30.
            const bound = b.structure === 'CHIPPER' ? 50 : 30;
            if (r) expect(Number(r[1])).toBeLessThanOrEqual(bound);
          }
        }
      }
    }
  });
});

describe('séance Force (structure réelle : lourd court + accessoires + grip/gainage)', () => {
  const force = (s: number) => generateHyroxWod({ ...base, session_type: 'Force' }, s);

  it('bloc A : séries lourdes courtes (5×5 / 3×3 / 4×6 ou séries sled), repos 2-3 min', () => {
    for (const s of SEEDS.slice(0, 60)) {
      const w = force(s);
      const a = w.blocks.find((b) => b.label === 'A')!;
      expect(a.scheme).toMatch(/RPE 8|tempo/);
      expect(a.rest).toMatch(/2-3 min/);
      // jamais l'ancien « 5 rounds — charge lourde » avec des reps de conditioning
      const r = a.movements[0].prescription.match(/× (\d+) reps/);
      if (r) expect(Number(r[1])).toBeLessThanOrEqual(8);
    }
  });

  it('bloc B : accessoires en 3 × 8-12 (plus jamais 45 goblet squats)', () => {
    for (const s of SEEDS.slice(0, 60)) {
      const b = force(s).blocks.find((x) => x.label === 'B')!;
      for (const m of b.movements) {
        const r = m.prescription.match(/3 × (\d+) reps/);
        expect(r).not.toBeNull();
        expect(Number(r![1])).toBeGreaterThanOrEqual(8);
        expect(Number(r![1])).toBeLessThanOrEqual(12);
      }
    }
  });

  it('bloc C grip & gainage présent (dead hang / farmers / planche)', () => {
    let seen = 0;
    for (const s of SEEDS.slice(0, 40)) {
      const c = force(s).blocks.find((x) => x.label === 'C');
      if (c && c.movements.length > 0) seen++;
    }
    expect(seen).toBeGreaterThan(30); // quasi systématique (pool PDC toujours dispo)
  });

  it('la consigne « charge > poids de course » est dans les notes coach', () => {
    const w = force(SEEDS[0]);
    expect(w.coach_notes.join(' ')).toMatch(/poids de COURSE|monte au-dessus/);
  });

  const BARBELL_LIFTS = ['Back Squat', 'Front Squat', 'Deadlift', 'Barbell Lunge', 'Barbell Bent Over Row'];

  it('chip Barbell cochée : le bloc A privilégie les lifts barre, en % du 1RM', () => {
    let barbellA = 0;
    for (const s of SEEDS.slice(0, 60)) {
      const w = generateHyroxWod({ ...base, session_type: 'Force', equipment: [...base.equipment, 'Barbell'] }, s);
      const a = w.blocks.find((b) => b.label === 'A')!;
      if (BARBELL_LIFTS.includes(a.movements[0]?.name)) {
        barbellA++;
        expect(a.movements[0].load).toMatch(/% du 1RM/);
        expect(a.scheme).toMatch(/1RM/);
      }
    }
    expect(barbellA).toBeGreaterThan(25); // priorité barre (~70 % des tirages)
  });

  it('sans chip Barbell : aucun lift barre ne sort', () => {
    for (const s of SEEDS.slice(0, 60)) {
      const w = generateHyroxWod({ ...base, session_type: 'Force' }, s);
      const names = w.blocks.flatMap((b) => b.movements.map((m) => m.name));
      expect(names.filter((n) => BARBELL_LIFTS.includes(n))).toEqual([]);
    }
  });

  it('les lifts barre restent réservés à la séance Force (jamais dans les metcons)', () => {
    for (const st of ['Engine', 'Interval', 'Aerobic', 'Run Split'] as const) {
      for (const s of SEEDS.slice(0, 40)) {
        const w = generateHyroxWod({ ...base, session_type: st, equipment: [...base.equipment, 'Barbell'] }, s);
        const names = w.blocks.flatMap((b) => b.movements.map((m) => m.name));
        expect(names.filter((n) => BARBELL_LIFTS.includes(n))).toEqual([]);
      }
    }
  });

  it("bloc A : jamais un effort en secondes comme lift principal (Dead Hang, Plank…)", () => {
    for (const s of SEEDS.slice(0, 80)) {
      // Sans chip Barbell ET sans matériel : le repli PDC du bloc A doit rester à reps.
      const w = generateHyroxWod({ ...base, session_type: 'Force', equipment: [] }, s);
      const a = w.blocks.find((b) => b.label === 'A')!;
      expect(a.movements[0]?.name).not.toMatch(/Dead Hang|Plank/);
      // Un lift principal se prescrit en reps ou en mètres lourds — jamais en secondes.
      expect(a.movements[0]?.prescription ?? '').toMatch(/reps|m LOURD/);
    }
  });

  it('aucun mouvement dupliqué entre les blocs A/B/C d’une même séance Force', () => {
    for (const s of SEEDS.slice(0, 80)) {
      const w = generateHyroxWod({ ...base, session_type: 'Force' }, s);
      const names = w.blocks.flatMap((b) => b.movements.map((m) => m.name));
      expect(names.length).toBe(new Set(names).size);
    }
  });
});

describe('pools jamais vides (fallback salle standard + garde-fou)', () => {
  it('aucune chip cochée → salle standard : jamais de metcon à 1 seul mouvement', () => {
    for (const st of ['Engine', 'Interval', 'Aerobic'] as const) {
      for (const tt of ['Station Training', 'Cardio Force', 'Named WOD'] as const) {
        for (const s of SEEDS.slice(0, 30)) {
          const w = generateHyroxWod({ ...base, session_type: st, training_type: tt, equipment: [] }, s);
          // Les intervalles mono-station sont un format légitime ; tout le reste ≥ 2.
          if (w.structure !== 'INTERVAL') {
            expect(w.blocks[0].movements.length).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  it('salle standard : les banques KB/sandbag redeviennent atteignables sans chips', () => {
    const seen = new Set<string>();
    for (const s of SEEDS.slice(0, 60)) {
      const w = generateHyroxWod({ ...base, equipment: [] }, s);
      for (const b of w.blocks) for (const m of b.movements) seen.add(m.name);
    }
    const kbOrSandbag = [...seen].filter((n) => /KB|Sandbag|Goblet|DB /.test(n));
    expect(kbOrSandbag.length).toBeGreaterThan(0);
  });

  it('la Barre reste opt-in : le fallback salle standard ne la contient pas', () => {
    const BARBELL_LIFTS = ['Back Squat', 'Front Squat', 'Deadlift', 'Barbell Lunge', 'Barbell Bent Over Row'];
    for (const s of SEEDS.slice(0, 60)) {
      const w = generateHyroxWod({ ...base, session_type: 'Force', equipment: [] }, s);
      const names = w.blocks.flatMap((b) => b.movements.map((m) => m.name));
      expect(names.filter((n) => BARBELL_LIFTS.includes(n))).toEqual([]);
    }
  });
});

describe('intervalles & EMOM réels', () => {
  it("un bloc INTERVAL a toujours n × efforts et un repos chiffré (ex. « 8 × (effort / 90s repos) »)", () => {
    let intervals = 0;
    for (const s of SEEDS) {
      const w = generateHyroxWod({ ...base, session_type: 'Interval', duration_min: 30 }, s);
      if (w.structure === 'INTERVAL') {
        intervals++;
        expect(w.blocks[0].scheme).toMatch(/^\d+ × /);
        expect(w.blocks[0].rest).toMatch(/\d+s/);
      }
      // plus jamais l'incohérence « [EMOM] 5 rounds — focus station (repos: selon méthode) »
      for (const b of w.blocks) {
        expect(b.rest ?? '').not.toBe('selon méthode');
        if (b.structure === 'EMOM') expect(b.scheme).toMatch(/^EMOM \d+/);
      }
    }
    expect(intervals).toBeGreaterThan(10);
  });
});

describe('race simulation : pacing travaillable', () => {
  it('tous les runs d’une même sim font la MÊME distance', () => {
    for (const d of [30, 45, 60] as const) {
      for (const s of SEEDS.slice(0, 40)) {
        const w = generateHyroxWod({ ...base, training_type: 'Race Simulation', duration_min: d }, s);
        const runs = w.blocks[0].movements.filter((m) => m.name === 'Run').map((m) => m.prescription);
        expect(new Set(runs).size).toBe(1);
      }
    }
  });

  it('les sims restent variées entre seeds (signatures distinctes pour le ranker)', () => {
    const sigs = new Set(SEEDS.slice(0, 40).map((s) =>
      hyroxSignature(generateHyroxWod({ ...base, training_type: 'Race Simulation' }, s))));
    expect(sigs.size).toBeGreaterThanOrEqual(2);
  });
});

describe('cohérence & invariants', () => {
  it('jamais deux mouvements de la même famille dans un bloc (hors race sim/run split)', () => {
    const FAMILIES: string[][] = [
      ['Goblet Squat', 'KB Front Rack Squat', 'Sandbag Front Rack Squat', 'Sandbag Thruster', 'DB Thruster', 'Wall Balls', 'Tempo Air Squat', 'Air Squat'],
      ['KB Deadlift', 'KB Romanian Deadlift', 'DB Romanian Deadlift', 'KB Swing'],
      ['DB Push Press', 'Sandbag S2OH', 'DB Strict Shoulder Press', 'Single-Arm KB Press', 'KB Clean & Press', 'Strict HSPU', 'Pike Push-up'],
      ['Sandbag Bent Over Row', 'KB Bent Over Row', 'DB Bent Over Row', 'Renegade Row'],
      ['Burpee', 'Burpee over Target'],
      ['Walking Lunge', 'DB Walking Lunge (lourd)', 'Sandbag Lunge', 'Bulgarian Split Squat'],
    ];
    for (const st of ['Engine', 'Interval', 'Aerobic', 'Force'] as const) {
      for (const s of SEEDS.slice(0, 50)) {
        const w = generateHyroxWod({ ...base, session_type: st }, s);
        for (const b of w.blocks) {
          const names = b.movements.map((m) => m.name);
          for (const fam of FAMILIES) {
            const hits = names.filter((n) => fam.includes(n));
            expect({ st, s, hits }).toEqual({ st, s, hits: hits.slice(0, 1) });
          }
        }
      }
    }
  });

  it('déterminisme : même seed → même WOD + même signature', () => {
    for (const s of SEEDS.slice(0, 20)) {
      const a = generateHyroxWod(base, s);
      const b = generateHyroxWod(base, s);
      expect(hyroxSignature(b)).toBe(hyroxSignature(a));
      expect(b.blocks[0].scheme).toBe(a.blocks[0].scheme);
    }
  });

  it('les structures restent dans le vocabulaire connu (timer/score)', () => {
    const known = new Set(['FOR TIME', 'AMRAP', 'EMOM', 'INTERVAL', 'CHIPPER', 'STRENGTH']);
    for (const st of ['Engine', 'Interval', 'Aerobic', 'Run Split', 'Force'] as const) {
      for (const s of SEEDS.slice(0, 30)) {
        const w = generateHyroxWod({ ...base, session_type: st }, s);
        expect(known.has(w.structure)).toBe(true);
      }
    }
  });
});
