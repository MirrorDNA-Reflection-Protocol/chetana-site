import React, { useEffect, useRef } from 'react';

interface RadarAnimProps {
  size?: number;
}

const RadarAnim: React.FC<RadarAnimProps> = ({ size = 200 }) => {
  const id = useRef(`radar-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const styleId = `style-${id}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ${id}-sweep {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes ${id}-dot1 {
        0%, 10% { opacity: 0; r: 3; }
        15% { opacity: 1; r: 4; }
        40% { opacity: 0.3; r: 3; }
        100% { opacity: 0; r: 3; }
      }
      @keyframes ${id}-dot2 {
        0%, 35% { opacity: 0; r: 3; }
        40% { opacity: 1; r: 4; }
        65% { opacity: 0.3; r: 3; }
        100% { opacity: 0; r: 3; }
      }
      @keyframes ${id}-dot3 {
        0%, 55% { opacity: 0; r: 2.5; }
        60% { opacity: 1; r: 3.5; }
        80% { opacity: 0.3; r: 2.5; }
        100% { opacity: 0; r: 2.5; }
      }
      @keyframes ${id}-dot4 {
        0%, 70% { opacity: 0; r: 3; }
        75% { opacity: 1; r: 4; }
        95% { opacity: 0.3; r: 3; }
        100% { opacity: 0; r: 3; }
      }
      @keyframes ${id}-ring {
        0%, 100% { stroke-opacity: 0.12; }
        50% { stroke-opacity: 0.25; }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [id]);

  const cx = 100;
  const cy = 100;

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
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <radialGradient id={`${id}-bg`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
          <linearGradient id={`${id}-sweepGrad`} gradientTransform="rotate(90)">
            <stop offset="0%" stopColor="rgba(34,197,94,0)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0.6)" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle cx={cx} cy={cy} r="95" fill={`url(#${id}-bg)`} stroke="#1E293B" strokeWidth="1" />

        {/* Concentric rings */}
        {[25, 50, 75].map((r) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#22C55E"
            strokeWidth="0.5"
            style={{
              strokeOpacity: 0.15,
              animation: `${id}-ring 3s ease-in-out infinite`,
              animationDelay: `${r * 10}ms`,
            }}
          />
        ))}

        {/* Cross hairs */}
        <line x1={cx} y1="10" x2={cx} y2="190" stroke="#22C55E" strokeWidth="0.3" strokeOpacity="0.2" />
        <line x1="10" y1={cy} x2="190" y2={cy} stroke="#22C55E" strokeWidth="0.3" strokeOpacity="0.2" />

        {/* Sweep arm with trail */}
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: `${id}-sweep 4s linear infinite`,
          }}
        >
          {/* Sweep trail (cone shape) */}
          <path
            d={`M${cx},${cy} L${cx},5 A95,95 0 0,1 ${cx + 60},${cy - 72} Z`}
            fill="rgba(34,197,94,0.08)"
          />
          {/* Sweep line */}
          <line
            x1={cx} y1={cy} x2={cx} y2="5"
            stroke="#22C55E"
            strokeWidth="1.5"
            strokeOpacity="0.8"
          />
        </g>

        {/* Threat dots - positioned at different angles/distances */}
        <circle
          cx={cx + 20} cy={cy - 35} r="3"
          fill="#22C55E"
          style={{ animation: `${id}-dot1 4s linear infinite` }}
        />
        <circle
          cx={cx - 45} cy={cy - 20} r="3"
          fill="#EF4444"
          style={{ animation: `${id}-dot2 4s linear infinite` }}
        />
        <circle
          cx={cx + 55} cy={cy + 15} r="2.5"
          fill="#22C55E"
          style={{ animation: `${id}-dot3 4s linear infinite` }}
        />
        <circle
          cx={cx - 15} cy={cy + 50} r="3"
          fill="#F59E0B"
          style={{ animation: `${id}-dot4 4s linear infinite` }}
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" fill="#22C55E" fillOpacity="0.8" />
        <circle cx={cx} cy={cy} r="1.5" fill="white" fillOpacity="0.9" />
      </svg>
    </div>
  );
};

export default RadarAnim;
