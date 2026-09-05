#!/usr/bin/env bash
# Mutation inverse — finalize_tournament_elo sans l'UPDATE de profiles.
# Le test scripts/test-finalize-elo.mjs DOIT échouer (profil ≠ dernier elo_after),
# sinon il ne protège rien. La migration d'origine est rejouée à la fin.
#
# USAGE : ./scripts/test-stack.sh up && ./scripts/test-finalize-elo-mutation.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ATHLEX_TEST_ENV:-/tmp/athlex-test-stack.env}"
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE absent — lance ./scripts/test-stack.sh up" >&2; exit 2; }
set -a; . "$ENV_FILE"; set +a
: "${TEST_ADMIN_DB_URL:?TEST_ADMIN_DB_URL manquant}"

MIG=supabase/migrations/20261128_finalize_tournament_elo.sql
MUT=$(mktemp)
trap 'rm -f "$MUT"; psql "$TEST_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q -f "$MIG" && echo "↩︎ migration d'"'"'origine rejouée"' EXIT

# Sabotage : on retire la mise à jour du profil (l'historique, lui, est toujours écrit).
awk '/^ *UPDATE profiles p$/ {in_upd=1} in_upd && /WHERE p\.id = d\.athlete_id;/ {sub(/WHERE p\.id = d\.athlete_id;/, "WHERE false; -- MUTATION"); in_upd=0} {print}' "$MIG" > "$MUT"
grep -q -- '-- MUTATION' "$MUT" || { echo "❌ point de mutation introuvable" >&2; exit 2; }
grep -c 'UPDATE profiles p$' "$MIG" | grep -qx 1 || { echo "❌ la migration doit contenir exactement un UPDATE profiles" >&2; exit 2; }

run_mutant() { # $1 = libellé, $2 = fichier muté, $3 = motif attendu dans le log
  psql "$TEST_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q -f "$2"
  echo "☣️  $1"
  if node scripts/test-finalize-elo.mjs > /tmp/felo-mutation.log 2>&1; then
    echo "❌ MUTATION SURVIVANTE ($1) : la suite passe" >&2
    tail -5 /tmp/felo-mutation.log >&2
    exit 1
  fi
  if grep -q -- "$3" /tmp/felo-mutation.log; then
    echo "✅ mutation tuée : $3"
    grep '❌' /tmp/felo-mutation.log | head -4
  else
    echo "❌ la suite échoue, mais pas sur le motif attendu « $3 » :" >&2
    grep '❌' /tmp/felo-mutation.log | head -10 >&2
    exit 1
  fi
}

# Mutant 1 : sans l'UPDATE du profil → la garde interne (profil ≠ elo_after) annule
# la transaction : ELO_INCOHERENT, rien n'est écrit.
run_mutant "sans UPDATE profiles" "$MUT" "ELO_INCOHERENT"

# Mutant 2 : sans l'UPDATE ni la garde interne → c'est le test lui-même qui doit
# voir la divergence profil ↔ historique (le filet du test, pas celui de la fonction).
MUT2=$(mktemp); trap 'rm -f "$MUT" "$MUT2"; psql "$TEST_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q -f "$MIG" && echo "↩︎ migration d'"'"'origine rejouée"' EXIT
sed -E 's/^( *)IF v_bad > 0 THEN$/\1IF false THEN -- MUTATION 2/' "$MUT" > "$MUT2"
grep -q -- '-- MUTATION 2' "$MUT2" || { echo "❌ point de mutation 2 introuvable" >&2; exit 2; }
run_mutant "sans UPDATE profiles ni garde ELO_INCOHERENT" "$MUT2" "❌ simple : profiles.elo = dernier elo_after"
