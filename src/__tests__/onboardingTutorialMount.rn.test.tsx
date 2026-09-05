/**
 * Présentation (carrousel) — montage réel avec react-native.
 *
 * 1. Sans `getItemLayout`, `scrollToIndex` lève « scrollToIndex should be used
 *    in conjunction with getItemLayout or onScrollToIndexFailed » dès que la
 *    cellule visée n'a pas encore été mesurée : exception hors rendu, donc hors
 *    de tout ErrorBoundary → exception JS fatale en production. Le test appuie
 *    sur « C'est parti » avant toute mesure de cellule : rouge sans le correctif.
 * 2. Le premier montage (iOS et Android) ne lève rien et rend la première slide.
 * 3. `OnboardingErrorBoundary` : une exception de rendu sous la présentation est
 *    capturée (Sentry) et rendue à l'appelant ; rien n'est rendu à sa place.
 */
import React from 'react';
import { Platform, Text } from 'react-native';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import * as Sentry from '@sentry/react-native';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'apple', role: 'member', level: 'scaled' },
    joinBox: jest.fn(async () => ({ error: null })),
    skipBox: jest.fn(async () => {}),
    currentBox: { id: 'b1' },
  }),
}));
jest.mock('../services/gamification', () => ({ awardLevelBadge: jest.fn(async () => true) }));
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(async () => ({ data: null, error: null })) } }));

import '../i18n';
import { ThemeProvider } from '../context/ThemeContext';
import OnboardingTutorialScreen from '../screens/onboarding/OnboardingTutorialScreen';
import OnboardingErrorBoundary from '../components/OnboardingErrorBoundary';

const consoleErrors: string[] = [];
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { consoleErrors.push(String(a[0])); });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => { consoleErrors.length = 0; jest.useFakeTimers(); });

async function mount(onDone: () => void = () => {}) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <ThemeProvider>
        <OnboardingTutorialScreen onDone={onDone} />
      </ThemeProvider>,
    );
  });
  return r;
}

function pressable(r: TestRenderer.ReactTestRenderer, label: string): ReactTestInstance {
  const text = r.root.findAll(n => n.type === Text && String(n.props.children).includes(label))[0];
  let node: ReactTestInstance | null = text;
  while (node && !node.props.onPress) node = node.parent;
  if (!node) throw new Error(`aucun onPress au-dessus de « ${label} »`);
  return node;
}

describe('présentation : premier montage', () => {
  for (const os of ['ios', 'android'] as const) {
    it(`${os} : la première slide se rend sans exception ni erreur console`, async () => {
      Platform.OS = os;
      const r = await mount();
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(JSON.stringify(r.toJSON())).toContain('Bienvenue');
      expect(consoleErrors.filter(e => !e.includes('not wrapped in act'))).toEqual([]);
      r.unmount();
    });
  }
});

describe('présentation : « C\u2019est parti » avant la mesure des cellules', () => {
  it('ne lève pas (getItemLayout fournit la position sans mesure)', async () => {
    Platform.OS = 'ios';
    const r = await mount();
    const cta = pressable(r, 'parti');
    await act(async () => { cta.props.onPress(); });
    r.unmount();
  });
});

describe('OnboardingErrorBoundary', () => {
  function Boom(): React.ReactElement { throw new Error('carrousel cassé'); }

  it('capture l\u2019exception de rendu, prévient Sentry et rend la main à l\u2019appelant', async () => {
    const onError = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <OnboardingErrorBoundary onError={onError}>
          <Boom />
        </OnboardingErrorBoundary>,
      );
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'carrousel cassé' }),
      expect.objectContaining({ extra: expect.objectContaining({ action: 'onboardingTutorial' }) }),
    );
    expect(r.toJSON()).toBeNull();
    r.unmount();
  });

  it('laisse passer un enfant sain', async () => {
    const onError = jest.fn();
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(
        <OnboardingErrorBoundary onError={onError}>
          <Text>ok</Text>
        </OnboardingErrorBoundary>,
      );
    });
    expect(onError).not.toHaveBeenCalled();
    expect(JSON.stringify(r.toJSON())).toContain('ok');
    r.unmount();
  });
});
