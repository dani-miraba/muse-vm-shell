import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExtraKeysBar } from "./components/ExtraKeysBar";
import { HeaderBar } from "./components/HeaderBar";
import { OutputReaderSheet, type OutputEntry } from "./components/OutputReaderSheet";
import { PasteSheet } from "./components/PasteSheet";
import { QuickActionsSheet } from "./components/QuickActionsSheet";
import { TerminalView, type TerminalHandle } from "./components/TerminalView";
import { useVisualViewport } from "./hooks/useVisualViewport";
import { decodeBase64ToBytes, SpaceShellTransport } from "./transport/spaceTransport";
import type { PtySessionInfo, QuickActionPreset } from "./transport/types";
import { copyTextToClipboard, readTextFromClipboard } from "./utils/clipboard";

export function App() {
  const transport = useMemo(() => new SpaceShellTransport(), []);
  const vv = useVisualViewport();
  const termRef = useRef<TerminalHandle>(null);

  const [sessions, setSessions] = useState<PtySessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const [fontSize, setFontSize] = useState(13);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [outputs, setOutputs] = useState<OutputEntry[]>([]);
  const [copiedRecently, setCopiedRecently] = useState(false);
  const [pastedRecently, setPastedRecently] = useState(false);

  const cursorsRef = useRef<Record<string, number>>({});
  const nextSnapshotIdRef = useRef(1);
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;

  const activeSession = useMemo(
    () => sessions.find((s) => s.sessionId === activeSessionId) ?? sessions[0] ?? null,
    [sessions, activeSessionId],
  );

  // Bootstrap from vm-pty-daemon (single source of truth) + multiplexed long-polling loop
  useEffect(() => {
    let disposed = false;

    const bootstrapAndLoop = async () => {
      setConnectionState("connecting");
      let backoffMs = 500;

      // 1. Discover existing live sessions or spawn the first one
      while (!disposed) {
        try {
          const existing = await transport.listSessions();
          const aliveExisting = existing.filter((s) => s.alive);

          if (aliveExisting.length > 0) {
            for (const s of aliveExisting) {
              // Start at 0 so the daemon's 1 MiB ring buffer replays recent screen state
              if (cursorsRef.current[s.sessionId] === undefined) {
                cursorsRef.current[s.sessionId] = 0;
              }
            }
            setSessions(aliveExisting);
            setActiveSessionId((prev) =>
              prev && aliveExisting.some((s) => s.sessionId === prev)
                ? prev
                : aliveExisting[0]!.sessionId,
            );
          } else {
            const dims = termRef.current?.getDimensions() ?? { cols: 80, rows: 24 };
            const created = await transport.ensureSession({
              cols: dims.cols,
              rows: dims.rows,
            });
            cursorsRef.current[created.sessionId] = 0;
            setSessions([created]);
            setActiveSessionId(created.sessionId);
          }

          setConnectionState("connected");
          backoffMs = 500;
          break;
        } catch {
          if (disposed) return;
          setConnectionState("reconnecting");
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(4000, backoffMs * 2);
        }
      }

      // 2. Single multiplexed long-polling loop across all live sessions
      while (!disposed) {
        const currentCursors = { ...cursorsRef.current };
        if (Object.keys(currentCursors).length === 0) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }

        try {
          const res = await transport.readOnce(currentCursors, 18000);
          if (disposed) return;
          setConnectionState("connected");
          backoffMs = 500;

          // Deliver decoded raw PTY bytes to each xterm.js instance
          for (const [sid, chunk] of Object.entries(res.chunks)) {
            cursorsRef.current[sid] = chunk.nextCursor;
            if (chunk.truncated) {
              termRef.current?.writeNotice(
                sid,
                "\r\n\x1b[33m[output truncated by ring buffer limit]\x1b[0m\r\n",
              );
            }
            if (chunk.dataBase64) {
              const bytes = decodeBase64ToBytes(chunk.dataBase64);
              termRef.current?.writeBytes(sid, bytes);
            }
          }

          // Reconcile session list with daemon's live state
          const daemonSessions = res.sessions;
          const liveIds = new Set(daemonSessions.map((s) => s.sessionId));
          for (const sid of Object.keys(cursorsRef.current)) {
            if (!liveIds.has(sid)) {
              delete cursorsRef.current[sid];
            }
          }
          for (const s of daemonSessions) {
            if (cursorsRef.current[s.sessionId] === undefined) {
              cursorsRef.current[s.sessionId] = 0;
            }
          }

          setSessions(daemonSessions);
          setActiveSessionId((prev) => {
            if (prev && liveIds.has(prev)) return prev;
            return daemonSessions[0]?.sessionId ?? null;
          });
        } catch {
          if (disposed) return;
          setConnectionState("reconnecting");
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(4000, backoffMs * 2);
        }
      }
    };

    void bootstrapAndLoop();

    return () => {
      disposed = true;
    };
  }, [transport]);

  const handleCreateSession = useCallback(async () => {
    try {
      const dims = termRef.current?.getDimensions() ?? { cols: 80, rows: 24 };
      const created = await transport.ensureSession({
        cwd: activeSession?.cwd,
        cols: dims.cols,
        rows: dims.rows,
      });
      cursorsRef.current[created.sessionId] = 0;
      setSessions((prev) => {
        if (prev.some((s) => s.sessionId === created.sessionId)) return prev;
        return [...prev, created];
      });
      setActiveSessionId(created.sessionId);
    } catch {
      // Daemon error or max sessions reached
    }
  }, [activeSession?.cwd, transport]);

  const handleKillSession = useCallback(
    async (sessionId: string) => {
      delete cursorsRef.current[sessionId];
      setSessions((prev) => {
        const next = prev.filter((s) => s.sessionId !== sessionId);
        if (activeSessionIdRef.current === sessionId) {
          setActiveSessionId(next[0]?.sessionId ?? null);
        }
        return next;
      });
      try {
        await transport.killSession(sessionId);
      } catch {
        // Ignore if already dead
      }
    },
    [transport],
  );

  const handleChangeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => Math.min(22, Math.max(10, prev + delta)));
  }, []);

  const captureSnapshotToReader = useCallback(() => {
    const text = termRef.current?.getSelectedOrRecentBuffer(250) ?? "";
    if (text) {
      const entry: OutputEntry = {
        id: nextSnapshotIdRef.current++,
        command: activeSession
          ? `${activeSession.title} (${activeSession.fgProcess || "bash"})`
          : "terminal",
        cwd: (activeSession?.cwd || "~").replace(/^\/home\/hatch/, "~"),
        output: text,
        exitCode: activeSession?.exitCode ?? 0,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      setOutputs((prev) => [...prev.slice(-19), entry]);
    }
    setReaderOpen(true);
  }, [activeSession]);

  const handleCopyOutput = useCallback(async () => {
    const text = termRef.current?.getSelectedOrRecentBuffer(200) ?? "";
    if (!text) {
      captureSnapshotToReader();
      return;
    }
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedRecently(true);
      setTimeout(() => setCopiedRecently(false), 1600);
    } else {
      captureSnapshotToReader();
    }
  }, [captureSnapshotToReader]);

  const handlePasteInput = useCallback(async () => {
    const clip = await readTextFromClipboard();
    if (clip) {
      termRef.current?.pasteText(clip);
      setPastedRecently(true);
      setTimeout(() => setPastedRecently(false), 1400);
    } else {
      setPasteOpen(true);
    }
  }, []);

  const handlePasteFromSheet = useCallback((text: string, submitEnter: boolean) => {
    termRef.current?.pasteText(text);
    if (submitEnter) {
      termRef.current?.sendRaw("\r");
    }
    setPastedRecently(true);
    setTimeout(() => setPastedRecently(false), 1400);
  }, []);

  const handleSelectPreset = useCallback((preset: QuickActionPreset) => {
    if (preset.insertOnly) {
      termRef.current?.sendRaw(preset.command);
    } else {
      termRef.current?.sendRaw(`${preset.command}\r`);
    }
  }, []);

  return (
    <div
      className="fixed left-0 top-0 flex w-full flex-col overflow-hidden bg-[var(--bg)]"
      style={{
        height: `${vv.height}px`,
        transform: `translate3d(${vv.offsetLeft}px, ${vv.offsetTop}px, 0)`,
      }}
    >
      <SafeAreaTopScrim />

      <HeaderBar
        cwd={activeSession?.cwd ?? "/home/hatch/workspace"}
        fgProcess={activeSession?.fgProcess ?? "bash"}
        connectionState={connectionState}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onCreateSession={() => void handleCreateSession()}
        onKillSession={(sid) => void handleKillSession(sid)}
        fontSize={fontSize}
        onChangeFontSize={handleChangeFontSize}
        onCopyOutput={() => void handleCopyOutput()}
        copiedRecently={copiedRecently}
        onPasteInput={() => void handlePasteInput()}
        pastedRecently={pastedRecently}
        onOpenOutputReader={captureSnapshotToReader}
        onOpenQuickActions={() => setQuickOpen(true)}
      />

      {sessions.length === 0 && connectionState === "connected" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--bg)] p-6 text-center">
          <p className="font-mono text-xs text-[var(--dim)]">
            No active PTY sessions on the VM.
          </p>
          <button
            type="button"
            onClick={() => void handleCreateSession()}
            className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-3 py-1.5 font-mono text-xs font-medium text-[var(--accent)] active:scale-95"
          >
            + Open new terminal
          </button>
        </div>
      ) : (
        <TerminalView
          ref={termRef}
          transport={transport}
          sessions={sessions}
          activeSessionId={activeSessionId}
          fontSize={fontSize}
          onPinchFontSize={handleChangeFontSize}
          viewportHeight={vv.height}
          ctrlActive={ctrlActive}
          onConsumeCtrl={() => setCtrlActive(false)}
        />
      )}

      <ExtraKeysBar
        ctrlActive={ctrlActive}
        onToggleCtrl={() => setCtrlActive((v) => !v)}
        onSendSequence={(seq) => termRef.current?.sendRaw(seq)}
        onSendSpecial={(key) => termRef.current?.sendSpecial(key)}
        onPasteInput={() => void handlePasteInput()}
        isKeyboardOpen={vv.isKeyboardOpen}
      />

      <PasteSheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onPaste={handlePasteFromSheet}
      />

      <OutputReaderSheet
        open={readerOpen}
        entries={outputs}
        onClose={() => setReaderOpen(false)}
        onSaveToLibrary={(req) => transport.saveToLibrary(req)}
      />

      <QuickActionsSheet
        open={quickOpen}
        presets={transport.getQuickPresets()}
        onClose={() => setQuickOpen(false)}
        onSelectPreset={handleSelectPreset}
      />
    </div>
  );
}
