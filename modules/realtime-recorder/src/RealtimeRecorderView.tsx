import React from 'react';
import { requireNativeViewManager } from 'expo-modules-core';
import { ViewStyle } from 'react-native';

interface RealtimeRecorderViewProps {
  facing?: 'front' | 'back';
  isLandscape?: boolean;
  style?: ViewStyle;
  onReady?: () => void;
}

const NativeView = requireNativeViewManager('RealtimeRecorder');

const RealtimeRecorderView = React.forwardRef<any, RealtimeRecorderViewProps>(
  ({ facing = 'back', isLandscape = false, style, onReady }, ref) => {
    return (
      <NativeView
        ref={ref}
        facing={facing}
        isLandscape={isLandscape}
        style={style}
        onReady={onReady ? () => onReady() : undefined}
      />
    );
  }
);

export default RealtimeRecorderView;
