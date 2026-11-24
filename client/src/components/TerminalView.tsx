import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PtySessionInfo, ShellTransport } from "../transport/types";

export type SpecialKey =
  | "ESC"
  | "TAB"
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT"
  | "CTRL_C"
  | "CTRL_D"
  | "CTRL_L";

export interface TerminalHandle {
  writeBytes: (sessionId: string, bytes: Uint8Array) => void;
  writeNotice: (sessionId: string, text: string) => void;
  sendRaw: (data: string) => void;
  pasteText: (text: string) => void;
  sendSpecial: (key: SpecialKey) => void;
  getSelectedOrRecentBuffer: (maxLines?: number) => string;
  getDimensions: () => { cols: number; rows: number };
  focus: () => void;
}

export interface TerminalViewProps {
  transport: ShellTransport;
  sessions: PtySessionInfo[];
  activeSessionId: string | null;
  fontSize: number;
  onPinchFontSize: (delta: number) => void;
  viewportHeight: number;
  ctrlActive: boolean;
  onConsumeCtrl: () => void;
}

interface SessionInstance {
  term: Terminal;
  fit: FitAddon;
  wrapper: HTMLDivElement;
  resizeTimer: ReturnType<typeof setTimeout> | null;
  lastCols: number;
  lastRows: number;
}

const SPECIAL_SEQUENCES: Record<SpecialKey, string> = {
  ESC: "\x1b",
  TAB: "\t",
  UP: "\x1b[A",
  DOWN: "\x1b[B",
  LEFT: "\x1b[D",
  RIGHT: "\x1b[C",
  CTRL_C: "\x03",
  CTRL_D: "\x04",
  CTRL_L: "\x0c",
};

const XTERM_THEME = {
  background: "#0b0d10",
  foreground: "#e6edf3",
  cursor: "#2dd4bf",
  cursorAccent: "#0b0d10",
  selectionBackground: "rgba(45, 212, 191, 0.28)",
  black: "#161b22",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#2dd4bf",
  white: "#e6edf3",
  brightBlack: "#6e7681",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#5eead4",
  brightWhite: "#ffffff",
};

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  function TerminalView(
    {
      transport,
      sessions,
      activeSessionId,
      fontSize,
      onPinchFontSize,
      viewportHeight,
      ctrlActive,
      onConsumeCtrl,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const instancesRef = useRef<Map<string, SessionInstance>>(new Map());
    const pendingWritesRef = useRef<Map<string, Uint8Array[]>>(new Map());

    const activeIdRef = useRef<string | null>(activeSessionId);
    const ctrlActiveRef = useRef<boolean>(ctrlActive);
    const onConsumeCtrlRef = useRef(onConsumeCtrl);
    const fontSizeRef = useRef(fontSize);

    activeIdRef.current = activeSessionId;
    ctrlActiveRef.current = ctrlActive;
    onConsumeCtrlRef.current = onConsumeCtrl;
    fontSizeRef.current = fontSize;

    const scheduleFit = (inst: SessionInstance, sid: string) => {
      try {
        inst.fit.fit();
      } catch {
        return;
      }
      const cols = inst.term.cols;
      const rows = inst.term.rows;
      if (cols === inst.lastCols && rows === inst.lastRows) return;
      inst.lastCols = cols;
      inst.lastRows = rows;

      if (inst.resizeTimer) clearTimeout(inst.resizeTimer);
      inst.resizeTimer = setTimeout(() => {
        void transport.resize(sid, cols, rows).catch(() => {});
      }, 80);
    };

    // Reconcile xterm.js instances with live daemon sessions
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const liveIds = new Set(sessions.map((s) => s.sessionId));

      // Remove disposed sessions
      for (const [sid, inst] of instancesRef.current.entries()) {
        if (!liveIds.has(sid)) {
          if (inst.resizeTimer) clearTimeout(inst.resizeTimer);
          inst.term.dispose();
          inst.wrapper.remove();
          instancesRef.current.delete(sid);
          pendingWritesRef.current.delete(sid);
        }
      }

      // Create instances for new sessions
      for (const s of sessions) {
        if (instancesRef.current.has(s.sessionId)) continue;

        const wrapper = document.createElement("div");
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";
        wrapper.style.display = s.sessionId === activeIdRef.current ? "block" : "none";
        host.appendChild(wrapper);

        const term = new Terminal({
          fontSize: fontSizeRef.current,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          cursorBlink: true,
          cursorStyle: "block",
          convertEol: false,
          scrollback: 3000,
          allowProposedApi: false,
          theme: XTERM_THEME,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(wrapper);

        const sid = s.sessionId;
        term.onData((data) => {
          if (ctrlActiveRef.current && data.length === 1) {
            const code = data.toLowerCase().charCodeAt(0);
            onConsumeCtrlRef.current();
            if (code >= 97 && code <= 122) {
              transport.sendInput(sid, String.fromCharCode(code - 96));
              return;
            }
          }
          transport.sendInput(sid, data);
        });

        const inst: SessionInstance = {
          term,
          fit,
          wrapper,
          resizeTimer: null,
          lastCols: s.cols,
          lastRows: s.rows,
        };
        instancesRef.current.set(sid, inst);

        // Flush any buffered bytes received before this Terminal mounted
        const queued = pendingWritesRef.current.get(sid);
        if (queued && queued.length > 0) {
          for (const chunk of queued) {
            term.write(chunk);
          }
          pendingWritesRef.current.delete(sid);
        }

        if (sid === activeIdRef.current) {
          requestAnimationFrame(() => {
            scheduleFit(inst, sid);
            term.focus();
          });
        }
      }
    }, [sessions, transport]);

    // Toggle active terminal visibility and refit
    useEffect(() => {
      for (const [sid, inst] of instancesRef.current.entries()) {
        const isActive = sid === activeSessionId;
        inst.wrapper.style.display = isActive ? "block" : "none";
        if (isActive) {
          requestAnimationFrame(() => {
            scheduleFit(inst, sid);
            inst.term.focus();
          });
        }
      }
    }, [activeSessionId, viewportHeight]);

    // Update fontSize across all terminals
    useEffect(() => {
      for (const [sid, inst] of instancesRef.current.entries()) {
        inst.term.options.fontSize = fontSize;
        if (sid === activeIdRef.current) {
          requestAnimationFrame(() => scheduleFit(inst, sid));
        }
      }
    }, [fontSize]);

    // Observe container resize
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const ro = new ResizeObserver(() => {
        const sid = activeIdRef.current;
        if (!sid) return;
        const inst = instancesRef.current.get(sid);
        if (inst) {
          scheduleFit(inst, sid);
        }
      });
      ro.observe(host);
      return () => ro.disconnect();
    }, []);

    // Dispose all terminals on unmount
    useEffect(() => {
      return () => {
        for (const inst of instancesRef.current.values()) {
          if (inst.resizeTimer) clearTimeout(inst.resizeTimer);
          inst.term.dispose();
          inst.wrapper.remove();
        }
        instancesRef.current.clear();
      };
    }, []);

    // Two-finger pinch-to-zoom font size on touchscreens
    useEffect(() => {
      const el = hostRef.current;
      if (!el) return;
      let pinchStartDist = 0;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const [a, b] = [e.touches[0]!, e.touches[1]!];
          pinchStartDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && pinchStartDist > 0) {
          const [a, b] = [e.touches[0]!, e.touches[1]!];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (Math.abs(dist - pinchStartDist) > 28) {
            onPinchFontSize(dist > pinchStartDist ? 1 : -1);
            pinchStartDist = dist;
          }
        }
      };
      const onTouchEnd = () => {
        pinchStartDist = 0;
      };

      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchmove", onTouchMove, { passive: true });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      return () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
      };
    }, [onPinchFontSize]);

    useImperativeHandle(
      ref,
      () => ({
        writeBytes: (sessionId: string, bytes: Uint8Array) => {
          if (bytes.length === 0) return;
          const inst = instancesRef.current.get(sessionId);
          if (inst) {
            inst.term.write(bytes);
          } else {
            const list = pendingWritesRef.current.get(sessionId) ?? [];
            list.push(bytes);
            pendingWritesRef.current.set(sessionId, list);
          }
        },
        writeNotice: (sessionId: string, text: string) => {
          const inst = instancesRef.current.get(sessionId);
          if (inst) {
            inst.term.write(text);
          }
        },
        sendRaw: (data: string) => {
          const sid = activeIdRef.current;
          if (!sid || !data) return;
          transport.sendInput(sid, data);
          instancesRef.current.get(sid)?.term.focus();
        },
        pasteText: (text: string) => {
          const sid = activeIdRef.current;
          if (!sid || !text) return;
          const inst = instancesRef.current.get(sid);
          if (inst) {
            inst.term.paste(text);
            inst.term.focus();
          } else {
            transport.sendInput(sid, text);
          }
        },
        sendSpecial: (key: SpecialKey) => {
          const sid = activeIdRef.current;
          if (!sid) return;
          transport.sendInput(sid, SPECIAL_SEQUENCES[key]);
          instancesRef.current.get(sid)?.term.focus();
        },
        getSelectedOrRecentBuffer: (maxLines = 250) => {
          const sid = activeIdRef.current;
          if (!sid) return "";
          const inst = instancesRef.current.get(sid);
          if (!inst) return "";

          const sel = inst.term.getSelection().trim();
          if (sel) return sel;

          const buf = inst.term.buffer.active;
          const total = buf.length;
          const start = Math.max(0, total - maxLines);
          const lines: string[] = [];
          for (let i = start; i < total; i++) {
            const line = buf.getLine(i);
            if (line) {
              lines.push(line.translateToString(true));
            }
          }
          while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
            lines.pop();
          }
          return lines.join("\n").trim();
        },
        getDimensions: () => {
          const sid = activeIdRef.current;
          if (sid) {
            const inst = instancesRef.current.get(sid);
            if (inst) {
              return { cols: inst.term.cols, rows: inst.term.rows };
            }
          }
          const host = hostRef.current;
          if (host) {
            const cols = Math.max(40, Math.floor((host.clientWidth - 20) / (fontSizeRef.current * 0.62)));
            const rows = Math.max(12, Math.floor((host.clientHeight - 16) / (fontSizeRef.current * 1.35)));
            return { cols: Math.min(240, cols), rows: Math.min(80, rows) };
          }
          return { cols: 80, rows: 24 };
        },
        focus: () => {
          const sid = activeIdRef.current;
          if (!sid) return;
          instancesRef.current.get(sid)?.term.focus();
        },
      }),
      [transport],
    );

    return (
      <div
        ref={hostRef}
        onClick={() => {
          const sid = activeIdRef.current;
          if (sid) instancesRef.current.get(sid)?.term.focus();
        }}
        className="relative min-h-0 flex-1 overflow-hidden bg-[var(--bg)]"
      />
    );
  },
);
