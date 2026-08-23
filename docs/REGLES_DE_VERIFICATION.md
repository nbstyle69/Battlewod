# Règles de vérification — « la valeur plausible qui ment »

Neuf bugs de la même famille ont été attrapés sur six chantiers (invitations, présences,
statistiques, formats de tournoi, portabilité, sécurité des profils et des paiements).
Aucun n'était visible à l'écran : chacun affichait un chiffre ou un état **crédible, stable
et faux**. Un plantage se voit ; une
valeur plausible se croit, et se croit longtemps.

Ce document liste les règles qui en sortent. Il ne prescrit pas un style de code : il
prescrit **ce qu'il faut aller vérifier avant de dire qu'une chose marche**.

---

## Les occurrences, en une ligne chacune

| Chantier | Ce qui s'affichait | Ce qui était vrai |
|---|---|---|
| Abonnés / cartes | `0 membre` | requête refusée par la RLS (`select('*')` sur des colonnes révoquées) |
| Stats — impayés | `0 impayé`, montant compté dans le MRR | les impayés sont en `subscription_status='past_due'`, jamais lus |
| Stats — formules | `Illimité : 0 abonné / 9 900 €` | ligne fantôme d'un `LEFT JOIN`, repli sur le prix affiché |
| Stats — assiduité | synthèse `16`, heatmap `17` | la heatmap comptait les cours du jour, pas la synthèse |
| Stats — funnel | `167 %` de conversion | abonnés hors cohorte de la période |
| Tournois — formats | « cette box n'a droit qu'au Classique » | colonne absente de la liste de `select`, repli `?? ['simple']` |
| Profils — fermeture de colonnes | migration « REVOKE » appliquée, catalogue à jour | le grant de **table** rendait le revoke de colonne sans effet |
| Provenance d'inscription | `UPDATE` refusé, « succès » renvoyé | zéro ligne visible : PostgREST rend 200 sans rien écrire |
| OTA avant révocation | « l'app se charge, OTA constaté » | l'update n'était pas publié ; l'ancien code marchait encore, la coupe n'était pas passée |
| Lot 4 — RPC de lecture staff | « l'appel anonyme est refusé », `42501` | c'était le *corps* qui refusait ; le grant était ouvert — une barrière sur deux |
| Grants de fonction | règle écrite « `REVOKE … FROM anon` », appliquée 20 fois | `anon` hérite de `PUBLIC` : la règle prescrivait la moitié sans effet |
| Grants — filet de CI | « R1/R2 tournent en CI, la règle est tenue » | la CI rejoue nos migrations sur une base neuve : elle ne voit pas la prod |
| Audit de prod — 1er run | job **rouge** (donc « une garde a sauté ») | l'audit est mort à l'import : zéro assertion exécutée, rien de constaté |

---

## 1. Un repli (`??`, `||`, `?.`) sur une donnée qui vient de la base est un mensonge par défaut

`allowedFormats = box.allowed_tournament_formats ?? ['simple']` a masqué le bug pendant
des semaines : la colonne manquait dans la liste de `select`, l'écran recevait `undefined`,
et le repli **inventait une valeur plausible** au lieu de laisser l'erreur remonter.

- Un repli est légitime sur une donnée **facultative par nature** (`logo_url`, `bio`).
- Il est interdit sur une donnée **qui décide d'un droit, d'un montant ou d'un compte**.
  Là, l'absence doit être visible : bandeau d'erreur, log, ou plantage franc.
- « Zéro » ne doit jamais pouvoir signifier « la requête a échoué ». Si l'erreur Supabase
  n'est pas remontée, le zéro n'est pas une information.

## 2. Une liste de colonnes explicite est une dette : elle se met à jour

`select('*')` est interdit sur les tables à colonnes révoquées (`boxes`, `box_members`,
`profiles`) — mais la liste explicite qui le remplace **s'oublie**. Toute colonne ajoutée à
une table lue par une liste explicite doit être ajoutée à cette liste, ou l'écran lira
`undefined` (voir règle 1). Le seul contre-poison connu : chercher les autres appelants
de la table quand on ajoute une colonne.

Symétrique, côté export : une étoile ne produirait pas un zéro mais **une fuite**
(`box_invitations.token_hash`, `box_members.stripe_*`). Le test doit inspecter les
**colonnes demandées**, pas seulement le résultat.

## 3. Les fixtures se construisent depuis les états que le webhook produit réellement

Le bug des impayés a survécu à son protocole parce que le fixture reproduisait l'erreur de
la synthèse : il posait un impayé en `subscription_status='active'`, comme le code le
supposait, alors que Stripe écrit `'past_due'`.

- Un fixture d'abonnement se construit depuis ce que **le webhook écrit**, pas depuis ce
  que l'écran attend.
- Quand un état existe en prod, on rejoue **sur les vraies données après application de la
  migration** — c'est ce qui a attrapé la ligne fantôme du `LEFT JOIN` et l'écart 16/17.

## 4. Une assertion qui ne peut pas échouer n'est pas une assertion

« Aucun `token_hash` dans le pack exporté » est vert sur une base sans invitation. Le
protocole doit donc **prouver d'abord que la donnée dangereuse existe**, puis vérifier son
absence :

```js
const hash = (await svc.from('box_invitations').select('token_hash')…)?.token_hash;
check('un token_hash existe bien en base (le test a du sens)', !!hash);
check('aucun token_hash dans le pack', hash ? !all.includes(hash) : false);
```

Même motif pour un rapport d'import : on ne vérifie pas qu'il contient des lignes, on
vérifie qu'il en contient **autant que le fichier envoyé** — sinon on valide un décompte de
survivants, pas un rapport.

## 5. Deux chiffres du même écran qui parlent de la même chose doivent être égaux, et le test doit l'exiger

La synthèse disait 16, la heatmap 17. Aucun des deux n'était absurde. Quand un écran
affiche deux vues d'un même ensemble, l'égalité est une **assertion**, pas une évidence.

## 6. Un taux n'a de sens que sur une cohorte, et pas sur trois personnes

167 % de conversion venaient d'un numérateur hors cohorte. Deux règles :
- le numérateur est un **sous-ensemble** du dénominateur, et le protocole le verrouille ;
- pas de pourcentage tant que l'effectif de départ est petit (< 10) : on affiche `1/3`.

## 7. Un refus silencieux différé est un bug, pas une variante

Une invitation vers un membre exclu était acceptée, envoyée, ouverte, et ne se refusait
qu'à la création du compte : le gérant ne l'apprenait jamais. Une garde doit se poser **au
plus tôt** (à l'écriture), et dans la RPC plutôt que dans l'écran — tous les chemins en
héritent alors mécaniquement, y compris ceux qu'on écrira plus tard.

---

## 8. Un ordre SQL peut répondre « fait » sans rien faire : le grant de table court-circuite le revoke de colonne

```sql
REVOKE SELECT (email) ON public.profiles FROM authenticated;   -- répond « REVOKE »
```

L'e-mail restait lu par n'importe quel compte connecté. Postgres **additionne** les
privilèges : tant que `authenticated` garde le `SELECT` de **table**, un revoke de colonne
ne retire rien. Pire, le catalogue confirme le mensonge — la ligne disparaît bien de
`information_schema.column_privileges` — donc une vérification par inspection du catalogue
valide une fermeture qui n'existe pas. Seule une lecture au vrai JWT la contredit.

Le levier juste est un basculement en liste blanche :

```sql
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT  SELECT (id, username, avatar_url, elo, …) ON public.profiles TO authenticated;
```

Deux conséquences qui se paient plus tard si elles ne sont pas écrites tout de suite :

- la liste devient la **source de vérité** : toute colonne ajoutée ensuite à la table est
  invisible aux clients jusqu'à son ajout explicite. Ça s'écrit **en tête de la migration**,
  là où le prochain lecteur de cette table passera ;
- un droit de colonne révoqué fait échouer **toute** la requête qui la mentionne, pas
  seulement la colonne. Donc l'app se déploie **avant** la coupe (OTA d'abord, révocation
  ensuite), sinon un client installé ne charge plus son propre profil.

## 9. « Aucune ligne touchée » se lit « succès » : un code de retour n'est pas un résultat

Le protocole affirmait qu'un client ne pouvait pas requalifier sa `provenance`, et
l'`UPDATE` répondait « succès ». Vérifié : l'athlète n'a aucune policy `UPDATE`, sa requête
correspond donc à **zéro ligne**, et PostgREST rend 200. L'assertion mesurait le code de
retour au lieu de l'effet. Une garde d'écriture se prouve sur les deux chemins réels — le
rôle sans policy (nombre de lignes renvoyées = 0) **et** le rôle qui a la policy (erreur
attendue du trigger) — puis par une **relecture de la ligne** en service_role.

## 10. « Mergé » n'est pas « chez l'utilisateur » : un constat qui ne pouvait pas échouer ne prouve rien

La règle 8 impose de déployer l'app **avant** de révoquer une colonne. L'ordre a été
respecté sur le papier : PR mergée, puis « relance l'app, vérifie que ton profil se charge »,
puis révocation. Le profil se chargeait. La révocation est passée. **L'app s'est bloquée à
la connexion.**

Deux causes empilées :

- **rien ne publiait l'OTA.** Merger sur `master` ne déclenche aucun `eas update` ; le
  dernier update du canal `production` datait d'avant le chantier. Le client installé lisait
  donc toujours les colonnes en direct ;
- **le constat ne pouvait pas échouer.** Au moment de la vérification, la coupe n'était pas
  encore appliquée : l'ancien code fonctionnait de toute façon. On a fait constater un état
  qui aurait été identique avec ou sans déploiement — un contrôle positif sans variable.

Ce qui se vérifie, sur un déploiement OTA :

- l'**identité de l'update reçu** par l'appareil (`Updates.updateId` / le message d'update),
  pas le fait qu'un écran s'affiche ;
- ou, à défaut, la **conséquence propre au nouveau code** : ici, que le profil arrive par
  `get_my_profile()` — donc, à l'inverse, que la version installée **échoue** si on coupe.
  Un constat qui donne le même résultat avant et après le déploiement ne mesure rien.

Corollaire : quand une migration ferme une porte que le client installé emprunte, la
séquence sûre est **publier → prouver que la publication est arrivée → couper**, et la
publication doit être automatique ou consignée, jamais laissée à la mémoire de quelqu'un.

---

## 11. « Publié » et « reçu » ne suffisent pas : un bundle peut arriver intact et inerte

La règle 10 a été appliquée : l'OTA est devenu automatique, chaque merge a publié, et
l'identité de l'update publié figure dans le résumé du job. Les quatre updates suivantes ont
**enfermé tous les utilisateurs dehors** — écran de connexion immédiat, soumission sans
message, tous les comptes.

`process.env.EXPO_PUBLIC_*` est **inliné au moment du bundle**. Le runner CI n'avait ni
`.env` ni les variables d'environnement EAS : `EXPO_PUBLIC_SUPABASE_URL` et
`EXPO_PUBLIC_SUPABASE_ANON_KEY` valaient `undefined`, `createClient('', '')` levait, et l'app
n'avait plus aucun client pour parler au serveur. `eas build` lisait ces variables par son
profil ; `eas update` ne les lit que si on lui passe `--environment`.

Pourquoi rien ne l'a vu :

- le **garde-fou runtime** validait la seule question qu'il posait — l'update est-il
  applicable ? Il l'était. Applicable et vide ;
- les **journaux de publication** disaient « Published! », ce qui est vrai ;
- le **harnais web** exportait depuis une machine où `.env` était chargé : son bundle, lui,
  avait les clés. Un contrôle qui construit son propre artefact ne teste pas celui qui part ;
- **côté serveur, rien n'apparaissait** — aucune requête n'atteignait la base. Une panne sans
  trace ressemble à un problème de compte.

Ce qui se vérifie :

- on **retélécharge le bundle réellement servi** par le canal et on cherche dedans la
  configuration attendue (`scripts/ota-verify-bundle.mjs`). Le CDN EAS répond `403` sans
  en-tête : la signature se trouve dans la partie `extensions` du manifeste, et un `403` en
  HTML se lit comme du JavaScript si on ne regarde que le code de retour ;
- la **configuration absente lève tôt et se nomme**, plutôt que « supabaseUrl is required. »
  cinq niveaux plus bas ;
- l'appareil **affiche l'identité du code qu'il exécute** (écran de connexion) : sans elle,
  l'enquête repose sur des déductions, et un téléchargement échoué en silence est
  indistinguable d'un bundle fautif.

Corollaire général : un artefact de déploiement se vérifie **par son contenu**, pas par le
succès de l'ordre qui l'a produit. « L'ordre a réussi » et « l'artefact est bon » sont deux
états distincts, exactement comme « mergé » et « chez l'utilisateur ».

---

## 12. Une capacité serveur sans appelant doit le dire dans son en-tête

Trois fonctions livrées, gardées, testées — et **jamais exécutées par un utilisateur réel**,
faute d'un bouton qui les appelle :

| Fonction | Appelants dans les interfaces | État |
|---|---|---|
| `join_program(p_source => 'staff')` | aucun (le webhook Stripe n'emprunte que la porte `'stripe'`) | point d'extension, lot 5 |
| `get_athlete_private_profile()` | aucun avant le lot 4 web | atteignable depuis la fiche athlète de `/members` |
| `resolve_program_week_source('template')` | aucun avant le lot 3 | exercé par le Whiteboard web |

Un point d'extension assumé est légitime. Ce qui ne l'est pas, c'est qu'il soit
**indistinguable d'une fonctionnalité livrée** quand on relit le code six mois plus tard :
la garde est écrite, le test passe, le nom promet un usage — et pourtant aucun chemin réel
n'y mène. C'est la même famille que le reste de ce document : un état crédible, stable et
faux, sauf qu'ici ce qui ment est la *présence* de la capacité, pas une valeur.

Donc : une fonction sans appelant dans les interfaces le déclare dans son commentaire
d'en-tête, avec cette formule exacte —

```sql
-- Règle 12 : point d'extension, aucun appelant à ce jour, non exercé en production.
```

Et la formule **part** le jour où un écran l'appelle : une annotation périmée redevient un
mensonge. Le corollaire de vérification : « la fonction existe et ses tests passent » ne dit
rien de « un utilisateur peut l'atteindre ». La seconde affirmation se prouve en cherchant
l'appel dans les deux dépôts, pas en relisant la migration.

---

## 13. Un code de retour que plusieurs gardes produisent n'est pas discriminant

L'assertion du lot 4 disait « l'appel non authentifié est refusé », et elle était verte. Elle
l'était **dans les deux états** :

```
grant ouvert   → 42501  « Authentification requise »          ← le corps refuse
grant fermé    → 42501  « permission denied for function … »  ← le grant refuse
```

Deux barrières étaient prévues, une seule était en place, et le test ne pouvait pas le voir :
il validait **qu'on refuse**, pas **qui refuse**. Une barrière retirée était invisible.

C'est la même famille que le `?? ['simple']` (règle 1) et que le « succès à zéro ligne »
(règle 9) : **la valeur observée est correcte, la conclusion qu'on en tire ne l'est pas.**
Ici, `42501` est bien la bonne réponse — elle ne dit simplement pas ce qu'on lui fait dire.

Donc, sur toute assertion d'autorisation :

- si deux chemins peuvent produire le code observé, l'assertion **nomme la barrière** —
  par le message, ou par un effet propre à une seule d'entre elles ;
- le message est un contrat de test acceptable quand il est produit par le moteur
  (`permission denied for function`), pas quand il vient de notre propre `RAISE` (qu'une
  refonte réécrit sans prévenir) ;

```js
assertRefused('l\'appel non authentifié est refusé', anonErr);
assert('et il est refusé par le grant, pas par le corps de la fonction',
  (anonErr?.message ?? '').includes('permission denied for function'));
```

- corollaire de conception : quand deux gardes doivent tenir, **chacune se prouve seule**.
  Une garde qui n'est vérifiée qu'à travers l'autre peut disparaître sans qu'un test bouge.

---

## 14. Une règle qui s'est déjà oubliée ne se réécrit pas : elle devient un contrôle

`REVOKE … FROM PUBLIC` sur une fonction était **déjà** appliqué dans 20 migrations. Et la
règle écrite existait — dans la section « spécifique à ce dépôt ». Elle disait :

> Une RPC `SECURITY DEFINER` sans `REVOKE … FROM anon` reste appelable par la clé anon.

La prose nommait donc précisément **la moitié qui ne suffit pas** : `anon` hérite du grant
implicite de `PUBLIC`, et le revoke nominatif ne retire pas l'héritage. Douze occurrences
plus tôt, la règle 8 avait déjà dit cela des colonnes (`Postgres additionne les privilèges`) —
la transposition aux fonctions n'a pas été faite.

Ce que le catalogue a répondu quand on l'a interrogé au lieu de relire le SQL : **la cause
n'était pas l'oubli**, c'était la naissance. Toute fonction créée dans `public` naît
atteignable par la clé anonyme, par deux chemins cumulés :

```
défaut câblé du moteur  : EXECUTE accordé à PUBLIC sur toute fonction neuve
pg_default_acl          : postgres/public/f → {anon=X, authenticated=X, service_role=X}
```

Et les deux ne se ferment pas de la même façon — piège mesuré, pas déduit :

```sql
-- ne ferme QUE anon : le défaut câblé de PUBLIC survit à la forme « IN SCHEMA »
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
-- ferme PUBLIC : seule la forme globale annule le défaut du moteur
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Donc la réponse n'est pas une treizième ligne de prose. C'est une assertion structurelle qui
**interroge `pg_proc`**, pas nos migrations — `scripts/test-grants.mjs`, suite `grants`,
incluse dans `all` :

- **R1** — aucune fonction de `public` n'accorde `EXECUTE` à `PUBLIC` (`aclexplode`, `grantee = 0`) ;
- **R2** — `anon` n'exécute que les fonctions d'une **liste blanche annotée**, chaque entrée
  portant sa raison (prédicat de policy, page publique). Une liste blanche sans motif
  redevient l'état qu'on voulait corriger ;
- **R3** — une fonction créée **sans grant explicite** n'est atteignable ni par `PUBLIC` ni
  par `anon`. R1 et R2 constatent l'état ; R3 porte sur la cause, donc sur demain ;
- et les sondes REST à la clé anon exigent le message du **grant** (règle 13), avec un
  contre-exemple atteignable (`peek_box_invitation`) pour que « tout est refusé » ne passe
  pas pour un succès (règle 4).

Ce qui distingue un contrôle d'une règle : on l'a fait **échouer**. Grant `PUBLIC` remis sur
`get_box_dunning` et fonction `zz_probe()` créée → `7 ✅ · 3 ❌`. Et R3 a échoué sur sa
première version de la migration, ce qui est précisément comment le piège des deux portées
`ALTER DEFAULT PRIVILEGES` a été trouvé.

Généralisation : **une règle qu'on relit s'oublie, une règle que la CI applique ne s'oublie
pas.** La deuxième occurrence d'une même famille est le signal qu'il faut sortir de la prose.

---

## 15. Un contrôle prouve l'état de la base qu'il interroge — la CI n'est pas la prod

La règle 14 s'est arrêtée une étape trop tôt. R1/R2 tournaient bien en CI, et il a été écrit
que « le filet reste R1/R2 en CI » — or la CI d'intégration repart d'une baseline et rejoue
**nos migrations**. Elle prouve donc ce que notre SQL produit, et rien d'autre : elle ne voit
ni une fonction créée depuis le SQL editor, ni une extension installée par la plateforme, ni
un grant posé à la main un soir de dépannage. C'est la règle 10 (« mergé n'est pas chez
l'utilisateur ») appliquée aux contrôles : **vert en CI n'est pas fermé en prod**.

Le même raisonnement disqualifie la sonde par création annulée comme *seul* contrôle du
défaut de création : elle ne teste que le rôle avec lequel on se connecte. Le catalogue, lui,
expose le défaut de **tous** les créateurs possibles — dont ceux qu'on ne peut pas modifier.

D'où un second contrôle, `scripts/audit-grants-prod.mjs` (workflow `grants-prod.yml`,
nocturne), strictement en lecture — donc compatible avec « prod sans création » :

- **R1/R2 sur la prod**, avec la liste blanche **partagée** avec la CI (`lib/anon-whitelist.mjs`) :
  deux copies divergeraient, et la plus permissive deviendrait la vraie ;
- **D1** — pour chaque rôle capable de créer dans `public`, `pg_default_acl` doit fermer
  `PUBLIC` **et** `anon`. Les exceptions sont écrites avec leur raison, et une exception
  devenue inutile **échoue** : une exception qui survit à sa cause est un trou qu'on croit
  surveillé ;
- **D2** — aucune fonction de `public` n'appartient à un rôle d'exception. `supabase_admin`
  est hors de notre portée (`postgres` n'en est pas membre, `SET ROLE` refusé) : le risque
  reste **latent** tant qu'aucune fonction n'y naît, et D2 est ce qui le dit le jour où ça
  change.

Deux exigences de forme, apprises ici : le contrôle **échoue le job** (un `NOTICE` dans un log
que personne n'ouvre est l'inverse d'un contrôle), et il échoue aussi quand ses **secrets sont
absents** — un audit sans cible ne passe pas, il échoue.

Et le corollaire de la règle 4, que cet audit rend concret : **une révocation massive sans
contrôle positif est indistinguable d'une panne massive.** 57 fonctions fermées d'un coup, tous
les appels anonymes refusés : sans `peek_box_invitation` qui répond et sans les lectures de
`/box` et `/classement` qui aboutissent, « tout est refusé » se lirait comme un succès alors
que ce serait la panne des pages publiques.

---

## 16. Un rouge que deux causes produisent ne constate rien — un contrôle compte ses assertions

Premier run réel de l'audit de production dans Actions : **rouge**. Mais pas parce qu'une
garde avait sauté — le script est mort à l'import d'un paquet que le job n'installe pas (il
n'a besoin que de `psql` et du `fetch` de Node), donc **avant la première assertion**.

C'est la règle 13 dans une autre robe : là-bas, deux gardes rendaient le même `42501` ; ici,
deux causes rendent le même job rouge.

```
audit qui trouve une faille        → job rouge   ← ce qu'on veut voir
audit qui ne s'exécute pas du tout → job rouge   ← ne dit rien sur l'état de la prod
```

Tant que ces deux états se ressemblent, la lecture du rouge **dépend de quelqu'un** qui ouvre
le log et recompte les lignes à la main. Le jour où personne ne lit, l'ambiguïté reste.

Le contrôle du contrôle, en deux couches parce qu'une seule ne couvre pas la mort au
chargement :

- **dans le script** — une attente chiffrée, **dérivée des listes** et non recopiée
  (`ASSERTIONS_FIXES + EXCEPTIONS_D1.size + SONDES_ANONYMES.length + …`) ; sous l'attendu,
  l'échec porte son propre nom (« audit incomplet — 16/17 »), distinct de « une assertion a
  échoué ». Un `process.on('exit')` imprime le compte même quand le processus meurt entre
  deux assertions (`psql` injoignable) : un audit interrompu n'a pas « presque réussi » ;
- **dans le job** — une ligne sentinelle `AUDIT_PROD_ASSERTIONS=n/attendu` dont **l'absence**
  est un échec nommé. C'est la seule couche qui couvre le cas où rien du fichier ne
  s'exécute : aucun compte n'est alors imprimable depuis Node.

Fait échouer pour de vrai, comme toujours : une sonde retirée de la boucle → `16/17`, rouge ;
`psql` retiré du `PATH` → `0/17`, rouge et nommé ; import cassé → sentinelle absente, rouge
côté job. Et le nominal reste `17/17`.

Généralisation : **un contrôle doit affirmer qu'il a tourné, pas seulement ce qu'il a
trouvé.** Un compteur d'assertions attendu est à un audit ce que le contre-exemple positif
(règle 4) est à une révocation massive : ce qui distingue le succès de l'absence de mesure.

---

## 17. Couleurs de domaine ≠ décoration — un nettoyage aveugle est le bug inverse

La refonte monochrome sort les littéraux de couleur des écrans et les remplace par des
jetons de thème. Appliquée sans distinction, elle **grise du sens** : la médaille d'or et la
médaille de bronze deviennent la même nuance, la défaite ressemble à la victoire, un
avertissement ne s'avertit plus.

```
#C9A227 sur un cadre décoratif     → littéral à sortir     (le jeton dit la même chose)
#C9A227 sur une médaille           → couleur de DOMAINE    (le jeton dit autre chose)
LevelColors, victoire/défaite,
warning, erreur, statut            → couleur de DOMAINE
```

Une couleur de domaine porte une **information que le texte ne porte pas** : c'est le test.
Si la retirer oblige à lire une étiquette pour retrouver le sens, elle n'était pas de la
décoration. Les couleurs de domaine se **centralisent** (une source nommée par domaine) mais
ne se neutralisent pas.

Corollaire pour le contrôle qui refuse un hexadécimal en dur : sa liste d'exemption est
nominative — fichiers de thème **et** fichiers de couleurs de domaine — et non « tout ce qui
est rouge encore présent ». Une exemption large rendrait le contrôle indolore ; une exemption
absente le rendrait faux, donc désactivé au premier écran légitime.

---

## 18. Un contrôle qui écrit doit pouvoir être rejoué — sa mutation inverse aussi

La suite du `CHECK` `HH:MM` insère exprès des heures hors format et exige le refus. Sous
**mutation inverse** (contraintes retirées) ces insertions **réussissent** — et le nettoyage,
écrit pour les ids que la suite retenait, ne retenait justement rien de ces lignes-là. Résultat
mesuré : le rejeu de la migration a échoué sur la base de test, `« is violated by some row »`,
pour des lignes créées par le contrôle lui-même.

```
nominal   : insertion refusée → aucune ligne → nettoyage sans objet     ← le cas qu'on teste
mutation  : insertion ACCEPTÉE → ligne résiduelle → migration bloquée   ← le cas qu'on oublie
```

Le nettoyage d'un contrôle adversarial se déclare donc **sur le critère, pas sur le résultat** :
`delete().eq('name', nomDeLaFixture)` avant les tentatives, et non `delete().eq('id', …)`
après chacune — puisque, précisément, l'état sabotté produit des lignes qu'on n'attendait pas.

---

## Check-list avant de dire « ça marche »

- [ ] Les erreurs Supabase sont remontées à l'écran, pas avalées en tableau vide.
- [ ] Aucun `??` ne fabrique un droit, un montant ou un compte.
- [ ] Les listes de colonnes des tables touchées sont à jour chez **tous** les appelants.
- [ ] Aucun `select('*')` sur une table à colonnes sensibles ; l'export inspecte ses colonnes.
- [ ] Les fixtures reproduisent les états écrits par les webhooks / triggers réels.
- [ ] Chaque assertion peut échouer — vérifié en la faisant échouer une fois.
- [ ] Les mutations sensibles passent par une RPC `SECURITY DEFINER` gardée `is_box_admin`,
      `search_path` fixé, testée au vrai JWT (propriétaire, gérant tiers, athlète, anon).
- [ ] Une fermeture de colonne est prouvée par une **lecture refusée au vrai JWT**, jamais par
      le catalogue : `REVOKE` sur colonne ne retire rien tant que le `SELECT` de table est là.
- [ ] Une garde d'écriture est prouvée sur le rôle **sans** policy (0 ligne) et sur celui qui
      en a une (erreur attendue), puis par relecture de la ligne.
- [ ] Rejeu sur les données réelles après application de la migration, pas seulement en local.
- [ ] Un déploiement OTA est prouvé par l'**identité de l'update reçu** sur l'appareil, jamais
      par « l'écran s'affiche » : avant la coupe, l'ancien code s'affiche aussi.
- [ ] Le bundle **réellement servi** contient sa configuration (`ota-verify-bundle.mjs`) : une
      publication réussie peut livrer un artefact vide, applicable et inerte.
- [ ] Toute fonction serveur neuve a **un appelant nommé dans une interface**, ou l'annotation
      de la règle 12 dans son en-tête. Et l'annotation est retirée le jour où l'écran arrive.
- [ ] Aucune assertion d'autorisation ne repose sur le seul **code** de retour quand deux
      gardes le produisent : on nomme la barrière (message, ou effet propre à une seule).
- [ ] Une règle qui s'est déjà oubliée une fois devient un **contrôle en CI**, pas une ligne
      de plus : `node scripts/test-grants.mjs` (suite `grants`, incluse dans `all`).
- [ ] Un contrôle structurel qui n'existe qu'en CI est doublé d'un **audit de la prod en
      lecture seule** : `scripts/audit-grants-prod.mjs`, nocturne, qui échoue le job (et qui
      échoue aussi si sa cible n'est pas configurée).
- [ ] Toute fermeture massive porte son **contre-exemple positif** : ce qui doit rester
      atteignable l'est encore, sinon la panne ressemble au succès.
- [ ] Un contrôle affirme **combien d'assertions il a exécutées** et échoue sous l'attendu :
      « 0 assertion » est un échec *nommé*, distinct d'une garde qui a sauté (règle 16).
- [ ] Un nettoyage monochrome laisse intactes les couleurs qui **portent l'information**
      (médailles, `LevelColors`, victoire/défaite, warning, erreur, statut) — règle 17.
- [ ] Le nettoyage d'un contrôle adversarial porte sur le **critère de fixture**, pas sur les
      ids retenus : sous mutation inverse, l'écriture refusée réussit (règle 18).

---

## Spécifique à ce dépôt (serveur + mobile)

- **Migration d'abord, écran ensuite.** Une PR web qui appelle une RPC absente affiche un
  bandeau d'erreur en preview. La migration s'applique en prod avant le merge de l'écran.
- **`db-fidelity` après chaque application en prod**, sur les huit dimensions (colonnes,
  fonctions, policies, triggers, index, grants table/colonne/routine). Un écart de fonction
  signale d'abord un rejeu local périmé : `KEEP=1 ./scripts/db-replay.sh`, puis on relit.
- **Grants explicites (corrigé — voir règle 14).** Une RPC `SECURITY DEFINER` se ferme par
  `REVOKE ALL … FROM PUBLIC` **puis** `FROM anon`, puis un `GRANT` nominatif. Le seul
  `REVOKE … FROM anon` que cette ligne prescrivait auparavant ne suffit pas : `anon` hérite
  du grant implicite de `PUBLIC`. Le protocole teste `anon` **et** `authenticated` d'une
  autre box, pas seulement le cas nominal — et `scripts/test-grants.mjs` le vérifie
  mécaniquement sur tout le schéma.
- **`SET search_path TO 'public', 'pg_temp'`** sur toute fonction `SECURITY DEFINER`.
- **Les triggers d'immuabilité ne doivent pas bloquer les cascades.** Un trigger qui refuse
  tout `UPDATE`/`DELETE` casse la suppression de compte (les FK écrivent : `SET NULL`,
  `CASCADE`). On verrouille la substance (montant, date, box), pas la ligne entière.
- **Protocoles au vrai JWT**, dans `scripts/_*_proto.mjs` : propriétaire, gérant d'une autre
  box, athlète, anon — et nettoyage des fixtures en fin de course.
