/**
 * Postinstall script to fix expo-dev-launcher / expo-dev-menu
 * Gradle compatibility issue with AGP 8.9+ / Gradle 8.11+.
 *
 * The bug: build.gradle references `packageDebugAssets` which no longer
 * exists in newer Android Gradle Plugin versions.
 * See: https://github.com/expo/expo/issues/36217
 */
const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'node_modules/expo-dev-launcher/android/build.gradle',
  'node_modules/expo-dev-menu/android/build.gradle',
];

for (const relPath of filesToPatch) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`[fix-dev-launcher] SKIP ${relPath} (not found)`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  // Replace direct property access: project.packageDebugAssets or just packageDebugAssets
  // Wrap in findByName to avoid crash when property/task doesn't exist
  content = content.replace(
    /tasks\s*\.\s*(?:named|getByName)\s*\(\s*["']packageDebugAssets["']\s*\)/g,
    'tasks.matching { it.name == "packageDebugAssets" }.configureEach'
  );

  // Also handle: project.tasks.packageDebugAssets or tasks.packageDebugAssets
  content = content.replace(
    /(?:project\.)?tasks\.packageDebugAssets/g,
    'tasks.findByName("packageDebugAssets")'
  );

  // Handle bare property access: packageDebugAssets (as a task/property reference)
  // Replace lines like: packageDebugAssets.dependsOn(...) or packageDebugAssets { ... }
  content = content.replace(
    /^(\s*)packageDebugAssets\b/gm,
    '$1tasks.findByName("packageDebugAssets")?'
  );

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`[fix-dev-launcher] PATCHED ${relPath}`);
  } else {
    console.log(`[fix-dev-launcher] NO CHANGE ${relPath} (pattern not matched, trying broader fix)`);
    // Broader fix: wrap any line containing packageDebugAssets in a null-safe block
    const lines = content.split('\n');
    let patched = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('packageDebugAssets')) {
        lines[i] = `// [PATCHED] ${lines[i]}`;
        patched = true;
      }
    }
    if (patched) {
      fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
      console.log(`[fix-dev-launcher] COMMENTED OUT packageDebugAssets lines in ${relPath}`);
    }
  }
}

console.log('[fix-dev-launcher] Done.');
