import React from 'react';

/**
 * HospitalLogo component
 * Represents the official Medical Heart & Brain logo with central white cross.
 */
export const HospitalLogo = ({ size = 48, className = '', style = {} }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 200"
      width={size}
      height={(size * 200) / 240}
      fill="none"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id="heartBrainGradComp" x1="5%" y1="20%" x2="95%" y2="80%">
          <stop offset="0%" stopColor="#FF2820" />
          <stop offset="35%" stopColor="#FF4A22" />
          <stop offset="70%" stopColor="#FF7214" />
          <stop offset="100%" stopColor="#FF8B00" />
        </linearGradient>
      </defs>

      {/* Main Heart & Brain Silhouette */}
      <path
        d="M 108 34
           C 90 14, 48 10, 26 42
           C 4 72, 14 116, 52 148
           C 80 172, 110 186, 122 188
           C 125 188, 127 186, 129 184
           C 135 176, 142 168, 140 160
           C 142 160, 150 160, 158 152
           C 166 144, 168 136, 166 130
           C 174 130, 186 126, 188 114
           C 190 104, 184 96, 180 94
           C 192 90, 202 80, 198 62
           C 195 48, 184 40, 174 40
           C 178 30, 172 16, 156 16
           C 144 16, 138 22, 134 26
           C 128 18, 116 18, 108 34 Z"
        fill="url(#heartBrainGradComp)"
      />

      {/* Brain Sulci & Folds (White Interior Contour Lines) */}
      <g stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Top lobe fold */}
        <path d="M 144 20 C 142 30, 148 40, 160 36" />
        <path d="M 160 36 C 168 34, 174 42, 176 48" />

        {/* Upper-mid fold */}
        <path d="M 178 52 C 168 56, 164 68, 174 74" />
        <path d="M 174 74 C 182 78, 188 74, 194 68" />

        {/* Mid-flank fold */}
        <path d="M 180 96 C 168 98, 164 110, 172 116" />
        <path d="M 172 116 C 178 120, 184 118, 186 114" />

        {/* Lower-mid fold */}
        <path d="M 166 132 C 156 134, 152 144, 158 150" />

        {/* Bottom fold */}
        <path d="M 140 162 C 134 166, 130 174, 134 180" />
      </g>

      {/* Central Medical Cross */}
      <g fill="#FFFFFF">
        {/* Vertical bar */}
        <rect x="94" y="54" width="28" height="74" rx="3" />
        {/* Horizontal bar */}
        <rect x="71" y="77" width="74" height="28" rx="3" />
      </g>
    </svg>
  );
};

export default HospitalLogo;
