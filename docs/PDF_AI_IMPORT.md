# 📄 Import PDF IA (Claude) — WODs

Feature disponible **uniquement dans le BO web Owner** (pas dans l'app mobile).

Permet à un owner/coach d'uploader un PDF de programmation CrossFit → Claude extrait chaque WOD → modal preview → insertion en base.

---

## 🏗️ Architecture

```
┌──────────────┐   PDF   ┌────────────────────┐  doc + prompt    ┌───────────┐
│  BO web      ├────────>│  Edge Function     ├─────────────────>│  Claude   │
│  (Next.js)   │<────────┤  parse-wod-pdf     │<─────────────────┤  (API)    │
└──────┬───────┘  JSON   └────────────────────┘    JSON structuré└───────────┘
       │
       ▼ insert rows (après confirm user)
  box_wods
```

- **Auth** : JWT du user → la fonction vérifie qu'il est owner OU coach de la `box_id`
- **Limite** : 10 Mo par PDF
- **Sanitisation** : validation stricte du JSON retourné par Claude (types, troncature)
- **Clé API** : stockée dans Supabase secrets (`ANTHROPIC_API_KEY`), jamais côté client

---

## 📂 Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/functions/parse-wod-pdf/index.ts` | Edge Function : auth + Claude + sanitize |
| `Test-admin/app/(dashboard)/wods/page.tsx` | UI BO web : picker, overlay, modal preview |

---

## 🤖 Modèle actuel : `claude-3-5-haiku-20241022`

**Choix actuel** : Haiku 3.5 (économique, qualité correcte sur PDFs structurés).

### Pour switcher de modèle

Ouvrir `supabase/functions/parse-wod-pdf/index.ts`, modifier la constante :

```ts
const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
```

Options disponibles (avril 2026) :

| Modèle ID | Qualité | Coût input | Coût output |
|---|---|---|---|
| `claude-3-5-haiku-20241022` | ⭐⭐⭐ | $0.80 / 1M | $4 / 1M |
| `claude-sonnet-4-20250514` | ⭐⭐⭐⭐⭐ | $3 / 1M | $15 / 1M |

Puis redéployer :

```powershell
npx supabase functions deploy parse-wod-pdf --no-verify-jwt
```

---

## 💰 Coûts estimés

| Type de PDF | Tokens input | Tokens output | Haiku 3.5 | Sonnet 4 |
|---|---|---|---|---|
| 1 semaine (~5 WODs, 2 pages) | ~3 000 | ~2 000 | ~$0.012 | ~$0.04 |
| 1 mois (~20 WODs, 8 pages) | ~12 000 | ~8 000 | ~$0.04 | ~$0.16 |
| 3 mois (~60 WODs, 24 pages) | ~36 000 | ~25 000 | ~$0.13 | ~$0.48 |

→ **Budget recommandé** : 5 USD de crédit Anthropic = ~400 imports Haiku ou ~100 imports Sonnet.

---

## 🚀 Déploiement initial (à faire 1 fois)

### 1. Configure la clé Anthropic

Créer une clé sur https://console.anthropic.com/settings/keys puis :

```powershell
npx supabase secrets set ANTHROPIC_API_KEY="sk-ant-api03-XXXXXXX"
```

### 2. Recharger le compte Anthropic

https://console.anthropic.com/settings/billing → Add credits (minimum 5 USD).

### 3. Déployer l'Edge Function

```powershell
npx supabase functions deploy parse-wod-pdf --no-verify-jwt
```

> Le flag `--no-verify-jwt` est requis car on gère l'auth manuellement (extraction du JWT, vérification owner/coach via service role).

### 4. Déployer le BO web (Vercel)

Auto via push sur la branche `main` :

```powershell
cd Test-admin
git add app/(dashboard)/wods/page.tsx
git commit -m "feat(wods): import PDF IA"
git push origin main
```

Vercel build dans 1-2 min.

---

## 🧪 Tester l'import

1. Ouvrir le BO web → **Whiteboard**
2. Clic sur **Importer** → sélectionner un PDF
3. Overlay **"Analyse IA en cours..."** (10-30s)
4. Modal preview avec tous les WODs détectés
5. Décocher les indésirables → **Importer N WOD(s)** → insertion + reload

### Schéma JSON attendu du parsing

```ts
interface ParsedPdfWOD {
  scheduled_date: string;      // YYYY-MM-DD
  title: string;               // "BLOC — Nom court"
  wod_type: 'for-time' | 'amrap' | 'emom' | 'tabata' | 'strength' | 'custom';
  description: string | null;  // Texte complet formaté avec \n
  time_cap_seconds: number | null;
  rounds: number | null;
  notes: string | null;
  block_name: string | null;   // ex: "HALTERO", "METCON", "GYM"
}
```

---

## 🐛 Debug

### Logs de l'Edge Function

https://supabase.com/dashboard/project/lkwdlqlbrbxaiydkoxfp/functions/parse-wod-pdf/logs

### Erreurs fréquentes

| Message dans le bandeau jaune | Cause | Solution |
|---|---|---|
| `Your credit balance is too low` | Pas de crédit Anthropic | Add credits sur console.anthropic.com |
| `Invalid token: ...` | JWT expiré / pas connecté | Reconnecter le user |
| `Not owner or coach of this box` | User pas owner/coach de la box | Vérifier `boxes.owner_id` ou `box_members.role='coach'` |
| `PDF too large` | Fichier > 10 Mo | Compresser le PDF |
| `Claude returned invalid JSON` | Claude a inséré du markdown ou du texte | Relancer (le prompt a des garde-fous mais pas infaillibles) |
| `Aucun WOD détecté` | PDF illisible ou vide | Vérifier que le PDF contient bien du texte extractible |

---

## 🔐 Sécurité

- ✅ Clé Anthropic **jamais** dans le bundle client (seulement Supabase secrets)
- ✅ Auth check côté fonction : owner OU coach de la `box_id` fournie
- ✅ Limite taille PDF : 10 Mo
- ✅ Sanitisation du JSON retourné par Claude (validation types, truncate)
- ✅ Deploy avec `--no-verify-jwt` mais auth **manuelle et stricte** à l'intérieur de la fonction

---

## 📝 Historique des décisions

- **Avril 2026** : feature initiale avec Claude Sonnet 4 → switché sur Haiku 3.5 pour économiser (5x moins cher, qualité suffisante sur PDFs structurés)
- Scope limité au BO web Owner (pas d'import PDF côté app mobile — complexité vs bénéfice)
