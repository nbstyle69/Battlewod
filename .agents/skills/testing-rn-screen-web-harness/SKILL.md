---
name: testing-rn-screen-web-harness
description: Test a single React Native screen end-to-end in the browser when there is no native simulator and the Expo dev server won't run. Use when verifying a Battlewod screen's data path, RLS reads, sorting/defaults, or Supabase-backed UI.
---

# Testing a RN screen via an isolated web-export harness

Battlewod is React Native (Expo). On the CI/VM there is **no iOS/Android simulator**, and the
**Expo web dev server is unreliable here** (Metro often crashes with `Error: Got unexpected undefined`
during incremental/HMR bundling, and native-only view managers — maps, video recorder, timer —
throw `requireNativeViewManager ... could not be found` when the full navigation tree is bundled).

The reliable pattern is: **statically export an isolated harness that mounts only the screen under
test**, backed by a real authenticated Supabase session.

## Steps

1. **Seed real data** with a throwaway user (service-role admin API), e.g. create an auth user,
   upsert its `profiles` row (NB: `profiles` requires `email`, `username`, `level`, `role`),
   add an active `box_members` row, then call the RPC under test **as that signed-in user** (anon
   client + `signInWithPassword`) so `auth.uid()` is set — RPCs with authorization checks reject
   raw `psql` calls (`auth.uid()` is null there → "Non autorisé").

2. **Build the harness.** Temporarily replace `App.tsx` (back it up to `/tmp` first) with a minimal
   tree: `SafeAreaProvider > QueryClientProvider > ThemeProvider > AuthProvider > NavigationContainer`
   with a `createNativeStackNavigator` mounting ONLY the target screen + stub screens for any routes
   it navigates to. Auto-sign-in the throwaway user in a `Gate` component; render the screen once
   `user && currentBox` are set. Do **not** import the full `src/navigation` (it pulls native-only modules).
   - Note: platform extensions like `App.web.tsx` are NOT reliably resolved here, and a conditional
     `require()` in `index.ts` corrupts Metro's graph. Overwriting `App.tsx` directly is the robust path.

3. **Static export instead of dev server:** `npx expo export --platform web` (one-shot production
   bundle — no HMR, no incremental-bundler crash). Serve it: `npx serve -s dist -l 8090`. Load
   `localhost:8090` in Chrome. This avoids every dev-server failure mode above.
   - To test several screens + i18n at once, add a tiny in-harness tab bar that swaps the mounted
     `Stack.Screen` and a language bar whose buttons call the real `setLanguage(l)` from `src/i18n`.
     This proves **live** FR↔EN switching (t() + interpolation/plurals + locale dates) without the
     native ProfileScreen selector. Seed rows so interpolated counts/dates actually render (e.g.
     `class_schedules`+`class_reservations` for MyReservations, `generated_wods`+`generated_wod_scores`
     for WodHistory). Screens whose count-view seeding is heavy (ReservationScreen capacity badges)
     can be skipped and reported as untested — their namespace is covered by the jest key-parity test.

4. **Verify server-side behavior with SQL / authenticated RPC** in parallel (idempotency, that a
   feature-specific table is written and a shared table like `profiles.elo` is NOT, transactional
   rollback for non-destructive checks).

5. **Clean up**: delete seeded rows + throwaway user (FK `ON DELETE CASCADE` from `auth.users`),
   verify 0 remaining rows. **Restore `App.tsx` from the backup**, revert any `metro.config.js` /
   `index.ts` edits, delete `dist/` and helper scripts. Confirm `git status` is clean.

## Gotchas
- `EXPO_PUBLIC_SUPABASE_URL=dummy` in `.env` → `Invalid supabaseUrl`. Populate the real
  `EXPO_PUBLIC_SUPABASE_*` values (from org secrets) before exporting; never commit `.env`.
- Check real column names before querying (e.g. `wod_scores` uses `score_value`, not `value`;
  `box_wods` has no `date`).
- `profiles.level` has a CHECK constraint of **lowercase** values (`scaled/inter/rx/rx+/elite/pro`);
  seeding `level: 'RX'` fails `profiles_level_check`. Always surface upsert errors (don't ignore
  the returned `error`) or a silent profiles failure cascades into a `boxes_owner_id_fkey` violation.
- Personal WODs live in `box_wods` with `box_id IS NULL AND created_by = auth.uid()` (RLS
  `20260427_personal_wods_rls.sql`) — a box member CAN own them. Adversarial DB check for the
  whiteboard "member adds personal WOD" flow: assert the new row has `box_id IS NULL` and the
  box program query (`box_id = <box>`) returns 0 rows (private, not injected into official WODs).
- A successful bundle/export is NOT a passing test — always observe the rendered screen and compare
  values against the DB.
- **`Alert.alert` is NOT rendered visually by React Native Web** — tapping a button that fires an
  Alert produces no visible dialog in the harness. Don't report alert copy as visually verified;
  instead confirm the surrounding section text is localized and rely on the i18n key-parity jest
  test for the alert namespace. Mark such assertions `untested` in the recording, not `passed`.
- Chrome persists the previous Supabase session across exports. Force the expected test user in the
  harness Gate (`getSession()` → if email mismatch, `signOut()` + `signInWithPassword`), then
  re-export and hard-reload (Ctrl+R), else you'll validate against a stale user's data.
- A membership `max_sessions_per_week` may resolve to `∞` in the harness if the plan join doesn't
  resolve; that exercises the `?? '∞'` fallback and is not a screen regression.
- Seeding a tournament: `boxes` requires a NOT-NULL `invite_code`; `tournaments` wants `box_id`,
  `created_by`, `status`, `format`, `start_date`/`end_date`; `tournament_wods` stores `movements`
  as JSON (stringify a `string[]`). To let the seeded athlete submit a score, insert a
  `tournament_participants` row (`tournament_id`, `athlete_id`, `score`) — otherwise the
  `tournament_scores` insert may be blocked/inconsistent with app behavior.
- For `TournamentWODScreen`, the score-entry card is behind the `detail`→`submit` phase toggle:
  the screen first renders detail; tap "Submit my score / Soumettre mon score" to reach the inputs.
- Numeric inputs in the score card retain their value when you switch the Rounds↔Total-reps mode or
  re-use a field across sub-tests. Always clear first (`triple_click` → `ctrl+a` → `Delete`) before
  typing a new value, or you'll append (e.g. "1"+"3" → "13") and assert the wrong total.
- AMRAP normalization: verify the DB stores the canonical **total** (e.g. `score_value="37"` for
  1 round of a 37-rep round), NOT the raw rounds ("1"). This is the adversarial check — a broken
  impl would persist the raw first field.

- **Native-only modules crash the web export at import time.** `TimerRunScreen`
  imports `realtime-recorder`, whose `RealtimeRecorderView` runs
  `requireNativeViewManager('RealtimeRecorder')` at module load → the whole bundle
  fails on web. Redirect it to a JS stub via `metro.config.js`
  `resolver.resolveRequest` (return `{ type:'sourceFile', filePath: <stub> }` for
  `moduleName === 'realtime-recorder'`); the stub exports a `View`-based
  `RealtimeRecorderView` + no-op `updateOverlayState/startRecording/stopRecording`.
  This `resolveRequest` alias does NOT corrupt Metro's graph (unlike a conditional
  `require()` in `index.ts`). Same trick works for any native view manager.
- **Pure-layout screens don't need Supabase seeding.** For a positioning/visual fix
  (e.g. the timer Play/Stop button), mount the screen with hard-coded route params
  and skip auth/DB entirely — `useAuth()` returning a null box is fine. For the timer,
  pass `withCamera:false` and size the Chrome window wide (winW>winH) to hit the
  landscape no-camera layout; `countdown:10` gives a comfortable window to screenshot
  the Stop state during the countdown (phase `countdown`/`running` both show Stop).
- **Restore tracked harness files.** If `/tmp` backups are wiped by a VM restart,
  revert temporary edits to tracked files (`App.tsx`, `metro.config.js`) with
  `git checkout -- <file>` and delete untracked helpers/`dist/`; confirm the branch
  diff contains only the intended change.

## Devin Secrets Needed
- `SUPABASE_DB_URL` (psql; must be URL-encoded, no `[@PW]` wrapper)
- `SUPABASE_SERVICE_ROLE_KEY` (admin seeding/cleanup)
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (harness client + authenticated RPC)
