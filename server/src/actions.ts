import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { privileged } from "@space/privileged";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const SessionInfoSchema = z.object({
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
});

const ReadChunkSchema = z.object({
  dataBase64: z.string(),
  nextCursor: z.number(),
  truncated: z.boolean(),
  alive: z.boolean(),
  exitCode: z.number().nullable(),
  cwd: z.string(),
  fgProcess: z.string(),
});

export const Actions = {
  termList: defineAction({
    description: "Lists all live PTY sessions currently managed by the master vm-pty-daemon.",
    privileged: [privileged.termList],
    request: z.object({}),
    response: z.object({
      sessions: z.array(SessionInfoSchema),
    }),
    async handler(ctx) {
      return ctx.executePrivileged(privileged.termList, {});
    },
  }),

  termEnsureSession: defineAction({
    description: "Attaches to an existing live PTY session or creates a new one in vm-pty-daemon.",
    privileged: [privileged.termEnsureSession],
    request: z.object({
      sessionId: z.string().min(1).max(64).optional(),
      cwd: z.string().optional(),
      cols: z.number().int().min(10).max(500).default(80),
      rows: z.number().int().min(5).max(200).default(24),
      title: z.string().max(32).optional(),
    }),
    response: z.object({
      session: SessionInfoSchema,
    }),
    async handler(ctx, args) {
      const res = await ctx.executePrivileged(privileged.termEnsureSession, args);
      try {
        const db = ctx.db<typeof schema>();
        await db
          .insert(schema.terminalSessions)
          .values({
            sessionId: res.session.sessionId,
            title: res.session.title,
            lastCwd: res.session.cwd,
            cols: res.session.cols,
            rows: res.session.rows,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.terminalSessions.sessionId,
            set: {
              title: res.session.title,
              lastCwd: res.session.cwd,
              cols: res.session.cols,
              rows: res.session.rows,
              updatedAt: new Date(),
            },
          });
      } catch {
        // Non-fatal: master daemon memory is the source of truth
      }
      return res;
    },
  }),

  termInput: defineAction({
    description: "Writes raw UTF-8/ANSI bytes (base64 encoded) directly to a PTY session.",
    privileged: [privileged.termInput],
    request: z.object({
      sessionId: z.string().min(1).max(64),
      dataBase64: z.string(),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    async handler(ctx, args) {
      return ctx.executePrivileged(privileged.termInput, args);
    },
  }),

  termRead: defineAction({
    description: "Multiplexed long-polling read across active PTY sessions from vm-pty-daemon.",
    privileged: [privileged.termRead],
    request: z.object({
      cursors: z.record(z.string(), z.number().int().nonnegative()),
      waitMs: z.number().int().min(0).max(20000).default(18000),
    }),
    response: z.object({
      chunks: z.record(z.string(), ReadChunkSchema),
      sessions: z.array(SessionInfoSchema),
    }),
    async handler(ctx, args) {
      return ctx.executePrivileged(privileged.termRead, args);
    },
  }),

  termResize: defineAction({
    description: "Resizes a PTY session window dimensions (ioctl TIOCSWINSZ).",
    privileged: [privileged.termResize],
    request: z.object({
      sessionId: z.string().min(1).max(64),
      cols: z.number().int().min(10).max(500),
      rows: z.number().int().min(5).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    async handler(ctx, args) {
      const res = await ctx.executePrivileged(privileged.termResize, args);
      try {
        const db = ctx.db<typeof schema>();
        await db
          .update(schema.terminalSessions)
          .set({ cols: args.cols, rows: args.rows, updatedAt: new Date() })
          .where(eq(schema.terminalSessions.sessionId, args.sessionId));
      } catch {
        // Non-fatal
      }
      return res;
    },
  }),

  termHeartbeat: defineAction({
    description: "Refreshes the client lease on active PTY sessions.",
    privileged: [privileged.termHeartbeat],
    request: z.object({
      sessionIds: z.array(z.string().min(1).max(64)).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    async handler(ctx, args) {
      return ctx.executePrivileged(privileged.termHeartbeat, args);
    },
  }),

  termKill: defineAction({
    description: "Terminates a PTY session cleanly (SIGHUP -> SIGTERM -> SIGKILL on its PGID).",
    privileged: [privileged.termKill],
    request: z.object({
      sessionId: z.string().min(1).max(64),
    }),
    response: z.object({
      ok: z.boolean(),
    }),
    async handler(ctx, args) {
      const res = await ctx.executePrivileged(privileged.termKill, args);
      try {
        const db = ctx.db<typeof schema>();
        await db
          .delete(schema.terminalSessions)
          .where(eq(schema.terminalSessions.sessionId, args.sessionId));
      } catch {
        // Non-fatal
      }
      return res;
    },
  }),

  saveToLibrary: defineAction({
    description: "Saves captured terminal output as .txt, .md, or .json in ~/workspace/your_files/.",
    privileged: [privileged.saveToLibrary],
    request: z.object({
      filename: z.string().min(1),
      format: z.enum(["txt", "md", "json"]),
      content: z.string(),
    }),
    response: z.object({
      savedPath: z.string(),
    }),
    async handler(ctx, args) {
      return ctx.executePrivileged(privileged.saveToLibrary, args);
    },
  }),
} satisfies ActionsModule;
