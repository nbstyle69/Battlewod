/**
 * Design Tokens - AthleX
 * Système unifié d'espacements, typographie et rayons de bordure
 */

export const spacing = {
  // Base unit: 4
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
} as const;

export const borderRadius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  full: 9999,
} as const;

export const typography = {
  // Titres
  h1: { fontSize: 32, fontWeight: '800' as const, lineHeight: 40, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32, letterSpacing: -0.3 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28, letterSpacing: -0.2 },
  h4: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26, letterSpacing: -0.1 },
  
  // Corps de texte
  bodyLarge: { fontSize: 17, fontWeight: '400' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  
  // Labels et captions
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.3, textTransform: 'uppercase' as const },
  caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 14 },
  overline: { fontSize: 10, fontWeight: '700' as const, lineHeight: 12, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  
  // Buttons
  buttonLarge: { fontSize: 16, fontWeight: '700' as const, lineHeight: 24, letterSpacing: 0.5 },
  button: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  buttonSmall: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
} as const;

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  }),
} as const;

// Helpers pour créer des styles rapidement
export const mixins = {
  // Center content
  center: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  
  // Row layout
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  
  // Row with space between
  rowBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  
  // Safe padding for scroll views
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  
  // Card base
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
} as const;

// Z-index scale
export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  popover: 400,
  toast: 500,
} as const;

// Athlete level colors — single source of truth
export const LevelColors: Record<string, string> = {
  scaled:      '#6B7280',
  inter:       '#3B82F6',
  rx:          '#16A34A',
  'rx+':       '#D97706',
  elite:       '#7C3AED',
  pro:         '#DC2626',
};

// Animation timings
export const timing = {
  fast: 150,
  normal: 250,
  slow: 350,
  slower: 500,
} as const;
