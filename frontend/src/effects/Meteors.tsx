/**
 * Meteors — animated falling light streaks for hero sections.
 * Creates a sense of motion and energy.
 */
export default function Meteors({ count = 12 }: { count?: number }) {
  const meteors = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 5}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: `${1 + Math.random() * 1.5}px`,
  }));

  return (
    <div className="meteors-field">
      {meteors.map((m) => (
        <div
          key={m.id}
          className="meteor"
          style={{
            left: m.left,
            animationDelay: m.delay,
            animationDuration: m.duration,
            width: m.size,
          }}
        />
      ))}
    </div>
  );
}
