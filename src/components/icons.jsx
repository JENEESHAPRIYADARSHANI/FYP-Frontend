// A small, consistent icon set for the control bar. Most icons use
// fill="currentColor" so they inherit color from the button that hosts them
// (see .dock-btn / .icon-btn in App.css) — necessary for Mic/Camera/Share,
// whose buttons flip to a solid red/blue background when muted/active and
// need the icon to flip to white with them. ParticipantsIcon is the one
// exception: its button never changes to a solid background, so it carries
// its own fixed Hastha brand gradient (blue -> violet, sampled from the
// logo) instead of following button color.

import { useId } from "react";

const base = { width: "1em", height: "1em", viewBox: "0 0 24 24", "aria-hidden": true };

// `slash` draws a diagonal line through the icon — the universal "off/muted"
// marker, so state is never carried by button color alone.
function Slash() {
  return <line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />;
}

export function MicIcon({ slash, ...props }) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11v1a6 6 0 0 0 12 0v-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {slash && <Slash />}
    </svg>
  );
}

export function CameraIcon({ slash, ...props }) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="12" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M15 10.1l4.3-2.8a1 1 0 0 1 1.7.9v7.6a1 1 0 0 1-1.7.9L15 13.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {slash && <Slash />}
    </svg>
  );
}

export function ShareIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="15.5" width="6" height="3" rx="1" fill="currentColor" />
      <path
        d="M12 7.5v5.5M9.2 10.3l2.8-2.8 2.8 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ParticipantsIcon(props) {
  const gradId = useId();
  return (
    <svg {...base} {...props}>
      <defs>
        <linearGradient id={gradId} x1="1" y1="3" x2="23" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <circle cx="9" cy="7" r="4" fill="none" stroke={`url(#${gradId})`} strokeWidth="2" />
      <path
        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke={`url(#${gradId})`} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" fill="none" stroke={`url(#${gradId})`} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
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
      <rect x="10.5" y="1.2" width="3" height="3.4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="3.6" width="18" height="13" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="18.3" y1="9" x2="18.3" y2="12.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="1.8" y="16.8" width="20.4" height="2.4" rx="1.1" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="10.3" y1="19.2" x2="6.8" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="13.7" y1="19.2" x2="17.2" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

export function SunIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22.5" y2="12" />
        <line x1="4.4" y1="4.4" x2="6.1" y2="6.1" />
        <line x1="17.9" y1="17.9" x2="19.6" y2="19.6" />
        <line x1="4.4" y1="19.6" x2="6.1" y2="17.9" />
        <line x1="17.9" y1="6.1" x2="19.6" y2="4.4" />
      </g>
    </svg>
  );
}

export function MoonIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor" />
    </svg>
  );
}

export function LinkIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect
        x="2"
        y="9"
        width="10"
        height="6"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        transform="rotate(-45 7 12)"
      />
      <rect
        x="12"
        y="9"
        width="10"
        height="6"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        transform="rotate(-45 17 12)"
      />
      <line x1="10" y1="14" x2="14" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SwapIcon(props) {
  return (
    <svg {...base} {...props}>
      <path
        d="M4 8h13M13 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 16H7M11 12l-4 4 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <polyline
        points="4,13 9,18 20,6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HandIcon(props) {
  return (
    <svg {...base} {...props}>
      {/* Four fingers */}
      <rect x="4.5" y="7" width="3" height="9" rx="1.5" fill="currentColor" />
      <rect x="8.3" y="3" width="3" height="13" rx="1.5" fill="currentColor" />
      <rect x="12.1" y="2" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="15.9" y="4" width="3" height="12" rx="1.5" fill="currentColor" />
      {/* Palm */}
      <path d="M4.5 13h14.4v3a5 5 0 0 1-5 5h-4.4a5 5 0 0 1-5-5z" fill="currentColor" />
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
