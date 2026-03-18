/**
 * videoOverlay.ts — Burn timer/countdown/REC/title/timestamp overlays into video using FFmpeg.
 * Requires ffmpeg-kit-react-native (dev build only).
 */
import { Platform } from 'react-native';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import * as FileSystem from 'expo-file-system/legacy';

// System fonts per platform
const FONT_PATH = Platform.select({
  android: '/system/fonts/Roboto-Bold.ttf',
  ios: '/System/Library/Fonts/Helvetica.ttc',
}) ?? '/system/fonts/Roboto-Bold.ttf';

const FONT_LIGHT = Platform.select({
  android: '/system/fonts/Roboto-Regular.ttf',
  ios: '/System/Library/Fonts/Helvetica.ttc',
}) ?? '/system/fonts/Roboto-Regular.ttf';

export interface OverlayParams {
  inputPath: string;                // raw video file path
  timerType: string;                // 'for-time', 'amrap', 'emom', etc.
  timerStartOffsetMs: number;       // ms from video start when timer began
  timerStopOffsetMs: number;        // ms from video start when timer stopped (0 = still running at end)
  countdownDuration: number;        // countdown seconds (0 = none)
  videoTitle?: string;              // optional title text
  withTimestamp?: boolean;          // show date/time
  recordedAt?: string;              // ISO date string
}

function esc(text: string): string {
  // Escape special chars for FFmpeg drawtext
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

function typeLabel(timerType: string): string {
  const map: Record<string, string> = {
    'for-time': 'FOR TIME',
    'amrap': 'AMRAP',
    'emom': 'EMOM',
    'tabata': 'TABATA',
    'ywyr': 'YWYR',
    'libre': 'LIBRE',
  };
  return map[timerType] ?? timerType.toUpperCase();
}

/**
 * Burns overlays into the video and returns the output file path.
 * Overlays: type label, REC badge, countdown, timer, title, timestamp.
 */
export async function burnOverlays(params: OverlayParams): Promise<string> {
  const {
    inputPath,
    timerType,
    timerStartOffsetMs,
    timerStopOffsetMs,
    countdownDuration,
    videoTitle,
    withTimestamp,
    recordedAt,
  } = params;

  const outputPath = (FileSystem.cacheDirectory ?? '') + `bwod_overlay_${Date.now()}.mp4`;

  const startSec = timerStartOffsetMs / 1000;
  const stopSec = timerStopOffsetMs > 0 ? timerStopOffsetMs / 1000 : 99999;
  const cdStartSec = Math.max(0, startSec - countdownDuration);
  const label = esc(typeLabel(timerType));

  const filters: string[] = [];

  // 1. Semi-transparent top bar background
  filters.push(
    `drawbox=x=0:y=0:w=iw:h=80:color=black@0.5:t=fill`
  );

  // 2. Type label (top-left) — always visible
  filters.push(
    `drawtext=fontfile='${FONT_PATH}':text='${label}':fontsize=28:fontcolor=white:x=20:y=28`
  );

  // 3. REC badge (top-right) — visible while recording active (after countdown)
  filters.push(
    `drawtext=fontfile='${FONT_PATH}':text='● REC':fontsize=22:fontcolor=red:x=w-tw-20:y=30:enable='gte(t,0)'`
  );

  // 4. Countdown number (center) — during countdown phase
  if (countdownDuration > 0) {
    filters.push(
      `drawtext=fontfile='${FONT_LIGHT}':text='%{eif\\:ceil(${startSec}-t)\\:d}':fontsize=120:fontcolor=white@0.9:x=(w-tw)/2:y=(h-th)/2:enable='between(t,${cdStartSec},${startSec})'`
    );
  }

  // 5. Timer (center) — counts up from timerStart, freezes at timerStop
  // For for-time / libre / tabata: count up
  // For amrap: count down (but we'll do count-up for simplicity — user sees elapsed)
  const timerExpr = timerStopOffsetMs > 0
    ? `%{eif\\:floor(min(t-${startSec},${stopSec - startSec})/60)\\:d\\:2}\\:%{eif\\:mod(floor(min(t-${startSec},${stopSec - startSec})),60)\\:d\\:2}`
    : `%{eif\\:floor((t-${startSec})/60)\\:d\\:2}\\:%{eif\\:mod(floor(t-${startSec}),60)\\:d\\:2}`;

  filters.push(
    `drawtext=fontfile='${FONT_LIGHT}':text='${timerExpr}':fontsize=72:fontcolor=white:x=(w-tw)/2:y=(h-th)/2:enable='gte(t,${startSec})':shadowcolor=black@0.6:shadowx=2:shadowy=2`
  );

  // 6. Title (bottom-left)
  if (videoTitle) {
    filters.push(
      `drawtext=fontfile='${FONT_PATH}':text='${esc(videoTitle)}':fontsize=22:fontcolor=white:x=20:y=h-80:enable='gte(t,${startSec})':shadowcolor=black@0.7:shadowx=1:shadowy=1`
    );
  }

  // 7. Timestamp (bottom-left, below title)
  if (withTimestamp && recordedAt) {
    let ts = '';
    try {
      const d = new Date(recordedAt);
      ts = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + '  ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { ts = recordedAt; }
    filters.push(
      `drawtext=fontfile='${FONT_LIGHT}':text='${esc(ts)}':fontsize=16:fontcolor=white@0.8:x=20:y=h-50:shadowcolor=black@0.7:shadowx=1:shadowy=1`
    );
  }

  // 8. AthleX watermark (bottom-right)
  filters.push(
    `drawtext=fontfile='${FONT_PATH}':text='ATHLEX':fontsize=18:fontcolor=white@0.6:x=w-tw-16:y=h-42`
  );

  const vf = filters.join(',');
  const cmd = `-y -i "${inputPath}" -vf "${vf}" -c:a copy -preset ultrafast -crf 23 "${outputPath}"`;

  console.log('🎬 FFmpeg cmd:', cmd);
  const session = await FFmpegKit.execute(cmd);
  const returnCode = await session.getReturnCode();

  if (ReturnCode.isSuccess(returnCode)) {
    console.log('✅ FFmpeg overlay burn success:', outputPath);
    return outputPath;
  } else {
    const logs = await session.getAllLogsAsString();
    console.warn('❌ FFmpeg failed:', logs?.substring(0, 500));
    // Fallback: return original video
    return inputPath;
  }
}
