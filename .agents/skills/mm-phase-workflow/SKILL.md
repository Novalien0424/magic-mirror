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

For cross-cutting phase work, keep one plan of observable outcomes, owners,
risks and acceptance checks. Routine execution/review follows AGENTS, not a
second workflow here. Never hide failing cases or replace assertions with delays.

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

Evidence follows AGENTS privacy rules. Synthetic fixtures prove mechanisms;
separate operator acceptance establishes the experience.
