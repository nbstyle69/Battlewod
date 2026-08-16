# Règles de vérification — « la valeur plausible qui ment »

Six bugs de la même famille ont été attrapés sur cinq chantiers (invitations, présences,
statistiques, formats de tournoi, portabilité). Aucun n'était visible à l'écran : chacun
affichait un chiffre ou un état **crédible, stable et faux**. Un plantage se voit ; une
valeur plausible se croit, et se croit longtemps.

Ce document liste les règles qui en sortent. Il ne prescrit pas un style de code : il
prescrit **ce qu'il faut aller vérifier avant de dire qu'une chose marche**.

---

## Les six occurrences, en une ligne chacune

| Chantier | Ce qui s'affichait | Ce qui était vrai |
|---|---|---|
| Abonnés / cartes | `0 membre` | requête refusée par la RLS (`select('*')` sur des colonnes révoquées) |
| Stats — impayés | `0 impayé`, montant compté dans le MRR | les impayés sont en `subscription_status='past_due'`, jamais lus |
| Stats — formules | `Illimité : 0 abonné / 9 900 €` | ligne fantôme d'un `LEFT JOIN`, repli sur le prix affiché |
| Stats — assiduité | synthèse `16`, heatmap `17` | la heatmap comptait les cours du jour, pas la synthèse |
| Stats — funnel | `167 %` de conversion | abonnés hors cohorte de la période |
| Tournois — formats | « cette box n'a droit qu'au Classique » | colonne absente de la liste de `select`, repli `?? ['simple']` |

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

## Check-list avant de dire « ça marche »

- [ ] Les erreurs Supabase sont remontées à l'écran, pas avalées en tableau vide.
- [ ] Aucun `??` ne fabrique un droit, un montant ou un compte.
- [ ] Les listes de colonnes des tables touchées sont à jour chez **tous** les appelants.
- [ ] Aucun `select('*')` sur une table à colonnes sensibles ; l'export inspecte ses colonnes.
- [ ] Les fixtures reproduisent les états écrits par les webhooks / triggers réels.
- [ ] Chaque assertion peut échouer — vérifié en la faisant échouer une fois.
- [ ] Les mutations sensibles passent par une RPC `SECURITY DEFINER` gardée `is_box_admin`,
      `search_path` fixé, testée au vrai JWT (propriétaire, gérant tiers, athlète, anon).
- [ ] Rejeu sur les données réelles après application de la migration, pas seulement en local.

---

## Spécifique à ce dépôt (serveur + mobile)

- **Migration d'abord, écran ensuite.** Une PR web qui appelle une RPC absente affiche un
  bandeau d'erreur en preview. La migration s'applique en prod avant le merge de l'écran.
- **`db-fidelity` après chaque application en prod**, sur les huit dimensions (colonnes,
  fonctions, policies, triggers, index, grants table/colonne/routine). Un écart de fonction
  signale d'abord un rejeu local périmé : `KEEP=1 ./scripts/db-replay.sh`, puis on relit.
- **Grants explicites.** Une RPC `SECURITY DEFINER` sans `REVOKE … FROM anon` reste
  appelable par la clé anon. Le protocole teste `anon` **et** `authenticated` d'une autre
  box, pas seulement le cas nominal.
- **`SET search_path TO 'public', 'pg_temp'`** sur toute fonction `SECURITY DEFINER`.
- **Les triggers d'immuabilité ne doivent pas bloquer les cascades.** Un trigger qui refuse
  tout `UPDATE`/`DELETE` casse la suppression de compte (les FK écrivent : `SET NULL`,
  `CASCADE`). On verrouille la substance (montant, date, box), pas la ligne entière.
- **Protocoles au vrai JWT**, dans `scripts/_*_proto.mjs` : propriétaire, gérant d'une autre
  box, athlète, anon — et nettoyage des fixtures en fin de course.
