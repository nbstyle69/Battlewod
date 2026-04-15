# AthleX — Roadmap Pricing B2B/B2C & Architecture

> Document de référence — Dernière MàJ : 12 avril 2026

---

## 1. Modèle B2B — Plan unique à 79€/mois

### Grille tarifaire

| | Early Adopter (5 premières boxes) | Standard |
|---|---|---|
| **Essai gratuit** | **60 jours** | **30 jours** |
| **Prix après essai** | **79€/mois** | **79€/mois** |
| **Prix annuel** | 758€/an (2 mois offerts) | 758€/an |
| **Fonctionnalités** | Toutes — plan complet | Toutes — plan complet |

### Contenu du plan complet (79€/mois)

- Membres : illimité
- Coachs : illimité
- WODs publishing : illimité
- Horaires & réservations : oui
- Groupes de messages : illimité
- Membership plans (interne) : illimité
- Articles / Actualités : illimité
- Analytics box (rétention, engagement, heatmap) : oui
- Export CSV : oui
- Push notifications custom : illimité
- Tournois & Compétitions internes : illimité
- Logo dans l'app : oui
- Référencement annuaire athlex.app : oui
- Gamification (badges, ELO) : oui
- Rapport mensuel auto : oui
- Support prioritaire : oui

### Mécanisme Early Adopter

```
Box n°1 à n°5  → 60 jours d'essai gratuit + badge "Fondateur" permanent
Box n°6+       → 30 jours d'essai gratuit
```

---

## 2. Modèle B2C — Athlètes

| | Free | Premium (M4+) |
|---|---|---|
| **Prix** | 0€ | 7,99€/mois ou 59,99€/an |
| Timer & WODs | oui | oui |
| Classements box | oui | oui |
| Messagerie | oui | oui |
| Badges & ELO | oui | oui |
| Réservations | oui | oui |
| Vidéo recording | 3/mois, 720p, 30s | Illimité, 1080p, 5min |
| PR Tracking | 5 mouvements | Illimité |
| Analytics perso | Basique | Avancé (graphiques) |
| Thèmes app | Défaut | Tous |
| Tournois inter-box | Spectateur | Participation |
| Score card | Watermark AthleX | Sans watermark |
| Historique scores | 30 jours | 1 an |
| Analyse vidéo IA | non | oui (via Modal.com) |

---

## 3. Roadmap 12 mois

### Q1 (Mois 1-3) — Foundation B2B + Stripe

- **M1** : Migration SQL `box_subscriptions` + nouvelles colonnes `boxes` (annuaire)
- **M1** : Edge Functions Stripe (checkout, webhook, portal)
- **M1** : `BOSubscriptionScreen` + trial banner + paywall
- **M1** : Gating navigation (trial expiré → paywall)
- **M2** : `CreateBoxWizard` 3 étapes (infos + visibilité/annuaire + plan)
- **M2** : `BOBoxInfoScreen` étendu (ville, code postal, sport_type, services, cover, Instagram, toggle annuaire)
- **M2** : Coupons Stripe (early adopter 60j) + logique "5 premières boxes"
- **M3** : Page web `athlex.app/boxes` — annuaire public filtrable
- **M3** : Page web `athlex.app/boxes/[slug]` — fiche box détaillée
- **M3** : Geocoding auto (adresse → lat/lng)

**Target M3** : 5 boxes early adopters, annuaire live, funnel trial→paid fonctionnel

### Q2 (Mois 4-6) — Monétisation B2C + Scale B2B

- **M4** : Lancement Premium B2C (7,99€/mois) via RevenueCat
- **M4** : Feature-gate vidéo (Free = 3/mois 720p, Premium = illimité 1080p)
- **M5** : Tournois inter-box payants (fee 5€/athlète, 20% commission)
- **M5** : Referral B2B (box réfère box → 1 mois gratuit pour les deux)
- **M6** : Push annual plan ("-20% paiement annuel")
- **M6** : SEO annuaire (optimisation fiches box pour Google)

**Target M6** : 25 boxes payantes, 200 Premium B2C → MRR ~3 573€

### Q3 (Mois 7-9) — Vidéo IA (Modal.com) + Expansion

- **M7** : MVP Analyse vidéo IA via Modal.com (MediaPipe + GPT-4o Vision)
- **M7** : A/B test pricing (79€ vs 89€)
- **M8** : Marketplace coaches (vente programmes, 15% commission)
- **M8** : Boost annuaire payant ("Mettre en avant ma box" +29€/mois)
- **M9** : Dunning management (retry auto, séquence emails)
- **M9** : Expansion traduction EN/ES

**Target M9** : 60 boxes, 500 Premium B2C → MRR ~8 735€

### Q4 (Mois 10-12) — IA v2 + Data

- **M10** : Analyse vidéo IA v2 (modèle custom Roboflow, on-device)
- **M10** : Intégration wearables (Apple Health, Garmin) en Premium
- **M11** : API publique pour boxes Enterprise (sur devis)
- **M11** : Expansion géographique + pricing par pays (PPP)
- **M12** : Bilan annuel (cohorte analysis, LTV/CAC, optimisation)

**Target M12** : 120 boxes, 1200 Premium B2C → MRR ~19 068€ → ARR ~229K€

---

## 4. KPIs cibles

| Métrique | M3 | M6 | M9 | M12 |
|----------|-----|-----|-----|------|
| MRR Total | 0€ (trial) | 3 573€ | 8 735€ | 19 068€ |
| Boxes payantes | 5 (trial) | 25 | 60 | 120 |
| B2C Premium | - | 200 | 500 | 1 200 |
| Trial→Paid B2B | - | 35% | 40% | 45% |
| B2B Churn mensuel | - | <6% | <4% | <3% |
| Free→Premium B2C | - | 3% | 4% | 5% |

---

## 5. Sprint 1 — Stripe B2B Foundation (2 semaines)

### User Stories

| # | Story | Points |
|---|-------|--------|
| US-1 | Migration DB `box_subscriptions` + colonnes `boxes` (annuaire) | 3 |
| US-2 | Edge Function Stripe Webhook | 5 |
| US-3 | Edge Function Create Checkout Session | 3 |
| US-4 | Edge Function Customer Portal | 2 |
| US-5 | AuthContext enrichi (subscription state, `isBoxActive`, `daysLeftTrial`) | 3 |
| US-6 | CreateBox auto-create trial subscription (60j early / 30j standard) | 2 |
| US-7 | `BOSubscriptionScreen` (plan actuel, upgrade, Stripe portal) | 5 |
| US-8 | Gating Navigation B2B (trial expiré → paywall) | 3 |
| US-9 | Trial Banner sur BODashboard + Push reminder J-3/J-0/J+7 | 2 |
| **Total** | | **28 pts** |

### Architecture Stripe

```
Mobile App (box_owner)
    │
    │ POST /create-checkout { box_id, plan: 'complete', return_url }
    ▼
Supabase Edge Function "create-checkout"
    │ → Crée/récupère Stripe Customer
    │ → Crée Checkout Session (trial_period_days: 60 ou 30)
    │ → Retourne { url }
    ▼
Stripe Checkout (navigateur)
    │
    │ Événements webhook
    ▼
Supabase Edge Function "stripe-webhook"
    │ → checkout.session.completed → insert box_subscriptions
    │ → customer.subscription.updated → sync status
    │ → customer.subscription.deleted → status = canceled
    │ → invoice.payment_failed → status = past_due
    ▼
Table box_subscriptions
    │ box_id, stripe_customer_id, stripe_subscription_id,
    │ plan_tier ('complete'), status, trial_ends_at,
    │ current_period_end, is_early_adopter
    ▼
AuthContext reads → isBoxActive, daysLeftTrial, planTier
```

### Migration SQL prévue

```sql
CREATE TABLE box_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id                 uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_tier              text NOT NULL DEFAULT 'trial'
                         CHECK (plan_tier IN ('trial', 'complete')),
  status                 text NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  is_early_adopter       boolean DEFAULT false,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'trial';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS country text DEFAULT 'FR';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS latitude float;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS longitude float;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS sport_type text[] DEFAULT '{}';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS services text[] DEFAULT '{}';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS is_listed boolean DEFAULT true;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS member_count int DEFAULT 0;
```

---

## 6. Parcours B2B vs B2C

### Parcours B2B (box owner)

```
Register ("Gérant de box")
  → B2B Onboarding (4 slides dédiés BO)
  → CreateBoxWizard étape 1/3 : Nom + Type sport + Taille estimée
  → CreateBoxWizard étape 2/3 : Logo + Cover + Adresse + Ville + CP + Site web + Instagram + Email + Toggle annuaire
  → CreateBoxWizard étape 3/3 : Plan 79€/mois + "Démarrer mon essai gratuit"
  → BODashboard (avec Trial Banner "J-60 restants")
  → ... utilisation normale ...
  → J-3 : Push reminder "Plus que 3 jours"
  → J-0 : Paywall si pas souscrit
  → Stripe Checkout → BODashboard (badge "Plan Complet actif")
```

### Parcours B2C (athlète)

```
Register ("Athlète")
  → WaitingScreen → JoinBox (code) ou Skip
  → MainTabs (5 onglets : Compétitions, Explorer, Accueil, Ma Box, Réservation)
  → Gratuit illimité pour les features de base
  → M4+ : Upsell Premium via in-app purchase
```

---

## 7. Analyse Vidéo IA — Architecture Modal.com

### Stack technique

- **Modal.com** : GPU serverless (T4), Python, pay-per-use
- **MediaPipe** : Pose estimation (33 keypoints, gratuit)
- **ffmpeg** : Extraction frames depuis vidéo
- **GPT-4o Vision** : Feedback forme en langage naturel
- **Roboflow** (M10+) : Modèle custom mouvements CrossFit

### Flow

```
Vidéo enregistrée (Timer)
  → Upload Supabase Storage
  → Supabase Edge Function (auth check + plan check Premium)
  → Modal.com web endpoint (GPU T4)
    → ffmpeg : extract frames
    → MediaPipe Pose : 33 keypoints/frame
    → Algorithme comptage reps (angles articulaires)
    → GPT-4o Vision (3-5 frames) : form feedback
  → Résultat JSON dans l'app
    { reps_detected: 15, form_score: 8.2, feedback: "..." }
```

### Coût estimé

- ~0,05€ par vidéo analysée (Modal GPU + GPT-4o)
- Feature Premium B2C uniquement (7,99€/mois)
- 50 analyses/mois par user = ~2,50€ de coût = marge >65%

### Évolution M10+

- Modèle custom entraîné via Roboflow (500-1000 vidéos annotées)
- Tourne on-device (gratuit, temps réel)
- Plus besoin de GPT-4o → coût zéro par analyse

---

## 8. Annuaire Web athlex.app/boxes

### Données collectées à l'onboarding B2B (étape 2/3)

- Nom, description, tagline
- Logo + photo de couverture
- Adresse, ville, code postal, pays
- Coordonnées GPS (geocoding auto)
- Type de sport (CrossFit, Hyrox, Weightlifting, MMA, Yoga...)
- Services (Open Gym, Coaching privé, Kids, Competition team...)
- Horaires d'ouverture
- Site web, email, téléphone, Instagram
- Toggle "Référencer sur l'annuaire"

### Pages web

- `athlex.app/boxes` : annuaire filtrable (ville, sport, proximité GPS)
- `athlex.app/boxes/[slug]` : fiche détaillée (cover, logo, description, services, avis, CTA "Télécharger l'app")

### Valeur stratégique

- SEO : chaque fiche box indexée par Google → acquisition organique athlètes
- Marketplace effect : plus de boxes → plus d'athlètes → plus de boxes
- Levier de rétention B2B : "votre box est listée tant que l'abonnement est actif"
- Upsell futur : "Boost" payant pour être en haut de l'annuaire (+29€/mois)
