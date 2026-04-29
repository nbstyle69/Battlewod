import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp, GestureResponderEvent, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
          // Emerald glow
          shadowColor: '#10b981',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: dark ? 0.5 : 0.35,
          shadowRadius: 20,
          elevation: 10,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['#10b981', '#059669', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingVertical: padV,
          paddingHorizontal: padH,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.25)',
        }}
      >
        {/* Top highlight reflection */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '55%',
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
          }}
        />
        <View style={styles.row}>
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
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
