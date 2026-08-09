#!/usr/bin/env bash
# Compare l'inventaire d'objets de la PROD a celui d'une base vierge rejouee.
# Usage (local uniquement, jamais en CI : demande l'URL de la prod) :
#
#   KEEP=1 ./scripts/db-replay.sh          # laisse la base locale debout
#   SUPABASE_DB_URL=... ./scripts/db-fidelity.sh
#
# Sortie attendue : « ecarts=0 » sur les 8 dimensions.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL manquant (URL de la prod, lecture seule)}"
LOCAL="${LOCAL_DB_URL:-postgresql://supabase_admin:postgres@127.0.0.1:54329/postgres}"
OUT="$(mktemp -d)"
rc=0

q_cols="SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1;"
q_fn="SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1;"
q_pol="SELECT tablename||'|'||policyname||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' ORDER BY 1;"
q_trg="SELECT c.relname||'.'||t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' ORDER BY 1;"
q_idx="SELECT tablename||'|'||indexname FROM pg_indexes WHERE schemaname='public' ORDER BY 1;"
# ACL reelles (aclexplode) : information_schema ignore MAINTAIN et masque la
# distinction entre grant de table et grant de colonne.
q_grant="SELECT c.relname||'|'||pg_get_userbyid(a.grantee)||'|'||a.privilege_type FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role') ORDER BY 1;"
q_cgrant="SELECT c.relname||'.'||att.attname||'|'||pg_get_userbyid(a.grantee)||'|'||a.privilege_type FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute att ON att.attrelid=c.oid AND att.attnum>0 AND NOT att.attisdropped CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role') ORDER BY 1;"
q_rgrant="SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||pg_get_userbyid(a.grantee)||'|'||a.privilege_type FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE n.nspname='public' AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role') ORDER BY 1;"

for k in cols fn pol trg idx grant cgrant rgrant; do
  eval "q=\$q_$k"
  # meme search_path des deux cotes : sinon pg_get_expr qualifie differemment
  # (auth.uid() vs uid()) et produit un faux ecart.
  psql "$SUPABASE_DB_URL" -X -q -t -A -c "SET search_path=''; $q" | sort > "$OUT/prod_$k.txt"
  psql "$LOCAL"           -X -q -t -A -c "SET search_path=''; $q" | sort > "$OUT/local_$k.txt"
  d=$(diff "$OUT/prod_$k.txt" "$OUT/local_$k.txt" | grep -c '^[<>]' || true)
  printf '%-8s prod=%-6s local=%-6s ecarts=%s\n' "$k" "$(wc -l < "$OUT/prod_$k.txt")" "$(wc -l < "$OUT/local_$k.txt")" "$d"
  if [ "$d" != "0" ]; then diff "$OUT/prod_$k.txt" "$OUT/local_$k.txt" | head -25; rc=1; fi
done

exit $rc
