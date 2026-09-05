/**
 * La présentation est rendue sous `OnboardingErrorBoundary` dans AppNavigator :
 * une exception de rendu ne laisse jamais un écran mort, on tombe sur l'accueil
 * (clé locale posée + `setOnboardingDone(true)`). Le montage réel est dans
 * `onboardingTutorialMount.rn.test.tsx` (npm run test:rn).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('présentation sous ErrorBoundary', () => {
  const nav = read('src/navigation/index.tsx');
  const block = nav.slice(nav.indexOf('if (isAuthenticated && !onboardingDone) {'), nav.indexOf('const isBoxOwner'));

  it('AppNavigator enveloppe OnboardingTutorialScreen et retombe sur l’accueil', () => {
    expect(nav).toContain("import OnboardingErrorBoundary from '../components/OnboardingErrorBoundary';");
    expect(block).toMatch(/<OnboardingErrorBoundary onError=\{leaveOnboarding\}>\s*<OnboardingTutorialScreen/);
    expect(block).toContain('AsyncStorage.setItem(ONBOARDING_KEY, user.id)');
    expect(block).toContain('setOnboardingJustDone(true);');
  });

  it('la frontière remonte à Sentry et ne rend rien après l’erreur', () => {
    const eb = read('src/components/OnboardingErrorBoundary.tsx');
    expect(eb).toContain('static getDerivedStateFromError()');
    expect(eb).toContain("captureError(error, { action: 'onboardingTutorial'");
    expect(eb).toContain('this.props.onError(error);');
    expect(eb).toContain('this.state.failed ? null : this.props.children');
  });

  it('le carrousel fournit getItemLayout et onScrollToIndexFailed à scrollToIndex', () => {
    const screen = read('src/screens/onboarding/OnboardingTutorialScreen.tsx');
    expect(screen).toContain('getItemLayout={getItemLayout}');
    expect(screen).toContain('onScrollToIndexFailed=');
    expect(screen).toContain('({ length: width, offset: width * index, index })');
  });
});
