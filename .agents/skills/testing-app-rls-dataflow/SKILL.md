---
name: testing-app-rls-dataflow
description: Test Battlewod (React Native/Expo) app screens on a Linux VM by (a) rendering a single screen for web in isolation and driving/recording it with Playwright, and (b) verifying the exact Supabase reads/writes under real RLS with a real user JWT. Use when validating an app feature PR without a simulator/emulator.
---

# Testing Battlewod app screens: isolated web render + real-RLS data path

## Environment facts
- No iOS simulator / no Android emulator on the VM.
- The **full** app will NOT bundle for Expo web: `src/navigation/index.tsx` pulls `BoxDirectoryMapScreen` -> `react-native-maps` which imports RN internals (`codegenNativeCommands`) that break the web bundle. `mixpanel-react-native` is also instantiated at module load in `src/lib/analytics.ts`.
- BUT an individual screen that does **not** import `src/navigation` (e.g. `ProgramDetailScreen`) CAN be bundled and rendered for web in isolation. This is the key: check the screen's imports first (`grep -n "navigation" src/screens/.../X.tsx`). If it's navigation-free, the isolated web render works.
- The desktop Chrome on the VM may be dead/unavailable; don't fight it. Use Playwright's own Chromium instead (works headless, and can record video without the desktop).

## Part 1 — Render + drive + record a single screen (real UI proof)
1. Real anon creds: the app `.env` often has `dummy`. Put real values from `TheHub/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`) into `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Same project `lkwdlqlbrbxaiydkoxfp`. Revert `.env` after (it's gitignored).
2. Web stubs for module-load native calls: create `src/lib/analytics.web.ts` (export no-op versions of every `export function` in analytics.ts) and `src/services/notifications.web.ts` (same for notifications.ts, which calls `setNotificationHandler` at top level). Metro auto-resolves `.web.ts`.
3. Temporarily `export` the context you need to fake (e.g. `export const AuthContext = createContext(...)` in AuthContext.tsx) so the harness can provide a value without the real provider (which does network/auth).
4. Backup `App.tsx`, replace it with a harness that: signs the seeded user in on the shared `supabase` client (`await supabase.auth.signInWithPassword(...)`), then renders ONLY the screen inside `<ThemeProvider>` + `<AuthContext.Provider value={fakeAuth}>`, passing a fake `navigation` (`{goBack(){},navigate(){}}`) and `route.params`. Import seed IDs from a local `p2seed.json`.
5. `npx expo start --web --port 8082 --clear`. If a stale bundle still shows the maps error / `import ./src/navigation`, kill expo+metro, `rm -rf .expo node_modules/.cache`, restart. Verify by fetching `http://localhost:8082/index.bundle?platform=web&dev=true` and grepping for `codegenNativeCommands` (should be 0).
6. Render/drive with playwright-core (the desktop Chrome is unreliable): `npm i -D playwright-core && npx playwright install chromium`. The binary is at `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` (note `chrome-linux64`, not `chrome-linux`). Launch with `--no-sandbox`. Use a phone viewport (e.g. 430x900). For a video, use `browser.newContext({ recordVideo: { dir, size } })`, then `context.close()` to flush; convert webm->mp4 with system `ffmpeg`.
7. Robust interactions: click WOD/list items by visible text (`getByText`). For icon-only controls (week chevrons) with no text, get the neighboring label's `boundingBox()` and click by computed coords — fixed y-coordinates break because headers shift when conditional subtitles appear/disappear.

## Part 2 — Real-RLS data path (substantive gating proof)
- Seed with service role (`SUPABASE_SERVICE_ROLE_KEY`): `auth.admin.createUser({email,password,email_confirm:true})` + insert `profiles` row, then the domain rows. Tag everything (e.g. emails `p2test-*@example.com`, box name `P2 Test Box <rnd>`).
- Verify as a real user: anon client + `signInWithPassword`; run the screen's exact `.select()/.upsert()` calls. Always add a **non-enrolled** user as a negative control: must get 0 rows on read and an RLS error on write. That's what proves gating vs. "public".
- Cleanup bottom-up (scores -> wods -> members -> programs -> boxes), then delete `profiles` + `auth.admin.deleteUser` for every tagged user (page `auth.admin.listUsers`). Verify 0 leftovers.

## Data contract gotcha (programs)
`program_wods.day_number` is **absolute** across the program (1..28), and `week_number = ceil(day_number/7)`. The reader (`ProgramDetailScreen`) places WODs by absolute `day_number` and ignores `week_number`; the owner editor (`BOProgramEditorScreen.save()`) writes it the same way. If you seed with day-of-week (1..7) numbering, weeks >1 show all "Repos". Seed the way the owner editor writes.

## Cleanup checklist (leave the tree clean)
- Delete seed data; restore `App.tsx` from backup; `git checkout src/context/AuthContext.tsx`; remove `*.web.ts` stubs; restore `.env` dummies; `git checkout package.json package-lock.json` (removes the playwright devDep); remove temp `scripts/_p2_*.mjs` + `p2seed.json`. Battlewod has **no CI**, so `git_pr_checks` returning 0 checks is expected.

## Devin Secrets needed
- `SUPABASE_SERVICE_ROLE_KEY` (seed/cleanup). `SUPABASE_DB_URL` (only if DDL needed). Anon key/URL come from `TheHub/.env.local`.
