import { useCallback, useEffect, useState } from 'react';
import { fetchMyPersonalRecords } from '../services/myProfile';
import { parsePersonalRecords, oneRepMaxForMovement, PRMap } from '../utils/wod/movementLoadability';

/**
 * Résolveur « nom de mouvement → mon 1RM (kg) », pour afficher la charge réelle
 * d'un bloc musculation prescrit en `%1RM`.
 *
 * La lecture passe par `get_my_profile()` (`fetchMyPersonalRecords`) : depuis le
 * Lot 0-bis, `profiles.personal_records` n'est plus lisible en colonne. Tant que
 * les records ne sont pas chargés, le résolveur rend `null` et l'affichage garde
 * le pourcentage nu — jamais une charge inventée.
 */
export function useMyOneRepMax(): (movementName: string) => number | null {
  const [prs, setPrs] = useState<PRMap>({});

  useEffect(() => {
    let alive = true;
    fetchMyPersonalRecords().then(records => {
      if (alive) setPrs(parsePersonalRecords(records));
    });
    return () => { alive = false; };
  }, []);

  return useCallback((name: string) => oneRepMaxForMovement(name, prs), [prs]);
}
