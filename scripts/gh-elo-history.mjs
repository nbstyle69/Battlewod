const TOKEN = process.env.GH_TOKEN || 'YOUR_GITHUB_TOKEN';
const REPO = 'nbstyle69/TheHub';
const API = `https://api.github.com/repos/${REPO}`;
const headers = {
  Authorization: `token ${TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'AthleX-Cascade',
};

async function main() {
  const res = await fetch(`${API}/issues`, {
    method: 'POST', headers,
    body: JSON.stringify({
      title: '🟢 📊 Historique ELO — tap sur ELO dans le profil',
      labels: ['done', 'feature'],
      body: `## Description
Quand l'athlète appuie sur son score ELO dans la page Profil, il est redirigé vers un écran **Historique ELO** qui affiche :

## Fonctionnalités
- **ELO actuel** en grand avec total gains / total pertes
- **Liste chronologique** de tous les changements ELO :
  - WODs de la box (via \`elo_history\`)
  - Tournois (via \`tournament_elo_history\`)
- Chaque entrée affiche : nom du WOD/tournoi, date, rang obtenu, delta ELO (+/-), ELO après
- Icône distincte 🏋️ WOD vs 🏆 Tournoi
- Pull-to-refresh

## Fichiers créés/modifiés
- \`src/screens/profile/EloHistoryScreen.tsx\` — nouvel écran
- \`src/navigation/index.tsx\` — route \`EloHistory\` dans HomeStack
- \`src/screens/profile/ProfileScreen.tsx\` — ELO stat tappable

## Statut
✅ Implémenté`,
    }),
  });
  const data = await res.json();
  if (res.ok) console.log(`✅ #${data.number} — ${data.title}`);
  else console.error(`❌ ${res.status}:`, data.message);
}
main().catch(console.error);
