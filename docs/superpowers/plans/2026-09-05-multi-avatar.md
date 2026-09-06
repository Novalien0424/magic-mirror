# Multi-avatar Console implementation plan

Goal: preserve the current installation while making character selection,
personality/voice, appearance, reusable resources and focused tests usable.
Spec: PRD §18. Execution: direct, bounded units under AGENTS.md; no phase exit.
Stack: existing Electron/React/TypeScript/Zod/config services; no new dependency.

## Design choices and user journey

Use the existing versioned config with a bounded avatar catalog, not a second
database or a plugin/workflow framework. Each avatar owns persona/style/voice,
idle/presentation/model reference/scenes/spells. Libraries and device settings
remain global. Old config is interpreted as one default avatar without losing
data. Existing root fields are a compatibility projection, not a second editor.

Operator chooses an editing avatar, adjusts Character & Voice / Appearance /
Scenes, inspects Effective prompt if desired, previews locally, then
Save → Test → Publish. Load selects a previously published avatar only in Dormant
and without discarding drafts. Shared resources are available across avatars;
owner locks apply transitively. One contextual test scope selector and Test
button cover action, step and scene; the existing Stop All stops any run.

Alternatives rejected: separate JSON tree per avatar complicates atomic shared
resource validation/rollback; a SQLite profile subsystem conflates this work
with visitor identity and adds an unnecessary migration.

## Units and acceptance boundaries

- [x] Catalog/schema: `src/shared/avatar-profiles.ts`, config-service and
  console-config. Bounded profiles/locks/model manifests; legacy normalization,
  reference validation for every avatar, field errors without content telemetry.
  Tests: two-avatar round-trip; duplicate IDs; invalid active ID/voice; direct and
  indirect locks; same spell across avatars accepted, collisions within rejected.
- [x] Session prompt: `src/shared/avatar-prompt.ts`, session-start-bundle,
  Main/preload validation and realtime dependencies/adapter. One builder for
  visible and transmitted instructions; freeze persona/voice/dialogue together
  before credential fetch. Keep content outside metadata model snapshots.
  Tests: builder parity, atomic capture across awaited fetch, fresh/rollover
  greeting, no history transfer, malicious/extra IPC fields rejected.
- [x] Safe load/publish: Console controller and IPC enforce Dormant, preserve
  dirty drafts, validate catalog and references. Refresh existing scene and
  presentation consumers from active profile. Tests: active load rejected,
  published profile switch/restart preserved, failed load keeps old config.
- [x] Cubism bundles: managed local folder import using existing validator,
  bounded copied referenced files, safe IDs and protocol paths. Both preview and
  Mirror resolve selected model; fail visibly for missing/invalid bundle.
  Tests: valid fixture, traversal/symlink/missing file rejection, invalid model
  cannot replace current avatar, real bundled rig renders through managed route.
- [x] Console workspace: focused avatar selector/new/duplicate/load, character
  form/Voice dropdown/effective prompt, appearance preview and shared libraries.
  Preserve draft edits when changing tabs/avatar. Locks show ownership and
  shared-impact warning; do not duplicate device/model settings or test controls.
  Tests: real DOM authoring of two avatars, settings isolation, lock filtering,
  shared action reuse, Save/Test/Publish, responsive text/control measurements.
- [x] Focused playback: extend the existing scene runtime to execute a selected
  action or stage through its normal adapters/leases/cleanup, not a mock clone.
  Typed Console-only target IDs; no arbitrary action payload or file path.
  Tests: action/stage/scene selected scope, every kind, finite/loop/timeout/error,
  cancellation/stale feedback and no retained resources after Stop All.
- [x] Harness audit: reusable bounded waits, fixture/evidence mode validation,
  stale-build checks and content-free failure observations. Compact relevant
  repository skills; correct claims disproved by runtime measurements. Add
  reproducible checks rather than another mandatory orchestration system.
  Report: `docs/testing/harness-audit-2026-09-06.md`. The reproduced Windows
  playback path now passes; audit completion is not product/phase acceptance.
- [x] QA implementation: focused RED/GREEN per boundary; typecheck, full suite/build,
  original Console + portrait regressions, two-avatar real-provider tests,
  native Windows interaction with isolated synthetic fixtures. Record exact
  commands/results/artifacts and remaining physical checks.
- [ ] Delivery: commit/push the verified candidate and restart the normal app.

Evidence: [Windows QA report](../../testing/multi-avatar-qa-2026-09-06.md).
Implementation self-review caught model-mask cleanup, asynchronous replacement,
failed-load draft restoration and concurrent mutation hazards; focused checks
and actual renderer runs prove those corrections. No dependency, runtime-model,
credential, guest-identity or phase-promotion expansion was introduced.

## Pre-implementation self-review

Key risks: current persona.instructions is not wired into the initial agent;
getAvatarDialogue is a second read after the atomic bundle, enabling mismatched
voice/dialogue; Console safe projections omit persona text; scene collections
are currently global; runtime renderer hardcodes Ren; focused step/action tests
are missing. Each gap has an owning unit above. No private guest data is needed.

Do not remove an old working path before its replacement passes the relevant
boundary test. Do not permit a failed preview or synthetic provider result to
claim physical sound/character-quality acceptance. Preserve `sample/` and normal
user data. User decisions arriving during work supersede stated lock defaults.
