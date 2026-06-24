/**
 * BattleWOD — Module TEAM partagé (Hyrox + CrossFit)
 * ==================================================
 * Transforme un WOD solo (issu de engineHyrox.ts ou engineCrossFit.ts)
 * en WOD équipe selon un schéma de partage.
 *
 * Différence de fond entre les deux modes :
 *   - CrossFit (Équipe 2/3/4) : le VOLUME augmente avec la taille de l'équipe.
 *   - Hyrox (Doubles / Relais) : on REDISTRIBUE le même total que la course standard.
 */

import { RNG } from './rng';

export type Mode = 'hyrox' | 'crossfit';

interface TMovement { name: string; prescription: string; load: string | null; equipment: string | null; [k: string]: any }
interface TBlock { label: string | null; structure: string; scheme: string; movements: TMovement[]; rest: string | null }
interface TWod {
  format: string; time_cap_min: number; score_type: string; modifiers: string[];
  blocks: TBlock[]; coach_notes: string[];
  method?: string; structure?: string; [k: string]: any;
}

export type TeamScheme =
  | 'split'
  | 'alternating'
  | 'relay'
  | 'synchro'
  | 'rotating'
  | 'worker_holder'
  | 'hyrox_doubles'
  | 'hyrox_relay';

const SCHEME_LABEL: Record<TeamScheme, string> = {
  split: 'Partage libre',
  alternating: 'Alterné (you go / I go)',
  relay: 'Relais',
  synchro: 'Synchronisé',
  rotating: 'Stations tournantes',
  worker_holder: 'Un travaille / un tient',
  hyrox_doubles: 'Doubles',
  hyrox_relay: 'Relais 4',
};

const SYNCHRO_OK = ['air squat', 'squat', 'burpee', 'wall ball', 'push-up', 'sit-up', 'lunge', 'box jump', 'jumping'];

const WORM_MOVES = ['Worm Clean', 'Worm Thruster', 'Worm Front Squat', 'Worm Walking Lunge', 'Worm Burpee Deadlift', 'Worm Ground-to-Overhead'];

function teamSizeFromFormat(format: string, mode: Mode): number {
  const f = format.toLowerCase();
  if (f.includes('solo')) return 1;
  if (mode === 'hyrox') {
    if (f.includes('double')) return 2;
    if (f.includes('relais')) return 4;
    return 1;
  }
  const m = f.match(/(\d)/);
  return m ? parseInt(m[1], 10) : 1;
}

function isCardio(name: string): boolean {
  return /run|row|ski|bike|course|rameur/i.test(name);
}

function scaleReps(p: string, factor: number): string {
  const m = p.match(/^\s*×?\s*(\d+)\s*(reps?|m|cal|cals?|km)?\s*$/i);
  if (!m) return p;
  const n = parseInt(m[1], 10) * factor;
  const unit = m[2] ? m[2].toLowerCase() : 'reps';
  return unit === 'm' ? `${n}m` : unit === 'km' ? `${n}km` : `${n} ${unit}`;
}

function chooseCrossfitScheme(rng: RNG, method: string): TeamScheme {
  const m = method.toUpperCase();
  if (m.includes('AMRAP')) return rng.pick<TeamScheme>(['alternating', 'split', 'rotating']);
  if (m.includes('EMOM')) return 'alternating';
  if (m.includes('TABATA')) return rng.pick<TeamScheme>(['alternating', 'synchro']);
  if (m.includes('MAX REPS')) return rng.pick<TeamScheme>(['split', 'relay']);
  return rng.pick<TeamScheme>(['split', 'relay', 'alternating']);
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const addNote = (wod: TWod, note: string) => { if (!wod.coach_notes.includes(note)) wod.coach_notes.push(note); };

export function applyTeamFormat<T extends TWod>(
  baseWod: T,
  opts: { mode: Mode; seed: number; wormAvailable?: boolean }
): T {
  const size = teamSizeFromFormat(baseWod.format, opts.mode);
  if (size <= 1) return baseWod;

  const rng = new RNG((opts.seed ^ 0x9e3779b9) >>> 0);
  const method = baseWod.method || baseWod.structure || '';
  const scheme: TeamScheme =
    opts.mode === 'hyrox' ? (size === 2 ? 'hyrox_doubles' : 'hyrox_relay')
                          : chooseCrossfitScheme(rng, method);

  const wod = clone(baseWod);
  wod.modifiers = [...wod.modifiers, `${SCHEME_LABEL[scheme]} (${size} athlètes)`];

  for (const block of wod.blocks) {
    switch (scheme) {
      // ---------- HYROX ----------
      case 'hyrox_doubles':
        block.scheme = `${block.scheme} — Doubles : courir ensemble, stations partagées`;
        block.movements.forEach((mv) => {
          if (!isCardio(mv.name)) mv.prescription = `${mv.prescription} (à répartir entre les 2)`;
        });
        break;
      case 'hyrox_relay':
        block.scheme = `${block.scheme} — Relais 4 : chacun enchaîne 2 legs (run + station)`;
        break;

      // ---------- CROSSFIT : volume × taille équipe ----------
      case 'split':
        block.scheme = `${block.scheme} — Total équipe ×${size} (partagez librement)`;
        block.movements.forEach((mv) => { mv.prescription = scaleReps(mv.prescription, size); });
        break;
      case 'alternating':
        block.scheme = `${block.scheme} — Alterné : you go / I go (${size} athlètes)`;
        break;
      case 'relay':
        block.scheme = `${block.scheme} — Relais : round complet chacun à tour de rôle`;
        break;
      case 'rotating':
        block.scheme = `${block.scheme} — Départ décalé : chacun sur un mouvement, on tourne`;
        break;
      case 'synchro': {
        block.scheme = `${block.scheme} — Reps synchronisées`;
        const allSync = block.movements.every((mv) => SYNCHRO_OK.some((s) => mv.name.toLowerCase().includes(s)));
        if (!allSync) block.scheme = `${block.structure} — Alterné (you go / I go)`;
        break;
      }
      case 'worker_holder':
        block.scheme = `${block.scheme} — 1 travaille / 1 tient (le travail compte tant que le hold tient)`;
        break;
    }
  }

  if (opts.wormAvailable && opts.mode === 'crossfit') {
    const b = wod.blocks[0];
    const wormName = rng.pick(WORM_MOVES);
    b.movements.push({ name: wormName, prescription: `${10 * size} reps (équipe)`, load: 'Worm', equipment: 'Worm', scaling_note: null });
    addNote(wod, 'Worm : tout le monde porte/déplace l\'implément ensemble, calez votre cadence.');
  }

  if (/AMRAP/i.test(method)) wod.score_type = 'tours + reps cumulés (équipe)';
  else if (/FOR TIME|MAX REPS|TABATA/i.test(method)) wod.score_type = `${wod.score_type} (équipe)`;

  addNote(wod, teamNote(scheme, size));
  if (opts.mode === 'hyrox' && size === 4) addNote(wod, "Définissez l'ordre de passage et qui fait quelles stations avant de partir.");
  if (opts.mode === 'crossfit') addNote(wod, "Gardez une transition rapide entre partenaires — c'est là qu'on gagne du temps.");

  return wod;
}

function teamNote(scheme: TeamScheme, size: number): string {
  switch (scheme) {
    case 'split': return `Partagez les reps comme vous voulez à ${size}, équilibrez selon la fraîcheur.`;
    case 'alternating': return "Alternez : un partenaire travaille pendant que l'autre récupère, puis on échange.";
    case 'relay': return 'Relais : un athlète fait son segment complet, tag, le suivant enchaîne.';
    case 'synchro': return 'Synchro : les reps ne comptent que si vous êtes alignés au même moment.';
    case 'rotating': return 'Chacun démarre sur un mouvement différent et tourne au signal.';
    case 'worker_holder': return "Pendant que l'un travaille, l'autre tient la position imposée ; échange quand le hold lâche.";
    case 'hyrox_doubles': return 'Doubles : vous courez chaque 1 km ensemble, puis vous vous répartissez le travail de la station.';
    case 'hyrox_relay': return 'Relais 4 : chacun enchaîne un run + sa station, puis passe le relais.';
    default: return "Coordonnez-vous et gardez le rythme d'équipe.";
  }
}
