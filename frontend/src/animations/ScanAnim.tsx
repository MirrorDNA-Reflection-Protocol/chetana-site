import React, { useEffect, useRef } from 'react';

interface ScanAnimProps {
  size?: number;
}

const ScanAnim: React.FC<ScanAnimProps> = ({ size = 200 }) => {
  const id = useRef(`scan-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const styleId = `style-${id}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ${id}-sweep {
        0% { transform: translateY(0); opacity: 1; }
        85% { opacity: 1; }
        95% { opacity: 0; }
        100% { transform: translateY(150px); opacity: 0; }
      }
      @keyframes ${id}-threat1 {
        0%, 30% { opacity: 0; transform: scale(0); }
        35% { opacity: 1; transform: scale(1); }
        60% { opacity: 1; transform: scale(1); }
        70% { opacity: 0; transform: scale(1.3); }
        100% { opacity: 0; transform: scale(0); }
      }
      @keyframes ${id}-threat2 {
        0%, 50% { opacity: 0; transform: scale(0); }
        55% { opacity: 1; transform: scale(1); }
        75% { opacity: 1; transform: scale(1); }
        85% { opacity: 0; transform: scale(1.3); }
        100% { opacity: 0; transform: scale(0); }
      }
      @keyframes ${id}-threat3 {
        0%, 65% { opacity: 0; transform: scale(0); }
        70% { opacity: 1; transform: scale(1); }
        88% { opacity: 1; transform: scale(1); }
        95% { opacity: 0; transform: scale(1.3); }
        100% { opacity: 0; transform: scale(0); }
      }
      @keyframes ${id}-phonePulse {
        0%, 100% { stroke: #94A3B8; }
        50% { stroke: #60A5FA; }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [id]);

  const scale = size / 200;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <linearGradient id={`${id}-scanLine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(59,130,246,0)" />
            <stop offset="40%" stopColor="rgba(59,130,246,0.4)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0.8)" />
          </linearGradient>
          <clipPath id={`${id}-phoneClip`}>
            <rect x="55" y="20" width="90" height="160" rx="12" />
          </clipPath>
        </defs>

        {/* Phone outline */}
        <rect
          x="55" y="20" width="90" height="160" rx="12"
          fill="#0F172A"
          stroke="#94A3B8"
          strokeWidth="2"
          style={{ animation: `${id}-phonePulse 3s ease-in-out infinite` }}
        />
        {/* Screen area */}
        <rect x="60" y="32" width="80" height="136" rx="4" fill="#1E293B" />
        {/* Notch */}
        <rect x="85" y="23" width="30" height="4" rx="2" fill="#334155" />
        {/* Home indicator */}
        <rect x="85" y="170" width="30" height="3" rx="1.5" fill="#334155" />

        {/* Simulated text lines on screen */}
        <rect x="68" y="45" width="50" height="4" rx="2" fill="#334155" />
        <rect x="68" y="55" width="64" height="4" rx="2" fill="#334155" />
        <rect x="68" y="65" width="40" height="4" rx="2" fill="#334155" />
        <rect x="68" y="80" width="58" height="4" rx="2" fill="#334155" />
        <rect x="68" y="90" width="48" height="4" rx="2" fill="#334155" />
        <rect x="68" y="105" width="55" height="4" rx="2" fill="#334155" />
        <rect x="68" y="115" width="62" height="4" rx="2" fill="#334155" />
        <rect x="68" y="125" width="38" height="4" rx="2" fill="#334155" />
        <rect x="68" y="140" width="50" height="4" rx="2" fill="#334155" />

        {/* Scan line sweep */}
        <g clipPath={`url(#${id}-phoneClip)`}>
          <rect
            x="55" y="20" width="90" height="20"
            fill={`url(#${id}-scanLine)`}
            style={{
              animation: `${id}-sweep 2.5s ease-in-out infinite`,
            }}
          />
        </g>

        {/* Threat dots */}
        <circle
          cx="90" cy="65" r="5"
          fill="#EF4444"
          style={{
            animation: `${id}-threat1 2.5s ease-in-out infinite`,
            transformOrigin: '90px 65px',
          }}
        />
        <circle
          cx="115" cy="95" r="4"
          fill="#F59E0B"
          style={{
            animation: `${id}-threat2 2.5s ease-in-out infinite`,
            transformOrigin: '115px 95px',
          }}
        />
        <circle
          cx="85" cy="130" r="5"
          fill="#EF4444"
          style={{
            animation: `${id}-threat3 2.5s ease-in-out infinite`,
            transformOrigin: '85px 130px',
          }}
        />

        {/* Threat X marks */}
        <g style={{ animation: `${id}-threat1 2.5s ease-in-out infinite` }}>
          <line x1="87" y1="62" x2="93" y2="68" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="93" y1="62" x2="87" y2="68" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <g style={{ animation: `${id}-threat2 2.5s ease-in-out infinite` }}>
          <line x1="112.5" y1="92.5" x2="117.5" y2="97.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="117.5" y1="92.5" x2="112.5" y2="97.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <g style={{ animation: `${id}-threat3 2.5s ease-in-out infinite` }}>
          <line x1="82" y1="127" x2="88" y2="133" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="88" y1="127" x2="82" y2="133" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
};

export default ScanAnim;
