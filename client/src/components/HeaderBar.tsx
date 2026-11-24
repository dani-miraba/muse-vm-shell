import {
  Check,
  ClipboardPaste,
  Copy,
  Minus,
  Plus,
  Terminal,
  TextSelect,
  X,
  Zap,
} from "lucide-react";
import type { PtySessionInfo } from "../transport/types";

export interface HeaderBarProps {
  cwd: string;
  fgProcess: string;
  connectionState: "connecting" | "connected" | "reconnecting";
  sessions: PtySessionInfo[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onKillSession: (sessionId: string) => void;
  fontSize: number;
  onChangeFontSize: (delta: number) => void;
  onCopyOutput: () => void;
  copiedRecently: boolean;
  onPasteInput: () => void;
  pastedRecently: boolean;
  onOpenOutputReader: () => void;
  onOpenQuickActions: () => void;
}

export function HeaderBar({
  cwd,
  fgProcess,
  connectionState,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onKillSession,
  fontSize,
  onChangeFontSize,
  onCopyOutput,
  copiedRecently,
  onPasteInput,
  pastedRecently,
  onOpenOutputReader,
  onOpenQuickActions,
}: HeaderBarProps) {
  const shortCwd = (cwd || "~").replace(/^\/home\/hatch/, "~");
  const statusColor =
    connectionState === "connected"
      ? "bg-emerald-400"
      : connectionState === "reconnecting"
        ? "animate-pulse bg-amber-400"
        : "animate-pulse bg-sky-400";
  const statusLabel =
    connectionState === "connected"
      ? fgProcess || "bash"
      : connectionState === "reconnecting"
        ? "Reconnecting..."
        : "Connecting PTY...";

  return (
    <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-mono text-xs font-semibold text-[var(--text)]">
                {shortCwd}
              </span>
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusColor}`}
                title={statusLabel}
              />
            </div>
            <p className="truncate font-mono text-[10px] text-[var(--dim)]">
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPasteInput}
            aria-label="Paste into terminal"
            title="Paste from clipboard (or open paste sheet)"
            className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-xs text-[var(--text)] active:scale-95"
          >
            {pastedRecently ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <ClipboardPaste className="h-3.5 w-3.5 text-[var(--accent)]" />
            )}
            <span className="hidden sm:inline">{pastedRecently ? "Pasted" : "Paste"}</span>
          </button>

          <button
            type="button"
            onClick={onCopyOutput}
            aria-label="Copy selection or output"
            title="Copy selection or recent buffer"
            className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-xs text-[var(--text)] active:scale-95"
          >
            {copiedRecently ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{copiedRecently ? "Copied" : "Copy"}</span>
          </button>

          <button
            type="button"
            onClick={onOpenOutputReader}
            aria-label="Capture and save output"
            title="Capture current buffer to inspect, format JSON, or save to Library"
            className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-xs text-[var(--text)] active:scale-95"
          >
            <TextSelect className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">Outputs</span>
          </button>

          <div className="hidden items-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] sm:flex">
            <button
              type="button"
              onClick={() => onChangeFontSize(-1)}
              aria-label="Decrease font size"
              className="flex h-8 w-7 items-center justify-center text-[var(--dim)] hover:text-[var(--text)] active:scale-95"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="px-1 font-mono text-[11px] text-[var(--dim)]">{fontSize}</span>
            <button
              type="button"
              onClick={() => onChangeFontSize(1)}
              aria-label="Increase font size"
              className="flex h-8 w-7 items-center justify-center text-[var(--dim)] hover:text-[var(--text)] active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenQuickActions}
            aria-label="VM Shortcuts"
            title="Quick commands"
            className="flex h-8 items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-2 text-xs font-medium text-[var(--accent)] active:scale-95"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Shortcuts</span>
          </button>
        </div>
      </div>

      {/* Multi-session PTY tab strip (source of truth from vm-pty-daemon) */}
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-[var(--border)]/70 bg-[var(--bg)]/60 px-2 py-1">
        {sessions.map((s) => {
          const isActive = s.sessionId === activeSessionId;
          return (
            <div
              key={s.sessionId}
              className={`group flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                isActive
                  ? "border-[var(--accent)]/50 bg-[var(--surface-elevated)] text-[var(--text)]"
                  : "border-transparent bg-transparent text-[var(--dim)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSession(s.sessionId)}
                className="flex items-center gap-1.5 text-left"
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    s.alive ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                <span className="max-w-[110px] truncate">
                  {s.title}
                  {s.fgProcess && s.fgProcess !== "bash" ? ` (${s.fgProcess})` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onKillSession(s.sessionId);
                }}
                aria-label={`Close ${s.title}`}
                title="Close PTY session"
                className="ml-0.5 rounded p-0.5 text-[var(--dim)] hover:bg-red-500/20 hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onCreateSession}
          disabled={sessions.length >= 8}
          aria-label="New terminal"
          title={sessions.length >= 8 ? "Maximum limit of 8 terminals reached" : "Open new terminal tab"}
          className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--dim)] hover:border-[var(--accent)]/40 hover:text-[var(--text)] disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          <span>New</span>
        </button>
      </div>
    </header>
  );
}
