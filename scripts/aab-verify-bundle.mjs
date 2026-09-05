/**
 * Vérification du bundle réellement embarqué dans l'AAB Android produit par EAS —
 * pendant de scripts/ipa-verify-bundle.mjs.
 *
 * On télécharge l'artefact réel, on ouvre l'archive, on lit le JS embarqué
 * (base/assets/index.android.bundle) et le manifeste natif (protobuf, lu via
 * bundletool), et on affirme ce qui doit être vrai à la première ouverture —
 * avant toute mise à jour OTA.
 *
 * Usage : npm run verify:aab -- <url-aab> [--version-code=<entier attendu>]
 * Prérequis : java. bundletool est téléchargé une fois dans ~/.cache/athlex/
 * (ou lu depuis $BUNDLETOOL_JAR).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const url = process.argv[2];
if (!url) {
  console.error('usage: npm run verify:aab -- <url-aab> [--version-code=<entier>]');
  process.exit(2);
}

const BUNDLETOOL_VERSION = '1.18.3';
const bundletool = (() => {
  if (process.env.BUNDLETOOL_JAR) return process.env.BUNDLETOOL_JAR;
  const cache = path.join(homedir(), '.cache', 'athlex');
  const jar = path.join(cache, `bundletool-all-${BUNDLETOOL_VERSION}.jar`);
  if (!existsSync(jar)) {
    mkdirSync(cache, { recursive: true });
    console.log('# téléchargement de bundletool', BUNDLETOOL_VERSION);
    execFileSync('curl', ['-sSL', '-o', jar,
      `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`],
    { stdio: 'inherit' });
  }
  return jar;
})();

const dir = mkdtempSync(path.join(tmpdir(), 'aab-'));
const aab = path.join(dir, 'app.aab');
console.log('# téléchargement de l’artefact réel');
execFileSync('curl', ['-sSL', '-o', aab, url], { stdio: 'inherit' });
console.log('  taille AAB :', (statSync(aab).size / 1e6).toFixed(1), 'Mo');

execFileSync('unzip', ['-q', '-o', aab, '-d', path.join(dir, 'x')]);
const baseDir = path.join(dir, 'x', 'base');
if (!existsSync(baseDir)) {
  console.error('ÉCHEC: module base/ absent — ce n’est pas un Android App Bundle');
  process.exit(1);
}

const walk = (p, out = []) => {
  for (const n of readdirSync(p)) {
    const f = path.join(p, n);
    const st = statSync(f);
    if (st.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
};
const files = walk(baseDir);

const jsFiles = files.filter((f) => /\.bundle$/.test(f) || /\.jsbundle$/.test(f) || /index\.android\.bundle/.test(f));
if (!jsFiles.length) {
  console.error('ÉCHEC: aucun bundle JS embarqué dans l’AAB');
  process.exit(1);
}
const jsPath = jsFiles.sort((a, b) => statSync(b).size - statSync(a).size)[0];
const js = readFileSync(jsPath, 'utf8');
console.log('  bundle JS   :', path.relative(baseDir, jsPath), (js.length / 1e6).toFixed(1), 'Mo');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 1. Vrai bundle (bytecode Hermes, magic c61fbc03), pas une page d'erreur.
const hermes = readFileSync(jsPath).subarray(0, 4).toString('hex') === 'c61fbc03';
check('bundle JS non vide et non HTML', js.length > 2_000_000 && !/^\s*<!DOCTYPE/i.test(js),
  `${(js.length / 1e6).toFixed(1)} Mo, ${hermes ? 'bytecode Hermes' : 'JS texte'}`);

// 2. Chemin d'authentification par la RPC (mêmes chaînes que l'IPA).
check('nom de RPC get_my_profile embarqué', js.includes('get_my_profile'));
check('branche d’erreur get_my_profile embarquée',
  js.includes("et_my_profile n'a rendu aucune ligne pour")
  && js.includes('et_my_profile a rendu null'));

// 3. Colonnes révoquées absentes des listes de colonnes littérales.
const columnLists = [...new Set(js.match(/(?:[a-z_]{3,30}, ){2,}[a-z_]{3,30}/g) || [])];
check('des listes de colonnes sont bien lisibles dans le bundle', columnLists.length >= 20,
  `${columnLists.length} listes`);
const REVOKED = ['full_name', 'gender', 'personal_records'];
for (const col of REVOKED) {
  const bad = columnLists.filter((l) => new RegExp(`\\b${col}\\b`).test(l));
  check(`aucune liste de colonnes ne demande ${col}`, bad.length === 0,
    bad.length ? bad.slice(0, 3).join(' | ') : 'aucune occurrence');
}

// 4. Configuration Supabase embarquée (défaut du build 44 côté iOS).
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

// 5. Identité du binaire : le manifeste d'un AAB est en protobuf, bundletool
//    le rend en XML texte. Les réglages OTA d'Expo y sont des <meta-data>.
const manifest = execFileSync('java', ['-jar', bundletool, 'dump', 'manifest', '--bundle', aab],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const attr = (re) => { const m = manifest.match(re); return m ? m[1] : null; };
const versionName = attr(/android:versionName="([^"]*)"/);
const versionCode = attr(/android:versionCode="(\d+)"/);
const pkg = attr(/<manifest[^>]*\bpackage="([^"]*)"/);
const meta = (name) => attr(new RegExp(`<meta-data[^>]*android:name="${name.replace(/\./g, '\\.')}"[^>]*android:value="([^"]*)"`));
// Expo écrit le runtime dans une ressource string (@string/expo_runtime_version),
// pas en littéral : on la résout dans la table de ressources.
const resolveString = (ref) => {
  const m = /^@string\/(.+)$/.exec(ref || '');
  if (!m) return ref;
  const dump = execFileSync('java', ['-jar', bundletool, 'dump', 'resources', '--bundle', aab,
    '--resource', `string/${m[1]}`, '--values'], { encoding: 'utf8' });
  const v = dump.match(/\(default\)\s*-\s*\[STR\]\s*"([^"]*)"/) || dump.match(/\[STR\]\s*"([^"]*)"/);
  return v ? v[1] : ref;
};
const runtime = resolveString(meta('expo.modules.updates.EXPO_RUNTIME_VERSION'));
const updateUrl = meta('expo.modules.updates.EXPO_UPDATE_URL');
const headersRaw = meta('expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY');
let channel = null;
if (headersRaw) {
  try { channel = JSON.parse(headersRaw.replace(/&quot;/g, '"'))['expo-channel-name'] ?? null; } catch { channel = null; }
}
const permissions = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]*)"/g)].map((m) => m[1]);
console.log('# identité du binaire');
console.log('  versionName  :', versionName);
console.log('  versionCode  :', versionCode);
console.log('  package      :', pkg);
console.log('  runtime OTA  :', runtime ?? '(absent)');
console.log('  canal OTA    :', channel ?? '(absent)');
console.log('  URL OTA      :', updateUrl ?? '(absent)');
console.log('  permissions  :', permissions.length ? '\n    ' + permissions.join('\n    ') : '(aucune)');

const expected = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')).expo;
check('versionName = app.json', versionName === expected.version, `${versionName} vs ${expected.version}`);
check('package = app.json', pkg === expected.android.package, `${pkg} vs ${expected.android.package}`);
// EAS incrémente le versionCode côté serveur (autoIncrement) : la valeur
// attendue est donnée en argument, pas lue dans app.json.
const expectedCode = (process.argv[3] || '').replace(/^--version-code=/, '');
if (expectedCode) {
  check('versionCode = valeur attendue', versionCode === expectedCode, `${versionCode} vs ${expectedCode}`);
}
check('runtime OTA = version applicative', runtime === expected.version, runtime ?? 'absent');
check('canal OTA = production', channel === 'production', channel ?? 'absent');
check('URL OTA = projet EAS de app.json', updateUrl === expected.updates.url, updateUrl ?? 'absente');
// Confidentialité : l'app n'a aucune permission de localisation (Data Safety).
check('aucune permission de localisation', !permissions.some((p) => /LOCATION/.test(p)),
  permissions.filter((p) => /LOCATION/.test(p)).join(', ') || 'aucune');

// 6. Clé Google Maps Android : présente (sinon carte grise) et jamais l'ancienne
//    clé ouverte de juin. Les fins de clé (derniers caractères) sont passées par
//    variables d'environnement : la clé attendue ne vit pas dans le dépôt public.
const mapsKey = meta('com.google.android.geo.API_KEY');
check('clé Google Maps Android présente dans le manifeste', !!mapsKey && mapsKey.length > 20,
  mapsKey ? `${mapsKey.slice(0, 6)}… (${mapsKey.length} car.)` : 'absente (GOOGLE_MAPS_ANDROID_API_KEY vide au build)');
const badSuffix = process.env.MAPS_KEY_FORBIDDEN_SUFFIX || '';
if (badSuffix) {
  check(`clé Maps ≠ ancienne clé ouverte (…${badSuffix})`, !!mapsKey && !mapsKey.endsWith(badSuffix),
    mapsKey ? `…${mapsKey.slice(-5)}` : 'absente');
}
const goodSuffix = process.env.MAPS_KEY_EXPECTED_SUFFIX || '';
if (goodSuffix) {
  check(`clé Maps = clé restreinte attendue (…${goodSuffix})`, !!mapsKey && mapsKey.endsWith(goodSuffix),
    mapsKey ? `…${mapsKey.slice(-5)}` : 'absente');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vraies`);
if (failed.length) {
  console.log('assertions fausses : ' + failed.map((f) => f.name).join(' ; '));
  process.exit(1);
}
