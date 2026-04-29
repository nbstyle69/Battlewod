# 🔔 TODO — Activer le calcul ELO automatique (Edge Function + cron)

> **Contexte** : le calcul ELO a été déplacé côté serveur (cf. audit #4).
> Tant que ces étapes ne sont pas faites, l'ELO est recalculé uniquement
> quand un utilisateur ouvre l'écran *Historique ELO* (invocation
> best-effort de l'Edge Function). Une fois le cron activé, l'ELO sera
> à jour chaque matin à 03:00 UTC, même sans visite d'écran.

---

## 1. Déployer l'Edge Function

```powershell
# À la racine du dossier Test/
supabase functions deploy compute-elo-batch --project-ref <TON_PROJECT_REF>
```

Vérifier côté dashboard Supabase → **Edge Functions** que `compute-elo-batch` apparaît et est `ACTIVE`.

## 2. Appliquer la migration cron

```powershell
supabase db push
```

Cela crée les extensions `pg_cron` + `pg_net` (idempotent) et prépare le scaffolding, mais **ne planifie pas encore** le job (le bloc `cron.schedule` est commenté).

## 3. Activer le cron quotidien

Ouvrir `@c:/Users/NBS/Desktop/Reservation/Test/supabase/migrations/20260423_elo_batch_cron.sql` et :

1. **Décommenter** le bloc `SELECT cron.schedule(...)` à la fin
2. Remplacer `YOUR-PROJECT-REF` par ton project ref Supabase (ex: `abcdefghijklmnop`)
3. Remplacer `YOUR-SERVICE-ROLE-KEY` par ta service role key (Dashboard → Settings → API → `service_role`)
4. Réappliquer : `supabase db push`

**⚠️ Sécurité** : la service role key ne doit jamais fuiter côté client. Ici elle reste dans la DB Postgres (côté serveur uniquement).

### Alternative plus propre : Vault

Stocker la clé dans Supabase Vault plutôt qu'en clair dans la migration :

```sql
-- À lancer UNE SEULE FOIS dans le SQL editor du dashboard
SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'elo_cron_service_key');

-- Puis dans cron.schedule, lire le secret :
SELECT cron.schedule(
  'compute_elo_batch_daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/compute-elo-batch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'elo_cron_service_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"all": true}'::jsonb
  );
  $$
);
```

## 4. Vérifier que ça tourne

```sql
-- Voir les jobs planifiés
SELECT * FROM cron.job;

-- Voir les dernières exécutions
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Invoquer manuellement pour tester
SELECT net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/compute-elo-batch',
  headers := jsonb_build_object(
    'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
    'Content-Type', 'application/json'
  ),
  body := '{"all": true}'::jsonb
);
```

## 5. Désactiver si besoin

```sql
SELECT cron.unschedule('compute_elo_batch_daily');
```

---

## Checklist

- [ ] `supabase functions deploy compute-elo-batch` exécuté
- [ ] `supabase db push` appliqué (migration `20260423_elo_batch_cron.sql`)
- [ ] Bloc `cron.schedule` décommenté + remplacé avec les bonnes valeurs
- [ ] `supabase db push` ré-appliqué
- [ ] `SELECT * FROM cron.job` montre bien `compute_elo_batch_daily`
- [ ] Première exécution testée manuellement via `net.http_post`
- [ ] Vérifié dans `cron.job_run_details` que le status est `succeeded`

---

_Fichier généré lors de l'audit produit du 23/04/2026._
