import { requireNativeModule } from 'expo-modules-core';

export interface OverlayOptions {
  inputPath: string;
  outputPath: string;
  timerType: string;
  timerStartOffsetMs: number;
  timerStopOffsetMs: number;
  countdownDuration: number;
  videoTitle?: string;
  timestamp?: string;
}

const NativeVideoOverlay = requireNativeModule('VideoOverlay');

export async function burnOverlays(options: OverlayOptions): Promise<string> {
  return await NativeVideoOverlay.burnOverlays(options);
}

export default NativeVideoOverlay;
