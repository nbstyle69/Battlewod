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
      title: '🔴 🐛 Historique ELO incomplet — certains changements ELO non tracés',
      labels: ['must-have', 'bugfix'],
      body: `## Problème
L'athlète voit son ELO à 984 (différent de 1000) mais l'écran Historique ELO affiche "Aucun historique". Les changements ELO ne sont pas tous enregistrés dans les tables d'historique.

## Diagnostic

### 3 sources de changement ELO

| Source | Update profiles.elo | Écrit historique | Statut |
|--------|-------------------|-----------------|--------|
| **WOD de box** (\`computeAndSaveElo\` dans WODDetailScreen) | ✅ | ✅ \`elo_history\` | ⚠️ Dépend de la migration |
| **Tournois classiques** (\`handleCloseTournament\` dans BOTournamentScreen) | ✅ | ✅ \`tournament_elo_history\` | ✅ OK |
| **Daily Tournaments** (DailyTournamentDetailScreen L274-286) | ✅ winner only | ❌ **AUCUN** | 🔴 BUG |

### Détail du bug Daily Tournament
- Seul le gagnant reçoit \`+elo_reward\` ELO
- **Aucune entrée** n'est créée dans \`elo_history\` ni \`tournament_elo_history\`
- Les perdants ne perdent pas d'ELO (pas de calcul ELO type classement)

## Fix requis

### 1. Daily Tournament — écrire l'historique
Dans \`DailyTournamentDetailScreen.tsx\`, après la mise à jour de \`profiles.elo\` du gagnant, ajouter un upsert dans \`elo_history\` :
\`\`\`js
await supabase.from('elo_history').upsert({
  box_id: tournament.box_id,
  wod_id: tournament.id, // ou créer une colonne tournament_id
  member_id: winnerId,
  elo_before: winnerProfile.elo,
  elo_after: winnerProfile.elo + tournament.elo_reward,
  elo_delta: tournament.elo_reward,
  rank: 1,
});
\`\`\`

### 2. Vérifier que la migration \`migration_blocks_elo.sql\` a été exécutée
La table \`elo_history\` doit exister avec : \`id, box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank, created_at\`

### 3. (Optionnel) Calcul ELO pour tous les participants des daily tournaments
Actuellement seul le winner gagne de l'ELO. Considérer un calcul basé sur le classement (comme pour les WODs de box).

## Fichiers concernés
- \`src/screens/tournament/DailyTournamentDetailScreen.tsx\` — ligne 274-286
- \`src/screens/whiteboard/WODDetailScreen.tsx\` — \`computeAndSaveElo()\`
- \`supabase/migration_blocks_elo.sql\` — table \`elo_history\`

## Priorité
🔴 MUST HAVE — Les athlètes doivent pouvoir voir leur historique ELO complet`,
    }),
  });
  const data = await res.json();
  if (res.ok) console.log(`✅ #${data.number} — ${data.title}`);
  else console.error(`❌ ${res.status}:`, data.message);
}
main().catch(console.error);
