import React from 'react';
import Svg, { Path, Circle, Ellipse, G } from 'react-native-svg';

interface Props {
  size?: number;
  style?: object;
  color?: string;
}

export default function KettlebellIcon({ size = 32, style, color = '#111111' }: Props) {
  const bodyFill = color;

  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 100 115" style={style}>
      <G>
        {/* ── Handle arch — thick black stroke ─────────────── */}
        <Path
          d="M18,56 A32,41 0 0 1 82,56"
          stroke={bodyFill}
          strokeWidth="17"
          fill="none"
          strokeLinecap="butt"
        />

        {/* ── Ball body ─────────────────────────────────────── */}
        <Circle cx="50" cy="88" r="27" fill={bodyFill} />

        {/* ── French flag on inner edge of handle opening ───── */}
        {/* Blue — left half */}
        <Path
          d="M26,55 A24,33 0 0 1 50,22"
          stroke="#0055A4"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* White — center top (brief) */}
        <Path
          d="M47,22 A24,33 0 0 1 53,22"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* Red — right half */}
        <Path
          d="M50,22 A24,33 0 0 1 74,55"
          stroke="#EF4135"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />

        {/* ── Inner chrome edge of handle opening ────────────── */}
        <Path
          d="M27,55 A23,32 0 0 1 73,55"
          stroke="white"
          strokeWidth="1"
          fill="none"
          opacity={0.35}
        />

        {/* ── Ball 3-D highlights ───────────────────────────── */}
        {/* Main sweeping curve */}
        <Path
          d="M28,91 C26,78 37,64 53,62"
          stroke="white"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          opacity={0.75}
        />
        {/* Inner oval ring */}
        <Ellipse
          cx="50" cy="88"
          rx="18" ry="16"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          opacity={0.22}
        />
        {/* Bottom accent curve */}
        <Path
          d="M33,102 C31,97 36,93 46,92"
          stroke="white"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          opacity={0.42}
        />
      </G>
    </Svg>
  );
}
