import { ClipboardPaste, CornerDownLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PasteSheetProps {
  open: boolean;
  onClose: () => void;
  onPaste: (text: string, submitEnter: boolean) => void;
}

export function PasteSheet({ open, onClose, onPaste }: PasteSheetProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const handleSend = (submitEnter: boolean) => {
    if (!text) return;
    onPaste(text, submitEnter);
    setText("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Paste into terminal</h2>
            <p className="text-[11px] text-[var(--dim)]">
              Long-press inside the box to use the native Paste menu
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-[var(--dim)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Long-press here and tap Paste..."
          rows={4}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none"
        />

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={!text}
            onClick={() => handleSend(false)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-medium text-[var(--text)] active:scale-95 disabled:opacity-40"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Paste</span>
          </button>
          <button
            type="button"
            disabled={!text}
            onClick={() => handleSend(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-3 text-xs font-medium text-[var(--accent)] active:scale-95 disabled:opacity-40"
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
            <span>Paste + Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
