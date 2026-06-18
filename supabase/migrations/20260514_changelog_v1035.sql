-- ── Changelog entries for v1.0.35 (14 mai 2026) ─────────────────
-- UX caméra timer : choix avant lancement, lock à l'enregistrement,
-- corrections d'orientation iOS, et repositionnement landscape.

-- 1. Choix caméra & orientation verrouillés au "Démarrer"
INSERT INTO app_changelog (title, body, type) VALUES (
  'Timer vidéo : choix de la caméra et de l''orientation avant lancement',
  'Tu peux désormais choisir la caméra (avant/arrière) et l''orientation (portrait ou paysage) librement avant d''appuyer sur "Démarrer". Une fois l''enregistrement lancé, ces choix sont verrouillés pour garantir une vidéo stable et sans surprise. Le bouton de bascule de caméra disparaît automatiquement après le lancement.',
  'feature'
);

-- 2. Fix orientation iOS landscape-left vs landscape-right
INSERT INTO app_changelog (title, body, type) VALUES (
  'Correction caméra iOS : image retournée en paysage gauche',
  'Sur iOS, lorsque le téléphone était tourné en paysage côté gauche (au lieu de droit), la preview et la vidéo enregistrée apparaissaient à l''envers (180°). Le module natif détecte maintenant les 4 orientations réelles du device et met à jour la preview en temps réel avant le lancement de l''enregistrement.',
  'fix'
);

-- 3. Repositionnement UI landscape vidéo
INSERT INTO app_changelog (title, body, type) VALUES (
  'Timer vidéo paysage : boutons et REC repositionnés',
  'En mode paysage avec caméra, le bouton "Démarrer / Lancer le chrono / Arrêter le chrono" est désormais sur le bord droit, centré verticalement, pour ne plus chevaucher le timer central. L''indicateur "REC" passe en ligne à côté du titre du WOD au lieu d''être empilé en-dessous.',
  'fix'
);

-- 4. Anti-verrouillage écran pendant le timer
INSERT INTO app_changelog (title, body, type) VALUES (
  'Anti-verrouillage de l''écran pendant le timer',
  'L''écran ne se verrouille plus pendant qu''un timer est lancé (avec ou sans vidéo). Tu peux poser ton téléphone tranquillement pendant ton WOD sans craindre que l''écran s''éteigne.',
  'feature'
);

-- 5. Glassmorphism Android — refonte visuelle des cartes
INSERT INTO app_changelog (title, body, type) VALUES (
  'Refonte visuelle Android : cartes alignées sur iOS',
  'Sur Android, les cartes (profil, box, compétitions, WOD, home, etc.) avaient un effet "double rectangle" gris/blanc à cause du fallback de blur. Elles utilisent désormais un fond opaque homogène inspiré de la page Explorer, pour un rendu cohérent avec iOS.',
  'fix'
);

-- 6. Inscription : pseudo en doublon géré automatiquement
INSERT INTO app_changelog (title, body, type) VALUES (
  'Inscription : gestion automatique des pseudos en doublon',
  'Si le pseudo choisi est déjà pris, l''app ajoute désormais un suffixe automatique (ex: "athlete42"). Plus de comptes orphelins en base liés à un échec d''inscription. Une notification t''informe si ton pseudo a été modifié.',
  'fix'
);

-- 7. Snapping timer aux multiples de 5
INSERT INTO app_changelog (title, body, type) VALUES (
  'Réglage timer : pas de 5 secondes',
  'Les boutons +/- des secondes du timer (EMOM, Tabata, Splits…) snappent désormais sur les multiples de 5 pour des réglages plus rapides et plus propres.',
  'fix'
);

-- 8. Back Office : suppression de tous les WOD de la semaine
INSERT INTO app_changelog (title, body, type) VALUES (
  'Back Office : suppression en masse des WOD',
  'Nouveau bouton dans le whiteboard admin pour supprimer tous les WOD de la semaine en une fois (avec double confirmation). Les confirmations natives bloquées par certains navigateurs ont été remplacées par une modale custom plus fiable.',
  'feature'
);

-- 9. Bump version 1.0.35
INSERT INTO app_changelog (title, body, type) VALUES (
  'Version 1.0.35',
  'Build iOS et Android avec versionCode incrémenté. Inclut le fix orientation caméra iOS, le repositionnement de l''UI timer vidéo paysage, le verrouillage caméra/orientation au lancement, l''anti-verrouillage écran et la refonte visuelle des cartes Android.',
  'update'
);
