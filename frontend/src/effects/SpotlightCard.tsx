import { useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * SpotlightCard — card with a mouse-tracking radial spotlight effect.
 * Wrap any content for an interactive glow-on-hover.
 */
export default function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(245, 166, 35, 0.12)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const handleMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.div
      ref={ref}
      className={`spotlight-card ${className}`}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="spotlight-beam"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: hovering ? 1 : 0,
          transition: "opacity 0.3s",
          background: `radial-gradient(600px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </motion.div>
  );
}
