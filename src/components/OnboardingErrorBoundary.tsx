import React from 'react';
import { captureError } from '../lib/sentry';

interface Props {
  /** Appelé une fois à la première erreur : l'appelant quitte la présentation. */
  onError: (error: Error) => void;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Garde-fou de la présentation (carrousel d'accueil) : une exception de rendu
 * ou de cycle de vie sous ce nœud est envoyée à Sentry et rendue à l'appelant,
 * qui bascule sur l'accueil. Le carrousel n'est jamais remonté dans la session,
 * l'app ne reste jamais sur un écran mort.
 */
export default class OnboardingErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, { action: 'onboardingTutorial', componentStack: info.componentStack });
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
