import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp, GestureResponderEvent, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: Size;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * EmeraldCTAButton — Primary CTA button with emerald gradient, glow shadow,
 * top highlight (glass reflection), and subtle border.
 * Usage: <EmeraldCTAButton onPress={...} icon={<Sparkles />}>ENTRER MON SCORE</EmeraldCTAButton>
 */
export default function EmeraldCTAButton({
  onPress,
  disabled,
  loading,
  size = 'lg',
  style,
  textStyle,
  icon,
  children,
}: Props) {
  const { theme } = useTheme();
  const dark = theme.mode === 'dark';

  const padV = size === 'sm' ? 10 : size === 'md' ? 14 : 18;
  const padH = size === 'sm' ? 14 : size === 'md' ? 18 : 22;
  const fontSize = size === 'sm' ? 13 : size === 'md' ? 14 : 15;
  const radius = size === 'sm' ? 12 : 16;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          // Glassmorphism style
          backgroundColor: 'rgba(16,185,129,0.25)',
          borderWidth: 2,
          borderColor: 'rgba(16,185,129,0.8)',
          shadowColor: '#10b981',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: dark ? 0.3 : 0.2,
          shadowRadius: 12,
          elevation: 6,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: padV,
          paddingHorizontal: padH,
          borderRadius: radius,
          gap: 10,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            {icon}
            <Text style={[{ color: '#fff', fontSize, fontWeight: '900', letterSpacing: 0.5 }, textStyle]}>
              {children}
            </Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

