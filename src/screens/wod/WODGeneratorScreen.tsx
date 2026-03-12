import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, ActivityIndicator,
} from 'react-native';
import { Sparkles, ChevronLeft, Clock, Zap, RefreshCw, History, Heart } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WODStackParamList } from '../../navigation';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { AthleteLevel, WODType } from '../../types';

const LEVELS: AthleteLevel[] = ['scaled', 'inter', 'rx', 'rx+', 'gx', 'pro'];
const DURATIONS = [5, 10, 15, 20];
const WOD_TYPES: WODType[] = ['AMRAP', 'For Time', 'EMOM', 'Tabata', 'Max Reps'];

const EQUIPMENT_OPTIONS = [
  'Barre + Disques', 'Haltères', 'Kettlebell', 'Box', 'Corde à sauter',
  'Barre de traction', 'Anneaux', 'Erg', 'Worm', 'Benchmark', 'Aucun matériel',
];

const TEAM_SIZES = [1, 2, 3, 4, 6];

const HYROX_ORANGE = '#F97316';

const HYROX_LEVELS = ['Open', 'Pro', 'Elite'];
const HYROX_FORMATS = ['Solo', 'Doubles', 'Relais', 'Mixed Relais'];
const HYROX_TYPES  = ['Race Simulation', 'Station Training', 'Cardio Force', 'Running Intervals'];
const HYROX_DURATIONS = [20, 30, 45, 60];
const HYROX_EQUIPMENT = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'RowErg',
  'Burpee Broad Jump', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls',
  'Tapis de course', 'Haltères',
];

interface HyroxWOD {
  title: string;
  type: string;
  level: string;
  format: string;
  duration: number;
  stations: string[];
  scoring: string;
  tip: string;
}

const HYROX_SCR_NAMES: Record<string, string[]> = {
  'Race Simulation':   ['Race Day Protocol','HYROX Race Sim','Competition Mode','Full Distance','Race Forge','Pre-Race Drill','Event Simulator','Race Crusher','Qualifier Prep','Podium Run'],
  'Station Training':  ['Station Domination','Power Station','Station Mastery','Station Siege','Platform Work','Station Builder','Force Station','Block Drill','Station Storm','Grid Work'],
  'Cardio Force':      ['Hybrid Forge','Cardio Machine','Hybrid Engine','Power Cardio','Endurance Force','Hybrid Burn','Engine Room','Cross Cardio','Hybrid Blast','Force Cardio'],
  'Running Intervals': ['Track & Station','Run & Gun','Interval Force','Run Blocks','Speed Station','Running Man','Run Circuit','Lap & Station','Road & Station','Track Crusher'],
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
  'Running Intervals': [
    'Allure de course régulière. Les stations sont ta récup active.',
    'Vitesse identique sur chaque intervalle. La constance prime.',
    'Ne t\'épuise pas sur les stations : elles régulent ta fréquence cardiaque.',
    'Simule les conditions race sur chaque run.',
    'Trouve ton tempo optimal race sur ces intervalles.',
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

function generateHyroxWOD(level: string, format: string, type: string, duration: number, equipment: string[]): HyroxWOD {
  const li   = ({ Open: 0, Pro: 1, Elite: 2 } as Record<string, number>)[level] ?? 0;
  const ski  = equipment.includes('SkiErg');
  const slp  = equipment.includes('Sled Push');
  const slpu = equipment.includes('Sled Pull');
  const row  = equipment.includes('RowErg');
  const sbl  = equipment.includes('Sandbag Lunges');
  const wb   = equipment.includes('Wall Balls');
  const bbj  = equipment.includes('Burpee Broad Jump');
  const fc   = equipment.includes('Farmers Carry');
  const db   = equipment.includes('Haltères');

  const sp_kg  = ['60','80','100+'][li];
  const sl_kg  = ['40','60','80+'][li];
  const wb_rep = [75, 90, 100][li];
  const wb_kg  = ['6','9','9'][li];
  const fc_kg  = ['16','20','24'][li];
  const sb_kg  = ['10','15','20'][li];
  const db_kg  = ['12','15','20'][li];
  const ski_d  = ['800m','1000m','1200m'][li];
  const row_d  = ['800m','1000m','1200m'][li];

  const E = {
    ski1k:  ski  ? `${ski_d} SkiErg`                                         : row ? `${row_d} RowErg`              : `${ski_d} Course`,
    row1k:  row  ? `${row_d} RowErg`                                         : ski ? `${ski_d} SkiErg`              : `${row_d} Course`,
    ski500: ski  ? '500m SkiErg'                                              : row ? '500m RowErg'                  : '800m Course',
    row500: row  ? '500m RowErg'                                              : ski ? '500m SkiErg'                  : '800m Course',
    slp:    slp  ? `50m Sled Push (${sp_kg} kg)`                             : bbj ? `${[15,20,25][li]} Burpee BJ`  : `${[20,25,30][li]} KB Swings lourds`,
    slpu:   slpu ? `50m Sled Pull (${sl_kg} kg)`                             : fc  ? `${[150,200,250][li]}m Farmers Carry (${fc_kg}kg×2)` : `${[15,20,25][li]} Burpees`,
    sbl:    sbl  ? `${[50,75,100][li]}m Sandbag Lunges (${sb_kg} kg)`      : fc  ? `${[150,200,250][li]}m Farmers Carry (${fc_kg}kg×2)` : `${[40,60,80][li]} Air Squats`,
    wb:     wb   ? `${wb_rep} Wall Balls (${wb_kg} kg)`                      : `${[80,100,120][li]} Air Squats`,
    fc:     fc   ? `${[150,200,250][li]}m Farmers Carry (${fc_kg}kg×2)`     : sbl ? `${[50,75,100][li]}m Sandbag Lunges (${sb_kg} kg)` : `${[40,60,80][li]} Goblet Squats`,
    bbj:    bbj  ? `${[15,20,25][li]} Burpee Broad Jump`                     : `${[20,25,30][li]} Burpees`,
    db:     db   ? `${[12,15,20][li]} DB Thrusters (${db_kg}kg/main)`       : `${[15,20,25][li]} KB Thrusters lourds`,
    ski250: ski  ? `${['250m','300m','400m'][li]} SkiErg`                    : row ? `${['250m','300m','400m'][li]} RowErg` : `${['200m','300m','400m'][li]} Course`,
  };

  const title = srand(HYROX_SCR_NAMES[type]  ?? HYROX_SCR_NAMES['Race Simulation']);
  const tip   = srand(HYROX_SCR_TIPS[type]   ?? HYROX_SCR_TIPS['Race Simulation']);
  let stations: string[] = [];
  let scoring  = '';

  if (type === 'Race Simulation') {
    const variant = duration >= 50 ? 0 : Math.floor(Math.random() * 5);
    if (variant === 0) {
      stations = ['1km Course', E.ski1k, '1km Course', E.slp, '1km Course', E.slpu, '1km Course', E.sbl, '1km Course', E.wb];
    } else if (variant === 1) {
      stations = ['1km Course', E.row1k, '1km Course', E.slp, '1km Course', E.fc, '1km Course', E.sbl, '1km Course', E.wb];
    } else if (variant === 2) {
      const s4 = spick([E.slp, E.slpu, E.sbl, E.wb, E.fc, E.bbj], 4);
      stations = ['1km Course', s4[0], '1km Course', s4[1], '1km Course', s4[2], '1km Course', s4[3]];
    } else if (variant === 3) {
      const s3 = spick([E.slp, E.slpu, E.sbl, E.wb, E.fc, E.bbj], 3);
      stations = ['800m Course', s3[0], '800m Course', s3[1], '800m Course', s3[2]];
    } else {
      const s4 = spick([E.slp, E.slpu, E.sbl, E.wb, E.fc, E.bbj], 4);
      stations = ['400m Course', s4[0], '800m Course', s4[1], '1km Course', s4[2], '800m Course', s4[3]];
    }
    scoring = `Temps total — objectif ${level === 'Elite' ? '< 55 min' : level === 'Pro' ? '< 70 min' : '< 85 min'}`;
  }

  else if (type === 'Station Training') {
    const sets = ['4 ×','5 ×','6 ×'][li];
    const stPool: string[] = [
      ski ? `${sets} ${ski_d} SkiErg`              : row ? `${sets} ${row_d} RowErg`    : `${sets} 800m Course`,
      slp  ? `${sets} 20m Sled Push (max charge)` : `${sets} ${E.bbj}`,
      slpu ? `${sets} 30m Sled Pull (${sl_kg} kg)`: `${sets} ${E.fc}`,
      sbl  ? `${sets} 25m Sandbag Lunges (${sb_kg} kg)` : `${sets} ${E.fc}`,
      wb   ? `${sets} 25 Wall Balls (${wb_kg} kg)`: `${sets} 30 Air Squats`,
      fc   ? `${sets} 50m Farmers Carry (${fc_kg}kg×2)` : `${sets} 20 KB Swings lourds`,
      row  ? `${sets} 250m RowErg tempo`           : ski ? `${sets} 250m SkiErg tempo`  : `${sets} 400m Course`,
      `${sets} ${E.bbj}`,
      `${sets} ${E.db}`,
      ski  ? `${sets} 150m SkiErg sprint`          : `${sets} 150m RowErg sprint`,
    ];
    const count = duration <= 20 ? 3 : duration <= 30 ? 4 : duration <= 45 ? 5 : 6;
    stations = spick(stPool, count);
    scoring  = `Score = stations complétées en ${duration} min`;
  }

  else if (type === 'Cardio Force') {
    const cardioPool = [E.ski500, E.row500, '800m Course', '400m Course', `${[20,25,30][li]} Cal Assault Bike`, E.ski250];
    const forcePool  = [E.slp, E.slpu, E.wb, E.sbl, E.fc, E.bbj, E.db, `${[10,15,20][li]} KB Thrusters lourds`];
    const count = duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 6 : 8;
    const nC = Math.ceil(count / 2);
    const nF = Math.floor(count / 2);
    const pC = spick(cardioPool, nC);
    const pF = spick(forcePool, nF);
    const combined: string[] = [];
    for (let i = 0; i < Math.max(nC, nF); i++) {
      if (pC[i]) combined.push(pC[i]);
      if (pF[i]) combined.push(pF[i]);
    }
    stations = combined;
    scoring  = `AMRAP ${duration} min — max rounds`;
  }

  else {
    const runOpts = ['400m Course', '800m Course', '1km Course'];
    const stPool  = [E.ski500, E.row500, E.wb, E.slp, E.sbl, E.fc, E.bbj, E.db, `${[20,25,30][li]} Cal SkiErg`, E.ski250];
    const cycles  = duration <= 20 ? 2 : duration <= 30 ? 3 : duration <= 45 ? 4 : 5;
    const runDist = srand(runOpts);
    const picked  = spick(stPool, Math.min(cycles, 4));
    const result: string[] = [];
    for (let i = 0; i < cycles; i++) {
      result.push(runDist);
      result.push(picked[i % picked.length]);
    }
    stations = result;
    scoring  = `Temps total pour ${cycles} cycles`;
  }

  const fmtS = (s: string): string => {
    if (format === 'Doubles')      return `(split) ${s}`;
    if (format === 'Relais')       return `[relais] ${s}`;
    if (format === 'Mixed Relais') return `[mixed] ${s}`;
    return s;
  };
  stations = stations.map(fmtS);
  return { title, type, level, format, duration, stations, scoring, tip };
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
}

// ── Movement database ─────────────────────────────────────────────────
const _LI: Record<AthleteLevel, number> = { scaled: 0, inter: 1, rx: 2, 'rx+': 3, gx: 4, pro: 5 };
interface Mvt { name: string; eq: string[]; reps: number[]; load?: string[]; unit?: string }

const MVTS: Mvt[] = [
  // ── Bodyweight ──
  { name: 'Burpees',              eq: [],                    reps: [6,8,10,12,15,18] },
  { name: 'Air Squats',           eq: [],                    reps: [12,15,20,25,30,35] },
  { name: 'Down Up',              eq: [],                    reps: [6,8,10,12,15,18] },
  { name: 'Push-ups',             eq: [],                    reps: [8,10,15,18,20,25] },
  { name: 'Sit-ups',              eq: [],                    reps: [12,15,20,25,30,35] },
  { name: 'Mountain Climbers',    eq: [],                    reps: [12,16,20,24,30,30] },
  { name: 'Lunges',               eq: [],                    reps: [10,12,16,20,24,24] },
  { name: 'V-ups',                eq: [],                    reps: [8,10,12,15,18,20] },
  { name: 'Jumping Squats',       eq: [],                    reps: [8,10,12,15,18,20] },
  { name: 'Broad Jumps',          eq: [],                    reps: [5,6,8,10,10,12] },
  { name: 'HSPU Stricts',          eq: [],                    reps: [0,0,5,7,10,12] },
  { name: 'Wall Facing HSPU',     eq: [],                    reps: [0,0,0,5,8,10] },
  { name: 'Pistol Squats',        eq: [],                    reps: [0,0,6,8,10,12] },
  { name: 'Hollow Rocks',         eq: [],                    reps: [10,12,15,20,25,30] },
  { name: 'Up-Downs',             eq: [],                    reps: [6,8,10,12,15,15] },
  { name: 'Course',               eq: [],                    reps: [200,200,400,400,400,800], unit: 'm' },
  { name: 'Bear Crawl',           eq: [],                    reps: [10,10,15,15,20,20], unit: 'm' },
  { name: 'Wall Walks',           eq: [],                    reps: [0,2,3,4,5,6] },
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
  { name: 'DB Snatch',            eq: ['Haltères'],          reps: [6,8,10,12,15,15],   load: ['10','12.5','15','20','22.5','25'] },
  { name: 'DB Hang Snatch',       eq: ['Haltères'],          reps: [6,8,10,12,15,15],   load: ['10','12.5','15','20','22.5','25'] },
  { name: 'DB Squat Snatch',      eq: ['Haltères'],          reps: [0,5,8,10,12,12],    load: ['','10','12.5','15','20','22.5'] },
  { name: 'DB Thrusters',         eq: ['Haltères'],          reps: [6,8,10,12,15,15],   load: ['10','12.5','15','20','22.5','25'] },
  { name: 'DB Clean & Jerk',      eq: ['Haltères'],          reps: [5,6,8,10,10,12],    load: ['10','12.5','15','20','22.5','25'] },
  { name: 'DB Hang Clean & Jerk', eq: ['Haltères'],          reps: [5,6,8,10,10,12],    load: ['10','12.5','15','20','22.5','25'] },
  { name: 'DB Lunges',            eq: ['Haltères'],          reps: [8,10,12,16,16,20],  load: ['10','12.5','15','17.5','20','22.5'] },
  { name: 'Devil Press',          eq: ['Haltères'],          reps: [4,5,6,8,10,10],     load: ['10','12.5','15','20','22.5','25'] },
  { name: 'DB Push Press',        eq: ['Haltères'],          reps: [6,8,10,12,12,15],   load: ['10','12.5','15','17.5','20','22.5'] },
  { name: 'DB Walking Lunge',     eq: ['Haltères'],          reps: [8,10,12,16,16,20],  load: ['10','12.5','15','17.5','20','22.5'] },
  { name: 'DB OH Walking Lunge',  eq: ['Haltères'],          reps: [6,8,10,12,14,16],   load: ['10','12.5','15','17.5','20','22.5'] },
  { name: 'DB Farmer Carry',      eq: ['Haltères'],          reps: [25,25,50,50,50,75], load: ['15','17.5','20','22.5','25','30'], unit: 'm' },
  // ── Kettlebell ──
  { name: 'KB Swings',            eq: ['Kettlebell'],        reps: [10,12,15,20,20,25], load: ['12','16','20','24','28','32'] },
  { name: 'Goblet Squats',        eq: ['Kettlebell'],        reps: [8,10,12,15,15,20],  load: ['12','16','20','24','28','32'] },
  { name: 'KB Snatch',            eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['12','16','20','24','28','32'] },
  { name: 'KB Clean',             eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['12','16','20','24','28','32'] },
  { name: 'KB Clean & Jerk',      eq: ['Kettlebell'],        reps: [3,5,6,8,8,10],      load: ['12','16','20','24','28','32'] },
  { name: 'KB Shoulder to OH',    eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['12','16','20','24','28','32'] },
  { name: 'KB Clean & Press',     eq: ['Kettlebell'],        reps: [5,6,8,10,10,12],    load: ['12','16','20','24','28','32'] },
  { name: 'Double KB Snatch',     eq: ['Kettlebell'],        reps: [0,4,6,8,8,10],      load: ['','12','16','20','24','28'] },
  { name: 'Double KB Clean',      eq: ['Kettlebell'],        reps: [0,4,6,8,8,10],      load: ['','12','16','20','24','28'] },
  { name: 'Double KB Clean & Jerk', eq: ['Kettlebell'],      reps: [0,3,5,6,8,8],       load: ['','12','16','20','24','28'] },
  { name: 'KB Overhead Squat',    eq: ['Kettlebell'],        reps: [0,5,6,8,8,10],      load: ['','12','16','20','24','28'] },
  { name: 'Double KB OH Squat',   eq: ['Kettlebell'],        reps: [0,0,5,6,8,8],       load: ['','','12','16','20','24'] },
  { name: 'Turkish Get-up',       eq: ['Kettlebell'],        reps: [2,2,3,4,4,5],       load: ['8','12','16','20','24','28'] },
  { name: 'KB Thruster',          eq: ['Kettlebell'],        reps: [6,8,10,12,12,15],   load: ['12','16','20','24','28','32'] },
  { name: 'KB Farmer Carry',      eq: ['Kettlebell'],        reps: [25,25,50,50,50,75], load: ['16','20','24','28','32','36'], unit: 'm' },
  { name: 'KB Walking Lunge',     eq: ['Kettlebell'],        reps: [8,10,12,16,16,20],  load: ['12','16','20','24','28','32'] },
  { name: 'KB OH Walking Lunge',  eq: ['Kettlebell'],        reps: [6,8,10,12,14,16],   load: ['12','16','20','24','28','32'] },
  // ── Box ──
  { name: 'Box Jump',             eq: ['Box'],               reps: [8,10,12,15,18,20] },
  { name: 'Box Jump Over',        eq: ['Box'],               reps: [6,8,10,12,15,18] },
  { name: 'Box Step-ups',         eq: ['Box'],               reps: [10,12,16,20,20,24] },
  { name: 'Box Jump Step-overs',  eq: ['Box'],               reps: [6,8,10,12,15,18] },
  { name: 'Burpee Box Jump',      eq: ['Box'],               reps: [4,5,6,8,10,12] },
  { name: 'Burpee Box Jump Over', eq: ['Box'],               reps: [4,5,6,8,10,12] },
  { name: 'Med-Ball Box Step-Overs', eq: ['Box'],            reps: [6,8,10,12,15,18] },
  { name: 'DB Step Up',           eq: ['Haltères','Box'],    reps: [8,10,12,16,16,20],  load: ['10','12.5','15','17.5','20','22.5'] },
  { name: 'Double DB Step Up',    eq: ['Haltères','Box'],    reps: [6,8,10,12,14,16],   load: ['10','12.5','15','17.5','20','22.5'] },
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
  { name: 'Ring Rows',            eq: ['Anneaux'],           reps: [8,10,12,15,15,18] },
  { name: 'Ring Muscle-ups',      eq: ['Anneaux'],           reps: [0,0,0,2,4,5] },
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
  'Max Reps': ['Peak Performance','Limit Breaker','All Out','Max Effort','No Ceiling','Beyond Limits','Full Send','The Wall','Capacity Test','Raw Power','Final Push','Red Zone','Absolute Max','Breaking Point','Last Man Standing'],
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
  if (ld)               return `${r} ${m.name} (${ld} kg)`;
  return `${r} ${m.name}`;
}

function fmtMvtLabel(m: Mvt, li: number): string {
  const ld = m.load?.[li];
  if (ld) return `${m.name} (${ld} kg)`;
  return m.name;
}

function generateWOD(level: AthleteLevel, duration: number, type: WODType, equipment: string[], teamSize: number = 1): GeneratedWOD {
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
  const noEquip = equipment.includes('Aucun matériel') || equipment.length === 0;
  const realEquip = equipment.filter(e => e !== 'Aucun matériel' && e !== 'Benchmark');

  // Filter movements available for this level + equipment
  const pool = MVTS.filter(m => {
    if (m.reps[li] === 0) return false;
    if (noEquip) return m.eq.length === 0;
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

  // Smart pick: forced + random fill from remaining pool (no duplicates)
  const pickWithForced = (n: number): Mvt[] => {
    const needed = Math.max(0, n - forced.length);
    const remaining = pool.filter(m => !forced.includes(m));
    const extra = spick(remaining, Math.min(needed, remaining.length));
    const result = [...forced, ...extra];
    // Shuffle so forced aren't always first
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result.slice(0, n);
  };

  const title = srand(WOD_NAMES[type] ?? WOD_NAMES['AMRAP']);
  const tip   = srand(WOD_TIPS[type]  ?? WOD_TIPS['AMRAP']);

  let movements: string[] = [];
  let scoring = '';

  switch (type) {
    case 'AMRAP': {
      const count = duration <= 5 ? 3 : duration <= 10 ? srand([3,4]) : duration <= 15 ? srand([4,5]) : srand([4,5,6]);
      movements = pickWithForced(count).map(m => fmtMvt(m, li));
      scoring = `Max rounds en ${duration} min`;
      break;
    }
    case 'For Time': {
      const variant = srand(['descending','rft','chipper'] as const);
      if (variant === 'descending') {
        const scheme = srand(['21-15-9','15-12-9','12-9-6','10-8-6-4-2','15-10-5']);
        const mvts = pickWithForced(srand([2,3]));
        movements = [`${scheme} :`].concat(mvts.map(m => fmtMvtLabel(m, li)));
        scoring = `${scheme} — Temps (cap ${duration} min)`;
      } else if (variant === 'rft') {
        const rounds = srand([3,4,5]);
        const mvts = pickWithForced(srand([3,4]));
        movements = [`${rounds} Rounds For Time :`].concat(mvts.map(m => fmtMvt(m, li)));
        scoring = `${rounds} RFT — Temps (cap ${duration} min)`;
      } else {
        const mvts = pickWithForced(srand([5,6,7]));
        movements = mvts.map(m => {
          const mult = srand([2,3,4]);
          const r = m.reps[li] * mult;
          const u = m.unit ?? '';
          const ld = m.load?.[li];
          if (u === 'm')        return `${r}m ${m.name}`;
          if (u === 'cal')      return `${r} Cal ${m.name}`;
          if (u === '×7.62m')   return `${r}×7.62m ${m.name}`;
          if (ld)               return `${r} ${m.name} (${ld} kg)`;
          return `${r} ${m.name}`;
        });
        scoring = `Chipper — Temps (cap ${duration} min)`;
      }
      break;
    }
    case 'EMOM': {
      const mins = duration <= 5 ? 2 : duration <= 10 ? srand([2,3]) : duration <= 15 ? srand([3,4]) : srand([4,5]);
      const mvts = pickWithForced(mins);
      movements = mvts.map((m, i) => `Min ${i + 1} : ${fmtMvt(m, li)}`);
      scoring = `E${mins}MOM pendant ${duration} min — score = rounds complétés`;
      break;
    }
    case 'Tabata': {
      const count = srand([3,4,5]);
      const mvts = pickWithForced(count);
      movements = mvts.map(m => `20s ${m.name} / 10s Repos × 8`);
      scoring = 'Score = total de reps sur tous les rounds';
      break;
    }
    case 'Max Reps': {
      const count = srand([1,2]);
      const mvts = pickWithForced(count);
      movements = mvts.map(m => {
        const ld = m.load?.[li];
        const suffix = ld ? ` (${ld} kg)` : '';
        return `Max ${m.name}${suffix} en ${count === 1 ? duration : Math.floor(duration / count)} min`;
      });
      scoring = 'Score = total de reps';
      break;
    }
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

  return { title, type, duration, level, movements, scoring, tip };
}

export default function WODGeneratorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<WODStackParamList>>();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [sport,        setSport]        = useState<Sport>('functional');
  const [level,        setLevel]        = useState<AthleteLevel>('rx');
  const [duration,     setDuration]     = useState(5);
  const [wodType,      setWODType]      = useState<WODType>('AMRAP');
  const [equipment,    setEquipment]    = useState<string[]>(['Barre + Disques', 'Corde à sauter']);
  const [teamSize,     setTeamSize]     = useState(1);
  const [generatedWOD, setGeneratedWOD] = useState<GeneratedWOD | null>(null);
  const [hyroxLevel,   setHyroxLevel]   = useState('Open');
  const [hyroxFormat,  setHyroxFormat]  = useState('Solo');
  const [hyroxType,    setHyroxType]    = useState('Race Simulation');
  const [hyroxDur,     setHyroxDur]     = useState(45);
  const [hyroxEquip,   setHyroxEquip]   = useState<string[]>(['SkiErg', 'Sled Push', 'RowErg', 'Wall Balls']);
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
      const wod = generateHyroxWOD(hyroxLevel, hyroxFormat, hyroxType, hyroxDur, hyroxEquip);
      setGeneratedHyrox(wod);
      setGeneratedWOD(null);
    } else {
      const wod = generateWOD(level, duration, wodType, equipment, teamSize);
      setGeneratedWOD(wod);
      setGeneratedHyrox(null);
    }
    setLoading(false);
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Générateur WOD</Text>
        <Text style={S.headerSub}>Crée ton WOD sur mesure</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>

        {/* Quick access: Historique & Favoris */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
            onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.8}
          >
            <History color="#111" size={16} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>Historique</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#E5E7EB' }}
            onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.8}
          >
            <Heart color="#EF4444" size={16} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>Favoris</Text>
          </TouchableOpacity>
        </View>

        {/* Sport selector */}
        <View style={S.sportRow}>
          <TouchableOpacity
            style={[S.sportCard, sport === 'functional' && S.sportCardActive]}
            onPress={() => setSport('functional')}
            activeOpacity={0.8}
          >
            <Text style={S.sportEmoji}>🏋️</Text>
            <Text style={[S.sportLabel, sport === 'functional' && { color: theme.accent }]}>Functional{"\n"}Fitness</Text>
            {sport === 'functional' && <View style={[S.sportDot, { backgroundColor: theme.accent }]} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.sportCard, sport === 'hybrid' && S.sportCardHybrid]}
            onPress={() => setSport('hybrid')}
            activeOpacity={0.8}
          >
            <Text style={S.sportEmoji}>⚡</Text>
            <Text style={[S.sportLabel, sport === 'hybrid' && { color: HYROX_ORANGE }]}>Hybrid</Text>
            {sport === 'hybrid' && <View style={[S.sportDot, { backgroundColor: HYROX_ORANGE }]} />}
          </TouchableOpacity>
        </View>

        {sport === 'functional' ? (
          <>
        <View style={S.section}>
          <Text style={S.sectionTitle}>Ton niveau</Text>
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
          <Text style={S.sectionTitle}>Type de WOD</Text>
          <View style={S.chipRow}>
            {WOD_TYPES.map(t => (
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
          <Text style={S.sectionTitle}>Matériel disponible</Text>
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
          </>
        )}

        <TouchableOpacity
          onPress={handleGenerate}
          disabled={loading}
          activeOpacity={0.8}
          style={[S.generateBtn, S.generateGradient, { backgroundColor: accentColor }]}
        >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                <Sparkles color="#fff" size={20} />
                <Text style={S.generateText}>GÉNÉRER MON WOD</Text>
              </>
            }
        </TouchableOpacity>

        {generatedHyrox && (
          <View style={[S.resultCard, { borderColor: `${HYROX_ORANGE}40` }]}>
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
        )}

        {generatedWOD && (
          <View style={S.resultCard}>
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
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border },
  back: { marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: theme.text },
  headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  content: { padding: 16 },
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
    backgroundColor: theme.accent,
  },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
}); }
