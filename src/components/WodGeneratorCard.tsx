import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { Sparkles, RefreshCw, Zap, Clock, Users, User, ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, LevelColors } from '../theme/colors';
import { HomeStackParamList } from '../navigation';
import { AthleteLevel } from '../types';

const HYROX_ORANGE = '#F97316';
type Sport = 'functional' | 'hybrid';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeList'>;
type WODType = 'For Time' | 'AMRAP' | 'EMOM' | 'Tabata' | 'Max Reps';
type LK = AthleteLevel;

const LEVELS: { key: LK; label: string }[] = [
  { key: 'scaled', label: 'Scaled' }, { key: 'inter', label: 'Inter' },
  { key: 'rx', label: 'RX' }, { key: 'rx+', label: 'RX+' },
  { key: 'gx', label: 'Elite' }, { key: 'pro', label: 'Pro' },
];
const LI: Record<LK, number> = { scaled: 0, inter: 1, rx: 2, 'rx+': 3, gx: 4, pro: 5 };
const FORMATS = ['Solo', 'Équipe 2', 'Équipe 3', 'Équipe 4', 'Équipe 6'];

const HYROX_LEVELS = ['Open', 'Pro', 'Elite'];
const HYROX_FORMATS = ['Solo', 'Doubles', 'Relais', 'Mixed Relais'];
const HYROX_TYPES  = ['Race Simulation', 'Station Training', 'Cardio Force', 'Running Intervals'];
const HYROX_DURATIONS = [20, 30, 45, 60];
const HYROX_EQ_LIST = [
  { key: 'ski',  label: 'SkiErg' },       { key: 'slp',  label: 'Sled Push' },
  { key: 'slpu', label: 'Sled Pull' },    { key: 'row',  label: 'RowErg' },
  { key: 'bbj',  label: 'Burpee BJ' },   { key: 'fc',   label: 'Farmers Carry' },
  { key: 'sbl',  label: 'Sandbag Lunge' },{ key: 'wb',   label: 'Wall Balls' },
  { key: 'run',  label: 'Tapis course' }, { key: 'db2',  label: 'Haltères' },
];

interface HyroxWOD {
  name: string; level: string; format: string; type: string; duration: number;
  stations: string[]; scoring: string; coach: string;
}

const HYROX_NAMES: Record<string, string[]> = {
  'Race Simulation':   ['Race Day Protocol','HYROX Race Sim','Competition Mode','Full Distance','Race Forge','Pre-Race Drill','Event Simulator','Race Crusher','Qualifier Prep','Podium Run'],
  'Station Training':  ['Station Domination','Power Station','Station Mastery','Station Siege','Platform Work','Station Builder','Force Station','Block Drill','Station Storm','Grid Work'],
  'Cardio Force':      ['Hybrid Forge','Cardio Machine','Hybrid Engine','Power Cardio','Endurance Force','Hybrid Burn','Engine Room','Cross Cardio','Hybrid Blast','Force Cardio'],
  'Running Intervals': ['Track & Station','Run & Gun','Interval Force','Run Blocks','Speed Station','Running Man','Run Circuit','Lap & Station','Road & Station','Track Crusher'],
};
const HYROX_COACHES: Record<string, string[]> = {
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

function generateHyroxWOD(level: string, format: string, type: string, duration: number, eqKeys: string[]): HyroxWOD {
  const li   = ({ Open: 0, Pro: 1, Elite: 2 } as Record<string, number>)[level] ?? 0;
  const ski  = eqKeys.includes('ski');
  const slp  = eqKeys.includes('slp');
  const slpu = eqKeys.includes('slpu');
  const row  = eqKeys.includes('row');
  const sbl  = eqKeys.includes('sbl');
  const wb   = eqKeys.includes('wb');
  const bbj  = eqKeys.includes('bbj');
  const fc   = eqKeys.includes('fc');
  const db   = eqKeys.includes('db2');
  const trd  = eqKeys.includes('run');

  const sp_kg  = ['60','80','100+'][li];
  const sl_kg  = ['40','60','80+'][li];
  const wb_rep = [75, 90, 100][li];
  const wb_kg  = ['6','9','9'][li];
  const fc_kg  = ['16','20','24'][li];
  const sb_kg  = ['10','15','20'][li];
  const db_kg  = ['12','15','20'][li];
  const ski_d  = ['800m','1000m','1200m'][li];
  const row_d  = ['800m','1000m','1200m'][li];
  const r1k    = trd ? '1km Tapis' : '1km Course';
  const r800   = trd ? '800m Tapis' : '800m Course';
  const r400   = trd ? '400m Tapis' : '400m Course';

  const E = {
    ski1k:  ski  ? `${ski_d} SkiErg`                                         : row ? `${row_d} RowErg`              : `${ski_d} Course`,
    row1k:  row  ? `${row_d} RowErg`                                         : ski ? `${ski_d} SkiErg`              : `${row_d} Course`,
    ski500: ski  ? '500m SkiErg'                                              : row ? '500m RowErg'                  : r800,
    row500: row  ? '500m RowErg'                                              : ski ? '500m SkiErg'                  : r800,
    slp:    slp  ? `50m Sled Push (${sp_kg} kg)`                             : bbj ? `${[15,20,25][li]} Burpee BJ`  : `${[20,25,30][li]} KB Swings lourds`,
    slpu:   slpu ? `50m Sled Pull (${sl_kg} kg)`                             : fc  ? `${[150,200,250][li]}m Farmers Carry (${fc_kg}kg×2)` : `${[15,20,25][li]} Burpees`,
    sbl:    sbl  ? `${[50,75,100][li]}m Sandbag Lunges (${sb_kg} kg)`      : fc  ? `${[150,200,250][li]}m Farmers Carry (${fc_kg}kg×2)` : `${[40,60,80][li]} Air Squats`,
    wb:     wb   ? `${wb_rep} Wall Balls (${wb_kg} kg)`                      : `${[80,100,120][li]} Air Squats`,
    fc:     fc   ? `${[150,200,250][li]}m Farmers Carry (${fc_kg}kg×2)`     : sbl ? `${[50,75,100][li]}m Sandbag Lunges (${sb_kg} kg)` : `${[40,60,80][li]} Goblet Squats`,
    bbj:    bbj  ? `${[15,20,25][li]} Burpee Broad Jump`                     : `${[20,25,30][li]} Burpees`,
    db:     db   ? `${[12,15,20][li]} DB Thrusters (${db_kg}kg/main)`       : `${[15,20,25][li]} KB Thrusters lourds`,
    ski250: ski  ? `${['250m','300m','400m'][li]} SkiErg`                    : row ? `${['250m','300m','400m'][li]} RowErg` : `${['200m','300m','400m'][li]} Course`,
  };

  const name  = rand(HYROX_NAMES[type]   ?? HYROX_NAMES['Race Simulation']);
  const coach = rand(HYROX_COACHES[type] ?? HYROX_COACHES['Race Simulation']);
  let stations: string[] = [];
  let scoring  = '';

  if (type === 'Race Simulation') {
    const variant = duration >= 50 ? 0 : Math.floor(Math.random() * 5);
    if (variant === 0) {
      stations = [r1k, E.ski1k, r1k, E.slp, r1k, E.slpu, r1k, E.sbl, r1k, E.wb];
    } else if (variant === 1) {
      stations = [r1k, E.row1k, r1k, E.slp, r1k, E.fc, r1k, E.sbl, r1k, E.wb];
    } else if (variant === 2) {
      const s4 = pick([E.slp, E.slpu, E.sbl, E.wb, E.fc, E.bbj], 4);
      stations = [r1k, s4[0], r1k, s4[1], r1k, s4[2], r1k, s4[3]];
    } else if (variant === 3) {
      const s3 = pick([E.slp, E.slpu, E.sbl, E.wb, E.fc, E.bbj], 3);
      stations = [r800, s3[0], r800, s3[1], r800, s3[2]];
    } else {
      const s4 = pick([E.slp, E.slpu, E.sbl, E.wb, E.fc, E.bbj], 4);
      stations = [r400, s4[0], r800, s4[1], r1k, s4[2], r800, s4[3]];
    }
    scoring = `Temps total — objectif ${level === 'Elite' ? '< 55 min' : level === 'Pro' ? '< 70 min' : '< 85 min'}`;
  }

  else if (type === 'Station Training') {
    const sets = ['4 ×','5 ×','6 ×'][li];
    const stPool: string[] = [
      ski ? `${sets} ${ski_d} SkiErg`              : row ? `${sets} ${row_d} RowErg`       : `${sets} ${r800}`,
      slp  ? `${sets} 20m Sled Push (max charge)` : `${sets} ${E.bbj}`,
      slpu ? `${sets} 30m Sled Pull (${sl_kg} kg)`: `${sets} ${E.fc}`,
      sbl  ? `${sets} 25m Sandbag Lunges (${sb_kg} kg)` : `${sets} ${E.fc}`,
      wb   ? `${sets} 25 Wall Balls (${wb_kg} kg)`: `${sets} 30 Air Squats`,
      fc   ? `${sets} 50m Farmers Carry (${fc_kg}kg×2)` : `${sets} 20 KB Swings lourds`,
      row  ? `${sets} 250m RowErg tempo`           : ski ? `${sets} 250m SkiErg tempo`      : `${sets} ${r400}`,
      `${sets} ${E.bbj}`,
      `${sets} ${E.db}`,
      ski  ? `${sets} 150m SkiErg sprint`          : `${sets} 150m RowErg sprint`,
    ];
    const count = duration <= 20 ? 3 : duration <= 30 ? 4 : duration <= 45 ? 5 : 6;
    stations = pick(stPool, count);
    scoring  = `Score = stations complétées en ${duration} min`;
  }

  else if (type === 'Cardio Force') {
    const cardioPool = [E.ski500, E.row500, r800, r400, `${[20,25,30][li]} Cal Assault Bike`, E.ski250, `${['400m','500m','600m'][li]} Course`];
    const forcePool  = [E.slp, E.slpu, E.wb, E.sbl, E.fc, E.bbj, E.db, `${[10,15,20][li]} KB Thrusters lourds`];
    const count = duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 6 : 8;
    const nC = Math.ceil(count / 2);
    const nF = Math.floor(count / 2);
    const pC = pick(cardioPool, nC);
    const pF = pick(forcePool, nF);
    const combined: string[] = [];
    for (let i = 0; i < Math.max(nC, nF); i++) {
      if (pC[i]) combined.push(pC[i]);
      if (pF[i]) combined.push(pF[i]);
    }
    stations = combined;
    scoring  = `AMRAP ${duration} min — max rounds`;
  }

  else {
    const runOpts = [r400, r800, r1k];
    const stPool  = [E.ski500, E.row500, E.wb, E.slp, E.sbl, E.fc, E.bbj, E.db, `${[20,25,30][li]} Cal SkiErg`, E.ski250];
    const cycles  = duration <= 20 ? 2 : duration <= 30 ? 3 : duration <= 45 ? 4 : 5;
    const runDist = rand(runOpts);
    const picked  = pick(stPool, Math.min(cycles, 4));
    const result: string[] = [];
    for (let i = 0; i < cycles; i++) {
      result.push(runDist);
      result.push(picked[i % picked.length]);
    }
    stations = result;
    scoring  = `Temps total pour ${cycles} cycles`;
  }

  const fmtStation = (s: string): string => {
    if (format === 'Doubles')      return `(split) ${s}`;
    if (format === 'Relais')       return `[relais] ${s}`;
    if (format === 'Mixed Relais') return `[mixed] ${s}`;
    return s;
  };
  stations = stations.map(fmtStation);
  return { name, level, format, type, duration, stations, scoring, coach };
}
const DURATIONS = [5, 10, 15, 20, 30, 40, 60];
const WOD_TYPES: WODType[] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];
const EQ_LIST = [
  { key: 'bb', label: 'Barbell' }, { key: 'db', label: 'Haltères' },
  { key: 'kb', label: 'Kettlebell' }, { key: 'bx', label: 'Box' },
  { key: 'jr', label: 'Corde' }, { key: 'pb', label: 'Barre traction' },
  { key: 'ri', label: 'Anneaux' }, { key: 'erg', label: 'Erg' },
  { key: 'mb', label: 'Med Ball' }, { key: 'wm', label: 'Worm' },
  { key: 'bm', label: 'Benchmark' }, { key: 'bw', label: 'Sans matériel' },
];

interface GeneratedWOD {
  name: string; type: WODType; duration: number; level: LK;
  movements: string; scoring: string; coach: string; teamNote?: string;
}

// Movement pools per equipment key with level scaling [sc,in,rx,rx+,el,pr]
const MOVES: Record<string, Array<{ mv: string; scale: string[] }>> = {
  bb: [
    { mv: 'Clean & Jerks', scale: ['30/20','43/30','60/43','70/48','80/55','102/70'] },
    { mv: 'Power Cleans', scale: ['40/28','50/35','60/43','70/48','80/55','90/63'] },
    { mv: 'Cleans', scale: ['35/25','45/32','60/43','70/48','80/55','90/63'] },
    { mv: 'Squat Cleans', scale: ['35/25','45/32','60/43','70/48','80/55','90/63'] },
    { mv: 'Hang Cleans', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Hang Squat Cleans', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Hang Power Cleans', scale: ['35/25','45/32','60/43','70/48','80/55','90/63'] },
    { mv: 'Hang Clean & Jerks', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Hang Squat Clean & Jerks', scale: ['','30/20','43/30','50/35','60/42','70/48'] },
    { mv: 'Thrusters', scale: ['30/20','40/28','43/30','50/35','60/42','70/48'] },
    { mv: 'Clusters', scale: ['30/20','35/25','43/30','50/35','60/42','70/48'] },
    { mv: 'Deadlifts', scale: ['70/50','100/70','120/80','140/95','160/110','180/120'] },
    { mv: 'Snatches', scale: ['20/15','35/25','50/35','60/42','70/50','85/60'] },
    { mv: 'Power Snatches', scale: ['20/15','35/25','50/35','60/42','70/50','85/60'] },
    { mv: 'Squat Snatches', scale: ['','25/18','40/28','50/35','60/42','70/48'] },
    { mv: 'Hang Snatches', scale: ['','25/18','35/25','43/30','50/35','60/42'] },
    { mv: 'Front Squats', scale: ['40/28','55/38','70/48','85/58','100/68','120/80'] },
    { mv: 'Back Squats', scale: ['50/35','60/42','70/48','85/58','100/68','120/80'] },
    { mv: 'OHS', scale: ['20/15','35/25','50/35','60/42','70/48','80/55'] },
    { mv: 'Push Press', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Push Jerks', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Strict Press', scale: ['20/15','30/20','40/28','50/35','55/38','60/42'] },
    { mv: 'Shoulder to OH', scale: ['25/18','35/25','45/32','55/38','65/45','75/50'] },
    { mv: 'Sumo Deadlift HP', scale: ['25/18','30/20','35/25','40/28','50/35','55/38'] },
    { mv: 'Burpee Over Bar', scale: ['—','—','—','—','—','—'] },
    { mv: 'Bar Facing Burpees', scale: ['—','—','—','—','—','—'] },
  ],
  db: [
    { mv: 'DB Thrusters', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Snatches alt.', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Hang Snatches', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Squat Snatches', scale: ['','10/7','12/8','15/10','20/14','22/15'] },
    { mv: "Devil's Press", scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Clean & Jerks', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Hang Clean & Jerks', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Deadlifts', scale: ['15/10','20/14','25/17','30/20','35/22','40/27'] },
    { mv: 'DB Lunges', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Walking Lunges', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB OH Walking Lunges', scale: ['10/7','12/8','15/10','17/12','20/14','22/15'] },
    { mv: 'DB Push Press', scale: ['10/7','12/8','15/10','17/12','20/14','22/15'] },
    { mv: 'DB Farmer Carry (m)', scale: ['25','25','50','50','50','75'] },
    { mv: 'Burpee Over DB', scale: ['—','—','—','—','—','—'] },
    { mv: 'DB Step-ups', scale: ['10/7','12/8','15/10','17/12','20/14','22/15'] },
  ],
  kb: [
    { mv: 'KB Swings', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'Goblet Squats', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'KB Cleans alt.', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'KB Snatches alt.', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'KB Clean & Jerks', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
    { mv: 'KB Shoulder to OH', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
    { mv: 'KB Clean & Press', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
    { mv: 'Double KB Snatches', scale: ['','12/8','16/12','20/16','24/16','28/20'] },
    { mv: 'Double KB Cleans', scale: ['','12/8','16/12','20/16','24/16','28/20'] },
    { mv: 'Double KB Clean & Jerks', scale: ['','12/8','16/12','20/16','24/16','28/20'] },
    { mv: 'KB OH Squats', scale: ['','12/8','16/12','20/16','24/16','28/20'] },
    { mv: 'Double KB OH Squats', scale: ['','','12/8','16/12','20/16','24/16'] },
    { mv: 'Turkish Get-ups alt.', scale: ['10/8','14/10','16/12','20/14','24/16','28/20'] },
    { mv: 'KB Thrusters', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
    { mv: 'KB Farmer Carry (m)', scale: ['25','25','50','50','50','75'] },
    { mv: 'KB Walking Lunges', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
    { mv: 'KB OH Walking Lunges', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  ],
  bx: [
    { mv: 'Box Jumps', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Box Jump Overs', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Box Step-ups', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Box Jump Step-overs', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Burpee Box Jumps', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Burpee Box Jump Overs', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
  ],
  jr: [
    { mv: 'Double Unders', scale: ['×3 SU','×2 SU','DU','DU','DU (TU modif)','Triple Unders'] },
    { mv: 'Single Unders', scale: ['SU','SU','SU','DU','DU','DU'] },
    { mv: 'Cross Overs', scale: ['—','—','CO','CO','CO','CO'] },
    { mv: 'Double Cross Overs', scale: ['—','—','—','DCO','DCO','DCO'] },
  ],
  pb: [
    { mv: 'Pull-ups', scale: ['Ring Rows','Australian PU','Pull-ups','C2B','C2B stricts','Bar MU'] },
    { mv: 'Toes to Bar', scale: ['K2E','K2C','T2B','T2B','T2B','T2B'] },
    { mv: 'Knees to Elbows', scale: ['K2E','K2E','K2E','T2B','T2B','T2B'] },
    { mv: 'HSPU', scale: ['Pike PU','HSPU modif','HSPU modif','HSPU','HSPU stricts','HSPU stricts'] },
    { mv: 'Kipping Pull-ups', scale: ['Ring Rows','Australian PU','Kipping PU','C2B','C2B','BMU'] },
    { mv: 'Bar Muscle-ups', scale: ['—','—','—','BMU modif','BMU','BMU'] },
    { mv: 'Pull-Overs', scale: ['—','Pull-Over modif','Pull-Overs','Pull-Overs','Pull-Overs','Pull-Overs'] },
  ],
  ri: [
    { mv: 'Ring Dips', scale: ['Ring Dip modif','Ring Dip modif','Ring Dips','Ring Dips','Ring Dips stricts','Ring Dips stricts'] },
    { mv: 'Muscle-ups', scale: ['Ring Rows+Dips','Ring Rows+Dips','MU modif','MU modif','Muscle-ups','Muscle-ups'] },
    { mv: 'Ring Push-ups', scale: ['Ring PU genoux','Ring PU','Ring PU','Ring PU élargis','Ring PU + pause','Archer Ring PU'] },
    { mv: 'Ring Rows', scale: ['Incliné 45°','Horizontal','Horizontal','Pieds surélevés','Pieds surélevés+pause','Archer Ring Row'] },
    { mv: 'Toes to Rings', scale: ['—','K2R','T2R','T2R','T2R','T2R'] },
  ],
  erg: [
    { mv: 'Cal Rameur', scale: ['10','12','15','18','20','25'] },
    { mv: 'Cal Ski Erg', scale: ['8','10','12','15','18','22'] },
    { mv: 'Cal Assault Bike', scale: ['8','10','12','15','18','22'] },
    { mv: 'm Rameur', scale: ['250','300','400','500','500','750'] },
  ],
  mb: [
    { mv: 'Wall Balls (cible 3m) kg', scale: ['6/4','7/5','9/6','10/7','12/9','14/10'] },
    { mv: 'MB Slams kg', scale: ['6','8','9','10','12','14'] },
    { mv: 'MB Cleans kg', scale: ['6/4','7/5','9/6','10/7','12/9','14/10'] },
  ],
  wm: [
    { mv: 'Worm Clean & Jerks', scale: ['35','35','75','75','110','110'] },
    { mv: 'Worm Squats', scale: ['35','35','75','75','110','110'] },
    { mv: 'Worm Lunges', scale: ['35','35','75','75','110','110'] },
  ],
  bw: [
    { mv: 'Burpees', scale: ['step-out','classiques','classiques','saut haut','saut + clap','explosifs'] },
    { mv: 'Down Ups', scale: ['×1','×1','×1','×1','×1','×1'] },
    { mv: 'Air Squats', scale: ['×1','×1','×1','×1.2','×1.5','×2'] },
    { mv: 'Push-ups', scale: ['genoux','classiques','classiques','wide+narrow','diamond','archer'] },
    { mv: 'Sit-ups', scale: ['×1','×1','×1','V-ups','V-ups','Hollow rocks'] },
    { mv: 'Lunges alt.', scale: ['×1','×1','×1','walking','jumping','jumping'] },
    { mv: 'Mountain Climbers', scale: ['lents','lents','normaux','normaux','rapides','rapides'] },
    { mv: 'Pistol Squats', scale: ['—','—','assistés','Pistols','Pistols','Pistols'] },
    { mv: 'Handstand Push-ups', scale: ['—','—','—','HSPU modif','HSPU','HSPU stricts'] },
    { mv: 'Wall Walks', scale: ['—','partiels','Wall Walks','Wall Walks','Wall Walks','Wall Walks'] },
    { mv: 'Broad Jumps', scale: ['×1','×1','×1','×1','×1','×1'] },
    { mv: 'Hollow Rocks', scale: ['×1','×1','×1','×1','×1','×1'] },
    { mv: 'Bear Crawl (m)', scale: ['10','10','15','15','20','20'] },
    { mv: 'Shuttle Run (×7.62m)', scale: ['2','2','4','4','6','6'] },
    { mv: 'V-ups', scale: ['×1','×1','×1','×1','×1','×1'] },
  ],
};

// ── Benchmark WODs (Hero + Girl + Open) ───────────────────────────────
interface BenchmarkWOD { title: string; cat: string; moves: string[]; scoring: string; tip: string }
const BENCHMARKS: BenchmarkWOD[] = [
  { title:'Fran', cat:'Girl', moves:['21-15-9 :','Thrusters (43 kg)','Pull-ups'], scoring:'For Time', tip:'Fractionne les séries si besoin : 12+9 / 8+7 / 5+4.' },
  { title:'Grace', cat:'Girl', moves:['30 Clean & Jerk (60 kg)'], scoring:'For Time', tip:'Singles ou touch-and-go ? Trouve ton rythme et tiens-le.' },
  { title:'Helen', cat:'Girl', moves:['3 Rounds For Time :','400m Course','21 KB Swings (24 kg)','12 Pull-ups'], scoring:'For Time', tip:'La course te prépare, les KB te fatiguent, les pull-ups te finissent.' },
  { title:'Diane', cat:'Girl', moves:['21-15-9 :','Deadlifts (100 kg)','Handstand Push-ups'], scoring:'For Time', tip:'Les HSPU sont le bottleneck. Gère ta fatigue d\'épaule.' },
  { title:'Elizabeth', cat:'Girl', moves:['21-15-9 :','Cleans (60 kg)','Ring Dips'], scoring:'For Time', tip:'Les cleans lourds fatiguent les bras pour les dips.' },
  { title:'Amanda', cat:'Girl', moves:['9-7-5 :','Ring Muscle-ups','Squat Snatches (60 kg)'], scoring:'For Time', tip:'Chaque rep compte. Qualité avant vitesse.' },
  { title:'Annie', cat:'Girl', moves:['50-40-30-20-10 :','Double Unders','Sit-ups'], scoring:'For Time', tip:'Les DU sont la clé. Si tu casses, calme-toi et repars.' },
  { title:'Barbara', cat:'Girl', moves:['5 Rounds (3 min repos) :','20 Pull-ups','30 Push-ups','40 Sit-ups','50 Air Squats'], scoring:'For Time', tip:'Chaque round doit être constant.' },
  { title:'Cindy', cat:'Girl', moves:['AMRAP 20 min :','5 Pull-ups','10 Push-ups','15 Air Squats'], scoring:'Max rounds', tip:'Rythme constant. Objectif : 20+ rounds pour RX.' },
  { title:'DT', cat:'Girl', moves:['5 Rounds For Time :','12 Deadlifts (70 kg)','9 Hang Cleans (70 kg)','6 Push Jerks (70 kg)'], scoring:'For Time', tip:'Ne lâche pas la barre. Touch-and-go si possible.' },
  { title:'Isabel', cat:'Girl', moves:['30 Snatches (60 kg)'], scoring:'For Time', tip:'Singles rapides ou séries de 3. Pas de repos > 5s.' },
  { title:'Jackie', cat:'Girl', moves:['For Time :','1000m Row','50 Thrusters (20 kg)','30 Pull-ups'], scoring:'For Time', tip:'Le row est ta mise en route. Explose sur les thrusters.' },
  { title:'Karen', cat:'Girl', moves:['150 Wall Balls (9 kg)'], scoring:'For Time', tip:'Séries de 25 minimum. Ne pose pas le ballon plus de 3s.' },
  { title:'Kelly', cat:'Girl', moves:['5 Rounds For Time :','400m Course','30 Box Jumps','30 Wall Balls (9 kg)'], scoring:'For Time', tip:'Long WOD. Gère ton allure dès le départ.' },
  { title:'Mary', cat:'Girl', moves:['AMRAP 20 min :','5 HSPU','10 Pistol Squats','15 Pull-ups'], scoring:'Max rounds', tip:'La technique prime.' },
  { title:'Nancy', cat:'Girl', moves:['5 Rounds For Time :','400m Course','15 OHS (43 kg)'], scoring:'For Time', tip:'Les OHS après la course sont brutaux.' },
  { title:'Murph', cat:'Hero', moves:['For Time (gilet 9 kg) :','1 Mile Course','100 Pull-ups','200 Push-ups','300 Air Squats','1 Mile Course'], scoring:'For Time', tip:'Partition : 20×(5 PU + 10 PU + 15 SQ).' },
  { title:'Nate', cat:'Hero', moves:['AMRAP 20 min :','2 Muscle-ups','4 HSPU','8 KB Swings (24 kg)'], scoring:'Max rounds', tip:'WOD technique. Les MU sont le limitant.' },
  { title:'Randy', cat:'Hero', moves:['75 Power Snatches (34 kg)'], scoring:'For Time', tip:'Touch-and-go par séries de 10-15.' },
  { title:'JT', cat:'Hero', moves:['21-15-9 :','HSPU','Ring Dips','Push-ups'], scoring:'For Time', tip:'Tout en poussée. Gère tes épaules.' },
  { title:'Badger', cat:'Hero', moves:['3 Rounds For Time :','30 Squat Cleans (43 kg)','30 Pull-ups','800m Course'], scoring:'For Time', tip:'Long et lourd. Fractionne les cleans en 5×6.' },
  { title:'Loredo', cat:'Hero', moves:['6 Rounds For Time :','24 Air Squats','24 Push-ups','24 Walking Lunges','400m Course'], scoring:'For Time', tip:'Bodyweight pur. Rythme régulier.' },
  { title:'Ryan', cat:'Hero', moves:['5 Rounds For Time :','7 Muscle-ups','21 Burpees'], scoring:'For Time', tip:'Les MU sont la clé. Séries de 3-4 max.' },
  { title:'Open 14.5', cat:'Open', moves:['21-18-15-12-9-6-3 :','Thrusters (43 kg)','Burpees'], scoring:'For Time', tip:'Classique. Fractionne les thrusters.' },
  { title:'Open 15.5', cat:'Open', moves:['27-21-15-9 :','Row (Cal)','Thrusters (43 kg)'], scoring:'For Time', tip:'Le rameur monte vite en cal.' },
  { title:'Open 17.5', cat:'Open', moves:['10 Rounds For Time :','9 Thrusters (43 kg)','35 Double Unders'], scoring:'For Time', tip:'Thrusters en unbroken ou 5+4.' },
  { title:'Open 18.1', cat:'Open', moves:['AMRAP 20 min :','8 T2B','10 DB Hang C&J (22.5 kg)','14 Cal Row'], scoring:'Max rounds', tip:'Long AMRAP. Rythme et transitions.' },
  { title:'Open 20.1', cat:'Open', moves:['10 Rounds For Time :','8 Ground to OH (61 kg)','10 Bar Facing Burpees'], scoring:'For Time (cap 15 min)', tip:'G2O en singles propres.' },
  { title:'Open 22.1', cat:'Open', moves:['AMRAP 15 min :','3 Wall Walks','12 DB Snatches (22.5 kg)','15 Box Jump-Overs'], scoring:'Max rounds', tip:'Wall Walks = technique. DB snatches alternés.' },
  { title:'Open 23.1', cat:'Open', moves:['AMRAP 14 min :','60 Cal Row','50 T2B','40 Wall Balls (9 kg)','30 Cleans (60 kg)','20 Muscle-ups'], scoring:'Max reps', tip:'Commence fort sur le row. Les MU sont le bonus.' },
  { title:'Open 24.1', cat:'Open', moves:['AMRAP 15 min (poids croissant) :','21/15 Cal Row','15 Deadlifts','9 SDHP','6 Cleans'], scoring:'Max rounds', tip:'Le poids augmente à chaque round.' },
  { title:'Open 24.2', cat:'Open', moves:['AMRAP 20 min :','300m Shuttle Run','10 Clean & Jerk (60 kg)','30 T2B'], scoring:'Max rounds', tip:'La course est longue. Les C&J doivent être efficaces.' },
];

// WOD name pools
const NAMES_FT = ['Iron Fist','Steel Storm','War Machine','Fire Breather','The Crusher','Ground Zero','Battle Cry','Death March','Full Send','Red Line','Forge','Inferno','Relentless','Last Stand','No Mercy'];
const NAMES_AM = ['Endless Engine','Non-Stop','Forever Young','Electric','The Grind','Voltage','Pulse','Reactor','Dynamo','Ignition','Fuel','Overdrive','Current','The Loop','Cyclone'];
const NAMES_EM = ['Minute Man','Clockwork','Second Nature','Steady State','Rhythm','Metronome','The Beat','Chronos','Tempo','Beat Drop','Epoch','Cycle','Interval','The Grid','Sequence'];
const NAMES_TB = ['Tabata Terror','Eight Rounds','War Cry','Short Fuse','Blast','Thunder','Lightning','Shock','Impact','Explosion','Strike','Hammer','Jolt','Flash','Surge'];
const NAMES_MR = ['Peak','Limit Tester','Max Out','Ceiling','The Summit','Threshold','Pinnacle','Zenith','Apex','Top Out','Redline','Breakthrough','The Wall','Surge Max','Push'];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr]; const result: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function getMoves(eqKeys: string[], li: number): Array<{ mv: string; scale: string[] }> {
  const active = eqKeys.includes('bw') || eqKeys.length === 0 ? ['bw', ...eqKeys] : eqKeys;
  const pool: Array<{ mv: string; scale: string[] }> = [];
  active.forEach(k => { if (MOVES[k]) pool.push(...MOVES[k]); });
  if (pool.length === 0) pool.push(...MOVES['bw']);
  // Filter out moves unavailable at this level (empty or '—' scale)
  return pool.filter(m => m.scale[li] !== '' && m.scale[li] !== '—');
}

function getMovesForced(eqKeys: string[], li: number, count: number): Array<{ mv: string; scale: string[] }> {
  const realKeys = eqKeys.filter(k => k !== 'bw' && k !== 'bm');
  const pool = getMoves(eqKeys, li);
  // Force at least one movement per selected equipment category
  const forced: Array<{ mv: string; scale: string[] }> = [];
  for (const k of realKeys) {
    if (!MOVES[k]) continue;
    const available = MOVES[k].filter(m => m.scale[li] !== '' && m.scale[li] !== '—' && !forced.includes(m));
    if (available.length > 0) forced.push(rand(available));
  }
  // Fill remaining slots from general pool
  const needed = Math.max(0, count - forced.length);
  const remaining = pool.filter(m => !forced.includes(m));
  const extra = pick(remaining, Math.min(needed, remaining.length));
  const result = [...forced, ...extra];
  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, count);
}

function fmtName(mv: { mv: string; scale: string[] }, li: number): string {
  const s = mv.scale[li];
  if (mv.mv === 'Cal Rameur' || mv.mv === 'Cal Ski Erg' || mv.mv === 'Cal Assault Bike') return `${s} ${mv.mv}`;
  if (mv.mv === 'm Rameur') return `${s}m Rameur`;
  if (mv.mv === 'Air Squats') return 'Air Squats';
  if (mv.mv === 'Burpees') return `Burpees${s !== 'classiques' ? ' ' + s : ''}`;
  if (mv.mv === 'Push-ups') return s === 'classiques' ? 'Push-ups' : `Push-ups (${s})`;
  if (mv.mv === 'Sit-ups') return s === '×1' ? 'Sit-ups' : s;
  if (mv.mv === 'Lunges alt.') return `Lunges (${s})`;
  if (mv.mv === 'Mountain Climbers') return 'Mountain Climbers';
  if (mv.mv === 'Double Unders') return s.startsWith('×') ? 'Single Unders' : (s === 'DU' || s.startsWith('DU') ? 'Double Unders' : s);
  if (mv.mv === 'Single Unders') return 'Single Unders';
  if (!/^\d/.test(s)) return s;
  if (s.endsWith('cm')) return `${mv.mv} (${s})`;
  const mvName = mv.mv.replace(/ kg$/, '').replace(/ \(kg\)$/, '');
  return `${mvName} (${s} kg)`;
}

function scaleReps(base: number, li: number): number {
  const factors = [0.6, 0.75, 1, 1.2, 1.4, 1.6];
  return Math.round(base * factors[li]);
}

function fmt(mv: { mv: string; scale: string[] }, reps: number, li: number): string {
  const s = mv.scale[li];
  // Erg: Cal/distance
  if (mv.mv === 'Cal Rameur' || mv.mv === 'Cal Ski Erg' || mv.mv === 'Cal Assault Bike') return `${s} ${mv.mv}`;
  if (mv.mv === 'm Rameur') return `${s}m Rameur`;
  // Bodyweight specials
  if (mv.mv === 'Air Squats') { const f = parseFloat(s); return `${isNaN(f) ? reps : Math.round(reps * f)} Air Squats`; }
  if (mv.mv === 'Burpees') return `${reps} Burpees${s !== 'classiques' ? ' ' + s : ''}`;
  if (mv.mv === 'Push-ups') return s === 'classiques' ? `${reps} Push-ups` : `${reps} Push-ups (${s})`;
  if (mv.mv === 'Sit-ups') return s === '×1' ? `${reps} Sit-ups` : `${reps} ${s}`;
  if (mv.mv === 'Lunges alt.') return `${reps} Lunges (${s})`;
  if (mv.mv === 'Mountain Climbers') return `${reps * 2} Mountain Climbers`;
  // Double/Single Unders
  if (mv.mv === 'Double Unders') {
    if (s === 'DU' || s.startsWith('DU')) return `${reps} Double Unders`;
    if (s.startsWith('×')) return `${reps * parseInt(s.slice(1))} Single Unders`;
    return `${reps} ${s}`;
  }
  if (mv.mv === 'Single Unders') return `${reps} Single Unders`;
  // Scale values that are pure movement names (pb, ri) — detected if scale doesn't start with digit
  if (!/^\d/.test(s)) return `${reps} ${s}`;
  // Scale values ending with 'cm' (box heights)
  if (s.endsWith('cm')) return `${reps} ${mv.mv} (${s})`;
  // Weight-based movements: scale is 'kg/kg'
  const mvName = mv.mv.replace(/ kg$/, '').replace(/ \(kg\)$/, '');
  return `${reps} ${mvName} (${s} kg)`;
}

function generateWOD(level: LK, format: string, duration: number, type: WODType, eqKeys: string[]): GeneratedWOD {
  const li = LI[level];
  const isTeam = format !== 'Solo';
  const teamN = isTeam ? parseInt(format.replace(/\D/g, '')) || 2 : 1;

  // ── Benchmark mode ──
  if (eqKeys.includes('bm')) {
    const bm = rand(BENCHMARKS);
    return {
      name: bm.title, type: 'For Time' as WODType, duration: 0, level,
      movements: bm.moves.join('\n'),
      scoring: `${bm.scoring} — ${bm.cat} WOD`,
      coach: bm.tip,
      teamNote: isTeam ? `Équipe de ${teamN} : alternance par round ou YGIG.` : undefined,
    };
  }

  let name = '', movements = '', scoring = '', coach = '', teamNote = '';

  if (type === 'For Time') {
    name = rand(NAMES_FT);
    const rounds = duration <= 5 ? 1 : duration <= 10 ? 3 : duration <= 15 ? 4 : duration <= 20 ? 5 : 7;
    const mvs = getMovesForced(eqKeys, li, rounds <= 1 ? 2 : 3);
    const baseReps = [21, 15, 9];
    if (rounds === 1) {
      movements = mvs.map((m, i) => `${fmt(m, scaleReps(baseReps[i] ?? 15, li), li)}`).join('\n');
      scoring = `21-15-9 — Temps le plus court (cap ${duration} min)`;
    } else {
      movements = `${rounds} rounds :\n` + mvs.map(m => `  ${fmt(m, scaleReps(15, li), li)}`).join('\n');
      scoring = `Temps le plus court (cap ${duration} min)`;
    }
    coach = 'Gère ton effort : les 2 premiers rounds doivent sembler faciles.';
    teamNote = isTeam ? `Équipe de ${teamN} : alternance par round.` : '';
  }

  else if (type === 'AMRAP') {
    name = rand(NAMES_AM);
    const mvs = getMovesForced(eqKeys, li, 3);
    const baseReps = [10, 15, 20];
    movements = `AMRAP ${duration} min :\n` + mvs.map((m, i) => `  ${fmt(m, scaleReps(baseReps[i], li), li)}`).join('\n');
    scoring = `Max rounds + reps en ${duration} min`;
    coach = 'Trouve UN rythme et tiens-le. Évite le sprint initial.';
    teamNote = isTeam ? `Équipe de ${teamN} : score commun. Alternance complète par round.` : '';
  }

  else if (type === 'EMOM') {
    name = rand(NAMES_EM);
    const mins = Math.min(duration, 6);
    const mvs = getMovesForced(eqKeys, li, Math.min(mins, 3));
    const lines: string[] = [];
    for (let i = 0; i < mins; i++) {
      const m = mvs[i % mvs.length];
      lines.push(`  Min ${i+1}: ${fmt(m, scaleReps(10, li), li)}`);
    }
    if (duration > mins) lines.push(`  → Répéter le cycle (${Math.round(duration / mins)} fois)`);
    movements = `EMOM ${duration} min :\n` + lines.join('\n');
    scoring = `Score = rounds complétés`;
    coach = 'Finis chaque minute avec au moins 15s de repos.';
    teamNote = isTeam ? `Équipe de ${teamN} : A fait min impaires, B min paires${teamN > 2 ? ', C min 3,6,9...' : ''}.` : '';
  }

  else if (type === 'Tabata') {
    name = rand(NAMES_TB);
    const count = Math.max(1, Math.floor(duration / 4));
    const mvs = getMovesForced(eqKeys, li, count);
    movements = `Tabata ${duration} min (${count} mouv.):\n` + mvs.map(m => `  8×20s ${fmtName(m, li)} / 10s repos`).join('\n');
    scoring = 'Score = min de reps sur un round (par mouvement)';
    coach = 'Maintiens le même nombre de reps à chaque round des 8.';
    teamNote = isTeam ? `Équipe de ${teamN} : score collectif = somme des reps.` : '';
  }

  else {
    name = rand(NAMES_MR);
    const pool = getMoves(eqKeys, li);
    const m = rand(pool);
    const maxReps = scaleReps(10, li);
    movements = `Max reps en ${duration} min :\n  ${fmtName(m, li)}`;
    scoring = `Score = total de reps (${maxReps} reps/set conseillé, repos 15s max)`;
    coach = 'Sets réguliers. Repos jamais > 20s. Pousse jusqu\'au bout.';
    teamNote = isTeam ? `Équipe de ${teamN} : score = somme des reps. Alternance toutes les 30s.` : '';
  }

  return { name, type, duration, level, movements, scoring, coach, teamNote: isTeam ? teamNote : undefined };
}

export default function WodGeneratorCard({ navigation: navProp }: { navigation?: Nav }) {
  const navHook = useNavigation<Nav>();
  const navigation = navProp ?? navHook;

  const [sport,       setSport]       = useState<Sport>('functional');
  // Functional Fitness
  const [level,       setLevel]       = useState<LK>('rx');
  const [format,      setFormat]      = useState('Solo');
  const [duration,    setDuration]    = useState(10);
  const [wodType,     setWodType]     = useState<WODType>('AMRAP');
  const [equipment,   setEquipment]   = useState<string[]>(['bw']);
  const [wod,         setWod]         = useState<GeneratedWOD | null>(null);
  // Hybrid / Hyrox
  const [hyroxLevel,  setHyroxLevel]  = useState('Open');
  const [hyroxFormat, setHyroxFormat] = useState('Solo');
  const [hyroxType,   setHyroxType]   = useState('Race Simulation');
  const [hyroxDur,    setHyroxDur]    = useState(45);
  const [hyroxEquip,  setHyroxEquip]  = useState<string[]>(['ski', 'slp', 'row', 'wb']);
  const [hyroxWod,    setHyroxWod]    = useState<HyroxWOD | null>(null);

  const [loading, setLoading] = useState(false);

  const accent = sport === 'hybrid' ? HYROX_ORANGE : Colors.primary;

  function toggleEq(k: string) {
    if (k === 'bw') { setEquipment(['bw']); return; }
    if (k === 'bm') { setEquipment(['bm']); return; }
    setEquipment(prev => {
      const without = prev.filter(e => e !== 'bw' && e !== 'bm');
      const next = without.includes(k) ? without.filter(e => e !== k) : [...without, k];
      return next.length === 0 ? ['bw'] : next;
    });
  }

  function toggleHyroxEq(k: string) {
    setHyroxEquip(prev => prev.includes(k) ? prev.filter(e => e !== k) : [...prev, k]);
  }

  async function handleGenerate() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    if (sport === 'hybrid') {
      setHyroxWod(generateHyroxWOD(hyroxLevel, hyroxFormat, hyroxType, hyroxDur, hyroxEquip));
      setWod(null);
    } else {
      setWod(generateWOD(level, format, duration, wodType, equipment));
      setHyroxWod(null);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <ArrowLeft color={Colors.text} size={22} />
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <Sparkles color={Colors.primary} size={16} />
          <Text style={s.headerTitleTxt}>Générateur de WOD</Text>
        </View>
        <View style={s.backBtn} />
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.wrapper}>

      {/* Sport selector */}
      <View style={s.sportRow}>
        <TouchableOpacity
          style={[s.sportCard, sport === 'functional' && s.sportCardActive]}
          onPress={() => setSport('functional')} activeOpacity={0.8}
        >
          <Text style={s.sportEmoji}>🏋️</Text>
          <Text style={[s.sportLabel, sport === 'functional' && { color: Colors.primary }]}>{"Functional\nFitness"}</Text>
          {sport === 'functional' && <View style={[s.sportDot, { backgroundColor: Colors.primary }]} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sportCard, sport === 'hybrid' && s.sportCardHybrid]}
          onPress={() => setSport('hybrid')} activeOpacity={0.8}
        >
          <Text style={s.sportEmoji}>⚡</Text>
          <Text style={[s.sportLabel, sport === 'hybrid' && { color: HYROX_ORANGE }]}>Hybrid</Text>
          {sport === 'hybrid' && <View style={[s.sportDot, { backgroundColor: HYROX_ORANGE }]} />}
        </TouchableOpacity>
      </View>

      {sport === 'functional' ? (<>
      {/* Level */}
      <Text style={s.optLabel}>NIVEAU</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {LEVELS.map(l => (
          <TouchableOpacity key={l.key} onPress={() => setLevel(l.key)} activeOpacity={0.7}
            style={[s.chip, level === l.key && { backgroundColor: `${LevelColors[l.key]}22`, borderColor: LevelColors[l.key] }]}>
            <Text style={[s.chipTxt, level === l.key && { color: LevelColors[l.key], fontWeight: '900' }]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Format */}
      <Text style={s.optLabel}>FORMAT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {FORMATS.map(f => (
          <TouchableOpacity key={f} onPress={() => setFormat(f)} activeOpacity={0.7}
            style={[s.chip, format === f && s.chipSel]}>
            {f === 'Solo' ? <User color={format === f ? Colors.primary : Colors.textMuted} size={13} /> : <Users color={format === f ? Colors.primary : Colors.textMuted} size={13} />}
            <Text style={[s.chipTxt, format === f && s.chipTxtSel]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Duration */}
      <Text style={s.optLabel}>DURÉE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {DURATIONS.map(d => (
          <TouchableOpacity key={d} onPress={() => setDuration(d)} activeOpacity={0.7}
            style={[s.chip, duration === d && s.chipSel]}>
            <Clock color={duration === d ? Colors.primary : Colors.textMuted} size={12} />
            <Text style={[s.chipTxt, duration === d && s.chipTxtSel]}>{d} min</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Type */}
      <Text style={s.optLabel}>TYPE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {WOD_TYPES.map(t => (
          <TouchableOpacity key={t} onPress={() => setWodType(t)} activeOpacity={0.7}
            style={[s.chip, wodType === t && s.chipSel]}>
            <Text style={[s.chipTxt, wodType === t && s.chipTxtSel]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Equipment */}
      <Text style={s.optLabel}>MATÉRIEL</Text>
      <View style={s.eqGrid}>
        {EQ_LIST.map(e => (
          <TouchableOpacity key={e.key} onPress={() => toggleEq(e.key)} activeOpacity={0.7}
            style={[s.eqChip, equipment.includes(e.key) && s.eqChipSel]}>
            <Text style={[s.eqTxt, equipment.includes(e.key) && s.eqTxtSel]}>{e.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      </>) : (<>

      {/* Hyrox level */}
      <Text style={[s.optLabel, { color: HYROX_ORANGE }]}>CATÉGORIE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {HYROX_LEVELS.map(l => (
          <TouchableOpacity key={l} onPress={() => setHyroxLevel(l)} activeOpacity={0.7}
            style={[s.chip, hyroxLevel === l && s.chipHybrid]}>
            <Text style={[s.chipTxt, hyroxLevel === l && { color: HYROX_ORANGE, fontWeight: '900' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Hyrox format */}
      <Text style={[s.optLabel, { color: HYROX_ORANGE }]}>FORMAT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {HYROX_FORMATS.map(f => (
          <TouchableOpacity key={f} onPress={() => setHyroxFormat(f)} activeOpacity={0.7}
            style={[s.chip, hyroxFormat === f && s.chipHybrid]}>
            <Text style={[s.chipTxt, hyroxFormat === f && { color: HYROX_ORANGE, fontWeight: '900' }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Hyrox type */}
      <Text style={[s.optLabel, { color: HYROX_ORANGE }]}>TYPE D'ENTRAÎNEMENT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {HYROX_TYPES.map(t => (
          <TouchableOpacity key={t} onPress={() => setHyroxType(t)} activeOpacity={0.7}
            style={[s.chip, hyroxType === t && s.chipHybrid]}>
            <Text style={[s.chipTxt, hyroxType === t && { color: HYROX_ORANGE, fontWeight: '900' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Hyrox duration */}
      <Text style={[s.optLabel, { color: HYROX_ORANGE }]}>DURÉE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {HYROX_DURATIONS.map(d => (
          <TouchableOpacity key={d} onPress={() => setHyroxDur(d)} activeOpacity={0.7}
            style={[s.chip, hyroxDur === d && s.chipHybrid]}>
            <Clock color={hyroxDur === d ? HYROX_ORANGE : Colors.textMuted} size={12} />
            <Text style={[s.chipTxt, hyroxDur === d && { color: HYROX_ORANGE, fontWeight: '900' }]}>{d} min</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Hyrox equipment */}
      <Text style={[s.optLabel, { color: HYROX_ORANGE }]}>ÉQUIPEMENT</Text>
      <View style={s.eqGrid}>
        {HYROX_EQ_LIST.map(e => (
          <TouchableOpacity key={e.key} onPress={() => toggleHyroxEq(e.key)} activeOpacity={0.7}
            style={[s.eqChip, hyroxEquip.includes(e.key) && s.eqChipHybrid]}>
            <Text style={[s.eqTxt, hyroxEquip.includes(e.key) && { color: HYROX_ORANGE, fontWeight: '900' }]}>{e.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      </>)}

      {/* Generate button */}
      <TouchableOpacity onPress={handleGenerate} activeOpacity={0.85} disabled={loading}
        style={[s.genBtn, { backgroundColor: accent }]}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><Sparkles color="#fff" size={18} /><Text style={s.genBtnTxt}>GÉNÉRER MON WOD</Text></>
        )}
      </TouchableOpacity>

      {/* Hyrox Result */}
      {hyroxWod && (
        <View style={[s.resultCard, { borderColor: `${HYROX_ORANGE}40` }]}>
          <View style={s.resultTop}>
            <View style={s.badges}>
              <View style={[s.badge, { backgroundColor: `${HYROX_ORANGE}25` }]}>
                <Text style={[s.badgeTxt, { color: HYROX_ORANGE }]}>HYBRID</Text>
              </View>
              <View style={[s.badge, { backgroundColor: `${HYROX_ORANGE}15` }]}>
                <Text style={[s.badgeTxt, { color: HYROX_ORANGE }]}>{hyroxWod.level}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: Colors.surface }]}>
                <Clock color={Colors.textMuted} size={11} />
                <Text style={[s.badgeTxt, { color: Colors.textMuted }]}>{hyroxWod.duration} min</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleGenerate} activeOpacity={0.7}>
              <RefreshCw color={HYROX_ORANGE} size={18} />
            </TouchableOpacity>
          </View>
          <Text style={s.wodName}>{hyroxWod.name}</Text>
          <View style={[s.badge, { backgroundColor: `${HYROX_ORANGE}15`, alignSelf: 'flex-start' }]}>
            <Text style={[s.badgeTxt, { color: HYROX_ORANGE }]}>{hyroxWod.format} · {hyroxWod.type}</Text>
          </View>
          <View style={s.movBox}>
            {hyroxWod.stations.map((st, i) => (
              <View key={i} style={s.stationRow}>
                <View style={[s.stationDot, { backgroundColor: HYROX_ORANGE }]} />
                <Text style={s.movLine}>{st}</Text>
              </View>
            ))}
          </View>
          <View style={s.scoringRow}>
            <Zap color={HYROX_ORANGE} size={14} />
            <Text style={[s.scoringTxt, { color: HYROX_ORANGE }]}>{hyroxWod.scoring}</Text>
          </View>
          <View style={[s.coachBox, { backgroundColor: `${HYROX_ORANGE}12` }]}>
            <Text style={[s.coachLabel, { color: HYROX_ORANGE }]}>💡 Coach</Text>
            <Text style={s.coachTxt}>{hyroxWod.coach}</Text>
          </View>
          <TouchableOpacity style={[s.startBtn, { backgroundColor: HYROX_ORANGE }]} activeOpacity={0.85}
            onPress={() => navigation.navigate('Timer')}>
            <Zap color="#fff" size={16} />
            <Text style={s.startBtnTxt}>LANCER CET ENTRAÎNEMENT</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Functional Result */}
      {wod && (
        <View style={s.resultCard}>
          <View style={s.resultTop}>
            <View style={s.badges}>
              <View style={[s.badge, { backgroundColor: `${Colors.primary}20` }]}>
                <Text style={[s.badgeTxt, { color: Colors.primary }]}>{wod.type}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: `${LevelColors[wod.level]}20` }]}>
                <Text style={[s.badgeTxt, { color: LevelColors[wod.level] }]}>{LEVELS.find(l => l.key === wod.level)?.label}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: Colors.surface }]}>
                <Clock color={Colors.textMuted} size={11} />
                <Text style={[s.badgeTxt, { color: Colors.textMuted }]}>{wod.duration} min</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleGenerate} activeOpacity={0.7}>
              <RefreshCw color={Colors.primary} size={18} />
            </TouchableOpacity>
          </View>

          <Text style={s.wodName}>{wod.name}</Text>

          <View style={s.movBox}>
            {wod.movements.split('\n').map((line, i) => (
              <Text key={i} style={line.startsWith('  ') ? s.movLine : s.movHeader}>{line}</Text>
            ))}
          </View>

          <View style={s.scoringRow}>
            <Zap color={Colors.gold} size={14} />
            <Text style={s.scoringTxt}>{wod.scoring}</Text>
          </View>

          <View style={s.coachBox}>
            <Text style={s.coachLabel}>💡 Coach</Text>
            <Text style={s.coachTxt}>{wod.coach}</Text>
          </View>

          {wod.teamNote ? (
            <View style={s.teamBox}>
              <Users color={Colors.primary} size={13} />
              <Text style={s.teamTxt}>{wod.teamNote}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.startBtn} activeOpacity={0.85}
            onPress={() => navigation.navigate('Timer')}>
            <Zap color="#fff" size={16} />
            <Text style={s.startBtnTxt}>LANCER CE WOD</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitleTxt: { fontSize: 16, fontWeight: '900', color: Colors.text },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  wrapper: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: Colors.text, letterSpacing: -0.2 },
  optLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 6 },
  chipScroll: { marginHorizontal: -16 },
  chipRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 14, flexWrap: 'wrap' },
  chipScrollContent: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  chipSel: { backgroundColor: `${Colors.primary}15`, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTxtSel: { color: Colors.primary, fontWeight: '900' },
  eqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  eqChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  eqChipSel: { backgroundColor: `${Colors.primary}15`, borderColor: Colors.primary },
  eqTxt: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  eqTxtSel: { color: Colors.primary, fontWeight: '900' },
  sportRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sportCard: {
    flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 3,
    backgroundColor: Colors.card, borderWidth: 2, borderColor: Colors.border,
  },
  sportCardActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  sportCardHybrid: { borderColor: HYROX_ORANGE, backgroundColor: `${HYROX_ORANGE}10` },
  sportEmoji: { fontSize: 24, marginBottom: 2 },
  sportLabel: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textAlign: 'center', lineHeight: 17 },
  sportDot: { width: 7, height: 7, borderRadius: 4, marginTop: 3 },
  chipHybrid: { backgroundColor: `${HYROX_ORANGE}15`, borderColor: HYROX_ORANGE },
  eqChipHybrid: { backgroundColor: `${HYROX_ORANGE}15`, borderColor: HYROX_ORANGE },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stationDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  genBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, padding: 16, marginBottom: 4,
  },
  genBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  resultCard: {
    marginTop: 14, backgroundColor: Colors.card, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  wodName: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: -0.3 },
  movBox: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, gap: 3 },
  movHeader: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  movLine: { fontSize: 13, fontWeight: '600', color: Colors.text },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoringTxt: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, flex: 1 },
  coachBox: { backgroundColor: `${Colors.gold}12`, borderRadius: 10, padding: 10, gap: 4 },
  coachLabel: { fontSize: 11, fontWeight: '800', color: Colors.gold },
  coachTxt: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  teamBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: `${Colors.primary}10`, borderRadius: 8, padding: 8 },
  teamTxt: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, padding: 14,
  },
  startBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
