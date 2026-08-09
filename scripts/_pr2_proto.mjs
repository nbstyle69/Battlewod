// Protocole PR2 (colonnes explicites + RPC) sur la pile de TEST. Jamais la prod.
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const DB = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';
if (!URL || URL.includes('supabase.co')) { console.error('cible invalide'); process.exit(1); }

const BOX_COLUMNS = 'id, owner_id, name, slug, tagline, description, logo_url, cover_url, address, city, postal_code, country, latitude, longitude, phone, contact_email, website_url, instagram_url, google_maps_url, opening_hours, founded_at, sport_type, services, allowed_tournament_formats, terms_pdf_url, daily_publish_hour, weekly_publish_day, weekly_publish_hour, is_active, is_listed, member_count, created_at';
const BOX_MEMBERSHIP_COLUMNS = `box_id, role, boxes(${BOX_COLUMNS})`;
const PROFILE_COLUMNS = 'id, username, avatar_url, level, role, elo, total_matches, wins, losses, created_at, full_name, bio, personal_records, gender, featured_badges, total_scores_submitted, total_wods_generated, total_timer_sessions, total_messages_sent, total_tournaments, total_tournament_wins, total_friends, referral_code, referred_by';

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const sql = (q) => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -f -`, { input: q, stdio: 'pipe' }).toString();

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const mail = (n) => `zz_pr2_${n}_${stamp}@test.athlex.io`;

async function makeUser(n, role) {
  const { data, error } = await svc.auth.admin.createUser({
    email: mail(n), password: 'Passw0rd!23', email_confirm: true,
  });
  if (error) throw error;
  const id = data.user.id;
  await svc.from('profiles').upsert({
    id, email: mail(n), username: `zz_pr2_${n}_${stamp}`, level: 'rx', role,
    elo: 1000, total_matches: 0, wins: 0, losses: 0,
  }, { onConflict: 'id' });
  return id;
}

async function login(n) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: mail(n), password: 'Passw0rd!23' });
  if (error) throw error;
  return c;
}

async function suite(label, owner, member, boxId) {
  const p = await owner.from('profiles').select(PROFILE_COLUMNS).eq('id', (await owner.auth.getUser()).data.user.id).single();
  check(`${label} profil colonnes explicites`, !p.error && !!p.data?.username, p.error?.code ?? '');

  const authUser = await owner.auth.getUser();
  check(`${label} e-mail depuis auth.getUser()`, !!authUser.data.user?.email);

  const b = await owner.from('boxes').select(BOX_COLUMNS).eq('owner_id', authUser.data.user.id).maybeSingle();
  check(`${label} box owner colonnes explicites`, !b.error && b.data?.name === 'zz PR2 Box', b.error?.code ?? '');
  check(`${label} champs d'affichage présents`, !!b.data && ['slug', 'city', 'tagline', 'services', 'logo_url'].every(k => k in b.data));

  const m = await member.from('box_members').select(BOX_MEMBERSHIP_COLUMNS).eq('member_id', (await member.auth.getUser()).data.user.id).eq('status', 'active');
  check(`${label} adhésion + embed box explicite`, !m.error && m.data?.length === 1 && !!m.data[0].boxes, m.error?.code ?? '');

  const dir = await member.from('boxes').select(BOX_COLUMNS).eq('is_listed', true).eq('is_active', true);
  check(`${label} annuaire public`, !dir.error && dir.data.length >= 1, dir.error?.code ?? '');

  const det = await member.from('boxes').select(BOX_COLUMNS).eq('id', boxId).single();
  check(`${label} fiche box`, !det.error && det.data.name === 'zz PR2 Box', det.error?.code ?? '');

  const code = await owner.rpc('get_my_box_invite_code', { p_box_id: boxId });
  check(`${label} invite code via RPC (owner)`, !code.error && code.data === `ZZ${String(stamp).slice(-6)}`, code.error?.code ?? String(code.data));

  const codeMember = await member.rpc('get_my_box_invite_code', { p_box_id: boxId });
  check(`${label} invite code refusé au membre`, !codeMember.error && codeMember.data === null, String(codeMember.data));

  const emails = await owner.rpc('get_box_member_emails', { p_box_id: boxId });
  check(`${label} e-mails membres via RPC (owner)`, !emails.error && emails.data.length === 1 && emails.data[0].email.startsWith('zz_pr2_member'), emails.error?.code ?? JSON.stringify(emails.data));

  const emailsMember = await member.rpc('get_box_member_emails', { p_box_id: boxId });
  check(`${label} e-mails refusés au membre`, !emailsMember.error && (emailsMember.data ?? []).length === 0, JSON.stringify(emailsMember.data));
}

(async () => {
  const ownerId = await makeUser('owner', 'box_owner');
  const memberId = await makeUser('member', 'member');

  const { data: box, error: boxErr } = await svc.from('boxes').insert({
    owner_id: ownerId, name: 'zz PR2 Box', slug: `zz-pr2-${stamp}`, invite_code: `ZZ${String(stamp).slice(-6)}`,
    city: 'Lyon', tagline: 'test', is_active: true, is_listed: true,
    services: ['parking'], sport_type: ['crossfit'], logo_url: 'https://x/logo.png',
  }).select('id').single();
  if (boxErr) throw boxErr;
  await svc.from('box_members').insert({ box_id: box.id, member_id: memberId, status: 'active', role: 'member' });

  const owner = await login('owner');
  const member = await login('member');

  console.log('\n=== AVANT revokes ===');
  await suite('avant', owner, member, box.id);

  console.log('\n=== Revokes Phase 3 simulés ===');
  // Un REVOKE par colonne ne suffit pas tant que le GRANT de table subsiste :
  // Phase 3 retire le grant de table puis le re-donne colonne par colonne.
  sql(`
    do $$
    declare cols text;
    begin
      select string_agg(quote_ident(column_name), ', ') into cols
        from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles' and column_name <> 'email';
      execute 'revoke select on public.profiles from authenticated';
      execute format('grant select (%s) on public.profiles to authenticated', cols);

      select string_agg(quote_ident(column_name), ', ') into cols
        from information_schema.columns
       where table_schema = 'public' and table_name = 'boxes'
         and column_name not in ('invite_code', 'stripe_account_id', 'dunning_grace_days');
      execute 'revoke select on public.boxes from authenticated';
      execute format('grant select (%s) on public.boxes to authenticated', cols);
    end $$;`);

  const leak = await owner.from('profiles').select('id, email').eq('id', ownerId).single();
  check('revoke effectif : profiles.email refusé', leak.error?.code === '42501', leak.error?.code ?? 'aucune erreur');
  const leakBox = await owner.from('boxes').select('id, invite_code').eq('id', box.id).single();
  check('revoke effectif : boxes.invite_code refusé', leakBox.error?.code === '42501', leakBox.error?.code ?? 'aucune erreur');
  const star = await owner.from('boxes').select('*').eq('id', box.id).single();
  check("revoke effectif : select('*') sur boxes refusé", star.error?.code === '42501', star.error?.code ?? 'aucune erreur');

  console.log('\n=== APRÈS revokes (le code de la PR 2 doit survivre) ===');
  await suite('après', owner, member, box.id);

  sql(`grant select on public.profiles to authenticated;
       grant select on public.boxes to authenticated;`);

  await svc.from('boxes').delete().eq('id', box.id);
  for (const id of [ownerId, memberId]) await svc.auth.admin.deleteUser(id);
  const { count } = await svc.from('profiles').select('id', { count: 'exact', head: true }).like('username', 'zz_pr2_%');
  check('fixtures purgées', count === 0, `résidu ${count}`);

  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
})().catch(e => { console.error("ERR", JSON.stringify(e, null, 2)); process.exit(1); });
