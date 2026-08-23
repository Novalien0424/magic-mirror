---
name: mm-phase-workflow
description: Use when planning, dispatching, executing, or reviewing any Magic Mirror phase task - slicing a phase into work units, writing a bounded worker dispatch prompt, running a phase demo, or deciding whether a phase can exit.
---

# Magic Mirror Phase Workflow

## Overview

Every phase produces a runnable mirror build with its own Console controls,
mocks, independent demo, and recorded result. The default unit flow is: one
in-thread root plan review -> one bounded fresh implementer -> focused RED/GREEN
when behavior changes -> one independent tester -> external root acceptance.
Phase demos, records, regression smoke, and release tags belong at phase exit
or to a justified risk escalation, not to every unit.

The root Codex thread is the sole orchestrator and reviewer. It dispatches one
bounded implementation unit at a time to a fresh worker with the explicit
route below. No separate review worker is created. Worker self-review is
limited to at most 3 passes; root review is external to that self-review
limit.

Interactive root dispatches go through the canonical
`scripts/invoke-codex-worker.ps1` launcher. The root writes each complete
prompt to a temporary UTF-8 file, then supplies `-Role` and `-PromptPath`; the
launcher prepends the exact role-specific H6 worker-context preamble (CRLF
UTF-8 without a BOM), appends the original prompt bytes unchanged after the
`--- BEGIN ORIGINAL PROMPT ---` delimiter, and streams the combined bytes to
Codex stdin, never to argv. If launcher entry sees the exact inherited
`MIRROR_CODEX_WORKER_ACTIVE=1` sentinel, it exits 2 with
`codex_worker_launcher stage=preflight status=failed reason=recursive_invocation`
before reading or launching Codex; only the Codex child environment receives
the sentinel. The H6 preamble carries, in fixed order, global
`subagent-stop`, quiet reads, `read_scope_enforcement: "exact_only"`,
`source_body_output: "forbidden_unless_evidence_requires"`,
`terminal_read_output: "metadata_only"`,
`repository_wide_discovery: "forbidden"`, fixed
`first_write_deadline_seconds: 480`, fixed
`post_write_idle_deadline_seconds: 120`, and
`max_read_output_lines: 200`. Workers read only exact targeted paths; broad
discovery and source/skill bodies are suppressed unless exact evidence
requires a bounded excerpt.

The launcher passes documented Codex `--json` immediately before the final
stdin `-`. It captures raw stdout and stderr only for a combined raw byte cap;
neither raw stream is forwarded. It parses bounded strict UTF-8 JSONL and pins
only the local compatibility fields `type: "item.completed"` plus
`item.type: "file_change"` for an implementer write, and
`type: "item.completed"` plus `item.type: "agent_message"` with string
`item.text` for the final message. These event fields are the locally tested
Codex 0.148.0 compatibility contract, not an official universal schema
guarantee; Codex `--json` itself is documented. Valid progress, file-change,
and stderr payloads remain suppressed. After a zero-exit child and valid
completed protocol, only the latest nonempty agent message is written once to
parent stdout without framing or a newline. Tester workers include complete
stdout/stderr and exit codes for every named command in that final message so
the H6 launcher can forward the evidence without forwarding raw process
streams. Malformed/non-object/nonconforming JSONL exits 2 with
`codex_worker_launcher stage=protocol status=failed reason=invalid_jsonl`;
zero-exit output without a nonempty final message uses
`codex_worker_launcher stage=protocol status=failed reason=missing_final_message`.
Implementers enforce the structured first-write deadline before the first
`file_change` event, then arm/reset the post-write idle deadline on valid
events; surveyor and tester runs have neither deadline. Human `patch: completed`
lines never satisfy first-write. Live deadline, output, and supervision
failures terminate and confirm the exact descendant process tree, using
`tree_termination_failed` when confirmation fails. The stable failure markers
are:

- `codex_worker_launcher stage=timeout status=failed reason=deadline_exceeded`
- `codex_worker_launcher stage=output status=failed reason=limit_exceeded`
- `codex_worker_launcher stage=first_write status=failed reason=deadline_exceeded`
- `codex_worker_launcher stage=post_write status=failed reason=deadline_exceeded`

Post-exit protocol failures report the stable `invalid_jsonl` or
`missing_final_message` markers without inventing tree evidence. These are
context and execution bounds, not a claim that advice can force model
completion. PowerShell 7 (`pwsh`) is required as the outer host; Windows PowerShell 5.1 (`powershell.exe`) is unsupported because its parameter binder
can fail before launcher metadata preflight. From the
repository root, use this one compact canonical invocation:

```powershell
pwsh -NoLogo -NoProfile -NonInteractive -File scripts/invoke-codex-worker.ps1 -Role <role> -PromptPath <path> -TimeoutSeconds 600 -MaxOutputBytes 4194304
```

Do not place prompt content in argv, JavaScript template literals, or
reconstructed shell command strings. Keep the repository path literal as
`C:\Project\magic-mirror`.

The launcher pins this exact child argv, in this order; documented `--json`
immediately precedes the final `-`, which selects stdin for the prompt:

```text
exec --profile nova-auto --ephemeral --cd C:\Project\magic-mirror -m gpt-5.6-luna -c model_reasoning_effort="max" --json -
```

The bounded H6 worker harness uses three separate PowerShell command boundaries for prompt creation, launcher invocation, and exact prompt cleanup.
Create a temporary UTF-8 file outside the repository. Pass its exact resolved path to the launcher; use the exact resolved path only after the worker completes for exact prompt cleanup.
Never combine prompt creation, launcher invocation, and prompt cleanup in one shell expression.
An already-launched worker executes directly and must not recursively invoke Codex or the launcher.
Read only targeted files and required skill sections.
Do not dump unrelated source or skill content or flood worker output. Source
and skill bodies remain suppressed unless exact evidence requires them.
Keep source/skill reads separate from validation commands; never combine source or skill dumps with validation in one shell command. Returned validation evidence still includes complete stdout/stderr and exit codes for the named commands.
The launcher captures at most the combined raw byte cap for stdout and stderr (`-MaxOutputBytes`) and uses metadata-only markers; timeout and output-limit failures exit 2:
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

1. The root orchestrator slices a bounded unit from the current phase scope,
   conducts one in-thread plan review, and fills the compact contract below.
   A separate plan file or plan worker is not the default. Load
   `mm-phase-workflow`, `mm-invariants`, and one matching domain skill only when
   relevant.
2. Dispatch one bounded fresh implementer through the canonical launcher. The
   root prompt retains the canonical model, effort, role, freshness, exact
   scope, invariant IDs, metadata-only evidence, three-pass self-review cap,
   and external root-review contract in `AGENTS.md`.
3. For behavior changes, the implementer writes one focused failing test,
   observes RED, makes the smallest change, observes GREEN, and reports both.
   Documentation/configuration-only work uses the named static checks and no
   ceremonial application tests. When an adapter or device boundary is
   affected, mock first with a fixture that proves the visitor path; wire the
   real service or device only within the named scope.
4. Dispatch one independent tester for the smallest fresh acceptance command
   set that proves the changed boundary. The tester reports complete output,
   stderr, and exit codes for every named command. A survey, correction
   follow-up, extra focused gate, or full regression is conditional on missing
   scope/evidence, a concrete root finding, or an escalation trigger.
5. The root performs the external acceptance review. Check the user-visible
   outcome, applicable invariants, failure visibility, and absence of
   transcript/audio persistence where relevant. A correction dispatch needs a
   concrete root finding and keeps the same bounded scope; no review worker is
   created.
6. At phase exit, run the required product demo, record the build/time/result
   in Console Phase Tests and `PROGRESS.md`, run the required prior-phase
   regression smoke, and tag a recoverable phase release. Console Phase Tests
   records preserve earlier phases, identify the authoritative phase and its
   phase-versioned demo ID, distinguish deterministic/mock evidence from real
   evidence, and keep unavailable required real evidence explicitly
   pending/not-executed; mark passed only after the required evidence actually
   ran. These are not per-unit gates unless affected risk justifies them.
7. If exit evidence fails, the phase does not advance. Exit criteria are not
   runtime gates.

## Unit Template (all 6 fields required)

```text
Task / user-visible outcome:
write_scope: exact named read/write paths
Explicit non-goals:
Relevant skills / canonical invariant IDs:
Focused tests or static checks:
Metadata-only evidence:
```

Console controls, telemetry, demo, record, and phase-test fields are added
only when the affected behavior or phase exit requires them. Failure and
fallback behavior must still be visible to the visitor or as a metadata-only
Console event with a reason when the boundary can ignore, drop, degrade, or
fail.

## Quick Reference

| Decision | Rule |
|---|---|
| Unit too big? | Split until 0.5-2 days; each still demos something visible |
| New dependency? | Only if stdlib/existing modules can't do it; name the story it serves |
| Exit criteria failing? | Phase does not advance; exit criteria are not runtime gates |
| Required real demo evidence unavailable? | Record pending/not-executed; never synthesize a pass |
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
- Batching unrelated units into one dispatch -> un-reviewable diffs. Naturally
  coupled work may share one implementer only when the joint boundary is clear
  and jointly reviewable; otherwise use one unit and one implementer.
