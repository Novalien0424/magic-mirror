---
name: mm-phase-workflow
description: Use when planning, dispatching, executing, or reviewing any Magic Mirror phase task - slicing a phase into work units, writing a bounded worker dispatch prompt, running a phase demo, or deciding whether a phase can exit.
---

# Magic Mirror Phase Workflow

## Purpose and authority

Each phase must produce a runnable mirror build with Console controls, mocks,
an independent demo, and an honest recorded result. [AGENTS.md](../../../AGENTS.md)
owns execution policy, privacy/evidence rules, and invariant IDs. This skill
adds only phase-specific facts.

Direct in-thread execution and review are the default. Delegate only when
parallel work or an independent high-risk check materially helps. A routine
unit does not require a worker, tester, plan file, repeated review, or full
suite.

## Phase order (never skip ahead)

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio
-> 4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening.

The implementation plan contains the phase details, demos (P*-D*), and exit
criteria: [Magic Mirror Implementation Plan](../../../docs/Magic_Mirror_Implementation_Plan_v0.3.md).

## Unit cycle

1. **Scope.** Identify one observable outcome in the current phase. A written
   plan is needed only for multi-step or cross-cutting work.

2. **Execute.** Make the smallest direct change. Keep coupled changes together
   when splitting them would add coordination without improving reviewability.

3. **Implement behavior safely.** For a durable behavior change, use one focused
   failing test when practical, then make the smallest change. Investigation,
   one-run diagnostics, and documentation/configuration work do not need a
   ceremonial RED step. At an unavailable adapter or device boundary, use the
   smallest fixture that proves the contract.

4. **Verify the unit.** Run the smallest check that proves the changed boundary.
   Use an independent tester, full regression, or device demo only when risk,
   ambiguity, release/phase exit, or the user requires it.

5. **Self-check once.** Review the diff for the user-visible outcome,
   applicable invariants, failure visibility, and RAM-only privacy boundary.

6. **Exit the phase.** Run the required product demo, record build/time/result in
   Console Phase Tests and PROGRESS.md, run the required prior-phase regression
   smoke, and tag a recoverable phase release. Phase-test records preserve prior
   phases, identify the authoritative phase and phase-versioned demo ID, separate
   deterministic/mock from real evidence, and keep unavailable required real
   evidence explicitly pending/not-executed.

7. **Stop on failed exit evidence.** Do not advance the phase. Exit criteria are
   evidence conditions, not runtime gates.

## Evidence truth

- A deterministic or mock success proves only the mock path. Record it as
  deterministic/mock (for example, mock_passed); never promote it to a real
  pass.
- Required real evidence that did not run remains pending/not-executed. Never
  synthesize a pass from a mock result, an unavailable device/provider, or an
  operator absence.
- At phase exit, mark passed only after the required evidence actually ran;
  record the authoritative phase, versioned demo ID, build/time/result, and
  real-versus-mock status.
- Any ignore, drop, fallback, degrade, or failed adapter path remains
  visitor-visible or a metadata-only Console event with a reason. Use the
  metadata-only evidence contract in `AGENTS.md`.

## Optional delegation brief

~~~text
Outcome and done condition:
Owned files or read-only question:
Relevant invariant IDs:
Focused evidence:
~~~

Use this only when delegation is justified. Add Console controls, telemetry,
demo, or phase-test fields only when the affected behavior or phase exit needs
them. A boundary that can ignore, drop, degrade, or fail must still expose that
outcome to the visitor or as a metadata-only Console event with a reason.

## Quick reference

| Decision | Rule |
|---|---|
| Unit too big? | Split only at cohesive, independently verifiable boundaries. |
| New dependency? | Add one only when stdlib/existing modules cannot serve the named story. |
| Exit criteria failing? | The phase does not advance; exit criteria are not runtime gates. |
| Required real demo unavailable? | Record pending/not-executed; never synthesize a pass. |
| 72h soak / 100-cycle? | Phase 7 only, never per-commit. |
| External call fails in a user action? | One bounded retry at most, then an explicit fallback; no retry maze. |
| Hardware absent? | Complete the mock/adapter contract; make real-device absence a Phase 7 blocker note. |
| Venue input missing? | Use a clearly labeled placeholder; never promote it to a decision. |

## Common mistakes

- Copying generic policy, entire skills, or product documents into a delegated
  prompt instead of naming the relevant outcome and invariant IDs.
- Wiring a real service before the mock visitor path demos; mock first.
- Treating exit criteria as runtime gates and blocking unrelated features;
  degrade visibly instead.
- Adding worker, tester, plan, demo, or regression gates to a routine bounded
  edit merely because those mechanisms exist.
