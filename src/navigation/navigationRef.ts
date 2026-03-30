import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

/**
 * Navigate from anywhere (outside React tree).
 * Safely checks that the navigator is ready before dispatching.
 */
export function navigate(name: string, params?: Record<string, any>) {
  if (navigationRef.isReady()) {
    (navigationRef as any).navigate(name, params);
  }
}
