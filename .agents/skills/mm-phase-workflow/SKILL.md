---
name: mm-phase-workflow
description: Use when planning, dispatching, executing, or reviewing any Magic Mirror phase task - slicing a phase into work units, writing a bounded worker dispatch prompt, running a phase demo, or deciding whether a phase can exit.
---

# Magic Mirror Phase Workflow

## Purpose and authority

Each phase must produce a runnable mirror build with its own Console controls,
mocks, independent demo, and recorded result. [AGENTS.md](../../../AGENTS.md)
owns authority, roles, the canonical task envelope, privacy/evidence rules, and
invariant IDs. [.agents/H6_WORKER_PROTOCOL.md](../../H6_WORKER_PROTOCOL.md)
owns launcher, read/output, deadline, and protocol mechanics. This skill keeps
the phase-specific plan, execution, evidence, and exit rules below.

The default unit path is: one in-thread root plan review -> one bounded fresh
implementer -> focused RED/GREEN for behavior changes -> one independent tester
-> external root acceptance. Worker self-review and root acceptance remain
separate gates; use the canonical limits and scope rules in AGENTS/H6.

## Phase order (never skip ahead)

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio
-> 4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening.

The implementation plan contains the phase details, demos (P*-D*), and exit
criteria: [Magic Mirror Implementation Plan](../../../docs/Magic_Mirror_Implementation_Plan_v0.3.md).

## Unit cycle

1. **Plan.** Slice one bounded unit from the current phase and review the plan
   in-thread. A plan file or plan worker is not the default. For phase work,
   load this route first, then mm-invariants, then the one matching domain
   route when relevant.

2. **Execute.** Dispatch one fresh implementer through the canonical AGENTS/H6
   route with exact read/write scope. Keep the unit independently reviewable;
   share an implementer only for naturally coupled work with one clear
   boundary.

3. **Implement behavior safely.** The implementer writes one focused failing
   test, observes RED, makes the smallest change, observes GREEN, and refactors
   only while green. Documentation/configuration-only work uses the named static
   checks and no ceremonial application tests. At an adapter or device boundary,
   mock first with a fixture proving the visitor path; wire real service/device
   behavior only within the named scope.

4. **Accept the unit.** Dispatch one independent tester for the smallest fresh
   command set that proves the changed boundary. Extra survey, correction,
   focused gates, or full regression require missing evidence, a concrete root
   finding, or an escalation trigger.

5. **Review externally.** The root checks the user-visible outcome, applicable
   invariant IDs, failure visibility, and RAM-only privacy boundary. A correction
   dispatch needs a concrete root finding and keeps the same bounded scope.

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
  metadata-only evidence contract in AGENTS/H6.

## Unit template (all six fields required)

~~~text
Task / user-visible outcome:
write_scope: exact named read/write paths
Explicit non-goals:
Relevant skills / canonical invariant IDs:
Focused tests or static checks:
Metadata-only evidence:
~~~

Add Console controls, telemetry, demo, record, and phase-test fields only when
the affected behavior or phase exit requires them. A boundary that can ignore,
drop, degrade, or fail must still expose that outcome to the visitor or as a
metadata-only Console event with a reason.

## Quick reference

| Decision | Rule |
|---|---|
| Unit too big? | Split until roughly 0.5-2 days and each unit demos something visible. |
| New dependency? | Add one only when stdlib/existing modules cannot serve the named story. |
| Exit criteria failing? | The phase does not advance; exit criteria are not runtime gates. |
| Required real demo unavailable? | Record pending/not-executed; never synthesize a pass. |
| 72h soak / 100-cycle? | Phase 7 only, never per-commit. |
| External call fails in a user action? | One bounded retry at most, then an explicit fallback; no retry maze. |
| Hardware absent? | Complete the mock/adapter contract; make real-device absence a Phase 7 blocker note. |
| Venue input missing? | Use a clearly labeled placeholder; never promote it to a decision. |

## Common mistakes

- Omitting invariant IDs from a dispatch prompt; include the applicable
  canonical IDs and let the external root gate catch violations early.
- Wiring a real service before the mock visitor path demos; mock first.
- Treating exit criteria as runtime gates and blocking unrelated features;
  degrade visibly instead.
- Batching unrelated units into an unreviewable diff; keep one unit or make
  the joint boundary explicit and jointly reviewable.
