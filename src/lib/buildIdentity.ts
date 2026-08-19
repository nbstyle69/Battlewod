import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

/**
 * Identité du code réellement exécuté, affichée sur l'écran de connexion.
 *
 * « L'écran s'affiche » ne prouve pas qu'un update a été reçu : un lancement
 * sans réseau, un téléchargement interrompu ou un cache laissent l'ancien
 * bundle en place sans le dire. Ce que l'on compare, c'est cet identifiant et
 * celui du résumé de publication.
 */
export function buildIdentity(): string {
  const version = Constants.expoConfig?.version ?? '?';

  // `updateId` est nul quand c'est le bundle embarqué dans le build natif qui
  // tourne : c'est une information, pas une absence d'information.
  const updateId = Updates.updateId;
  const source = updateId ? updateId.slice(0, 8) : 'embarqué';

  return `v${version} · ${source}`;
}
