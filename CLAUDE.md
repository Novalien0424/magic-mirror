# Magic Mirror

[AGENTS.md](AGENTS.md) owns execution policy and canonical invariants for this project. Use the current session model and complete the authorized task with proportionate evidence.

This is a single-venue Electron prototype: Traditional Chinese realtime conversation, Cubism avatar, local wake, proposed face identity with verbal confirmation, and exact spoken scene spells. Windows development precedes the Mac mini M4 port.

## Task-specific references

- Current delivery/runtime/QA/blockers: [PROGRESS](PROGRESS.md).
- Durable contracts and exceptions: [DECISIONS](DECISIONS.md).
- Product requirements: [PRD](docs/Magic_Mirror_PRD_v0.3.md); architectural boundaries: [Tech Spec](docs/Magic_Mirror_Tech_Spec_v0.3.md).
- Phase slicing/exits: [Implementation Plan](docs/Magic_Mirror_Implementation_Plan_v0.3.md) and [phase skill](.agents/skills/mm-phase-workflow/SKILL.md).
- Console design: [UI/UX design](docs/Magic_Mirror_Phase4_UIUX_Design_v0.3.md); actual QA: [UI QA skill](.agents/skills/mm-ui-qa/SKILL.md).
- Domain guidance: current `.agents/skills/mm-*/SKILL.md`. Historical `.claude/skills/` copies are stale; do not use them as current execution instructions.

Source lives in `src/main`, `src/preload`, `src/renderer`, `src/shared`; tests in `tests`, runtime assets in `resources`, build/QA tooling in `scripts`. Consult `package.json` for installed dependencies and commands. Product docs and guest speech use Traditional Chinese; skill/harness instructions, code identifiers and telemetry use English.

Read only the references needed for the task. Do not duplicate status, invariant lists or SDK snapshots here. Historical handoffs and plans remain evidence, not instructions to restart, publish or advance phases.
