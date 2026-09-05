#!/usr/bin/env node
// Suite — group_messages.sender_id survit à la suppression de l'expéditeur.
//
// Pile jetable uniquement (TEST_ADMIN_DB_URL). Décor dans une transaction
// annulée à la fin : une box, un groupe, deux athlètes A et B, un message de
// chacun. Suppression de A par le chemin réel — delete_user_account() sous
// son identité (request.jwt.claims + SET ROLE authenticated) — puis relecture :
// ses messages restent avec sender_id NULL, ceux de B sont intacts.
//
// Mutation inverse : `./scripts/test-group-messages-sender-mutation.sh`
// retire la clé sur la pile → cette suite doit devenir rouge (GM_ORPHELIN).
import { execFileSync } from 'child_process';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.TEST_ADMIN_DB_URL;
if (!DB_URL) { console.error('TEST_ADMIN_DB_URL manquant'); process.exit(2); }
if (/supabase\.co/.test(DB_URL)) { console.error('Refus : URL de prod'); process.exit(2); }

const tag = randomUUID().slice(0, 8);
const A = randomUUID(), B = randomUUID(), OWNER = randomUUID();
const BOX = randomUUID(), GROUP = randomUUID();

const mkUser = (id, name) => `
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    '${name}-${tag}@test.local', '', now(), '{"provider":"email"}', '{}', now(), now());
  insert into public.profiles (id, username, email) values ('${id}', '${name}${tag}', '${name}-${tag}@test.local')
  on conflict (id) do update set username = excluded.username, email = excluded.email;`;

// Chaque select CLE=valeur est une assertion relue côté Node.
const sql = `
begin;
${mkUser(OWNER, 'own')}${mkUser(A, 'alpha')}${mkUser(B, 'beta')}
insert into public.boxes (id, name, owner_id, invite_code) values ('${BOX}', 'Box ${tag}', '${OWNER}', 'INV${tag}');
insert into public.message_groups (id, box_id, name, members)
  values ('${GROUP}', '${BOX}', 'G ${tag}', array['${A}','${B}']::uuid[]);
insert into public.group_messages (group_id, sender_id, content)
  values ('${GROUP}', '${A}', 'de A'), ('${GROUP}', '${B}', 'de B');

select 'FK=' || coalesce((select confdeltype::text from pg_constraint where conname='group_messages_sender_id_fkey'), 'absente');
select 'AVANT=' || count(*) from public.group_messages where group_id='${GROUP}';

select set_config('request.jwt.claims', '{"sub":"${A}","role":"authenticated"}', true);
set local role authenticated;
select public.delete_user_account();
reset role;

select 'PROFIL_A=' || count(*) from public.profiles where id='${A}';
select 'APRES=' || count(*) from public.group_messages where group_id='${GROUP}';
select 'MSG_A=' || coalesce(sender_id::text, 'NULL') from public.group_messages where group_id='${GROUP}' and content='de A';
select 'MSG_B=' || coalesce(sender_id::text, 'NULL') from public.group_messages where group_id='${GROUP}' and content='de B';
select 'ORPHELINS=' || count(*) from public.group_messages gm
  where sender_id is not null and not exists (select 1 from public.profiles p where p.id = gm.sender_id);
rollback;`;

let out;
try {
  out = execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-q'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (e) {
  console.log(`❌ psql a échoué : ${e.stderr?.trim() || e.message}`);
  console.log('GROUP_MESSAGES_SENDER=0/1');
  process.exit(1);
}
const got = Object.fromEntries(out.split('\n').filter(l => l.includes('=')).map(l => l.split('=')));

let failed = 0, passed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`✅ ${label}`); }
  else { failed++; console.log(`❌ ${label} ${detail}`); }
};
ok('clé group_messages_sender_id_fkey présente, ON DELETE SET NULL', got.FK === 'n', `(confdeltype=${got.FK})`);
ok('décor : 2 messages avant suppression', got.AVANT === '2', `(${got.AVANT})`);
ok('delete_user_account() de A : profil supprimé', got.PROFIL_A === '0', `(${got.PROFIL_A})`);
ok('les 2 messages du groupe sont toujours là', got.APRES === '2', `(${got.APRES})`);
ok('GM_ORPHELIN : le message de A reste, sender_id NULL', got.MSG_A === 'NULL', `(sender_id=${got.MSG_A ?? 'ligne absente'})`);
ok('le message de B garde son expéditeur', got.MSG_B === B, `(${got.MSG_B})`);
ok('aucun sender_id orphelin dans la table', got.ORPHELINS === '0', `(${got.ORPHELINS})`);

console.log(`GROUP_MESSAGES_SENDER=${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
