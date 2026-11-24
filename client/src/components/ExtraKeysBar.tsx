import type { PointerEvent } from "react";
import type { SpecialKey } from "./TerminalView";

export interface ExtraKeysBarProps {
  ctrlActive: boolean;
  onToggleCtrl: () => void;
  onSendSequence: (seq: string) => void;
  onSendSpecial: (key: SpecialKey) => void;
  onPasteInput: () => void;
  isKeyboardOpen: boolean;
}

interface KeyDef {
  id: string;
  label: string;
  title: string;
  action: () => void;
  active?: boolean;
}

export function ExtraKeysBar({
  ctrlActive,
  onToggleCtrl,
  onSendSequence,
  onSendSpecial,
  onPasteInput,
  isKeyboardOpen,
}: ExtraKeysBarProps) {
  const keepFocus = (e: PointerEvent, fn: () => void) => {
    e.preventDefault();
    fn();
  };

  const row1: KeyDef[] = [
    { id: "esc", label: "Esc", title: "Escape", action: () => onSendSpecial("ESC") },
    { id: "tab", label: "Tab", title: "Autocomplete", action: () => onSendSpecial("TAB") },
    {
      id: "ctrl",
      label: "Ctrl",
      title: "Ctrl modifier (sticky)",
      action: onToggleCtrl,
      active: ctrlActive,
    },
    { id: "ctrlc", label: "^C", title: "SIGINT (interrupt)", action: () => onSendSpecial("CTRL_C") },
    { id: "up", label: "↑", title: "Arrow Up", action: () => onSendSpecial("UP") },
    { id: "down", label: "↓", title: "Arrow Down", action: () => onSendSpecial("DOWN") },
    { id: "left", label: "←", title: "Arrow Left", action: () => onSendSpecial("LEFT") },
    { id: "right", label: "→", title: "Arrow Right", action: () => onSendSpecial("RIGHT") },
  ];

  const row2: KeyDef[] = [
    { id: "slash", label: "/", title: "Insert /", action: () => onSendSequence("/") },
    { id: "dash", label: "-", title: "Insert -", action: () => onSendSequence("-") },
    { id: "pipe", label: "|", title: "Insert |", action: () => onSendSequence("|") },
    { id: "tilde", label: "~", title: "Insert ~", action: () => onSendSequence("~") },
    { id: "and", label: "&&", title: "Insert &&", action: () => onSendSequence(" && ") },
    { id: "redir", label: ">", title: "Insert >", action: () => onSendSequence(" > ") },
    { id: "ctrld", label: "^D", title: "EOF / Exit", action: () => onSendSpecial("CTRL_D") },
    { id: "paste", label: "Paste", title: "Paste text into terminal", action: onPasteInput },
  ];

  const renderKey = (k: KeyDef) => {
    const base =
      "flex h-8 w-full items-center justify-center rounded-md px-1 text-[11px] font-mono font-medium transition-transform active:scale-95 border";
    const style = k.active
      ? "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/60"
      : "bg-[var(--surface-elevated)] text-[var(--text)] border-[var(--border)] hover:border-slate-500";

    return (
      <button
        key={k.id}
        type="button"
        aria-label={k.title}
        aria-pressed={k.active}
        title={k.title}
        onPointerDown={(e) => keepFocus(e, k.action)}
        className={`${base} ${style}`}
      >
        {k.label}
      </button>
    );
  };

  return (
    <div
      className={`shrink-0 border-t border-[var(--border)] bg-[var(--surface)] select-none [@media(pointer:fine)]:hidden ${
        isKeyboardOpen ? "pb-1" : "pb-[max(6px,env(safe-area-inset-bottom))]"
      }`}
      style={{ touchAction: "manipulation" }}
    >
      <div className="space-y-1 px-1.5 py-1.5">
        <div className="grid grid-cols-8 gap-1">{row1.map(renderKey)}</div>
        <div className="grid grid-cols-8 gap-1">{row2.map(renderKey)}</div>
      </div>
    </div>
  );
}
