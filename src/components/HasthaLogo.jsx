import logoColor from "../assets/hastha-logo.png";
import logoWhite from "../assets/hastha-logo-white.png";

// The real Hastha mark (two joined hands forming a continuous wave,
// blue-to-purple gradient) from design/Hastha_Logo_Package. It's a raster
// export (no vector source was supplied — see the package's own README),
// so this renders an <img> rather than drawing paths; supplied up to
// 512px, comfortably crisp at the sizes this component is actually used
// at. Per the package's usage guidelines: the full-colour mark already
// carries its own background treatment and reads fine on both light and
// dark surfaces, so it's used bare — no colored badge/container — except
// on a dark surface where `variant="white"` swaps in the reversed mark
// the guidelines call for there.
export default function HasthaLogo({ size = 32, variant = "color", className }) {
  const src = variant === "white" ? logoWhite : logoColor;
  return (
    <img
      src={src}
      alt="Hastha"
      className={className}
      width={size}
      height={size}
      style={{ display: "inline-block", flexShrink: 0, objectFit: "contain" }}
    />
  );
}
