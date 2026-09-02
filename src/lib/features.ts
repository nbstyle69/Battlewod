/**
 * Interrupteurs de fonctionnalités. Un seul endroit : une entrée à `false`
 * masque tous les points d'accès à la fonctionnalité, sans toucher à l'écran,
 * à la route ni aux services, qui restent dans le code.
 */
export const FEATURES = {
  /** WOD GEN (« 3 séances adaptées à ton profil », route `WODGenPro`). Retiré de l'app, à retravailler. */
  wodGen: false,
} as const;

export type Features = { readonly [K in keyof typeof FEATURES]: boolean };
