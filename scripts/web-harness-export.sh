#!/usr/bin/env bash
# Exporte le bundle web du harnais de test en visant la pile jetable, et REFUSE
# de livrer un bundle qui contient une URL Supabase distante.
#
#   ./scripts/web-harness-export.sh          # cible /tmp/athlex-test-stack.env
#   npx serve -s dist -l 8090                # puis servir le bundle vérifié
#
# Pourquoi un garde et pas une vérification manuelle : les variables
# `EXPO_PUBLIC_SUPABASE_*` sont exportées dans l'environnement du shell et
# ÉCRASENT `.env` au moment de l'export. Un `.env` réécrit sur la pile locale
# produit donc silencieusement un bundle qui parle à la PRODUCTION — un harnais
# de test qui écrit dans la vraie base. Le contrôle est ici bloquant : le
# `dist/` est supprimé si l'URL locale est absente ou si une URL distante est
# présente, pour qu'aucun bundle douteux ne puisse être servi.
set -euo pipefail

ENV_FILE="${TEST_STACK_ENV_FILE:-/tmp/athlex-test-stack.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Pile jetable absente ($ENV_FILE) — lance d'abord ./scripts/test-stack.sh up" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${TEST_SUPABASE_URL:-}" ] || [ -z "${TEST_SUPABASE_ANON_KEY:-}" ]; then
  echo "$ENV_FILE ne porte pas TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY" >&2
  exit 1
fi

# L'hôte attendu dans le bundle, dérivé de la cible réelle (pas d'hôte en dur :
# un port qui change ferait passer le garde à côté de sa vérification).
EXPECTED_HOST="$(printf '%s' "$TEST_SUPABASE_URL" | sed -e 's#^[a-z]*://##' -e 's#/.*$##')"

echo "==> Export du bundle web vers la pile jetable ($TEST_SUPABASE_URL)"
# `--clear` est obligatoire : le cache Metro inline les valeurs de
# `process.env` du précédent export.
EXPO_PUBLIC_SUPABASE_URL="$TEST_SUPABASE_URL" \
EXPO_PUBLIC_SUPABASE_ANON_KEY="$TEST_SUPABASE_ANON_KEY" \
  npx expo export --platform web --clear

BUNDLE_DIR="dist/_expo/static/js/web"
if ! compgen -G "$BUNDLE_DIR/*.js" >/dev/null; then
  echo "Aucun bundle produit dans $BUNDLE_DIR" >&2
  exit 1
fi

fail() {
  echo "GARDE: $1" >&2
  # Un bundle refusé ne doit pas rester servable.
  rm -rf dist
  exit 1
}

# 1. La cible locale doit réellement être dans le bundle : si elle n'y est pas,
#    l'export a pris ses valeurs ailleurs.
if ! grep -qF "$EXPECTED_HOST" "$BUNDLE_DIR"/*.js; then
  fail "l'hôte de la pile jetable ($EXPECTED_HOST) est ABSENT du bundle"
fi

# 2. Aucune URL Supabase distante ne doit s'y trouver. Le motif ne cible pas un
#    identifiant de projet précis : n'importe quel `*.supabase.co` est un échec,
#    y compris un projet de production qu'on ne connaîtrait pas encore.
REMOTE_HITS="$(grep -ohE '[a-z0-9-]+\.supabase\.(co|in)' "$BUNDLE_DIR"/*.js | sort -u || true)"
if [ -n "$REMOTE_HITS" ]; then
  echo "$REMOTE_HITS" >&2
  fail "URL Supabase distante présente dans le bundle (voir ci-dessus)"
fi

echo "==> Bundle vérifié : $EXPECTED_HOST présent, aucune URL Supabase distante"
echo "    npx serve -s dist -l 8090"
