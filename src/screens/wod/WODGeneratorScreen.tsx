import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, ActivityIndicator,
} from 'react-native';
import { Sparkles, ChevronLeft, Clock, Zap, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { AthleteLevel, WODType } from '../../types';

const LEVELS: AthleteLevel[] = ['scaled', 'inter', 'rx', 'rx+', 'gx', 'pro'];
const DURATIONS = [5, 10, 15, 20];
const WOD_TYPES: WODType[] = ['AMRAP', 'For Time', 'EMOM', 'Tabata', 'Max Reps'];

const EQUIPMENT_OPTIONS = [
  'Barre + Disques', 'Haltères', 'Kettlebell', 'Box', 'Corde à sauter',
  'Barre de traction', 'Anneaux', 'Rameur', 'Vélo Assault', 'Aucun matériel',
];

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

function generateWOD(level: AthleteLevel, duration: number, type: WODType, equipment: string[]): GeneratedWOD {
  const hasBarbell = equipment.includes('Barre + Disques');
  const hasJumpRope = equipment.includes('Corde à sauter');
  const hasBox = equipment.includes('Box');
  const noEquip = equipment.includes('Aucun matériel') || equipment.length === 0;

  const wodsByType: Record<string, GeneratedWOD> = {
    'AMRAP': {
      title: noEquip ? 'Body Blaster' : hasBarbell ? 'Iron Storm' : 'Battle Circuit',
      type: 'AMRAP',
      duration,
      level,
      movements: noEquip
        ? ['10 Burpees', '15 Air Squats', '20 Mountain Climbers', '10 Push-ups']
        : hasBarbell
        ? [`10 Hang Power Clean (${level === 'rx' ? '60' : level === 'scaled' ? '30' : '70'}kg)`, '15 Box Jumps', '20 Double Unders']
        : ['12 Kettlebell Swings', '10 Box Jumps', '15 Push-ups'],
      scoring: `Max rounds en ${duration} minutes`,
      tip: 'Garde un rythme constant. Évite de partir trop vite sur le 1er round.',
    },
    'For Time': {
      title: hasBarbell ? 'Grace Remix' : 'Speed Demon',
      type: 'For Time',
      duration,
      level,
      movements: hasBarbell
        ? [`21-15-9 Thrusters (${level === 'scaled' ? '35' : '43'}kg)`, '21-15-9 Pull-ups']
        : ['50 Burpees', '400m Course', '50 Air Squats'],
      scoring: `Temps le plus court possible (cap ${duration} min)`,
      tip: 'Gère ton souffle sur les barres. Les transitions rapides font la différence.',
    },
    'EMOM': {
      title: 'Minute Warrior',
      type: 'EMOM',
      duration,
      level,
      movements: [
        `Min 1 : 10 ${hasBarbell ? 'Deadlifts' : 'Burpees'}`,
        `Min 2 : 15 ${hasBox ? 'Box Jumps' : 'Squats'}`,
        `Min 3 : 20 ${hasJumpRope ? 'Double Unders' : 'Mountain Climbers'}`,
      ],
      scoring: 'Complète chaque minute. Score = rounds terminés.',
      tip: "L'objectif est de finir chaque minute avec du temps de repos.",
    },
    'Tabata': {
      title: 'Tabata Fury',
      type: 'Tabata',
      duration: 4,
      level,
      movements: [
        '20s Burpees / 10s Repos × 8',
        '20s Air Squats / 10s Repos × 8',
        '20s Push-ups / 10s Repos × 8',
      ],
      scoring: 'Score = total de reps',
      tip: "Chaque round de 20s doit être à 100%. Le repos de 10s est sacré.",
    },
    'Max Reps': {
      title: 'Peak Performance',
      type: 'Max Reps',
      duration,
      level,
      movements: [
        `Max Pull-ups en ${duration} min (sans lâcher)`,
        hasBarbell ? `Max Clean & Jerk (${level === 'rx' ? '70' : '50'}kg)` : 'Max Burpees',
      ],
      scoring: 'Score = total de reps',
      tip: 'Teste tes vraies limites. Pousse jusqu\'au bout.',
    },
  };

  return wodsByType[type] ?? wodsByType['AMRAP'];
}

export default function WODGeneratorScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [sport,        setSport]        = useState<Sport>('functional');
  const [level,        setLevel]        = useState<AthleteLevel>('rx');
  const [duration,     setDuration]     = useState(5);
  const [wodType,      setWODType]      = useState<WODType>('AMRAP');
  const [equipment,    setEquipment]    = useState<string[]>(['Barre + Disques', 'Corde à sauter']);
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
      const wod = generateWOD(level, duration, wodType, equipment);
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
            <Text style={[S.sportLabel, sport === 'hybrid' && { color: HYROX_ORANGE }]}>Hybrid{"\n"}(Hyrox)</Text>
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
