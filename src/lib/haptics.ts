import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Light tap — button press, tab switch */
export function hapticLight() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium tap — score submitted, action confirmed */
export function hapticMedium() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Heavy tap — badge unlocked, important event */
export function hapticHeavy() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Success notification — score validated, friend accepted */
export function hapticSuccess() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Error notification — validation failed, rejected */
export function hapticError() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

/** Selection tick — picker change, toggle */
export function hapticSelection() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync();
}
