import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext.jsx";
import { copyToClipboard } from "../utils/clipboard.js";
import { LinkIcon, CheckIcon } from "./icons.jsx";

// "Copy meeting link" — the same one-click invite pattern Zoom/Meet use.
// Since RequireAuth (see App.jsx) already sends a signed-out visitor through
// Keycloak login and straight back to the exact URL they clicked, a plain
// link to /join/:roomCode is a complete invite on its own: whoever gets it
// either lands in the Lobby immediately (already signed in) or signs in
// first and then lands there, no separate "how do I join" instructions
// needed.
export default function CopyLinkButton({ roomCode, className = "" }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copyLink = async () => {
    const link = `${window.location.origin}/join/${roomCode}`;
    const ok = await copyToClipboard(link);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" className={`pill copy-link-btn ${className}`.trim()} onClick={copyLink}>
      {copied ? <CheckIcon /> : <LinkIcon />}
      {copied ? t("lobby.linkCopied") : t("lobby.copyLink")}
    </button>
  );
}
