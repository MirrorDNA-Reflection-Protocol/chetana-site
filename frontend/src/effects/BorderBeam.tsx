/**
 * BorderBeam — animated glowing beam that travels around the border of a container.
 * Add as a child of any position:relative container.
 */
export default function BorderBeam({
  size = 200,
  duration = 8,
  delay = 0,
  color = "#f5a623",
  colorTo = "#e65100",
}: {
  size?: number;
  duration?: number;
  delay?: number;
  color?: string;
  colorTo?: string;
}) {
  return (
    <div className="border-beam-wrap">
      <div
        className="border-beam"
        style={{
          "--beam-size": `${size}px`,
          "--beam-duration": `${duration}s`,
          "--beam-delay": `${delay}s`,
          "--beam-color-from": color,
          "--beam-color-to": colorTo,
        } as React.CSSProperties}
      />
    </div>
  );
}
