-- ── Changelog entries for v1.0.33 (6 mai 2026) ──────────────────
-- UGC moderation, Store compliance, glassmorphism migration, timer redesign

-- 1. UGC Moderation (signalements + blocage)
INSERT INTO app_changelog (title, body, type) VALUES (
  'Modération UGC : signalements & blocage utilisateurs',
  'Nouveau système de modération pour respecter les guidelines App Store / Play Store. Tu peux désormais signaler du contenu inapproprié (messages, scores, commentaires, profils) et bloquer un utilisateur. Les utilisateurs bloqués n''apparaissent plus dans la messagerie ni dans les profils. Nouvel écran "Utilisateurs bloqués" dans le profil pour gérer la liste. Engagement de modération sous 24h dans les CGU.',
  'feature'
);

-- 2. Admin BO : page Signalements
INSERT INTO app_changelog (title, body, type) VALUES (
  'Back-Office : page de modération des signalements',
  'Nouvelle page admin /reports pour traiter les signalements UGC : filtres par statut (pending / reviewing / resolved / dismissed), modal de détail, actions de résolution. Permet à l''équipe AthleX de répondre aux signalements dans les délais réglementaires.',
  'feature'
);

-- 3. iOS Reader App — paywall externe masqué
INSERT INTO app_changelog (title, body, type) VALUES (
  'Conformité Apple Store : paywall iOS adapté',
  'Sur iOS, les boutons de paiement externes (Stripe Checkout) sont masqués pour respecter les règles "Reader App" d''Apple. Un message explicatif invite à gérer son abonnement via le site web. Les achats de programmes payants sont également bloqués sur iOS conformément à la guideline 3.1.1.',
  'update'
);

-- 4. Permissions Android allégées
INSERT INTO app_changelog (title, body, type) VALUES (
  'Permissions Android nettoyées (conformité Play Store)',
  'Suppression des permissions de stockage externe dépréciées (READ/WRITE_EXTERNAL_STORAGE) pour respecter les exigences Play Store sur Android 13+. L''accès aux médias passe désormais uniquement par les API scoped storage modernes.',
  'update'
);

-- 5. Glassmorphism — migration UX globale
INSERT INTO app_changelog (title, body, type) VALUES (
  'Refonte UX : glassmorphism emerald sur toute l''app',
  'Le fond animé emerald avec blobs flottants (GlassBackground) est maintenant déployé sur toutes les pages : Login, Inscription, Mot de passe oublié, Communauté, Compétitions, Tournois, Explorer, Partenaires, Box, Onboarding (Création / Rejoindre / Attente), Admin. Cohérence visuelle complète avec le thème de l''app.',
  'update'
);

-- 6. Fix incrément timer EMOM
INSERT INTO app_changelog (title, body, type) VALUES (
  'Correction incrément timer EMOM (snapping 5 sec)',
  'Bug corrigé : quand tu réglais les secondes en dessous de 5 (par ex. 1 sec), l''incrémentation passait à 6, 11, 16... au lieu de 5, 10, 15. Le pas est maintenant correctement aligné sur des multiples de 5 dans tous les modes (EMOM, Splits, Tabata, sur l''écran Timer et le whiteboard).',
  'fix'
);

-- 7. Timer vidéo : redesign overlay thème app
INSERT INTO app_changelog (title, body, type) VALUES (
  'Refonte du minuteur vidéo (thème emerald)',
  'Suppression des pickers de couleurs personnalisables sur l''overlay vidéo du timer. Les couleurs sont désormais alignées sur le thème emerald de l''app (DÉCOMPTE / EN COURS / TERMINÉ) pour une identité visuelle cohérente. Modal de réglages restylé en glassmorphism.',
  'update'
);

-- 8. Fix taille des chiffres en mode ARC
INSERT INTO app_changelog (title, body, type) VALUES (
  'Correction taille des chiffres timer (mode ARC)',
  'Le slider Taille dans les réglages d''affichage du minuteur n''avait aucun effet en mode ARC : la taille était figée. Le prop fontSize est maintenant correctement appliqué, avec un cap automatique pour éviter le débordement du cercle. Slider plafonné à 140 px.',
  'fix'
);

-- 9. Timer : grand cercle ARC
INSERT INTO app_changelog (title, body, type) VALUES (
  'Timer : cercle ARC plus grand',
  'Le cercle du minuteur en mode ARC est maintenant ~20% plus grand pour une meilleure lisibilité de loin (utile pour filmer ou pour les WODs longs). Le cap de 280 px a été retiré.',
  'update'
);

-- 10. Anti-verrouillage écran pendant le timer
INSERT INTO app_changelog (title, body, type) VALUES (
  'Anti-verrouillage écran pendant le minuteur',
  'L''écran ne se verrouille plus pendant une session timer (avec ou sans caméra). Idéal pour les WODs longs (AMRAP 20 min, EMOM, etc.) où il fallait avant tapoter l''écran régulièrement. Activation via expo-keep-awake.',
  'feature'
);

-- 11. Onglets de navigation raccourcis
INSERT INTO app_changelog (title, body, type) VALUES (
  'Tabs de navigation : labels raccourcis',
  'Les libellés "Compétitions" et "Réservation" étaient tronqués sur petits écrans. Renommés en "Compete" et "Résa" pour rester entièrement lisibles. Onglets finaux : Compete · Explorer · Accueil · Ma Box · Résa.',
  'update'
);

-- 12. Bump version 1.0.33
INSERT INTO app_changelog (title, body, type) VALUES (
  'Version 1.0.33',
  'Build Android AAB et iOS soumis aux stores avec versionCode incrémenté. Inclut la mise en conformité App Store / Play Store, la modération UGC, la refonte UX glassmorphism et les corrections du minuteur.',
  'update'
);
