#!/usr/bin/env node
/**
 * Suite — liens e-mail Supabase Auth, vraie forme GoTrue (pile jetable).
 *
 * On ne fabrique pas d'URL : on demande à GoTrue de générer le lien tel qu'il
 * part dans l'e-mail (`admin.generateLink`), on le suit sans suivre la
 * redirection, et on lit le `Location` du 303. C'est ce que le navigateur de
 * l'utilisateur reçoit, à l'octet.
 *
 *   verify?token=…&type=recovery&redirect_to=…  → 303 → <redirect_to>#access_token=…&type=recovery
 *
 * Trois faits affirmés :
 *   1. signup + emailRedirectTo /email-confirme   → atterrit sur /email-confirme
 *   2. recovery + redirectTo /update-password     → atterrit sur /update-password
 *   3. recovery SANS redirectTo                   → atterrit sur le Site URL (/email-confirme,
 *      comme en prod) : c'est la régression 1.0.52 A4, affirmée pour rester documentée.
 *
 * Variables : TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TEST_SUPABASE_URL;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error('TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY manquants');
  process.exit(2);
}
if (/supabase\.co/.test(URL_)) {
  console.error('Refus : URL de production détectée');
  process.exit(2);
}

// Mêmes constantes que src/lib/urls.ts — recopiées à dessein : la suite affirme
// la forme du lien reçu, pas ce que le code croit envoyer.
const WEB_URL = 'https://athlexapp.eu';
const EMAIL_CONFIRMED_URL = `${WEB_URL}/email-confirme`;
const UPDATE_PASSWORD_URL = `${WEB_URL}/update-password`;
const SITE_URL = EMAIL_CONFIRMED_URL; // supabase/config.toml [auth].site_url, aligné sur la prod

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

let ok = 0, ko = 0;
function assert(cond, label, extra) {
  if (cond) { ok++; console.log(`  ✅ ${label}`); }
  else { ko++; console.log(`  ❌ ${label}`); if (extra) console.log('     ', extra); }
  return cond;
}
const mask = s => String(s).replace(/(token|access_token|refresh_token)=[^&]+/g, '$1=…');

async function follow(actionLink) {
  const res = await fetch(actionLink, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') ?? '' };
}

function landing(location) {
  // Partie avant le fragment implicite (#access_token…) ou la query PKCE (?code=…)
  return location.split(/[#?]/)[0];
}

async function main() {
  console.log('══ Liens e-mail GoTrue — vraie forme, redirection réelle ═════════════════');
  const stamp = Date.now();
  const created = [];

  // 1. signup → /email-confirme
  {
    const email = `a4.signup.${stamp}@athlex.test`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup', email, password: 'Passw0rd!a4',
      options: { redirectTo: EMAIL_CONFIRMED_URL },
    });
    if (assert(!error, 'signup : lien généré par GoTrue', error?.message)) {
      created.push(data.user.id);
      const link = data.properties.action_link;
      assert(/\/auth\/v1\/verify\?token=.+&type=signup&redirect_to=/.test(link),
        `signup : forme verify?token=…&type=signup&redirect_to=… (${mask(link)})`);
      const { status, location } = await follow(link);
      assert(status === 303 && landing(location) === EMAIL_CONFIRMED_URL,
        `signup : 303 → ${EMAIL_CONFIRMED_URL} (${status} → ${mask(location)})`);
      assert(/[#&]type=signup(&|$)/.test(location), 'signup : le fragment porte type=signup');
    }
  }

  // 2. recovery + redirectTo → /update-password (ce que fait AuthContext.resetPassword)
  {
    const email = `a4.recovery.${stamp}@athlex.test`;
    const { data: u, error: e0 } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!a4', email_confirm: true });
    if (assert(!e0, 'recovery : compte jetable créé', e0?.message)) {
      created.push(u.user.id);
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo: UPDATE_PASSWORD_URL },
      });
      if (assert(!error, 'recovery : lien généré par GoTrue', error?.message)) {
        const link = data.properties.action_link;
        assert(/\/auth\/v1\/verify\?token=.+&type=recovery&redirect_to=/.test(link),
          `recovery : forme verify?token=…&type=recovery&redirect_to=… (${mask(link)})`);
        const { status, location } = await follow(link);
        assert(status === 303 && landing(location) === UPDATE_PASSWORD_URL,
          `recovery avec redirectTo : 303 → ${UPDATE_PASSWORD_URL} (${status} → ${mask(location)})`);
        assert(/[#&]type=recovery(&|$)/.test(location), 'recovery : le fragment porte type=recovery');
        assert(/#access_token=.+&refresh_token=/.test(location), 'recovery : jetons implicites dans le fragment (setSession possible côté page)');
      }

      // 3. recovery SANS redirectTo → Site URL = /email-confirme : la régression A4
      const { data: d2, error: e2 } = await admin.auth.admin.generateLink({ type: 'recovery', email });
      if (assert(!e2, 'recovery sans redirectTo : lien généré', e2?.message)) {
        const { status, location } = await follow(d2.properties.action_link);
        assert(status === 303 && landing(location) === SITE_URL,
          `recovery SANS redirectTo : atterrit sur le Site URL ${SITE_URL}, sans formulaire — la régression A4 (${status} → ${mask(location)})`);
        assert(landing(location) !== UPDATE_PASSWORD_URL,
          'recovery SANS redirectTo : n\'atteint PAS /update-password — le redirectTo est indispensable');
      }
    }
  }

  for (const id of created) await admin.auth.admin.deleteUser(id);

  console.log(`\n${ko ? '❌' : '✅'}  ${ok} réussi(s), ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
