import { requireNativeModule } from 'expo-modules-core';

export type ScreenRecorderResult =
  | { status: 'success'; uri: string }
  | { status: 'error'; message: string };

const NativeScreenRecorder = requireNativeModule('ScreenRecorder');

const ScreenRecorder = {
  startRecording(): Promise<void> {
    return NativeScreenRecorder.startRecording();
  },
  stopRecording(): Promise<ScreenRecorderResult> {
    return NativeScreenRecorder.stopRecording();
  },
};

export default ScreenRecorder;
