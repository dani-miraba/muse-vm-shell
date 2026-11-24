import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const terminalSessions = sqliteTable("terminal_sessions", {
  sessionId: text("session_id").primaryKey(),
  title: text("title").notNull(),
  lastCwd: text("last_cwd").notNull(),
  cols: integer("cols").notNull(),
  rows: integer("rows").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
