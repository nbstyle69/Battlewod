# État du projet AthleX

Dernière mise à jour : **5 septembre 2026**.

Ce fichier est écrit pour être lu en deux minutes, sans être développeur. Il dit ce qui
marche aujourd'hui, ce qui est en train de se faire, ce qui vient ensuite, et ce qui est
connu mais volontairement laissé de côté.

**La règle qui rend ce fichier fiable : il se met à jour dans la même PR que ce qu'il
décrit. Un lot qui se ferme sans sa ligne dans l'état du projet est un lot incomplet — même
statut que les types régénérés.** Le contrôle qui le vérifie est décrit tout en bas.

Deux dépôts, deux noms :

- **l'app mobile** — `athlex-app` (iOS et Android), c'est ce que voient les athlètes ;
- **le back-office web** — `AthleX-Manager` sur `athlexapp.eu`, c'est ce que voient les
  gérants et les coachs.

L'historique ci-dessous est reconstruit depuis les PRs mergées et
[`REGLES_DE_VERIFICATION.md`](./REGLES_DE_VERIFICATION.md). Les dates avant le 16 août 2026
sont donc approximatives : la précision fine commence aujourd'hui.

---

## En production aujourd'hui

Une ligne par capacité, avec la date du lot qui l'a fermée.

### Tournois et compétitions

| Capacité | Fermé le |
| --- | --- |
| Tournois de box : classique, bracket, poules, suisse — avec classement final et distribution d'ELO | 16 août 2026 |
| Compétitions entre box (inter-box) : divisions, ELO de départ, notifications aux participants | 16 août 2026 |
| Un WOD fermé ou non encore révélé n'accepte plus de score (refus prononcé par le serveur) | 19 août 2026 |
| Fin de tournoi en deux temps : on termine les WODs, on révise les scores contestés, puis on distribue l'ELO | 16 août 2026 |
| La clôture d'un tournoi (web et mobile) est une seule opération serveur, tous formats : classement, historique ELO, profils et statut écrits ensemble ou pas du tout ; une seconde clôture est refusée par son nom ; l'écran ne calcule ni n'écrit plus d'ELO | 4 septembre 2026 |
| L'historique ELO survit à la suppression de son événement : les sept clés d'historique (`elo_history.wod_id`, `box_elo_history.wod_id`, `tournament_elo_history.tournament_id`, `tournament_match_elo_history.match_id`, `tournament_wod_elo_history.tournament_wod_id`, `daily_tournament_elo_history.tournament_id`, `inter_elo_history.competition_id`) passent d'`ON DELETE CASCADE` à `ON DELETE SET NULL` ; l'écran d'historique affiche « Tournoi supprimé » / « WOD supprimé » / « Mini-tournoi supprimé » ; suite `elo` : supprimer un tournoi clôturé laisse l'historique, `profiles.elo` inchangé, égalité profil = dernier `elo_after` vraie. `profiles.losses` est déclarée **colonne morte** (jamais incrémentée par aucune fonction ni aucun écran ; commentaire SQL posé) : les défaites affichées restent `total_matches − wins`, la colonne ne doit plus être lue | 5 septembre 2026 |
| Réalignement des deux profils dont l'historique avait été supprimé par notre purge : JCVD 1039 → 1064 (compteurs 12 → 8, 5 → 4), in the bar 1057 → 1032, en une transaction gardée ; Samir intact (historique jamais écrit → le profil est le seul témoin) ; relecture : les six profils à historique ont `profiles.elo` = dernier `elo_after` | 4 septembre 2026 |
| Le classement affiché suit exactement l'ordre du serveur : secondes, sens du tri, scores au time cap, ex aequo signalés | 23 août 2026 |
| Le vainqueur d'un match de bracket est calculé par une seule règle, partagée avec le reste de l'app | 23 août 2026 |
| Preuve vidéo disponible sur tous les formats de tournoi | 16 août 2026 |

### Musculation et records

| Capacité | Fermé le |
| --- | --- |
| Un seul catalogue de mouvements : une clé par exercice, donc les badges sont réellement atteignables | 19 août 2026 |
| Blocs de force dans les WODs (séries × reps × charge), écrits depuis le back-office | 19 août 2026 |
| Journal des séries réellement réalisées : le 1RM se calcule sur les reps faites et les charges utilisées, pas sur le prévu | 20 août 2026 |
| Fiche athlète dans le back-office : 1RM, séries réalisées, et la provenance de chaque record | 20 août 2026 |
| Le time cap se décompte à la seconde exacte (côté app et dans les deux éditeurs web) | 19 août 2026 |

### Semaines types et programmation

| Capacité | Fermé le |
| --- | --- |
| Semaines types : enregistrer une semaine du Whiteboard et la reposer plus tard | 19 août 2026 |
| Un remplacement de semaine n'efface plus un WOD déjà scoré — les conflits sont montrés jour par jour, avec leur provenance | 19 août 2026 |
| Marketplace de programmation entre box : catalogue, offres, abonnement, révélation le dimanche 18h | 18 août 2026 |
| « Appliquer une programmation » sur le Whiteboard, avec option d'application automatique | 18 août 2026 |
| Import d'une programmation depuis un fichier CSV, JSON ou PDF | 18 août 2026 |
| Un seul éditeur de WOD pour deux contextes (Whiteboard et programmation) | 18 août 2026 |
| Libellés « Functional » / « Hybrid » partout où le gérant voyait « CrossFit » / « Hyrox » comme catégorie ou filtre (catalogue de programmation mobile `BOProgrammingScreen` et web `programming/page.tsx`, annuaire des box `BoxDirectory*`) — libellés seuls, les valeurs internes `crossfit`/`hyrox`/`functional`/`hybrid` et les noms de box sont inchangés ; test `disciplineLabels.test.ts` dans chaque dépôt | 5 septembre 2026 |

### Adhérents, argent et programmes

| Capacité | Fermé le |
| --- | --- |
| Abonnements de salle Stripe : formules, quotas, accès aux cours, prorata et changement de formule | 16 août 2026 |
| Offres ponctuelles : séance d'essai, Drop-in, carnet de séances — crédits révoqués au remboursement | 16 août 2026 |
| Contrats d'abonnement : engagement, gel, résiliation sur justificatif, CGV en PDF par box, codes promo | 16 août 2026 |
| Vente de programmes aux athlètes via Stripe Connect, et assignation directe à un membre | 23 août 2026 |
| « Payé au comptoir » : un euro encaissé hors Stripe est écrit dans un journal en ajout seul, et compté une seule fois | 23 août 2026 |
| Invitations nominatives : création, relance, QR code, révocation, import CSV, paiement lié | 16 août 2026 |
| Statistiques du gérant : argent (MRR, impayés), assiduité (à risque, remplissage, pointage), croissance (funnel) | 16 août 2026 |
| Récapitulatif hebdomadaire par e-mail, avec possibilité de s'en désinscrire | 16 août 2026 |
| Espace athlète web `/compte` : profil, abonnement, crédits, programmes | 16 août 2026 |
| Annuaire public des box et page publique de box (`/box`, `/box/[slug]`) | 16 août 2026 |
| Facturation du gérant : Solo, puis Multi à +29 €/box au-delà de la première | 16 août 2026 |
| Suivi des prospects après une séance d'essai : feedback, RDV, relances push et e-mail | 16 août 2026 |
| Socle serveur de l'offre Essai : un visiteur sans compte réserve un cours, l'essai est gratuit parce que la base refuse un essai payant, un cours complet est refusé au lieu de faire espérer | 24 août 2026 |
| Tunnel Essai complet : le visiteur réserve depuis la page publique de la box, la place se décompte réellement, le doublon est refusé, le prospect arrive dans Prospects et en liste de présence — constaté en production le 30 août | 30 août 2026 |
| Récapitulatif hebdomadaire du gérant : un essai ne compte plus comme une présence d'adhérent, et les essais réservés ont leur propre ligne | 30 août 2026 |

### Sécurité et rôles

| Capacité | Fermé le |
| --- | --- |
| Séparation gérant / co-gérant / coach : l'argent et les invitations restent au gérant, le coach programme | 23 août 2026 |
| Le titre « gérant » ou « coach » est prononcé par le serveur, pas déduit par l'app | 21 août 2026 |
| Le coach a un périmètre nommé (Whiteboard, Horaires, Créneaux types, Messages) et les refus le disent | 23 août 2026 |
| Un WOD payant ne se lit plus sans y avoir droit — la garde est côté serveur, y compris sur les lectures dérivées | 21 août 2026 |
| Une programmation payante ne s'obtient plus sans payer | 23 août 2026 |
| Un gérant n'agit que sur sa propre box (étanchéité entre box) | 19 août 2026 |
| La clé publique de l'app n'a plus aucun droit d'écriture, et les profils privés sont fermés | 23 août 2026 |
| Notifications : préférences réellement respectées, rappels annulés quand on les désactive, tournoi notifié aux seuls participants | 17 août 2026 |
| Audit nocturne des droits sur la vraie base de production, en lecture seule, qui compte ses propres contrôles | 21 août 2026 |
| Les heures sont écrites au format `HH:MM` et le serveur refuse le reste — le tri reste juste demain | 23 août 2026 |
| Les coordonnées d'un prospect sont hors de la table que tout adhérent de la box peut lire, et la clé publique n'y a aucun droit — même en lecture | 24 août 2026 |
| Validation d'e-mail à l'inscription activée en production (Confirm email + SMTP Resend `noreply@athlexapp.eu`, port 465, username `resend` en minuscules) ; première inscription confirmée constatée par Nab | 4 septembre 2026 |
| Le lien « Confirm signup » atterrit sur la page publique `athlexapp.eu/email-confirme` (sans session ni formulaire) ; seul un lien `recovery` ouvre le formulaire de mot de passe ; l'app passe `emailRedirectTo` (OTA) | 4 septembre 2026 |
| Chaque flux e-mail porte sa page, aucun routage par `type` : `signUp` → `emailRedirectTo` `/email-confirme`, `resetPasswordForEmail` → `redirectTo` `athlexapp.eu/update-password` (sans lui GoTrue renvoie vers le Site URL = `/email-confirme`, sans formulaire — régression 1.0.52 A4). Suite `auth-links` : vrai lien GoTrue généré puis 303 suivi, pour les deux flux et pour l'absence de `redirectTo` | 5 septembre 2026 |
| Le jeton de notification s'efface **avant** la fermeture de session (sinon 401 et l'ancien compte garde ses notifications sur le téléphone) ; un échec d'effacement est remonté dans Sentry | 4 septembre 2026 |
| Les erreurs Supabase Auth connues (« Error sending confirmation email », « Email not confirmed », « User already registered », « Invalid login credentials »…) sont traduites FR/EN, repli générique en français — plus de message brut en anglais | 4 septembre 2026 |
| **Compte reviewer Apple `nbstylz+apple@gmail.com` — ne pas supprimer, ne jamais promouvoir.** Athlète `member` rattaché à Crossfit NBS2 avec la formule « Illimité » attribuée par le chemin staff (`box_members.plan_id`, 0 €, aucun abonnement Stripe, aucune ligne `box_cash_payments`) pour pouvoir réserver des cours, e-mail confirmé à la création, aucun mot de passe transmis (Nab passe par « mot de passe oublié »). Frontière prouvée depuis son JWT : `is_box_owner_admin` = false, `get_my_admin_boxes()` vide, tables d'argent vides ou refusées, promotion de rôle sans effet, réservation puis annulation d'un cours NBS2 OK, `program_members` en écriture refusé (403). Créé le 4 septembre 2026 après la purge des 11 comptes jetables (`@athlex-test.local`, `@e2e.local`, `@audit.athlex.io`, `zz.design@athlex.test`) et du tournoi de démo « Test Bracket 16 » | 4 septembre 2026 |

### Mises à jour de l'app (OTA) et livraison

| Capacité | Fermé le |
| --- | --- |
| Publication automatique d'une mise à jour à chaque push, avec garde-fou sur la version cible | 19 août 2026 |
| Une mise à jour ne peut plus partir sans les clés d'accès à la base (l'app arrivait intacte mais inerte) | 19 août 2026 |
| Rejeu du schéma de base de données en CI à chaque PR | 16 août 2026 |
| Version `1.0.51` construite pour iOS et Android, IPA envoyé sur App Store Connect | 24 août 2026 |
| Version `1.0.52` (49) iOS construite depuis `master`, IPA vérifié 17/17, traitée par Apple et installable depuis TestFlight (groupe interne) — **obsolète, non soumise** : la revue 1.0.52 (A4, I4, I5, L1, I6, C4, tunnel d'invitation) part dans `1.0.53` (50), nouveau runtime OTA | 3 septembre 2026 |
| Version `1.0.53` (50) : `app.json` `version`/`buildNumber` posés ; build iOS depuis `master` mergé, `verify:ipa`, `eas submit` — rien vers App Review | 5 septembre 2026 |
| GIF dans Messages : Tenor (API fermée le 30 juin 2026) remplacé par GIPHY (`api.giphy.com/v1/gifs/search` et `/trending`, `rating=pg-13`, clé `EXPO_PUBLIC_GIPHY_KEY` posée dans GitHub Actions et EAS). Clé absente du bundle → « GIF indisponibles » lisible ; « Powered by GIPHY » dans le sélecteur (CGU GIPHY). Garde-fous : `ota.yml` (bundle servi), `verify:ipa`, `verify:aab` échouent si la clé n'est pas embarquée, via le marqueur `giphy-key:<clé>:giphy-end` plié au bundle. Plus aucune référence à Tenor (test qui échoue si une réapparaît) | 5 septembre 2026 |
| `verify:aab` (`scripts/aab-verify-bundle.mjs`) : pendant Android de `verify:ipa` sur l'AAB réel (bundle Hermes, URL/clé anon Supabase, `versionName`/`versionCode`/runtime/canal OTA via bundletool, aucune permission de localisation) — 16/16 sur l'AAB 1.0.51 (64) hors les deux écarts de version attendus | 5 septembre 2026 |
| Minimisation avant le build 50 : Sentry sans capture d'écran (`attachScreenshot: false`) et `setUser({ id })` seul ; Mixpanel sans géolocalisation IP (`setUseIpAddressForGeolocation(false)`) et sans e-mail dans `people.set` ; à la suppression du compte, `people.deleteUser()` + `flush()` avant `reset()` et `signOut` (échec → Sentry, la suppression ne dépend pas de Mixpanel). Test `dataMinimisation.test.ts`, mutation inverse (ordre inversé) rouge | 5 septembre 2026 |
| Crash de la présentation (carrousel `OnboardingTutorialScreen`) au premier lancement : cause prouvée en montage réel (`npm run test:rn`, preset jest react-native + react-test-renderer) — « C'est parti » appelle `scrollToIndex` sur une cellule pas encore mesurée, sans `getItemLayout` ni `onScrollToIndexFailed` : RN 0.81 lève `Invariant Violation: scrollToIndex should be used in conjunction with getItemLayout or onScrollToIndexFailed…` dans un gestionnaire d'événement, hors de tout ErrorBoundary → exception JS fatale. Correctif : `getItemLayout` (slides de largeur `width`) + `onScrollToIndexFailed` → `scrollToOffset`. Mutation inverse (retirer les deux props) : rouge. Confettis/`Math.random`, `Animated.loop` non natif, `badgeScale`, `awardLevelBadge`, `trackOnboardingStep`, `Dimensions` au chargement : lus, montés iOS/Android, aucun ne lève. `OnboardingErrorBoundary` autour de la présentation : exception de rendu → Sentry + repli sur l'accueil (clé locale posée), jamais d'écran mort. Sentry sans trace : voir ligne DSN | 5 septembre 2026 |
| « Présentation vue » côté compte : `profiles.onboarding_completed_at` (timestamptz nullable, migration `20261201`), écrite par `onDone` via la RPC idempotente `mark_onboarding_completed()` (SECURITY DEFINER, `auth.uid()`, EXECUTE authenticated seulement), relue à la connexion par `get_my_profile` (SETOF profiles). `@athlex:onboardingDone` n'est plus qu'un cache de session (porte l'id du compte, purgé au signOut) ; `@athlex:tourDone` inchangé (appareil). **Appliquée en prod le 5 septembre** : colonne présente, 35 profils / 0 marqué, empreinte des lignes hors colonne identique avant/après, compte reviewer `nbstylz+apple` à NULL (Apple verra la présentation une fois). Suites : `onboardingStatus.test.ts` (signOut→signIn même compte, compte neuf, autre appareil, mutation inverse « retirer la lecture serveur » → rouge), `test-onboarding-completed.mjs` sur pile jetable 7/7 (suite `onboarding` d'`integration.yml`) | 5 septembre 2026 |
| Sentry vide sur 14 jours : cause prouvée — `EXPO_PUBLIC_SENTRY_DSN` absente de l'environnement EAS `production` (`eas env:list`), donc `Sentry.init({ dsn: '' })` : aucun DSN dans l'OTA servie 1.0.52 (ios/android, updates `01a071ac…`) ni dans l'IPA 1.0.52 (49) (`verify:ipa`) ; seule l'URL de télémétrie du SDK (`o447951.ingest.sentry.io`) y figure. `enableNative`/`enableNativeCrashHandling` sont aux valeurs par défaut du SDK 7.2 (vrai) : les crashs natifs remonteraient avec un DSN. Garde-fous : `ota.yml` (`ota-verify-bundle.mjs`), `verify:ipa`, `verify:aab` échouent désormais sans DSN, comme pour Supabase et GIPHY (règle 11). Test `sentryDsnGuards.test.ts`. **Nab : poser `EXPO_PUBLIC_SENTRY_DSN` dans EAS (`production`)**, valeur lue dans Sentry → Settings → Projects → athlex-mobile → Client Keys (DSN) ; preuve de réception à faire sur la première OTA/build qui l'embarque | 5 septembre 2026 |
| Preuve de réception Sentry (règle 20) : `EXPO_PUBLIC_SENTRY_SMOKE=1` sur une seule publication → `captureMessage('sentry-smoke <version · update>')` au démarrage (`src/lib/sentrySmoke.ts`, après `Sentry.init`) ; sans le flag, rien ne part (tests `sentrySmoke.test.ts`). **À faire par Nab** sur la première OTA/build qui embarque `EXPO_PUBLIC_SENTRY_DSN` : poser le flag dans l'env EAS `production`, publier, voir l'événement dans Sentry dans la minute, retirer le flag. Tant que ce n'est pas vu, « Sentry vide » ne conclut rien | 5 septembre 2026 |
| Libellés athlète : les 3 occurrences laissées par #250 passent en Functional (« Benchmarks Functional » FR/EN, exemple de nom de box « Functional Lyon », prompt d'analyse vidéo) + hashtag d'exemple de bio `#functional`. Clé de stockage historique des PR `'Benchmarks CrossFit'` conservée (donnée, pas libellé). Aucun nom de box touché. Embarqué dans le build 50 | 5 septembre 2026 |
| Android Maps : clé Google Maps restreinte par Nab (package `com.athlex.app` + SHA-1 de la clé d'upload EAS) posée en clair dans `app.json` (`android.config.googleMaps.apiKey`, clé restreinte = pas un secret) ; `app.config.js` et le détour par la variable EAS `GOOGLE_MAPS_API_KEY` retirés. Embarquée dans le build 50 Android | 5 septembre 2026 |
||||||| 2df756d

### Soumission — App Privacy (Apple) et Data Safety (Google Play)

Inventaire lu dans le code (fichier-preuve par ligne), état du build `1.0.53` (50). Ce qui n'est pas
visible dans le code (réglages des consoles Sentry/Mixpanel/GIPHY) est **non vérifié** et dit tel quel.
Réponses globales : collecte = oui ; **suivi (ATT) = non** (pas d'IDFA, pas de courtier de données,
aucune régie) ; chiffrement en transit = oui (HTTPS partout) ; suppression dans l'app = oui.

| Donnée | Part vers | Apple — catégorie · usage · liée à l'identité | Google Play — type · usage | Preuve |
| --- | --- | --- | --- | --- |
| E-mail | Supabase Auth + `profiles.email` uniquement (plus Sentry ni Mixpanel) | Contact Info → Email Address · Fonctionnement · **liée** | Personal info → Email address · App functionality | `src/context/AuthContext.tsx` (`auth.signUp`, `setUserContext(profile.id)`, `identifyUser` sans `email`) |
| Nom / pseudo (`username`, `full_name`) | Supabase `profiles` ; Mixpanel (`username`) | Contact Info → Name · Fonctionnement, Analytics · liée | Personal info → Name · App functionality, Analytics | `AuthContext.tsx`, `src/screens/profile/ProfileScreen.tsx`, `src/lib/analytics.ts` |
| Genre, bio | Supabase `profiles` | Other Data Types / Other User Content · Fonctionnement · liée | Personal info → Other info · App functionality | `ProfileScreen.tsx` |
| Photo de profil, images de messages/articles/logo | Supabase Storage (`avatars`, `message-attachments`, `box-assets`, `box-logos`) | User Content → Photos or Videos · Fonctionnement · liée | Photos and videos → Photos · App functionality | `ProfileScreen.tsx`, `MessagesScreen.tsx`, `BOArticlesScreen.tsx`, `BOBoxInfoScreen.tsx` |
| Vidéos de performance | **Jamais envoyées** : galerie locale ; seule une URL saisie est stockée (`*.video_url`) | Vidéo : rien ; URL : Other User Content · liée | Photos and videos → non collecté | `TimerRunScreen.tsx` (`MediaLibrary.saveToLibraryAsync`), `InterScoreSubmitScreen.tsx` ; aucun `upload` de vidéo dans `src/` |
| Documents (PDF) | Storage `documents` | User Content → Other User Content · Fonctionnement · liée | Files and docs · App functionality | `DocumentsScreen.tsx` |
| Performance sportive (scores, temps, charges, PR, ELO, séances) | Supabase | **Health & Fitness → Fitness** · Fonctionnement · liée | Health and fitness → Fitness info · App functionality | `src/services/strengthPR.ts`, `strengthSets.ts`, `myProfile.ts`, `gamification.ts` |
| Messages (privés, groupes, commentaires) | Supabase | User Content → Other User Content · Fonctionnement · liée | Messages → Other in-app messages · App functionality | `MessagesScreen.tsx` |
| Identifiant utilisateur | Supabase ; Sentry `user.id` ; Mixpanel `distinct_id` | Identifiers → User ID · Fonctionnement, Analytics · liée | Personal info → User IDs · App functionality, Analytics | `src/lib/sentry.ts`, `src/lib/analytics.ts` |
| Jeton push (Expo) | Supabase `push_tokens` ; serveur Expo via `send-push` | Identifiers → Device ID · Fonctionnement · liée | Device or other IDs · App functionality | `src/services/notifications.ts`, `supabase/functions/send-push` |
| IDFA / Advertising ID | **Non** (pas d'ATT, pas d'`AD_ID`) | — | non collecté | `app.json`, manifeste AAB (`verify:aab`) |
| Identifiant d'installation généré par les SDK | Sentry, Mixpanel | Identifiers → Device ID · Analytics · liée | Device or other IDs · Analytics | `App.tsx`, `analytics.ts` (défaut SDK) |
| Crash et performance | Sentry (`@sentry/react-native`) — **sans capture d'écran** | Diagnostics → Crash Data, Performance Data · Fonctionnement · liée (`id` seul) | App activity → Crash logs, Diagnostics · App functionality | `App.tsx` (`attachScreenshot: false`), `src/lib/sentry.ts` |
| Événements d'usage (liste exhaustive dans `src/lib/analytics.ts`, identifiants techniques et catégories, jamais de contenu libre) | Mixpanel — **sans géolocalisation IP** | Usage Data → Product Interaction · Analytics · liée (`identify` + `people.set` username/role/level) | App activity → App interactions · Analytics | `src/lib/analytics.ts` |
| Localisation | **Non demandée** : aucune permission iOS/Android, pas d'`expo-location` ; `showsUserLocation` inopérant ; la carte se centre sur la moyenne des box | — | Location → non collecté | `app.json`, `BoxDirectoryMapScreen.tsx`, `verify:aab` |
| Recherche de GIF (termes saisis, IP) | GIPHY (`api.giphy.com`) — Tenor fermé | Usage Data → Search History · Fonctionnement · **non liée** (pas d'identifiant transmis) | App activity → In-app search history · App functionality | `MessagesScreen.tsx` |
| Données saisies par le gérant sur des tiers (prospects, invitations) | Supabase | Contact Info → Email, Phone · Fonctionnement · liée | Personal info → Email, Phone · App functionality | `src/screens/backoffice/` |
| Côté serveur : analyse d'un score par IA (pseudo, valeur, notes), texte de PDF de programmation ; e-mails transactionnels | Anthropic ; Resend | Processeurs, déclarés avec les données ci-dessus | Processeurs (« partagé » ou exemption service provider selon DPA) | `supabase/functions/analyze-tournament-score`, `parse-wod-pdf`, `weekly-owner-digest`, `session-followup-cron` |

Suppression de compte (`delete_user_account`, définition lue en prod) : compte Auth, profil et
90 tables en `ON DELETE CASCADE` supprimés, Storage (`avatars`, `documents`, `message-attachments`)
purgé ; 44 clés `ON DELETE SET NULL` anonymisent les références dans le contenu des autres (matchs,
`created_by`, journal comptoir de la box) ; profil Mixpanel effacé par `people.deleteUser()` ;
`group_messages.sender_id` passe en `SET NULL` par migration (lot du 5 septembre). Reste hors de
portée de l'app : événements Sentry déjà envoyés (rétention du plan, non vérifiée) et journaux
Supabase/Resend.

### Site public et lisibilité

| Capacité | Fermé le |
| --- | --- |
| Bascule complète sur le domaine `athlexapp.eu` (liens, e-mails, redirections) | 16 août 2026 |
| Site public bilingue FR/EN : accueil, tunnel d'inscription, annuaire, page de box | 17 août 2026 |
| Mentions légales, confidentialité et entité juridique NBS Innovation | 17 août 2026 |
| Classement ELO public (`/classement`) avec recherche par pseudo | 16 août 2026 |
| Phase 1 design mobile : quatre écrans lisibles en clair et en sombre, encre mesurée, couleurs de domaine préservées | 24 août 2026 |
| Marketplace et Programmes athlètes portent enfin deux noms distincts (renommage d'affichage) | 24 août 2026 |
| Les programmes d'une box redeviennent visibles — et vendables — sur sa page publique | 24 août 2026 |
| Toute box créée reçoit un identifiant d'URL : plus aucune box active absente de l'annuaire | 24 août 2026 |
| `/compte` montre l'adhésion même sans abonnement en ligne (formule attribuée ou payée à la box) | 24 août 2026 |
| Une lecture publique refusée se voit : elle ne se rend plus en liste vide plausible | 24 août 2026 |
| Une relance de prospect fautive ne coupe plus les relances de toutes les box | 24 août 2026 |
| Fiche adhérent du back-office mobile (`BOMembers`) : fiche opaque (`modalCard`, encre atténuée 2,77:1 → 5,36:1 en clair), formule, statut et échéance servis par `get_box_billing` au gérant/co-gérant (le coach n'y voit pas de bloc formule) — 1.0.52 I4 | 5 septembre 2026 |
| Accueil, section Tournois : « Tous les tournois » ouvre l'onglet Tournois de Compétitions (le bouton ne faisait rien), libellé et statuts des cartes via i18n FR/EN (plus de chaînes en dur) — 1.0.52 L1 | 5 septembre 2026 |
| Accueil sans box sélectionnée : plus de requête `tournaments` avec `box_id=eq.` (400 PostgREST avalé, vu en logs pendant la recon B1) — pas de box, pas de requête ; avec box, la lecture passe par `readRows` et l'erreur remonte à Sentry. Test qui échoue si le filtre vide revient. | 5 septembre 2026 |
| Tunnel d'invitation, confirmation visible (cas `nbstylz+r2`, `email_not_confirmed` à la connexion) : web `/rejoindre` lit `needsConfirmation` et annonce le mail « Confirme ton adresse » avec l'adresse, avant « télécharge l'app », `accept` passe `emailRedirectTo` `/email-confirme` explicite (AthleX-Manager #308) ; app, écran de connexion : sur `email_not_confirmed` seulement, « Confirme d'abord ton e-mail » + « Renvoyer le mail » (`auth.resend({ type: 'signup' })`), retour « Mail renvoyé à <e-mail> » ou erreur traduite dont la limite 60 s de GoTrue. Test : bouton présent pour cette erreur, absent pour un mauvais mot de passe, `resend` appelé avec l'e-mail saisi. | 5 septembre 2026 |
| Profil gérant mobile : bloc « Abonnement AthleX » (Solo/Multi depuis `owner_subscriptions`, état de la box) avec bouton vers `BOSubscription` — jusque-là joignable seulement depuis le Dashboard — 1.0.52 I5 | 5 septembre 2026 |
| Pile Dashboard gérant : chevron retour standard (`ChevronLeft`, `goBack`) sur les 15 écrans empilés — ajouté sur Stats, Rapport, Notifications, Gamification, Articles, Inter-box ; harmonisé sur Réglages, Infos box, Abonnement (flèche) et Tournoi (« ← » texte) ; test qui énumère la pile — 1.0.52 I6 | 5 septembre 2026 |
| Écran de connexion : `v1.0.53` seul au rendu, l'identifiant OTA (`· 01a01acc` ou `· embarqué`) apparaît au toucher du texte de version (`versionDisplay`). Test : masqué au rendu, visible après appui. | 5 septembre 2026 |
| Historique d'entraînement, deux points d'entrée vers `WodHistory` : « Mes entraînements » dans le Profil (athlète et gérant — `WodHistory` ajouté à `BOProfileStack`), et après l'enregistrement d'un score dans le générateur, confirmation avec « Voir mon historique ». Test : les deux points d'entrée naviguent vers `WodHistory`. | 5 septembre 2026 |
| Messagerie de groupe : `group_messages.sender_id` reçoit sa clé étrangère vers `profiles` en `ON DELETE SET NULL` (migration `20261130_group_messages_sender_set_null.sql`, appliquée en prod avant merge, preuve `pg_constraint` `confdeltype='n'`) — la suppression d'un compte laissait ses messages orphelins (24 sur 39 purgés le 4 septembre), elle les anonymise désormais ; `MessagesScreen` affiche « Compte supprimé » pour un expéditeur `NULL`. Suite `group-messages` d'`integration.yml` : `delete_user_account()` sous l'identité de l'athlète → ses messages restent avec `sender_id NULL`, ceux des autres intacts (7/7) ; mutation inverse (clé retirée) rouge sur `GM_ORPHELIN` | 5 septembre 2026 |

---

## En cours

**Offre Essai (tunnel d'acquisition de prospects).** Le socle serveur est en production
depuis le 24 août, et il y est constaté sur la vraie base : le type d'offre « Essai » est
accepté à 0 €, refusé à 30 € ; une réservation sans adhérent et sans prospect est refusée ;
la table des prospects est fermée à la clé publique, en lecture comme en écriture.

**Les écrans sont écrits et livrés côté web** (le 4e type d'offre « Essai », le bouton et le
calendrier public sur la page de la box, les prospects sans compte dans Prospects, la
mention « Essai » en liste de présence, l'e-mail de confirmation, et l'essai qui ne compte
plus comme un adhérent actif dans les statistiques).

**Le chemin heureux est constaté en production le 30 août**, au clic et sur la vraie base :
offre Essai créée sur Crossfit NBS2, réservation anonyme sur le cours du dimanche 10:00, le
créneau passe de 15 à 14 places restantes, la réservation est écrite en `confirmed` (jamais
en liste d'attente), le même e-mail sur le même cours est refusé par son message nommé, le
prospect apparaît dans Prospects et en liste de présence, et le pointage « présent » le fait
passer à « venu ». Cette ligne monte donc dans « En production ».

**Le récapitulatif hebdomadaire est corrigé et appliqué à la production le 30 août**, avec
la mesure qui distingue : sur Crossfit NBS2, la seule présence pointée de la semaine est un
essai, et le récapitulatif affiche désormais 0 présence d'adhérent et 2 essais réservés —
avant l'application, cette même semaine aurait affiché 1 présence d'adhérent qui n'existe
pas. Le pipeline de relance historique refuse explicitement les essais au lieu de tenir par
accident de schéma.

**Ce qui bloque :** rien.

**Ce qui n'est pas constaté, et je ne le compte pas :** le refus d'un cours complet en
production (le provoquer demanderait de remplir un vrai cours ou d'en créer un factice sur
le planning), les plafonds anti-abus par IP et par e-mail sur la vraie base, et la réception
effective de l'e-mail de confirmation — seule la phrase affichée à l'écran est constatée.

**Une limite nommée plutôt que supposée :** le plafond par adresse e-mail est tenu par la
base (donc prouvable). Le plafond par adresse Internet du visiteur sera tenu par le site
web : la base n'a pas accès à cette information, et une limite supposée n'est pas une
limite.

**Phase 1 design, deuxième passe mobile (Notifications, détail tournoi, minuteur).** Les
défauts sont mesurés, pas supposés : blanc sur la surface du bouton d'appel à l'action à
1,23:1 en clair, l'accent employé en texte sur une carte blanche à 2,56:1, la couleur de la
carte prise pour encre sur un aplat d'accent, l'heure de rappel réduite à 2,06:1 par une
opacité posée sur tout le conteneur, et deux teintes de domaine pensées pour le sombre
posées sur une carte claire (2,17:1 et 2,23:1). Deux cas sont ajoutés au contrôle mécanique
et échouent sur l'état d'avant. **Ce n'est pas constaté à l'écran** : la lisibilité se
prouve à l'œil, sur un vrai appareil, dans les deux thèmes — la ligne ne montera qu'après
ce constat, et après un binaire qui porte le correctif.

**Coque de verre étendue aux écrans denses (21 écrans).** Les 18 écrans de back-office,
les préférences de notification, le détail de programme et la carte des box posaient leur
fond à plat — blanc pur en mode clair — pendant que l'accueil, Ma Box et le Compte
montaient le dégradé argenté. Une mesure a contredit une justification déjà écrite dans le
code : le contrôle interdisait le verre sur Notifications au motif que l'encre atténuée n'y
tient pas 4,5:1, ce qui est vrai **à même le dégradé** et faux **sur une carte** posée
dessus (4,89 à 5,25:1 en clair). Le même contrôle, réécrit sur la règle réelle, a trouvé un
défaut **déjà en production** sur l'accueil et Ma Box : sur le troisième arrêt émeraude,
l'encre atténuée sur carte tombait à 3,03:1 — l'arrêt est assombri, elle remonte à 4,85:1.
Deux appels à l'action du Compte écrivaient la couleur du fond sur la surface translucide
du bouton (1,23:1). **Ce n'est pas constaté à l'écran** : la coque et l'encre se prouvent à
l'œil, dans les deux thèmes, et la ligne ne montera qu'après ce constat.

**Phase 1 design, troisième passe : les deux écrans que la charte n'avait pas atteints
(détail tournoi, minuteur).** Le détail tournoi montait déjà la coque, mais son en-tête
était un dégradé bleu-noir écrit en dur, orphelin de la charte, et ses trois pastilles
(inscrit, complet, prix) prenaient leurs teintes au thème **clair** alors que l'en-tête est
sombre dans les deux thèmes : 3,12:1, 3,55:1 et 3,48:1 mesurés sur son arrêt le plus clair.
Les arrêts viennent maintenant de la famille du dégradé de la coque, et l'encre des
pastilles du thème sombre (6,76:1, 6,19:1, 12,22:1). L'en-tête **reste** un panneau sombre :
son encre blanche y est mesurée haut (titre 17,14:1, métadonnées 7,82:1, glyphes 5,15:1), ce
qu'une carte translucide posée sous le blob du coin haut-gauche ne garantit pas.
L'écran de réglage du minuteur, lui, était resté hors de toutes les passes : blanc en dur
sur l'aplat d'accent (2,56:1), blanc sur l'appel à l'action translucide (1,23:1), libellé et
poignée de modale en blanc translucide sur fond clair (1,05:1 et 1,00:1), et l'accent
employé onze fois comme encre ou glyphe (2,46:1 sur carte). Le minuteur **en course** n'est
pas touché : son fond est choisi par l'athlète. Neuf contrôles mécaniques ajoutés, qui échouent tous sur
l'état d'avant. **Ce n'est pas constaté à l'écran** : la ligne ne montera qu'après le
constat dans les deux thèmes.

**Build de soumission 1.0.51 (47) et vérification de l'artefact réel.** Le binaire iOS de
soumission est produit par EAS depuis `master` et **téléversé** sur App Store Connect ; son
traitement par Apple n'est pas constaté (voir résiduels). Ce qui est constaté, c'est
l'artefact lui-même, pas ce que la machine locale sait bundler : l'IPA publié par EAS est
téléchargé, ouvert, et son JS embarqué lu — 17 assertions vraies sur 17
(`npm run verify:ipa`). Le contrôle est **discriminant**, et c'est ce qui le rend
utilisable : rejoué sur l'IPA du build 43, il tombe à 10/17 et nomme exactement les cinq
défauts de la fenêtre d'avant-OTA — la RPC `get_my_profile` absente du bundle et les trois
colonnes révoquées encore demandées dans des listes de colonnes. Le bytecode Hermes ne
contient plus de source : les assertions portent sur sa table de chaînes (nom de RPC,
messages d'erreur de la branche, listes de colonnes littérales), et le nombre de listes
lisibles est compté avant de conclure à une absence. La clé Supabase embarquée est décodée
sans être affichée : rôle `anon`, même référence de projet que l'URL embarquée.

**Caméra avant couchée et zoomée sur iPhone 17 Pro Max (minuteur vidéo, bascule selfie).**
Constaté par Nab en vidéo sur le 17 Pro Max (iOS 26.6.1), absent sur le 16 Pro (26.6) : même
OS, comportement différent, donc montage du capteur et non version d'iOS. Cause lue dans le
module natif : deux tables en dur (orientation de l'appareil → angle, avec les valeurs
paysage inversées pour la face avant) qui encodaient le montage des iPhones ≤ 16 ; le
nouveau capteur avant du 17 livre une autre orientation native, l'image prend 90° de trop
et `resizeAspectFill` la zoome pour remplir le portrait. Le même angle était posé sur la
sortie vidéo : le fichier enregistré en selfie était couché aussi. Correctif : les tables
sont supprimées, l'angle est **demandé à iOS** (`AVCaptureDevice.RotationCoordinator`,
preview et capture séparées, coordinator recréé à chaque changement de caméra, gel pendant
l'enregistrement conservé) ; la géométrie du writer (1080×1920 / 1920×1080) se déduit de
l'angle réellement appliqué, plus de `UIDeviceOrientation` seul. Un contrôle mécanique
échoue si une table réapparaît dans le fichier Swift. **Non constaté sur appareil** : c'est
natif, il faut un nouveau build — le correctif part dans **1.0.52 (49)** ; **1.0.51 (47) et
(48) : non soumis, obsolètes** (le 48 embarquait le correctif mais sous le runtime 1.0.51,
que les appareils déjà installés partagent : un changement natif impose une nouvelle
version, donc un nouveau runtime OTA, `runtimeVersion.policy = appVersion`). Un journal de
diagnostic derrière un flag affiche nom du device, angle preview et angle capture pour
comparer les deux téléphones, et une liste de 16 cas à cliquer (2 téléphones ×
avant/arrière × portrait/paysage) est dans la PR. **Constaté par Nab (revue 1.0.52, C4) :
les 16 cas passent.** Suite : `orientationDebugLog` repassé à `false`, et la géométrie du
writer suit désormais l'angle **relu** sur `conn.videoRotationAngle` après affectation (un
angle non supporté n'est pas appliqué en silence) plutôt que l'angle demandé ; le log
affiche les deux (`captureAngle` demandé, `appliedAngle` relu). Le chemin
iOS < 17 (cible 15.1) est gardé sous sa forme standard, non vérifié : aucun appareil sous
iOS 17 dans le parc.

**WOD GEN retiré de l'app par un interrupteur, pas supprimé.** La carte « WOD GEN — 3
séances adaptées à ton profil » des Outils de l'accueil (route `WODGenPro`) était le seul
point d'accès ; `FEATURES.wodGen = false` (`src/lib/features.ts`) la masque. L'écran, la
route, l'écran de suggestions et les services restent dans le code, inchangés. Le contrôle
prouve les deux sens : la carte absente à `false`, présente à `true` à sa place historique ;
et qu'aucun autre fichier (Explorer, recherche, deep link, notifications) ne mène à la route.
Le premier générateur (« Générateur WOD — For Time · AMRAP · Tabata ») reste.

**Analyse de PDF de plus de 100 pages.** Cause établie le 24 août : le prestataire d'IA
refuse au-delà de 100 pages, et le message affiché dit « service indisponible » alors que le
service a répondu. Le correctif (compter les pages avant l'envoi, dire la vraie cause) est
écrit nulle part encore — chantier séparé, non planifié dans la fournée.

---

## À venir, dans l'ordre

L'ordre est décidé ; il ne se réarbitre pas au fil de l'eau.

1. **Offre Essai** — le tunnel d'acquisition décrit ci-dessus (web uniquement).
2. **Phase 1 design** — terminée côté mobile ; reste la même passe côté web.
3. **Build + soumission Apple** — un binaire qui porte les correctifs de la fournée, puis
   soumission.
4. **Phase 2 design** — les trois graphies du même noir en mode clair web, le doré résiduel
   (17 occurrences web, 25 mobile), et le balayage des 56 fichiers avec le contrôle qui
   refuse une couleur décorative écrite en dur.

---

## Backlog à déclencheur

Ces chantiers ne se font pas « quand on aura le temps ». Chacun attend une condition
précise ; le faire avant casse quelque chose. Le détail technique est dans
[`BACKLOG_INFRA.md`](./BACKLOG_INFRA.md).

| Chantier | Déclencheur |
| --- | --- |
| Renommer le projet Vercel `the-hub` → `athlex-manager` | Quand plus aucun lien vivant ne pointe sur `the-hub-rho.vercel.app` : parc mobile à jour, webhooks Stripe migrés, invitations déjà envoyées expirées. Renommer avant transforme des liens vivants en 404 sans trace. |
| Renommer l'identifiant Expo (« slug ») du projet mobile | Quand un build est prêt à repartir de zéro côté stores : le slug est inscrit dans les builds déjà distribués. |
| Relier les formats de tournoi au plan payé (`plan_tier`) | Quand la grille tarifaire des formats est arrêtée. Aujourd'hui les formats verrouillés affichent « Contacte-nous pour l'activer ». |
| Traduction anglaise des CGU | Quand un premier client hors France signe. Les CGU sont un contrat de droit français ; la version FR reste la version qui engage. |
| Langue rendue côté serveur | Quand le référencement en anglais devient un objectif. Aujourd'hui la langue est choisie dans le navigateur, ce qui suffit à l'usage mais pas aux moteurs de recherche. |
| Gamification en événements (event-sourcing) | Quand un badge devra être recalculé après coup, ou quand une contestation exigera de rejouer l'historique. |
| Dette de vocabulaire `member` / `athlete` | Quand une table ou une API devra être ouverte à l'extérieur. Les deux mots désignent la même personne dans le code, ce qui se paie à chaque relecture. |
| Provenance des encaissements au comptoir | Quand un gérant devra justifier un chiffre auprès de son comptable : le journal existe et compte juste, mais il ne dit pas encore qui a saisi la ligne ni sur quelle pièce. |
| Bouton d'offre payante resté en français dans l'interface anglaise (« S'abonner — 59.00 €/month ») | Le prochain lot web qui touche la page publique de box. Un bouton mi-français mi-anglais sur une page de vente se corrige vite, mais pas en urgence. |
| WOD GEN retiré de l'app (flag), à retravailler | Quand le contenu des « 3 séances adaptées à ton profil » sera revu : remettre `FEATURES.wodGen` à `true` suffit, l'écran et la route n'ont pas bougé. |
| Soumission automatique sur Google Play | Quand une clé de compte de service Google Play est fournie. Aujourd'hui le fichier Android est produit signé, et téléversé à la main. |

---

## Résiduels connus et assumés

Ce qui n'est **pas prouvé**, ou accepté tel quel, avec la raison. Cette section existe pour
qu'aucune de ces limites ne soit découverte par surprise.

| Résiduel | Pourquoi |
| --- | --- |
| **Le rendu natif n'est pas simulé.** Les écrans mobiles sont vérifiés dans un navigateur et par la mesure des contrastes, pas sur un iPhone. | Aucun simulateur iOS n'est disponible sur la machine de vérification. Ce qui se constate reste vrai (couleurs, textes, chemins de données) ; le rendu final sur appareil ne l'est pas. |
| **Le traitement Apple du build 1.0.51 n'est pas constaté.** L'envoi est confirmé par Apple, le traitement ne l'est pas. | L'accès passe par une clé serveur, qui ne voit pas l'état de traitement. C'est là que se manifestent les refus tardifs (permissions, conformité export). Visible sur App Store Connect. |
| **Le fichier Android n'est pas soumis.** Il est produit et signé, il se téléverse à la main. | Aucune clé de compte de service Google Play (voir backlog). |
| **Un défaut de droits `supabase_admin` reste sous surveillance.** | Il est constaté par l'audit nocturne des droits sur la production, jugé sans conséquence exploitable en l'état, et surveillé plutôt que corrigé à l'aveugle. |
| **La cause première de la perte de session navigateur du 24 août n'est pas établie.** | Le symptôme est réparé (la session se réaligne, et un échec se nomme au lieu de rendre un écran vide), mais ce qui a tué la session ce jour-là n'est pas connu. Si le cas revient, il se nommera. |
| **Le message d'erreur d'un écran de refus d'hydratation n'a pas été vu à l'écran.** | En production, ce chemin renvoie vers la page de connexion avant que l'écran se monte. Seul son code est vérifié. |
| **Le refus d'un cours complet à l'essai n'est pas rejoué en production.** | Décision assumée du 30 août : la garde est la même fonction, mesurée sur pile jetable avec le trigger réel. Le provoquer en production demanderait de remplir un vrai cours ou d'en créer un factice sur le planning — plus cher que ce que ça prouve. |
| **Les plafonds anti-abus par e-mail et par adresse Internet ne sont pas rejoués en production.** | Même décision : prouvés sur pile jetable. Provoquer un blocage anti-abus sur la vraie base fabriquerait du bruit pour confirmer du déjà-mesuré. |
| **La réception effective de l'e-mail de confirmation d'essai n'est pas constatée.** | Seule la phrase affichée à l'écran l'est. La preuve appartient à un test de bout en bout avec une vraie adresse de réception ; déclencher un envoi de masse depuis la production toucherait des gérants qui n'ont rien demandé. |
| **Un compte créé à la demande de Nab (test, reviewer, démo) suit une règle fixe.** | Création par l'API admin Supabase avec `email_confirm: true` (aucun e-mail de confirmation envoyé), adresse toujours de la forme `nbstylz+…@gmail.com`, mot de passe jamais transmis par écrit (Nab le pose lui-même via « Mot de passe oublié » ou le choisit), et annonce préalable avant toute création — jamais de compte créé sans accord. |
| **Deux profils affichent encore un ELO qui ne correspond plus à leur historique** (JCVD 1039 pour un dernier `elo_after` de 1064, in the bar 1057 pour 1032). | Cause connue et fermée : l'ancien bouton web écrivait l'historique sans pouvoir écrire le profil (RLS, 204 et 0 ligne — règle 19). Le chemin n'existe plus ; le réalignement est au backlog à déclencheur, il attend un GO. |
| **Le format suisse (double élimination) ne converge qu'à 4 joueurs.** À 8, `advance_bracket_round` apparie les vainqueurs du tableau des perdants avec les perdants du tableau principal en une seule passe par tour, sans tour où les vainqueurs du LB se rencontrent : au tour 3, deux vainqueurs de LB pour un seul perdant de finale, l'un des deux n'a plus jamais d'adversaire ni de défaite. À 5, 6 ou 7, un vainqueur impair est oublié (pas de bye). La clôture refuse alors, à raison (« 1 athlète encore en lice »), et rien n'est écrit. | Aucun tournoi suisse n'existe en production (formats présents : 4 classiques, 1 bracket). Le défaut est affirmé par un test **attendu-rouge** (`test-finalize-elo.mjs`, suite « swiss à 8 ») qui rougira le jour où la fonction est corrigée. **Déclencheur : avant le premier tournoi suisse réel.** |
| **Les dates de fermeture antérieures au 16 août 2026 sont approximatives.** | Elles sont reconstruites depuis les PRs mergées, pas depuis un journal tenu à l'époque. |
| **Une capacité serveur n'est pas toujours atteignable depuis l'interface.** | C'est une distinction assumée et documentée : le serveur sait faire, l'écran ne l'expose pas encore. Chaque cas connu porte cette mention dans son en-tête. |

---

## Comment ce fichier reste vrai

La règle du haut n'est pas un vœu : elle est contrôlée en CI.

- Le contrôle `.github/workflows/etat-projet.yml` regarde chaque PR qui touche le code de
  l'app ou la base de données. Si `docs/ETAT_DU_PROJET.md` n'est pas dans la même PR, le
  contrôle est **rouge**.
- La seule sortie est explicite et nommée : écrire dans la description de la PR une ligne
  `État du projet : sans objet — <raison>`. Une raison vide ne passe pas. La sortie laisse
  donc une trace lisible, au lieu d'un oubli silencieux.
- Le miroir dans `AthleX-Manager` (`docs/ETAT_DU_PROJET.md`) est un **renvoi**, pas une
  copie : il ne contient aucun contenu d'état, donc il ne peut pas diverger discrètement de
  celui-ci. Un contrôle mécanique du dépôt web refuse qu'on y recopie les sections.
