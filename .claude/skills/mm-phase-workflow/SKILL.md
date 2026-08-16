---
name: mm-phase-workflow
description: Use when planning, dispatching, executing, or reviewing any Magic Mirror Phase task — slicing a phase into work units, writing an Opus dispatch prompt, running a phase demo, or deciding whether a phase can exit.
---

# Magic Mirror Phase Workflow

## Overview

Every phase produces a runnable mirror build with its own Console controls,
mocks, independent demo, and recorded result. Work flows as: orchestrator
slices → Opus implements → orchestrator reviews → demo → record → next unit.

## Phase Order (never skip ahead)

0 Foundation/Console → 1 Realtime Voice → 2 Wake Lifecycle → 3 Avatar/Audio →
4 Scenes → 5 Identity/Profiles → 6 Memory → 7 Field Hardening.
Each phase introduces exactly one major unknown. Details, demos (P*-D*), and
exit criteria: `docs/Magic_Mirror_Implementation_Plan_v0.3.md`.

## The Unit Cycle

1. Orchestrator slices a 0.5–2 day unit from the current phase scope and fills
   the unit template (below). Consult the matching `mm-*` domain skill.
2. Dispatch one Opus agent per unit (`model: "opus"`). The dispatch prompt
   contains: the filled template, the relevant PRD story ID, the invariants
   list from `mm-invariants`, and pointers to the docs/skills to read.
   Independent units may run in parallel; dependent units never do.
3. **Mock first, real second:** Console mock control + fixture proves the full
   visitor path before any real service/device is wired.
4. Opus returns diff + test output. Orchestrator reviews against: story
   acceptance, invariants, failure-path test present, Console event added,
   no transcript/audio persistence. Reject with specific feedback, re-dispatch.
5. Run the affected phase demo step; record build/time/result in Console
   Phase Tests and `PROGRESS.md`.
6. Short regression smoke of prior phases' demos. Tag a recoverable phase
   release before starting the next phase.

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
done — those two fields are where this project's value lives.

## Quick Reference

| Decision | Rule |
|---|---|
| Unit too big? | Split until 0.5–2 days; each still demos something visible |
| New dependency? | Only if stdlib/existing modules can't do it; name the story it serves |
| Exit criteria failing? | Phase does not advance; exit criteria are NOT runtime gates |
| 72h soak / 100-cycle? | Phase 7 only, never per-commit |
| External call fails in a user action? | Max one bounded retry, then explicit fallback — no retry mazes |
| Hardware absent? | Mock/adapter contract completes the unit; real device becomes a Phase 7 blocker note |
| Missing venue input (persona, spells, assets)? | Use clearly-labeled placeholder; never promote a placeholder to a decision |

## Common Mistakes

- Dispatching implementation without the invariants list in the prompt →
  reviewer catches violations late. Always paste them.
- Wiring the real service before the mock path demos → problems become
  un-localizable. Mock first.
- Treating exit criteria as runtime gates (blocking features on unrelated
  module health) → the product principle is degrade-visibly, not gate.
- Batching several units into one dispatch → un-reviewable diffs. One unit,
  one agent.
