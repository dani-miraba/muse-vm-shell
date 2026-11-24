CREATE TABLE IF NOT EXISTS terminal_sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  last_cwd TEXT NOT NULL,
  cols INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
