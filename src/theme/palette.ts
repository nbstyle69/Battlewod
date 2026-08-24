import { Platform } from 'react-native';

// Android has no native BlurView → translucent cards look washed-out / "double rectangle".
// On Android, we force more opaque card/surface fills so blocks render as crisp,
// clearly-visible cards on every screen that uses theme.card or theme.surface directly.
const IS_ANDROID = Platform.OS === 'android';

export type ThemeMode = 'light' | 'dark';

export interface AppTheme {
  mode: ThemeMode;
  background: string;
  card: string;
  cardBorder: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  primaryLight: string;
  accent: string;
  accentDark: string;
  accentLight: string;
  accentShadow: string;
  /**
   * Encre posée SUR un aplat d'accent (bouton plein, segment sélectionné).
   * `#fff` y donnait 2,5:1 dans les deux thèmes : l'accent est un ton moyen,
   * ni assez clair ni assez sombre pour porter du blanc.
   */
  onAccent: string;
  /**
   * Accent utilisé EN TEXTE sur le fond ou une carte. En clair, `accent` y
   * tombe à 2,5:1 — il faut une déclinaison plus sombre ; en sombre, la teinte
   * d'origine tient.
   */
  accentText: string;
  // Translucent accent fill/border used by primary action buttons across screens.
  // Mode-aware: silver in light, emerald in dark.
  ctaBg: string;
  ctaBorder: string;
  secondary: string;
  text: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  gold: string;
  silver: string;
  bronze: string;
  success: string;
  error: string;
  warning: string;
  shadow: string;
  modalCard: string;
  modalBackdrop: string;
}

export const lightTheme: AppTheme = {
  mode: 'light',
  background: '#ffffff',
  // Glassmorphism: cards/surfaces are translucent so the emerald gradient/blobs show through on iOS.
  // On Android (no BlurView), we use more opaque fills to keep cards crisp and legible.
  card: IS_ANDROID ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)',
  cardBorder: IS_ANDROID ? 'rgba(148,163,184,0.22)' : 'rgba(255,255,255,0.55)',
  surface: IS_ANDROID ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.40)',
  surfaceAlt: IS_ANDROID ? 'rgba(241,245,249,0.90)' : 'rgba(241,245,249,0.55)',
  primary: '#111827',
  primaryLight: '#374151',
  accent: '#94a3b8',
  accentDark: '#64748b',
  accentLight: '#cbd5e1',
  accentShadow: 'rgba(148,163,184,0.30)',
  onAccent: '#0a0a0a',
  accentText: '#475569',
  ctaBg: 'rgba(148,163,184,0.25)',
  ctaBorder: 'rgba(148,163,184,0.85)',
  secondary: '#6b7280',
  text: '#111827',
  textPrimary: '#111827',
  // Assombri d'un cran pour garder une hiérarchie avec textMuted, qui monte.
  textSecondary: '#4b5563',
  // #9ca3af ne donnait que 2,5:1 sur une carte claire : les sous-titres de
  // réglages et les métadonnées étaient à la limite du visible. #6b7280 passait
  // le seuil de 4,5:1 par 0,03 sur les blocs mesurés — une surface intercalée de
  // plus le refaisait tomber, donc la marge est prise ici, pas espérée.
  textMuted: '#646b78',
  border: 'rgba(148,163,184,0.20)',
  tabBar: 'rgba(255,255,255,0.85)',
  tabBarBorder: 'rgba(148,163,184,0.22)',
  tabBarActive: '#94a3b8',
  tabBarInactive: '#9ca3af',
  // Médailles et statuts : teintes de domaine, distinctes par nature, déclinées
  // pour le fond clair où leur variante vive n'atteint pas le seuil de lecture.
  gold: '#A16207',
  silver: '#64748b',
  bronze: '#92400E',
  success: '#047857',
  error: '#DC2626',
  warning: '#B45309',
  shadow: 'rgba(0,0,0,0.06)',
  modalCard: '#ffffff',
  modalBackdrop: 'rgba(0,0,0,0.55)',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  background: '#0a0a0a',
  // Glassmorphism: cards/surfaces are translucent so the emerald gradient/blobs show through on iOS.
  // On Android (no BlurView), we use more opaque dark fills to keep cards crisp and legible.
  card: IS_ANDROID ? 'rgba(22,28,26,0.82)' : 'rgba(255,255,255,0.06)',
  cardBorder: IS_ANDROID ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.12)',
  surface: IS_ANDROID ? 'rgba(26,32,30,0.80)' : 'rgba(255,255,255,0.04)',
  surfaceAlt: IS_ANDROID ? 'rgba(28,36,34,0.80)' : 'rgba(255,255,255,0.08)',
  primary: '#f9fafb',
  primaryLight: '#d1d5db',
  accent: '#10b981',
  accentDark: '#059669',
  accentLight: '#34d399',
  accentShadow: 'rgba(16,185,129,0.40)',
  onAccent: '#0a0a0a',
  accentText: '#34d399',
  ctaBg: 'rgba(16,185,129,0.25)',
  ctaBorder: 'rgba(16,185,129,0.8)',
  secondary: '#9ca3af',
  text: '#f9fafb',
  textPrimary: '#f9fafb',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  border: 'rgba(255,255,255,0.10)',
  tabBar: 'rgba(10,10,10,0.85)',
  tabBarBorder: 'rgba(16,185,129,0.20)',
  tabBarActive: '#10b981',
  tabBarInactive: '#6b7280',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  success: '#10b981',
  error: '#f87171',
  warning: '#fbbf24',
  shadow: 'rgba(0,0,0,0.4)',
  modalCard: '#14161b',
  modalBackdrop: 'rgba(0,0,0,0.80)',
};
