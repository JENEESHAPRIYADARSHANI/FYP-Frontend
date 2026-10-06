import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext.jsx";
import { MoreIcon } from "./icons.jsx";

// Your own name in the participant list, with a three-dot menu next to it
// (the same pattern Zoom uses) offering "Rename" — the only place, besides
// the one-time onboarding screen, where the saved display name can be
// changed. `onRename` is expected to persist it (ProfileContext.saveProfile)
// and only throws on failure; this component doesn't know or care that it's
// backed by Postgres.
export default function RenameControl({ displayName, onRename }) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeIfOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startRename = () => {
    setValue(displayName);
    setError(null);
    setEditing(true);
    setMenuOpen(false);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === displayName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRename(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form className="rename-form" onSubmit={save}>
        <input
          ref={inputRef}
          className="field rename-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={60}
          disabled={saving}
          onKeyDown={(event) => event.key === "Escape" && cancel()}
        />
        <button type="submit" className="btn btn-primary rename-btn" disabled={saving || !value.trim()}>
          {t("call.renameSave")}
        </button>
        <button type="button" className="btn btn-ghost rename-btn" onClick={cancel} disabled={saving}>
          {t("call.renameCancel")}
        </button>
        {error && <span className="rename-error">{error}</span>}
      </form>
    );
  }

  return (
    <span className="rename-control" ref={rootRef}>
      <strong>{displayName}</strong>
      <button
        type="button"
        className="icon-btn rename-menu-btn"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t("call.participantActions")}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreIcon />
      </button>
      {menuOpen && (
        <div className="rename-dropdown" role="menu">
          <button type="button" role="menuitem" onClick={startRename}>
            {t("call.renameAction")}
          </button>
        </div>
      )}
    </span>
  );
}
