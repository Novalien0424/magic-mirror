---
name: mm-phase-workflow
description: Use when planning, dispatching, executing, or reviewing any Magic Mirror phase task - slicing a phase into work units, writing a bounded worker dispatch prompt, running a phase demo, or deciding whether a phase can exit.
---

# Magic Mirror Phase Workflow

## Overview

Every phase produces a runnable mirror build with its own Console controls,
mocks, independent demo, and recorded result. Work flows as: root
orchestrator slices -> one implementation worker implements -> root externally
reviews -> demo -> record -> next unit.

The root Codex thread is the sole orchestrator and reviewer. It dispatches one
bounded implementation unit at a time to a fresh worker with the explicit
route below. No separate review worker is created. Worker self-review is
limited to at most 3 passes; root review is external to that self-review
limit.

Interactive root dispatches go through the canonical
`scripts/invoke-codex-worker.ps1` launcher. The root writes each complete
prompt to a temporary UTF-8 file, then supplies `-Role` and `-PromptPath`; the
launcher prepends the exact role-specific H3 worker-context preamble (CRLF
UTF-8 without a BOM), appends the original prompt bytes unchanged after the
`--- BEGIN ORIGINAL PROMPT ---` delimiter, and streams the combined bytes to
Codex stdin. If launcher entry sees the exact inherited
`MIRROR_CODEX_WORKER_ACTIVE=1` sentinel, it exits 2 with
`codex_worker_launcher stage=preflight status=failed reason=recursive_invocation`
before reading or launching Codex; only the Codex child environment receives
the sentinel. The H3 context carries global `subagent-stop`, quiet suppressed
reads, a 180-second first-write target, and a 200-line displayed-read limit.
These are context and execution bounds, not a claim that advice can force
model completion. PowerShell 7 (`pwsh`) is the required outer host; Windows PowerShell 5.1
(`powershell.exe`) is not a supported outer host because its
parameter binder can fail before launcher metadata preflight. From the
repository root, use this one compact canonical invocation:

```powershell
pwsh -NoLogo -NoProfile -NonInteractive -File scripts/invoke-codex-worker.ps1 -Role <role> -PromptPath <path> -TimeoutSeconds 600 -MaxOutputBytes 4194304
```

Do not place prompt content in argv, JavaScript template literals, or
reconstructed shell command strings. Keep the repository path literal as
`C:\Project\magic-mirror`.

The launcher pins this exact child argv and order:

```text
exec --profile nova-auto --ephemeral --cd C:\Project\magic-mirror -m gpt-5.6-luna -c model_reasoning_effort="max" -
```

The bounded H2 worker harness uses three separate PowerShell command boundaries for prompt creation, launcher invocation, and exact prompt cleanup.
Create a temporary UTF-8 file outside the repository. Pass its exact resolved path to the launcher; use the exact resolved path only after the worker completes for exact prompt cleanup.
Never combine prompt creation, launcher invocation, and prompt cleanup in one shell expression.
An already-launched worker executes directly and must not recursively invoke Codex or the launcher.
Read only targeted files and required skill sections.
Do not dump unrelated source or skill content or flood worker output.
Keep source/skill reads separate from validation commands; never combine source or skill dumps with validation in one shell command. Returned validation evidence still includes complete stdout/stderr and exit codes for the named commands.
The launcher forwards at most the combined byte cap for stdout and stderr (`-MaxOutputBytes`) and uses metadata-only markers; timeout and output-limit failures exit 2:
`codex_worker_launcher stage=timeout status=failed reason=deadline_exceeded`
and `codex_worker_launcher stage=output status=failed reason=limit_exceeded`.
It terminates and confirms the exact descendant process tree before reporting
either failure.

## Phase Order (never skip ahead)

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio ->
4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening.

Each phase introduces exactly one major unknown. Details, demos (P*-D*), and
exit criteria: `docs/Magic_Mirror_Implementation_Plan_v0.3.md`.

## The Unit Cycle

1. The root orchestrator slices a 0.5-2 day unit from the current phase scope
   and fills the unit template below. Consult the matching `.agents/skills/mm-*`
   domain skill.
2. Dispatch exactly one implementation worker per unit through the canonical
   launcher. Every dispatch uses the explicit bounded route:

   ```text
   model: "gpt-5.6-luna"
   reasoning_effort: "max"
   role: "implementer"
   fresh_worker: true
   ```

   The dispatch prompt contains the filled template, the relevant PRD story
   ID, the applicable canonical invariant IDs from `mm-invariants`, and
   pointers to the product docs and relevant skills. It also states exactly
   one role (`implementer`, `surveyor`, or `tester`), an exact `write_scope`,
   metadata-only `evidence`, `self_review` capped at 3 passes, and an external
   `root_review`. Independent units may run in parallel; dependent units never
   do. Any follow-up keeps the same bounded implementer route and scope.
3. **Mock first, real second:** Console mock control plus a fixture proves the
   full visitor path before any real service or device is wired.
4. The implementation worker returns its diff and test output. The root
   reviewer checks story acceptance, invariants, a failure-path test, a
   Console event, and the absence of transcript/audio persistence. Reject with
   specific feedback and re-dispatch the bounded unit when needed.
5. Run the affected phase demo step; record build, time, and result in Console
   Phase Tests and `PROGRESS.md`.
6. Run a short regression smoke of prior phases' demos. Tag a recoverable phase
   release before starting the next phase.
7. If exit evidence fails, the phase does not advance. Exit criteria are not
   runtime gates.

## Unit Template (all 8 fields required)

```text
Story / Phase:
User-visible outcome:
Files / modules expected to change:
Console control or telemetry to add:
Happy-path test:
Failure / fallback test:
Explicit non-goals:
Demo step affected:
```

A unit without a failure/fallback test or without a Console increment is not
done - those two fields are where this project's value lives.

## Quick Reference

| Decision | Rule |
|---|---|
| Unit too big? | Split until 0.5-2 days; each still demos something visible |
| New dependency? | Only if stdlib/existing modules can't do it; name the story it serves |
| Exit criteria failing? | Phase does not advance; exit criteria are not runtime gates |
| 72h soak / 100-cycle? | Phase 7 only, never per-commit |
| External call fails in a user action? | Max one bounded retry, then explicit fallback - no retry mazes |
| Hardware absent? | Mock/adapter contract completes the unit; real device becomes a Phase 7 blocker note |
| Missing venue input (persona, spells, assets)? | Use clearly-labeled placeholder; never promote a placeholder to a decision |

## Common Mistakes

- Dispatching implementation without the invariant IDs in the prompt -> review
  catches violations late. Always include them.
- Wiring the real service before the mock path demos -> problems become
  un-localizable. Mock first.
- Treating exit criteria as runtime gates (blocking features on unrelated
  module health) -> the product principle is degrade-visibly, not gate.
- Batching several units into one dispatch -> un-reviewable diffs. One unit,
  one implementation worker.
