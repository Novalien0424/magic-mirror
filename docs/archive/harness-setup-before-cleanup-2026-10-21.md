# Superseded harness setup — archived 2026-10-21

These August instructions are retained as history, not installation or routing
policy. Current authority: [AGENTS](../../AGENTS.md) and [CLAUDE](../../CLAUDE.md).
The following source contents are preserved verbatim in fenced blocks.

## MODEL-ROUTING.md

````markdown
# Model Routing Rationale — August 2026

## Decision

Use `gpt-5.6-sol / medium` as the direct primary executor. Keep Luna for
optional subagents, but reserve `Luna / max` for difficult, precisely bounded
read-only review rather than every task.

## Why Luna/max should not be universal

The optimization target is not API dollars alone:

```text
total engineering cost
= model cost
+ serial wall-clock delay
+ repeated context loading
+ coordination/retry cost
+ cost of wrong or incomplete changes
```

A mandatory worker before a one-line diagnostic is expensive in developer
time. Fresh ephemeral workers also reread instructions and task context,
multiplying latency and coordination cost.

## Chosen routing

- Sol/medium direct: best critical-path balance for ambiguous implementation,
  debugging, tool use, and final synthesis.
- Luna/high surveyor or implementer: clear bounded delegated work where the
  answer shape is known.
- Luna/low tester: command execution does not benefit from max reasoning.
- Luna/max deep reviewer: difficult static reasoning with exact scope and
  explicit acceptance criteria, preferably parallel or off the critical path.

This keeps the strong cost/quality characteristic you value while removing the
serial orchestration pattern that caused the observed latency.
````

## APPLY.md

````markdown
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
````

## nova-auto.config.toml.example

````toml
# Optional user-level profile example.
# Save as: $CODEX_HOME/nova-auto.config.toml (normally ~/.codex/nova-auto.config.toml)
# Command-line -m / -c overrides still take precedence.
model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
````
