---
name: testing-battlewod
description: Test the Battlewod/AthleX React Native app. Use when verifying UI changes, onboarding, competitions, or any feature PRs.
---

# Testing Battlewod (AthleX)

## Environment

- **Stack**: React Native + Expo SDK 54, TypeScript, Supabase
- **Node**: v22+ required
- **Test runner**: Jest with ts-jest (`npx jest --no-cache`)
- **TypeScript check**: `npx tsc --noEmit` (4 pre-existing expo-blur errors are known/acceptable)
- **Lint**: No dedicated lint script; rely on TypeScript check

## Devin Secrets Needed

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL (for runtime/E2E testing)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (for runtime/E2E testing)

Without these, only unit/integration tests and code verification are possible. The `.env` file has `dummy` placeholders by default.

## Running Tests

```bash
cd /home/ubuntu/Battlewod
npm install          # if node_modules missing
npx jest --no-cache  # run all tests
npx tsc --noEmit     # typecheck
```

## Known Limitations

### Expo Web Mode Does NOT Work
The app imports `react-native-maps` in `BoxDirectoryMapScreen.tsx` which is a native-only module. Running `npx expo start --web` will fail with:
```
ERROR Importing native-only module "react-native/Libraries/Utilities/codegenNativeCommands" on web
```

**Workaround**: Test via Jest integration tests (source code verification) or on a physical device/emulator. There is no way to run the full app in a browser.

### Testing Strategy (Shell-Based)
Since visual testing isn't possible without an emulator, use this approach:
1. **Source code verification tests** — Read source files and assert on content (SLIDES arrays, exported functions, AsyncStorage keys, SQL migrations)
2. **Unit tests** — Test pure logic (ELO calculations, scoring, gamification)
3. **Integration tests** — Test module interactions via Jest mocks

### Writing Source Verification Tests
The Jest config maps `react-native` and `@react-native-async-storage/async-storage` to mocks. You can write tests that:
- Read source files with `fs.readFileSync` and assert on content
- Import pure utility modules directly
- Use the AsyncStorage mock for state-based tests

Example pattern:
```typescript
const source = fs.readFileSync(path.resolve(__dirname, '../path/to/file.tsx'), 'utf-8');
expect(source).toContain("expected string");
```

## Key Files for Common Test Scenarios

| Feature | Key File | What to Check |
|---------|----------|---------------|
| Onboarding | `src/screens/onboarding/OnboardingTutorialScreen.tsx` | SLIDES array, ONBOARDING_KEY |
| Interactive Tour | `src/components/InteractiveTour.tsx` | DEFAULT_STEPS, TOUR_KEY |
| Analytics | `src/lib/analytics.ts` | Exported tracking functions |
| Navigation | `src/navigation/index.tsx` | Auth/onboarding flow order |
| ELO | `src/utils/elo.ts` | Calculation logic |
| Gamification | `src/services/gamification.ts` | Badge awarding |
| Inter-box competitions | `src/screens/backoffice/BOInterCompetitionScreen.tsx` | Format tabs |
| SQL migrations | `supabase/migrations/` | Schema changes |

## Tips

- Tests live in `src/__tests__/*.test.ts`
- Jest config is in `jest.config.js` (ts-jest preset, node environment)
- Mocks are in `src/__mocks__/` (react-native, async-storage, expo-notifications, sentry, haptics)
- The app has 271+ tests across 12 test suites as of PR #26
- Always run `npx tsc --noEmit` after changes — it catches type errors the tests might miss
