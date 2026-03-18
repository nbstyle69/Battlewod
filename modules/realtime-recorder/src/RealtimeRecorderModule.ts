import { requireNativeModule } from 'expo-modules-core';

export interface OverlayState {
  timerType: string;
  timerDisplay: string;
  title: string;
  timestamp: string;
  isRecording: boolean;
  countdownValue: number;
  showTimer: boolean;
}

interface RealtimeRecorderNative {
  updateOverlayState(state: Partial<OverlayState>): void;
  startRecording(options: { outputPath: string; facing?: string }): Promise<void>;
  stopRecording(): Promise<string>;
  switchCamera(): void;
}

let _module: RealtimeRecorderNative | null = null;
function getModule(): RealtimeRecorderNative {
  if (!_module) {
    _module = requireNativeModule('RealtimeRecorder') as RealtimeRecorderNative;
  }
  return _module;
}

export function updateOverlayState(state: Partial<OverlayState>): void {
  getModule().updateOverlayState(state);
}

export async function startRecording(options: { outputPath: string; facing?: string }): Promise<void> {
  return getModule().startRecording(options);
}

export async function stopRecording(): Promise<string> {
  return getModule().stopRecording();
}

export function switchCamera(): void {
  getModule().switchCamera();
}
