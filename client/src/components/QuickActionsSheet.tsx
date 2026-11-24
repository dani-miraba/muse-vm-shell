import { CornerDownLeft, Play, X } from "lucide-react";
import type { QuickActionPreset } from "../transport/types";

export interface QuickActionsSheetProps {
  open: boolean;
  presets: QuickActionPreset[];
  onClose: () => void;
  onSelectPreset: (preset: QuickActionPreset) => void;
}

const CATEGORY_LABELS: Record<QuickActionPreset["category"], string> = {
  storage: "Storage",
  connectors: "Connectors",
  cron: "Cron / Hooks",
  files: "Files",
  network: "Network / cURL",
};

export function QuickActionsSheet({
  open,
  presets,
  onClose,
  onSelectPreset,
}: QuickActionsSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface)] pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">VM Quick Shortcuts</h2>
            <p className="text-xs text-[var(--dim)]">
              Tap to insert at the prompt or run directly without waking the agent
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-[var(--dim)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelectPreset(p);
                onClose();
              }}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-left transition-colors hover:border-[var(--accent)]/50 active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    {CATEGORY_LABELS[p.category]}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text)]">{p.label}</span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--dim)]">{p.description}</p>
                <code className="mt-1.5 block truncate rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-emerald-300">
                  {p.command}
                </code>
              </div>
              <div className="mt-1 shrink-0 text-[var(--dim)]">
                {p.insertOnly ? (
                  <CornerDownLeft className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 text-[var(--accent)]" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
