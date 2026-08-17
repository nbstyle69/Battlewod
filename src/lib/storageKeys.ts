/**
 * Clés AsyncStorage partagées entre plusieurs modules.
 *
 * `TOUR_DONE_KEY` vit ici plutôt que dans le composant du tutoriel : la purge
 * du signOut (AuthContext) doit l'exclure sans importer d'écran.
 */
export const TOUR_DONE_KEY = '@athlex:tourDone';

/**
 * Une clé locale appartient-elle à la session qui se déconnecte ?
 *
 * Sur un appareil partagé, tout ce qui décrit le compte doit partir. Le
 * tutoriel guidé, lui, décrit l'interface de l'appareil : le rejouer à chaque
 * déconnexion le remettrait devant quelqu'un qui l'a déjà vu.
 */
export function isPurgedAtSignOut(key: string): boolean {
  if (key === TOUR_DONE_KEY) return false;
  return key.startsWith('@athlex:') || key.startsWith('lastSeenMessages_');
}
