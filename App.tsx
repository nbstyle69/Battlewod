import React, { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import { routeNotification } from './src/services/notificationRouter';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { useFonts,
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
} from '@expo-google-fonts/inter';
import {
  Barlow_800ExtraBold, Barlow_900Black,
} from '@expo-google-fonts/barlow';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation';
import ForceUpdateGate from './src/components/ForceUpdateGate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,      // 2 min before data is considered stale
      gcTime: 1000 * 60 * 10,         // 10 min garbage collection
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  debug: __DEV__,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  attachScreenshot: true,
  enableAutoSessionTracking: true,
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error: error.message });
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#FF4500', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>
            Erreur :
          </Text>
          <Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>
            {this.state.error}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

(Text as any).defaultProps = (Text as any).defaultProps ?? {};
(Text as any).defaultProps.style = [{ fontFamily: 'Inter_400Regular' }];

function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    Barlow_800ExtraBold,
    Barlow_900Black,
  });

  // Deep link: handle notification tap (foreground + background)
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  useEffect(() => {
    // Handle notification that launched the app (cold start)
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) routeNotification(response.notification.request.content.data);
    });
    // Handle notification tap while app is running
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      routeNotification(response.notification.request.content.data);
    });
    return () => {
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <ForceUpdateGate>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <AppNavigator />
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ForceUpdateGate>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);
