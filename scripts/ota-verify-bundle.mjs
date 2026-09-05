/**
 * Vérifie que le bundle RÉELLEMENT servi par EAS pour le canal `production`
 * contient de quoi parler au serveur.
 *
 * Pourquoi ce contrôle existe : `process.env.EXPO_PUBLIC_*` est inliné au
 * moment du bundle. Publié sans ces variables, l'update part **sans URL ni clé
 * Supabase** — `createClient('', '')` lève, l'app n'atteint jamais le serveur,
 * et l'appareil affiche un écran de connexion qui échoue en silence. Le
 * garde-fou runtime ne voyait pas cette famille : l'update était applicable,
 * simplement inerte.
 *
 * On ne fait pas confiance à ce qu'on a envoyé : on télécharge ce qui est servi.
 *
 * usage : node scripts/ota-verify-bundle.mjs <projectId> <runtimeVersion>
 */

const [projectId, runtimeVersion] = process.argv.slice(2);

if (!projectId || !runtimeVersion) {
  console.error('usage : node scripts/ota-verify-bundle.mjs <projectId> <runtimeVersion>');
  process.exit(2);
}

const PLATFORMS = ['ios', 'android'];

/**
 * Le manifeste EAS est un multipart/mixed : la partie `manifest` porte les
 * assets, la partie `extensions` porte les en-têtes signés qui les autorisent.
 */
function extractJsonPart(body, name) {
  const marker = `name="${name}"`;
  const at = body.indexOf(marker);
  if (at === -1) throw new Error(`manifeste illisible (partie « ${name} » absente)`);

  const start = body.indexOf('{', at);
  let depth = 0;
  for (let i = start; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error(`manifeste illisible (« ${name} » non terminé)`);
}

async function fetchLaunchBundle(platform) {
  const res = await fetch(`https://u.expo.dev/${projectId}`, {
    headers: {
      'expo-platform': platform,
      'expo-runtime-version': runtimeVersion,
      'expo-channel-name': 'production',
      'expo-protocol-version': '1',
      'expo-api-version': '1',
      accept: 'multipart/mixed',
    },
  });
  if (!res.ok) throw new Error(`manifeste ${platform} : HTTP ${res.status}`);

  const body = await res.text();
  const manifest = extractJsonPart(body, 'manifest');
  const { launchAsset } = manifest;

  // Les assets du CDN exigent l'en-tête signé que le manifeste fournit
  // lui-même : sans lui, la réponse est un 403 en HTML qu'on prendrait pour du
  // JavaScript si on ne regardait que le code de retour.
  const auth = extractJsonPart(body, 'extensions').assetRequestHeaders?.[launchAsset.key];

  const asset = await fetch(launchAsset.url, { headers: auth ?? {} });
  if (!asset.ok) throw new Error(`bundle ${platform} : HTTP ${asset.status}`);

  const bundle = await asset.text();
  if (bundle.startsWith('<!DOCTYPE html')) {
    throw new Error(`bundle ${platform} : réponse HTML (asset refusé), pas du JavaScript`);
  }
  return { updateId: manifest.id, bundle };
}

const failures = [];
const giphyFailures = [];
const GIPHY_TAG_RE = /giphy-key:[A-Za-z0-9]{16,}:giphy-end/;
// DSN Sentry : `https://<clé publique>@o<org>.ingest[.<région>].sentry.io/<projet>`. Le
// SDK embarque aussi sa propre URL de télémétrie (`o447951.ingest.sentry.io`,
// sans `@`) : elle ne compte pas. Sans DSN, `Sentry.init({ dsn: '' })` ne remonte rien.
const SENTRY_DSN_RE = /https:\/\/[0-9a-f]{32}@o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io\/\d+/;
const sentryFailures = [];
// Token Mixpanel : `'mixpanel-token:' + EXPO_PUBLIC_MIXPANEL_TOKEN + ':mixpanel-end'`
// est plié au bundle en un littéral ; sans token il reste `mixpanel-token::mixpanel-end`
// et `analytics.ts` désactive le tracking. Le SDK doit aussi viser le serveur EU du projet.
const MIXPANEL_TAG_RE = /mixpanel-token:[0-9a-f]{32}:mixpanel-end/;
const MIXPANEL_EU_URL = 'https://api-eu.mixpanel.com';
const mixpanelFailures = [];

for (const platform of PLATFORMS) {
  const { updateId, bundle } = await fetchLaunchBundle(platform);

  const hasUrl = /https:\/\/[a-z0-9]+\.supabase\.co/.test(bundle);
  const hasKey = bundle.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  // Même mécanisme pour GIPHY : `'giphy-key:' + EXPO_PUBLIC_GIPHY_KEY + ':giphy-end'`
  // est plié au bundle en un seul littéral ; sans clé il reste `giphy-key::giphy-end`.
  const hasGiphy = GIPHY_TAG_RE.test(bundle);
  const hasSentry = SENTRY_DSN_RE.test(bundle);
  const hasMixpanel = MIXPANEL_TAG_RE.test(bundle) && bundle.includes(MIXPANEL_EU_URL);

  console.log(
    `${platform} : update ${updateId} — ${(bundle.length / 1024 / 1024).toFixed(1)} Mo — `
    + `URL Supabase ${hasUrl ? 'présente' : 'ABSENTE'}, clé anon ${hasKey ? 'présente' : 'ABSENTE'}, `
    + `clé GIPHY ${hasGiphy ? 'présente' : 'ABSENTE'}, DSN Sentry ${hasSentry ? 'présent' : 'ABSENT'}, `
    + `token Mixpanel + serveur EU ${hasMixpanel ? 'présents' : 'ABSENTS'}`,
  );

  if (!hasUrl || !hasKey) failures.push(platform);
  if (!hasGiphy) giphyFailures.push(platform);
  if (!hasSentry) sentryFailures.push(platform);
  if (!hasMixpanel) mixpanelFailures.push(platform);
}

if (failures.length > 0) {
  console.error(
    `::error::Bundle publié sans configuration Supabase (${failures.join(', ')}) : `
    + "l'app ne pourra pas se connecter. Les variables EXPO_PUBLIC_* doivent être "
    + "présentes AU MOMENT du bundle (`eas update --environment production`).",
  );
  process.exit(1);
}

if (giphyFailures.length > 0) {
  console.error(
    `::error::Bundle publié sans clé GIPHY (${giphyFailures.join(', ')}) : `
    + "le sélecteur de GIF afficherait « GIF indisponibles ». EXPO_PUBLIC_GIPHY_KEY "
    + "doit être présente dans l'environnement EAS `production` au moment du bundle.",
  );
  process.exit(1);
}

if (sentryFailures.length > 0) {
  console.error(
    `::error::Bundle publié sans DSN Sentry (${sentryFailures.join(', ')}) : `
    + "aucune erreur ni crash ne remonterait. EXPO_PUBLIC_SENTRY_DSN doit être présente "
    + "dans l'environnement EAS `production` au moment du bundle.",
  );
  process.exit(1);
}

if (mixpanelFailures.length > 0) {
  console.error(
    `::error::Bundle publié sans token Mixpanel ou sans serveur EU (${mixpanelFailures.join(', ')}) : `
    + "aucun événement n'arriverait dans le projet. EXPO_PUBLIC_MIXPANEL_TOKEN doit être "
    + "présente dans l'environnement EAS `production` au moment du bundle et "
    + `analytics.ts doit viser ${MIXPANEL_EU_URL}.`,
  );
  process.exit(1);
}
