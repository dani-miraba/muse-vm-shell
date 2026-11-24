# VM Shell (`space-ts` + `vm-pty-daemon`)

🌐 **Language:** English | [Español (ES)](README.es.md)

> **What is actually inside the Linux cell that powers Meta Muse?**  
> **VM Shell** gives you a real, interactive, persistent PTY terminal inside a Muse Space—on mobile or desktop—**without waking the LLM agent or spending a single token**.

> [!NOTE]
> **Experimental project:** Built and tested on a Meta Muse VM Linux runtime (`x86_64-unknown-linux-gnu`, `glibc 2.39`). Internal paths (`/opt/hatch/bin/*`, `~/workspace/your_files/`, etc.) may vary depending on your cell channel or deployment.

---

## The Problem

Every time you ask Muse to do something routine inside its VM—browse folders, read `--help`, run `curl`, push with `git`, debug a script, or inspect what binaries live in `/opt/`—it triggers a full LLM turn:
- It loads heavy system/workspace context and burns tokens on tasks that don't need AI.
- You cannot use real interactive tools (`vim`, `top`, `python3`, `read`, `[y/N]` prompts).
- On mobile, typing CLI flags or reading raw output in chat is slow and awkward.

---

## The Solution

**VM Shell** replaces chat round-trips with a real standalone terminal inside a Muse Space (`space-ts`):

- **Real PTY + Rust master daemon (`vm-pty-daemon`):** A single lightweight per-user daemon manages up to **8 persistent PTY sessions** (`openpty` + `setsid` + `TIOCSCTTY`) over a private Unix Domain Socket (`0600` + `SO_PEERCRED`). Environment variables (`export`), `cd`, virtualenvs, bash history, and long-running commands stay alive naturally.
- **Multiplexed long-polling streaming:** Even though Muse's privileged RPC bridge cuts requests at **30 s**, the `xterm.js` client holds a single ~18 s multiplexed long-poll against the master daemon, streaming live output across all open tabs with no timeout workarounds.
- **Orphan-proof & anti-OOM:** Strict **1 MiB** ring buffer per session, bounded RPC chunks, and a watchdog that cleans up abandoned shells after **60 s** (`SIGHUP` → `SIGTERM` → `SIGKILL` by PGID) and shuts down the idle daemon after 120 s.
- **Built for mobile & desktop:** Real `@xterm/xterm` rendering, touch extra-keys bar (`Esc`, `Tab`, `Ctrl`, `^C`, `^D`, arrows), multiline Bracketed Paste + native mobile paste fallback sheet, JSON output inspector, and one-tap export to Muse Library (`~/workspace/your_files/`).
- **Zero LLM tokens:** Everything runs directly on the Space's TypeScript/Bun runtime and Rust PTY daemon.

---

## Limitations & External Network (Sentinel)

- **Every outbound web command goes through Sentinel:** Any command that reaches the internet (`git`, `curl`, `bun install`, `pip`, etc.) to a host that hasn't been approved yet will trigger a **Sentinel permission prompt across all open Muse chat windows**. Until you approve it, **the command in your terminal will hang waiting** until it times out.
- **No inbound ports or direct WebSockets:** The VM cell is network-isolated (`systemd-nspawn` + eBPF gate). All terminal traffic flows over Space RPC using ~18 s long-polling rather than a raw WebSocket.
- **Daemon safety limits:** Max **8 concurrent terminals**, **1 MiB** RAM ring buffer per session (floods like `cat /dev/urandom` overwrite oldest bytes), and automatic session cleanup after **60 s** with no active client.
- **Ephemeral VM lifecycle:** Muse periodically replaces the cell, stopping running processes; only files under `/home/hatch` (`~`) persist.

> [!WARNING]
> **Be careful when approving domains in Sentinel:**
> - If you only need a URL once, always click **Allow once**.
> - If you need multi-step connections (such as `git` pushing a commit to GitHub), you may need to click **Allow always** while working—**when finished, revoke your GitHub PAT/token and revoke the domain approval**, because **anything approved in Sentinel is also approved for the agent**, which would leave it with access to your configured `git` session.

---

## Quick Setup (via Muse)

1. **Scaffold the generic Space:** copy and paste the following prompt in a clean Muse chat to register the `slug` and privileged permissions:
   ```text
   Ask the subagent to create a simple fullstack Space with slug vm-shell that simulates a terminal shell.
   ```
   *(What it generates does not matter—we only need a registered Space with permissions on Meta's backend.)*

2. **Once it finishes, ask Muse the following:**
   ```text
   Clone the repository https://github.com/dani-miraba/muse-vm-shell into ~/workspace/ts-spaces/vm-shell/, replacing matching files, adding new ones, and keeping non-matching files intact. When finished, follow the steps in AGENTS.md.
   ```

3. **What it will do according to `AGENTS.md`:** reset the initial database (`rm -f app.db*`), make `bin/vm-pty-daemon` executable, run `bun install && bun run typecheck`, and build via `artifact.edit` (`web_artifacts.build`) without modifying source files.

---

> [!CAUTION]
> **Use at your own risk.** This experiment is aimed at curious builders who want to poke around inside the cell (VM) controlled by Muse. If you grant permission to any external site in Sentinel, remember to revoke it afterward.

---

### One last thing for the curious

Inside the cell there are tools, binaries, and capabilities that **the AI itself doesn't even know it has**—and it won't discover them until you go look for yourself and explicitly tell it what to do and which commands to run.
