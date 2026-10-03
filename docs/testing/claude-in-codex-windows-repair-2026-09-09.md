# Claude-in-Codex persistent Windows repair

Operator authorized repair and persistence on 2026-09-09. No Magic Mirror
runtime restart, dependency change or sound acceptance in this repair.

## Cause and fix

### Clock-in correction — 2026-09-09 15:03 Asia/Taipei

The prior installation check covered the plugin manifest but missed the active
user-level override. `C:/Users/b8901/.codex/config.toml` disables the plugin's
MCP server and defines `[mcp_servers.claude-in-codex]` separately for UTF-8.
That override still launched upstream v0.9.0 with `uvx`, explaining why the new
thread again hit `module 'os' has no attribute 'WNOHANG'` on job status.

Changed only that override's command/args to `uv run --frozen --project
C:/Users/b8901/plugins/claude-in-codex-repair-source claude-in-codex-mcp`.
Preserved UTF-8 env, allowlist, timeout and plugin settings. No auth changes.

Fresh verification parsed the actual user TOML and launched its exact
command/args/env through FastMCP StdioTransport. `uv run --frozen --project
C:/Users/b8901/plugins/claude-in-codex-repair-source python -` exited **0**:
ready=true; replacement job status=done; substantive result retrieved;
terminal cancellation returns done unchanged. Recovered the existing paid job,
without another paid launch. The already-attached tool server remains stale;
fresh MCP connections use the corrected launcher. Restart Codex to replace
the attached connection; merely checking readiness is insufficient.

The previous claim that every new thread would pick up the repair was too broad:
the active user-level launcher, not just the plugin manifest, must be verified.

claude-in-codex v0.9.0 delegates jobs to pontonier v0.7.0. The latter unconditionally
used Unix `os.WNOHANG`. Its fallback `os.kill(pid, 0)` is not a safe Windows
existence probe ([Python process documentation](https://docs.python.org/3/library/os.html#os.kill)).
Windows worker ownership also lacked a cross-process lock.

Local repair uses a zero-time Windows process-handle wait for liveness,
msvcrt byte-range locks for restart ownership, and exact verified worker-tree
termination via taskkill /PID /T /F. Termination failures raise rather than
silently report success. Windows cancellation is forceful; POSIX behavior is
unchanged. No auth changes, broad process kills or new runtime dependency.

## Durable installation

- Source: `C:/Users/b8901/plugins/claude-in-codex-repair-source`
- Source commit: `66bdaee`, branch `windows-job-lifecycle`
- Patched core: `C:/Users/b8901/plugins/pontonier-windows`
- Core commit: `f4bc398`, branch `windows-job-lifecycle`
- Upstream bases: claude `44cfa812731a174948c30499838e124af52c83cc`,
  pontonier `f18e838f2c743ac3522b2843812813bd6e909f00`
- Installed plugin: `0.9.0+codex.20260909053247`
- The existing marketplace name now registers the local source, not the remote
  snapshot. Reinstall uses `codex plugin add claude-in-codex@claude-in-codex`.
- Launch: `uv run --frozen --project` targeting the retained source, whose
  lockfile resolves the patched sibling core. Cache rebuild/restart/reinstall
  do not erase the patch. Both source directories must remain in place.
- Local commits only; no upstream push. Future deliberate upstream migration
  must carry/retest this patch or verify upstream has fixed it.

Full repair/rollback notes: `WINDOWS-REPAIR.md` in the repair source. New Codex
threads attach the new MCP process; old threads may keep old imported code.
No other threads' MCP processes were killed.

## Focused evidence

- New core Windows tests: initially 3 failed/1 passed, reproducing WNOHANG and
  restart ownership; final `uv run python -m pytest tests/test_jobs_windows.py
  -o addopts='' -q`: **4 passed**, exit 0.
- Existing core selected lifecycle/result tests: **17 passed**, exit 0.
- Actual Windows worker lock and synthetic review end-to-end:
  `uv run --frozen python -m pytest tests/test_windows_worker_lock.py
  -o addopts='' -q`: **2 passed**, exit 0. No paid CLI invoked.
- Fresh MCP restart check: `uv run --frozen python scripts/verify_windows_install.py`:
  **2 launches x status/result/cancel**, exit 0. Original job recovered in both.
- Plugin manifest validation and both source `git diff --check`: exit 0.
- Existing claude tests selected with `-k 'result or status or cancel'`:
  **10 failed/7 passed**, exit 1; Unix `sh` fixtures unavailable on PATH.
  Not a full upstream suite pass; native tests cover this repair's contract.

## Review recovery / next action

Original Fable job `3ab2f3b72d2e40ee8b144f8205fa1296` completed, cost USD 0.265971.
Recovered response is attempted tool-call text, not critique; verdict unknown.
[Original and recovered evidence](avatar-voice-effects-design-review-2026-09-09.md).
No replacement paid call. Await operator answer to the explicit replacement
review question; do not spend again under the old one-time authorization.
Then continue the [voice-effects design](../superpowers/specs/2026-09-09-avatar-voice-effects-design.md)
with a single-sink audio proof before live integration.
