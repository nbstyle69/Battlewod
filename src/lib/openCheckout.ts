import { Alert, Linking } from 'react-native';
import { log } from './logger';

/**
 * Open an external URL safely. Returns true if the URL opened successfully.
 * - Uses `canOpenURL` to detect when no handler is available on the device.
 * - Shows a localized error Alert on failure.
 */
export async function openExternalUrl(url: string, errorMessage = 'Impossible d\'ouvrir le lien.'): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Erreur', errorMessage);
      log.warn('[openExternalUrl] canOpenURL returned false for', url);
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch (e) {
    log.error('[openExternalUrl] failed', e, { url });
    Alert.alert('Erreur', errorMessage);
    return false;
  }
}

/**
 * Poll a predicate every `intervalMs` (default 2s) for up to `timeoutMs`
 * (default 60s). Useful to detect when the Stripe subscription status has
 * changed after the user came back from the Stripe checkout page.
 *
 * Returns true when the predicate returned true, false on timeout.
 */
export async function pollUntilTrue(
  predicate: () => Promise<boolean>,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return true;
    } catch (e) {
      log.warn('[pollUntilTrue] predicate threw', e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
