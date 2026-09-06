# Seed de la box de démonstration « AthleX Fitness »

Box de démo isolée (captures App Store, compte reviewer Apple). Crossfit NBS2 n'est jamais touchée :
un relevé (comptes + md5) est pris au lot 0 et comparé après chaque lot et après le rollback.

## Contenu

- `generator/generate_demo_data.py` : génère `data/*.csv` (graine fixe). **Ne jamais éditer les CSV à la main.**
- `seed_demo.py` : chargement lot par lot via staging (`demo_stg`) + journal (`public._demo_seed_log`),
  comptes via l'API Admin Supabase (e-mail confirmé, aucun mail), contrôles A–E, rollback.
- `sql/` : un fichier par lot, `check_*.sql` (un bloc `-- @@` = un contrôle → `ok / controle / detail`), rollback.
- `local_fixture_nbs2.py` : pile jetable uniquement, crée une box témoin portant l'id de NBS2 pour les contrôles d'isolation.

## Décisions appliquées

- Mode ELO **A** : `elo_start.csv` → `profiles.elo`, puis `compute_wod_elo`/`compute_box_elo` (par WOD, ordre
  chronologique, JWT du owner) et `trg_bracket_match_elo` (matchs `completed`) recalculent. `elo_history.csv` n'est
  pas chargé ; `finalize_tournament_elo` n'est pas appelée.
- Aucun trigger désactivé : `trg_enforce_weekly_limit` et la capacité restent actifs (le générateur borne la présence
  par la formule ; toute ligne `waiting` fait échouer le lot 2).
- Formules via `membership_plans` (sans Stripe) ; `box_subscriptions` `complete/active` +1 an sans identifiants Stripe.
- `invite_code` : 6 alphanumériques majuscules générés (unicité vérifiée), même format que les codes existants.
- Compte démo « Camille Roux » (username et `full_name`) (`nbstylz+appledemo@gmail.com`) et owner (`nbstylz+athlexfitness@gmail.com`) créés
  sans mot de passe transmis : GoTrue pose un hash aléatoire inconnu de tous → à définir par « mot de passe oublié ».
- `box_id` fixe `d3d0b0a0-0000-4000-a000-000000000001` (celui du pack, `d3m0b0x0-…`, n'est pas un uuid valide).
- Dates : les CSV sont relatifs au lundi `2026-09-07` ; `--anchor` (par défaut le lundi de la semaine en cours,
  ou le lundi suivant si on est dimanche) les recale. Les scores dont la date recalée est > aujourd'hui sont filtrés.

## Exécution

```bash
# pile jetable
source ~/.nvm/nvm.sh && ./scripts/test-stack.sh up && set -a && source /tmp/athlex-test-stack.env && set +a
python3 scripts/demo-seed/local_fixture_nbs2.py --target local      # box témoin (local seulement)
S="python3 scripts/demo-seed/seed_demo.py --target local"
$S lot0 && $S lot1 && $S check A && $S lot2 && $S check B && $S lot3 && $S check C && $S lot4 && $S check D && $S check E
$S rollback --yes

# prod : SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF + EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY_
# même séquence avec --target prod, pause après chaque lot pour vérification dans l'app.
```

Chaque lot est idempotent (rejoué sur une cible où il est déjà passé, il ne réécrit rien) et refuse de tourner si le
lot précédent n'est pas terminé. Le rollback supprime uniquement les lignes journalisées + les comptes Auth via
l'API Admin, vérifie 0 reste et l'égalité du relevé NBS2, puis supprime staging et journal.

**Découpage lots 2/3 (mode A, ordre réel).** Le lot 2 pose la structure seule : WODs, créneaux, réservations,
tournois, inscriptions et le plan des matchs (`demo_stg.match_plan`, horaire de fin unique par match). Le lot 3
rejoue **un seul flux d'événements trié par date** : chaque WOD (scores → `compute_wod_elo` + `compute_box_elo`,
daté J 21:00) et chaque match (insert avec `trg_bracket_match_elo` actif, daté à sa fin J 18:06/18:12/…) dans
l'ordre réel, un événement = une transaction ; un match du 17/08 est donc calculé avant le WOD du 18/08. Les
WODs/matchs postérieurs au jour d'exécution sont filtrés. `rollback-lots23 --yes` annule les lots 2 et 3 seulement
(box, comptes Auth et mots de passe, profils, formules, adhésions conservés ; `profiles`/`box_elo` remis à
`elo_start`) et vérifie 0 reste hors lot 0/1 + NBS2 identique.

## Protocole exécuté sur la pile jetable (2026-09-06, rejeu complet lot0→4 + rollback)

| Lot | Résultat | Contrôles |
|---|---|---|
| 0 | OK — 14 tables staging = CSV | — |
| 1 | OK — 151 comptes, 151 profils, 151 adhésions, 4 formules, subscription | A1–A11 tous OK |
| 2 | OK — 48 WODs, 132 créneaux, 1100 résas (0 waiting, 0 dépassement de formule), 7 tournois, 173 inscrits, plan de 135 matchs, 0 ELO | B1–B11 tous OK |
| 3 | OK — 171 événements (36 WODs ≤ jour J + 135 matchs) rejoués par date, 1128 scores, 266 lignes `tournament_match_elo_history` (trigger), 0 `tournament_elo_history` | C1–C15 tous OK (C7 ELO 1272, C8 rang #12/150, C9 chaîne 0 rupture sur 150 membres) |
| Rollback partiel 2+3 | OK — 0 reste hors lot 0/1, profils/box_elo = elo_start, hash Auth identiques, contrôles A OK ; rejeu lots 2+3 → mêmes chiffres | — |
| 4 | OK — badges catalogue prod, 681 compteurs de reps, 23 amis, 3 actus, streak 6 | D1–D9 tous OK |
| E | isolation RLS : démo ↔ NBS2 0 ligne (hors `tournaments`, lisibles par tous par RLS prod), anon refusé, staging/journal refusés | E1–E4 tous OK |
| Rollback | OK — 0 reste sur 20 tables + Auth, relevé NBS2 identique, staging/journal supprimés | — |

### Calibration ELO du compte démo (mode A)

Cible : rang 8–15, ELO 1200–1320, courbe qui monte et descend. Deux leviers, tous deux dans le générateur :
`DEMO_PLACEMENTS` (percentile visé dans le champ RX pour chacun de ses WODs passés : 2 podiums, majorité en
milieu de tableau, 3 en seconde moitié) et `DEMO_ELO_DEPART_AJUST = -60`. Mesuré sur la pile jetable (ancre
2026-09-07, ordre réel WODs + matchs) : ELO **1272**, rang **#12/150**, 21 points, 10 V / 1 D en bracket ;
courbe `1057>1077 1077>1111 1111>1097 1097>1115 1115>1104(m) 1104>1115(m) 1115>1112 1112>1128(m) 1128>1138
1138>1153(m) 1153>1175(m) 1175>1201 1201>1190 1190>1207(m) 1207>1215(m) 1215>1230(m) 1230>1239 1239>1253(m)
1253>1259(m) 1259>1259 1259>1272(m)` ; dernier `elo_after` = `profiles.elo` (C9).
La courbe de l'app n'intègre les matchs de bracket qu'avec la PR #268 (`EloHistoryScreen` lit
`tournament_match_elo_history`), à embarquer dans le build des captures.
