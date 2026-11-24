import { Braces, Check, Copy, FolderDown, TextSelect, X } from "lucide-react";
import { useState } from "react";
import type { SaveToLibraryRequest, SaveToLibraryResult } from "../transport/types";
import { copyTextToClipboard, stripAnsi, tryFormatJson } from "../utils/clipboard";

export interface OutputEntry {
  id: number;
  command: string;
  cwd: string;
  output: string;
  exitCode: number;
  timestamp: string;
}

export interface OutputReaderSheetProps {
  open: boolean;
  entries: OutputEntry[];
  onClose: () => void;
  onSaveToLibrary?: (req: SaveToLibraryRequest) => Promise<SaveToLibraryResult>;
}

export function OutputReaderSheet({
  open,
  entries,
  onClose,
  onSaveToLibrary,
}: OutputReaderSheetProps) {
  const [copiedId, setCopiedId] = useState<number | "selection" | null>(null);
  const [prettyIds, setPrettyIds] = useState<Record<number, boolean>>({});
  const [savedNotice, setSavedNotice] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  if (!open) return null;

  const markCopied = (id: number | "selection") => {
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const handleCopySelection = async () => {
    const sel = window.getSelection()?.toString() ?? "";
    if (!sel.trim()) return;
    const ok = await copyTextToClipboard(sel);
    if (ok) markCopied("selection");
  };

  const handleCopyEntry = async (entry: OutputEntry, displayOutput: string) => {
    const sel = window.getSelection()?.toString() ?? "";
    const textToCopy = sel.trim().length > 0 ? sel : displayOutput;
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) markCopied(entry.id);
  };

  const handleSave = async (
    entry: OutputEntry,
    format: "txt" | "md" | "json",
    displayOutput: string,
  ) => {
    if (!onSaveToLibrary) return;
    setSavingId(entry.id);
    try {
      const slug =
        entry.command
          .trim()
          .split(/\s+/)[0]
          ?.replace(/[^a-zA-Z0-9_-]/g, "") || "output";
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
      const filename = `${slug}-${stamp}.${format}`;
      const body =
        format === "md"
          ? `# Command: \`${entry.command}\`\n\n- **Directory:** \`${entry.cwd}\`\n- **Time:** ${entry.timestamp}\n\n\`\`\`\n${displayOutput}\n\`\`\`\n`
          : displayOutput;

      const res = await onSaveToLibrary({
        filename,
        format,
        content: body,
        command: entry.command,
      });
      const shortPath = res.savedPath.replace(/^\/home\/hatch/, "~");
      setSavedNotice((prev) => ({ ...prev, [entry.id]: `Saved to ${shortPath}` }));
      setTimeout(() => {
        setSavedNotice((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }, 3000);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="mt-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface)] pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Session Outputs
            </h2>
            <p className="text-[11px] text-[var(--dim)]">
              Select text, copy, or save to Muse Library (~/workspace/your_files/)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCopySelection()}
              className="flex h-8 items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-2.5 text-xs font-medium text-[var(--accent)] active:scale-95"
              title="Copy currently highlighted text"
            >
              {copiedId === "selection" ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <TextSelect className="h-3.5 w-3.5" />
                  <span>Copy selection</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close reader"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-[var(--dim)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {entries.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-center text-xs text-[var(--dim)]">
              No outputs captured in this session yet. Run a command in the terminal to inspect, copy, or save its output.
            </div>
          ) : (
            entries
              .slice()
              .reverse()
              .map((entry) => {
                const clean = stripAnsi(entry.output).trimEnd();
                const formattedJson = tryFormatJson(entry.output);
                const isPretty = prettyIds[entry.id] ?? true;
                const displayOutput =
                  formattedJson && isPretty ? formattedJson : clean || "(no text output)";

                return (
                  <div
                    key={entry.id}
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-black/30 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="truncate font-mono text-xs font-semibold text-emerald-300">
                            $ {entry.command}
                          </code>
                          {entry.exitCode !== 0 && (
                            <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] text-red-300">
                              exit {entry.exitCode}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--dim)]">
                          {entry.cwd} • {entry.timestamp}
                        </span>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {formattedJson && (
                          <button
                            type="button"
                            onClick={() =>
                              setPrettyIds((prev) => ({
                                ...prev,
                                [entry.id]: !isPretty,
                              }))
                            }
                            className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium active:scale-95 ${
                              isPretty
                                ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]"
                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--dim)]"
                            }`}
                          >
                            <Braces className="h-3 w-3" />
                            <span>JSON</span>
                          </button>
                        )}

                        {onSaveToLibrary && (
                          <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)]">
                            <span className="flex items-center gap-1 px-1.5 text-[10px] text-[var(--dim)]">
                              <FolderDown className="h-3 w-3 text-[var(--accent)]" />
                            </span>
                            {(["txt", "md", ...(formattedJson ? (["json"] as const) : [])] as const).map(
                              (fmt) => (
                                <button
                                  key={fmt}
                                  type="button"
                                  disabled={savingId === entry.id}
                                  onClick={() => void handleSave(entry, fmt, displayOutput)}
                                  className="h-7 border-l border-[var(--border)] px-1.5 font-mono text-[10px] font-medium text-[var(--text)] hover:text-[var(--accent)] active:scale-95"
                                  title={`Save as .${fmt} in ~/workspace/your_files/`}
                                >
                                  .{fmt}
                                </button>
                              ),
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleCopyEntry(entry, displayOutput)}
                          className="flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--text)] active:scale-95"
                        >
                          {copiedId === entry.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {savedNotice[entry.id] && (
                      <div className="border-b border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-300">
                        ✓ {savedNotice[entry.id]}
                      </div>
                    )}

                    <pre className="select-text overflow-x-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--text)]">
                      {displayOutput}
                    </pre>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}
