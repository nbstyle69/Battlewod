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

let _native: any = null;
function getNative() {
  if (!_native) _native = requireNativeModule('VideoOverlay');
  return _native;
}

export async function burnOverlays(options: OverlayOptions): Promise<string> {
  return await getNative().burnOverlays(options);
}

export default { burnOverlays };
