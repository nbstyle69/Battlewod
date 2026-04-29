/**
 * Cross-platform postinstall wrapper.
 * Runs patch-package and the dev-launcher fix script.
 * Both steps are tolerant to failure: we never want postinstall to block
 * `npm install` (especially on EAS cloud builds where a missing optional
 * patch target would otherwise abort the whole build).
 */
const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, label) {
  console.log(`\n[postinstall] → ${label} (${cmd} ${args.join(' ')})`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true, // needed on Windows to resolve .cmd / .ps1 binaries
    cwd: path.resolve(__dirname, '..'),
  });
  if (res.status !== 0) {
    console.warn(`[postinstall] ⚠ ${label} exited with code ${res.status} — continuing`);
  } else {
    console.log(`[postinstall] ✓ ${label} OK`);
  }
}

// 1. Apply pending patches (mixpanel, etc.) — non-blocking
run('npx', ['patch-package'], 'patch-package');

// 2. Fix expo-dev-launcher gradle issue — Android-only, safe on iOS
run('node', ['scripts/fix-dev-launcher.js'], 'fix-dev-launcher');

console.log('\n[postinstall] Done (non-blocking mode).');
