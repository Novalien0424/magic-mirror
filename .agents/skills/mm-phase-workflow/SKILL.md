---
name: mm-phase-workflow
description: Use for Magic Mirror phase slicing, runnable demos, exit evidence or promotion decisions. Not for routine status reads, single-file fixes or ordinary unit tests.
---

# Magic Mirror phase work

[AGENTS.md](../../../AGENTS.md) owns execution policy. `PROGRESS.md` owns current
task/phase status; `DECISIONS.md` owns durable rulings. Consult those owners
instead of reproducing their history in plans, prompts or skills.

## Phase boundaries

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio
-> 4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening.

Use the [implementation plan](../../../docs/Magic_Mirror_Implementation_Plan_v0.3.md)
for phase demo IDs and exit criteria. A user's explicitly authorized extension
does not itself accept a phase or start guest-identity/memory work. Follow dated
rulings when older roadmap text conflicts.

Windows is the engineering/verification host. Mac signing, TCC, packaging and
device-performance proof belong to the later port. Never promote Windows
evidence into Mac readiness.

## A unit, not a ceremony

For cross-cutting work, record observable outcomes, owners, risks and acceptance
checks. Keep one current plan; do not create parallel ledgers of task status.
For a bounded fix, inspect its owner, change the cause and run its focused check.

Use practical RED/GREEN for durable behavior. Diagnostics/docs do not need a
manufactured failing test. Self-check the diff once; repeat only for a concrete
finding. The primary thread can implement and validate directly. Independent
review is optional when it materially reduces risk, not a mandatory serial gate.

After a real failure, retain the bounded reason, reproduce it at the smallest
boundary, and add regression coverage. Do not replace assertions with delays,
hide failing cases, or add unbounded retry chains. External actions get at most
one retry under AGENTS.md.

## Demos and exit evidence

- A demo must exercise the production boundary it claims. Label deterministic
  mocks separately from configured-provider/device evidence.
- Unavailable required evidence remains `pending`/`not_executed`, never passed.
  A successful automation run does not establish physical sound, hardware
  effects, visual smoothness or operator acceptance.
- On a visual Console/avatar change, use [UI QA](../mm-ui-qa/SKILL.md) for isolated
  fixtures, current-build verification and real screenshot inspection.
- At a requested phase exit, record authoritative phase/versioned demo ID,
  build/time/result and real-versus-mock status in Console Phase Tests and
  PROGRESS. Preserve earlier phase records and run required prior-phase smoke.
- Exit failure blocks promotion, not unrelated runtime features. Never make
  conversation wait for a camera, memory extractor or unrelated adapter.
- Tag/publish only with the relevant authority and successful required evidence.
  Routine work does not advance phases, trigger a soak, or require a full suite.

## Evidence hygiene

Use command + exit code + key result and exact artifact links. Failures retain
bounded metadata reasons. Do not save raw conversation traces, audio, private
context or credentials for an agent eval. Synthetic fixtures can prove a
mechanism; the user's separate acceptance establishes the experience.
