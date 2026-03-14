/**
 * GridPattern — subtle dot grid background that fades towards edges.
 * Creates depth and a techy feel without being distracting.
 */
export default function GridPattern({
  size = 32,
  color = "rgba(59, 130, 246, 0.08)",
}: {
  size?: number;
  color?: string;
}) {
  const id = `grid-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      className="grid-pattern"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 80%)",
      }}
    >
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <circle cx={size / 2} cy={size / 2} r={1} fill={color} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
