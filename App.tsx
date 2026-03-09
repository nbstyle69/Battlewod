import React from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts,
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
} from '@expo-google-fonts/inter';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error: Error) {
    this.setState({ error: error.message });
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

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
