-- ── Changelog entries for maintenance sprint (April 2026) ──────────────────

-- 1. Empty catch blocks → captureError
INSERT INTO app_changelog (title, body, type) VALUES (
  'Correction des catch vides → captureError',
  '46 blocs catch vides remplacés par captureError(e, { action }) dans 13 fichiers pour un meilleur suivi des erreurs via Sentry. Fichiers : TimerRunScreen, AuthContext, WODDetailScreen, WodGeneratorCard, BOTournamentScreen, FriendsScreen, DailyTournamentDetailScreen, BOWODsScreen, MessagesScreen, PhysicalCompetitionScreen, TournamentScreen, OneRMCalculatorScreen, WODGeneratorScreen.',
  'fix'
);

-- 2. Unused native modules removed
INSERT INTO app_changelog (title, body, type) VALUES (
  'Suppression des modules natifs inutilisés',
  'Modules screen-recorder et video-overlay supprimés du projet (package.json + dossiers). Réduction de la taille du build et de la complexité. Seul realtime-recorder est conservé.',
  'update'
);

-- 3. Deep Linking files
INSERT INTO app_changelog (title, body, type) VALUES (
  'Deep Linking — fichiers serveur configurés',
  'Fichiers apple-app-site-association (iOS Universal Links) et assetlinks.json (Android App Links) créés et déployés sur Netlify. Team ID : 3PUMVUB2ZB, SHA-256 Android configuré. Middleware Next.js mis à jour pour ne pas bloquer .well-known.',
  'feature'
);

-- 4. Share buttons
INSERT INTO app_changelog (title, body, type) VALUES (
  'Boutons de partage ajoutés sur 7 écrans',
  'Bouton Share ajouté sur : WODDetailScreen (athlex://wod/), DailyTournamentDetailScreen (athlex://daily/), TournamentScreen (athlex://tournament/), PublicProfileScreen (athlex://profile/), PhysicalCompetitionScreen (athlex://inter/), VideoPlaybackScreen (partage vidéo), WodGeneratorCard (texte du WOD généré).',
  'feature'
);
