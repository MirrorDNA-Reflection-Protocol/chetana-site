import React, { useEffect, useRef } from 'react';

interface ShieldAnimProps {
  size?: number;
}

const ShieldAnim: React.FC<ShieldAnimProps> = ({ size = 120 }) => {
  const id = useRef(`shield-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const styleId = `style-${id}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ${id}-pulse {
        0%, 100% { filter: drop-shadow(0 0 6px rgba(245, 166, 35, 0.3)); }
        50% { filter: drop-shadow(0 0 18px rgba(245, 166, 35, 0.6)); }
      }
      @keyframes ${id}-drawCheck {
        0% { stroke-dashoffset: 40; }
        100% { stroke-dashoffset: 0; }
      }
      @keyframes ${id}-fadeIn {
        0% { opacity: 0; transform: scale(0.8); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [id]);

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
        viewBox="0 0 100 120"
        width={size}
        height={size}
        style={{
          animation: `${id}-fadeIn 0.6s ease-out, ${id}-pulse 2.5s ease-in-out infinite`,
        }}
      >
        <defs>
          <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>
          <linearGradient id={`${id}-grad2`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        {/* Shield body */}
        <path
          d="M50 8 L88 28 L88 60 Q88 90 50 112 Q12 90 12 60 L12 28 Z"
          fill={`url(#${id}-grad)`}
          stroke={`url(#${id}-grad2)`}
          strokeWidth="2"
        />
        {/* Inner highlight */}
        <path
          d="M50 16 L80 32 L80 58 Q80 84 50 104 Q20 84 20 58 L20 32 Z"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        {/* Checkmark */}
        <polyline
          points="33,60 46,74 68,46"
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          style={{
            animation: `${id}-drawCheck 0.8s ease-out 0.4s forwards`,
            strokeDashoffset: 40,
          }}
        />
      </svg>
    </div>
  );
};

export default ShieldAnim;
