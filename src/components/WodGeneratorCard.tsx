import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { Sparkles, RefreshCw, Zap, Clock, Users, User, ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, LevelColors } from '../theme/colors';
import { HomeStackParamList } from '../navigation';
import { AthleteLevel } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeList'>;
type WODType = 'For Time' | 'AMRAP' | 'EMOM' | 'Tabata' | 'Max Reps';
type LK = AthleteLevel;

const LEVELS: { key: LK; label: string }[] = [
  { key: 'scaled', label: 'Scaled' }, { key: 'inter', label: 'Inter' },
  { key: 'rx', label: 'RX' }, { key: 'rx+', label: 'RX+' },
  { key: 'gx', label: 'Elite' }, { key: 'pro', label: 'Pro' },
];
const LI: Record<LK, number> = { scaled: 0, inter: 1, rx: 2, 'rx+': 3, gx: 4, pro: 5 };
const FORMATS = ['Solo', 'Équipe'];
const DURATIONS = [5, 10, 15, 20, 30, 40, 60];
const WOD_TYPES: WODType[] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];
const EQ_LIST = [
  { key: 'bb', label: 'Barbell' }, { key: 'db', label: 'Haltères' },
  { key: 'kb', label: 'Kettlebell' }, { key: 'bx', label: 'Box' },
  { key: 'jr', label: 'Corde' }, { key: 'pb', label: 'Barre traction' },
  { key: 'ri', label: 'Anneaux' }, { key: 'erg', label: 'Erg' },
  { key: 'mb', label: 'Med Ball' }, { key: 'wm', label: 'Worm' },
  { key: 'bw', label: 'Sans matériel' },
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
    { mv: 'Thrusters', scale: ['30/20','40/28','43/30','50/35','60/42','70/48'] },
    { mv: 'Deadlifts', scale: ['70/50','100/70','120/80','140/95','160/110','180/120'] },
    { mv: 'Snatches', scale: ['20/15','35/25','50/35','60/42','70/50','85/60'] },
    { mv: 'Front Squats', scale: ['40/28','55/38','70/48','85/58','100/68','120/80'] },
    { mv: 'Push Press', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Push Jerks', scale: ['30/20','40/28','50/35','60/42','70/48','80/55'] },
    { mv: 'Hang Power Cleans', scale: ['35/25','45/32','60/43','70/48','80/55','90/63'] },
    { mv: 'OHS', scale: ['20/15','35/25','50/35','60/42','70/48','80/55'] },
  ],
  db: [
    { mv: 'DB Thrusters', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Snatches alt.', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: "Devil's Press", scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Clean & Press', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Deadlifts', scale: ['15/10','20/14','25/17','30/20','35/22','40/27'] },
    { mv: 'DB Lunges (kg/main)', scale: ['10/7','15/10','20/14','22/15','25/17','30/20'] },
    { mv: 'DB Rows (kg/main)', scale: ['12/8','17/12','22/15','25/17','28/20','32/22'] },
  ],
  kb: [
    { mv: 'KB Swings', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'Goblet Squats', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'KB Cleans alt.', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'KB Snatches alt.', scale: ['16/12','20/16','24/16','28/20','32/24','36/28'] },
    { mv: 'Turkish Get-ups alt.', scale: ['10/8','14/10','16/12','20/14','24/16','28/20'] },
    { mv: 'KB Press alt.', scale: ['12/8','16/12','20/16','24/16','28/20','32/24'] },
  ],
  bx: [
    { mv: 'Box Jumps', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Box Step-ups', scale: ['50cm','50cm','61cm','61cm','76cm','76cm'] },
    { mv: 'Depth Jumps', scale: ['40cm','50cm','50cm','61cm','61cm','76cm'] },
  ],
  jr: [
    { mv: 'Double Unders', scale: ['×3 SU','×2 SU','DU','DU','DU (TU modif)','Triple Unders'] },
    { mv: 'Single Unders', scale: ['SU','SU','SU','DU','DU','DU'] },
  ],
  pb: [
    { mv: 'Pull-ups', scale: ['Ring Rows','Australian PU','Pull-ups','C2B','C2B stricts','Bar MU'] },
    { mv: 'Toes to Bar', scale: ['K2E','K2C','T2B','T2B','T2B','T2B'] },
    { mv: 'HSPU', scale: ['Pike PU','HSPU modif','HSPU modif','HSPU','HSPU stricts','HSPU stricts'] },
    { mv: 'Kipping Pull-ups', scale: ['Ring Rows','Australian PU','Kipping PU','C2B','C2B','BMU'] },
  ],
  ri: [
    { mv: 'Ring Dips', scale: ['Ring Dip modif','Ring Dip modif','Ring Dips','Ring Dips','Ring Dips stricts','Ring Dips stricts'] },
    { mv: 'Muscle-ups', scale: ['Ring Rows+Dips','Ring Rows+Dips','MU modif','MU modif','Muscle-ups','Muscle-ups'] },
    { mv: 'Ring Push-ups', scale: ['Ring PU genoux','Ring PU','Ring PU','Ring PU élargis','Ring PU + pause','Archer Ring PU'] },
    { mv: 'Ring Rows', scale: ['Incliné 45°','Horizontal','Horizontal','Pieds surélevés','Pieds surélevés+pause','Archer Ring Row'] },
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
  bw: [
    { mv: 'Burpees', scale: ['step-out','classiques','classiques','saut haut','saut + clap','explosifs'] },
    { mv: 'Air Squats', scale: ['×1','×1','×1','×1.2','×1.5','×2'] },
    { mv: 'Push-ups', scale: ['genoux','classiques','classiques','wide+narrow','diamond','archer'] },
    { mv: 'Sit-ups', scale: ['×1','×1','×1','V-ups','V-ups','Hollow rocks'] },
    { mv: 'Lunges alt.', scale: ['×1','×1','×1','walking','jumping','jumping'] },
    { mv: 'Mountain Climbers', scale: ['lents','lents','normaux','normaux','rapides','rapides'] },
  ],
};

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

function getMoves(eqKeys: string[]): Array<{ mv: string; scale: string[] }> {
  const active = eqKeys.includes('bw') || eqKeys.length === 0 ? ['bw', ...eqKeys] : eqKeys;
  const pool: Array<{ mv: string; scale: string[] }> = [];
  active.forEach(k => { if (MOVES[k]) pool.push(...MOVES[k]); });
  if (pool.length === 0) pool.push(...MOVES['bw']);
  return pool;
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
  const pool = getMoves(eqKeys);
  const isTeam = format === 'Équipe';

  let name = '', movements = '', scoring = '', coach = '', teamNote = '';

  if (type === 'For Time') {
    name = rand(NAMES_FT);
    const rounds = duration <= 5 ? 1 : duration <= 10 ? 3 : duration <= 15 ? 4 : duration <= 20 ? 5 : 7;
    const mvs = pick(pool, rounds <= 1 ? 2 : 3);
    const baseReps = [21, 15, 9];
    if (rounds === 1) {
      movements = mvs.map((m, i) => `${fmt(m, scaleReps(baseReps[i] ?? 15, li), li)}`).join('\n');
      scoring = `${mvs[0].mv === 'C&J' ? '30-15-9' : '21-15-9'} — Temps le plus court (cap ${duration} min)`;
    } else {
      movements = `${rounds} rounds :\n` + mvs.map(m => `  ${fmt(m, scaleReps(15, li), li)}`).join('\n');
      scoring = `Temps le plus court (cap ${duration} min)`;
    }
    coach = 'Gère ton effort : les 2 premiers rounds doivent sembler faciles.';
    teamNote = isTeam ? 'Alternance par round. Un travaille, un récupère.' : '';
  }

  else if (type === 'AMRAP') {
    name = rand(NAMES_AM);
    const mvs = pick(pool, 3);
    const baseReps = [10, 15, 20];
    movements = `AMRAP ${duration} min :\n` + mvs.map((m, i) => `  ${fmt(m, scaleReps(baseReps[i], li), li)}`).join('\n');
    scoring = `Max rounds + reps en ${duration} min`;
    coach = 'Trouve UN rythme et tiens-le. Évite le sprint initial.';
    teamNote = isTeam ? 'Score = rounds d\'équipe. Alternance complète par round.' : '';
  }

  else if (type === 'EMOM') {
    name = rand(NAMES_EM);
    const mins = Math.min(duration, 6);
    const mvs = pick(pool, Math.min(mins, 3));
    const lines: string[] = [];
    for (let i = 0; i < mins; i++) {
      const m = mvs[i % mvs.length];
      lines.push(`  Min ${i+1}: ${fmt(m, scaleReps(10, li), li)}`);
    }
    if (duration > mins) lines.push(`  → Répéter le cycle (${Math.round(duration / mins)} fois)`);
    movements = `EMOM ${duration} min :\n` + lines.join('\n');
    scoring = `Score = rounds complétés`;
    coach = 'Finis chaque minute avec au moins 15s de repos.';
    teamNote = isTeam ? 'A fait les minutes impaires, B les paires.' : '';
  }

  else if (type === 'Tabata') {
    name = rand(NAMES_TB);
    const count = Math.max(1, Math.floor(duration / 4));
    const mvs = pick(pool, count);
    movements = `Tabata ${duration} min (${count} mouv.):\n` + mvs.map(m => `  8×20s ${fmtName(m, li)} / 10s repos`).join('\n');
    scoring = 'Score = min de reps sur un round (par mouvement)';
    coach = 'Maintiens le même nombre de reps à chaque round des 8.';
    teamNote = isTeam ? 'Score collectif = somme des reps de tous les athlètes.' : '';
  }

  else {
    name = rand(NAMES_MR);
    const m = rand(pool);
    const maxReps = scaleReps(10, li);
    movements = `Max reps en ${duration} min :\n  ${fmtName(m, li)}`;
    scoring = `Score = total de reps (${maxReps} reps/set conseillé, repos 15s max)`;
    coach = 'Sets réguliers. Repos jamais > 20s. Pousse jusqu\'au bout.';
    teamNote = isTeam ? 'Score = somme des reps de l\'équipe. Alternance toutes les 30s.' : '';
  }

  return { name, type, duration, level, movements, scoring, coach, teamNote: isTeam ? teamNote : undefined };
}

export default function WodGeneratorCard({ navigation: navProp }: { navigation?: Nav }) {
  const navHook = useNavigation<Nav>();
  const navigation = navProp ?? navHook;
  const [level, setLevel] = useState<LK>('rx');
  const [format, setFormat] = useState('Solo');
  const [duration, setDuration] = useState(10);
  const [wodType, setWodType] = useState<WODType>('AMRAP');
  const [equipment, setEquipment] = useState<string[]>(['bw']);
  const [wod, setWod] = useState<GeneratedWOD | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleEq(k: string) {
    if (k === 'bw') { setEquipment(['bw']); return; }
    setEquipment(prev => {
      const without = prev.filter(e => e !== 'bw');
      return without.includes(k) ? without.filter(e => e !== k) || ['bw'] : [...without, k];
    });
  }

  async function handleGenerate() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    setWod(generateWOD(level, format, duration, wodType, equipment));
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
      <View style={s.chipRow}>
        {FORMATS.map(f => (
          <TouchableOpacity key={f} onPress={() => setFormat(f)} activeOpacity={0.7}
            style={[s.chip, format === f && s.chipSel]}>
            {f === 'Solo' ? <User color={format === f ? Colors.primary : Colors.textMuted} size={13} /> : <Users color={format === f ? Colors.primary : Colors.textMuted} size={13} />}
            <Text style={[s.chipTxt, format === f && s.chipTxtSel]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

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

      {/* Generate button */}
      <TouchableOpacity onPress={handleGenerate} activeOpacity={0.85} disabled={loading} style={s.genBtn}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><Sparkles color="#fff" size={18} /><Text style={s.genBtnTxt}>GÉNÉRER MON WOD</Text></>
        )}
      </TouchableOpacity>

      {/* Result */}
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
