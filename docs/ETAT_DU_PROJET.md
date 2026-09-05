# État du projet AthleX

Dernière mise à jour : **4 septembre 2026**.

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
| Le jeton de notification s'efface **avant** la fermeture de session (sinon 401 et l'ancien compte garde ses notifications sur le téléphone) ; un échec d'effacement est remonté dans Sentry | 4 septembre 2026 |
| Les erreurs Supabase Auth connues (« Error sending confirmation email », « Email not confirmed », « User already registered », « Invalid login credentials »…) sont traduites FR/EN, repli générique en français — plus de message brut en anglais | 4 septembre 2026 |
| **Compte reviewer Apple `nbstylz+apple@gmail.com` — ne pas supprimer, ne jamais promouvoir.** Athlète `member` rattaché à Crossfit NBS2 sans formule ni abonnement, e-mail confirmé à la création, aucun mot de passe transmis (Nab passe par « mot de passe oublié »). Frontière prouvée depuis son JWT : `is_box_owner_admin` = false, `get_my_admin_boxes()` vide, tables d'argent vides ou refusées, promotion de rôle sans effet. Créé le 4 septembre 2026 après la purge des 11 comptes jetables (`@athlex-test.local`, `@e2e.local`, `@audit.athlex.io`, `zz.design@athlex.test`) et du tournoi de démo « Test Bracket 16 » | 4 septembre 2026 |

### Mises à jour de l'app (OTA) et livraison

| Capacité | Fermé le |
| --- | --- |
| Publication automatique d'une mise à jour à chaque push, avec garde-fou sur la version cible | 19 août 2026 |
| Une mise à jour ne peut plus partir sans les clés d'accès à la base (l'app arrivait intacte mais inerte) | 19 août 2026 |
| Rejeu du schéma de base de données en CI à chaque PR | 16 août 2026 |
| Version `1.0.51` construite pour iOS et Android, IPA envoyé sur App Store Connect | 24 août 2026 |
| Version `1.0.52` (49) iOS construite depuis `master`, IPA vérifié 17/17, traitée par Apple et installable depuis TestFlight (groupe interne) — non soumise à App Review, en attente de la matrice caméra | 3 septembre 2026 |

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
avant/arrière × portrait/paysage) est dans la PR. Le chemin
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
| Clé étrangère `group_messages.sender_id → profiles` (`ON DELETE SET NULL`) et affichage « Compte supprimé » pour un expéditeur `NULL` | Quand un lot touche la messagerie de groupe. La colonne n'a aucune clé étrangère aujourd'hui : la suppression d'un compte laissait ses messages orphelins (24 sur 39 purgés le 4 septembre 2026). |

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
