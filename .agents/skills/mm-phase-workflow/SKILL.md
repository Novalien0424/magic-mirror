---
name: mm-phase-workflow
description: "Slice Magic Mirror phase work or assess requested demos, exit evidence and promotion; not routine fixes or status reads."
---

# Magic Mirror phase work

0 Foundation/Console -> 1 Realtime Voice -> 2 Wake Lifecycle -> 3 Avatar/Audio
-> 4 Scenes -> 5 Identity/Profiles -> 6 Memory -> 7 Field Hardening. DECISIONS
defines the remaining Phase 8 (custom Cubism authoring, character/voice quality).

The [implementation plan](../../../docs/Magic_Mirror_Implementation_Plan_v0.3.md)
owns demo IDs/exit criteria; newer DECISIONS rulings override it. PROGRESS owns
current status. Authorized extension/deployment does not accept or start phases.

## Demos and exit evidence

- For cross-cutting work, state observable outcomes, risks and acceptance checks.
  Exercise the claimed production boundary; label mocks and unavailable evidence
  (`pending`/`not_executed`). Never hide failures or replace assertions with delays.
- Use [UI QA](../mm-ui-qa/SKILL.md) for visual evidence and
  [prompt evidence](../roleplay-control-prompts/SKILL.md) for conversation rates.
  Synthetic checks cannot establish physical sound/effects or operator acceptance.
- At requested exit, record phase/versioned demo ID, build/time/result and
  real-versus-mock status in Console Phase Tests and PROGRESS. Preserve prior
  records and run required earlier-phase smoke.
- Exit failure blocks promotion, not unrelated runtime. Tag/publish requires
  authority and successful required evidence. Routine fixes trigger neither
  phase advancement nor a soak.
