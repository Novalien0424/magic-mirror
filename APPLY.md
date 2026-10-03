# Apply the Minimal Effective Codex Control Plane

## Files to replace

Copy these files into the repository:

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/agents/surveyor.toml`
- `.codex/agents/implementer.toml`
- `.codex/agents/tester.toml`
- `.codex/agents/deep-reviewer.toml` (new)

The included `apply-control-plane.ps1` backs up existing files to `%TEMP%` and
copies the replacements into `C:\Project\magic-mirror` by default.

## Model routing

- Primary critical path: `gpt-5.6-sol / medium`, executing directly.
- Routine delegated read or bounded implementation: `gpt-5.6-luna / high`.
- Command-only tester: `gpt-5.6-luna / low`.
- Difficult bounded audit: `gpt-5.6-luna / max`.

Routing optimizes correctness and wall-clock time for this home PoC. Optional
roles are tools, not workflow gates; no role must wrap routine direct work.

## Retired legacy paths

The repository no longer uses:

- `.agents/H6_WORKER_PROTOCOL.md`
- `scripts/invoke-codex-worker.ps1`

Do not restore them. The seven repository domain skills have also been reduced
to domain facts, relevant invariants, and proportional checks; `AGENTS.md`
alone owns execution policy.

## Profile check

If your `nova-auto` profile pins a different model/effort for new primary
threads, use
the included `nova-auto.config.toml.example` as the user-level profile baseline
or select Sol/medium interactively.

## Reload and verify

Codex reads `AGENTS.md` once per run/session. Start a fresh Codex session after
copying the files.

Suggested smoke prompts:

1. `Read package.json and print only the script names.`
   Expected: direct read; no worker and no tests.
2. `Change one UI label and run the smallest relevant check.`
   Expected: direct primary-thread edit and focused validation.
3. `Stop and show the current terminal output.`
   Expected: immediate cancellation; no replacement worker or approval loop.
4. `Use deep_reviewer to audit one precisely named privacy boundary.`
   Expected: one optional Luna/max read-only subagent, preferably parallel.
