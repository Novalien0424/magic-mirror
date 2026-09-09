# Magic Mirror — Current handoff

## Versioned Console library — 2026-09-09

Live2D Cubism now edits/saves persistent Name + Version labels, with explicit
Selected versus Loaded identity. Existing Raven v7/v8/v10 were verified against
all 17 referenced source files each and labeled through native Console UI.
Generic sidecars survive rediscovery/reimport; no hard-coded IDs or version
guesses. [Contract, checks and native handoff](docs/testing/avatar-library-labels-2026-09-09.md).
54 focused tests, final Node/web typechecks and build exit 0. Isolated Console
QA: 221 checks exit 0; this predates only the final reserved-filename guard,
covered by a new regression and the final build. Full normal-app restart
confirmed all three labels persist; v8 and v10 each loaded successfully through
native controls. Main **61564** remains running, Console at the selector with
v10 loaded neutral, Mirror Dormant/v12. Older PIDs below are historical.
Active/draft hashes unchanged; no draft save/publication or rig-byte changes.

## Project-owned Raven master — 2026-09-09

Current retained Raven is v10. Complete delivery now resides in
`resources/avatar/Raven/v10/`: 251 files verified byte-for-byte, including
17 runtime files and editable CMO/PSD sources. [Storage policy and import entry](resources/avatar/Raven/README.md),
[copy evidence](docs/testing/avatar-storage-2026-09-09.md). Existing managed
v10 `49076b95` and original delivery remain untouched. No config publication,
restart, commit or push. Runtime/manifest are Git-eligible; large editable/QA
archive is ignored and needs separate backup.

The Sept 8 framing/runtime observations below are historical, not current v10
acceptance. The [v10 handoff](RAVEN-V10-EXPRESSION-FIX-HANDOFF.md) supersedes the
v08 beak-crop finding for current assets and records remaining state-expression
integration/visual limits. This storage task did not implement that renderer
work or recheck the running UI. For v10 QA use the project-owned manifest above.

## Framing validation resumed — 2026-09-08, Windows

Height/Layout framing fix restores Raven v08 to v07 body scale without asset
edits or per-frame matrix mutation. Fresh build/typechecks exit 0; 32 focused
tests and 219 production Console QA checks pass. Native computer use confirmed
Ren/v08 loading, scale, resize, motion completion and neutral reset. Temporary
capture code removed before final build. [Framing report](docs/testing/avatar-framing-2026-09-08.md)
preserves before/after, interrupted 22:03 evidence and fresh resumed results.
Extreme +30 side-turn still clips Raven's beak; fixed per-model Layout/artistic
calibration and full visual acceptance remain open. External avatar-studio
harness owner still needs to synchronize; local guidance/DECISIONS updated.

Updated **2026-09-08, Asia/Taipei** for independent Cubism QA. This file owns
current status; [AGENTS.md](AGENTS.md) owns execution policy and
[DECISIONS.md](DECISIONS.md) owns durable rulings.

## Current delivery and runtime

- Canonical checkout `C:\Project\magic-mirror`, branch `main`, HEAD `e4e36c9`.
  Cubism implementation/tests and this handoff are **uncommitted**, not pushed.
  Another Codex must use this working tree, not a fresh clone of HEAD.
- Separate **Live2D Cubism** Console page selects built-in Ren or managed Raven,
  browses/imports bundles, explicitly loads a local preview, and tests all
  exported motion indices, expressions and actual MOC parameters. Stop/reset,
  unload and page-leave cleanup are implemented. Preview does not publish or
  change the Mirror's loaded public character.
- Normal built Electron (`electron .`, **not dev**) remains running; Main PID
  `56424` rechecked during this handoff. Console shortcut `Ctrl+Shift+D`.
  Last native observation: Cubism page, Raven v08 `c4d3cf1b` selected/loaded,
  neutral; Mirror Dormant. UI state is point-in-time, not a watchdog.
- Operator's previously unsaved Raven Appearance changes were saved as a draft
  before restart, **not validated/published**. Active v12 remained unchanged.
  Before/after native-QA config hashes are in the report below. Resolve any new
  unsaved edits before stopping/reloading; do not publish the draft for QA.
- Existing `.codex/config.toml` edits, Raven handoff/survey and `sample/` remain
  user-owned. `CLAUDE.md` had concurrent edits; this turn only adds targeted
  Cubism/handoff corrections. Do not stage the entire dirty tree blindly.
- Canonical Private TCP/UDP firewall rules matched the Electron path during
  this delivery; path unchanged. Recheck only under AGENTS conditions.

## Next Codex: independent QA

Read [current framing report and v08 fixture](docs/testing/avatar-framing-2026-09-08.md),
then [Cubism report and rerun instructions](docs/testing/cubism-console-2026-09-08.md#independent-qa-handoff),
then the matching [UI QA skill](.agents/skills/mm-ui-qa/SKILL.md).
The report contains the exact Raven v07 path, source map, focused commands,
expected cases, native computer-use checklist and retained failures.

Stop the normal app only after preserving current operator edits. Never overlap
normal Electron, isolated Electron QA, or full `npm test` (includes smoke).
Build before QA, set `MIRROR_CUBISM_QA_MODEL` to Raven's manifest, and run
`npm run test:phase4:qa:cubism`. Without that variable Raven is **not tested**.
Record a fresh independent result; do not relabel prior evidence as a new pass.
Restore one normal instance after QA if stopped, without publishing config.

Latest framing evidence: 32 focused tests / 6 files, Node+web typecheck and
stamped build exit 0. Isolated Cubism QA with v08 exit 0: **219 checks, 22 motion starts,
15 expressions, 73+73+27 parameter min/max/default checks, 6 captures**.
Artifact: `.artifacts/phase4-qa/2026-09-08T14-06-20-531Z/`.
Native computer use confirmed Ren/v08 selection, rendering, head extremes,
resize, Waking completion and reset. Earlier Cubism report retains 69 tests,
v07 QA, actual picker cancellation and preceding failures. No new full-suite,
physical speech or Mac claim.

## Phase status and unresolved work

- Phases 0–3 accepted/tagged Windows checkpoints; Phase 4 active, unaccepted,
  untagged. Pulled-forward multi-avatar/Cubism tooling does not start identity,
  memory or complete Phase 8. Remaining custom-rig calibration/artistic and
  character/voice quality need operator judgment; writable IDs need not have
  visible rigged art. Raven Speaking does not itself drive the beak.
- First-boot wake remains **unresolved**: user reports first wake fails until
  Start Conversation. Continue with actual speech on a failing boot and the
  RAM-only wake meter; synthetic probes did not reproduce the difference.
  [Wake evidence](docs/testing/wake-first-boot-2026-09-06.md).
- Operator scenes/media quality and physical-adapter evidence remain before
  Phase 4 acceptance. [Scene/editor evidence](docs/testing/scene-editor-usability-2026-09-06.md),
  [operator checklist](docs/testing/phase4-scene-media-windows-checklist.md),
  [media RCA](docs/testing/avatar-media-rca-2026-09-05.md),
  [earlier multi-avatar evidence](docs/testing/multi-avatar-qa-2026-09-06.md).
- Phases 5 Identity, 6 Memory then 7 Field Hardening remain sequential. Phase 7
  retains P2-D2 offline wake, multi-speaker corpus, 19/20 live-wake sample and
  30-minute ambient/TV negatives. Mac mini port/evidence follow PC development.

## History

[Superseded handoff](docs/archive/progress-before-cubism-2026-09-08.md) preserves
prior delivery/evidence and unresolved findings; [older archive](docs/archive/progress-through-2026-09-06.md)
retains accepted-unit identifiers and earlier failures. [Prior harness audit](docs/testing/harness-audit-2026-09-06.md)
is historical. Compaction does not change phase acceptance or delete evidence.
