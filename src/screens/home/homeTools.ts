import { BarChart2, Sparkles, Target, Timer } from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { FEATURES, Features } from '../../lib/features';

export type HomeTool = {
  icon: typeof Sparkles;
  label: string;
  desc: string;
  screen: 'Leaderboard' | 'Timer' | 'WODGenerator' | 'WODGenPro' | 'OneRMCalculator';
};

/** Cartes de la section « Outils » de l'accueil, dans l'ordre d'affichage. */
export function homeTools(t: TFunction, features: Features = FEATURES): HomeTool[] {
  const tools: HomeTool[] = [
    { icon: BarChart2, label: t('home.tools.leaderboard'),  desc: t('home.tools.leaderboardDesc'), screen: 'Leaderboard'     },
    { icon: Timer,     label: t('home.tools.timer'),        desc: 'For Time · AMRAP · EMOM…',      screen: 'Timer'           },
    { icon: Sparkles,  label: t('home.tools.wodGenerator'), desc: 'For Time · AMRAP · Tabata',     screen: 'WODGenerator'    },
  ];
  if (features.wodGen) {
    tools.push({ icon: Sparkles, label: 'WOD GEN', desc: '3 séances adaptées à ton profil', screen: 'WODGenPro' });
  }
  tools.push({ icon: Target, label: t('home.tools.oneRM'), desc: t('home.tools.oneRMDesc'), screen: 'OneRMCalculator' });
  return tools;
}
