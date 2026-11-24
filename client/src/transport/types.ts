export interface PtySessionInfo {
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

export interface PtyReadChunk {
  dataBase64: string;
  nextCursor: number;
  truncated: boolean;
  alive: boolean;
  exitCode: number | null;
  cwd: string;
  fgProcess: string;
}

export interface PtyReadResult {
  chunks: Record<string, PtyReadChunk>;
  sessions: PtySessionInfo[];
}

export interface EnsureSessionRequest {
  sessionId?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  title?: string;
}

export interface SaveToLibraryRequest {
  filename: string;
  format: "txt" | "md" | "json";
  content: string;
  command: string;
}

export interface SaveToLibraryResult {
  savedPath: string;
}

export interface QuickActionPreset {
  id: string;
  label: string;
  category: "storage" | "connectors" | "cron" | "files" | "network";
  command: string;
  description: string;
  insertOnly?: boolean;
}

export interface ShellTransport {
  readonly modeLabel: string;
  listSessions(): Promise<PtySessionInfo[]>;
  ensureSession(req?: EnsureSessionRequest): Promise<PtySessionInfo>;
  sendInput(sessionId: string, data: string): void;
  readOnce(cursors: Record<string, number>, waitMs?: number): Promise<PtyReadResult>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  heartbeat(sessionIds?: string[]): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  saveToLibrary(req: SaveToLibraryRequest): Promise<SaveToLibraryResult>;
  getQuickPresets(): QuickActionPreset[];
}
