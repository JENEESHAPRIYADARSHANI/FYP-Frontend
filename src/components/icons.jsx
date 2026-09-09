// A small, consistent icon set for the control bar — chunky, rounded shapes
// sized for young hands rather than thin-line "professional" glyphs. Every
// icon uses fill="currentColor" so it inherits color from the button that
// hosts it (see .dock-btn / .icon-btn in App.css), the same way a text glyph
// would via `color`.

const base = { width: "1em", height: "1em", viewBox: "0 0 24 24", "aria-hidden": true };

// `slash` draws a diagonal line through the icon — the universal "off/muted"
// marker, so state is never carried by button color alone.
function Slash() {
  return <line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />;
}

export function MicIcon({ slash, ...props }) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <rect x="7" y="14" width="10" height="2" rx="1" fill="currentColor" />
      <rect x="11" y="16" width="2" height="4" rx="1" fill="currentColor" />
      {slash && <Slash />}
    </svg>
  );
}

export function CameraIcon({ slash, ...props }) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="14" height="10" rx="3" fill="currentColor" />
      <rect x="8" y="4" width="6" height="4" rx="2" fill="currentColor" />
      <path d="M19 10.5v3a1.2 1.2 0 0 0 1.8 1l2-1.5a1 1 0 0 0 0-1.6l-2-1.4a1.2 1.2 0 0 0-1.8 1Z" fill="currentColor" />
      {slash && <Slash />}
    </svg>
  );
}

export function ShareIcon(props) {
  return (
    <svg {...base} {...props}>
      <polygon points="12,3 18,11 6,11" fill="currentColor" />
      <rect x="10" y="10" width="4" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

export function ParticipantsIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="16" cy="7" r="3" fill="currentColor" opacity="0.55" />
      <path d="M11 20c0-2.8 2.2-5 5-5s5 2.2 5 5" fill="currentColor" opacity="0.55" />
      <circle cx="8" cy="8" r="3.6" fill="currentColor" />
      <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="currentColor" />
    </svg>
  );
}

export function ChatIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="6" fill="currentColor" />
      <polygon points="7,15.5 7,20 11.5,15.5" fill="currentColor" />
    </svg>
  );
}

export function MoreIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="18" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function LeaveIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="8" width="8" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}

export function WhiteboardIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 17.5l1.3-4 5-5 2.7 2.7-5 5z" fill="currentColor" />
      <rect x="10.5" y="19.5" width="3" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

export function RecordIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
}

export function SettingsIcon(props) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="15" cy="6" r="2.5" fill="currentColor" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="12" r="2.5" fill="currentColor" />
      <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="18" r="2.5" fill="currentColor" />
    </svg>
  );
}
