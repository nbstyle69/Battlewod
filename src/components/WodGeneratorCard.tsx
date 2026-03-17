import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Sparkles, RefreshCw, Zap, Clock, Users, User, ArrowLeft, Bookmark, Heart, Check, X, History } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, LevelColors } from '../theme/colors';
import { useTheme, AppTheme } from '../context/ThemeContext';
import { HomeStackParamList } from '../navigation';
import { AthleteLevel } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const HYROX_ORANGE = '#F97316';
type Sport = 'functional' | 'hybrid';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeList'>;
type WODType = 'For Time' | 'AMRAP' | 'EMOM' | 'Tabata' | 'Max Reps' | 'Chipper' | 'Ladder' | 'Couplet' | 'Death By';
const UI_WOD_TYPES: WODType[] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];
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
const HYROX_TYPES  = ['Race Simulation', 'Station Training', 'Cardio Force'];
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

  // ── Charges / volumes par catégorie ──
  const sp_kg  = ['60','80','102'][li];
  const sl_kg  = ['40','60','80'][li];
  const wb_rep = [75, 100, 100][li];
  const wb_kg  = ['6','9','9'][li];
  const fc_kg  = ['16','24','32'][li];
  const sb_kg  = ['10','20','20'][li];
  const db_kg  = ['12.5','15','22.5'][li];
  const ski_d  = ['800m','1000m','1000m'][li];
  const row_d  = ['800m','1000m','1000m'][li];
  const r1k    = trd ? '1 km Tapis' : '1 km Run';
  const r800   = trd ? '800m Tapis' : '800m Run';
  const r400   = trd ? '400m Tapis' : '400m Run';

  // ── Stations disponibles (équipement strict + fallback bodyweight) ──
  const S = {
    ski:  ski  ? `${ski_d} SkiErg`                                  : row ? `${row_d} RowErg`              : `${ski_d} Run`,
    row:  row  ? `${row_d} RowErg`                                  : ski ? `${ski_d} SkiErg`              : `${row_d} Run`,
    slp:  slp  ? `50m Sled Push (${sp_kg} kg)`                     : bbj ? `${[15,20,25][li]} Burpee Broad Jump` : `${[20,30,40][li]} Burpees`,
    slpu: slpu ? `50m Sled Pull (${sl_kg} kg)`                     : fc  ? `${[150,200,200][li]}m Farmers Carry (${fc_kg} kg×2)` : `${[15,20,25][li]} Burpees`,
    sbl:  sbl  ? `${[50,75,100][li]}m Sandbag Lunges (${sb_kg} kg)`: fc  ? `${[100,150,200][li]}m Farmers Carry (${fc_kg} kg×2)` : `${[40,60,80][li]} Walking Lunges`,
    wb:   wb   ? `${wb_rep} Wall Balls (${wb_kg} kg)`              : `${[60,80,100][li]} Air Squats`,
    fc:   fc   ? `${[200,200,200][li]}m Farmers Carry (${fc_kg} kg×2)` : sbl ? `${[50,75,100][li]}m Sandbag Lunges (${sb_kg} kg)` : `${[40,60,80][li]} Goblet Squats`,
    bbj:  bbj  ? `${[15,20,25][li]} Burpee Broad Jump`             : `${[15,20,30][li]} Burpees`,
    db:   db   ? `${[12,15,20][li]} DB Thrusters (${db_kg} kg/main)` : `${[15,20,25][li]} Thrusters PVC`,
  };

  // ── Pools cardio / force ──
  const cardioPool = [S.ski, S.row, r800, r400, `${['250m','300m','400m'][li]} SkiErg`].filter(Boolean);
  const forcePool  = [S.slp, S.slpu, S.wb, S.sbl, S.fc, S.bbj, S.db];
  const allStations = [S.slp, S.slpu, S.sbl, S.wb, S.fc, S.bbj, S.db];

  // ── Anti-doublons : aucune station identique consécutive ──
  function noConsecutive(arr: string[]): string[] {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1]) {
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j] !== arr[i]) { [arr[i], arr[j]] = [arr[j], arr[i]]; break; }
        }
      }
    }
    return arr;
  }

  // ── Run distance par catégorie ──
  function runForLevel(): string {
    if (li === 0) return rand([r400, r800]);     // Open
    if (li === 1) return rand([r800, r1k]);      // Pro
    return r1k;                                   // Elite
  }

  const name  = rand(HYROX_NAMES[type] ?? HYROX_NAMES['Race Simulation']);
  const coach = rand(HYROX_COACHES[type] ?? HYROX_COACHES['Race Simulation']);
  let stations: string[] = [];
  let scoring  = '';

  // ═══════════════════════════════════════════════════════════════════════
  // 🏁 RACE SIMULATION — alternance Run + Station
  // ═══════════════════════════════════════════════════════════════════════
  if (type === 'Race Simulation') {
    const blocCount = duration <= 20 ? rand([3,4])
                    : duration <= 30 ? rand([4,5])
                    : duration <= 45 ? rand([6,7])
                    : 8;
    const picked = pick(allStations, Math.min(blocCount, allStations.length));
    // Extend if more blocs needed than unique stations
    while (picked.length < blocCount) picked.push(rand(allStations.filter(s => s !== picked[picked.length - 1])));
    const result: string[] = [];
    for (let i = 0; i < blocCount; i++) {
      result.push(runForLevel());
      result.push(picked[i]);
    }
    stations = noConsecutive(result);
    const timeTarget = level === 'Elite' ? `< ${duration - 5} min` : level === 'Pro' ? `< ${duration} min` : `< ${duration + 5} min`;
    scoring = `For Time — ${blocCount} blocs Run + Station — objectif ${timeTarget}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🎯 STATION TRAINING — circuit sans run continu
  // ═══════════════════════════════════════════════════════════════════════
  else if (type === 'Station Training') {
    if (duration <= 20) {
      // AMRAP Couplet / Triplet
      const n = rand([2, 3]);
      const mvs = pick(allStations, n);
      stations = [`AMRAP ${duration} min :`, ...mvs];
      scoring = `Max rounds + reps en ${duration} min — ${n === 3 ? 'Triplet' : 'Couplet'}`;
    } else if (duration <= 30) {
      // For Time Chipper / Triplet
      const isChipper = Math.random() < 0.5;
      if (isChipper) {
        const mvs = pick([...allStations, S.ski, S.row], Math.min(5, allStations.length + 2));
        stations = ['For Time (Chipper) :', ...mvs];
        scoring = `Chipper — Temps (cap ${duration} min)`;
      } else {
        const rounds = rand([4, 5]);
        const mvs = pick(allStations, 3);
        stations = [`${rounds} Rounds For Time :`, ...mvs];
        scoring = `Triplet — Temps (cap ${duration} min)`;
      }
    } else if (duration <= 45) {
      // EMOM + Chipper combiné
      const emomMins = rand([2, 3]);
      const emomMvs = pick(allStations, emomMins);
      const emomCycles = Math.floor(20 / emomMins);
      const chipperMvs = pick(allStations.filter(s => !emomMvs.includes(s)).concat([S.ski, S.row]), 4);
      stations = [
        `── Partie 1 : E${emomMins}MOM ${emomCycles * emomMins} min ──`,
        ...emomMvs.map((m, i) => `  Min ${i + 1}: ${m}`),
        `── Partie 2 : Chipper For Time (cap ${duration - emomCycles * emomMins} min) ──`,
        ...chipperMvs,
      ];
      scoring = `EMOM ${emomCycles * emomMins} min + Chipper restant`;
    } else {
      // 60 min : Ladder + Chipper
      const ladderMvs = pick(allStations, 2);
      const maxRung = [8, 10, 12][li];
      const chipperMvs = pick(allStations.filter(s => !ladderMvs.includes(s)).concat([S.ski, S.row]), 5);
      stations = [
        `── Partie 1 : Ladder 1→${maxRung} For Time ──`,
        ...ladderMvs,
        `── Partie 2 : Chipper For Time (cap restant) ──`,
        ...chipperMvs,
      ];
      scoring = `Ladder + Chipper — Temps total (cap ${duration} min)`;
    }
    stations = noConsecutive(stations);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 💪 CARDIO FORCE — alternance cardio + force
  // ═══════════════════════════════════════════════════════════════════════
  else {
    const blocCount = duration <= 20 ? 4 : duration <= 30 ? 6 : duration <= 45 ? 8 : 10;
    const nC = Math.ceil(blocCount / 2);
    const nF = Math.floor(blocCount / 2);
    const pC = pick(cardioPool, Math.min(nC, cardioPool.length));
    while (pC.length < nC) pC.push(rand(cardioPool.filter(c => c !== pC[pC.length - 1])));
    const pF = pick(forcePool, Math.min(nF, forcePool.length));
    while (pF.length < nF) pF.push(rand(forcePool.filter(f => f !== pF[pF.length - 1])));
    // Strict alternation: cardio → force → cardio → force
    const combined: string[] = [];
    for (let i = 0; i < Math.max(nC, nF); i++) {
      if (pC[i]) combined.push(pC[i]);
      if (pF[i]) combined.push(pF[i]);
    }
    const useEMOM = duration >= 30 && Math.random() < 0.5;
    if (useEMOM) {
      const mins = combined.length;
      stations = [`EMOM ${mins} min (${Math.floor(duration / mins)} cycles = ${duration} min) :`];
      combined.forEach((m, i) => stations.push(`  Min ${i + 1}: ${m}`));
      scoring = `EMOM ${duration} min — score = cycles complétés`;
    } else {
      const rounds = Math.max(2, Math.floor(duration / (combined.length * 1.5)));
      stations = [`${rounds} Rounds For Time :`].concat(combined);
      scoring = `For Time — ${rounds} rounds (cap ${duration} min)`;
    }
    stations = noConsecutive(stations);
  }

  // ── Format équipe ──
  const fmtStation = (s: string): string => {
    if (s.startsWith('──') || s.startsWith('AMRAP') || s.startsWith('For Time')
        || s.startsWith('EMOM') || /^\d+ Rounds/.test(s) || s.startsWith('  Min')) return s;
    if (format === 'Doubles')      return `${s}  ⟨split ×2 — I go / You go⟩`;
    if (format === 'Relais')       return `${s}  ⟨relais — 1 athlète par station⟩`;
    if (format === 'Mixed Relais') return `${s}  ⟨mixed H/F — charges adaptées⟩`;
    return s;
  };
  stations = stations.map(fmtStation);
  return { name, level, format, type, duration, stations, scoring, coach };
}
const DURATIONS = [5, 10, 15, 20, 30, 40, 60];
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
    { mv: 'Cross Overs', scale: ['—','—','Cross Overs','Cross Overs','Cross Overs','Cross Overs'] },
    { mv: 'Double Cross Overs', scale: ['—','—','—','Double Cross Overs','Double Cross Overs','Double Cross Overs'] },
  ],
  pb: [
    { mv: 'Pull-ups', scale: ['Ring Rows','Australian PU','Pull-ups','C2B','C2B stricts','Bar MU'] },
    { mv: 'Toes to Bar', scale: ['K2E','K2C','T2B','T2B','T2B','T2B'] },
    { mv: 'Knees to Elbows', scale: ['K2E','K2E','K2E','T2B','T2B','T2B'] },
    { mv: 'HSPU', scale: ['Pike PU','HSPU modif','HSPU Stricts','Wall Facing HSPU','Wall Facing HSPU','Wall Facing HSPU'] },
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
    { mv: 'Pistol Squats', scale: ['assistés','assistés','Pistols','Pistols','Pistols','Pistols'] },
    { mv: 'HSPU Stricts', scale: ['—','—','HSPU Stricts','HSPU Stricts','HSPU Stricts','HSPU Stricts'] },
    { mv: 'Wall Facing HSPU', scale: ['—','—','—','Wall Facing HSPU','Wall Facing HSPU','Wall Facing HSPU'] },
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
const NAMES_CH = ['The Chipper','Brick Wall','Top to Bottom','The Grinder','Full List','Death March','The Stack','Wall of Pain','Checklist','Chip Away','Iron List','Layer by Layer','The Descent','Box Crusher','One Pass'];
const NAMES_LD = ['The Ladder','Stairway','Ascending','Pyramid Peak','The Climb','Escalation','Rising Storm','Step Up','Ascent','One More','Ground Floor','The Pyramid','Step by Step','Upward','Base Camp'];
const NAMES_CP = ['Double Trouble','Power Pair','Triple Threat','The Duo','Tag Team','Iron Pair','Force Duo','Twin Engine','Three Pillars','The Triplet','Couplet Classic','The Double','The Triple','Two for One','Pair Work'];
const NAMES_DB = ['Death By','The Reaper','Last Man','Minute Killer','Final Countdown','No Ceiling','The Abyss','Into the Deep','The Void','One More Rep','Never Enough','Death Toll','Unlimited','The Grind','One by One'];

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
  if (mv.mv === 'Pistol Squats') return s === 'Pistols' ? 'Pistol Squats' : `Pistol Squats (${s})`;
  if (mv.mv === 'Wall Walks') return s === 'Wall Walks' ? 'Wall Walks' : `Wall Walks (${s})`;
  if (mv.mv === 'Double Unders') return s.startsWith('×') ? 'Single Unders' : (s === 'DU' || s.startsWith('DU') ? 'Double Unders' : s);
  if (mv.mv === 'Single Unders') return 'Single Unders';
  if (/^×\d/.test(s)) return mv.mv;
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
  if (mv.mv === 'Pistol Squats') return `${reps} ${s === 'Pistols' ? 'Pistol Squats' : `Pistol Squats (${s})`}`;
  if (mv.mv === 'Wall Walks') return `${reps} ${s === 'Wall Walks' ? 'Wall Walks' : `Wall Walks (${s})`}`;
  // Double/Single Unders
  if (mv.mv === 'Double Unders') {
    if (s === 'DU' || s.startsWith('DU')) return `${reps} Double Unders`;
    if (s.startsWith('×')) return `${reps * parseInt(s.slice(1))} Single Unders`;
    return `${reps} ${s}`;
  }
  if (mv.mv === 'Single Unders') return `${reps} Single Unders`;
  // ×N multiplier: use movement name, apply multiplier to reps
  if (/^×\d/.test(s)) { const f = parseFloat(s.slice(1)); return `${isNaN(f) ? reps : Math.round(reps * f)} ${mv.mv}`; }
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
  const circuit: CircuitType = rand(CIRCUIT_MAP[type] ?? CIRCUIT_MAP['AMRAP']);

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 2 — Anti-doublons consécutifs
  // ═══════════════════════════════════════════════════════════════════════
  // getMovesForced() ne pick jamais le même mouvement 2 fois → pas de
  // doublons adjacents dans un round. Pour les formats en boucle (rounds),
  // on s'assure aussi que le dernier mouvement ≠ le premier.
  function ensureNoWrap(mvs: Array<{ mv: string; scale: string[] }>): Array<{ mv: string; scale: string[] }> {
    if (mvs.length < 3) return mvs;
    if (mvs[0].mv === mvs[mvs.length - 1].mv) {
      // Swap last with second-to-last if different
      if (mvs.length > 2 && mvs[mvs.length - 2].mv !== mvs[0].mv) {
        const tmp = mvs[mvs.length - 1];
        mvs[mvs.length - 1] = mvs[mvs.length - 2];
        mvs[mvs.length - 2] = tmp;
      }
    }
    return mvs;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 3 — Calibration durée (mouvements & rounds)
  // ═══════════════════════════════════════════════════════════════════════
  function mvCountCal(base: number): number {
    if (duration <= 5)  return Math.max(2, base - 2);
    if (duration <= 10) return Math.max(3, base - 1);
    if (duration <= 15) return base;
    if (duration <= 20) return base + 1;
    if (duration <= 30) return base + 1;
    return base + 2;
  }
  function roundsCal(): number {
    if (duration <= 5)  return 3;
    if (duration <= 10) return 4;
    if (duration <= 15) return 5;
    if (duration <= 20) return 6;
    if (duration <= 30) return 7;
    return 8;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 4 — Adaptation niveau (charges, reps, complexité)
  //   → déjà appliquée via scaleReps(), getMovesForced() filtre par level
  // RÈGLE 5 — Équipement strict
  //   → getMovesForced() n'utilise QUE les clés eq sélectionnées
  //   → si eqKeys vide ou ['bw'], seuls les mouvements bodyweight/wall
  // ═══════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════
  // RÈGLE 6 — Charge uniforme par catégorie de matériel
  //   → bb, db, kb : même charge (la plus basse) pour tous les mouvements
  //     d'une même catégorie dans un même WOD.
  // ═══════════════════════════════════════════════════════════════════════
  const _eqLookup = new Map<object, string>();
  for (const [k, ms] of Object.entries(MOVES)) for (const m of ms) _eqLookup.set(m, k);

  function unifyLoads(origMvs: Array<{ mv: string; scale: string[] }>): Array<{ mv: string; scale: string[] }> {
    const cloned = origMvs.map(m => ({ mv: m.mv, scale: [...m.scale] }));
    if (cloned.length < 2) return cloned;
    const groups = new Map<string, number[]>();
    for (let i = 0; i < origMvs.length; i++) {
      const key = _eqLookup.get(origMvs[i]);
      if (!key || !['bb', 'db', 'kb'].includes(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    }
    for (const [, indices] of groups) {
      if (indices.length < 2) continue;
      const weighted = indices.filter(i => /^\d/.test(cloned[i].scale[li]) && cloned[i].scale[li].includes('/'));
      if (weighted.length < 2) continue;
      let minIdx = weighted[0], minVal = parseFloat(cloned[minIdx].scale[li]);
      for (const idx of weighted) {
        const v = parseFloat(cloned[idx].scale[li]);
        if (v < minVal) { minVal = v; minIdx = idx; }
      }
      const unified = cloned[minIdx].scale[li];
      for (const idx of weighted) cloned[idx].scale[li] = unified;
    }
    return cloned;
  }

  function pickMvs(count: number): Array<{ mv: string; scale: string[] }> {
    return unifyLoads(getMovesForced(eqKeys, li, count));
  }

  let name = '', movements = '', scoring = '', coach = '', teamNote = '';

  // ── FOR TIME ──────────────────────────────────────────────────────────
  if (type === 'For Time') {
    if (circuit === 'round') {
      name = rand(NAMES_FT);
      const rounds = roundsCal();
      const mvs = ensureNoWrap(pickMvs(mvCountCal(3)));
      movements = `${rounds} Rounds For Time :\n` + mvs.map(m => `  ${fmt(m, scaleReps(12, li), li)}`).join('\n');
      scoring = `Temps le plus court (cap ${duration} min)`;
      coach = 'Gère ton effort : les 2 premiers rounds doivent sembler faciles.';
    } else if (circuit === 'chipper') {
      name = rand(NAMES_CH);
      const mvCount = mvCountCal(5);
      const mvs = pickMvs(mvCount);
      const chipReps = [50, 40, 30, 25, 20, 15, 10];
      movements = `Chipper For Time :\n` + mvs.map((m, i) => `  ${fmt(m, scaleReps(chipReps[i] ?? 10, li), li)}`).join('\n');
      scoring = `Temps le plus court (cap ${duration} min) — 1 passage`;
      coach = 'Du haut vers le bas. Fractionne les gros sets. Jamais plus de 10s d\'arrêt.';
    } else if (circuit === 'couplet' || circuit === 'triplet') {
      name = rand(NAMES_CP);
      const n = circuit === 'triplet' ? 3 : 2;
      const mvs = pickMvs(n);
      const rounds = roundsCal();
      movements = `${rounds} Rounds For Time :\n` + mvs.map(m => `  ${fmt(m, scaleReps(15, li), li)}`).join('\n');
      scoring = `Temps le plus court (cap ${duration} min) — ${circuit === 'triplet' ? 'Triplet' : 'Couplet'}`;
      coach = circuit === 'triplet'
        ? 'Triplet rythmé. Pas de repos entre les 3 mouvements.'
        : '2 mouvements. Transitions immédiates. Pousse le rythme.';
    } else if (circuit === 'ladder') {
      name = rand(NAMES_LD);
      const isPyramid = Math.random() < 0.5;
      const maxRung = duration <= 5 ? 7 : duration <= 10 ? 10 : duration <= 20 ? 12 : 15;
      const top = Math.floor(maxRung / 2);
      const mvs = pickMvs(rand([1, 2]));
      if (isPyramid) {
        movements = `Pyramide For Time (1→${top}→1) :\n` + mvs.map(m => `  ${fmtName(m, li)}`).join('\n');
        scoring = `Temps le plus court (cap ${duration} min) — pyramide 1→${top}→1`;
        coach = 'Le sommet est le moment critique. Pace-toi sur la montée.';
      } else {
        movements = `Ladder For Time (1→${maxRung}) :\n` + mvs.map(m => `  ${fmtName(m, li)}`).join('\n');
        scoring = `Temps le plus court (cap ${duration} min) — ladder 1→${maxRung}`;
        coach = 'Facile au départ. Chaque round coûte plus cher.';
      }
    }
    teamNote = isTeam ? `Équipe de ${teamN} : alternance par round.` : '';
  }

  // ── AMRAP ─────────────────────────────────────────────────────────────
  else if (type === 'AMRAP') {
    if (circuit === 'round') {
      name = rand(NAMES_AM);
      const mvs = ensureNoWrap(pickMvs(mvCountCal(3)));
      const baseReps = [10, 15, 12, 20, 8, 15];
      movements = `AMRAP ${duration} min :\n` + mvs.map((m, i) => `  ${fmt(m, scaleReps(baseReps[i] ?? 12, li), li)}`).join('\n');
      scoring = `Max rounds + reps en ${duration} min`;
      coach = 'Trouve UN rythme et tiens-le. Évite le sprint initial.';
    } else if (circuit === 'couplet' || circuit === 'triplet') {
      name = rand([...NAMES_AM, ...NAMES_CP]);
      const n = circuit === 'triplet' ? 3 : 2;
      const mvs = pickMvs(n);
      movements = `AMRAP ${duration} min :\n` + mvs.map(m => `  ${fmt(m, scaleReps(15, li), li)}`).join('\n');
      scoring = `Max rounds + reps en ${duration} min — ${circuit === 'triplet' ? 'Triplet' : 'Couplet'}`;
      coach = circuit === 'triplet'
        ? '3 mouvements en boucle. Rythme constant, transitions rapides.'
        : '2 mouvements. Transitions immédiates, rythme constant.';
    } else if (circuit === 'chipper') {
      name = rand([...NAMES_AM, ...NAMES_CH]);
      const mvCount = mvCountCal(5);
      const mvs = pickMvs(mvCount);
      const chipReps = [40, 30, 25, 20, 15, 12, 10];
      movements = `AMRAP ${duration} min (Chipper) :\n` + mvs.map((m, i) => `  ${fmt(m, scaleReps(chipReps[i] ?? 10, li), li)}`).join('\n');
      scoring = `Max rounds + reps en ${duration} min — Chipper style`;
      coach = 'Enchaîne sans pause. Chaque passage complet = 1 round.';
    }
    teamNote = isTeam ? `Équipe de ${teamN} : score commun. Alternance par round.` : '';
  }

  // ── EMOM ──────────────────────────────────────────────────────────────
  else if (type === 'EMOM') {
    if (circuit === 'death_by') {
      name = rand(NAMES_DB);
      const excludeErg = ['Cal Rameur','Cal Ski Erg','Cal Assault Bike','m Rameur',
        'DB Farmer Carry (m)','KB Farmer Carry (m)','Bear Crawl (m)','Shuttle Run (×7.62m)'];
      const deathPool = getMoves(eqKeys, li).filter((m: any) => !excludeErg.includes(m.mv));
      const m = rand(deathPool.length > 0 ? deathPool : getMoves(eqKeys, li));
      const moveName = fmtName(m, li);
      const lines: string[] = [`Death By ${moveName} :`];
      for (let i = 1; i <= 6; i++) lines.push(`  Min ${i} : ${i} ${moveName}`);
      lines.push(`  ... (continue jusqu'à l'échec)`);
      movements = lines.join('\n');
      scoring = `Score = dernière minute complétée`;
      coach = 'Les premières minutes semblent faciles. C\'est un piège. Gère ta respiration.';
    } else {
      name = rand(NAMES_EM);
      const n = circuit === 'triplet' ? 3 : 2;
      const mvs = pickMvs(n);
      const lines: string[] = [];
      for (let i = 0; i < n; i++) {
        lines.push(`  Min ${i+1}: ${fmt(mvs[i], scaleReps(10, li), li)}`);
      }
      const cycles = Math.round(duration / n);
      lines.push(`  → Répéter le cycle (${cycles} fois = ${duration} min)`);
      movements = `E${n}MOM ${duration} min :\n` + lines.join('\n');
      scoring = `Score = rounds complétés sur ${duration} min`;
      coach = 'Finis chaque minute avec au moins 15s de repos. Régularité.';
    }
    teamNote = isTeam ? `Équipe de ${teamN} : A fait min impaires, B min paires${teamN > 2 ? ', C min 3,6,9...' : ''}.` : '';
  }

  // ── TABATA ────────────────────────────────────────────────────────────
  else if (type === 'Tabata') {
    name = rand(NAMES_TB);
    if (circuit === 'double_couplet') {
      const count = Math.max(2, Math.floor(duration / 4));
      const mvs = pickMvs(count);
      movements = `Tabata ${duration} min (${count} mouv.) :\n` + mvs.map(m => `  8×20s ${fmtName(m, li)} / 10s repos`).join('\n');
      scoring = 'Score = min de reps sur un round (par mouvement)';
      coach = 'Maintiens le même nombre de reps à chaque round des 8.';
    } else {
      const mvs = pickMvs(2);
      const tabCycles = Math.max(1, Math.floor(duration / 4));
      movements = `Tabata ${duration} min :\n` + mvs.map(m => `  8×20s ${fmtName(m, li)} / 10s repos`).join('\n');
      if (tabCycles > 1) movements += `\n  → ${tabCycles} cycles`;
      scoring = 'Score = total de reps sur tous les rounds';
      coach = 'Chaque round de 20s à 100%. Le repos de 10s est sacré.';
    }
    teamNote = isTeam ? `Équipe de ${teamN} : score collectif = somme des reps.` : '';
  }

  // ── MAX REPS ──────────────────────────────────────────────────────────
  else {
    name = rand(NAMES_MR);
    const count = rand([1, 2]);
    const pool = getMoves(eqKeys, li);
    if (count === 1) {
      const m = rand(pool);
      movements = `Max reps en ${duration} min :\n  ${fmtName(m, li)}`;
    } else {
      const mvs = unifyLoads(pick(pool, 2));
      movements = `Max reps en ${duration} min :\n` + mvs.map(m => `  ${fmtName(m, li)}`).join('\n');
    }
    scoring = `Score = total de reps (repos 15s max entre sets)`;
    coach = 'Sets réguliers. Repos jamais > 20s. Pousse jusqu\'au bout.';
    teamNote = isTeam ? `Équipe de ${teamN} : score = somme des reps. Alternance 30s.` : '';
  }

  return { name, type, duration, level, movements, scoring, coach, teamNote: isTeam ? teamNote : undefined };
}

export default function WodGeneratorCard({ navigation: navProp }: { navigation?: Nav }) {
  const navHook = useNavigation<Nav>();
  const navigation = navProp ?? navHook;
  const { theme } = useTheme();
  const s = createStyles(theme);

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
  const { user } = useAuth();

  // Save & Score state
  const [savedWodId,   setSavedWodId]   = useState<string | null>(null);
  const [isFavorite,   setIsFavorite]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [scoreModal,   setScoreModal]   = useState(false);
  const [scoreType,    setScoreType]    = useState<'time' | 'reps' | 'rounds' | 'weight'>('time');
  const [scoreInput,   setScoreInput]   = useState('');
  const [scoreRx,      setScoreRx]      = useState(true);
  const [scoreNotes,   setScoreNotes]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  async function saveWod(currentWod: GeneratedWOD | null, currentHyrox: HyroxWOD | null) {
    if (!user || (!currentWod && !currentHyrox)) return;
    setSaving(true);
    const isFn = !!currentWod;
    const payload = {
      user_id: user.id,
      sport: isFn ? 'functional' : 'hybrid',
      wod_name: isFn ? currentWod!.name : currentHyrox!.name,
      wod_type: isFn ? currentWod!.type : currentHyrox!.type,
      duration: isFn ? currentWod!.duration : currentHyrox!.duration,
      level: isFn ? currentWod!.level : currentHyrox!.level,
      format: isFn ? format : hyroxFormat,
      movements: isFn ? currentWod!.movements : currentHyrox!.stations.join('\n'),
      scoring: isFn ? currentWod!.scoring : currentHyrox!.scoring,
      coach_tip: isFn ? currentWod!.coach : currentHyrox!.coach,
      team_note: isFn ? currentWod!.teamNote : null,
      equipment: isFn ? equipment : hyroxEquip,
      is_benchmark: isFn && equipment.includes('bm'),
    };
    const { data, error } = await supabase.from('generated_wods').insert(payload).select('id').single();
    setSaving(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setSavedWodId(data.id);
    Alert.alert('✅ WOD sauvegardé', 'Retrouve-le dans ton historique.');
  }

  async function toggleFavorite() {
    if (!savedWodId) return;
    const newVal = !isFavorite;
    setIsFavorite(newVal);
    await supabase.from('generated_wods').update({ is_favorite: newVal }).eq('id', savedWodId);
  }

  async function submitScore() {
    if (!savedWodId || !user) return;
    let value = 0;
    if (scoreType === 'time') {
      const parts = scoreInput.split(':');
      if (parts.length === 2) value = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      else value = parseInt(scoreInput);
    } else {
      value = parseFloat(scoreInput);
    }
    if (isNaN(value) || value <= 0) { Alert.alert('Score invalide'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('generated_wod_scores').insert({
      wod_id: savedWodId,
      user_id: user.id,
      score_type: scoreType,
      score_value: value,
      rx: scoreRx,
      notes: scoreNotes.trim() || null,
    });
    setSubmitting(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setScoreModal(false);
    setScoreInput('');
    setScoreNotes('');
    Alert.alert('✅ Score enregistré !', 'Tu peux suivre ta progression dans l\'historique.');
  }

  function openScoreModal(currentWod: GeneratedWOD | null) {
    if (!currentWod) { setScoreType('time'); }
    else if (currentWod.type === 'For Time') { setScoreType('time'); }
    else if (currentWod.type === 'AMRAP') { setScoreType('reps'); }
    else if (currentWod.type === 'EMOM') { setScoreType('rounds'); }
    else if (currentWod.type === 'Max Reps') { setScoreType('reps'); }
    else if (currentWod.type === 'Chipper') { setScoreType('time'); }
    else if (currentWod.type === 'Ladder') { setScoreType('rounds'); }
    else if (currentWod.type === 'Couplet') { setScoreType('time'); }
    else if (currentWod.type === 'Death By') { setScoreType('rounds'); }
    else { setScoreType('time'); }
    setScoreModal(true);
  }

  const accent = sport === 'hybrid' ? HYROX_ORANGE : theme.accent;

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
    setSavedWodId(null);
    setIsFavorite(false);
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
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <Sparkles color={theme.accent} size={16} />
          <Text style={s.headerTitleTxt}>Générateur de WOD</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('WodHistory')} style={s.backBtn} activeOpacity={0.7}>
          <History color={theme.accent} size={20} />
        </TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.wrapper}>

      {/* Quick access: Historique & Favoris */}
      <View style={s.quickAccessRow}>
        <TouchableOpacity style={s.quickAccessBtn} onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.8}>
          <History color={theme.text} size={16} />
          <Text style={s.quickAccessTxt}>Historique</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickAccessBtn} onPress={() => navigation.navigate('WodHistory')} activeOpacity={0.8}>
          <Heart color="#EF4444" size={16} />
          <Text style={s.quickAccessTxt}>Favoris</Text>
        </TouchableOpacity>
      </View>

      {/* Sport selector */}
      <View style={s.sportRow}>
        <TouchableOpacity
          style={[s.sportCard, sport === 'functional' && s.sportCardActive]}
          onPress={() => setSport('functional')} activeOpacity={0.8}
        >
          <Text style={s.sportEmoji}>🏋️</Text>
          <Text style={[s.sportLabel, sport === 'functional' && { color: theme.accent }]}>{"Functional\nFitness"}</Text>
          {sport === 'functional' && <View style={[s.sportDot, { backgroundColor: theme.accent }]} />}
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
            {f === 'Solo' ? <User color={format === f ? theme.accent : theme.textMuted} size={13} /> : <Users color={format === f ? theme.accent : theme.textMuted} size={13} />}
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
            <Clock color={duration === d ? theme.accent : theme.textMuted} size={12} />
            <Text style={[s.chipTxt, duration === d && s.chipTxtSel]}>{d} min</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Type */}
      <Text style={s.optLabel}>TYPE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipScrollContent}>
        {UI_WOD_TYPES.map(t => (
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
            <Clock color={hyroxDur === d ? HYROX_ORANGE : theme.textMuted} size={12} />
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
              <View style={[s.badge, { backgroundColor: theme.surface }]}>
                <Clock color={theme.textMuted} size={11} />
                <Text style={[s.badgeTxt, { color: theme.textMuted }]}>{hyroxWod.duration} min</Text>
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
          {/* Save / Fav / Score actions */}
          <View style={s.actionRow}>
            {!savedWodId ? (
              <TouchableOpacity style={[s.actionBtn, { borderColor: HYROX_ORANGE }]} onPress={() => saveWod(null, hyroxWod)} disabled={saving} activeOpacity={0.7}>
                {saving ? <ActivityIndicator size="small" color={HYROX_ORANGE} /> : <><Bookmark color={HYROX_ORANGE} size={14} /><Text style={[s.actionBtnTxt, { color: HYROX_ORANGE }]}>Sauvegarder</Text></>}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={[s.actionBtn, { borderColor: HYROX_ORANGE, backgroundColor: `${HYROX_ORANGE}15` }]} onPress={toggleFavorite} activeOpacity={0.7}>
                  <Heart color={HYROX_ORANGE} size={14} fill={isFavorite ? HYROX_ORANGE : 'transparent'} />
                  <Text style={[s.actionBtnTxt, { color: HYROX_ORANGE }]}>{isFavorite ? 'Favori' : 'Favori'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, { borderColor: HYROX_ORANGE }]} onPress={() => openScoreModal(null)} activeOpacity={0.7}>
                  <Check color={HYROX_ORANGE} size={14} />
                  <Text style={[s.actionBtnTxt, { color: HYROX_ORANGE }]}>Entrer score</Text>
                </TouchableOpacity>
              </>
            )}
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
              <View style={[s.badge, { backgroundColor: `${theme.accent}20` }]}>
                <Text style={[s.badgeTxt, { color: theme.accent }]}>{wod.type}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: `${LevelColors[wod.level]}20` }]}>
                <Text style={[s.badgeTxt, { color: LevelColors[wod.level] }]}>{LEVELS.find(l => l.key === wod.level)?.label}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: theme.surface }]}>
                <Clock color={theme.textMuted} size={11} />
                <Text style={[s.badgeTxt, { color: theme.textMuted }]}>{wod.duration} min</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleGenerate} activeOpacity={0.7}>
              <RefreshCw color={theme.accent} size={18} />
            </TouchableOpacity>
          </View>

          <Text style={s.wodName}>{wod.name}</Text>

          <View style={s.movBox}>
            {wod.movements.split('\n').map((line, i) => (
              <Text key={i} style={line.startsWith('  ') ? s.movLine : s.movHeader}>{line}</Text>
            ))}
          </View>

          <View style={s.scoringRow}>
            <Zap color={theme.gold} size={14} />
            <Text style={s.scoringTxt}>{wod.scoring}</Text>
          </View>

          <View style={s.coachBox}>
            <Text style={s.coachLabel}>💡 Coach</Text>
            <Text style={s.coachTxt}>{wod.coach}</Text>
          </View>

          {wod.teamNote ? (
            <View style={s.teamBox}>
              <Users color={theme.accent} size={13} />
              <Text style={s.teamTxt}>{wod.teamNote}</Text>
            </View>
          ) : null}

          {/* Save / Fav / Score actions */}
          <View style={s.actionRow}>
            {!savedWodId ? (
              <TouchableOpacity style={s.actionBtn} onPress={() => saveWod(wod, null)} disabled={saving} activeOpacity={0.7}>
                {saving ? <ActivityIndicator size="small" color={theme.accent} /> : <><Bookmark color={theme.accent} size={14} /><Text style={s.actionBtnTxt}>Sauvegarder</Text></>}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={[s.actionBtn, savedWodId && { backgroundColor: `${theme.accent}10` }]} onPress={toggleFavorite} activeOpacity={0.7}>
                  <Heart color={theme.accent} size={14} fill={isFavorite ? theme.accent : 'transparent'} />
                  <Text style={s.actionBtnTxt}>Favori</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => openScoreModal(wod)} activeOpacity={0.7}>
                  <Check color={theme.accent} size={14} />
                  <Text style={s.actionBtnTxt}>Entrer score</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity style={s.startBtn} activeOpacity={0.85}
            onPress={() => navigation.navigate('Timer')}>
            <Zap color="#fff" size={16} />
            <Text style={s.startBtnTxt}>LANCER CE WOD</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Score Modal ── */}
      <Modal visible={scoreModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setScoreModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Entrer mon score</Text>
              <TouchableOpacity onPress={() => setScoreModal(false)}>
                <X color={theme.textMuted} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalLabel}>TYPE DE SCORE</Text>
            <View style={s.modalTypeRow}>
              {(['time', 'reps', 'rounds', 'weight'] as const).map(t => (
                <TouchableOpacity key={t} onPress={() => setScoreType(t)} activeOpacity={0.7}
                  style={[s.modalTypeChip, scoreType === t && s.modalTypeChipSel]}>
                  <Text style={[s.modalTypeChipTxt, scoreType === t && s.modalTypeChipTxtSel]}>
                    {t === 'time' ? 'Temps' : t === 'reps' ? 'Reps' : t === 'rounds' ? 'Rounds' : 'Poids'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalLabel}>
              {scoreType === 'time' ? 'TEMPS (MM:SS)' : scoreType === 'weight' ? 'POIDS (kg)' : scoreType === 'reps' ? 'NOMBRE DE REPS' : 'NOMBRE DE ROUNDS'}
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder={scoreType === 'time' ? '14:32' : '150'}
              placeholderTextColor={theme.textMuted}
              value={scoreInput}
              onChangeText={setScoreInput}
              keyboardType={scoreType === 'time' ? 'default' : 'numeric'}
              autoFocus
            />

            <Text style={s.modalLabel}>NIVEAU</Text>
            <View style={s.modalTypeRow}>
              <TouchableOpacity style={[s.modalTypeChip, scoreRx && s.modalTypeChipSel]} onPress={() => setScoreRx(true)}>
                <Text style={[s.modalTypeChipTxt, scoreRx && s.modalTypeChipTxtSel]}>RX</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalTypeChip, !scoreRx && { backgroundColor: `${theme.gold}20`, borderColor: theme.gold }]} onPress={() => setScoreRx(false)}>
                <Text style={[s.modalTypeChipTxt, !scoreRx && { color: theme.gold, fontWeight: '900' }]}>Scaled</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.modalLabel}>NOTES (optionnel)</Text>
            <TextInput
              style={[s.modalInput, { minHeight: 60, textAlignVertical: 'top' }]}
              placeholder="Mouvements adaptés, sensations…"
              placeholderTextColor={theme.textMuted}
              value={scoreNotes}
              onChangeText={setScoreNotes}
              multiline
            />

            <TouchableOpacity
              style={[s.startBtn, (!scoreInput.trim() || submitting) && { opacity: 0.5 }]}
              onPress={submitScore}
              disabled={!scoreInput.trim() || submitting}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <><Check color="#fff" size={16} /><Text style={s.startBtnTxt}>Valider le score</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  backBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitleTxt: { fontSize: 16, fontWeight: '900', color: t.text },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  wrapper: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: t.text, letterSpacing: -0.2 },
  optLabel: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 1.2, marginBottom: 6 },
  chipScroll: { marginHorizontal: -16 },
  chipRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 14, flexWrap: 'wrap' },
  chipScrollContent: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
  },
  chipSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  chipTxt: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  chipTxtSel: { color: t.accent, fontWeight: '900' },
  eqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  eqChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border,
  },
  eqChipSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  eqTxt: { fontSize: 11, fontWeight: '700', color: t.textMuted },
  eqTxtSel: { color: t.accent, fontWeight: '900' },
  quickAccessRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickAccessBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.surface, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: t.border,
  },
  quickAccessTxt: { fontSize: 13, fontWeight: '800', color: t.text },
  sportRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sportCard: {
    flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 3,
    backgroundColor: t.card, borderWidth: 2, borderColor: t.border,
  },
  sportCardActive: { borderColor: t.accent, backgroundColor: `${t.accent}10` },
  sportCardHybrid: { borderColor: HYROX_ORANGE, backgroundColor: `${HYROX_ORANGE}10` },
  sportEmoji: { fontSize: 24, marginBottom: 2 },
  sportLabel: { fontSize: 12, fontWeight: '800', color: t.textMuted, textAlign: 'center', lineHeight: 17 },
  sportDot: { width: 7, height: 7, borderRadius: 4, marginTop: 3 },
  chipHybrid: { backgroundColor: `${HYROX_ORANGE}15`, borderColor: HYROX_ORANGE },
  eqChipHybrid: { backgroundColor: `${HYROX_ORANGE}15`, borderColor: HYROX_ORANGE },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stationDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  genBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.accent, borderRadius: 14, padding: 16, marginBottom: 4,
  },
  genBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  resultCard: {
    marginTop: 14, backgroundColor: t.card, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: t.border, gap: 12,
  },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  wodName: { fontSize: 22, fontWeight: '900', color: t.text, letterSpacing: -0.3 },
  movBox: { backgroundColor: t.surface, borderRadius: 10, padding: 12, gap: 3 },
  movHeader: { fontSize: 12, fontWeight: '800', color: t.textSecondary },
  movLine: { fontSize: 13, fontWeight: '600', color: t.text },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoringTxt: { fontSize: 12, fontWeight: '700', color: t.textSecondary, flex: 1 },
  coachBox: { backgroundColor: `${t.gold}12`, borderRadius: 10, padding: 10, gap: 4 },
  coachLabel: { fontSize: 11, fontWeight: '800', color: t.gold },
  coachTxt: { fontSize: 12, color: t.textSecondary, lineHeight: 17 },
  teamBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: `${t.accent}10`, borderRadius: 8, padding: 8 },
  teamTxt: { fontSize: 12, color: t.textSecondary, flex: 1, lineHeight: 17 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.accent, borderRadius: 12, padding: 14,
  },
  startBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  // Action row (save / fav / score)
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1.5, borderColor: t.accent, paddingVertical: 10,
  },
  actionBtnTxt: { fontSize: 12, fontWeight: '800', color: t.accent },
  // Score modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: t.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40, gap: 12,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: t.border,
    alignSelf: 'center', marginBottom: 4,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  modalLabel: { fontSize: 11, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5, marginTop: 4 },
  modalTypeRow: { flexDirection: 'row', gap: 8 },
  modalTypeChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface,
  },
  modalTypeChipSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  modalTypeChipTxt: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  modalTypeChipTxtSel: { color: t.accent, fontWeight: '900' },
  modalInput: {
    backgroundColor: t.surface, borderRadius: 10, borderWidth: 1, borderColor: t.border,
    padding: 12, fontSize: 16, fontWeight: '700', color: t.text,
  },
}); }
