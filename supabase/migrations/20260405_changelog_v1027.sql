-- ── Changelog entries for v1.0.27 (5 avril 2026) ──────────────────

-- 1. Android Camera2 rewrite
INSERT INTO app_changelog (title, body, type) VALUES (
  'Réécriture du module vidéo Android (Camera2 API)',
  'Remplacement complet de CameraX par Camera2 API pour le module realtime-recorder Android. Décomposition en 8 classes modulaires : EglCore, CameraTextureRenderer, VideoEncoder, VideoMuxer, AudioEncoder, CameraController, VideoRecorderEngine, RecordingForegroundService. Qualité vidéo améliorée (TEMPLATE_RECORD), overlay burn temps réel 30 FPS, synchronisation audio/vidéo précise, support enregistrements longs via service foreground.',
  'feature'
);

-- 2. Suppression modules inutilisés
INSERT INTO app_changelog (title, body, type) VALUES (
  'Nettoyage : suppression modules screen-recorder et video-overlay',
  'Les modules natifs screen-recorder et video-overlay ont été supprimés du projet (Android + iOS). Seul realtime-recorder est conservé. Réduction de la taille du build.',
  'update'
);

-- 3. Back-Office Infos Box
INSERT INTO app_changelog (title, body, type) VALUES (
  'Back-Office : nouvelle page Infos Box',
  'Nouvel écran BO pour gérer les informations de la box : nom, description, adresse, téléphone, email, site web, Google Maps, date de fondation, upload du logo. Accessible depuis le dashboard.',
  'feature'
);

-- 4. Mobile Infos Box
INSERT INTO app_changelog (title, body, type) VALUES (
  'Mobile : page Infos Box',
  'Nouvel écran affichant les infos publiques de la box : adresse cliquable (Google Maps), téléphone (appel direct), email, site web, date de fondation et logo.',
  'feature'
);

-- 5. Composants UI
INSERT INTO app_changelog (title, body, type) VALUES (
  'Nouveaux composants : carrousel, toast, haptiques',
  'AutoScrollCarousel pour bannières animées, composant Toast personnalisé, et module haptics pour retours vibratoires sur les interactions.',
  'feature'
);

-- 6. Deep Linking fichiers serveur
INSERT INTO app_changelog (title, body, type) VALUES (
  'Deep Linking : Universal Links iOS + App Links Android',
  'Fichiers apple-app-site-association et assetlinks.json déployés pour activer les liens universels sur iOS et Android (athlex.app).',
  'feature'
);

-- 7. Améliorations UI globales
INSERT INTO app_changelog (title, body, type) VALUES (
  'Améliorations UI sur 20+ écrans',
  'Refactoring et améliorations sur : HomeScreen, WhiteboardScreen, LoginScreen, RegisterScreen, OnboardingTutorial, ProfileScreen, TimerRunScreen, VideoPlaybackScreen, réservations, compétitions, tournois, WOD générateur et messagerie.',
  'update'
);

-- 8. Fix RLS multi-box
INSERT INTO app_changelog (title, body, type) VALUES (
  'Correction RLS multi-box (récursion infinie)',
  'Réécriture complète des RLS policies multi-box avec fonctions SECURITY DEFINER pour éliminer les sous-requêtes récursives sur box_members.',
  'fix'
);

-- 9. Fix réservation semaine suivante
INSERT INTO app_changelog (title, body, type) VALUES (
  'Correction réservation semaine suivante',
  'La fonction check_weekly_limit utilise maintenant la date cible au lieu de la date du jour, permettant de réserver pour la semaine suivante même si la semaine courante est pleine.',
  'fix'
);

-- 10. WOD sort order
INSERT INTO app_changelog (title, body, type) VALUES (
  'WODs : tri par drag & drop',
  'Ajout de la colonne sort_order sur box_wods pour permettre le réordonnement des WODs par glisser-déposer dans le back-office.',
  'feature'
);

-- 11. Bugfixes Android
INSERT INTO app_changelog (title, body, type) VALUES (
  'Corrections compilation Android',
  'Fix compatibilité Kotlin 2.1 (break/continue dans inline lambdas), fix signalEndOfInputStream manquant (vidéo tronquée), fix return@apply invalides dans VideoRecorderEngine.',
  'fix'
);
