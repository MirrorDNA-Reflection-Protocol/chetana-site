import React, { useEffect, useRef } from 'react';

interface FloatingCardsProps {
  size?: number;
}

interface CardData {
  icon: 'shield' | 'alert' | 'check' | 'block';
  text: string;
  color: string;
  delay: number;
  xOffset: number;
}

const cards: CardData[] = [
  { icon: 'shield', text: 'Scam blocked', color: '#22C55E', delay: 0, xOffset: -20 },
  { icon: 'alert', text: 'Fraud detected', color: '#EF4444', delay: 1.5, xOffset: 30 },
  { icon: 'check', text: 'Number verified', color: '#3B82F6', delay: 3, xOffset: -10 },
  { icon: 'block', text: 'Spam prevented', color: '#F59E0B', delay: 4.5, xOffset: 20 },
];

const iconPaths: Record<string, string> = {
  shield: 'M10,3 L17,6.5 L17,11 Q17,16 10,19 Q3,16 3,11 L3,6.5 Z',
  alert: 'M10,2 L18,17 L2,17 Z',
  check: 'M4,10 L8,14 L16,6',
  block: 'M10,2 A8,8 0 1,0 10,18 A8,8 0 1,0 10,2 M4,10 L16,10',
};

const FloatingCards: React.FC<FloatingCardsProps> = ({ size = 200 }) => {
  const id = useRef(`float-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const styleId = `style-${id}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ${id}-float {
        0% {
          opacity: 0;
          transform: translateY(40px) scale(0.9);
        }
        10% {
          opacity: 1;
          transform: translateY(20px) scale(1);
        }
        60% {
          opacity: 1;
          transform: translateY(-30px) scale(1);
        }
        80% {
          opacity: 0;
          transform: translateY(-60px) scale(0.95);
        }
        100% {
          opacity: 0;
          transform: translateY(-60px) scale(0.9);
        }
      }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [id]);

  const totalDuration = 6; // seconds for the full cycle

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '60%',
            transform: 'translateX(-50%)',
            marginLeft: card.xOffset,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(15, 23, 42, 0.9)',
            border: `1px solid ${card.color}40`,
            borderRadius: 10,
            padding: '8px 14px',
            whiteSpace: 'nowrap',
            boxShadow: `0 4px 20px ${card.color}20`,
            animation: `${id}-float ${totalDuration}s ease-in-out infinite`,
            animationDelay: `${card.delay}s`,
            opacity: 0,
          }}
        >
          {/* Icon */}
          <svg
            viewBox="0 0 20 20"
            width={18}
            height={18}
            style={{ flexShrink: 0 }}
          >
            {card.icon === 'shield' && (
              <path
                d={iconPaths.shield}
                fill={card.color}
                fillOpacity="0.2"
                stroke={card.color}
                strokeWidth="1.5"
              />
            )}
            {card.icon === 'alert' && (
              <>
                <path
                  d={iconPaths.alert}
                  fill="none"
                  stroke={card.color}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <line x1="10" y1="8" x2="10" y2="12" stroke={card.color} strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="14.5" r="0.8" fill={card.color} />
              </>
            )}
            {card.icon === 'check' && (
              <>
                <circle cx="10" cy="10" r="8" fill={card.color} fillOpacity="0.15" stroke={card.color} strokeWidth="1.5" />
                <polyline
                  points="6,10 9,13 14,7"
                  fill="none"
                  stroke={card.color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {card.icon === 'block' && (
              <>
                <circle cx="10" cy="10" r="7" fill="none" stroke={card.color} strokeWidth="1.5" />
                <line x1="5" y1="15" x2="15" y2="5" stroke={card.color} strokeWidth="1.5" />
              </>
            )}
          </svg>
          {/* Text */}
          <span
            style={{
              color: '#E2E8F0',
              fontSize: Math.max(11, size / 18),
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            {card.text}
          </span>
        </div>
      ))}
    </div>
  );
};

export default FloatingCards;
