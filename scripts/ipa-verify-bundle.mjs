/**
 * Vérification du bundle réellement embarqué dans l'IPA produit par EAS.
 *
 * On n'inspecte pas ce que la machine locale sait bundler : on télécharge
 * l'artefact réel, on ouvre l'archive, on lit le JS embarqué et le manifeste
 * natif, et on affirme ce qui doit être vrai à la première ouverture — avant
 * toute mise à jour OTA, c'est-à-dire exactement la fenêtre du reviewer Apple.
 *
 * Usage : npm run verify:ipa -- <url-ipa> [--build=<numéro attendu>]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.argv[2];
if (!url) {
  console.error('usage: npm run verify:ipa -- <url-ipa> [--build=<numéro>]');
  process.exit(2);
}

const dir = mkdtempSync(path.join(tmpdir(), 'ipa-'));
const ipa = path.join(dir, 'app.ipa');
console.log('# téléchargement de l’artefact réel');
execFileSync('curl', ['-sSL', '-o', ipa, url], { stdio: 'inherit' });
console.log('  taille IPA :', (statSync(ipa).size / 1e6).toFixed(1), 'Mo');

execFileSync('unzip', ['-q', '-o', ipa, '-d', path.join(dir, 'x')]);
const appDir = (() => {
  const p = path.join(dir, 'x', 'Payload');
  const entry = readdirSync(p).find((n) => n.endsWith('.app'));
  return path.join(p, entry);
})();
console.log('  bundle app  :', path.basename(appDir));

const walk = (p, out = []) => {
  for (const n of readdirSync(p)) {
    const f = path.join(p, n);
    const st = statSync(f);
    if (st.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
};
const files = walk(appDir);

const jsFiles = files.filter((f) => f.endsWith('.bundle') || /\.jsbundle$/.test(f));
if (!jsFiles.length) {
  console.error('ÉCHEC: aucun bundle JS embarqué dans l’IPA');
  process.exit(1);
}
const jsPath = jsFiles.sort((a, b) => statSync(b).size - statSync(a).size)[0];
const js = readFileSync(jsPath, 'utf8');
console.log('  bundle JS   :', path.relative(appDir, jsPath), (js.length / 1e6).toFixed(1), 'Mo');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 1. Le bundle est un vrai bundle JS, pas une page d'erreur ni un fichier tronqué.
//    Le JS embarqué est du bytecode Hermes (magic c61fbc03) : il ne contient plus
//    de source, seulement une table de chaînes. Toutes les assertions ci-dessous
//    portent donc sur des chaînes littérales, pas sur des formes d'appel.
const hermes = readFileSync(jsPath).subarray(0, 4).toString('hex') === 'c61fbc03';
check('bundle JS non vide et non HTML', js.length > 2_000_000 && !/^\s*<!DOCTYPE/i.test(js),
  `${(js.length / 1e6).toFixed(1)} Mo, ${hermes ? 'bytecode Hermes' : 'JS texte'}`);

// 2. Le chemin d'authentification passe par la RPC. Deux preuves distinctes : le
//    nom de la RPC, et les messages d'erreur propres à cette branche — ils
//    n'existent que si le code qui la lit est bien embarqué.
check('nom de RPC get_my_profile embarqué', js.includes('get_my_profile'));
check('branche d’erreur get_my_profile embarquée',
  js.includes("et_my_profile n'a rendu aucune ligne pour")
  && js.includes('et_my_profile a rendu null'));

// 3. Les colonnes révoquées n'apparaissent dans aucune liste de colonnes
//    littérale (les `select('a, b, c')` sont des chaînes du bundle). Contrôle
//    discriminant : on compte d'abord les listes trouvées — s'il n'y en a
//    aucune, l'absence de colonne révoquée ne prouve rien.
const columnLists = [...new Set(js.match(/(?:[a-z_]{3,30}, ){2,}[a-z_]{3,30}/g) || [])];
check('des listes de colonnes sont bien lisibles dans le bundle', columnLists.length >= 20,
  `${columnLists.length} listes`);
const REVOKED = ['full_name', 'gender', 'personal_records'];
for (const col of REVOKED) {
  const bad = columnLists.filter((l) => new RegExp(`\\b${col}\\b`).test(l));
  check(`aucune liste de colonnes ne demande ${col}`, bad.length === 0,
    bad.length ? bad.slice(0, 3).join(' | ') : 'aucune occurrence');
}

// 4. La configuration Supabase est réellement embarquée (sinon l'app est inerte
//    à la connexion : c'est le défaut du build 44).
const urlMatch = js.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
check('URL Supabase embarquée', !!urlMatch, urlMatch ? `projet ${urlMatch[1]}` : 'absente');
const keyMatch = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/);
check('clé anon Supabase embarquée', !!keyMatch,
  keyMatch ? `JWT de ${keyMatch[0].length} caractères` : 'absente');
if (keyMatch) {
  try {
    const payload = JSON.parse(Buffer.from(keyMatch[0].split('.')[1], 'base64').toString());
    check('la clé embarquée est bien un rôle anon', payload.role === 'anon',
      `role=${payload.role} ref=${payload.ref}`);
    check('la clé embarquée pointe le même projet que l’URL',
      !urlMatch || payload.ref === urlMatch[1], `${payload.ref} vs ${urlMatch && urlMatch[1]}`);
  } catch (e) {
    check('la clé embarquée est décodable', false, String(e));
  }
}
// Clé GIPHY : `'giphy-key:' + EXPO_PUBLIC_GIPHY_KEY + ':giphy-end'` est plié au
// bundle en un littéral ; sans clé il reste `giphy-key::giphy-end` et le
// sélecteur de GIF dit « GIF indisponibles ».
const giphyMatch = js.match(/giphy-key:([A-Za-z0-9]{16,}):giphy-end/);
check('clé GIPHY embarquée', !!giphyMatch,
  giphyMatch ? `${giphyMatch[1].length} caractères` : "absente (`giphy-key::giphy-end` ou marqueur manquant)");
// DSN Sentry (`EXPO_PUBLIC_SENTRY_DSN`, inliné dans `Sentry.init`). Le SDK embarque
// sa propre URL de télémétrie (`o447951.ingest.sentry.io`, sans `@`) : elle ne compte pas.
const dsnMatch = js.match(/https:\/\/[0-9a-f]{32}@o(\d+)\.ingest(?:\.[a-z]{2})?\.sentry\.io\/(\d+)/);
check('DSN Sentry embarqué', !!dsnMatch,
  dsnMatch ? `org o${dsnMatch[1]}, projet ${dsnMatch[2]}` : 'absent (EXPO_PUBLIC_SENTRY_DSN vide au moment du bundle)');
// Token Mixpanel : `'mixpanel-token:' + EXPO_PUBLIC_MIXPANEL_TOKEN + ':mixpanel-end'` est
// plié au bundle en un littéral ; sans token il reste `mixpanel-token::mixpanel-end`.
// Le projet est en résidence EU : sans `api-eu.mixpanel.com`, rien n'arrive dans Events.
const mixpanelMatch = js.match(/mixpanel-token:([0-9a-f]{32}):mixpanel-end/);
check('token Mixpanel embarqué', !!mixpanelMatch,
  mixpanelMatch ? `${mixpanelMatch[1].slice(0, 4)}…${mixpanelMatch[1].slice(-4)}` : 'absent (`mixpanel-token::mixpanel-end` ou marqueur manquant)');
check('serveur Mixpanel EU embarqué', js.includes('https://api-eu.mixpanel.com'),
  js.includes('https://api-eu.mixpanel.com') ? 'api-eu.mixpanel.com' : 'absent (le SDK viserait le serveur US par défaut)');

// 5. Identité du binaire : version, build, runtime, canal de mise à jour.
// Les plists d'un IPA sont binaires : on les convertit pour les lire. La
// configuration des mises à jour ne vit pas dans Info.plist mais dans Expo.plist.
const readPlist = (p) => (existsSync(p)
  ? JSON.parse(execFileSync('python3', ['-c',
      'import plistlib,json,sys;print(json.dumps(plistlib.load(open(sys.argv[1],"rb")),default=str))',
      p], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  : {});
const info = readPlist(path.join(appDir, 'Info.plist'));
const expoPlist = readPlist(path.join(appDir, 'Expo.plist'));
const pick = (k) => (k in info ? String(info[k]) : null);
console.log('# identité du binaire');
console.log('  CFBundleShortVersionString :', pick('CFBundleShortVersionString'));
console.log('  CFBundleVersion            :', pick('CFBundleVersion'));
console.log('  CFBundleIdentifier         :', pick('CFBundleIdentifier'));
const runtime = expoPlist.EXUpdatesRuntimeVersion ?? null;
const channel = (expoPlist.EXUpdatesRequestHeaders || {})['expo-channel-name'] ?? null;
console.log('  runtime OTA                :', runtime ?? '(absent)');
console.log('  canal OTA                  :', channel ?? '(absent)');
console.log('  URL OTA                    :', expoPlist.EXUpdatesURL ?? '(absent)');

const expected = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')).expo;
check('version = app.json', pick('CFBundleShortVersionString') === expected.version,
  `${pick('CFBundleShortVersionString')} vs ${expected.version}`);
check('identifiant iOS = app.json', pick('CFBundleIdentifier') === expected.ios.bundleIdentifier);
// EAS incrémente le buildNumber côté serveur : la valeur attendue est donc
// donnée en argument, pas lue dans app.json.
const expectedBuild = (process.argv[3] || '').replace(/^--build=/, '');
if (expectedBuild) {
  check('build natif = valeur attendue', pick('CFBundleVersion') === expectedBuild,
    `${pick('CFBundleVersion')} vs ${expectedBuild}`);
}
check('runtime OTA = version applicative', runtime === expected.version, runtime ?? 'absent');
check('canal OTA = production', channel === 'production', channel ?? 'absent');
check('URL OTA = projet EAS de app.json',
  expoPlist.EXUpdatesURL === expected.updates.url, expoPlist.EXUpdatesURL ?? 'absente');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vraies`);
if (failed.length) {
  console.log('assertions fausses : ' + failed.map((f) => f.name).join(' ; '));
  process.exit(1);
}
