# État du projet AthleX

Dernière mise à jour : **24 août 2026**.

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

### Mises à jour de l'app (OTA) et livraison

| Capacité | Fermé le |
| --- | --- |
| Publication automatique d'une mise à jour à chaque push, avec garde-fou sur la version cible | 19 août 2026 |
| Une mise à jour ne peut plus partir sans les clés d'accès à la base (l'app arrivait intacte mais inerte) | 19 août 2026 |
| Rejeu du schéma de base de données en CI à chaque PR | 16 août 2026 |
| Version `1.0.51` construite pour iOS et Android, IPA envoyé sur App Store Connect | 24 août 2026 |

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

**Offre Essai (tunnel d'acquisition de prospects).** Le socle serveur est écrit : le
visiteur peut réserver sans compte, l'essai est gratuit parce que la base refuse un essai
payant, un cours complet est refusé au lieu de mettre le visiteur en liste d'attente sans le
dire, et ses coordonnées ne sont pas dans la table que tout adhérent de la box peut lire.

**Ce qui reste :** les écrans. Le bouton « Essai » et le calendrier sur la page publique de
la box, le 4e type d'offre dans « Nouvelle offre », l'affichage des prospects sans compte
dans Prospects, la mention « Essai » dans la liste de présence du coach, l'e-mail de
confirmation, et le fait de ne plus compter un essai comme un adhérent dans les
statistiques.

**Ce qui bloque :** rien. Ce socle n'est pas encore en production : il y sera appliqué au
merge, et il ne montera dans la liste du haut qu'une fois constaté sur la base réelle.

**Une limite nommée plutôt que supposée :** le plafond par adresse e-mail est tenu par la
base (donc prouvable). Le plafond par adresse Internet du visiteur sera tenu par le site
web : la base n'a pas accès à cette information, et une limite supposée n'est pas une
limite.

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
