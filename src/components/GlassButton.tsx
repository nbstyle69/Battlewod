import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface GlassButtonProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function GlassButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
}: GlassButtonProps) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  const sizeStyles: Record<string, { paddingVertical: number; paddingHorizontal: number; fontSize: number; borderRadius: number }> = {
    sm: { paddingVertical: 8, paddingHorizontal: 14, fontSize: 12, borderRadius: 10 },
    md: { paddingVertical: 14, paddingHorizontal: 20, fontSize: 14, borderRadius: 14 },
    lg: { paddingVertical: 18, paddingHorizontal: 24, fontSize: 16, borderRadius: 16 },
  };

  const s = sizeStyles[size];

  const baseBtn: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: s.paddingVertical,
    paddingHorizontal: s.paddingHorizontal,
    borderRadius: s.borderRadius,
    borderWidth: 1,
  };

  const baseTxt: TextStyle = {
    fontSize: s.fontSize,
    fontWeight: '700',
  };

  let btnStyle: ViewStyle;
  let txtStyle: TextStyle;

  switch (variant) {
    case 'primary':
      btnStyle = {
        ...baseBtn,
        backgroundColor: isDark ? `${theme.accent}CC` : theme.accent,
        borderColor: isDark ? `${theme.accent}60` : theme.accentDark,
        ...(isDark ? {} : {
          shadowColor: theme.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }),
      };
      txtStyle = { ...baseTxt, color: '#fff' };
      break;
    case 'secondary':
      btnStyle = {
        ...baseBtn,
        backgroundColor: isDark ? `${theme.surface}B0` : `${theme.card}E0`,
        borderColor: isDark ? `${theme.border}80` : theme.border,
        ...(isDark ? {} : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }),
      };
      txtStyle = { ...baseTxt, color: theme.text };
      break;
    case 'ghost':
      btnStyle = {
        ...baseBtn,
        backgroundColor: 'transparent',
        borderColor: theme.border,
      };
      txtStyle = { ...baseTxt, color: theme.textSecondary };
      break;
    default:
      btnStyle = baseBtn;
      txtStyle = baseTxt;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        btnStyle,
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : theme.text} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[txtStyle, textStyle]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
