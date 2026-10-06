import { useState } from "react";

// A person's photo when one is available (currently: Google's profile
// picture, imported via the Keycloak Google identity provider's
// "picture-importer" attribute mapper — see AuthContext.jsx/ProfileContext
// for where `picture` comes from), falling back to an initial-letter circle
// otherwise, the same fallback pattern Zoom/Meet use. `size` is optional —
// leave it unset to size purely through `className` (e.g. AccountBadge's
// existing .account-avatar/.account-avatar-lg, which already define
// width/height), or set it for a one-off size like the call room's
// camera-off tile.
export default function UserAvatar({ picture, name, size, className = "" }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const style = size ? { width: size, height: size } : undefined;

  if (picture && !failed) {
    return (
      <img
        src={picture}
        alt=""
        className={`user-avatar-img ${className}`.trim()}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={className} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
