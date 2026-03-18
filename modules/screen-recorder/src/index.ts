import { requireNativeModule } from 'expo-modules-core';

export type ScreenRecorderResult =
  | { status: 'success'; uri: string }
  | { status: 'error'; message: string };

let _native: any = null;
function getNative() {
  if (!_native) _native = requireNativeModule('ScreenRecorder');
  return _native;
}

const ScreenRecorder = {
  startRecording(): Promise<void> {
    return getNative().startRecording();
  },
  stopRecording(): Promise<ScreenRecorderResult> {
    return getNative().stopRecording();
  },
};

export default ScreenRecorder;
