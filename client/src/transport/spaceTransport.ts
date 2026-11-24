import { bytesToBase64 } from "@hatch/space-sdk/client";
import { api } from "../api";
import type {
  EnsureSessionRequest,
  PtyReadResult,
  PtySessionInfo,
  QuickActionPreset,
  SaveToLibraryRequest,
  SaveToLibraryResult,
  ShellTransport,
} from "./types";

const PRESETS: QuickActionPreset[] = [
  {
    id: "remote-upload",
    label: "Upload to remote-storage",
    category: "storage",
    command: "/opt/hatch/bin/remote-storage upload-file --path ~/workspace/",
    description: "Generates a temporary public URL for a workspace file.",
    insertOnly: true,
  },
  {
    id: "authdc-list",
    label: "List credentials (authdc)",
    category: "connectors",
    command: "/opt/hatch/bin/authdc cred list",
    description: "Lists connectors and credentials registered in authd.sock.",
  },
  {
    id: "custom-connector-hash",
    label: "View connector hashes",
    category: "connectors",
    command: "cat ~/config/filesystem_watch_hashes.json | head -n 40",
    description: "Inspects registered SHA-256 hashes for skills and connectors.",
  },
  {
    id: "cron-list",
    label: "View crons / heartbeats",
    category: "cron",
    command: "crontab -l 2>/dev/null || ls -la ~/workspace/goals/",
    description: "Lists scheduled jobs and active goal directories.",
  },
  {
    id: "tar-compress",
    label: "Compress folder (.tar.gz)",
    category: "files",
    command: "tar -czf /tmp/backup.tar.gz -C ~/workspace .",
    description: "Packages workspace files for backup or download.",
    insertOnly: true,
  },
  {
    id: "curl-test",
    label: "Test endpoint with curl",
    category: "network",
    command: "curl -sSI https://httpbin.org/get | head -n 10",
    description: "Tests HTTP connectivity through the egress proxy.",
    insertOnly: true,
  },
];

const textEncoder = new TextEncoder();

export function encodeUtf8ToBase64(text: string): string {
  return bytesToBase64(textEncoder.encode(text));
}

export function decodeBase64ToBytes(base64: string): Uint8Array {
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const INPUT_BATCH_MS = 28;
const INPUT_MAX_BATCH_CHARS = 4096;

export class SpaceShellTransport implements ShellTransport {
  readonly modeLabel = "Persistent PTY (vm-pty-daemon)";

  private pendingInput = new Map<string, string>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private sendChains = new Map<string, Promise<void>>();

  async listSessions(): Promise<PtySessionInfo[]> {
    const res = await api.termList({});
    return res.sessions;
  }

  async ensureSession(req: EnsureSessionRequest = {}): Promise<PtySessionInfo> {
    const res = await api.termEnsureSession({
      sessionId: req.sessionId,
      cwd: req.cwd,
      cols: req.cols ?? 80,
      rows: req.rows ?? 24,
      title: req.title,
    });
    return res.session;
  }

  sendInput(sessionId: string, data: string): void {
    if (!data) return;
    const prev = this.pendingInput.get(sessionId) ?? "";
    const next = prev + data;
    this.pendingInput.set(sessionId, next);

    if (next.length >= INPUT_MAX_BATCH_CHARS) {
      this.flushInput(sessionId);
      return;
    }

    if (!this.flushTimers.has(sessionId)) {
      const timer = setTimeout(() => {
        this.flushInput(sessionId);
      }, INPUT_BATCH_MS);
      this.flushTimers.set(sessionId, timer);
    }
  }

  private flushInput(sessionId: string): void {
    const timer = this.flushTimers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }

    const payload = this.pendingInput.get(sessionId);
    if (!payload) return;
    this.pendingInput.delete(sessionId);

    const encoded = encodeUtf8ToBase64(payload);
    const prevChain = this.sendChains.get(sessionId) ?? Promise.resolve();
    const nextChain = prevChain
      .catch(() => {})
      .then(async () => {
        await api.termInput({ sessionId, dataBase64: encoded });
      })
      .catch(() => {
        // Transport errors are surfaced via the readLoop status indicator.
      });
    this.sendChains.set(sessionId, nextChain);
  }

  async readOnce(
    cursors: Record<string, number>,
    waitMs = 18000,
  ): Promise<PtyReadResult> {
    return api.termRead({ cursors, waitMs });
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    await api.termResize({ sessionId, cols, rows });
  }

  async heartbeat(sessionIds: string[] = []): Promise<void> {
    await api.termHeartbeat({ sessionIds });
  }

  async killSession(sessionId: string): Promise<void> {
    this.pendingInput.delete(sessionId);
    const timer = this.flushTimers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }
    this.sendChains.delete(sessionId);
    await api.termKill({ sessionId });
  }

  async saveToLibrary(req: SaveToLibraryRequest): Promise<SaveToLibraryResult> {
    return api.saveToLibrary({
      filename: req.filename,
      format: req.format,
      content: req.content,
    });
  }

  getQuickPresets(): QuickActionPreset[] {
    return PRESETS;
  }
}
