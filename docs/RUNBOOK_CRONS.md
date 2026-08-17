# Runbook — tâches planifiées (pg_cron) de la production

Aucun secret ne figure ici. Les jobs `net.http_post` portent leur clé
d'API et leur `x-cron-secret` **dans la définition du job en base**, jamais dans
le dépôt : c'est pourquoi ils ne sont pas créés par une migration. Une migration
est publique dans l'historique Git ; un `CRON_SECRET` ne doit pas y entrer.

Conséquence à connaître : **rejouer les migrations sur une base neuve ne recrée
pas ces jobs**. La liste ci-dessous est la référence pour les remonter.

| job | fréquence | cible |
| --- | --- | --- |
| `daily-wod-du-jour-cet` / `-cest` | 23:05 / 22:05 UTC | `SELECT ensure_daily_official_wod()` |
| `extend-class-schedules-daily` | 02:00 UTC | `SELECT extend_all_class_schedules()` |
| `detect-trial-followups-hourly` | H+10 | `SELECT detect_trial_followups()` |
| `session-followup-cron-hourly` | H+20 | edge `session-followup-cron` |
| `materialize-box-programming-cet` / `-cest` | dim. 17:00 / 16:00 UTC | `SELECT materialize_box_programming()` |
| `tournament_activation_sweep` | toutes les 15 min | `SELECT sync_tournament_activation()` |
| `tournament-notifications-sweep` | min. 5, 20, 35, 50 | edge `tournament-notifications-cron` |
| `weekly-owner-digest-monday` | lundi 07:00 UTC | edge `weekly-owner-digest` |

## `tournament-notifications-sweep`

Décalé de 5 minutes après `tournament_activation_sweep` — et non planifié en
même temps : c'est l'activation qui fait passer un tournoi en `active`, et
l'annonce « le tournoi démarre » lit ce statut. Les deux au même instant
retarderaient chaque annonce d'un quart d'heure.

Ce que la fonction renvoie, et qui sert au diagnostic :

```
candidates    destinataires éligibles à cet instant (avant déduplication)
claimed       réservés par CE passage → ceux à qui on envoie réellement
sent          push effectivement partis (après filtre de préférence)
pref_disabled destinataires écartés par leur réglage tournament_updates
by_kind       répartition par famille
```

Un passage nominal en régime établi affiche `candidates > 0, claimed 0` : rien de
neuf, donc rien à envoyer. C'est le journal `tournament_notifications_sent` qui
garantit l'unicité (index unique `NULLS NOT DISTINCT`), pas l'heure de passage.

Pour repartir de zéro sur un tournoi (rejouer les annonces d'un tournoi de
test) : supprimer ses lignes du journal.

```sql
DELETE FROM tournament_notifications_sent WHERE tournament_id = '…';
```

## Vérifier qu'un job tourne vraiment

```sql
SELECT j.jobname, r.status, r.start_time, left(r.return_message, 120)
  FROM cron.job_run_details r JOIN cron.job j USING (jobid)
 WHERE j.jobname = 'tournament-notifications-sweep'
 ORDER BY r.start_time DESC LIMIT 5;
```

`status = 'succeeded'` ne prouve que l'appel HTTP, pas le résultat de la
fonction : la réponse est dans les logs de la fonction edge.
