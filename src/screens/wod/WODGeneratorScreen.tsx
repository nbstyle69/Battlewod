import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, ActivityIndicator,
} from 'react-native';
import { Sparkles, ChevronLeft, Clock, Zap, RefreshCw, History, Heart, BookOpen, ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WODStackParamList } from '../../navigation';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { incrementCounter } from '../../services/gamification';
import { captureError } from '../../lib/sentry';
import { LevelColors } from '../../theme/colors';
import { AthleteLevel, WODType } from '../../types';
import GlassBackground from '../../components/glass/GlassBackground';
import GlassCard from '../../components/glass/GlassCard';

const LEVELS: AthleteLevel[] = ['scaled', 'inter', 'rx', 'rx+', 'elite', 'pro'];
const DURATIONS = [5, 10, 15, 20];
const WOD_TYPES: WODType[] = ['AMRAP', 'For Time', 'EMOM', 'Tabata', 'Max Reps', 'Chipper', 'Ladder', 'Couplet', 'Death By'];
const UI_WOD_TYPES: WODType[] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];

const EQUIPMENT_OPTIONS = [
  'Barre + Disques', 'Haltères', 'Kettlebell', 'Box', 'Corde à sauter',
  'Barre de traction', 'Anneaux', 'Erg', 'Worm', 'Benchmark', 'Aucun matériel',
];

const TEAM_SIZES = [1, 2, 3, 4, 6];

const HYROX_ORANGE = '#F97316';

const HYROX_LEVELS = ['Women', 'Women Pro', 'Men', 'Men Pro'];
const HYROX_FORMATS = ['Solo', 'Doubles', 'Relais', 'Mixed Relais'];
const HYROX_TYPES  = ['Race Simulation', 'Station Training', 'Cardio Force'];
const HYROX_DURATIONS = [20, 30, 45, 60];
const HYROX_EQUIPMENT = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'RowErg', 'BikeErg',
  'Burpee Broad Jump', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
  'Tapis de course', 'Haltères',
];

type HyroxIntent  = 'race_prep' | 'endurance' | 'power' | 'drills';
type HyroxFatigue = 'upper' | 'lower' | 'full' | 'grip';

const HYROX_INTENT_OPTIONS: { key: HyroxIntent; label: string; emoji: string }[] = [
  { key: 'race_prep', label: 'Race Prep',  emoji: '🏁' },
  { key: 'endurance', label: 'Endurance',  emoji: '🏃' },
  { key: 'power',     label: 'Power',      emoji: '💪' },
  { key: 'drills',    label: 'Drills',     emoji: '🎯' },
];
const HYROX_VOL_MULT: Record<HyroxIntent, number> = {
  race_prep: 1.0, endurance: 0.6, power: 1.0, drills: 0.4,
};
const HYROX_RUN_M: Record<HyroxIntent, number> = {
  race_prep: 1000, endurance: 750, power: 400, drills: 200,
};
const HYROX_INTENT_TAG: Record<HyroxIntent, string> = {
  race_prep: '🏁 Race Prep', endurance: '🏃 Endurance',
  power: '💪 Power', drills: '🎯 Drills',
};
const HYROX_FATIGUE_LABEL: Record<HyroxFatigue, string> = {
  upper: '💀 Haut du corps', lower: '🦵 Jambes',
  full:  '💀 Corps entier',  grip:  '✊ Grip / Dos',
};


interface HyroxWOD {
  title: string;
  type: string;
  level: string;
  format: string;
  duration: number;
  stations: string[];
  scoring: string;
  tip: string;
  intent: HyroxIntent;
  tags: string[];
}

const HYROX_SCR_NAMES: Record<string, string[]> = {
  'Race Simulation':   ['Race Day Protocol','HYROX Race Sim','Competition Mode','Full Distance','Race Forge','Pre-Race Drill','Event Simulator','Race Crusher','Qualifier Prep','Podium Run'],
  'Station Training':  ['Station Domination','Power Station','Station Mastery','Station Siege','Platform Work','Station Builder','Force Station','Block Drill','Station Storm','Grid Work'],
  'Cardio Force':      ['Hybrid Forge','Cardio Machine','Hybrid Engine','Power Cardio','Endurance Force','Hybrid Burn','Engine Room','Cross Cardio','Hybrid Blast','Force Cardio'],
};
const HYROX_SCR_TIPS: Record<string, string[]> = {
  'Race Simulation': [
    'Gère ton allure sur les courses. Attaque chaque station à 85% max.',
    'Ne sprint jamais. La régularité fait la performance en HYROX.',
    'Optimise tes transitions : chaque seconde perdue compte.',
    'Les courses sont ta récupération active. Allure constante.',
    'Objectif : sortir de chaque station sans dépasser le seuil anaérobie.',
  ],
  'Station Training': [
    'Qualité > vitesse. Maîtrise le geste avant d\'accélérer.',
    'Simule la fatigue de course avant chaque station.',
    'Travaille chaque station comme si tu sortais d\'un 1km.',
    'Focus sur le pattern de mouvement. La technique prime sous la fatigue.',
    'Repos strictement respecté. La surcharge vient du volume.',
  ],
  'Cardio Force': [
    'Enchaîne sans repos. Adapte les charges pour tenir le rythme.',
    'Maintiens le nombre de rounds. Baisse la charge plutôt que de t\'arrêter.',
    'Tes transitions cardio→force doivent être instantanées.',
    'Optimise ta respiration sur les stations de force.',
    'Marcher c\'est acceptable. S\'asseoir non.',
  ],
};
function srand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function spick<T>(arr: T[], n: number): T[] {
  const copy = [...arr]; const result: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function generateHyroxWOD(
  level: string, format: string, type: string,
  duration: number, equipment: string[],
  intent: HyroxIntent = 'race_prep'
): HyroxWOD {
  const li    = ({ Women: 0, 'Women Pro': 1, Men: 2, 'Men Pro': 3 } as Record<string, number>)[level] ?? 2;
  const isPro = level.includes('Pro');
  const vM    = HYROX_VOL_MULT[intent];
  const dF    = ({ 20: 0.25, 30: 0.45, 45: 0.70, 60: 1.0 } as Record<number,number>)[duration] ?? 0.70;
  const runM  = Math.max(100, Math.round(HYROX_RUN_M[intent] * dF / 100) * 100);

  const hasSki  = equipment.includes('SkiErg');
  const hasSlp  = equipment.includes('Sled Push');
  const hasSlpu = equipment.includes('Sled Pull');
  const hasRow  = equipment.includes('RowErg');
  const hasBike = equipment.includes('BikeErg');
  const hasSbl  = equipment.includes('Sandbag Lunges');
  const hasWb   = equipment.includes('Wall Balls');
  const hasBbj  = equipment.includes('Burpee Broad Jump');
  const hasFc   = equipment.includes('Farmers Carry');
  const hasDb   = equipment.includes('Haltères');
  const hasTrd  = equipment.includes('Tapis de course');

  // Official loads by level [Women, Women Pro, Men, Men Pro]
  const spKg  = ['75','125','125','175'][li];
  const slKg  = ['50','75','75','125'][li];
  const wbRof = [75, 100, 100, 100][li];
  const wbKg  = ['4','6','6','9'][li];
  const fcKg  = ['16','24','24','32'][li];
  const sbKg  = ['10','20','20','30'][li];
  const dbKg  = ['12.5','15','15','22.5'][li];

  // Scale helper — rounds to nearest step
  const scaleM = (off: number, step: number) => Math.max(step, Math.round(off * vM / step) * step);
  const scaleR = (off: number, step: number) => Math.max(step, Math.round(off * vM / step) * step);

  const skiD = Math.max(100, Math.round(1000 * vM * dF / 100) * 100);
  const sblD = scaleM(100, 10);
  const fcD  = scaleM(200, 25);
  const bbD  = scaleM(80, 10);
  const wbR  = scaleR(wbRof, 5);
  const slpSets  = intent === 'drills' ? 2 : Math.max(1, Math.round(4 * vM));
  const slpuSets = intent === 'drills' ? 2 : Math.max(1, Math.round(4 * vM));

  type StDef = { str: string; fat: HyroxFatigue };

  const slpDef:  StDef = hasSlp  ? { str: `${slpSets}×12.5m Sled Push (${spKg} kg)`,  fat: 'lower' }
                        : hasBbj ? { str: `${bbD}m Burpee Broad Jump`,                  fat: 'full'  }
                                  : { str: `${[20,25,25,30][li]} Push-ups`,              fat: 'upper' };
  const slpuDef: StDef = hasSlpu ? { str: `${slpuSets}×12.5m Sled Pull (${slKg} kg)`, fat: 'grip'  }
                        : hasFc  ? { str: `${fcD}m Farmers Carry (${fcKg} kg×2)`,       fat: 'grip'  }
                                  : { str: `${[15,20,20,25][li]}m Bear Crawl`,           fat: 'lower' };
  const sblDef:  StDef = hasSbl  ? { str: `${sblD}m Sandbag Lunges (${sbKg} kg)`,      fat: 'lower' }
                        : hasFc  ? { str: `${Math.round(fcD*0.5/25)*25}m Farmers Carry (${fcKg} kg×2)`, fat: 'grip' }
                                  : { str: `${scaleR([40,50,50,60][li],5)} Walking Lunges`, fat: 'lower' };
  const wbDef:   StDef = hasWb   ? { str: `${wbR} Wall Balls (${wbKg} kg)`,            fat: 'full'  }
                                  : { str: `${scaleR([60,80,80,100][li],10)} Air Squats`, fat: 'lower' };
  const fcDef:   StDef = hasFc   ? { str: `${fcD}m Farmers Carry (${fcKg} kg×2)`,      fat: 'grip'  }
                        : hasSbl ? sblDef
                                  : { str: `${scaleR([40,50,50,60][li],5)} Goblet Squats`, fat: 'lower' };
  const bbjDef:  StDef = hasBbj  ? { str: `${bbD}m Burpee Broad Jump`,                 fat: 'full'  }
                                  : { str: `${scaleR([10,12,12,15][li],1)} Broad Jumps`, fat: 'lower' };
  const dbDef:   StDef = hasDb   ? { str: `${scaleR([12,15,15,20][li],1)} DB Thrusters (${dbKg} kg/main)`, fat: 'full' }
                                  : { str: `${scaleR([15,20,20,25][li],5)} Jumping Squats`, fat: 'lower' };

  const seenSt = new Set<string>();
  const allSt: StDef[] = [slpDef, slpuDef, sblDef, wbDef, fcDef, bbjDef, dbDef]
    .filter(s => { if (seenSt.has(s.str)) return false; seenSt.add(s.str); return true; });

  const skiStr  = hasSki ? `${skiD}m SkiErg`  : hasRow  ? `${skiD}m RowErg`  : hasBike ? `${skiD}m BikeErg` : null;
  const rowStr  = hasRow ? `${skiD}m RowErg`  : hasSki  ? `${skiD}m SkiErg`  : hasBike ? `${skiD}m BikeErg` : null;
  const bikeStr = hasBike ? `${skiD}m BikeErg` : hasSki ? `${skiD}m SkiErg`  : hasRow  ? `${skiD}m RowErg`  : null;
  const trdLabel = runM >= 1000 ? `${runM / 1000} km Tapis` : `${runM}m Tapis`;
  const runStr   = hasTrd ? trdLabel : (skiStr ?? rowStr ?? bikeStr ?? `${[30,40,40,50][li]} Burpees`);

  const cardioPool: string[] = [];
  [skiStr, rowStr, bikeStr].forEach(s => { if (s && !cardioPool.includes(s)) cardioPool.push(s); });
  if (hasTrd && !cardioPool.includes(trdLabel)) cardioPool.push(trdLabel);
  const hasAnyCo = cardioPool.length > 0;
  if (!hasAnyCo) cardioPool.push(`${[30,40,40,50][li]} Burpees`);

  // Smart station picker — avoids consecutive same fatigue zone
  function pickSmart(pool: StDef[], n: number): StDef[] {
    const avail = [...pool]; const res: StDef[] = []; let lastFat: HyroxFatigue | null = null;
    for (let i = 0; i < n && avail.length > 0; i++) {
      const cands = avail.filter(s => s.fat !== lastFat);
      const src = cands.length > 0 ? cands : avail;
      const picked = src[Math.floor(Math.random() * src.length)];
      res.push(picked); lastFat = picked.fat;
      avail.splice(avail.findIndex(s => s.str === picked.str), 1);
    }
    return res;
  }

  function dominantFatigue(defs: StDef[]): HyroxFatigue {
    const c: Record<HyroxFatigue, number> = { upper: 0, lower: 0, full: 0, grip: 0 };
    defs.forEach(d => c[d.fat]++);
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] as HyroxFatigue;
  }

  function noConsecutive(arr: string[]): string[] {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1]) {
        let swapped = false;
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j] !== arr[i] && (j + 1 >= arr.length || arr[j] !== arr[j + 1])) {
            [arr[i], arr[j]] = [arr[j], arr[i]]; swapped = true; break;
          }
        }
        if (!swapped) { arr.splice(i, 1); i--; }
      }
    }
    return arr;
  }

  const title = srand(HYROX_SCR_NAMES[type] ?? HYROX_SCR_NAMES['Race Simulation']);
  const tip   = srand(HYROX_SCR_TIPS[type]  ?? HYROX_SCR_TIPS['Race Simulation']);
  let stations: string[] = [];
  let scoring  = '';
  let pickedDefs: StDef[] = [];

  // ── RACE SIMULATION ──────────────────────────────────────────────────
  if (type === 'Race Simulation') {
    const blocCount = duration <= 20 ? srand([3,4]) : duration <= 30 ? srand([4,5]) : duration <= 45 ? srand([5,6]) : 8;
    pickedDefs = pickSmart(allSt, Math.min(blocCount, allSt.length));
    while (pickedDefs.length < blocCount) {
      const fill = allSt.filter(s => s.str !== pickedDefs[pickedDefs.length - 1]?.str);
      pickedDefs.push(srand(fill.length > 0 ? fill : allSt));
    }
    if (hasAnyCo) {
      const result: string[] = [];
      for (let i = 0; i < blocCount; i++) { result.push(runStr); if (pickedDefs[i]) result.push(pickedDefs[i].str); }
      stations = result;
      const rLabel = runM >= 1000 ? `${runM / 1000}km` : `${runM}m`;
      const timeTarget = isPro ? `< ${duration} min` : `< ${duration + 5} min`;
      scoring = `For Time — ${blocCount} blocs ${rLabel} Run + Station — objectif ${timeTarget}`;
    } else {
      stations = pickedDefs.map(s => s.str);
      scoring = `For Time — ${blocCount} stations enchaînées — cap ${duration} min`;
    }
  }

  // ── STATION TRAINING ─────────────────────────────────────────────────
  else if (type === 'Station Training') {
    if (intent === 'race_prep') {
      if (duration <= 20) {
        const n = srand([2, 3]);
        pickedDefs = pickSmart(allSt, n);
        stations = [`AMRAP ${duration} min :`, ...pickedDefs.map(s => s.str)];
        scoring = `Max rounds + reps en ${duration} min`;
      } else {
        const rounds = duration <= 30 ? srand([4, 5]) : srand([5, 6]);
        pickedDefs = pickSmart(allSt, 3);
        stations = [`${rounds} Rounds For Time :`, ...pickedDefs.map(s => s.str)];
        scoring = `For Time — ${rounds} rounds (cap ${duration} min)`;
      }
    } else if (intent === 'endurance') {
      const emomMins = srand([2, 3]);
      pickedDefs = pickSmart(allSt, emomMins);
      const emomCycles = Math.floor(duration * 0.6 / emomMins);
      const remaining = duration - emomCycles * emomMins;
      const chipDefs = pickSmart(allSt.filter(s => !pickedDefs.some(p => p.str === s.str)), Math.min(3, allSt.length));
      stations = [
        `── Bloc 1 : E${emomMins}MOM ${emomCycles * emomMins} min ──`,
        ...pickedDefs.map((s, i) => `  Min ${(i % emomMins) + 1}: ${s.str}`),
        `── Bloc 2 : For Time (cap ${remaining} min) ──`,
        runStr,
        ...chipDefs.map(s => s.str),
      ];
      scoring = `EMOM ${emomCycles * emomMins} min + Run + Stations — cap ${duration} min`;
    } else if (intent === 'power') {
      const n = srand([2, 3]);
      pickedDefs = pickSmart(allSt, n);
      const sets = isPro ? 4 : 3;
      stations = pickedDefs.flatMap(s => [`── ${s.str} ──`, `  ${sets} sets — repos :90`]);
      scoring = `${sets} Sets par station | repos :90 — noter les temps`;
    } else {
      // drills
      const drillCues = ['focus foulée', 'focus bras alignés', 'focus gainage', 'focus respiration', 'focus alignement'];
      pickedDefs = pickSmart(allSt, srand([2, 3]));
      if (cardioPool.length > 0) { stations.push(`3× ${srand(cardioPool)} — repos :60`); stations.push(`─`); }
      pickedDefs.forEach(s => {
        stations.push(`4× ${s.str} — repos :90`);
        stations.push(`  ↳ ${srand(drillCues)}`);
        stations.push(`─`);
      });
      scoring = `Technique — noter les temps par set | repos stricts`;
    }
  }

  // ── CARDIO FORCE ─────────────────────────────────────────────────────
  else {
    if (!hasAnyCo) {
      const n = Math.min(4, allSt.length);
      pickedDefs = pickSmart(allSt, n);
      const rounds = Math.max(2, Math.floor(duration / (n * 1.5)));
      stations = [`${rounds} Rounds For Time :`, ...pickedDefs.map(s => s.str)];
      scoring = `For Time — ${rounds} rounds stations (cap ${duration} min)`;
    } else {
      const blocCount = duration <= 20 ? 4 : duration <= 30 ? 6 : duration <= 45 ? 8 : 10;
      const nC = Math.ceil(blocCount / 2);
      const nF = Math.floor(blocCount / 2);
      const pC = spick(cardioPool, Math.min(nC, cardioPool.length));
      while (pC.length < nC) {
        const fc2 = cardioPool.filter(c => c !== pC[pC.length - 1]);
        pC.push(srand(fc2.length > 0 ? fc2 : cardioPool));
      }
      pickedDefs = pickSmart(allSt, Math.min(nF, allSt.length));
      while (pickedDefs.length < nF) {
        const fill = allSt.filter(s => s.fat !== pickedDefs[pickedDefs.length - 1]?.fat);
        pickedDefs.push(srand(fill.length > 0 ? fill : allSt));
      }
      const combined: string[] = [];
      for (let i = 0; i < Math.max(nC, nF); i++) {
        if (pC[i]) combined.push(pC[i]);
        if (pickedDefs[i]) combined.push(pickedDefs[i].str);
      }
      if (intent === 'power') {
        const rounds = Math.max(2, Math.floor(duration / (combined.length * 1.5)));
        stations = [`${rounds} Rounds For Time :`].concat(combined);
        scoring = `For Time — ${rounds} rounds (cap ${duration} min)`;
      } else {
        const mins = combined.length;
        stations = [`EMOM ${mins} min (répéter ${Math.floor(duration / mins)}× = ${duration} min) :`];
        combined.forEach((m, i) => stations.push(`  Min ${i + 1}: ${m}`));
        scoring = `EMOM ${duration} min — score = cycles complétés`;
      }
    }
  }

  const fmtS = (s: string): string => {
    if (s.startsWith('──') || s.startsWith('─') || s.startsWith('AMRAP') || s.startsWith('For Time')
        || s.startsWith('EMOM') || /^\d+ Rounds/.test(s) || s.startsWith('  ')) return s;
    if (format === 'Doubles')      return `${s}  ⟨I go / You go⟩`;
    if (format === 'Relais')       return `${s}  ⟨1 athlète / station⟩`;
    if (format === 'Mixed Relais') return `${s}  ⟨charges H/F adaptées⟩`;
    return s;
  };
  stations = noConsecutive(stations.map(fmtS));

  const domFat = pickedDefs.length > 0 ? dominantFatigue(pickedDefs) : 'full';
  const tags = [HYROX_INTENT_TAG[intent], HYROX_FATIGUE_LABEL[domFat]];

  return { title, type, level, format, duration, stations, scoring, tip, intent, tags };
}

type Sport = 'functional' | 'hybrid';

interface GeneratedWOD {
  title: string;
  type: WODType;
  duration: number;
  level: AthleteLevel;
  movements: string[];
  scoring: string;
  tip: string;
  intent?: Intent;
  tags?: string[];
}

// ── Intent + Movement metadata ──────────────────────────────────────────
type MvFamily = 'gymnastics' | 'weightlifting' | 'monostructural' | 'hinge' | 'squatting';
type FatigueZone = 'grip' | 'shoulder' | 'legs' | 'lungs' | 'back' | 'core';
type Intent = 'mixed' | 'cardio' | 'strength' | 'gymnastics';

interface MvtMeta { f: MvFamily; fz: FatigueZone[] }
const MVTS_META: Record<string, MvtMeta> = {
  // ── Bodyweight ──
  'Burpees':            { f:'gymnastics',     fz:['lungs'] },
  'Air Squats':         { f:'squatting',      fz:['legs'] },
  'Down Up':            { f:'gymnastics',     fz:['lungs'] },
  'Push-ups':           { f:'gymnastics',     fz:['shoulder'] },
  'Sit-ups':            { f:'gymnastics',     fz:['core'] },
  'Lunges':             { f:'squatting',      fz:['legs'] },
  'Jumping Squats':     { f:'squatting',      fz:['legs'] },
  'HSPU Stricts':       { f:'gymnastics',     fz:['shoulder'] },
  'Wall Facing HSPU':   { f:'gymnastics',     fz:['shoulder'] },
  'Pistol Squats (assistés)': { f:'gymnastics', fz:['legs'] },
  'Pistol Squats':      { f:'gymnastics',     fz:['legs'] },
  'Up-Downs':           { f:'gymnastics',     fz:['lungs'] },
  'Course':             { f:'monostructural', fz:['lungs','legs'] },
  'Wall Walks (partiels)': { f:'gymnastics',  fz:['shoulder','core'] },
  'Wall Walks':         { f:'gymnastics',     fz:['shoulder','core'] },
  'Shuttle Run':        { f:'monostructural', fz:['lungs','legs'] },
  'Burpee Over the Bar': { f:'gymnastics',    fz:['lungs'] },
  'Bar Facing Burpee':  { f:'gymnastics',     fz:['lungs'] },
  'Burpee Over the DB': { f:'gymnastics',     fz:['lungs'] },
  // ── Barbell ──
  'Thrusters':          { f:'weightlifting',  fz:['shoulder','legs'] },
  'Clusters':           { f:'weightlifting',  fz:['shoulder','legs','grip'] },
  'Deadlifts':          { f:'hinge',          fz:['back','grip'] },
  'Power Clean':        { f:'weightlifting',  fz:['back','grip'] },
  'Hang Power Clean':   { f:'weightlifting',  fz:['back','grip'] },
  'Clean':              { f:'weightlifting',  fz:['back','grip'] },
  'Squat Clean':        { f:'weightlifting',  fz:['back','grip','legs'] },
  'Hang Clean':         { f:'weightlifting',  fz:['back','grip'] },
  'Hang Squat Clean':   { f:'weightlifting',  fz:['back','grip','legs'] },
  'Front Squats':       { f:'squatting',      fz:['legs'] },
  'Back Squats':        { f:'squatting',      fz:['legs','back'] },
  'Overhead Squat':     { f:'squatting',      fz:['legs','shoulder'] },
  'Clean & Jerk':       { f:'weightlifting',  fz:['back','grip','shoulder'] },
  'Hang Clean & Jerk':  { f:'weightlifting',  fz:['back','grip','shoulder'] },
  'Hang Squat Clean & Jerk': { f:'weightlifting', fz:['back','grip','shoulder','legs'] },
  'Snatch':             { f:'weightlifting',  fz:['shoulder','grip','back'] },
  'Squat Snatch':       { f:'weightlifting',  fz:['shoulder','grip','back','legs'] },
  'Hang Snatch':        { f:'weightlifting',  fz:['shoulder','grip','back'] },
  'Power Snatch':       { f:'weightlifting',  fz:['shoulder','grip','back'] },
  'Shoulder to Overhead': { f:'weightlifting', fz:['shoulder'] },
  'Strict Press':       { f:'weightlifting',  fz:['shoulder'] },
  'Push Press':         { f:'weightlifting',  fz:['shoulder','legs'] },
  'Push Jerk':          { f:'weightlifting',  fz:['shoulder','legs'] },
  'Sumo Deadlift HP':   { f:'hinge',          fz:['back','grip','shoulder'] },
  'High Sumo Deadlift': { f:'hinge',          fz:['back','grip'] },
  // ── Haltères ──
  'DB Snatch':          { f:'weightlifting',  fz:['shoulder','grip'] },
  'DB Hang Snatch':     { f:'weightlifting',  fz:['shoulder','grip'] },
  'DB Squat Snatch':    { f:'weightlifting',  fz:['shoulder','grip','legs'] },
  'DB Thrusters':       { f:'weightlifting',  fz:['shoulder','legs'] },
  'DB Clean & Jerk':    { f:'weightlifting',  fz:['shoulder','grip'] },
  'DB Hang Clean & Jerk': { f:'weightlifting', fz:['shoulder','grip'] },
  'DB Lunges':          { f:'squatting',      fz:['legs'] },
  'Devil Press':        { f:'weightlifting',  fz:['shoulder','lungs','grip'] },
  'DB Push Press':      { f:'weightlifting',  fz:['shoulder'] },
  'DB Walking Lunge':   { f:'squatting',      fz:['legs'] },
  'DB OH Walking Lunge': { f:'squatting',     fz:['legs','shoulder'] },
  'DB Farmer Carry':    { f:'hinge',          fz:['grip','back'] },
  'DB Step Up':         { f:'squatting',      fz:['legs'] },
  'Double DB Step Up':  { f:'squatting',      fz:['legs'] },
  // ── Kettlebell ──
  'KB Swings':          { f:'hinge',          fz:['back','grip'] },
  'Goblet Squats':      { f:'squatting',      fz:['legs'] },
  'KB Snatch':          { f:'weightlifting',  fz:['grip','shoulder'] },
  'KB Clean':           { f:'weightlifting',  fz:['grip'] },
  'KB Clean & Jerk':    { f:'weightlifting',  fz:['grip','shoulder'] },
  'KB Shoulder to OH':  { f:'weightlifting',  fz:['shoulder'] },
  'KB Clean & Press':   { f:'weightlifting',  fz:['shoulder','grip'] },
  'Double KB Snatch':   { f:'weightlifting',  fz:['shoulder','grip','back'] },
  'Double KB Clean':    { f:'weightlifting',  fz:['grip','back'] },
  'Double KB Clean & Jerk': { f:'weightlifting', fz:['grip','shoulder','back'] },
  'KB Overhead Squat':  { f:'squatting',      fz:['legs','shoulder'] },
  'Double KB OH Squat': { f:'squatting',      fz:['legs','shoulder'] },
  'Turkish Get-up':     { f:'weightlifting',  fz:['shoulder','core'] },
  'KB Thruster':        { f:'weightlifting',  fz:['shoulder','legs'] },
  'KB Farmer Carry':    { f:'hinge',          fz:['grip'] },
  'KB Walking Lunge':   { f:'squatting',      fz:['legs','grip'] },
  'KB OH Walking Lunge': { f:'squatting',     fz:['legs','shoulder'] },
  // ── Box ──
  'Box Jump':           { f:'monostructural', fz:['legs'] },
  'Box Jump Over':      { f:'monostructural', fz:['legs','lungs'] },
  'Box Step-ups':       { f:'monostructural', fz:['legs'] },
  'Box Jump Step-overs': { f:'monostructural', fz:['legs','lungs'] },
  'Burpee Box Jump':    { f:'gymnastics',     fz:['lungs','legs'] },
  'Burpee Box Jump Over': { f:'gymnastics',   fz:['lungs','legs'] },
  'Med-Ball Box Step-Overs': { f:'monostructural', fz:['legs'] },
  // ── Corde ──
  'Single Unders':      { f:'monostructural', fz:['lungs'] },
  'Double Unders':      { f:'monostructural', fz:['lungs','legs'] },
  'Cross Over':         { f:'monostructural', fz:['lungs'] },
  'Double Cross Over':  { f:'monostructural', fz:['lungs'] },
  // ── Barre de traction ──
  'Pull-ups':           { f:'gymnastics', fz:['grip','shoulder'] },
  'Chest-to-bar':       { f:'gymnastics', fz:['grip','shoulder'] },
  'Toes-to-bar':        { f:'gymnastics', fz:['core','grip'] },
  'Knees-to-elbows':    { f:'gymnastics', fz:['core','grip'] },
  'Bar Muscle-ups':     { f:'gymnastics', fz:['grip','shoulder'] },
  'Kipping Pull-ups':   { f:'gymnastics', fz:['grip','shoulder'] },
  'Pull-Over':          { f:'gymnastics', fz:['grip','shoulder'] },
  // ── Anneaux ──
  'Ring Dips':          { f:'gymnastics', fz:['shoulder'] },
  'Ring Muscle-ups':    { f:'gymnastics', fz:['shoulder','grip'] },
  'Toes to Rings':      { f:'gymnastics', fz:['core','grip'] },
  'Ring Push-ups':      { f:'gymnastics', fz:['shoulder'] },
  // ── Erg ──
  'Assault Bike':       { f:'monostructural', fz:['lungs','legs'] },
  'Echo Bike':          { f:'monostructural', fz:['lungs','legs'] },
  'Ski Erg':            { f:'monostructural', fz:['lungs','shoulder'] },
  'Row':                { f:'monostructural', fz:['lungs','back'] },
  // ── Worm ──
  'Worm Clean & Jerk':  { f:'weightlifting',  fz:['back','shoulder'] },
  'Worm Squat':         { f:'squatting',      fz:['legs','back'] },
  'Worm Lunge':         { f:'squatting',      fz:['legs','back'] },
  // ── Med Ball ──
  'Wall Ball':          { f:'weightlifting',  fz:['lungs','legs','shoulder'] },
  'MB Slam':            { f:'hinge',          fz:['back','core'] },
};

type Skeleton = MvFamily[][];
const SKELETONS: Record<string, Record<Intent, Skeleton>> = {
  triplet: {
    mixed:       [['monostructural'],         ['weightlifting','hinge'],     ['gymnastics']],
    cardio:      [['monostructural'],         ['gymnastics'],                ['monostructural']],
    strength:    [['hinge','squatting'],      ['weightlifting'],             ['gymnastics','squatting']],
    gymnastics:  [['gymnastics'],             ['gymnastics'],                ['monostructural']],
  },
  couplet: {
    mixed:       [['weightlifting','hinge'],  ['gymnastics','monostructural']],
    cardio:      [['monostructural'],         ['gymnastics']],
    strength:    [['hinge','weightlifting'],  ['squatting','gymnastics']],
    gymnastics:  [['gymnastics'],             ['gymnastics']],
  },
  chipper: {
    mixed:       [['monostructural'],  ['hinge','weightlifting'], ['gymnastics'],     ['weightlifting'],   ['monostructural']],
    cardio:      [['monostructural'],  ['gymnastics'],            ['monostructural'], ['gymnastics'],      ['monostructural']],
    strength:    [['hinge'],           ['weightlifting'],         ['squatting'],      ['gymnastics'],      ['monostructural']],
    gymnastics:  [['gymnastics'],      ['gymnastics'],            ['monostructural'], ['gymnastics'],      ['hinge','weightlifting']],
  },
  emom: {
    mixed:       [['monostructural'],         ['weightlifting','gymnastics']],
    cardio:      [['monostructural'],         ['monostructural']],
    strength:    [['weightlifting','hinge'],  ['gymnastics']],
    gymnastics:  [['gymnastics'],             ['gymnastics','monostructural']],
  },
  tabata: {
    mixed:       [['gymnastics','monostructural'], ['weightlifting','squatting']],
    cardio:      [['monostructural'],              ['gymnastics']],
    strength:    [['weightlifting','hinge'],       ['squatting']],
    gymnastics:  [['gymnastics'],                  ['gymnastics']],
  },
  single: {
    mixed:       [['weightlifting','gymnastics']],
    cardio:      [['monostructural','gymnastics']],
    strength:    [['weightlifting','hinge']],
    gymnastics:  [['gymnastics']],
  },
};

const INTENT_REP_MULT: Record<Intent, number> = { mixed: 1, cardio: 1.25, strength: 0.75, gymnastics: 1 };
const INTENT_FATIGUE: Record<Intent, string> = {
  mixed: 'Corps entier', cardio: 'Cardio / Souffle', strength: 'Dos / Grip', gymnastics: 'Épaules / Core',
};
const INTENT_OPTIONS: { key: Intent; label: string; emoji: string }[] = [
  { key: 'mixed',      label: 'Mixed',  emoji: '⚡' },
  { key: 'cardio',     label: 'Cardio', emoji: '🫀' },
  { key: 'strength',   label: 'Force',  emoji: '💪' },
  { key: 'gymnastics', label: 'Gym',    emoji: '🤸' },
];

// ── Movement database ─────────────────────────────────────────────────
const _LI: Record<AthleteLevel, number> = { scaled: 0, inter: 1, rx: 2, 'rx+': 3, elite: 4, pro: 5 };
interface Mvt { name: string; eq: string[]; reps: number[]; load?: string[]; unit?: string }

const MVTS: Mvt[] = [
  // ── Bodyweight ──
  { name: 'Burpees',              eq: [],                    reps: [6,8,10,12,15,18] },
  { name: 'Air Squats',           eq: [],                    reps: [12,15,20,25,30,35] },
  { name: 'Down Up',              eq: [],                    reps: [6,8,10,12,15,18] },
  { name: 'Push-ups',             eq: [],                    reps: [8,10,15,18,20,25] },
  { name: 'Sit-ups',              eq: [],                    reps: [12,15,20,25,30,35] },
  { name: 'Lunges',               eq: [],                    reps: [10,12,16,20,24,24] },
  { name: 'Jumping Squats',       eq: [],                    reps: [8,10,12,15,18,20] },
  { name: 'HSPU Stricts',          eq: [],                    reps: [0,0,5,7,10,12] },
  { name: 'Wall Facing HSPU',     eq: [],                    reps: [0,0,0,5,8,10] },
  { name: 'Pistol Squats (assistés)', eq: [],               reps: [5,6,0,0,0,0] },
  { name: 'Pistol Squats',        eq: [],                    reps: [0,0,6,8,10,12] },
  { name: 'Up-Downs',             eq: [],                    reps: [6,8,10,12,15,15] },
  { name: 'Course',               eq: [],                    reps: [200,200,400,400,400,800], unit: 'm' },
  { name: 'Wall Walks (partiels)', eq: [],                   reps: [0,2,0,0,0,0] },
  { name: 'Wall Walks',           eq: [],                    reps: [0,0,3,4,5,6] },
  { name: 'Shuttle Run',          eq: [],                    reps: [2,2,4,4,6,6], unit: '×7.62m' },
  // ── Bodyweight avec matériel ──
  { name: 'Burpee Over the Bar',  eq: ['Barre + Disques'],   reps: [5,6,8,10,12,15] },
  { name: 'Bar Facing Burpee',    eq: ['Barre + Disques'],   reps: [5,6,8,10,12,15] },
  { name: 'Burpee Over the DB',   eq: ['Haltères'],          reps: [5,6,8,10,12,15] },
  // ── Barbell ──
  { name: 'Thrusters',            eq: ['Barre + Disques'],   reps: [8,10,12,12,15,15],  load: ['30','35','43','50','60','70'] },
  { name: 'Clusters',             eq: ['Barre + Disques'],   reps: [3,5,6,6,8,8],       load: ['30','35','43','50','60','70'] },
  { name: 'Deadlifts',            eq: ['Barre + Disques'],   reps: [8,10,12,12,15,15],  load: ['50','60','70','90','100','120'] },
  { name: 'Power Clean',          eq: ['Barre + Disques'],   reps: [5,6,8,8,10,10],     load: ['35','40','50','60','70','80'] },
  { name: 'Hang Power Clean',     eq: ['Barre + Disques'],   reps: [5,6,8,8,10,10],     load: ['30','35','43','50','60','70'] },
  { name: 'Clean',                eq: ['Barre + Disques'],   reps: [5,6,8,8,10,10],     load: ['35','40','50','60','70','80'] },
  { name: 'Squat Clean',          eq: ['Barre + Disques'],   reps: [3,5,6,8,8,10],      load: ['35','40','50','60','70','80'] },
  { name: 'Hang Clean',           eq: ['Barre + Disques'],   reps: [5,6,8,8,10,10],     load: ['30','35','43','50','60','70'] },
  { name: 'Hang Squat Clean',     eq: ['Barre + Disques'],   reps: [0,4,5,6,8,8],       load: ['','35','43','50','60','70'] },
  { name: 'Front Squats',         eq: ['Barre + Disques'],   reps: [6,8,10,10,12,12],   load: ['35','40','50','60','70','80'] },
  { name: 'Back Squats',          eq: ['Barre + Disques'],   reps: [6,8,10,10,12,12],   load: ['40','50','60','70','85','100'] },
  { name: 'Overhead Squat',       eq: ['Barre + Disques'],   reps: [0,5,6,8,8,10],      load: ['','25','35','43','50','60'] },
  { name: 'Clean & Jerk',         eq: ['Barre + Disques'],   reps: [3,5,6,8,8,10],      load: ['35','40','50','60','70','85'] },
  { name: 'Hang Clean & Jerk',    eq: ['Barre + Disques'],   reps: [3,5,6,6,8,8],       load: ['30','35','43','50','60','70'] },
  { name: 'Hang Squat Clean & Jerk', eq: ['Barre + Disques'], reps: [0,3,5,6,6,8],      load: ['','35','43','50','60','70'] },
  { name: 'Snatch',               eq: ['Barre + Disques'],   reps: [0,3,5,6,8,8],       load: ['','30','40','50','60','70'] },
  { name: 'Squat Snatch',         eq: ['Barre + Disques'],   reps: [0,0,3,5,6,8],       load: ['','','40','50','60','70'] },
  { name: 'Hang Snatch',          eq: ['Barre + Disques'],   reps: [0,3,5,6,8,8],       load: ['','25','35','43','50','60'] },
  { name: 'Power Snatch',         eq: ['Barre + Disques'],   reps: [0,3,5,6,8,8],       load: ['','30','40','50','60','70'] },
  { name: 'Shoulder to Overhead',  eq: ['Barre + Disques'],  reps: [6,8,10,10,12,12],   load: ['25','30','40','50','55','60'] },
  { name: 'Strict Press',         eq: ['Barre + Disques'],   reps: [6,8,10,10,12,12],   load: ['20','25','30','40','45','50'] },
  { name: 'Push Press',           eq: ['Barre + Disques'],   reps: [6,8,10,10,12,12],   load: ['25','30','40','50','55','60'] },
  { name: 'Push Jerk',            eq: ['Barre + Disques'],   reps: [5,6,8,8,10,10],     load: ['30','35','43','50','60','70'] },
  { name: 'Sumo Deadlift HP',     eq: ['Barre + Disques'],   reps: [6,8,10,12,12,15],   load: ['25','30','35','40','50','55'] },
  { name: 'High Sumo Deadlift',   eq: ['Barre + Disques'],   reps: [6,8,10,12,12,15],   load: ['30','35','40','50','55','60'] },
  // ── Haltères ──
  { name: 'DB Snatch',            eq: ['Haltères'],          reps: [6,8,10,12,15,15],   load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB Hang Snatch',       eq: ['Haltères'],          reps: [6,8,10,12,15,15],   load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB Squat Snatch',      eq: ['Haltères'],          reps: [0,5,8,10,12,12],    load: ['','10/7','15/10','20/14','22.5/15','25/17'] },
  { name: 'DB Thrusters',         eq: ['Haltères'],          reps: [6,8,10,12,15,15],   load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB Clean & Jerk',      eq: ['Haltères'],          reps: [5,6,8,10,10,12],    load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB Hang Clean & Jerk', eq: ['Haltères'],          reps: [5,6,8,10,10,12],    load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB Lunges',            eq: ['Haltères'],          reps: [8,10,12,16,16,20],  load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'Devil Press',          eq: ['Haltères'],          reps: [4,5,6,8,10,10],     load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB Push Press',        eq: ['Haltères'],          reps: [6,8,10,12,12,15],   load: ['7/5','10/7','15/10','20/14','22.5/15','25/17'] },
  { name: 'DB Walking Lunge',     eq: ['Haltères'],          reps: [8,10,12,16,16,20],  load: ['10/7','15/10','22.5/15','25/17','30/20','35/25'] },
  { name: 'DB OH Walking Lunge',  eq: ['Haltères'],          reps: [6,8,10,12,14,16],   load: ['7/5','10/7','15/10','20/14','22.5/15','25/17'] },
  { name: 'DB Farmer Carry',      eq: ['Haltères'],          reps: [25,25,50,50,50,75], load: ['15/10','17.5/12','22.5/15','25/17','30/20','35/25'], unit: 'm' },
  // ── Kettlebell ──
  { name: 'KB Swings',            eq: ['Kettlebell'],        reps: [10,12,15,20,20,25], load: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
  { name: 'Goblet Squats',        eq: ['Kettlebell'],        reps: [8,10,12,15,15,20],  load: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
  { name: 'KB Snatch',            eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
  { name: 'KB Clean',             eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
  { name: 'KB Clean & Jerk',      eq: ['Kettlebell'],        reps: [3,5,6,8,8,10],      load: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  { name: 'KB Shoulder to OH',    eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  { name: 'KB Clean & Press',     eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  { name: 'Double KB Snatch',     eq: ['Kettlebell'],        reps: [0,4,6,8,8,10],      load: ['','12/8','16/12','20/16','24/16','28/20'] },
  { name: 'Double KB Clean',      eq: ['Kettlebell'],        reps: [0,4,6,8,8,10],      load: ['','12/8','16/12','20/16','24/16','28/20'] },
  { name: 'Double KB Clean & Jerk', eq: ['Kettlebell'],      reps: [0,3,5,6,8,8],       load: ['','12/8','16/12','20/16','24/16','28/20'] },
  { name: 'KB Overhead Squat',    eq: ['Kettlebell'],        reps: [0,5,6,8,8,10],      load: ['','12/8','16/12','20/16','24/16','28/20'] },
  { name: 'Double KB OH Squat',   eq: ['Kettlebell'],        reps: [0,0,5,6,8,8],       load: ['','','12/8','16/12','20/16','24/16'] },
  { name: 'Turkish Get-up',       eq: ['Kettlebell'],        reps: [2,2,3,4,4,5],       load: ['10/8','14/10','16/12','20/14','24/16','28/20'] },
  { name: 'KB Thruster',          eq: ['Kettlebell'],        reps: [6,8,10,12,12,15],   load: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  { name: 'KB Farmer Carry',      eq: ['Kettlebell'],        reps: [25,25,50,50,50,75], load: ['16/12','20/16','24/16','28/20','32/24','36/28'], unit: 'm' },
  { name: 'KB Walking Lunge',     eq: ['Kettlebell'],        reps: [8,10,12,16,16,20],  load: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  { name: 'KB OH Walking Lunge',  eq: ['Kettlebell'],        reps: [6,8,10,12,14,16],   load: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  // ── Box ──
  { name: 'Box Jump',             eq: ['Box'],               reps: [8,10,12,15,18,20] },
  { name: 'Box Jump Over',        eq: ['Box'],               reps: [6,8,10,12,15,18] },
  { name: 'Box Step-ups',         eq: ['Box'],               reps: [10,12,16,20,20,24] },
  { name: 'Box Jump Step-overs',  eq: ['Box'],               reps: [6,8,10,12,15,18] },
  { name: 'Burpee Box Jump',      eq: ['Box'],               reps: [4,5,6,8,10,12] },
  { name: 'Burpee Box Jump Over', eq: ['Box'],               reps: [4,5,6,8,10,12] },
  { name: 'Med-Ball Box Step-Overs', eq: ['Box'],            reps: [6,8,10,12,15,18] },
  { name: 'DB Step Up',           eq: ['Haltères','Box'],    reps: [8,10,12,16,16,20],  load: ['7/5','10/7','15/10','20/14','22.5/15','25/17'] },
  { name: 'Double DB Step Up',    eq: ['Haltères','Box'],    reps: [6,8,10,12,14,16],   load: ['7/5','10/7','15/10','20/14','22.5/15','25/17'] },
  // ── Corde à sauter ──
  { name: 'Single Unders',        eq: ['Corde à sauter'],    reps: [30,40,50,50,60,75] },
  { name: 'Double Unders',        eq: ['Corde à sauter'],    reps: [0,10,20,30,40,50] },
  { name: 'Cross Over',           eq: ['Corde à sauter'],    reps: [0,0,10,15,20,25] },
  { name: 'Double Cross Over',    eq: ['Corde à sauter'],    reps: [0,0,0,5,10,15] },
  // ── Barre de traction ──
  { name: 'Pull-ups',             eq: ['Barre de traction'], reps: [3,5,8,10,12,15] },
  { name: 'Chest-to-bar',         eq: ['Barre de traction'], reps: [0,0,5,8,10,12] },
  { name: 'Toes-to-bar',          eq: ['Barre de traction'], reps: [0,5,8,10,12,15] },
  { name: 'Knees-to-elbows',      eq: ['Barre de traction'], reps: [5,8,10,12,15,15] },
  { name: 'Bar Muscle-ups',       eq: ['Barre de traction'], reps: [0,0,0,3,5,7] },
  { name: 'Kipping Pull-ups',     eq: ['Barre de traction'], reps: [0,5,10,12,15,18] },
  { name: 'Pull-Over',            eq: ['Barre de traction'], reps: [0,3,5,8,10,12] },
  // ── Anneaux ──
  { name: 'Ring Dips',            eq: ['Anneaux'],           reps: [0,3,5,8,10,12] },
  { name: 'Ring Muscle-ups',      eq: ['Anneaux'],           reps: [0,0,2,3,5,7] },
  { name: 'Toes to Rings',        eq: ['Anneaux'],           reps: [0,5,8,10,12,15] },
  // ── Erg ──
  { name: 'Assault Bike',         eq: ['Erg'],               reps: [8,10,12,15,18,20], unit: 'cal' },
  { name: 'Echo Bike',            eq: ['Erg'],               reps: [8,10,12,15,18,20], unit: 'cal' },
  { name: 'Ski Erg',              eq: ['Erg'],               reps: [8,10,12,15,18,20], unit: 'cal' },
  { name: 'Row',                  eq: ['Erg'],               reps: [10,12,15,18,20,25], unit: 'cal' },
  // ── Worm ──
  { name: 'Worm Clean & Jerk',    eq: ['Worm'],              reps: [3,4,5,6,8,8],      load: ['35','35','75','75','110','110'] },
  { name: 'Worm Squat',           eq: ['Worm'],              reps: [4,5,6,8,8,10],     load: ['35','35','75','75','110','110'] },
  { name: 'Worm Lunge',           eq: ['Worm'],              reps: [6,8,10,12,12,15],  load: ['35','35','75','75','110','110'] },
];

// ── Name & tip pools ──────────────────────────────────────────────────
const WOD_NAMES: Record<string, string[]> = {
  'AMRAP':    ['Iron Storm','Battle Circuit','Body Blaster','Grind Time','Engine Builder','Round Hunter','The Furnace','Assault Mode','Beast Mode','Rep City','The Forge','Full Throttle','Sweat Factory','Combat Engine','Endurance Machine'],
  'For Time': ['Speed Demon','Grace Remix','Lightning Strike','Race Day','The Sprint','Time Crusher','Flash Point','Velocity','Quick & Dirty','The Eliminator','Fast Lane','Time Bomb','The Gauntlet','Blitz','Clock Breaker'],
  'EMOM':     ['Minute Warrior','Clock Work','Tick Tock','The Metronome','Precision','Tempo Work','Clock Killer','Beat the Clock','Rhythm Machine','Minute Mastery','Interval Forge','Time Under Tension','On the Minute','Minute Grind','Tempo Storm'],
  'Tabata':   ['Tabata Fury','Burn Notice','Maximum Output','Short Fuse','Tabata Storm','Explosive Intervals','Quick Burn','Afterburner','Inferno','Flash Burn','Tabata Thunder','Rapid Fire','Heat Wave','Meltdown','Ignition'],
  'Max Reps':  ['Peak Performance','Limit Breaker','All Out','Max Effort','No Ceiling','Beyond Limits','Full Send','The Wall','Capacity Test','Raw Power','Final Push','Red Zone','Absolute Max','Breaking Point','Last Man Standing'],
  'Chipper':   ['The Chipper','Brick Wall','Top to Bottom','Full List','Death March','The Stack','Wall of Pain','Checklist','Chip Away','Iron List','Layer by Layer','The Descent','Box Crusher','One Pass','The Grinder'],
  'Ladder':    ['The Ladder','Stairway','Ascending','Pyramid Peak','The Climb','Escalation','Rising Storm','Step Up','Ascent','One More','Ground Floor','The Pyramid','Step by Step','Upward','Base Camp'],
  'Couplet':   ['Double Trouble','Power Pair','Triple Threat','The Duo','Tag Team','Iron Pair','Force Duo','Twin Engine','Three Pillars','The Triplet','Couplet Classic','The Double','The Triple','Two for One','Pair Work'],
  'Death By':  ['Death By','The Reaper','Last Man','Minute Killer','Final Countdown','No Ceiling','The Abyss','Into the Deep','The Void','One More Rep','Never Enough','Death Toll','Unlimited','The Grind','One by One'],
};

const WOD_TIPS: Record<string, string[]> = {
  'AMRAP': [
    'Garde un rythme constant. Évite de partir trop vite sur le 1er round.',
    'Divise le WOD en séries gérables. Petites séries sans pause > gros sets avec longues pauses.',
    'Regarde l\'horloge à chaque round. Si tu ralentis, simplifie les mouvements.',
    'Les transitions entre mouvements sont clés — pas de temps mort.',
    'Objectif : même rythme du round 1 au dernier. Régularité > vitesse.',
    'Respire dans les mouvements cycliques. Expire à l\'effort.',
    'Si tu casses, baisse les reps mais ne t\'arrête jamais.',
    'Note ton score à chaque round pour tracker ta progression.',
    'Commence par le mouvement le plus technique quand tu es frais.',
    'Fixe-toi un objectif de rounds minimum avant de commencer.',
  ],
  'For Time': [
    'Gère ton souffle sur les barres. Les transitions rapides font la différence.',
    'Pars à 85%. Si tu te sens bien à mi-parcours, accélère.',
    'Les rep schemes décroissants sont mentaux — chaque série est plus courte.',
    'Fractionne les gros sets : 21 = 12+9 ou 7+7+7.',
    'Visualise la fin. La dernière série est toujours la plus importante.',
    'Hydrate-toi avant. Ce type de WOD est le plus cardio.',
    'Pose la barre le moins possible. Chaque pause coûte 5-10 secondes.',
    'Chrono visible. Savoir où tu en es mentalement aide à pousser.',
    'Le For Time récompense la stratégie autant que la force.',
    'Transitions rapides = secondes gagnées. Enchaîne sans hésiter.',
  ],
  'EMOM': [
    'L\'objectif est de finir chaque minute avec du temps de repos.',
    'Si tu ne finis pas dans la minute, baisse les reps de 2.',
    'Cible 40-45s de travail par minute pour garder du repos.',
    'L\'EMOM est parfait pour travailler la technique sous fatigue légère.',
    'Reste régulier. Même reps, même tempo, chaque minute.',
    'Utilise les 10-15s de repos pour te repositionner et respirer.',
    'Alterne les groupes musculaires si possible pour mieux récupérer.',
    'C\'est un format progressif — augmente les reps semaine après semaine.',
    'Si c\'est trop facile, ajoute 2 reps. Trop dur, retire 2.',
    'L\'EMOM te force à respecter le clock. Pas d\'excuse pour traîner.',
  ],
  'Tabata': [
    'Chaque round de 20s doit être à 100%. Le repos de 10s est sacré.',
    'Ne ralentis pas les derniers rounds. C\'est là que le Tabata fait effet.',
    'Le Tabata est le roi du HIIT. Pousse comme un sprint de 4 minutes.',
    'Compte tes reps à chaque round. Le score = la somme totale.',
    'Les 2 derniers rounds sont les plus importants. C\'est là que tu progresses.',
    'Respire pendant les 10s de repos — inspire par le nez, expire par la bouche.',
    'Prépare ton espace. Pas de temps pour ajuster le matériel.',
    'Technique avant vitesse. Même sous fatigue, garde la forme.',
    'Le Tabata est court mais intense. Échauffement obligatoire.',
    'Score minimum = reps du round le plus faible × 8.',
  ],
  'Max Reps': [
    'Teste tes vraies limites. Pousse jusqu\'au bout.',
    'Séries cassées autorisées. L\'objectif est le total, pas le non-stop.',
    'Fractionne : 5-5-5-5 est mieux que 15 puis rien.',
    'Garde 2-3 reps en réserve sur les premières séries.',
    'Le mental fait 50% du travail sur un Max Reps.',
    'Respire entre chaque rep si nécessaire. Chaque rep compte.',
    'Stratégie : gros set initial, puis séries dégressives régulières.',
    'Note ton score pour pouvoir le battre la prochaine fois.',
    'Si tu utilises une barre, ne la lâche pas plus de 5 secondes.',
    'Dernière minute = tout donner. Pas de regrets.',
  ],
  'Chipper': [
    'Grignoter la liste du haut vers le bas. Fractionne les gros sets.',
    'Ne t\'arrête jamais plus de 10s. L\'objectif c\'est le débit.',
    'Commence fort sur les mouvements que tu maîtrises.',
    'Les derniers mouvements sont toujours les plus difficiles. Garde du jus.',
    'Split les gros sets : 50 = 3×17. Mieux que d\'aller à l\'échec.',
  ],
  'Ladder': [
    'Facile au départ. Chaque round coûte un peu plus. Pace-toi.',
    'La pyramide monte et redescend. Le sommet est le moment critique.',
    'Plus le mouvement est technique, plus la gestion est importante.',
    'L\'accumulation est ce qui te tue. Respire entre chaque rep si besoin.',
    'Ne sous-estime pas les premières minutes : elles prédisent les suivantes.',
  ],
  'Couplet': [
    'Seulement 2-3 mouvements. Aucune excuse pour ne pas être efficace.',
    'Transitions immédiates entre les mouvements. Zéro temps mort.',
    'Le couplet classique est brutal dans sa simplicité. Reste régulier.',
    'Pace-toi sur le mouvement limitant. Ne te crame pas dessus.',
    'Le triplet est plus généreux physiquement. Exploite ça pour le rythme.',
  ],
  'Death By': [
    'Les premières minutes semblent faciles. C\'est un piège. Gère ta respiration dès le départ.',
    'Death By teste ta capacité à tenir sous la fatigue accumulée. Pas de sprint.',
    'Score = dernière minute complétée. Chaque rep de bonus compte.',
    'Ne gaspille pas d\'énergie sur les premières minutes. C\'est une stratégie, pas un sprint.',
    'Ton vrai score commence quand ça devient difficile. Bats-toi minute par minute.',
  ],
};

// ── Benchmark WODs (Hero + Girl + Open) ───────────────────────────────
interface BenchmarkWOD { title: string; cat: string; moves: string[]; scoring: string; tip: string }
const BENCHMARKS: BenchmarkWOD[] = [
  // ── Girl WODs ──
  { title:'Fran', cat:'Girl', moves:['21-15-9 :','Thrusters (43 kg)','Pull-ups'], scoring:'For Time', tip:'Fractionne les séries si besoin : 12+9 / 8+7 / 5+4.' },
  { title:'Grace', cat:'Girl', moves:['30 Clean & Jerk (60 kg)'], scoring:'For Time', tip:'Singles ou touch-and-go ? Trouve ton rythme et tiens-le.' },
  { title:'Helen', cat:'Girl', moves:['3 Rounds For Time :','400m Course','21 KB Swings (24 kg)','12 Pull-ups'], scoring:'For Time', tip:'La course te prépare, les KB te fatiguent, les pull-ups te finissent.' },
  { title:'Diane', cat:'Girl', moves:['21-15-9 :','Deadlifts (100 kg)','Handstand Push-ups'], scoring:'For Time', tip:'Les HSPU sont le bottleneck. Gère ta fatigue d\'épaule.' },
  { title:'Elizabeth', cat:'Girl', moves:['21-15-9 :','Cleans (60 kg)','Ring Dips'], scoring:'For Time', tip:'Les cleans lourds fatiguent les bras pour les dips. Pense à fractionner.' },
  { title:'Amanda', cat:'Girl', moves:['9-7-5 :','Ring Muscle-ups','Squat Snatches (60 kg)'], scoring:'For Time', tip:'Chaque rep compte. Qualité de mouvement avant vitesse.' },
  { title:'Annie', cat:'Girl', moves:['50-40-30-20-10 :','Double Unders','Sit-ups'], scoring:'For Time', tip:'Les DU sont la clé. Si tu casses, calme-toi et repars.' },
  { title:'Barbara', cat:'Girl', moves:['5 Rounds (3 min repos entre) :','20 Pull-ups','30 Push-ups','40 Sit-ups','50 Air Squats'], scoring:'For Time', tip:'Chaque round doit être constant. Ne pars pas trop vite au round 1.' },
  { title:'Chelsea', cat:'Girl', moves:['E1MOM pendant 30 min :','5 Pull-ups','10 Push-ups','15 Air Squats'], scoring:'EMOM 30 min', tip:'Si tu ne finis pas dans la minute, baisse les reps de 1.' },
  { title:'Cindy', cat:'Girl', moves:['AMRAP 20 min :','5 Pull-ups','10 Push-ups','15 Air Squats'], scoring:'Max rounds en 20 min', tip:'Rythme constant. Objectif : 20+ rounds pour RX.' },
  { title:'DT', cat:'Girl', moves:['5 Rounds For Time :','12 Deadlifts (70 kg)','9 Hang Cleans (70 kg)','6 Push Jerks (70 kg)'], scoring:'For Time', tip:'Ne lâche pas la barre. Touch-and-go si possible.' },
  { title:'Isabel', cat:'Girl', moves:['30 Snatches (60 kg)'], scoring:'For Time', tip:'Singles rapides ou séries de 3. Pas de repos de plus de 5s.' },
  { title:'Jackie', cat:'Girl', moves:['For Time :','1000m Row','50 Thrusters (20 kg)','30 Pull-ups'], scoring:'For Time', tip:'Le row est ta mise en route. Explose sur les thrusters.' },
  { title:'Karen', cat:'Girl', moves:['150 Wall Balls (9 kg)'], scoring:'For Time', tip:'Séries de 25 minimum. Ne pose pas le ballon plus de 3s.' },
  { title:'Kelly', cat:'Girl', moves:['5 Rounds For Time :','400m Course','30 Box Jumps','30 Wall Balls (9 kg)'], scoring:'For Time', tip:'Long WOD. Gère ton allure dès le départ.' },
  { title:'Mary', cat:'Girl', moves:['AMRAP 20 min :','5 Handstand Push-ups','10 Pistol Squats','15 Pull-ups'], scoring:'Max rounds en 20 min', tip:'Mouvement de gym par excellence. La technique prime.' },
  { title:'Nancy', cat:'Girl', moves:['5 Rounds For Time :','400m Course','15 Overhead Squats (43 kg)'], scoring:'For Time', tip:'Les OHS après la course sont brutaux. Stabilise ta respiration.' },
  // ── Hero WODs ──
  { title:'Murph', cat:'Hero', moves:['For Time (avec gilet 9 kg) :','1 Mile Course','100 Pull-ups','200 Push-ups','300 Air Squats','1 Mile Course'], scoring:'For Time', tip:'Partition : 20 rounds de 5 pull-ups, 10 push-ups, 15 squats.' },
  { title:'Nate', cat:'Hero', moves:['AMRAP 20 min :','2 Muscle-ups','4 Handstand Push-ups','8 KB Swings (24 kg)'], scoring:'Max rounds en 20 min', tip:'WOD technique. Les muscle-ups sont le limitant.' },
  { title:'Randy', cat:'Hero', moves:['75 Power Snatches (34 kg)'], scoring:'For Time', tip:'Touch-and-go par séries de 10-15. Ne lâche pas la barre.' },
  { title:'JT', cat:'Hero', moves:['21-15-9 :','Handstand Push-ups','Ring Dips','Push-ups'], scoring:'For Time', tip:'Tout en poussée. Gère tes épaules et triceps.' },
  { title:'Badger', cat:'Hero', moves:['3 Rounds For Time :','30 Squat Cleans (43 kg)','30 Pull-ups','800m Course'], scoring:'For Time', tip:'Long et lourd. Fractionne les cleans en 5×6.' },
  { title:'Lumberjack 20', cat:'Hero', moves:['For Time :','20 Deadlifts (60 kg)','400m Course','20 KB Swings (24 kg)','400m Course','20 Overhead Squats (43 kg)','400m Course','20 Burpees','400m Course','20 Pull-ups (C2B)','400m Course','20 Box Jumps','400m Course','20 DB Squat Cleans (20 kg)','400m Course'], scoring:'For Time', tip:'Chaque mouvement est frais. La course est ta récupération.' },
  { title:'Loredo', cat:'Hero', moves:['6 Rounds For Time :','24 Air Squats','24 Push-ups','24 Walking Lunges','400m Course'], scoring:'For Time', tip:'Bodyweight pur. Rythme régulier sur les 6 rounds.' },
  { title:'Ryan', cat:'Hero', moves:['5 Rounds For Time :','7 Muscle-ups','21 Burpees'], scoring:'For Time', tip:'Les muscle-ups sont la clé. Séries de 3-4 max.' },
  // ── Open WODs ──
  { title:'Open 11.1', cat:'Open', moves:['AMRAP 10 min :','30 Double Unders','15 Power Snatches (34 kg)'], scoring:'Max rounds en 10 min', tip:'Les DU doivent être unbroken. Snatches en touch-and-go.' },
  { title:'Open 12.1', cat:'Open', moves:['AMRAP 7 min :','Burpees'], scoring:'Max reps en 7 min', tip:'Objectif : 100+ burpees. Rythme constant, pas de pause.' },
  { title:'Open 14.5 / 16.5', cat:'Open', moves:['21-18-15-12-9-6-3 :','Thrusters (43 kg)','Burpees'], scoring:'For Time', tip:'Classique. Fractionne les thrusters, enchaîne les burpees.' },
  { title:'Open 15.5', cat:'Open', moves:['27-21-15-9 :','Row (Cal)','Thrusters (43 kg)'], scoring:'For Time', tip:'Le rameur monte vite en cal. Gère ton allure.' },
  { title:'Open 17.1', cat:'Open', moves:['For Time :','10-15 DB Snatches (22.5 kg)','15 Burpee Box Jump-Overs','20-15 DB Snatches','15 Burpee Box Jump-Overs','30 DB Snatches','15 Burpee Box Jump-Overs','40 DB Snatches','15 Burpee Box Jump-Overs','50 DB Snatches','15 Burpee Box Jump-Overs'], scoring:'For Time', tip:'Gère les BBJO. Les DB Snatches en unbroken si possible.' },
  { title:'Open 17.5', cat:'Open', moves:['10 Rounds For Time :','9 Thrusters (43 kg)','35 Double Unders'], scoring:'For Time', tip:'Thrusters en unbroken ou 5+4. DU rapides.' },
  { title:'Open 18.1', cat:'Open', moves:['AMRAP 20 min :','8 Toes-to-bar','10 DB Hang Clean & Jerk (22.5 kg)','14 Cal Row'], scoring:'Max rounds en 20 min', tip:'Long AMRAP. Rythme et transitions.' },
  { title:'Open 18.5 / 19.5', cat:'Open', moves:['For Time :','33-27-21-15-9','Thrusters (43 kg)','Chest-to-bar Pull-ups'], scoring:'For Time (cap 20 min)', tip:'Volume massif. Les C2B sont le limitant.' },
  { title:'Open 20.1', cat:'Open', moves:['10 Rounds For Time :','8 Ground to Overhead (61 kg)','10 Bar Facing Burpees'], scoring:'For Time (cap 15 min)', tip:'G2O en singles propres. Burpees rapides.' },
  { title:'Open 21.1', cat:'Open', moves:['For Time (cap 15 min) :','1 Wall Walk + 10 DU','3 Wall Walks + 30 DU','6 Wall Walks + 60 DU','9 Wall Walks + 90 DU','15 Wall Walks + 150 DU','21 Wall Walks + 210 DU'], scoring:'For Time', tip:'Progression brutale. Les DU doivent rester unbroken.' },
  { title:'Open 22.1', cat:'Open', moves:['AMRAP 15 min :','3 Wall Walks','12 DB Snatches (22.5 kg)','15 Box Jump-Overs'], scoring:'Max rounds en 15 min', tip:'Wall walks = technique. DB snatches alternés.' },
  { title:'Open 23.1', cat:'Open', moves:['AMRAP 14 min :','60 Cal Row','50 Toes-to-bar','40 Wall Balls (9 kg)','30 Cleans (60 kg)','20 Muscle-ups'], scoring:'Max reps en 14 min', tip:'Commence fort sur le row. Les MU sont le bonus.' },
  { title:'Open 24.1', cat:'Open', moves:['AMRAP 15 min (poids croissant) :','21/15 Cal Row','15 Deadlifts','9 Sumo Deadlift HP','6 Cleans'], scoring:'Max rounds en 15 min', tip:'Le poids augmente à chaque round. Gère ta fatigue.' },
  { title:'Open 24.2', cat:'Open', moves:['AMRAP 20 min :','300m Shuttle Run','10 Clean & Jerk (60 kg)','30 Toes-to-bar'], scoring:'Max rounds en 20 min', tip:'La course est longue. Les C&J doivent être efficaces.' },
];

// ── Helpers ────────────────────────────────────────────────────────────
function fmtMvt(m: Mvt, li: number): string {
  const r = m.reps[li];
  const u = m.unit ?? '';
  const ld = m.load?.[li];
  if (u === 'm')        return `${r}m ${m.name}`;
  if (u === 'cal')      return `${r} Cal ${m.name}`;
  if (u === '×7.62m')   return `${r}×7.62m ${m.name}`;
  if (ld)               return `${r} ${m.name} (${ld} kg${ld.includes('/') ? ' H/F' : ''})`;
  return `${r} ${m.name}`;
}

function fmtMvtLabel(m: Mvt, li: number): string {
  const ld = m.load?.[li];
  if (ld) return `${m.name} (${ld} kg${ld.includes('/') ? ' H/F' : ''})`;
  return m.name;
}

function generateWOD(level: AthleteLevel, duration: number, type: WODType, equipment: string[], teamSize: number = 1, intent: Intent = 'mixed'): GeneratedWOD {
  // ── Benchmark mode ──
  if (equipment.includes('Benchmark')) {
    const bm = srand(BENCHMARKS);
    const teamLabel = teamSize > 1 ? `\n⚡ En équipe de ${teamSize} — répartissez le travail` : '';
    return {
      title: `${bm.title} (${bm.cat})`,
      type: 'For Time' as WODType,
      duration: 0,
      level,
      movements: teamSize > 1 ? [...bm.moves, `── Équipe de ${teamSize} : split le travail ──`] : bm.moves,
      scoring: bm.scoring + teamLabel,
      tip: bm.tip,
    };
  }

  const li = _LI[level];
  const noEquip = equipment.includes('Aucun matériel');
  const realEquip = equipment.filter(e => e !== 'Aucun matériel' && e !== 'Benchmark');

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 5 — Équipement strict : ne propose QUE les mouvements dont
  //   TOUT l'équipement requis est sélectionné. Si aucun → bodyweight.
  // RÈGLE 4 — Adaptation niveau : filtre reps[li] === 0 (mouvement trop
  //   avancé ou trop simple pour ce level).
  // ═══════════════════════════════════════════════════════════════════════
  const pool = MVTS.filter(m => {
    if (m.reps[li] === 0) return false;
    if (noEquip) return m.eq.length === 0;
    if (equipment.length === 0) return true;
    return m.eq.every(e => equipment.includes(e));
  });

  // Force-pick: guarantee at least one movement per selected equipment category
  const forced: Mvt[] = [];
  if (!noEquip) {
    for (const eq of realEquip) {
      const eqPool = pool.filter(m => m.eq.includes(eq) && !forced.includes(m));
      if (eqPool.length > 0) forced.push(srand(eqPool));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 6 — Charge uniforme par catégorie de matériel
  //   → Barre + Disques, Haltères, Kettlebell : même charge (la plus
  //     basse) pour tous les mouvements d'une même catégorie dans un WOD.
  // ═══════════════════════════════════════════════════════════════════════
  const LOAD_EQS = ['Barre + Disques', 'Haltères', 'Kettlebell'];
  function unifyLoads(mvs: Mvt[]): Mvt[] {
    const cloned: Mvt[] = mvs.map(m => ({ ...m, load: m.load ? [...m.load] : undefined }));
    if (cloned.length < 2) return cloned;
    for (const eq of LOAD_EQS) {
      const indices = cloned.map((m, i) => m.eq.includes(eq) && m.load && m.load[li] && parseFloat(m.load[li]) > 0 ? i : -1).filter(i => i >= 0);
      if (indices.length < 2) continue;
      let minIdx = indices[0], minVal = parseFloat(cloned[minIdx].load![li]);
      for (const idx of indices) {
        const v = parseFloat(cloned[idx].load![li]);
        if (v < minVal) { minVal = v; minIdx = idx; }
      }
      const unified = cloned[minIdx].load![li];
      for (const idx of indices) cloned[idx].load![li] = unified;
    }
    return cloned;
  }

  // Smart pick: forced + random fill (no duplicates) + shuffle + unify loads
  const pickWithForced = (n: number): Mvt[] => {
    const needed = Math.max(0, n - forced.length);
    const remaining = pool.filter(m => !forced.includes(m));
    const extra = spick(remaining, Math.min(needed, remaining.length));
    const result = [...forced, ...extra];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return unifyLoads(result.slice(0, n));
  };

  function pickFromSkeleton(skeleton: MvFamily[][], count: number): Mvt[] {
    const result: Mvt[] = [];
    const usedFatigues = new Set<FatigueZone>();
    const usedNames = new Set<string>();
    for (let i = 0; i < count; i++) {
      const slotFamilies = skeleton[i % skeleton.length];
      let candidates = pool.filter(m => {
        const meta = MVTS_META[m.name];
        return meta && slotFamilies.includes(meta.f) && !usedNames.has(m.name);
      });
      const noStack = candidates.filter(m => !MVTS_META[m.name]?.fz.some(fz => usedFatigues.has(fz)));
      const p = noStack.length > 0 ? noStack : candidates.length > 0 ? candidates : pool.filter(m => !usedNames.has(m.name));
      if (p.length === 0) continue;
      const picked = srand(p);
      result.push(picked);
      usedNames.add(picked.name);
      MVTS_META[picked.name]?.fz.forEach(fz => usedFatigues.add(fz));
    }
    if (result.length < count) {
      const remaining = pool.filter(m => !usedNames.has(m.name));
      while (result.length < count && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        result.push(remaining.splice(idx, 1)[0]);
      }
    }
    return unifyLoads(result.slice(0, count));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 1 — Matrice format → type de circuit interne
  // ═══════════════════════════════════════════════════════════════════════
  type CircuitType = 'round' | 'chipper' | 'couplet' | 'triplet' | 'ladder' | 'death_by' | 'single' | 'double_couplet';
  const CIRCUIT_MAP: Record<string, CircuitType[]> = {
    'For Time': ['round', 'chipper', 'couplet', 'triplet', 'ladder'],
    'AMRAP':    ['round', 'couplet', 'triplet', 'chipper'],
    'EMOM':     ['couplet', 'triplet', 'death_by'],
    'Tabata':   ['couplet', 'double_couplet'],
    'Max Reps': ['single'],
  };
  const circuit: CircuitType = srand(CIRCUIT_MAP[type] ?? CIRCUIT_MAP['AMRAP']);

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 2 — Anti-doublons consécutifs
  // pickWithForced() ne pick jamais 2× le même mouvement. Pour les
  // formats en boucle, on s'assure que le dernier ≠ le premier.
  // ═══════════════════════════════════════════════════════════════════════
  function ensureNoWrap(mvs: Mvt[]): Mvt[] {
    if (mvs.length < 3) return mvs;
    if (mvs[0].name === mvs[mvs.length - 1].name && mvs[mvs.length - 2].name !== mvs[0].name) {
      const tmp = mvs[mvs.length - 1];
      mvs[mvs.length - 1] = mvs[mvs.length - 2];
      mvs[mvs.length - 2] = tmp;
    }
    return mvs;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 3 — Calibration durée (nb mouvements & rounds)
  // ═══════════════════════════════════════════════════════════════════════
  function mvCountCal(base: number): number {
    if (duration <= 5)  return Math.max(2, base - 2);
    if (duration <= 10) return Math.max(3, base - 1);
    if (duration <= 15) return base;
    if (duration <= 20) return base + 1;
    return base + 2;
  }
  function roundsCal(): number {
    if (duration <= 5)  return 3;
    if (duration <= 10) return 4;
    if (duration <= 15) return 5;
    if (duration <= 20) return 6;
    return 7;
  }

  // Name & tip pools — pick from the matching circuit type for variety
  const namePool = { round: WOD_NAMES, chipper: WOD_NAMES, couplet: WOD_NAMES, triplet: WOD_NAMES, ladder: WOD_NAMES, death_by: WOD_NAMES, single: WOD_NAMES, double_couplet: WOD_NAMES };
  const tipKey = circuit === 'death_by' ? 'Death By' : circuit === 'chipper' ? 'Chipper' : circuit === 'ladder' ? 'Ladder' : (circuit === 'couplet' || circuit === 'triplet') ? 'Couplet' : type;
  const title = srand(WOD_NAMES[tipKey] ?? WOD_NAMES[type] ?? WOD_NAMES['AMRAP']);
  const tip   = srand(WOD_TIPS[tipKey]  ?? WOD_TIPS[type]  ?? WOD_TIPS['AMRAP']);

  let movements: string[] = [];
  let scoring = '';

  // ── FOR TIME ──────────────────────────────────────────────────────────
  if (type === 'For Time') {
    if (circuit === 'round') {
      const rounds = roundsCal();
      const mvts = ensureNoWrap(pickFromSkeleton(SKELETONS.triplet[intent], mvCountCal(3)));
      movements = [`${rounds} Rounds For Time :`].concat(mvts.map(m => fmtMvt(m, li)));
      scoring = `${rounds} RFT — Temps (cap ${duration} min)`;
    } else if (circuit === 'chipper') {
      const mvCount = mvCountCal(5);
      const mvts = pickFromSkeleton(SKELETONS.chipper[intent], mvCount);
      const chipReps = [50, 40, 30, 25, 20, 15, 10];
      movements = mvts.map((m, i) => {
        const base = chipReps[i] ?? 10;
        const raw = Math.round(base * (li < 2 ? 0.7 : li > 3 ? 1.3 : 1));
        const maxReps = m.reps[li] * 3;
        const r = Math.min(raw, maxReps);
        const u = m.unit ?? ''; const ld = m.load?.[li];
        if (u === 'm') return `${r}m ${m.name}`;
        if (u === 'cal') return `${r} Cal ${m.name}`;
        if (ld) return `${r} ${m.name} (${ld} kg)`;
        return `${r} ${m.name}`;
      });
      scoring = `Chipper — Temps (cap ${duration} min) — 1 passage`;
    } else if (circuit === 'couplet' || circuit === 'triplet') {
      const n = circuit === 'triplet' ? 3 : 2;
      const rounds = roundsCal();
      const mvts = pickFromSkeleton(SKELETONS[circuit === 'triplet' ? 'triplet' : 'couplet'][intent], n);
      movements = [`${rounds} Rounds For Time :`].concat(mvts.map(m => fmtMvt(m, li)));
      scoring = `${circuit === 'triplet' ? 'Triplet' : 'Couplet'} — Temps (cap ${duration} min)`;
    } else if (circuit === 'ladder') {
      const isPyramid = Math.random() < 0.5;
      const maxRung = duration <= 5 ? 7 : duration <= 10 ? 10 : duration <= 20 ? 12 : 15;
      const top = Math.floor(maxRung / 2);
      const mvts = pickFromSkeleton(SKELETONS.couplet[intent], srand([1, 2]));
      if (isPyramid) {
        movements = [`Pyramide For Time (1→${top}→1) :`, ...mvts.map(m => fmtMvtLabel(m, li))];
        scoring = `Pyramide — Temps (cap ${duration} min)`;
      } else {
        movements = [`Ladder For Time (1→${maxRung}) :`, ...mvts.map(m => fmtMvtLabel(m, li))];
        scoring = `Ladder — Temps (cap ${duration} min)`;
      }
    }
  }

  // ── AMRAP ─────────────────────────────────────────────────────────────
  else if (type === 'AMRAP') {
    if (circuit === 'round') {
      const mvts = ensureNoWrap(pickFromSkeleton(SKELETONS.triplet[intent], mvCountCal(3)));
      movements = mvts.map(m => fmtMvt(m, li));
      scoring = `Max rounds en ${duration} min`;
    } else if (circuit === 'couplet' || circuit === 'triplet') {
      const n = circuit === 'triplet' ? 3 : 2;
      const mvts = pickFromSkeleton(SKELETONS[circuit === 'triplet' ? 'triplet' : 'couplet'][intent], n);
      movements = mvts.map(m => fmtMvt(m, li));
      scoring = `Max rounds en ${duration} min — ${circuit === 'triplet' ? 'Triplet' : 'Couplet'}`;
    } else if (circuit === 'chipper') {
      const mvCount = mvCountCal(5);
      const mvts = pickFromSkeleton(SKELETONS.chipper[intent], mvCount);
      const chipReps = [40, 30, 25, 20, 15, 12, 10];
      movements = mvts.map((m, i) => {
        const base = chipReps[i] ?? 10;
        const raw = Math.round(base * (li < 2 ? 0.7 : li > 3 ? 1.3 : 1));
        const maxReps = m.reps[li] * 3;
        const r = Math.min(raw, maxReps);
        const u = m.unit ?? ''; const ld = m.load?.[li];
        if (u === 'm') return `${r}m ${m.name}`;
        if (u === 'cal') return `${r} Cal ${m.name}`;
        if (ld) return `${r} ${m.name} (${ld} kg)`;
        return `${r} ${m.name}`;
      });
      scoring = `Max rounds en ${duration} min — Chipper style`;
    }
  }

  // ── EMOM ──────────────────────────────────────────────────────────────
  else if (type === 'EMOM') {
    if (circuit === 'death_by') {
      const solidPool = pool.filter(m => !m.unit);
      const m = solidPool.length > 0 ? srand(solidPool) : srand(pool);
      const ld = m.load?.[li];
      const mvLabel = ld ? `${m.name} (${ld} kg)` : m.name;
      movements = [`Death By ${mvLabel} :`];
      for (let i = 1; i <= 6; i++) movements.push(`  Min ${i} : ${i} ${mvLabel}`);
      movements.push(`  ... (continue jusqu'à l'échec)`);
      scoring = `Score = dernière minute complétée`;
    } else {
      const n = circuit === 'triplet' ? 3 : 2;
      const mvts = pickFromSkeleton(SKELETONS.emom[intent], n);
      movements = mvts.map((m, i) => `Min ${i + 1} : ${fmtMvt(m, li)}`);
      const cycles = Math.round(duration / n);
      movements.push(`→ Répéter (${cycles} fois = ${duration} min)`);
      scoring = `E${n}MOM ${duration} min — score = rounds complétés`;
    }
  }

  // ── TABATA ────────────────────────────────────────────────────────────
  else if (type === 'Tabata') {
    if (circuit === 'double_couplet') {
      const count = Math.max(2, Math.floor(duration / 4));
      const mvts = pickFromSkeleton(SKELETONS.tabata[intent], count);
      movements = mvts.map(m => `20s ${m.name} / 10s Repos × 8`);
      scoring = 'Score = min de reps sur un round (par mouvement)';
    } else {
      const mvts = pickFromSkeleton(SKELETONS.tabata[intent], 2);
      const tabCycles = Math.max(1, Math.floor(duration / 4));
      movements = mvts.map(m => `20s ${m.name} / 10s Repos × 8`);
      if (tabCycles > 1) movements.push(`→ ${tabCycles} cycles`);
      scoring = 'Score = total de reps sur tous les rounds';
    }
  }

  // ── MAX REPS ──────────────────────────────────────────────────────────
  else {
    const count = srand([1, 2]);
    const mvts = pickFromSkeleton(SKELETONS.single[intent], count);
    movements = mvts.map(m => {
      const ld = m.load?.[li];
      const suffix = ld ? ` (${ld} kg)` : '';
      return `Max ${m.name}${suffix} en ${count === 1 ? duration : Math.floor(duration / count)} min`;
    });
    scoring = 'Score = total de reps';
  }

  // ── Team format ──
  if (teamSize > 1) {
    const teamModes = [
      `En équipe de ${teamSize} — You Go I Go (alternance)`,
      `En équipe de ${teamSize} — Split le travail équitablement`,
      `En équipe de ${teamSize} — Synchronisé (tous en même temps)`,
      `En équipe de ${teamSize} — Relais (1 travaille, ${teamSize - 1} au repos)`,
    ];
    movements = [`── ${srand(teamModes)} ──`, ...movements];
  }

  const intentLabel: Record<Intent, string> = { mixed: '⚡ Mixed', cardio: '🫀 Cardio', strength: '💪 Force', gymnastics: '🤸 Gym' };
  const tags = [intentLabel[intent], `💀 ${INTENT_FATIGUE[intent]}`];
  return { title, type, duration, level, movements, scoring, tip, intent, tags };
}

export default function WODGeneratorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<WODStackParamList>>();
  const { theme } = useTheme();
  const { user, currentBox } = useAuth();
  const insets = useSafeAreaInsets();
  // Tab bar (~70px) + system gesture bar + safe area inset bottom + breathing space.
  // Augmenté pour que le bouton soit totalement visible
  const scrollBottomPadding = 100 + insets.bottom + 120; // tabBar + inset + spacer
  const S = createStyles(theme);

  const [sport,        setSport]        = useState<Sport>('functional');
  const [level,        setLevel]        = useState<AthleteLevel>('rx');
  const [duration,     setDuration]     = useState(5);
  const [wodType,      setWODType]      = useState<WODType>('AMRAP');
  const [intent,       setIntent]       = useState<Intent>('mixed');
  const [equipment,    setEquipment]    = useState<string[]>(['Barre + Disques', 'Corde à sauter']);
  const [teamSize,     setTeamSize]     = useState(1);
  const [generatedWOD, setGeneratedWOD] = useState<GeneratedWOD | null>(null);
  const [hyroxLevel,   setHyroxLevel]   = useState('Men');
  const [hyroxFormat,  setHyroxFormat]  = useState('Solo');
  const [hyroxType,    setHyroxType]    = useState('Race Simulation');
  const [hyroxDur,     setHyroxDur]     = useState(45);
  const [hyroxEquip,   setHyroxEquip]   = useState<string[]>(['SkiErg', 'Sled Push', 'RowErg', 'Wall Balls']);
  const [hyroxIntent,    setHyroxIntent]    = useState<HyroxIntent>('race_prep');
  const [generatedHyrox, setGeneratedHyrox] = useState<HyroxWOD | null>(null);
  const [loading,      setLoading]      = useState(false);

  const accentColor = sport === 'hybrid' ? HYROX_ORANGE : theme.accent;

  function toggleEquipment(item: string) {
    setEquipment(prev =>
      prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item]
    );
  }

  function toggleHyroxEquip(item: string) {
    setHyroxEquip(prev =>
      prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item]
    );
  }

  async function handleGenerate() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    if (sport === 'hybrid') {
      const wod = generateHyroxWOD(hyroxLevel, hyroxFormat, hyroxType, hyroxDur, hyroxEquip, hyroxIntent);
      setGeneratedHyrox(wod);
      setGeneratedWOD(null);
    } else {
      const wod = generateWOD(level, duration, wodType, equipment, teamSize, intent);
      setGeneratedWOD(wod);
      setGeneratedHyrox(null);
    }
    setLoading(false);
    if (user) incrementCounter(user.id, 'total_wods_generated', 1, currentBox?.id).catch(e => captureError(e, { action: 'incrementWodsGenerated' }));
  }

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Générateur WOD</Text>
        <Text style={S.headerSub}>Crée ton WOD sur mesure</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[S.content, { paddingBottom: scrollBottomPadding }]}
      >

        {/* Quick access: Historique & Favoris */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <GlassCard radius={12} style={{ flex: 1 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}
              onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.8}
            >
              <History color={theme.text} size={16} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>Historique</Text>
            </TouchableOpacity>
          </GlassCard>
          <GlassCard radius={12} style={{ flex: 1 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}
              onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.8}
            >
              <Heart color="#EF4444" size={16} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>Favoris</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Programmation button */}
        <GlassCard radius={12} variant="emerald" style={{ marginBottom: 16 }}>
          <TouchableOpacity style={S.progBtnInner} onPress={() => (navigation as any).navigate('Explorer', { screen: 'Programmation' })} activeOpacity={0.8}>
            <BookOpen color={theme.accent} size={16} />
            <Text style={S.progBtnTxt}>Programmation</Text>
            <ChevronRight color={theme.textMuted} size={14} />
          </TouchableOpacity>
        </GlassCard>

        {/* Sport selector */}
        <View style={S.sportRow}>
          <GlassCard
            radius={16}
            variant={sport === 'functional' ? 'emerald' : 'default'}
            style={{ flex: 1, borderWidth: 0 }}
          >
            <TouchableOpacity
              style={[S.sportCardInner, sport === 'functional' && { borderColor: theme.accent, borderWidth: 2 }]}
              onPress={() => setSport('functional')}
              activeOpacity={0.8}
            >
              <Text style={S.sportEmoji}>🏋️</Text>
              <Text style={[S.sportLabel, sport === 'functional' && { color: theme.accent }]}>Functional{"\n"}Fitness</Text>
              {sport === 'functional' && <View style={[S.sportDot, { backgroundColor: theme.accent }]} />}
            </TouchableOpacity>
          </GlassCard>
          <GlassCard radius={16} style={{ flex: 1, borderWidth: 0 }}>
            <TouchableOpacity
              style={[S.sportCardInner, sport === 'hybrid' && { borderColor: HYROX_ORANGE, borderWidth: 2 }]}
              onPress={() => setSport('hybrid')}
              activeOpacity={0.8}
            >
              <Text style={S.sportEmoji}>⚡</Text>
              <Text style={[S.sportLabel, sport === 'hybrid' && { color: HYROX_ORANGE }]}>Hybrid</Text>
              {sport === 'hybrid' && <View style={[S.sportDot, { backgroundColor: HYROX_ORANGE }]} />}
            </TouchableOpacity>
          </GlassCard>
        </View>

        {sport === 'functional' ? (
          <>
        <View style={S.section}>
          <Text style={S.sectionTitle}>Catégorie</Text>
          <View style={S.chipRow}>
            {LEVELS.map(l => (
              <TouchableOpacity
                key={l}
                onPress={() => setLevel(l)}
                style={[S.chip, level === l && { backgroundColor: `${LevelColors[l]}25`, borderColor: LevelColors[l] }]}
              >
                <Text style={[S.chipText, level === l && { color: LevelColors[l] }]}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionTitle}>Durée</Text>
          <View style={S.chipRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                onPress={() => setDuration(d)}
                style={[S.chip, duration === d && S.chipSelected]}
              >
                <Clock color={duration === d ? theme.accent : theme.textMuted} size={14} />
                <Text style={[S.chipText, duration === d && { color: theme.accent }]}>{d} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionTitle}>Intention</Text>
          <View style={[S.chipRow, { flexWrap: 'nowrap' }]}>
            {INTENT_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.key}
                onPress={() => setIntent(o.key)}
                style={[S.chip, intent === o.key && S.chipSelected, { flex: 1, justifyContent: 'center' }]}
              >
                <Text style={{ fontSize: 14 }}>{o.emoji}</Text>
                <Text style={[S.chipText, intent === o.key && { color: theme.accent }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionTitle}>Type d'entraînement</Text>
          <View style={S.chipRow}>
            {UI_WOD_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setWODType(t)}
                style={[S.chip, wodType === t && S.chipSelected]}
              >
                <Text style={[S.chipText, wodType === t && { color: theme.accent }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionTitle}>Équipement disponible</Text>
          <View style={S.equipGrid}>
            {EQUIPMENT_OPTIONS.map(item => (
              <TouchableOpacity
                key={item}
                onPress={() => toggleEquipment(item)}
                style={[S.equipChip, equipment.includes(item) && S.equipChipActive]}
              >
                <Text style={[S.equipText, equipment.includes(item) && { color: theme.accent }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionTitle}>Format</Text>
          <View style={S.chipRow}>
            {TEAM_SIZES.map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setTeamSize(s)}
                style={[S.chip, teamSize === s && S.chipSelected]}
              >
                <Text style={[S.chipText, teamSize === s && { color: theme.accent }]}>
                  {s === 1 ? 'Solo' : `Équipe ${s}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

          </>
        ) : (
          <>
            {/* Hyrox level */}
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: HYROX_ORANGE }]}>Catégorie</Text>
              <View style={S.chipRow}>
                {HYROX_LEVELS.map(l => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => setHyroxLevel(l)}
                    style={[S.chip, hyroxLevel === l && { backgroundColor: `${HYROX_ORANGE}25`, borderColor: HYROX_ORANGE }]}
                  >
                    <Text style={[S.chipText, hyroxLevel === l && { color: HYROX_ORANGE }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hyrox format */}
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: HYROX_ORANGE }]}>Format</Text>
              <View style={S.chipRow}>
                {HYROX_FORMATS.map(f => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setHyroxFormat(f)}
                    style={[S.chip, hyroxFormat === f && { backgroundColor: `${HYROX_ORANGE}25`, borderColor: HYROX_ORANGE }]}
                  >
                    <Text style={[S.chipText, hyroxFormat === f && { color: HYROX_ORANGE }]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hyrox type */}
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: HYROX_ORANGE }]}>Type d'entraînement</Text>
              <View style={S.chipRow}>
                {HYROX_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setHyroxType(t)}
                    style={[S.chip, hyroxType === t && { backgroundColor: `${HYROX_ORANGE}25`, borderColor: HYROX_ORANGE }]}
                  >
                    <Text style={[S.chipText, hyroxType === t && { color: HYROX_ORANGE }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hyrox duration */}
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: HYROX_ORANGE }]}>Durée</Text>
              <View style={S.chipRow}>
                {HYROX_DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setHyroxDur(d)}
                    style={[S.chip, hyroxDur === d && { backgroundColor: `${HYROX_ORANGE}25`, borderColor: HYROX_ORANGE }]}
                  >
                    <Clock color={hyroxDur === d ? HYROX_ORANGE : theme.textMuted} size={14} />
                    <Text style={[S.chipText, hyroxDur === d && { color: HYROX_ORANGE }]}>{d} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hyrox equipment */}
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: HYROX_ORANGE }]}>Équipement disponible</Text>
              <View style={S.equipGrid}>
                {HYROX_EQUIPMENT.map(item => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => toggleHyroxEquip(item)}
                    style={[S.equipChip, hyroxEquip.includes(item) && S.equipChipHybrid]}
                  >
                    <Text style={[S.equipText, hyroxEquip.includes(item) && { color: HYROX_ORANGE }]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Hyrox intent */}
            <View style={S.section}>
              <Text style={[S.sectionTitle, { color: HYROX_ORANGE }]}>Intention</Text>
              <View style={[S.chipRow, { flexWrap: 'nowrap' }]}>
                {HYROX_INTENT_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key}
                    onPress={() => setHyroxIntent(o.key)}
                    style={[S.chip, hyroxIntent === o.key && { backgroundColor: `${HYROX_ORANGE}25`, borderColor: HYROX_ORANGE }, { flex: 1, justifyContent: 'center' }]}
                  >
                    <Text style={{ fontSize: 14 }}>{o.emoji}</Text>
                    <Text style={[S.chipText, hyroxIntent === o.key && { color: HYROX_ORANGE }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Bouton Générer - Style Glassmorphism */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            marginVertical: 16,
            marginHorizontal: 20,
            borderRadius: 16,
            backgroundColor: sport === 'functional' ? 'rgba(16,185,129,0.25)' : 'rgba(249,115,22,0.25)',
            borderWidth: 2,
            borderColor: sport === 'functional' ? 'rgba(16,185,129,0.8)' : 'rgba(249,115,22,0.8)',
            paddingVertical: 18,
            paddingHorizontal: 28,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Sparkles color="#fff" size={20} />
                <Text style={{ color: '#FF0000', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 }}>
                  GÉNÉRER MON WOD
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {generatedHyrox && (
          <GlassCard radius={20} style={{ marginTop: 20 }}>
            <View style={[S.resultCard, { backgroundColor: 'transparent', borderColor: `${HYROX_ORANGE}40`, borderWidth: 1, marginTop: 0 }]}>
            <View style={S.resultHeader}>
              <View style={S.resultBadges}>
                <View style={[S.badge, { backgroundColor: `${HYROX_ORANGE}25` }]}>
                  <Text style={[S.badgeText, { color: HYROX_ORANGE }]}>HYBRID</Text>
                </View>
                <View style={[S.badge, { backgroundColor: `${HYROX_ORANGE}15` }]}>
                  <Text style={[S.badgeText, { color: HYROX_ORANGE }]}>{generatedHyrox.level}</Text>
                </View>
                <View style={[S.badge, { backgroundColor: theme.surface }]}>
                  <Clock color={theme.textMuted} size={12} />
                  <Text style={[S.badgeText, { color: theme.textMuted }]}>{generatedHyrox.duration} min</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleGenerate}>
                <RefreshCw color={HYROX_ORANGE} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={S.resultTitle}>{generatedHyrox.title}</Text>
            {generatedHyrox.tags && generatedHyrox.tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {generatedHyrox.tags.map((tag, i) => (
                  <View key={i} style={{ backgroundColor: `${HYROX_ORANGE}18`, borderRadius: 8, borderWidth: 1, borderColor: `${HYROX_ORANGE}35`, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: HYROX_ORANGE, fontSize: 12, fontWeight: '700' }}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={[S.hyroxFormatBadge]}>
              <Text style={[S.hyroxFormatText]}>{generatedHyrox.format} · {generatedHyrox.type}</Text>
            </View>
            <View style={S.movementsList}>
              {generatedHyrox.stations.map((station, i) => (
                <View key={i} style={S.movementItem}>
                  <View style={[S.movementDot, { backgroundColor: HYROX_ORANGE }]} />
                  <Text style={S.movementText}>{station}</Text>
                </View>
              ))}
            </View>
            <View style={[S.scoringBox, { backgroundColor: `${HYROX_ORANGE}15` }]}>
              <Zap color={HYROX_ORANGE} size={16} />
              <Text style={[S.scoringText, { color: HYROX_ORANGE }]}>{generatedHyrox.scoring}</Text>
            </View>
            <View style={S.tipBox}>
              <Text style={S.tipLabel}>💡 Conseil coach</Text>
              <Text style={S.tipText}>{generatedHyrox.tip}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.8} style={[S.startButton, { backgroundColor: HYROX_ORANGE }]}>
              <Zap color="#fff" size={18} />
              <Text style={S.startButtonText}>LANCER CET ENTRAÎNEMENT</Text>
            </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        {generatedWOD && (
          <GlassCard radius={20} style={{ marginTop: 20 }}>
            <View style={[S.resultCard, { backgroundColor: 'transparent', borderWidth: 1, marginTop: 0 }]}>
            <View style={S.resultHeader}>
              <View style={S.resultBadges}>
                <View style={[S.badge, { backgroundColor: `${theme.accent}25` }]}>
                  <Text style={[S.badgeText, { color: theme.accent }]}>{generatedWOD.type}</Text>
                </View>
                <View style={[S.badge, { backgroundColor: `${LevelColors[generatedWOD.level]}25` }]}>
                  <Text style={[S.badgeText, { color: LevelColors[generatedWOD.level] }]}>
                    {generatedWOD.level.toUpperCase()}
                  </Text>
                </View>
                <View style={[S.badge, { backgroundColor: theme.surface }]}>
                  <Clock color={theme.textMuted} size={12} />
                  <Text style={[S.badgeText, { color: theme.textMuted }]}>{generatedWOD.duration} min</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleGenerate}>
                <RefreshCw color={theme.accent} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={S.resultTitle}>{generatedWOD.title}</Text>

            {generatedWOD.tags && generatedWOD.tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {generatedWOD.tags.map((tag, i) => (
                  <View key={i} style={{ backgroundColor: `${theme.accent}18`, borderRadius: 8, borderWidth: 1, borderColor: `${theme.accent}35`, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={S.movementsList}>
              {generatedWOD.movements.map((m, i) => (
                <View key={i} style={S.movementItem}>
                  <View style={S.movementDot} />
                  <Text style={S.movementText}>{m}</Text>
                </View>
              ))}
            </View>

            <View style={S.scoringBox}>
              <Zap color={theme.gold} size={16} />
              <Text style={S.scoringText}>{generatedWOD.scoring}</Text>
            </View>

            <View style={S.tipBox}>
              <Text style={S.tipLabel}>💡 Conseil coach</Text>
              <Text style={S.tipText}>{generatedWOD.tip}</Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} style={S.startButton}>
                <Zap color="#fff" size={18} />
                <Text style={S.startButtonText}>LANCER CE WOD</Text>
            </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  back: { marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: theme.text },
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  content: { padding: 16, paddingBottom: 140 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  chipSelected: { backgroundColor: `${theme.accent}25`, borderColor: theme.accent },
  chipText: { fontSize: 13, color: theme.textSecondary, fontWeight: '600' },
  equipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  equipChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
  },
  equipChipActive: { backgroundColor: `${theme.accent}20`, borderColor: theme.accent },
  equipText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
  generateBtn: { marginVertical: 8 },
  sportRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  sportCard: {
    flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4,
    backgroundColor: theme.card, borderWidth: 2, borderColor: theme.border,
  },
  sportCardInner: {
    padding: 16, alignItems: 'center', gap: 4,
    borderRadius: 16, borderWidth: 2, borderColor: 'transparent',
  },
  sportCardActive: { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
  sportCardHybrid: { borderColor: HYROX_ORANGE, backgroundColor: `${HYROX_ORANGE}10` },
  sportEmoji: { fontSize: 26, marginBottom: 4 },
  sportLabel: { fontSize: 13, fontWeight: '800', color: theme.textSecondary, textAlign: 'center', lineHeight: 18 },
  sportDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  equipChipHybrid: { backgroundColor: `${HYROX_ORANGE}20`, borderColor: HYROX_ORANGE },
  hyroxFormatBadge: {
    backgroundColor: `${HYROX_ORANGE}15`, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 12,
  },
  hyroxFormatText: { fontSize: 12, fontWeight: '700', color: HYROX_ORANGE },
  generateGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, padding: 18, gap: 10,
    backgroundColor: theme.accent,
  },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  resultCard: {
    backgroundColor: theme.card, borderRadius: 20,
    padding: 20, marginTop: 20, borderWidth: 1, borderColor: theme.cardBorder,
  },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resultBadges: { flexDirection: 'row', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  resultTitle: { fontSize: 22, fontWeight: '900', color: theme.text, marginBottom: 16 },
  movementsList: { gap: 8, marginBottom: 16 },
  movementItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movementDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent, marginTop: 6 },
  movementText: { fontSize: 14, color: theme.text, flex: 1, lineHeight: 20 },
  scoringBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${theme.gold}15`, borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  scoringText: { fontSize: 13, color: theme.gold, fontWeight: '600' },
  tipBox: {
    backgroundColor: theme.surface, borderRadius: 10,
    padding: 12, marginBottom: 16,
  },
  tipLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 4 },
  tipText: { fontSize: 13, color: theme.text, lineHeight: 18 },
  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, padding: 16, gap: 8,
    backgroundColor: 'rgba(16,185,129,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.8)',
  },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  progBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.card, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: theme.border, marginBottom: 16,
  },
  progBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
  },
  progBtnTxt: { fontSize: 13, fontWeight: '800', color: theme.text },
}); }
