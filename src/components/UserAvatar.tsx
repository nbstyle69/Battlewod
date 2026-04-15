import React from 'react';
import { View, Text, Image, ViewStyle, ImageStyle } from 'react-native';

interface UserAvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  style?: ViewStyle | ImageStyle;
}

export default function UserAvatar({
  uri,
  name = '?',
  size = 40,
  borderRadius,
  borderWidth = 0,
  borderColor,
  backgroundColor = '#2a2a2a',
  textColor = '#fff',
  fontSize,
  style,
}: UserAvatarProps) {
  const r = borderRadius ?? size / 2;
  const fs = fontSize ?? size * 0.4;
  const letter = (name[0] ?? '?').toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: r,
            borderWidth,
            borderColor,
          },
          style as ImageStyle,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          borderWidth,
          borderColor,
          backgroundColor,
          justifyContent: 'center',
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: fs, fontWeight: '900', color: textColor }}>
        {letter}
      </Text>
    </View>
  );
}
