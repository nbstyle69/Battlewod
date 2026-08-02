---
name: testing-app-rls-dataflow
description: Test Battlewod (React Native/Expo) app screens on a Linux VM by (a) rendering a single screen for web in isolation and driving/recording it with Playwright, and (b) verifying the exact Supabase reads/writes under real RLS with a real user JWT. Use when validating an app feature PR without a simulator/emulator.
---

<!-- SUGGESTED UPDATE (PR #108). Merge these sections into the existing SKILL.md. -->

## Multi-screen harness with a local stack navigator (better than a single screen)

Screens that call `useNavigation()` / `useRoute()` do NOT need `src/navigation` (which breaks the
web bundle via `react-native-maps`). Instead, put a **local** stack in the temp `App.tsx`:

```tsx
const Stack = createNativeStackNavigator();
<SafeAreaProvider><ThemeProvider>
  <AuthContext.Provider value={{ user: null, session: null, profile: null, loading: false } as any}>
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ScreenA" component={ScreenA} />
        <Stack.Screen name="ScreenB" component={ScreenB} />
        <Stack.Screen name="TimerRun" component={FakeTimerRun} />  {/* stub that renders JSON.stringify(route.params) */}
      </Stack.Navigator>
    </NavigationContainer>
  </AuthContext.Provider>
</ThemeProvider></SafeAreaProvider>
```

A **stub destination screen that prints `route.params` as JSON** is the cheapest way to prove
navigation wiring (e.g. that `buildTimerRunParams` produced the right timer config) — it is visible
in a screenshot, unlike a console log.

`useAuth()` throws "must be used within AuthProvider", so `AuthContext` must be temporarily
exported from `src/context/AuthContext.tsx` (`export const AuthContext = createContext(...)`).
Revert with `git checkout src/context/AuthContext.tsx`.

## Anonymous harness = EMPTY_PROFILE: know what you CANNOT prove

With `user: null`, any screen state that round-trips through Supabase is invisible. On the WOD
generator this means avoid-zones, goal, declared race, PR-based loads and level calibration are
set locally on screen 1 but arrive **empty** on screen 2 (which re-reads `loadWodProfile`).
Do not report that as a product bug — report it as untested, and cover the logic with a temporary
Jest probe calling the pure ranker/util functions directly with a crafted profile. That probe
found two real defects a UI-only run would have missed.

## Desktop Chrome may actually be alive

The VM's desktop Chrome was usable in this session (recording via `recording_start` + computer-use
clicks gives a far more watchable video than Playwright's webm). Check with a screenshot first;
fall back to Playwright Chromium only if the desktop is dead. Playwright is still the best tool for
clean phone-viewport (430x950) fullPage screenshots for the PR comment.

Playwright gotchas: emoji labels are separate text nodes, so `getByText('⚡ Interval', {exact:true})`
times out — use `{ exact: false }` with the plain word. `page.goBack()` does not reliably pop a
React Navigation stack on web; re-`goto` the harness URL to reset instead.

## RLS without the Supabase CLI: plain Postgres + auth shim

No supabase CLI on the VM, but docker is there. This is enough to prove `auth.uid()` policies:

```bash
docker run -d --name pgrls -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:15
```
```sql
CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid primary key);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE authenticated NOLOGIN; GRANT USAGE ON SCHEMA public, auth TO authenticated;
-- apply the migration, then:
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
SET ROLE authenticated; SET request.jwt.claim.sub = '<user A uuid>';
```
Seed user B's rows as superuser first (RLS bypass), then as A assert: own inserts succeed,
inserts with `user_id = B` raise "new row violates row-level security policy", selects return
own=N/other=0, and updates/deletes of B's rows affect 0 rows. Clean up with `docker rm -f pgrls`.

## Devin Secrets Needed
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — only for authenticated runs.
- `SUPABASE_SERVICE_ROLE_KEY` — only to seed real users for the real-RLS path.
An anonymous harness + local Postgres needs no secrets at all.
