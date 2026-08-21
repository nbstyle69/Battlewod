/**
 * Ref du projet de production, dans un module sans aucune dépendance.
 *
 * Pourquoi elle vit ici plutôt que dans `test-env.mjs` : l'audit de production
 * n'a besoin que de cette constante, et `test-env.mjs` importe
 * `@supabase/supabase-js`. Le job nocturne n'installe pas les dépendances du
 * dépôt — il n'en a pas besoin, il ne fait que du `psql` et du `fetch` — donc
 * cet import faisait échouer l'audit au chargement du module, avant la moindre
 * assertion. Un contrôle qui ne s'exécute pas ne constate rien.
 *
 * Une seule définition, deux lecteurs : `test-env.mjs` la ré-exporte.
 */
export const PROD_PROJECT_REF = 'lkwdlqlbrbxaiydkoxfp';
