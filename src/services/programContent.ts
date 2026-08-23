import { supabase } from '../lib/supabase';

/**
 * Le contenu d'un programme n'a plus de table à lui : c'est un WOD de box
 * (`box_wods`) rattaché au programme par `wod_program_access`. Une seule source
 * canonique, donc un seul chemin d'accès — c'est ce lien qui décide qui voit
 * quoi (policies `member_see_published` et `program_member_see_wods`), et non
 * plus un filtre d'écran.
 *
 * Conséquence de forme assumée : le contenu est daté au calendrier
 * (`scheduled_date`), pas numéroté en « jour 1..N » relatif à la date d'achat.
 * `program_wods` portait les deux (`day_number` OU `scheduled_date`) et n'a
 * jamais reçu une seule ligne : il n'y a donc aucun contenu relatif à
 * convertir. Le lecteur athlète affiche le numéro de semaine relatif à SA date
 * de début, mais le contenu, lui, est celui du calendrier.
 */

export type ProgramWod = {
  id: string;
  title: string;
  description: string | null;
  wod_type: string | null;
  time_cap_seconds: number | null;
  notes: string | null;
  scheduled_date: string;
  sort_order: number;
  is_published: boolean | null;
};

const COLONNES =
  'id, title, description, wod_type, time_cap_seconds, notes, scheduled_date, sort_order, is_published';

export type ProgramWodInput = {
  title: string;
  description: string;
  wod_type: string;
  time_cap_seconds: number | null;
  notes: string | null;
  scheduled_date: string;
  sort_order?: number;
};

/** Les WOD d'un programme, du plus ancien au plus récent. */
export async function listProgramWods(programId: string): Promise<ProgramWod[]> {
  const { data: liens, error: erreurLiens } = await supabase
    .from('wod_program_access')
    .select('wod_id')
    .eq('program_id', programId);
  if (erreurLiens) throw erreurLiens;

  const ids = (liens ?? []).map(l => l.wod_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('box_wods')
    .select(COLONNES)
    .in('id', ids)
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProgramWod[];
}

/** Les WOD de plusieurs programmes d'un coup, indexés par programme. */
export async function listProgramWodsByProgram(
  programIds: string[],
): Promise<Record<string, ProgramWod[]>> {
  if (programIds.length === 0) return {};

  const { data: liens, error: erreurLiens } = await supabase
    .from('wod_program_access')
    .select('wod_id, program_id')
    .in('program_id', programIds);
  if (erreurLiens) throw erreurLiens;

  const ids = [...new Set((liens ?? []).map(l => l.wod_id))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('box_wods')
    .select(COLONNES)
    .in('id', ids)
    .order('scheduled_date', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const parId = new Map((data ?? []).map(w => [w.id, w as ProgramWod]));
  const resultat: Record<string, ProgramWod[]> = {};
  for (const lien of liens ?? []) {
    const wod = parId.get(lien.wod_id);
    // Un lien dont le WOD n'est pas revenu = refus de lecture, pas une erreur :
    // c'est exactement le cas d'un rattachement visible sans le contenu.
    if (!wod) continue;
    (resultat[lien.program_id] ??= []).push(wod);
  }
  return resultat;
}

/**
 * Crée le WOD ET son rattachement. Si le rattachement échoue, le WOD est
 * retiré : un WOD de box publié sans lien de programme serait visible de toute
 * la box, donc du contenu payant offert par accident.
 */
export async function createProgramWod(
  programId: string,
  boxId: string,
  input: ProgramWodInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('box_wods')
    .insert({
      box_id: boxId,
      title: input.title,
      description: input.description,
      wod_type: input.wod_type,
      time_cap_seconds: input.time_cap_seconds,
      notes: input.notes,
      scheduled_date: input.scheduled_date,
      sort_order: input.sort_order ?? 0,
      is_published: true,
    })
    .select('id')
    .single();
  if (error) throw error;

  const wodId = data.id;
  const { error: erreurLien } = await supabase
    .from('wod_program_access')
    .insert({ wod_id: wodId, program_id: programId });
  if (erreurLien) {
    await supabase.from('box_wods').delete().eq('id', wodId);
    throw erreurLien;
  }
  return wodId;
}

export async function updateProgramWod(
  wodId: string,
  input: ProgramWodInput,
): Promise<void> {
  const { error } = await supabase
    .from('box_wods')
    .update({
      title: input.title,
      description: input.description,
      wod_type: input.wod_type,
      time_cap_seconds: input.time_cap_seconds,
      notes: input.notes,
      scheduled_date: input.scheduled_date,
      ...(input.sort_order != null ? { sort_order: input.sort_order } : {}),
    })
    .eq('id', wodId);
  if (error) throw error;
}

/** Le rattachement part avec le WOD (FK ON DELETE CASCADE). */
export async function deleteProgramWod(wodId: string): Promise<void> {
  const { error } = await supabase.from('box_wods').delete().eq('id', wodId);
  if (error) throw error;
}

/** Recopie une semaine de contenu sur la semaine suivante. */
export async function duplicateProgramWeek(
  programId: string,
  boxId: string,
  wods: ProgramWod[],
): Promise<number> {
  let copies = 0;
  for (const w of wods) {
    const cible = new Date(w.scheduled_date + 'T00:00:00');
    cible.setDate(cible.getDate() + 7);
    await createProgramWod(programId, boxId, {
      title: w.title,
      description: w.description ?? '',
      wod_type: w.wod_type ?? 'custom',
      time_cap_seconds: w.time_cap_seconds,
      notes: w.notes,
      scheduled_date: cible.toISOString().slice(0, 10),
      sort_order: w.sort_order,
    });
    copies += 1;
  }
  return copies;
}
