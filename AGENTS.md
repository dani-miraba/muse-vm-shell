# Agent Instructions (`vm-shell`)

This directory is a TypeScript Space (`space-ts`): a React client in `client/`,
server actions in `server/src/actions.ts`, privileged host handlers in
`server/src/privileged.ts`, the schema in `server/src/schema.ts`, and Drizzle
SQL migrations in `drizzle/` (see `space.json` for its runtime and slug).

---

## Post-Clone Deployment Procedure (Read Carefully)

Assume the user has already scaffolded the generic `vm-shell` fullstack Space
and cloned/overlaid this repository into this directory, keeping any pre-existing
runtime files. Execute the following steps **in exact order** and **DO NOT
modify any source, config, or migration files**:

1. **Reset the SQLite database and ensure the PTY daemon binary is executable** so Drizzle applies `drizzle/0001_initial.sql` cleanly and `vm-pty-daemon` can launch:
   ```bash
   rm -f app.db app.db-shm app.db-wal && chmod +x bin/vm-pty-daemon
   ```
2. **Install dependencies and run typecheck**:
   ```bash
   bun install && bun run typecheck
   ```
   - **If this step fails:** **STOP immediately.** Return the exact command error output to the user **without attempting to fix or edit any files**.
3. **Build and ship via `artifact.edit` (`web_artifacts.build`)**:
   - Only if `bun install && bun run typecheck` passed, invoke `artifact.edit` (`web_artifacts.build`) **without modifying any files**.
   - **If `artifact.edit` fails:** **STOP immediately.** Return the exact error output to the user **without attempting to repair or edit any files**.

