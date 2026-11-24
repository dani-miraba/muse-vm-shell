import {
  definePrivilegedContracts,
  definePrivilegedHandlers,
  z,
} from "@hatch/space-sdk";
import { existsSync, mkdirSync } from "node:fs";
import * as net from "node:net";
import { dirname } from "node:path";

export const privileged = definePrivilegedContracts({
  termList: {
    request: z.object({}),
    response: z.object({
      sessions: z.array(
        z.object({
          sessionId: z.string(),
          title: z.string(),
          cwd: z.string(),
          fgProcess: z.string(),
          alive: z.boolean(),
          exitCode: z.number().nullable(),
          createdAtMs: z.number(),
          cursor: z.number(),
          cols: z.number(),
          rows: z.number(),
        }),
      ),
    }),
    timeoutMs: 5000,
  },
  termEnsureSession: {
    request: z.object({
      sessionId: z.string().min(1).max(64).optional(),
      cwd: z.string().optional(),
      cols: z.number().int().min(10).max(500).default(80),
      rows: z.number().int().min(5).max(200).default(24),
      title: z.string().max(32).optional(),
    }),
    response: z.object({
      session: z.object({
        sessionId: z.string(),
        title: z.string(),
        cwd: z.string(),
        fgProcess: z.string(),
        alive: z.boolean(),
        exitCode: z.number().nullable(),
        createdAtMs: z.number(),
        cursor: z.number(),
        cols: z.number(),
        rows: z.number(),
      }),
    }),
    timeoutMs: 8000,
  },
  termInput: {
    request: z.object({
      sessionId: z.string().min(1).max(64),
      dataBase64: z.string(),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    timeoutMs: 5000,
  },
  termRead: {
    request: z.object({
      cursors: z.record(z.string(), z.number().int().nonnegative()),
      waitMs: z.number().int().min(0).max(20000).default(18000),
    }),
    response: z.object({
      chunks: z.record(
        z.string(),
        z.object({
          dataBase64: z.string(),
          nextCursor: z.number(),
          truncated: z.boolean(),
          alive: z.boolean(),
          exitCode: z.number().nullable(),
          cwd: z.string(),
          fgProcess: z.string(),
        }),
      ),
      sessions: z.array(
        z.object({
          sessionId: z.string(),
          title: z.string(),
          cwd: z.string(),
          fgProcess: z.string(),
          alive: z.boolean(),
          exitCode: z.number().nullable(),
          createdAtMs: z.number(),
          cursor: z.number(),
          cols: z.number(),
          rows: z.number(),
        }),
      ),
    }),
    timeoutMs: 25000,
  },
  termResize: {
    request: z.object({
      sessionId: z.string().min(1).max(64),
      cols: z.number().int().min(10).max(500),
      rows: z.number().int().min(5).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    timeoutMs: 5000,
  },
  termHeartbeat: {
    request: z.object({
      sessionIds: z.array(z.string().min(1).max(64)).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    timeoutMs: 5000,
  },
  termKill: {
    request: z.object({
      sessionId: z.string().min(1).max(64),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    timeoutMs: 8000,
  },
  saveToLibrary: {
    request: z.object({
      filename: z.string().min(1),
      format: z.enum(["txt", "md", "json"]),
      content: z.string(),
    }),
    response: z.object({
      savedPath: z.string(),
    }),
    timeoutMs: 5000,
  },
});

interface DaemonSessionInfo {
  sessionId: string;
  title: string;
  cwd: string;
  fgProcess: string;
  alive: boolean;
  exitCode: number | null;
  createdAtMs: number;
  cursor: number;
  cols: number;
  rows: number;
}

interface DaemonReadChunk {
  dataBase64: string;
  nextCursor: number;
  truncated: boolean;
  alive: boolean;
  exitCode: number | null;
  cwd: string;
  fgProcess: string;
}

interface DaemonResponse {
  ok: boolean;
  error?: string;
  pid?: number;
  session?: DaemonSessionInfo;
  sessions?: DaemonSessionInfo[];
  chunks?: Record<string, DaemonReadChunk>;
}

function getSocketPath(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  return `/tmp/vm-pty-${uid}/daemon.sock`;
}

function resolveDaemonBinary(): string {
  const home = process.env.HOME || "/home/hatch";
  const candidates = [
    process.env.VM_PTY_DAEMON_BIN,
    `${home}/workspace/ts-spaces/vm-shell/bin/vm-pty-daemon`,
    `${process.cwd()}/bin/vm-pty-daemon`,
    `${home}/.local/bin/vm-pty-daemon`,
    "/usr/local/bin/vm-pty-daemon",
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(
    `No se encontró el binario vm-pty-daemon. Compílalo y colócalo en ${home}/workspace/ts-spaces/vm-shell/bin/vm-pty-daemon`,
  );
}

function sendSocketRequest(
  socketPath: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let settled = false;
    let raw = "";

    const finish = (err: Error | null, res?: DaemonResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(res!);
    };

    const timer = setTimeout(() => {
      finish(new Error(`Timeout comunicando con vm-pty-daemon (${timeoutMs}ms)`));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });

    socket.on("data", (chunk: Buffer | string) => {
      raw += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const nl = raw.indexOf("\n");
      if (nl !== -1) {
        const line = raw.slice(0, nl).trim();
        try {
          const parsed = JSON.parse(line) as DaemonResponse;
          finish(null, parsed);
        } catch (err) {
          finish(new Error(`Respuesta JSON inválida del demonio: ${String(err)}`));
        }
      }
    });

    socket.on("end", () => {
      if (settled) return;
      const line = raw.trim();
      if (!line) {
        finish(new Error("El demonio cerró la conexión sin respuesta"));
        return;
      }
      try {
        const parsed = JSON.parse(line) as DaemonResponse;
        finish(null, parsed);
      } catch (err) {
        finish(new Error(`Respuesta JSON inválida del demonio: ${String(err)}`));
      }
    });

    socket.on("error", (err) => {
      finish(err);
    });
  });
}

function buildEnrichedPath(): string {
  const home = process.env.HOME || "/home/hatch";
  const bunDir = process.execPath ? dirname(process.execPath) : "";
  const inherited = (process.env.PATH || "").split(":").filter(Boolean);
  const candidates = [
    bunDir,
    "/opt/hatch/bin",
    "/opt/hatch-image/bin",
    `${home}/.local/bin`,
    `${home}/.bun/bin`,
    `${home}/.cargo/bin`,
    ...inherited,
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ];

  const seen = new Set<string>();
  const finalEntries: string[] = [];
  for (const dir of candidates) {
    if (!dir || seen.has(dir)) continue;
    if (
      dir.startsWith("/usr/") ||
      dir === "/bin" ||
      dir === "/sbin" ||
      existsSync(dir)
    ) {
      seen.add(dir);
      finalEntries.push(dir);
    }
  }
  return finalEntries.join(":");
}

async function ensureDaemonRunning(): Promise<string> {
  const socketPath = getSocketPath();
  if (existsSync(socketPath)) {
    try {
      const ping = await sendSocketRequest(socketPath, { op: "ping" }, 800);
      if (ping.ok) return socketPath;
    } catch {
      // Stale socket or daemon not accepting; fall through to spawn.
    }
  }

  const daemonBin = resolveDaemonBinary();
  const proc = Bun.spawn([daemonBin, "--daemonize", "--socket", socketPath], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      PATH: buildEnrichedPath(),
    },
  });
  await proc.exited;

  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      try {
        const ping = await sendSocketRequest(socketPath, { op: "ping" }, 500);
        if (ping.ok) return socketPath;
      } catch {
        // Wait for bind
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  const stderrText = await new Response(proc.stderr).text().catch(() => "");
  throw new Error(
    `vm-pty-daemon no respondió en ${socketPath}${stderrText ? `: ${stderrText.trim()}` : ""}`,
  );
}

async function requestDaemon(
  payload: Record<string, unknown>,
  timeoutMs: number,
  autoStart = false,
): Promise<DaemonResponse> {
  const socketPath = autoStart ? await ensureDaemonRunning() : getSocketPath();
  const res = await sendSocketRequest(socketPath, payload, timeoutMs);
  if (!res.ok) {
    throw new Error(res.error || "Error desconocido en vm-pty-daemon");
  }
  return res;
}

export const privilegedHandlers = definePrivilegedHandlers(privileged, {
  async termList() {
    const socketPath = getSocketPath();
    if (!existsSync(socketPath)) {
      return { sessions: [] };
    }
    try {
      const res = await sendSocketRequest(socketPath, { op: "list" }, 4000);
      if (!res.ok) {
        return { sessions: [] };
      }
      return { sessions: res.sessions ?? [] };
    } catch {
      return { sessions: [] };
    }
  },

  async termEnsureSession({ sessionId, cwd, cols, rows, title }) {
    const res = await requestDaemon(
      {
        op: "ensure",
        ...(sessionId ? { sessionId } : {}),
        ...(cwd ? { cwd } : {}),
        cols,
        rows,
        ...(title ? { title } : {}),
      },
      6500,
      true,
    );
    if (!res.session) {
      throw new Error("vm-pty-daemon no devolvió metadatos de sesión");
    }
    return { session: res.session };
  },

  async termInput({ sessionId, dataBase64 }) {
    await requestDaemon(
      {
        op: "input",
        sessionId,
        dataBase64,
      },
      4000,
      false,
    );
    return { ok: true };
  },

  async termRead({ cursors, waitMs }) {
    const clampedWait = Math.min(20000, Math.max(0, waitMs));
    const res = await requestDaemon(
      {
        op: "read",
        cursors,
        waitMs: clampedWait,
      },
      clampedWait + 3500,
      false,
    );
    return {
      chunks: res.chunks ?? {},
      sessions: res.sessions ?? [],
    };
  },

  async termResize({ sessionId, cols, rows }) {
    await requestDaemon(
      {
        op: "resize",
        sessionId,
        cols,
        rows,
      },
      4000,
      false,
    );
    return { ok: true };
  },

  async termHeartbeat({ sessionIds }) {
    const socketPath = getSocketPath();
    if (!existsSync(socketPath)) {
      return { ok: false };
    }
    try {
      const res = await sendSocketRequest(
        socketPath,
        { op: "heartbeat", sessionIds },
        3500,
      );
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  },

  async termKill({ sessionId }) {
    const socketPath = getSocketPath();
    if (!existsSync(socketPath)) {
      return { ok: true };
    }
    try {
      await sendSocketRequest(socketPath, { op: "kill", sessionId }, 6500);
    } catch {
      // Daemon already exited or session gone
    }
    return { ok: true };
  },

  async saveToLibrary({ filename, format, content }) {
    const home = process.env.HOME || "/home/hatch";
    const libraryDir = `${home}/workspace/your_files`;
    mkdirSync(libraryDir, { recursive: true });

    const safeBase = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "output";
    const ext = `.${format}`;
    const finalName = safeBase.endsWith(ext) ? safeBase : `${safeBase}${ext}`;
    const fullPath = `${libraryDir}/${finalName}`;

    await Bun.write(fullPath, content);
    return { savedPath: fullPath };
  },
});
