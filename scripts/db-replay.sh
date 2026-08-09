#!/usr/bin/env bash
# Rejoue baseline + migrations sur une base VIERGE et echoue a la premiere erreur.
# Utilise en CI (.github/workflows/db-replay.yml) et en local.
#
#   ./scripts/db-replay.sh
#
# Toute migration non rejouable sur base vierge fait echouer ce script — c'est
# la garantie que supabase/migrations reconstruit reellement le schema de prod.
set -euo pipefail

IMAGE="${PG_IMAGE:-supabase/postgres:17.6.1.160}"
NAME="${PG_CONTAINER:-athlex-db-replay}"
PORT="${PG_PORT:-54329}"
PGPASSWORD_LOCAL="postgres"
# supabase_admin est le role superuser de la plateforme : c'est lui qui possede
# les schemas auth/storage, donc le seul capable de rejouer le baseline entier.
DB_URL="postgresql://supabase_admin:${PGPASSWORD_LOCAL}@127.0.0.1:${PORT}/postgres"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
# KEEP=1 laisse la base debout pour inspection manuelle apres le rejeu.
[ "${KEEP:-0}" = "1" ] || trap cleanup EXIT
cleanup

echo "==> Base vierge ($IMAGE)"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PGPASSWORD_LOCAL" \
  -p "${PORT}:5432" "$IMAGE" >/dev/null

for i in $(seq 1 90); do
  if docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null; then break; fi
  sleep 2
  [ "$i" = 90 ] && { echo "Postgres n'a jamais demarre"; docker logs "$NAME" | tail -40; exit 1; }
done
sleep 3

echo "==> Roles Supabase (fournis par la plateforme en prod)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin') THEN CREATE ROLE supabase_admin LOGIN SUPERUSER; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Objets fournis par la plateforme Supabase (service Storage), pas par nos
-- migrations : on les recree au minimum pour que les policies du baseline
-- puissent s'appliquer.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
SQL

echo "==> Rejeu de supabase/migrations (ordre lexicographique)"
count=0
for f in supabase/migrations/*.sql; do
  printf '    %-64s' "$(basename "$f")"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/replay.log 2>&1; then
    echo "ok"
  else
    echo "ECHEC"
    tail -30 /tmp/replay.log
    exit 1
  fi
  count=$((count + 1))
done

echo "==> $count migration(s) rejouee(s). Controles de non-vacuite :"
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q <<'SQL'
\pset footer off
SELECT 'tables'    AS objet, count(*) FROM pg_tables  WHERE schemaname='public'
UNION ALL SELECT 'vues',     count(*) FROM pg_views   WHERE schemaname='public'
UNION ALL SELECT 'fonctions',count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
UNION ALL SELECT 'policies', count(*) FROM pg_policies WHERE schemaname='public'
UNION ALL SELECT 'triggers', count(*) FROM pg_trigger WHERE NOT tgisinternal;
SQL

psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q <<'SQL'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname='public';
  IF n < 50 THEN RAISE EXCEPTION 'Schema public quasi vide (% tables) : le rejeu n''a pas reconstruit la base', n; END IF;
  -- Garde-fou cible : la version marketplace de programs doit etre celle rejouee.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='programs' AND column_name='stripe_price_id') THEN
    RAISE EXCEPTION 'programs est dans sa version « affiliation » : le baseline ne reflete pas la prod';
  END IF;
END $$;
SQL

echo "==> REJEU OK"
