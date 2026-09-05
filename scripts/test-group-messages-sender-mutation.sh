#!/usr/bin/env bash
# Mutation inverse — group_messages.sender_id.
# Retire la clé étrangère sur la pile jetable : la suite doit devenir rouge
# (sans clé, delete_user_account laisse un orphelin ou échoue selon l'ordre des
# suppressions — dans les deux cas, GM_ORPHELIN ou ORPHELINS tombe). Puis rejoue
# la migration et exige le vert.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${TEST_ADMIN_DB_URL:?TEST_ADMIN_DB_URL manquant}"
case "$TEST_ADMIN_DB_URL" in *supabase.co*) echo "Refus : URL de prod" >&2; exit 2;; esac


echo "==> Mutant : clé group_messages_sender_id_fkey retirée"
psql "$TEST_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q \
  -c "alter table public.group_messages drop constraint group_messages_sender_id_fkey;"
if node scripts/test-group-messages-sender.mjs; then
  echo "❌ MUTANT SURVIVANT : la suite est restée verte sans la clé" >&2
  psql "$TEST_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q \
    -c "alter table public.group_messages add constraint group_messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete set null;"
  exit 1
fi
echo "✅ mutant tué"

echo "==> Restauration : clé reposée"
psql "$TEST_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q \
  -c "alter table public.group_messages add constraint group_messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete set null;"
node scripts/test-group-messages-sender.mjs
