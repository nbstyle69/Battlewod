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
- Compte démo `[Apple_User]` (`nbstylz+appledemo@gmail.com`) et owner (`nbstylz+athlexfitness@gmail.com`) créés
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

## Protocole exécuté sur la pile jetable (2026-09-06, rejeu complet lot0→4 + rollback)

| Lot | Résultat | Contrôles |
|---|---|---|
| 0 | OK — 14 tables staging = CSV | — |
| 1 | OK — 151 comptes, 151 profils, 151 adhésions, 4 formules, subscription | A1–A11 tous OK |
| 2 | OK — 48 WODs, 132 créneaux, 1100 résas (0 waiting, 0 dépassement de formule), scores filtrés à la date | B1–B12 tous OK |
| 3 | OK — 7 tournois, 173 inscrits, 135 matchs, 266 lignes `tournament_match_elo_history` (trigger), 0 `tournament_elo_history` | C7/C8 **KO** (voir ci-dessous), reste OK |
| 4 | OK — badges catalogue prod, 681 compteurs de reps, 23 amis, 3 actus, streak 6 | D1–D9 tous OK |
| E | isolation RLS : démo ↔ NBS2 0 ligne (hors `tournaments`, lisibles par tous par RLS prod), anon refusé, staging/journal refusés | E1–E4 tous OK |
| Rollback | OK — 0 reste sur 20 tables + Auth, relevé NBS2 identique, staging/journal supprimés | — |

### Écart remonté : ELO du compte démo après recalcul mode A

Tolérance demandée : ELO 1200–1320, rang 5–20. Mesuré après lot 3 : **ELO 1338, rang #4/150** (ancre 2026-09-07 ;
1332 / #6 avec l'ancre 2026-08-31 qui charge une semaine de scores de plus). Cause : `compute_wod_elo` est plus
généreux que le modèle du générateur pour les places 1–9 que prend le démo (+20 à +42 par WOD) et les gains de
bracket compensent toute baisse de l'ELO de départ (`DEMO_ELO_DEPART_AJUST = -60` → final seulement −11).
Le levier `elo_start` seul est donc faible ; décision attendue avant la prod (voir PR).
