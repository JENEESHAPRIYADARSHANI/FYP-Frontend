// The Hastha hand mark — an open, five-fingered hand built from rounded
// rectangles only (no rotated primitives), matching the mark designed in
// Figma (Brand & Icons page). `badge` wraps it in the rounded-blue-square
// app-icon treatment used in navigation; without it, the hand renders alone
// so it can be recolored (e.g. for the favicon or on a dark surface).
export default function HasthaLogo({ size = 32, badge = false, className }) {
  const hand = (
    <svg width="100%" height="100%" viewBox="0 0 160 160" aria-hidden="true">
      <rect x="46" y="62" width="14" height="46" rx="7" fill={badge ? "#fff" : "currentColor"} />
      <rect x="64" y="52" width="14" height="56" rx="7" fill={badge ? "#fff" : "currentColor"} />
      <rect x="82" y="56" width="14" height="52" rx="7" fill={badge ? "#fff" : "currentColor"} />
      <rect x="100" y="66" width="14" height="42" rx="7" fill={badge ? "#fff" : "currentColor"} />
      <rect x="44.4" y="100" width="16" height="24" rx="8" fill={badge ? "#fff" : "currentColor"} />
      <rect x="50" y="86" width="60" height="44" rx="20" fill={badge ? "#fff" : "currentColor"} />
    </svg>
  );

  if (!badge) {
    return (
      <span className={className} style={{ display: "inline-block", width: size, height: size }}>
        {hand}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "var(--blue)",
        flexShrink: 0,
      }}
    >
      <span style={{ display: "inline-block", width: "62%", height: "62%" }}>{hand}</span>
    </span>
  );
}
