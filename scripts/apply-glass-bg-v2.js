/**
 * Aggressive glass background applier (v2):
 * - Matches View / SafeAreaView / KeyboardAvoidingView / ScrollView roots
 * - Matches S.container, styles.container, s.container
 * - Idempotent (skips if GlassBackground already present after the tag)
 *
 * Usage: node scripts/apply-glass-bg-v2.js
 */
const fs = require('fs');
const path = require('path');

const SCREENS = [
  // Whiteboard
  'src/screens/whiteboard/WhiteboardScreen.tsx',
  'src/screens/whiteboard/WODDetailScreen.tsx',
  'src/screens/whiteboard/PersonalWODFormScreen.tsx',
  'src/screens/whiteboard/ArticlesScreen.tsx',
  // Competition / Tournament
  'src/screens/competition/CompetitionScreen.tsx',
  'src/screens/competition/PhysicalCompetitionScreen.tsx',
  'src/screens/competition/InterCompetitionListScreen.tsx',
  'src/screens/competition/InterCompetitionDetailScreen.tsx',
  'src/screens/competition/InterScoreSubmitScreen.tsx',
  'src/screens/competition/InterTeamScreen.tsx',
  'src/screens/competition/TournamentScreen.tsx',
  'src/screens/competition/VideoPlaybackScreen.tsx',
  'src/screens/tournament/DailyTournamentsScreen.tsx',
  'src/screens/tournament/DailyTournamentDetailScreen.tsx',
  // Explorer
  'src/screens/explorer/ExplorerScreen.tsx',
  'src/screens/explorer/ProgrammationScreen.tsx',
  'src/screens/explorer/BoxDirectoryScreen.tsx',
  'src/screens/explorer/BoxProgramsScreen.tsx',
  // Profile
  'src/screens/profile/ProfileScreen.tsx',
  'src/screens/profile/PublicProfileScreen.tsx',
  'src/screens/profile/EloHistoryScreen.tsx',
  // Reservation
  'src/screens/reservation/ReservationScreen.tsx',
  'src/screens/reservation/MyReservationsScreen.tsx',
  // Home stack
  'src/screens/home/FriendsScreen.tsx',
  'src/screens/home/BoxInfoScreen.tsx',
  'src/screens/home/ChangelogScreen.tsx',
  // Tools
  'src/screens/timer/TimerScreen.tsx',
  'src/screens/wod/WodHistoryScreen.tsx',
  'src/screens/wod/WODGeneratorScreen.tsx',
  'src/screens/wod/WODScreen.tsx',
  // Misc
  'src/screens/messages/MessagesScreen.tsx',
  'src/screens/leaderboard/LeaderboardScreen.tsx',
  'src/screens/documents/LegalScreen.tsx',
  'src/screens/documents/DocumentsScreen.tsx',
  'src/screens/settings/NotificationSettingsScreen.tsx',
  // Onboarding (already styled — minimal)
  // 'src/screens/onboarding/WaitingScreen.tsx',
  // 'src/screens/onboarding/OnboardingTutorialScreen.tsx',
  // 'src/screens/onboarding/JoinBoxScreen.tsx',
  // 'src/screens/onboarding/CreateBoxScreen.tsx',
];

function depthFromSrc(filePath) {
  const rel = filePath.replace(/^src\//, '');
  const segs = rel.split('/').length - 1;
  return '../'.repeat(segs);
}

function processFile(rel) {
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) {
    console.log('SKIP (not found):', rel);
    return;
  }
  let src = fs.readFileSync(abs, 'utf8');
  const before = src;

  // 1) Insert import if missing
  if (!/from\s+['"][^'"]*glass\/GlassBackground['"]/.test(src)) {
    const importBlockEnd = src.lastIndexOf('\nimport ');
    if (importBlockEnd >= 0) {
      const eol = src.indexOf('\n', importBlockEnd + 1);
      const importPath = depthFromSrc(rel) + 'components/glass/GlassBackground';
      const importLine = `\nimport GlassBackground from '${importPath}';`;
      src = src.slice(0, eol) + importLine + src.slice(eol);
    }
  }

  // 2) Insert <GlassBackground /> after each root container tag
  // Match View | SafeAreaView | KeyboardAvoidingView with style={S.container} or {styles.container} or {s.container}
  const rootRe = /(<(?:View|SafeAreaView|KeyboardAvoidingView)\b[^>]*style=\{[^}]*?(?:S|s|styles)\.container[^}]*?\}[^>]*>)/g;
  src = src.replace(rootRe, (match, _open, offset) => {
    // Check if next 200 chars already contain <GlassBackground />
    const after = src.slice(offset + match.length, offset + match.length + 200);
    if (/<GlassBackground\s*\/>/.test(after)) return match;
    return match + '\n      <GlassBackground />';
  });

  // 3) Make container/screen background transparent in styles
  src = src.replace(
    /(container:\s*\{[^}]*?backgroundColor:\s*)(?:t|theme)\.background/g,
    "$1'transparent'"
  );
  src = src.replace(
    /(screen:\s*\{[^}]*?backgroundColor:\s*)(?:t|theme)\.background/g,
    "$1'transparent'"
  );

  if (src !== before) {
    fs.writeFileSync(abs, src);
    console.log('UPDATED:', rel);
  } else {
    console.log('NOOP:   ', rel);
  }
}

SCREENS.forEach(processFile);
console.log('\nDone.');
