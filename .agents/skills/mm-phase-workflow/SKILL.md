---
name: mm-phase-workflow
description: "Slice Magic Mirror phase work or assess requested demos, exit evidence and promotion; not routine fixes or status reads."
---

# Magic Mirror phase work

`PROGRESS.md` owns current phase status and `DECISIONS.md` durable rulings; link them instead of copying their history into plans, prompts or skills.

## Phase boundaries

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio
-> 4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening. DECISIONS
defines the remaining Phase 8 (custom Cubism authoring, character/voice quality).

The [implementation plan](../../../docs/Magic_Mirror_Implementation_Plan_v0.3.md)
owns demo IDs and exit criteria; dated rulings win where older roadmap text
conflicts. An authorized extension or deployment does not accept a phase or
start guest-identity/memory work.

For cross-cutting phase work, capture observable outcomes, risks and acceptance
checks. Never hide failing cases or replace assertions with delays.

## Demos and exit evidence

- A demo must exercise the production boundary it claims. Label deterministic
  mocks separately from configured-provider/device evidence.
- Unavailable required evidence remains `pending`/`not_executed`, never passed.
  Automation does not establish physical sound, hardware effects, visual
  smoothness or operator acceptance.
- Conversation behavior comes from a probabilistic realtime model: judge it by
  rates over repeated real-provider runs, keeping failures
  ([prompt evidence](../roleplay-control-prompts/SKILL.md)).
- On a visual Console/avatar change, use [UI QA](../mm-ui-qa/SKILL.md).
- At a requested phase exit, record the phase/versioned demo ID,
  build/time/result and real-versus-mock status in Console Phase Tests and
  PROGRESS. Preserve earlier phase records and run required prior-phase smoke.
- Exit failure blocks promotion, not unrelated runtime features.
- Tag/publish only with the relevant authority and successful required evidence.
  Routine work does not advance phases or trigger a soak.

Synthetic fixtures prove mechanisms; separate operator acceptance establishes the
experience.
