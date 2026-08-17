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

## Phase Order (never skip ahead)

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio ->
4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening.

Each phase introduces exactly one major unknown. Details, demos (P*-D*), and
exit criteria: `docs/Magic_Mirror_Implementation_Plan_v0.3.md`.

## The Unit Cycle

1. The root orchestrator slices a 0.5-2 day unit from the current phase scope
   and fills the unit template below. Consult the matching `.agents/skills/mm-*`
   domain skill.
2. Dispatch exactly one implementation worker per unit. Every dispatch uses
   the explicit bounded route:

   ```text
   model: "gpt-5.6-luna"
   reasoning_effort: "max"
   role: "implementer"
   fresh_worker: true
   ```

   The dispatch prompt contains the filled template, the relevant PRD story
   ID, the applicable canonical invariant IDs from `mm-invariants`, and
   pointers to the product docs and relevant skills. Independent units may run
   in parallel; dependent units never do. Any follow-up keeps the same bounded
   implementer route and scope.
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
