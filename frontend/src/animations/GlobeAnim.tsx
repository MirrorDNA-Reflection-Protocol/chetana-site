import React, { useEffect, useRef } from 'react';

interface GlobeAnimProps {
  size?: number;
}

const GlobeAnim: React.FC<GlobeAnimProps> = ({ size = 200 }) => {
  const id = useRef(`globe-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const styleId = `style-${id}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ${id}-wave1 {
        0% { r: 30; opacity: 0.5; }
        100% { r: 90; opacity: 0; }
      }
      @keyframes ${id}-wave2 {
        0% { r: 30; opacity: 0.4; }
        100% { r: 90; opacity: 0; }
      }
      @keyframes ${id}-wave3 {
        0% { r: 30; opacity: 0.3; }
        100% { r: 90; opacity: 0; }
      }
      @keyframes ${id}-shieldPulse {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(59,130,246,0.3)); }
        50% { transform: scale(1.03); filter: drop-shadow(0 0 10px rgba(59,130,246,0.5)); }
      }
      @keyframes ${id}-mapGlow {
        0%, 100% { fill: #F97316; filter: none; }
        50% { fill: #FB923C; filter: drop-shadow(0 0 6px rgba(249,115,22,0.4)); }
      }
      @keyframes ${id}-fadeIn {
        0% { opacity: 0; transform: scale(0.85); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [id]);

  // Simplified India map outline (stylized, not geographically precise)
  const indiaPath = `
    M100,35 L108,38 L115,42 L118,50 L122,55 L125,48 L130,52
    L128,60 L132,68 L130,75 L126,82 L128,90 L125,98
    L120,105 L118,112 L112,118 L108,125 L105,132 L102,138
    L100,145 L98,138 L95,132 L92,125 L88,118 L82,112
    L80,105 L75,98 L72,90 L70,82 L68,75 L70,68
    L72,60 L70,52 L75,48 L78,55 L82,50 L85,42 L92,38 Z
  `;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        style={{ animation: `${id}-fadeIn 0.8s ease-out` }}
      >
        <defs>
          <linearGradient id={`${id}-shieldGrad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>
          <radialGradient id={`${id}-bgGrad`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
        </defs>

        {/* Background */}
        <circle cx="100" cy="100" r="95" fill={`url(#${id}-bgGrad)`} stroke="#1E293B" strokeWidth="1" />

        {/* Radiating trust waves */}
        <circle
          cx="100" cy="90" r="30"
          fill="none" stroke="#3B82F6" strokeWidth="1"
          style={{ animation: `${id}-wave1 3s ease-out infinite` }}
        />
        <circle
          cx="100" cy="90" r="30"
          fill="none" stroke="#3B82F6" strokeWidth="1"
          style={{ animation: `${id}-wave2 3s ease-out 1s infinite` }}
        />
        <circle
          cx="100" cy="90" r="30"
          fill="none" stroke="#3B82F6" strokeWidth="1"
          style={{ animation: `${id}-wave3 3s ease-out 2s infinite` }}
        />

        {/* India map */}
        <path
          d={indiaPath}
          fill="#F97316"
          stroke="#FDBA74"
          strokeWidth="1"
          fillOpacity="0.8"
          style={{ animation: `${id}-mapGlow 3s ease-in-out infinite` }}
        />

        {/* Shield overlay centered on India */}
        <g
          style={{
            transformOrigin: '100px 85px',
            animation: `${id}-shieldPulse 2.5s ease-in-out infinite`,
          }}
        >
          <path
            d="M100 55 L120 65 L120 85 Q120 102 100 112 Q80 102 80 85 L80 65 Z"
            fill={`url(#${id}-shieldGrad)`}
            fillOpacity="0.35"
            stroke="#60A5FA"
            strokeWidth="1.5"
          />
          {/* Small checkmark inside shield */}
          <polyline
            points="92,82 98,89 110,74"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        </g>

        {/* Tricolor accent at bottom */}
        <rect x="80" y="158" width="40" height="3" rx="1.5" fill="#FF9933" opacity="0.7" />
        <rect x="80" y="163" width="40" height="3" rx="1.5" fill="white" opacity="0.5" />
        <rect x="80" y="168" width="40" height="3" rx="1.5" fill="#138808" opacity="0.7" />

        {/* Label */}
        <text x="100" y="185" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="system-ui, sans-serif">
          PROTECTED
        </text>
      </svg>
    </div>
  );
};

export default GlobeAnim;
