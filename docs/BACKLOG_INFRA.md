# Backlog infrastructure — dettes à déclencheur

Chaque entrée porte sa **condition de déclenchement** : elle ne se traite pas « quand on aura
le temps », mais quand la condition est vérifiée. Une dette d'infrastructure sans condition
finit exécutée trop tôt (et casse) ou jamais.

Le pendant côté web est `docs/BACKLOG_INFRA.md` du dépôt `AthleX-Manager` (projet Vercel).

---

## Renommer le projet Expo `@nbstyle/TheHub` → `athlex-app`

Le dépôt GitHub est renommé (`Battlewod` → `athlex-app`), mais le projet **Expo** de l'app
mobile s'appelle toujours `TheHub` — le nom qu'on vient de libérer côté web, posé sur le
mauvais produit.

```
projectId     54f4c573-40f9-4b3a-a2dd-d2e93500482b   (identité réelle, stable)
updates.url   https://u.expo.dev/54f4c573-…          (adressage par UUID)
slug          TheHub                                  (le nom à changer)
```

L'OTA est adressée par UUID, donc le renommage est *a priori* sans effet sur la livraison —
c'est précisément ce « a priori » qui en fait une condition à vérifier plutôt qu'une
opération à faire.

**Condition de déclenchement — les trois doivent être vraies :**

- [ ] La dernière OTA publiée est adoptée par le parc installé.
- [ ] Preuve que le slug n'intervient nulle part dans la résolution du canal (manifeste
      d'update servi au client, pas seulement la documentation).
- [ ] Fenêtre sans update en vol : aucun build store en cours de revue, aucune OTA du jour.

---

## Liens universels Android sur `athlexapp.eu`

`app.json` déclare l'`intentFilter` sur le nouveau domaine, mais c'est de la configuration
**native** : elle n'entre en vigueur qu'au prochain build boutique, jamais par OTA. D'ici là,
un lien `athlexapp.eu` ouvert sur Android reste dans le navigateur. Côté iOS aucun
`associatedDomains` n'a jamais été déclaré : rien ne régresse.

**Condition** : prochain build store (aucune action intermédiaire utile).

---

## État de la vérification faite avant le renommage du dépôt

Ce que la contre-vérification a couvert, et ce qu'elle **n'a pas** pu couvrir — pour qu'une
relecture ultérieure sache où s'arrête la preuve :

| Vérifié | Résultat |
| --- | --- |
| PR ouvertes | aucune |
| Webhooks du dépôt | aucun |
| Workflows CI (`ci`, `db-replay`, `integration`) | `actions/checkout` du dépôt courant, aucun nom en dur |
| Lien EAS / Expo | par `projectId` UUID, indépendant du dépôt GitHub |
| Occurrences « Battlewod » dans le dépôt | documentation, plans de test et fichiers de skills — jamais un identifiant |

**Non inspectable avec les droits de l'intégration** (403 `Resource not accessible by
integration`) : les *deploy keys* et les *secrets Actions* du dépôt. Les deux sont attachés au
dépôt et non à son nom, donc le risque est théorique — mais il n'est pas *vérifié*.

**À ne pas toucher** : `supabase/config.toml` porte `project_id = "battlewod"`. C'est
l'identifiant de la pile **locale** de développement, sans rapport avec GitHub ; le changer
casserait les chemins de la pile locale sans rien renommer d'utile.

---

## Le bundle embarqué du prochain build natif doit passer par `get_my_profile()`

**Constat mesuré le 19/08** : le bundle **embarqué** du build 44 (10/08) lit encore
directement `profiles.full_name`, `profiles.gender` et `profiles.personal_records` —
colonnes révoquées depuis. Sur cette base, la lecture rend `42501 permission denied` et
l'app retombe sur l'écran de connexion.

Une installation neuve (nouveau TestFlight, futur App Store) exécute **ce bundle-là**
jusqu'à son premier OTA : elle démarre donc cassée, le temps du premier téléchargement
d'update. Aucun correctif OTA ne peut couvrir cette fenêtre, par construction.

**Condition** : prochain build natif — et notamment la soumission Apple. Le binaire soumis
doit être construit **après** les correctifs `get_my_profile()` (#181, #183, #193), et la
vérification à faire n'est pas « l'app démarre sur le simulateur » mais l'inspection du
bundle embarqué du binaire soumis : aucune lecture directe des trois colonnes révoquées.
