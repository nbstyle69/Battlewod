/**
 * Encre du minuteur plein écran.
 *
 * Le fond du minuteur n'est PAS le thème de l'app : c'est une couleur choisie
 * par l'athlète, qui peut être blanche (« Blanc »), jaune ou fluo. Un texte
 * blanc en dur y disparaît. Les primitives d'encre vivent dans `./ink` (elles
 * servent aussi aux bandes sombres et aux aplats de domaine des autres écrans),
 * et elles sont mesurables hors composant.
 */

export { inkOn, inkOnSecondary, ensureContrast } from './ink';

export interface TimerPalette {
  id: string;
  label: string;
  emoji: string;
  digitColor: string;
  bgCountdown: string;
  bgRunning: string;
  bgDone: string;
  accent: string;
}

export const TIMER_THEMES: TimerPalette[] = [
  { id: 'emerald',  label: 'Lime',     emoji: '🌿', digitColor: '#003300', bgCountdown: '#2DB80E', bgRunning: '#39FF14', bgDone: '#55FF33', accent: '#003300' },
  { id: 'fire',     label: 'Orange',   emoji: '🔥', digitColor: '#4d1a00', bgCountdown: '#CC5200', bgRunning: '#FF6600', bgDone: '#FF8833', accent: '#4d1a00' },
  { id: 'electric', label: 'Cyan Blue',emoji: '⚡', digitColor: '#003344', bgCountdown: '#0099CC', bgRunning: '#00BFFF', bgDone: '#33CCFF', accent: '#003344' },
  { id: 'midnight', label: 'Violet',   emoji: '🌙', digitColor: '#FFFFFF', bgCountdown: '#AA00DD', bgRunning: '#CC00FF', bgDone: '#DD33FF', accent: '#FFFFFF' },
  { id: 'ocean',    label: 'Cyan',     emoji: '🌊', digitColor: '#003333', bgCountdown: '#00CCCC', bgRunning: '#00FFFF', bgDone: '#33FFFF', accent: '#003333' },
  { id: 'solar',    label: 'Yellow',   emoji: '☀️', digitColor: '#333300', bgCountdown: '#CCCC00', bgRunning: '#FFFF00', bgDone: '#FFFF44', accent: '#333300' },
  { id: 'neon',     label: 'Pink',     emoji: '🩷', digitColor: '#FFFFFF', bgCountdown: '#CC0073', bgRunning: '#FF0090', bgDone: '#FF33AA', accent: '#FFFFFF' },
  { id: 'rage',     label: 'Red',      emoji: '🔴', digitColor: '#FFFFFF', bgCountdown: '#CC0000', bgRunning: '#FF1414', bgDone: '#FF4444', accent: '#FFFFFF' },
  { id: 'noir',     label: 'Noir',     emoji: '⬛', digitColor: '#39FF14', bgCountdown: '#000000', bgRunning: '#000000', bgDone: '#111111', accent: '#FFFFFF' },
  { id: 'blanc',    label: 'Blanc',    emoji: '⬜', digitColor: '#000000', bgCountdown: '#EEEEEE', bgRunning: '#FFFFFF', bgDone: '#E8E8E8', accent: '#000000' },
];
