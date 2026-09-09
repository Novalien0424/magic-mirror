# Magic Mirror — Durable rulings

[AGENTS.md](AGENTS.md) owns execution policy and canonical invariants;
[PROGRESS.md](PROGRESS.md) owns current status and evidence. This ledger keeps
decisions that change implementation. Detailed historical records are
[archived](docs/archive/decisions-through-2026-09-06.md), not deleted.

## Scope and sequence

- **2026-09-05:** the operator pulled multi-avatar Console work forward:
  one loaded public character at a time; personality/style/base voice, public
  prompt inspection, per-avatar presentation/scenes/triggers and shared/locked
  media/actions. Avatar IDs are public character configuration, never guest
  identity or memory ownership. This subset overrides its former Phase 8
  deferral, not phase acceptance or guest-identity/memory sequencing.
- That request permits relevant PRD/local harness changes; no global plugin
  rewrites, dependency upgrades or weaker privacy/QA guarantees are implied.
- Phase order: 0 Foundation/Console → 1 Realtime Voice → 2 Wake Lifecycle →
  3 Avatar/Audio → 4 Scenes → 5 Identity/Profiles → 6 Memory → 7 Field Hardening.
  Remaining Phase 8 scope is custom Cubism authoring/calibration and
  character/voice quality. Cubism rigging is not ML training.
- **2026-08-27:** Windows is the engineering and functional-verification host.
  Mac mini M4 port, TCC, signing/entitlements, packaged workers, LaunchAgent,
  power/performance and wake revalidation follow PC development. Windows tags
  do not establish Mac deployment readiness.
- The accepted Phase 2 Windows checkpoint explicitly deferred P2-D2 offline
  wake, 19/20 live-wake sampling, multi-speaker accuracy and the 30-minute
  ambient/TV negative run to Phase 7. They are not Phase 2 passes.
- Historical prep-only permission (2026-08-24) covered isolated synthetic
  P2/P3/P4/P7 artifacts, not runtime wiring, IPC/schema/dependencies/config,
  device/network access, demos or promotion. The separate 2026-08-27 overlap
  allowed Phase 2 engineering from a frozen Phase 1 candidate; human acceptance
  and tags still followed phase order. Neither is a standing parallel-phase waiver.

## Personal-build credential ruling — 2026-08-23 (current)

Electron Main alone loads `OPENAI_API_KEY` from ignored root `.env`.
No Console provisioning, `safeStorage`, Keychain, DPAPI, process-environment
or alternate-key fallback. Missing/empty/read failures are metadata-only reasons.
The master key never enters renderer data, config, logs, exports, tests or
agent evidence; agents/workers never inspect its value. Only the short-lived
Realtime credential crosses to the renderer. This supersedes older product
credential instructions; all other canonical invariants remain unchanged.

## Ownership, persistence and recovery

- One Main lifecycle owner; cloud failure → OfflineLoop, local core failure →
  Maintenance. An unrelated adapter cannot gate conversation. One failed
  renderer recreation precedes exit 1; the user LaunchAgent
  `KeepAlive={SuccessfulExit=false}` is the sole restart owner.
- Config separates `schemaVersion` from `configVersion`. Migrations are atomic,
  preserving operator values; unsupported schemas visibly enter Maintenance.
  Active → Previous → packaged Default recovery is only for corrupt/missing/
  unreadable data, never silent model substitution.
- Main-only `node:sqlite`: foundation `app_migrations` table, foreign keys, WAL,
  integrity check, transactional migrations, defensive health and idempotent
  close. Online backup uses exported `backup(sourceDb, path, options)`, not
  `db.backup`. SQLite failure cannot block unrelated adapters/conversation.
- Metadata telemetry: RAM ring 2,000; rotating JSONL 5 MB × 5; writer queue
  1,000; oldest overflow increments `telemetryDroppedCount`. Allowed fields:
  time/module/event/status, optional duration/error code/session or scene ID/
  reason/source. No raw content, raw errors, credentials, frames or embeddings.
  Delivery failure stays visible and non-blocking.
- Robustness uses explicit ownership, bounded cleanup/retry and focused
  failure tests, not shadow controllers or hard-coded provider taxonomies.
  Historical H6 external workers/envelopes are retired.

## Voice and microphone contracts

- Runtime IDs and voices come from versioned configuration. Session snapshots
  freeze at creation; job snapshots freeze at enqueue. Publish affects only
  future sessions/jobs. Worker-model settings are separate from product models.
- Main atomically snapshots the published model and realtime identity before
  credential minting; the renderer receives a validated/frozen identity+secret
  DTO with 600-second expiry. Missing identity does not call the broker.
- One browser runtime handles start/rollover/stop/interrupt/dispose.
  `realtimeSessionId` authorizes stale-event rejection; generation is diagnostic,
  except the positive Main start-bundle generation required to commit activation.
  Main owns pending activation/rollover; old or wrong-state outcomes are reasoned
  metadata-only ignores.
- Exactly one microphone owner, explicit release then acquire. Stop
  caller-owned renderer tracks before returning ownership to wake. Handoff
  failure is Maintenance, not cloud OfflineLoop.
- Profile change closes old-owner history, confirms in a clean Persona+Master
  session, then updates the agent. Guest/candidate IDs remain Main-only.
  Final transcripts are bounded session RAM; stop/offline/rollover/restart
  clear them. Extraction uses the turn-start owner and skips control turns.
- Audible playback completion, not generation completion, governs idle,
  rollover and farewell. Use the accepted output-buffer event/analyser path;
  interruptions stop output and coalesce duplicate requests.
- Rollover timer is 60 minutes. One Main probe schedule at 5/15/30/60 seconds
  checks via the ephemeral broker after cloud failure, discards secrets in RAM,
  and returns Dormant on success or exhaustion. No automatic full-session
  reconnect; Manual Start owns the next session; shutdown cancels probes.
- Console Start/Disconnect and zero-argument interrupt use validated
  Console-only IPC through tracked Mirror webContents. No guest IDs in tools.
  Keep the authoritative `handleSimulator` response shape.
- **2026-08-27 RCA:** earlier model-access failures actually loaded a mock ID
  from non-isolated userData. The live flag now selects isolated data.
  Provider prose is not proof of entitlement; use bounded transport/status
  categories. Historical failed runs remain failed.

## Wake, avatar and scene decisions

- One replaceable, hashed sherpa-onnx package binds phrase, platform/version,
  tuning and corpus evidence; no Porcupine or runtime engine fallback.
  Custom phrases use the chosen model's token encoding, not neural training.
  Publish requires next app start for a changed wake package.
- Chinese KWS uses model-owned tokens, ppinyin, 16 kHz / featureDim 80 and
  reset after detection. Package tuning/corpus, not a fabricated per-event
  confidence score, controls acceptance. Revalidate on final Mac hardware.
- Default wake phrase is customizable (`魔鏡阿魔鏡`). Sleep is an Active-only
  directed command, never a wake keyword. Preserve configured exact farewell,
  finish actual playback, close Realtime, release mic and become Dormant.
  Quoted/negated/hypothetical/incidental mentions do not execute sleep.
  Current avatar configuration supersedes historical fixed farewell wording.
- Cubism uses official vendored Framework/Core, WebGL2 and closest 9:16 display.
  Actual output-audio RMS/envelope is the lip-sync baseline; MotionSync is
  optional, not a retroactive Phase 3 gate. Custom rig work remains scoped.
- Scene trigger is normalized exact full-transcript match once per turn;
  approved presets alone control hardware. Public scene/trigger/action IDs
  are not guest IDs. Draft tests must not silently publish or switch avatars.

## Dedicated Cubism Console — 2026-09-08

- The operator pulled forward a separate **Live2D Cubism** library/test page.
  A rig is a reusable asset, not a public character profile or guest identity.
  Validated managed imports are rediscovered after restart; rejected bundles
  are reported. Draft assignment remains an explicit Appearance edit.
- Select/load in this section owns only a local, silent preview: no publication,
  live Mirror switch, microphone acquisition or provider call. Preview controls
  are opt-in and unavailable to the normal Mirror.
- Expose every exported motion group/index and expression, plus actual MOC
  parameter IDs/bounds/defaults/readback. Lifecycle playback still defaults
  to clip zero. Writable parameters do not guarantee visible rigged artwork;
  a Speaking motion does not replace external audio-driven mouth input.
- Timed tests, reset, replacement, unload and page leave have explicit cleanup.
  Reset stops motions/expressions and restores actual defaults; parameter
  overrides follow automatic effects only in the test preview. Preserve exact
  bounds/defaults without HTML range-step quantization.
- Dedicated Cubism QA uses isolated data and production controls. Optional
  external rig coverage must be explicitly supplied and identified; built-in
  fixture success cannot stand in for Raven. Hidden-Mirror Console coverage
  is not portrait-display, physical speech or phase-acceptance evidence.

## Avatar framing — 2026-09-08

- Default framing is model canvas height, followed by any explicit model3
  Layout. Per-frame drawing and resize create the projection/MVP without
  changing the model matrix. Canvas width in export units is not a framing
  threshold; horizontal padding and equivalent PPU must not shrink artwork.
- Console and Mirror share this renderer. Keep the existing 9:16 viewport,
  aspect preservation, DPR handling, model assets and parameter/motion ranges.
  No per-ID multiplier, dynamic alpha-bounds fit or CSS zoom workaround.
- Matching the v07 baseline does not certify safe crop for every v08 extreme.
  Model-specific fixed Layout calibration is separate from the product scale
  regression; do not silently alter exports or publish an unfinished draft.

## Project-owned Raven assets — 2026-09-09

- User-approved v10 master lives in `resources/avatar/Raven/v10/`, with
  exported files in `runtime/` and editable CMO/PSD sources kept separately.
  Preserve versioned masters; new authoring creates a new version.
- Console still imports a validated copy into user data `assets/avatars/`.
  Do not edit managed runtime files or auto-publish to synchronize a master.
  This archival change does not automatically bundle Raven or archive every
  future external import; the build's Ren-only copy remains unchanged.
- Runtime and checksum inventory are Git-eligible. The large editable/QA
  archive is explicitly ignored and requires separate out-of-band backup.
  A local project copy is not a commit, push or off-machine backup. See
  [asset storage policy](resources/avatar/Raven/README.md).

## Evidence and protected history

- 2026-09-09: Library names/versions are explicit operator metadata in a
  managed `avatar-label.json` sidecar, not filename/UUID guesses or published
  character configuration. Missing versions remain visibly unknown; invalid
  labels degrade visibly without hiding an otherwise valid rig. The same
  optional sidecar can travel with future exports. See
  [persistent label contract](docs/testing/avatar-library-labels-2026-09-09.md).

Mock, unavailable and real evidence remain distinct. A deterministic recorder
cannot label a non-real result passed; automation does not establish physical
sound, hardware effects, operator acceptance or Mac readiness.

Historical `.claude/skills/` inputs, protected review/product documents and
the user-owned installer remain protected under AGENTS. Do not change model
pins/dependencies or phase state during harness compaction. The archived ledger
retains exact unit/commit identifiers, fixed old settings, source links and
failed/superseded claims; consult it only for history.
