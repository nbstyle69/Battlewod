/**
 * Lightweight refactor: add <GlassBackground /> to top-level screens and make
 * their root container transparent so the emerald gradient + blobs show through.
 *
 * Usage: node scripts/apply-glass-bg.js
 */
const fs = require('fs');
const path = require('path');

// Screens to apply glass background to (relative to project root)
const SCREENS = [
  'src/screens/whiteboard/WhiteboardScreen.tsx',
  'src/screens/whiteboard/WODDetailScreen.tsx',
  'src/screens/whiteboard/PersonalWODFormScreen.tsx',
  'src/screens/whiteboard/ArticlesScreen.tsx',
  'src/screens/competition/CompetitionScreen.tsx',
  'src/screens/explorer/ExplorerScreen.tsx',
  'src/screens/profile/ProfileScreen.tsx',
  'src/screens/profile/PublicProfileScreen.tsx',
  'src/screens/reservation/MyReservationsScreen.tsx',
  'src/screens/home/FriendsScreen.tsx',
  'src/screens/home/BoxInfoScreen.tsx',
  'src/screens/timer/TimerScreen.tsx',
  'src/screens/wod/WodHistoryScreen.tsx',
  'src/screens/wod/WODGeneratorScreen.tsx',
  'src/screens/wod/WODScreen.tsx',
  'src/screens/tournament/DailyTournamentsScreen.tsx',
  'src/screens/tournament/DailyTournamentDetailScreen.tsx',
  'src/screens/messages/MessagesScreen.tsx',
];

function depthFromSrc(filePath) {
  // Count slashes after 'src/' to determine relative path to components/glass/
  const rel = filePath.replace(/^src\//, '');
  const segs = rel.split('/').length - 1; // file is the last seg
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

  // 1) Skip if already imported
  if (!/from\s+['"][^'"]*glass\/GlassBackground['"]/.test(src)) {
    // Insert import after the last "import" statement at top
    const importBlockEnd = src.lastIndexOf('\nimport ');
    if (importBlockEnd >= 0) {
      // Find end of that import line
      const eol = src.indexOf('\n', importBlockEnd + 1);
      const importPath = depthFromSrc(rel) + 'components/glass/GlassBackground';
      const importLine = `\nimport GlassBackground from '${importPath}';`;
      src = src.slice(0, eol) + importLine + src.slice(eol);
    }
  }

  // 2) Insert <GlassBackground /> after EVERY root <View style={S.container}>
  //    or similar that doesn't already have one right after.
  const rootRe = /(<(?:View|SafeAreaView)\s+style=\{[^}]*?(?:S|styles)\.container[^}]*?\}\s*>)/g;
  src = src.replace(rootRe, (match, openTag, offset, full) => {
    const after = full.slice(offset + match.length, offset + match.length + 200);
    if (/<GlassBackground\s*\/>/.test(after)) return match; // already inserted
    return match + '\n      <GlassBackground />';
  });

  // 3) Replace backgroundColor: t.background or theme.background in the FIRST occurrence
  //    inside the container style. Best-effort string replacement.
  src = src.replace(
    /(container:\s*\{[^}]*?backgroundColor:\s*)(?:t|theme)\.background/,
    "$1'transparent'"
  );
  src = src.replace(
    /(screen:\s*\{[^}]*?backgroundColor:\s*)(?:t|theme)\.background/,
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
