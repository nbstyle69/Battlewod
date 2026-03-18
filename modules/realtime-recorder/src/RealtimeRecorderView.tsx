import React from 'react';
import { requireNativeViewManager } from 'expo-modules-core';
import { ViewStyle } from 'react-native';

interface RealtimeRecorderViewProps {
  facing?: 'front' | 'back';
  style?: ViewStyle;
  onReady?: () => void;
}

const NativeView = requireNativeViewManager('RealtimeRecorder');

const RealtimeRecorderView = React.forwardRef<any, RealtimeRecorderViewProps>(
  ({ facing = 'back', style, onReady }, ref) => {
    return (
      <NativeView
        ref={ref}
        facing={facing}
        style={style}
        onReady={onReady ? () => onReady() : undefined}
      />
    );
  }
);

export default RealtimeRecorderView;
