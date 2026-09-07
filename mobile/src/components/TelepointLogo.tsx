import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  G,
  Ellipse,
  Circle,
} from 'react-native-svg';

interface TelepointLogoProps {
  size?: number;
}

/**
 * Native SVG Telepoint official brand mark.
 * Stylized "T" inside a navy rounded tile with electric-blue orbit swoosh and satellite beacon.
 */
export const TelepointLogo: React.FC<TelepointLogoProps> = ({ size = 48 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <LinearGradient id="tp-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1b3e7d" />
          <Stop offset="1" stopColor="#0a1f44" />
        </LinearGradient>
        <LinearGradient id="tp-blue" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5cc6ff" />
          <Stop offset="1" stopColor="#2563eb" />
        </LinearGradient>
      </Defs>

      {/* Navy tile */}
      <Rect width="64" height="64" rx="16" fill="url(#tp-bg)" />

      {/* Orbit swoosh */}
      <G transform="rotate(-28 32 33)">
        <Ellipse
          cx="32"
          cy="33"
          rx="27"
          ry="11.5"
          fill="none"
          stroke="url(#tp-blue)"
          strokeWidth="2.6"
          opacity="0.95"
        />
      </G>

      {/* Satellite dot riding the orbit */}
      <Circle cx="50.5" cy="16.5" r="2.8" fill="#8ad4ff" />

      {/* The "T" */}
      <Rect x="15" y="15.5" width="34" height="9.5" rx="3" fill="#ffffff" />
      <Rect x="27" y="22" width="10" height="28" rx="3.2" fill="#ffffff" />

      {/* 3D facet on the stem */}
      <Rect x="32" y="24" width="5" height="24" rx="2.2" fill="url(#tp-blue)" />
    </Svg>
  );
};
