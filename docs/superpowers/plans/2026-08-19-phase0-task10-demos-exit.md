# Phase 0 Task 10 — Demos, Exit Evidence, Records, and Release Tag

> For-agentic-workers
>
> Execute this plan only through bounded fresh workers. Every implementation or
> validation dispatch uses:
>
> model: "gpt-5.6-luna"
>
> reasoning_effort: "max"
>
> role: exactly one of "implementer" or "tester"
>
> fresh_worker: true
>
> The task, exact write scope, relevant skills, invariant IDs, evidence format,
> self-review limit, and external root-review boundary are stated again in each
> unit. Implementers write only named files with apply_patch and run nothing.
> Testers own every named validation command and return complete stdout,
> stderr, and exit codes. The interactive root is the sole orchestrator,
> external reviewer, committer, and tag creator, and runs no validation.

## Goal

Finish the last application task of Phase 0 on branch phase0-boot-ipc. Tasks 1–9
are accepted. Task 10 must leave a repeatable, credential-free, metadata-only
demonstration path, authoritative SQLite phase-test records, a packaged
OfflineLoop asset, complete exit evidence, and a recoverable annotated release
tag. Phase 1 remains blocked until the evidence is accepted by the interactive
root and phase0-v0.3.1 exists.

The settled application state is part of this plan: the Main SQLite file is
join(app.getPath('userData'), 'mirror.sqlite'); schema v1 already exposes health
and close; Console already validates the exact
{phase,demoId,build,time,result,note} shape, orders newest first, limits to 20,
and currently receives an empty reader from boot; telemetry is supplementary
bounded RAM/rotating JSONL and is never authoritative phase storage; lifecycle,
simulator, Config/Models, Console, smoke, snapshots, and fallback are accepted;
Mirror currently points at missing resources/mock/offline-loop-v1.mp4 and has a
nonblack fallback; resources/macos has the accepted Info.plist additions,
entitlements, and LaunchAgent; electron-builder is absent and must be pinned to
26.15.3; smoke exits 0 on success, 2 on unmet criteria, recreates a renderer
once, then exits 1; app.relaunch is forbidden; development is Windows Node
v24.19.0; no OpenAI, credential, device, network, or .env setup is needed.

## Architecture

Main remains the owner of lifecycle, configuration, credentials, SQLite, demo
process identity, and all guest/profile identifiers. The renderer receives
typed, metadata-only Console data and display state. The phase runner starts
isolated Electron processes with explicit demo environment variables and
unique ignored user-data directories. SqliteService is the sole authoritative
phase-test writer and reader; the bounded telemetry sink records only
metadata-only operational markers.

The data and process topology is:

    phase0 demo runner
      -> isolated Electron Main process
        -> validated MIRROR_PHASE0_USER_DATA_ROOT and MIRROR_USER_DATA_DIR
        -> SqliteService -> mirror.sqlite
        -> Console phase-test reader and metadata events
        -> Mirror OfflineLoop or Maintenance display
        -> bounded telemetry markers

The lifecycle and accepted service instances are reused. Task 10 adds seams
only where the settled contracts require boot wiring, package asset
availability, deterministic fixture injection, reopen verification, or final
evidence. No second service, alternate restart owner, provider call, model
resolver, or parallel microphone owner is introduced.

## Tech Stack

- Windows development environment with Node v24.19.0; the target remains
  macOS, but Windows evidence does not field-verify macOS Keychain, TCC,
  signing, entitlements, packaged-worker, or LaunchAgent behavior.
- Electron 43.x, electron-vite 5, TypeScript, React, and Main-owned
  node:sqlite.
- Electron safeStorage remains the credential boundary: DPAPI on Windows
  development and Keychain on the target Mac.
- electron-builder is an exact devDependency pin at 26.15.3. Generation uses
  the checked-in base64 source and Node only; it does not use ffmpeg or
  network access.
- The only restart owner is the user LaunchAgent with
  KeepAlive = { SuccessfulExit = false }. In-app recovery recreates a failed
  renderer once and exits with code 1; it never calls app.relaunch.

## Spec

Task 10A supplies schema v2 and the boot-owned Console reader. Migration rows
are ordered as 1 foundation_baseline and 2 phase_test_records. The
phase_test_records table has exactly this schema contract and column order:

    sequence INTEGER PRIMARY KEY AUTOINCREMENT;
    phase TEXT NOT NULL CHECK (phase = '0');
    demo_id TEXT NOT NULL CHECK (demo_id IN ('P0-D1','P0-D2','P0-D3','P0-D4','P0-D5'));
    build TEXT NOT NULL;
    time TEXT NOT NULL;
    result TEXT NOT NULL CHECK (result IN ('passed','failed','mock_passed'));
    note TEXT NOT NULL;

Application validation additionally enforces canonical ISO time and bounded
metadata-safe build/note. Existing v1 databases migrate in place. An empty
database creates v1 followed by v2.
Malformed, gapped, and future migration histories are rejected.

appendPhaseTestRecord uses BEGIN IMMEDIATE, inserts one validated row, prunes
all but the newest 20 rows by sequence descending, and COMMITs. Any failure
rolls back. readPhaseTestRecords('0') returns at most 20 rows newest by
sequence descending and returns defensive copies. Calls after close fail using
the existing service error convention with stable metadata only. Boot wires
this reader into the existing Console reader. App close flushes telemetry and
closes SQLite exactly once.

Task 10B makes the OfflineLoop asset reproducible. The tracked source is
resources/offline-loop/offline-loop-v1.mp4.base64 and the tracked generator is
scripts/generate-offline-loop.mjs. The generator strictly decodes the source,
checks one fixed SHA-256 and one fixed byte length for offline-loop-v1.mp4,
and atomically writes the ignored output
resources/generated/mock/offline-loop-v1.mp4. The fixed hash and byte-length
pair is declared as one checked-in generator/test contract and is reused by
generation, preflight, and packaging checks; no output-derived expected value
is accepted.

electron.vite.config.ts sets renderer publicDir to resources/generated, so the
accepted Mirror source path ../mock/offline-loop-v1.mp4 resolves in both dev
and packaged renderer output. The nonblack fallback remains in place. Starting
preflight emits asset_ready or asset_unavailable. An unavailable asset is
visitor-visible and carries a stable metadata reason. .gitignore already has
`.superpowers/`, which covers every Task 10 SDD artifact path. The only new
ignore rule is `resources/generated/`; no redundant `.superpowers` child rules
are added. The exact ignored tester paths remain named in each tester write
scope below while the base64 source stays tracked.

package.json pins electron-builder at 26.15.3 and adds these exact script
contracts:

    "generate:offline-loop": "node scripts/generate-offline-loop.mjs"
    "predev": "npm run generate:offline-loop"
    "prebuild": "npm run generate:offline-loop"
    "package": "electron-builder --dir --publish never"
    "smoke": "electron ."

The package candidate is prepared in the ignored preflight directory, and the
accepted package-lock textual diff is applied with apply_patch. The
implementation worker never installs dependencies. Task 10 makes the explicit
packaging identity decision `appId: com.magicmirror.app` and
`productName: Magic Mirror`. The productName preserves the accepted LaunchAgent
executable path; the appId is a new Task 10 decision and is not inferred from
the LaunchAgent label. The exact macOS files are
`resources/macos/Info.plist.additions.xml` for `extendInfo` and
`resources/macos/entitlements.plist` for both `entitlements` and
`entitlementsInherit`; `resources/macos/com.magicmirror.launchagent.plist`
remains the sole restart-owner reference.

electron-builder.yml declares `files` as exactly `out/**/*` plus
`package.json`, asar true, and `asarUnpack` as exactly
`out/renderer/mock/*.mp4`. Its `extraResources` contains exactly these two
FileSets:

    resources/config/default.json -> config/default.json
    resources/generated/mock/offline-loop-v1.mp4 -> mock/offline-loop-v1.mp4

The two declared package placements are intentional; no third or untracked
source asset is allowed. The config also declares mac hardenedRuntime and an
unpacked Windows x64 target. The packaging check is configuration/schema-only
for macOS on Windows.

Task 10C adds one Main-owned phase0-demo-runner, one integration test, and one
CLI script. The runner reuses accepted lifecycle, Config/Models, Console,
simulator, SQLite, and telemetry services. It starts isolated processes with
MIRROR_PHASE0_DEMO, MIRROR_PHASE0_USER_DATA_ROOT, MIRROR_USER_DATA_DIR, and
MIRROR_BUILD_COMMIT, validates strict timeouts and markers, and maps a
successful demo to exit 0 and a contract/demo failure to exit 2. Before
app.whenReady(), Main may call app.setPath('userData', exactDirectory) only
when MIRROR_PHASE0_DEMO is present or smokeMode.kind is on, and only after
resolving the root and directory and proving the directory is a nonempty
strict descendant of the root. Missing or invalid isolation exits the
demo/smoke contract with code 2; normal runtime is unchanged.

The deterministic fixtures are fixture-realtime-p0-v2,
fixture-transcription-p0-v2, and fixture-extractor-p0-v2 with
personaName Phase0Fixture. The invalid Draft has an empty realtime model ID.
The failing mock reports cause=mock_probe_failed. No provider is called.

P0-D1 observes exactly starting, dormant, activating, active, suspending,
dormant. P0-D2 independently demonstrates cloud failure as visible, nonblack
OfflineLoop and local-core failure as visible, nonblack Maintenance, both with
reason events. P0-D3 queries existing Console Overview, Events, and Phase Tests
for transitions, last error, and fallback. P0-D4 uses independent process A
and B with the same user-data directory to prove config, phase record, and
reopen of exactly one allowlisted metadata tuple from
`<userData>/telemetry/telemetry-0.jsonl`; process A flushes/closes exactly once,
and process B emits only `event=readable` without raw lines or telemetry
authority. P0-D5 proves exact fixture routing, snapshot retention until
explicit next, rollback with nonModelChanges true, successful
mock_passed/source simulator, and preservation of Active version/fingerprint
after invalid Draft and failing mock.

Every demo attempt, including a failed attempt, gets one SqliteService phase
record. Telemetry remains supplementary. The only allowed demo markers are
PHASE_DEMO_START, PHASE_DEMO_STEP, PHASE_DEMO_RESULT, PHASE_RECORD_WRITTEN,
PHASE_REOPEN_RESULT, and OFFLINE_LOOP_SAMPLE. Markers contain IDs, enums,
counts, timings, statuses, reasons, hashes, paths, and exits only. D5 fixture
values appear only in isolated assertions and an evidence hash, never in
telemetry.

Task 10D writes one exact final evidence artifact, updates PROGRESS.md only
after tester PASS and external root review, leaves DECISIONS.md unchanged,
and reserves commit/tag operations for the root. The final evidence includes
Node/npm versions, focused and full tests, both typechecks, build, ten smoke
boots, all five demos, the actual 1,800,000 ms OfflineLoop soak with
`--soak-ms 1800000`, `--sample-ms 300000`, process timeout
`--timeout-ms 1920000`, `--marker-timeout-ms 15000`, and
`--no-time-compression`, negative scans, v26 schema/config checks, unpacked
Windows x64 hashes/decodability, and exact Task 10 whitespace checks.

## Global Constraints

- The sole implementation-plan write is this file. Future Task 10A/10B/10C
  implementation workers write only their named files with apply_patch. The
  Task 10A focused testers write no artifact; retained Task 10A demo data is
  limited to
  .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/.
  The Task 10B preflight tester may write only
  .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/;
  its generation/package validation may also write only resources/generated/.
  The Task 10C tester may write only
  .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/.
  The Task 10D final tester may write only these five exact paths:
  .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md;
  .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/;
  .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/windows-unpacked/
  only (not the whole task10b-package-preflight/ directory); resources/generated/;
  and out/. The out/ path is the existing ignored output written by npm run
  build. No other final-tester path is writable. The post-PASS implementer may
  update only PROGRESS.md after tester PASS and root authorization. DECISIONS.md
  remains unchanged without separate root authorization.
- Task 10A/10B/10C use this strict sequence, without combining gates:
  [ ] fresh Luna/max implementer writes focused RED tests only with apply_patch
      and runs nothing
  [ ] fresh Luna/max tester runs only the named RED command and returns full
      stdout, stderr, and exit code
  [ ] fresh Luna/max implementer writes the smallest production change only
      with apply_patch and runs nothing
  [ ] fresh Luna/max tester runs only the named GREEN/fresh validation command
      and returns full stdout, stderr, and exit code
  [ ] interactive root externally reviews the worker result and evidence
- No implementation worker installs, commits, pushes, tags, delegates,
  dispatches, or creates a review worker. Testers own all named validation; the
  root runs no validation command. Package/config preflight is tester-owned and
  may write only its exact ignored artifact directory, with generation/package
  validation additionally limited to resources/generated/.
- All worker prompts repeat model gpt-5.6-luna, max reasoning, exact role,
  fresh_worker true, bounded task/non-goals, exact read/write paths,
  applicable invariant IDs, metadata-only evidence, self-review capped at
  three passes, and external interactive-root review.
- Evidence is limited to IDs, enums, counts, timings, statuses, reasons,
  hashes, paths, and exit codes. Never write transcripts, audio, extracted
  memory values, private context, credentials, images, embeddings, prompts
  containing user content, or raw errors to source, telemetry, reports,
  Console events, or evidence.
- The worker model gpt-5.6-luna is a harness route only. It must never appear
  in runtime model configuration, active.json, telemetry, or product output.
  Runtime model IDs come only from versioned configuration, and a failed
  configured ID never silently substitutes another.
- All fallback, ignore, drop, degrade, and cleanup decisions are visible or
  represented by a metadata-only Console reason. Failures degrade without
  gating conversation or unrelated adapters.
- Windows evidence uses safeStorage through DPAPI. It does not claim field
  verification of target-Mac Keychain, TCC, signing, entitlements,
  packaged-worker, or LaunchAgent paths. The LaunchAgent remains the only
  restart owner.
- No unfilled plan field, guessed hash, unbounded output, unresolved choice, or
  implementation shortcut is accepted in the plan or evidence.

## Planned topology/contracts

| Unit | Tracked implementation scope | Ignored evidence/data scope | Authoritative owner |
| --- | --- | --- | --- |
| 10A | tests/unit/sqlite-phase-tests.test.ts; src/main/sqlite-service.ts; src/main/boot.ts; src/main/index.ts | .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/ | SqliteService for phase records; Main for lifecycle/close |
| 10B | .gitignore; package.json; package-lock.json; electron-builder.yml; electron.vite.config.ts; resources/offline-loop/offline-loop-v1.mp4.base64; scripts/generate-offline-loop.mjs; src/renderer/mirror/App.tsx; src/main/boot.ts; src/main/index.ts | .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/; resources/generated/ | generator and packaged resource contract |
| 10C | RED: tests/integration/phase0-demos.test.ts; production: src/main/phase0-demo-runner.ts; scripts/run-phase0-demos.mjs; src/main/boot.ts; src/main/index.ts; src/main/console-data.ts; src/main/console-config.ts; package.json | .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/ | isolated Main process and existing services |
| 10D | no application implementation; post-PASS implementer writes PROGRESS.md only after tester PASS and root authorization | final tester: .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md; .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/; .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/windows-unpacked/ only (not the whole task10b-package-preflight/ directory); resources/generated/; out/ (the existing ignored output written by npm run build); no other final-tester path is writable | tester evidence; root acceptance/commit/tag |

The SqliteService contract is intentionally narrow: append validates before
opening the transaction; the transaction is BEGIN IMMEDIATE, insert, newest-20
prune, COMMIT; any insert/prune/commit failure rolls back; read filters phase
0, orders sequence DESC, caps at 20, and copies returned values. A close guard
makes repeated flush/close safe and makes post-close calls report only stable
metadata. The Console reader consumes this exact service, not telemetry.

The package contract has one canonical generated byte stream. Generation is
strict decode, fixed hash/length verification, temporary sibling write, flush,
atomic replace, and metadata-only result. The source file and generator are
tracked; generated output and all package/evidence/user-data output are
ignored. Missing/corrupt assets choose asset_unavailable plus the existing
nonblack fallback and never a black screen.

The phase runner owns per-run IDs and descendant checks. It resolves the
Task10 root and refuses a user-data path that is the root itself, an ancestor,
or outside the root. A successful non-final run may be deleted only in its
own resolved child directory. Failed runs and the final accepted run are
retained. No runner path can delete a sibling, the Task10 root, or tracked
content.

## Task 10A — SQLite phase-test records

### Objective

Add schema v2 and the Main boot wiring needed for authoritative Phase 0
phase-test records. Preserve v1 in-place migration, reject malformed/gapped/
future histories, validate the exact shared PhaseTestRecord contract, make
append atomic with newest-20 pruning, make reads newest-first and defensive,
and make shutdown flush telemetry and close SQLite exactly once.

### Files

The RED implementer writes only tests/unit/sqlite-phase-tests.test.ts with
apply_patch and runs nothing. The production implementer may then write only
src/main/sqlite-service.ts, src/main/boot.ts, and src/main/index.ts with
apply_patch and runs nothing. Demo data, if produced later, is ignored under
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/.
No other path is writable in this unit.

### Invariants

- [ ] Check 1: records and diagnostics contain metadata only; no transcript,
      audio, extracted memory value, or private context is persisted.
- [ ] Check 3: guestId and candidateProfileId remain Main-only and cannot enter
      the phase-record or Console payload.
- [ ] Check 9: closed, rejected, pruned, and fallback outcomes have stable
      metadata reasons and are not silently swallowed.
- [ ] Check 10: SQLite or telemetry failure cannot gate unrelated conversation
      or Console operation.
- [ ] Check 11: no runtime model ID or fallback model is added by persistence.
- [ ] Check 12: credential material is never read into records, telemetry, or
      exports.
- [ ] Preserve checks 2, 4, 5, 6, 7, and 8 unchanged as future/non-regression
      boundaries; this unit does not implement face, profile, extraction,
      spell, or microphone behavior.

### RED command and expected failure

The first gate is a fresh worker dispatch:

    model: "gpt-5.6-luna"
    reasoning_effort: "max"
    role: "implementer"
    fresh_worker: true
    task: write only the focused SQLite phase-record RED tests
    write_scope: tests/unit/sqlite-phase-tests.test.ts via apply_patch only
    skills: .agents/skills/mm-phase-workflow/SKILL.md,
      .agents/skills/mm-invariants/SKILL.md,
      .agents/skills/mm-electron-foundation/SKILL.md
    self_invariants: 1, 3, 9, 10, 11, 12; preserve 2, 4, 5, 6, 7, 8
    evidence: test path, diff summary, no command run, metadata-only risks
    self_review: own diff only, at most 3 passes
    root_review: interactive root external review after return

The tester then runs only this RED command from the repository root:

    npx vitest run tests/unit/sqlite-phase-tests.test.ts --reporter=verbose

Expected tester result is exit 1 with complete stdout and stderr showing the
missing v2 migration, exact schema/validation, append/read/closed behavior, or
boot reader/close-once assertions. A passing RED command is a gate failure:
stop and return the complete output without implementing production code.

### Implementation

The four handoffs are sequential:

- [ ] Fresh Luna/max implementer writes the focused RED test file with
      apply_patch only and runs no command.
- [ ] Fresh Luna/max tester runs only the named RED command, returns complete
      stdout/stderr and exit code 1, and writes no artifact.
- [ ] After the RED tester returns the expected exit 1, fresh Luna/max
      implementer writes only the three named production files with
      apply_patch and runs no command. It implements the smallest accepted
      change:
      migration rows 1 and 2; exact table order and validation; canonical ISO;
      bounded safe build/note; BEGIN IMMEDIATE/insert/prune/COMMIT with
      rollback; newest-first defensive reads; stable post-close metadata;
      in-place v1 migration; and boot reader plus one idempotent close path.
- [ ] Fresh Luna/max tester runs only the named GREEN command, returns full
      stdout/stderr and exit code, and writes no artifact.
- [ ] Interactive root externally reviews the diff, output, privacy posture,
      migration rejection cases, and close-once evidence. No worker performs
      this review.

The implementation must call readPhaseTestRecords('0') for the existing
Console reader and must not make telemetry authoritative. It must keep
Main-owned user-data path derivation at
join(app.getPath('userData'),'mirror.sqlite') and must not change normal
runtime path behavior. The append path writes one row for every demo attempt,
including a failed attempt, without storing raw failure text.

### GREEN command and expected result

The fresh tester runs exactly:

    npx vitest run tests/unit/sqlite-phase-tests.test.ts --reporter=verbose

Expected result is exit 0. Full output must show the focused tests for v1 to v2
migration, empty ordered migrations, malformed/gapped/future rejection, exact
schema order, phase/demo/result/time/build/note validation, transactional
rollback, newest-20 pruning, newest-first defensive reads, stable closed
failure, Console reader wiring, and exactly-once boot flush/close. Any nonzero
exit, missing test case, or raw-content output is a stop.

### Demo/evidence

The tester returns a metadata-only report containing the exact changed paths,
test count, pass/fail count, duration, exit code, migration statuses,
record-count bounds, sequence ordering, close count, and stable error codes.
It does not include row note contents beyond safe metadata enums. Later demo
runs must emit PHASE_RECORD_WRITTEN once per attempt and show the record
readable through Console Phase Tests. The ignored user-data path is retained
for failed and final accepted runs and is never copied into tracked evidence.

### Non-goals/risks

No schema v3, ORM, native dependency, telemetry replacement, backup feature,
visitor transcript panel, profile/face behavior, credential handling, or
renderer database access is part of 10A. A malformed migration, transaction
failure, or closed-service call must be visible as stable metadata and must
not be converted into a silent pass. SQLite close must not be duplicated by
both boot and app-level handlers.

## Task 10B — OfflineLoop asset/preflight/packaging baseline

### Objective

Make the OfflineLoop asset reproducible, visible, nonblack, and packageable
without ffmpeg, network access, or a new runtime fallback model. Establish the
tester-owned electron-builder 26.15.3 preflight before RED, apply the accepted
candidate package-lock text without installing in the implementation worker,
wire dev/packaged public assets, preserve the nonblack fallback, and validate
unpacked Windows x64 resource placement and equal hashes.

### Files

Before RED, the preflight tester write scope is exactly
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/.
Generation/package validation may additionally write only resources/generated/.
The implementation RED test is only tests/unit/offline-loop-packaging.test.ts.
The Task 10B production write list is exactly:

    .gitignore
    package.json
    package-lock.json
    electron-builder.yml
    electron.vite.config.ts
    resources/offline-loop/offline-loop-v1.mp4.base64
    scripts/generate-offline-loop.mjs
    src/renderer/mirror/App.tsx
    src/main/boot.ts
    src/main/index.ts

The preflight may contain only copied package files, candidate lock, metadata,
installed dependencies, CLI output, and Windows-unpacked output inside its
named ignored directory. The generation/package-validation tester may write
only that preflight directory and resources/generated/; no other path is in
scope.

### Invariants

- [ ] Check 1: the asset and packaging evidence contain hashes, lengths,
      paths, and statuses only; no audio or private content is recorded.
- [ ] Check 8: asset fallback never acquires or retains a microphone.
- [ ] Check 9: asset_ready/asset_unavailable and nonblack fallback reasons are
      visible or metadata-only Console events.
- [ ] Check 10: missing/corrupt OfflineLoop degrades to visible Maintenance
      and does not gate unrelated conversation or adapters.
- [ ] Check 11: no source model literal or silent model substitution is added.
- [ ] Check 12: package/preflight output never contains credentials or keys.
- [ ] Preserve checks 2, 3, 4, 5, 6, and 7 unchanged as future/non-regression
      boundaries; asset packaging does not implement identity, profiles,
      extraction, control-turn, or scene behavior.

### RED command and expected failure

The tester-owned package preflight must finish before the RED test dispatch.
The fresh tester creates and uses only the exact ignored directory:

    $task10bPreflight = Join-Path (Get-Location) '.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight'
    New-Item -ItemType Directory -Force -Path $task10bPreflight | Out-Null
    Copy-Item -LiteralPath 'package.json' -Destination (Join-Path $task10bPreflight 'package.json') -Force
    Copy-Item -LiteralPath 'package-lock.json' -Destination (Join-Path $task10bPreflight 'package-lock.json') -Force
    Push-Location $task10bPreflight
    npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-dev --save-exact electron-builder@26.15.3

Expected install-preflight exit is 0. The command must be the exact
package-lock-only command above, and the copied candidate files are the only
files it may modify. The tester then runs:

    npm ci --ignore-scripts

Expected exit is 0. It records package/lock SHA-256 hashes and versions with:

    Get-FileHash package.json,package-lock.json -Algorithm SHA256 | ConvertTo-Json -Compress
    node -p "require('./node_modules/electron-builder/package.json').version"

The version command must print exactly 26.15.3 and exit 0. The tester then
validates the installed v26 JSON schema with this exact command against the
exact installed `node_modules/app-builder-lib/scheme.json`:

    node -e "const fs=require('node:fs');const path=require('node:path');const v=require('./node_modules/electron-builder/package.json').version;if(v!=='26.15.3'){console.error(JSON.stringify({status:'unsupported',version:v}));process.exit(1)};const schemaPath=path.resolve('node_modules/app-builder-lib/scheme.json');let schema;try{schema=JSON.parse(fs.readFileSync(schemaPath,'utf8'));if(!schema||typeof schema!=='object'||Array.isArray(schema))throw new Error('malformed')}catch{console.error(JSON.stringify({status:'unsupported',version:v,reason:'malformed_schema'}));process.exit(1)};const names=new Set();const walk=value=>{if(Array.isArray(value)){value.forEach(walk);return}if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){names.add(key);if((key==='definitions'||key==='$defs')&&item&&typeof item==='object'&&!Array.isArray(item))Object.keys(item).forEach(name=>names.add(name));walk(item)}};walk(schema);const required=['hardenedRuntime','entitlements','entitlementsInherit','extendInfo','extraResources','asarUnpack','FileSet'];const missing=required.filter(k=>!names.has(k));if(missing.length){console.error(JSON.stringify({status:'unsupported',version:v,schemaPath:'node_modules/app-builder-lib/scheme.json',missing}));process.exit(1)};console.log(JSON.stringify({status:'supported',version:v,schemaPath:'node_modules/app-builder-lib/scheme.json',keys:required}));"

Expected exit is 0 with status supported and all seven required names:
hardenedRuntime, entitlements, entitlementsInherit, extendInfo,
extraResources, asarUnpack, and FileSet. An absent or malformed schema, any
install failure, version other than 26.15.3, missing key, or candidate lock
mismatch exits 1 and is a stop before RED. The tester returns full output and
writes only inside the preflight directory. It does not modify tracked files.

After that gate, the RED handoff is:

    model: "gpt-5.6-luna"
    reasoning_effort: "max"
    role: "implementer"
    fresh_worker: true
    task: write only the focused OfflineLoop packaging RED test
    write_scope: tests/unit/offline-loop-packaging.test.ts via apply_patch only
    skills: .agents/skills/mm-phase-workflow/SKILL.md,
      .agents/skills/mm-invariants/SKILL.md,
      .agents/skills/mm-electron-foundation/SKILL.md
    self_invariants: 1, 8, 9, 10, 11, 12; preserve 2, 3, 4, 5, 6, 7
    evidence: test path, diff summary, no command run, metadata-only risks
    self_review: own diff only, at most 3 passes
    root_review: interactive root external review after return

The tester runs only:

    Pop-Location
    npx vitest run tests/unit/offline-loop-packaging.test.ts --reporter=verbose

Expected RED exit is 1 with complete stdout/stderr identifying missing source
decode/generation, publicDir path, asset preflight/fallback markers, builder
configuration, or package resource assertions. A RED exit 0 is a gate failure.

### Implementation

The handoffs remain strictly sequential:

- [ ] Fresh Luna/max implementer writes only the focused RED test with
      apply_patch and runs nothing.
- [ ] Fresh Luna/max tester runs only the named RED test after preflight and
      returns complete stdout/stderr and exit code 1. Its exact write scope is
      .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/
      only.
- [ ] After the RED tester returns the expected exit 1, fresh Luna/max
      implementer writes only the exact production list with apply_patch and
      runs nothing. It applies the accepted candidate package-lock textual
      diff exactly; it never runs npm install, npm ci, packaging, or any
      validation command.
- [ ] Fresh Luna/max tester runs only the named GREEN/fresh validation command
      and returns complete stdout/stderr and exit code. Its exact write scope
      is .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/
      and resources/generated/ only.
- [ ] Interactive root externally reviews the asset source/generator,
      ignore rules, package candidate, config schema, nonblack fallback,
      failure markers, and exact scope.
- [ ] No worker installs outside the tester preflight, commits, pushes, tags,
      delegates, or performs root review.

The generator strictly decodes base64, rejects invalid alphabet/padding and
unexpected byte length, checks the fixed hash before and after atomic output,
writes only resources/generated/mock/offline-loop-v1.mp4, and emits metadata.
electron.vite.config.ts points renderer publicDir to resources/generated.
Mirror keeps ../mock/offline-loop-v1.mp4 and its nonblack fallback. Starting
emits asset_ready only after all checks pass; asset_unavailable includes a
stable reason and selects the existing visible fallback.

electron-builder.yml declares the new Task 10 identity
`appId: com.magicmirror.app` and `productName: Magic Mirror`. productName preserves
the accepted LaunchAgent executable path; appId is a new Task 10 decision and
is not inferred from the LaunchAgent label. Its exact `files` contract is
`out/**/*` plus `package.json`; it keeps asar true and
`asarUnpack: out/renderer/mock/*.mp4`. Its `extraResources` contains exactly
these two FileSets:

    resources/config/default.json -> config/default.json
    resources/generated/mock/offline-loop-v1.mp4 -> mock/offline-loop-v1.mp4

The two package placements are intentional. `extendInfo` uses
`resources/macos/Info.plist.additions.xml`; both `entitlements` and
`entitlementsInherit` use `resources/macos/entitlements.plist`; and
`resources/macos/com.magicmirror.launchagent.plist` remains the sole
restart-owner reference. No third or untracked source asset is allowed, and
LaunchAgent semantics are unchanged.

### GREEN command and expected result

The fresh tester runs exactly:

    npx vitest run tests/unit/offline-loop-packaging.test.ts --reporter=verbose

Expected result is exit 0 with complete output proving strict source decode,
fixed hash/length, atomic ignored output, publicDir resolution, asset_ready
and asset_unavailable metadata, visible nonblack fallback, exact v26 config
keys, and no network/ffmpeg/provider call. Any nonzero exit or missing
assertion is a stop.

### Demo/evidence

The tester runs the generator from the repository root:

    npm run generate:offline-loop

Expected exit is 0. It then records the generated hash and length:

    Get-FileHash .\resources\generated\mock\offline-loop-v1.mp4 -Algorithm SHA256 | ConvertTo-Json -Compress
    (Get-Item .\resources\generated\mock\offline-loop-v1.mp4).Length

The values must equal the fixed contract. The generator must not run ffmpeg,
read .env, call a provider, or use network access.

Using the preflight-installed CLI, the tester packages only to the ignored
directory:

    $task10Repo = (Get-Location).Path
    & (Join-Path $task10bPreflight 'node_modules/.bin/electron-builder.cmd') --dir --win --x64 --publish never --config (Join-Path $task10Repo 'electron-builder.yml') --config.directories.output (Join-Path $task10bPreflight 'windows-unpacked')

Expected exit is 0. The tester inspects both exact package locations:

    $packageRoot = Join-Path $task10bPreflight 'windows-unpacked/win-unpacked/resources'
    Get-FileHash (Join-Path $packageRoot 'app.asar.unpacked/out/renderer/mock/offline-loop-v1.mp4'),(Join-Path $packageRoot 'mock/offline-loop-v1.mp4') -Algorithm SHA256 | ConvertTo-Json -Compress
    (Get-Item (Join-Path $packageRoot 'app.asar.unpacked/out/renderer/mock/offline-loop-v1.mp4')).Length
    (Get-Item (Join-Path $packageRoot 'mock/offline-loop-v1.mp4')).Length

Expected output has two equal fixed hashes, two equal fixed byte lengths, and
exit 0. The packaged demo/renderer probe must report a decodable, advancing,
nonblack OfflineLoop through metadata-only markers; no frame or audio is saved.
The preflight and package outputs remain under task10b-package-preflight/.

### Non-goals/risks

No ffmpeg, network download, source video replacement, renderer Node
integration, model fallback, macOS field test, code signing assertion,
LaunchAgent replacement, or third/untracked source asset is allowed. A candidate
electron-builder schema mismatch stops the task before RED. A package that
builds but omits either exact resource location, hash, length, or decodability
does not pass. The generated file, package output, and preflight dependencies
remain ignored and are not added to the commit.

## Task 10C — deterministic P0-D1..P0-D5 plus reopen demo harness

### Objective

Create one deterministic, provider-free, repeatable phase demo harness that
proves P0-D1 through P0-D5 in isolated processes and can reopen the same
user-data directory. Reuse accepted services, make demo-only path injection
occur before ready, record one phase row per attempt, expose bounded
metadata-only markers, prove visible fallbacks, and preserve all privacy,
identity, configuration, lifecycle, and microphone boundaries.

### Files

The RED implementation worker owns only
tests/integration/phase0-demos.test.ts with apply_patch and runs nothing. The
production implementation worker must not edit that RED test and may edit
exactly:

    src/main/phase0-demo-runner.ts
    scripts/run-phase0-demos.mjs
    src/main/boot.ts
    src/main/index.ts
    src/main/console-data.ts
    src/main/console-config.ts
    package.json

It must reuse accepted services and never duplicate them. The integration
tester write scope is exactly
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/;
no other tester artifact path is in scope.

### Invariants

- [ ] Check 1: transcripts, audio, memory values, private context, fixture
      content, and credentials remain RAM-only; evidence has IDs, enums,
      counts, timings, statuses, reasons, hashes, paths, and exits.
- [ ] Check 2: any face result remains a candidate proposal and private memory
      requires explicit verbal confirmation; face behavior is not simulated as
      an authorization shortcut.
- [ ] Check 3: guestId and candidateProfileId stay in Main and never cross
      renderer/model-tool boundaries.
- [ ] Check 4: profile changes close the old session, use a clean
      Persona+Master-only confirmation session, then updateAgent.
- [ ] Check 5: extraction writes to the owner snapshot taken at turn start.
- [ ] Check 6: identity, naming, switching, group, sleep, and spell control
      turns skip personal-memory extraction.
- [ ] Check 7: scenes use normalized exact full-transcript spell matching,
      once per turn, and approved presets only.
- [ ] Check 8: one microphone owner exists; handoff is explicit
      release-then-acquire.
- [ ] Check 9: every fallback, ignore, drop, or degrade is visible or has a
      metadata-only Console reason.
- [ ] Check 10: cloud failure becomes OfflineLoop, local-core failure becomes
      Maintenance, and no unrelated behavior is gated.
- [ ] Check 11: fixture IDs are injected only through versioned demo config;
      no runtime literal or silent substitute is permitted.
- [ ] Check 12: safeStorage remains Main-only and credentials never enter
      runner markers, records, telemetry, or exports.

### RED command and expected failure

The RED dispatch is:

    model: "gpt-5.6-luna"
    reasoning_effort: "max"
    role: "implementer"
    fresh_worker: true
    task: write only the focused deterministic P0-D1..P0-D5 integration RED tests
    write_scope: tests/integration/phase0-demos.test.ts via apply_patch only
    skills: .agents/skills/mm-phase-workflow/SKILL.md,
      .agents/skills/mm-invariants/SKILL.md,
      .agents/skills/mm-electron-foundation/SKILL.md
    self_invariants: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    evidence: test path, diff summary, no command run, metadata-only risks
    self_review: own diff only, at most 3 passes
    root_review: interactive root external review after return

The tester runs only:

    npx vitest run tests/integration/phase0-demos.test.ts --reporter=verbose

Expected RED exit is 1 with complete stdout/stderr identifying the absent
runner, process isolation, marker sequence, fallback, Console query, reopen,
fixture routing, rollback, or phase-record assertions. A passing RED command
is a gate failure and stops the unit.

### Implementation

The strict sequence is:

- [ ] Fresh Luna/max implementer writes only the focused integration RED tests
      with apply_patch and runs nothing.
- [ ] Fresh Luna/max tester runs only the named RED command and returns
      complete stdout/stderr and exit code 1. Its exact write scope is
      .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/
      only.
- [ ] After the RED tester returns the expected exit 1, fresh Luna/max
      implementer writes only these production files with apply_patch and runs
      no command: src/main/phase0-demo-runner.ts,
      scripts/run-phase0-demos.mjs, src/main/boot.ts, src/main/index.ts,
      src/main/console-data.ts, src/main/console-config.ts, and package.json.
      It must not edit tests/integration/phase0-demos.test.ts, call a provider,
      or add a service copy.
- [ ] Fresh Luna/max tester runs only the named GREEN/fresh validation command
      and returns complete stdout/stderr and exit code. Its exact write scope
      is .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/
      only.
- [ ] Interactive root externally reviews all five demos, isolation,
      metadata-only markers, record count, cleanup proof, and exact scope.
- [ ] No worker installs, commits, pushes, tags, delegates, creates a review
      worker, or claims root review.

The CLI uses strict defaults timeout-ms=120000 and marker-timeout-ms=15000 for
each demo process. It sets MIRROR_PHASE0_DEMO,
MIRROR_PHASE0_USER_DATA_ROOT, MIRROR_USER_DATA_DIR, and MIRROR_BUILD_COMMIT
for every child. It creates a unique child directory below the Task10 root for
each run, resolves the root and directory, and proves the directory is a
nonempty strict descendant of the root. Before app.whenReady(), Main may call
app.setPath('userData', exactDirectory) only when MIRROR_PHASE0_DEMO is present
or smokeMode.kind is on. Missing or invalid isolation exits the demo/smoke
contract with code 2. Normal runtime has no changed user-data or ready
ordering.

The runner maps assertion, marker, process, and cleanup-contract failures to
exit 2 and success to exit 0. Each demo attempt writes exactly one phase record,
including failure, and emits PHASE_DEMO_START,
PHASE_DEMO_STEP, PHASE_DEMO_RESULT, and PHASE_RECORD_WRITTEN. Reopen emits
PHASE_REOPEN_RESULT. OfflineLoop soak emits OFFLINE_LOOP_SAMPLE. No marker
contains a transcript, audio, memory value, private context, credential, image,
embedding, prompt, or raw error.

P0-D1 asserts the exact lower-case lifecycle sequence:

    starting, dormant, activating, active, suspending, dormant

P0-D2 runs two independent cases. cloud-failure must report visible,
nonblack OfflineLoop and a stable cloud failure reason. core-failure must
report visible, nonblack Maintenance and a stable local-core failure reason.
Neither case may gate unrelated Console or conversation paths.

P0-D3 queries the existing Console Overview, Events, and Phase Tests views or
their accepted data contracts and asserts transitions, last error, fallback,
record status, and reason are available without private content.

P0-D4 starts independent process A, publishes deterministic config, writes a
phase record, and emits exactly one deterministic metadata-only tuple:

    {module:'app',event:'phase_reopen_probe',status:'success',source:'contract_test',reason:'process_a_metadata_probe'}

Process A flushes and closes using the exactly-once shutdown path. Independent
process B opens the same exact user-data directory and proves the config and
phase record. It reads only `<userData>/telemetry/telemetry-0.jsonl` through a
bounded demo-only JSONL parser in src/main/phase0-demo-runner.ts, matches only
that allowlisted tuple, and emits only `event=readable` in
PHASE_REOPEN_RESULT. It never outputs raw lines, expands Telemetry.readPage(),
or makes telemetry authoritative. No src/main/telemetry.ts edit is allowed;
P0-D4 never uses app.relaunch.

P0-D5 injects exactly fixture-realtime-p0-v2,
fixture-transcription-p0-v2, and fixture-extractor-p0-v2 with
personaName Phase0Fixture into their respective factories. It proves invalid
Draft with empty realtime ID is rejected without replacing the active
version/fingerprint; successful mock probe has cause/status source simulator
and result mock_passed; failing mock has cause=mock_probe_failed and also
preserves Active version/fingerprint. Old snapshots remain until explicit
next. Rollback reports nonModelChanges true. Fixture assertions are isolated
and any evidence hash is metadata-only.

Cleanup deletes only a resolved successful child run when retention is not
requested. A failed run is always retained. Every final accepted run is
invoked with --retain-on-success and retained. The runner refuses to delete
the Task10 root, any ancestor, any sibling, or any tracked path.

### GREEN command and expected result

The fresh tester runs only:

    npx vitest run tests/integration/phase0-demos.test.ts --reporter=verbose

Expected exit is 0. Complete output must prove all five demo contracts,
isolated process boundaries, exact D1 sequence, both D2 visible nonblack
states/reasons, D3 Console queries, D4 reopen, D5 fixture/snapshot/rollback
behavior, one record per attempt including failed, marker allow-list, and
descendant-only cleanup. Any nonzero exit, provider call, raw-content marker,
or missing phase record is a stop.

### Demo/evidence

Run these repeatable commands from the repository root. Each command has
exactly one demo ID, the same bounded timeout, a unique ignored user-data
child created by the runner, and retained final output:

    node scripts/run-phase0-demos.mjs --demo P0-D1 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success

Expected exit 0 and markers PHASE_DEMO_START,
PHASE_DEMO_STEP(state=starting), PHASE_DEMO_STEP(state=dormant),
PHASE_DEMO_STEP(state=activating), PHASE_DEMO_STEP(state=active),
PHASE_DEMO_STEP(state=suspending), PHASE_DEMO_STEP(state=dormant),
PHASE_RECORD_WRITTEN, and PHASE_DEMO_RESULT(result=passed).

    node scripts/run-phase0-demos.mjs --demo P0-D2 --case cloud-failure --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success

Expected exit 0, visible nonblack OfflineLoop, a stable cloud reason,
OFFLINE_LOOP_SAMPLE, PHASE_RECORD_WRITTEN, and PHASE_DEMO_RESULT(result=passed).

    node scripts/run-phase0-demos.mjs --demo P0-D2 --case core-failure --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success

Expected exit 0, visible nonblack Maintenance, a stable local-core reason,
PHASE_RECORD_WRITTEN, and PHASE_DEMO_RESULT(result=passed).

    node scripts/run-phase0-demos.mjs --demo P0-D3 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success

Expected exit 0, Console Overview/Events/Phase Tests query markers, transitions,
last-error/fallback reason metadata, PHASE_RECORD_WRITTEN, and a passed result.

    node scripts/run-phase0-demos.mjs --demo P0-D4 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success

Expected exit 0, independent process-A and process-B markers,
PHASE_REOPEN_RESULT(config=readable,phaseRecord=readable,event=readable),
where the event field is emitted only as `event=readable` after process B
matches the one allowlisted process-A tuple in
`<userData>/telemetry/telemetry-0.jsonl`. It also emits
PHASE_RECORD_WRITTEN, no raw JSONL lines, no app.relaunch, and a passed result.

    node scripts/run-phase0-demos.mjs --demo P0-D5 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success

Expected exit 0, fixture routing hashes, snapshot/rollback metadata,
nonModelChanges=true, mock_passed/source=simulator, invalid-Draft and
mock_probe_failed preservation statuses, PHASE_RECORD_WRITTEN, and a passed
result. Every command returns exit 2 on a demo contract failure and retains
that failed child directory. No runner output includes raw fixture values.

### Non-goals/risks

No real provider, OpenAI credential, camera, microphone, face embedding,
transcript, audio, memory extraction value, hardware, macOS field test, app
relaunch, second restart owner, continuous identity tracking, scene hardware
control, or phase advancement is added. The demo harness is not a runtime
model resolver and does not change normal startup. A failure to isolate
userData, reopen SQLite, preserve Active configuration, emit a reason, or
retain failed evidence is a hard stop.

## Task 10D — exit evidence, project records, external root decision, tag

### Objective

Produce complete final metadata-only exit evidence for Task 10 and the Phase 0
release decision. The tester owns every validation command and writes only these
five exact final-tester paths: .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md;
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/;
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/windows-unpacked/
only (not the whole task10b-package-preflight/ directory); resources/generated/;
and out/. The out/ path is the existing ignored output written by npm run build.
No other final-tester path is writable. After tester PASS and external root review, a fresh implementer updates PROGRESS.md only;
DECISIONS.md stays unchanged. The interactive root alone decides acceptance,
commits, and creates annotated tag
phase0-v0.3.1. No push occurs without user authorization.

### Files

The final tester may write only these five exact paths:

    .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md
    .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/
    .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/windows-unpacked/
    resources/generated/
    out/

The windows-unpacked entry is the only allowed package-output descendant of the
preflight directory; the final tester cannot write the whole
task10b-package-preflight/ directory. The out/ path is the existing ignored
output written by npm run build. No other final-tester path is writable. Before
its first attempted command, the tester creates
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md.
It appends every attempted command's complete stdout, stderr, and exit code
immediately after that attempt, plus metadata-only summaries and paths. It
contains no private values, credentials, transcripts, audio, images,
embeddings, or prompts. After PASS and root authorization, the fresh
implementer may write only PROGRESS.md with apply_patch. DECISIONS.md is not
changed. The root owns the final Task 10 diff review, commit, and annotated
tag, and runs no validation.

### Invariants

- [ ] Check all 1–12 against the complete evidence, with the canonical
      checklist at the end of this plan.
- [ ] Evidence remains metadata-only and does not turn a test fixture into
      user content.
- [ ] Checks 2–8 are explicitly preserved non-regression boundaries even
      though Task 10 does not implement those future domain features.
- [ ] Credential-free operation is proven without reading .env or asserting
      any credential value.
- [ ] Windows results do not overclaim macOS Keychain, TCC, signing,
      entitlements, packaged-worker, or LaunchAgent field verification.

### RED command and expected failure

Task 10D has no new application RED test. Its fail-fast RED gate is the first
prerequisite command:

    node --version

Expected exit is 0 and output must be v24.19.0. A nonzero exit or a different
Node major/minor stops the evidence run before any soak or final PASS.

Before `node --version`, the tester creates the exact final evidence file
listed above and records the evidence-run header. From the first command
onward, every attempted command is appended with complete stdout, stderr, and
exit code. The second fail-fast command is:

    npm --version

Expected exit is 0 and the tester records the returned version. A nonzero exit
stops the evidence run; the file records FAIL and every skipped gate. A
fail-fast at any later gate likewise records FAIL and skipped gates. Only an
all-green run may record PASS.

### Implementation

The final handoffs are:

- [ ] Fresh Luna/max tester creates the exact final evidence file before its
      first command, then runs every command below individually, appends
      complete stdout/stderr and exit code for every attempt, and writes only
      these five exact final-tester paths: .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md;
      .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data/;
      .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight/windows-unpacked/
      only (not the whole task10b-package-preflight/ directory);
      resources/generated/; and out/. The out/ path is the existing ignored
      output written by npm run build. No other final-tester path is writable.
- [ ] The tester stops before the 1,800,000 ms soak if Node/npm, candidate
      lock, generated hash/decodability, v26 config, smoke/demos, or
      credential-free preflight fails; it records FAIL and skipped gates.
      A short soak is never a pass. Only all-green gates may record PASS.
- [ ] Interactive root externally reviews the exact Task 10 diffs and full
      evidence. The root runs no validation command.
- [ ] After tester PASS and root review, a fresh Luna/max implementer writes
      only PROGRESS.md with apply_patch and runs nothing, recording the
      accepted Task 10 result and tag prerequisite.
- [ ] A static tester reads the PROGRESS.md diff and runs only the named
      static check; it writes no artifact.
- [ ] The interactive root reviews that one-record project update, commits all
      accepted Task 10 paths, and creates the annotated tag phase0-v0.3.1.
- [ ] No worker or root pushes. A push requires separate user authorization.
- [ ] Phase 1 remains blocked until the root accepts the evidence and the tag
      exists.

### GREEN command and expected result

The static final-scope command after the PROGRESS.md update is:

    git diff --check -- PROGRESS.md

Expected exit is 0 with no output. It is the only command in the static
post-PASS check; the root reviews the diff but does not run validation.

The final evidence command set below must all satisfy their individually stated
exit codes and markers. A complete final evidence file with any missing command,
truncated output, unrecorded exit, or undocumented failure is not GREEN.

### Demo/evidence

The tester runs each command separately and records the complete output and
exit code in
.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-final-evidence.md.
The expected commands are:

    node --version

Expected exit 0 and v24.19.0.

    npm --version

Expected exit 0; record only the version.

    npx vitest run tests/unit/sqlite-phase-tests.test.ts --reporter=verbose

Expected exit 0 with the accepted 10A focused tests.

    npx vitest run tests/unit/offline-loop-packaging.test.ts --reporter=verbose

Expected exit 0 with the accepted 10B focused tests.

    npx vitest run tests/integration/phase0-demos.test.ts --reporter=verbose

Expected exit 0 with the accepted 10C focused tests.

    npx vitest run --reporter=verbose

Expected exit 0 with complete full-suite output and no privacy-content
diagnostics.

    npm run typecheck:node

Expected exit 0.

    npm run typecheck:web

Expected exit 0.

    npm run build

Expected exit 0, with generated asset preflight and no black-screen fallback.

The tester performs ten isolated smoke boots. Each iteration has its own
metadata-only run ID and resolved user-data child, and each output/exit is
captured separately. The ignored root is created before Resolve-Path:

    $task10UserDataRelative = '.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data'
    New-Item -ItemType Directory -Force -Path $task10UserDataRelative | Out-Null
    $task10UserDataRoot = (Resolve-Path -LiteralPath $task10UserDataRelative).Path
    1..10 | ForEach-Object {
        $smokeOrdinal = $_
        $smokeId = 'task10-smoke-' + $smokeOrdinal
        try {
            if ([string]::IsNullOrWhiteSpace($task10UserDataRoot)) { throw ('smoke_isolation_missing_' + $smokeOrdinal) }
            $smokeDataPath = Join-Path $task10UserDataRoot $smokeId
            New-Item -ItemType Directory -Force -Path $smokeDataPath | Out-Null
            $smokeData = (Resolve-Path -LiteralPath $smokeDataPath).Path
            $rootFull = [System.IO.Path]::GetFullPath($task10UserDataRoot)
            $childFull = [System.IO.Path]::GetFullPath($smokeData)
            $rootPrefix = $rootFull.TrimEnd('\') + '\'
            if ([string]::IsNullOrWhiteSpace($rootFull) -or [string]::IsNullOrWhiteSpace($childFull) -or $childFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not $childFull.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw ('smoke_isolation_invalid_' + $smokeOrdinal) }
            $env:MIRROR_SMOKE_MS = '15000'
            $env:MIRROR_PHASE0_USER_DATA_ROOT = $rootFull
            $env:MIRROR_USER_DATA_DIR = $childFull
            $env:MIRROR_BUILD_COMMIT = 'phase0-task10'
            $smokeOutput = @(& npm run smoke 2>&1)
            $smokeExit = $LASTEXITCODE
            $smokeOutput | ForEach-Object { $_ }
            Write-Output (ConvertTo-Json -Compress @{ smokeId = $smokeId; exit = $smokeExit })
            if ($smokeExit -ne 0) { throw ('smoke_exit_' + $smokeOrdinal + '_' + $smokeExit) }
        } finally {
            Remove-Item Env:\MIRROR_SMOKE_MS -ErrorAction SilentlyContinue
            Remove-Item Env:\MIRROR_PHASE0_USER_DATA_ROOT -ErrorAction SilentlyContinue
            Remove-Item Env:\MIRROR_USER_DATA_DIR -ErrorAction SilentlyContinue
            Remove-Item Env:\MIRROR_BUILD_COMMIT -ErrorAction SilentlyContinue
        }
    }

Expected every iteration exits 0, emits nonblank startup/lifecycle markers,
and leaves no black screen. Smoke's accepted unmet code remains 2 and its
accepted renderer-recovery exit remains 1; either is a failed final smoke
iteration. Failed smoke data is retained under the Task10 root.

The tester repeats the five demos with the exact commands from 10C, each with
--timeout-ms 120000, --marker-timeout-ms 15000, --retain-on-success, and the
ignored Task10 user-data root. Each must exit 0 and emit the exact D1–D5
markers. A demo failure is exit 2, is retained, and stops the decision matrix.

The actual OfflineLoop soak distinguishes wall-clock duration from process
timeout: it uses `--soak-ms 1800000`, `--sample-ms 300000`,
`--timeout-ms 1920000`, `--marker-timeout-ms 15000`, and
`--no-time-compression`:

    node scripts/run-phase0-demos.mjs --demo P0-D2 --case cloud-failure --build-commit phase0-task10-soak --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --soak-ms 1800000 --sample-ms 300000 --timeout-ms 1920000 --marker-timeout-ms 15000 --no-time-compression --retain-on-success

Expected exit is 0 and exactly seven bounded OFFLINE_LOOP_SAMPLE rows: baseline
at 0 ms followed by 300000, 600000, 900000, 1200000, 1500000, and 1800000 ms.
Every sample records RSS, working set, heapUsed, media currentTime, playing,
and loop count, plus path/run IDs and statuses only. Media currentTime must
advance between samples or loop count must increase, playing must not stop,
and there must be no black frame. For each memory metric, max minus baseline
must be no greater than max(134217728 bytes, 25 percent of baseline), and a
metric is also a failure if it is strictly increasing at every interval while
ending more than 134217728 bytes above baseline. These are conservative,
explicit thresholds; a shorter or time-compressed soak cannot pass.

The runtime model-literal/fallback negative scan is:

    rg -n --glob '*.ts' --glob '*.tsx' --glob '*.mjs' -e 'gpt-[0-9]' -e '\bo[0-9]([.-][A-Za-z0-9]+)*\b' -e 'fallback.{0,24}model' -e 'auto[-_ ]?latest' -e 'modelFallback' src scripts

Expected exit is 1 and no output. Any match is a runtime model-literal or
silent-fallback failure. The app.relaunch negative scan is:

    rg -n --glob '*.ts' --glob '*.tsx' --glob '*.mjs' 'app\.relaunch' src scripts

Expected exit is 1 and no output.

The privacy negative scan is:

    rg -n --glob '*.ts' --glob '*.tsx' --glob '*.mjs' -e 'console\.(log|warn|error)\([^)]*(transcript|audio|memoryValue|privateContext|credential|apiKey|embedding|prompt)' -e 'write(File|FileSync|JSONL)\([^)]*(transcript|audio|memoryValue|privateContext|credential|apiKey|embedding|prompt)' -e 'process\.env\.(OPENAI|API_KEY|MIRROR_API_KEY)' src scripts

Expected exit is 1 and no output. The tester does not read .env and does not
print or record any credential value.

The v26 schema/config recheck is run from the ignored preflight directory:

    Push-Location .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight
    node -p "require('./node_modules/electron-builder/package.json').version"
    node -e "const fs=require('node:fs');const path=require('node:path');const v=require('./node_modules/electron-builder/package.json').version;if(v!=='26.15.3'){console.error(JSON.stringify({status:'unsupported',version:v}));process.exit(1)};const schemaPath=path.resolve('node_modules/app-builder-lib/scheme.json');let schema;try{schema=JSON.parse(fs.readFileSync(schemaPath,'utf8'));if(!schema||typeof schema!=='object'||Array.isArray(schema))throw new Error('malformed')}catch{console.error(JSON.stringify({status:'unsupported',version:v,reason:'malformed_schema'}));process.exit(1)};const names=new Set();const walk=value=>{if(Array.isArray(value)){value.forEach(walk);return}if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){names.add(key);if((key==='definitions'||key==='$defs')&&item&&typeof item==='object'&&!Array.isArray(item))Object.keys(item).forEach(name=>names.add(name));walk(item)}};walk(schema);const required=['hardenedRuntime','entitlements','entitlementsInherit','extendInfo','extraResources','asarUnpack','FileSet'];const missing=required.filter(k=>!names.has(k));if(missing.length){console.error(JSON.stringify({status:'unsupported',version:v,schemaPath:'node_modules/app-builder-lib/scheme.json',missing}));process.exit(1)};console.log(JSON.stringify({status:'supported',version:v,schemaPath:'node_modules/app-builder-lib/scheme.json',keys:required}));"
    Pop-Location

Expected first command output 26.15.3 and exit 0; expected second output
status supported with all seven names and exit 0.

The tester reruns the unpacked Windows x64 package command:

    $task10bPreflight = Join-Path (Get-Location) '.superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10b-package-preflight'
    & (Join-Path $task10bPreflight 'node_modules/.bin/electron-builder.cmd') --dir --win --x64 --publish never --config (Join-Path (Get-Location) 'electron-builder.yml') --config.directories.output (Join-Path $task10bPreflight 'windows-unpacked')

Expected exit 0. Hashes and lengths at
app.asar.unpacked/out/renderer/mock/offline-loop-v1.mp4 and
mock/offline-loop-v1.mp4 must equal the fixed source pair, and the packaged
probe must report decodable, advancing, nonblack playback. The output stays
below task10b-package-preflight/windows-unpacked.

The exact whitespace check for Task 10 tracked paths is:

    git diff --check -- .gitignore package.json package-lock.json electron-builder.yml electron.vite.config.ts resources/offline-loop/offline-loop-v1.mp4.base64 scripts/generate-offline-loop.mjs src/renderer/mirror/App.tsx src/main/index.ts src/main/sqlite-service.ts src/main/boot.ts src/main/phase0-demo-runner.ts src/main/console-data.ts src/main/console-config.ts tests/unit/sqlite-phase-tests.test.ts tests/unit/offline-loop-packaging.test.ts tests/integration/phase0-demos.test.ts scripts/run-phase0-demos.mjs PROGRESS.md

Expected exit is 0 and no output. The tester records the exact scope and does
not use a broad cleanup or destructive command.

### Non-goals/risks

No short soak, compressed clock, approximate marker, partial output,
credential check, .env read, macOS field claim, package push, implementation
worker validation, DECISIONS.md edit, unreviewed PROGRESS.md edit, commit, or
tag by a worker is accepted. The root does not run tests or validation. A
single missing command, nonzero exit, unexpected marker, memory-threshold
breach, nonblack failure, resource hash mismatch, unsupported v26 option,
privacy scan match, or extra changed path keeps Phase 0 open.

## Preflight decision matrix

The tester evaluates these gates in order and stops at the first failed row.
The final evidence file records every attempted command with complete
stdout/stderr and exit code; it never claims a skipped gate passed.

| Gate | Exact command or condition | Pass condition | Stop condition | Evidence path |
| --- | --- | --- | --- | --- |
| Node | node --version | exit 0; v24.19.0 | nonzero or wrong version | task10-final-evidence.md |
| npm | npm --version | exit 0; version recorded | nonzero | task10-final-evidence.md |
| Candidate lock | copied package/lock then exact npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-dev --save-exact electron-builder@26.15.3 | exact accepted candidate textual diff and exit 0 | install/lock failure or tracked write | task10b-package-preflight/ |
| Candidate install | npm ci --ignore-scripts in preflight | exit 0 | nonzero or unexpected package write | task10b-package-preflight/ |
| Builder version | node -p require electron-builder package version | exactly 26.15.3 | any other version | task10b-package-preflight/ |
| Builder schema | exact JSON parse of installed node_modules/app-builder-lib/scheme.json, recursively collecting schema keys/definition names for hardenedRuntime, entitlements, entitlementsInherit, extendInfo, extraResources, asarUnpack, FileSet | status supported, exit 0 | absent/malformed schema or missing key | task10b-package-preflight/ |
| Generated asset | npm run generate:offline-loop plus fixed hash/length commands | exit 0, exact fixed pair, decodable | decode/hash/length failure | task10-final-evidence.md and ignored generated path |
| Focused 10A | npx vitest run tests/unit/sqlite-phase-tests.test.ts --reporter=verbose | exit 0 | nonzero/missing contract | task10-final-evidence.md |
| Focused 10B | npx vitest run tests/unit/offline-loop-packaging.test.ts --reporter=verbose | exit 0 | nonzero/missing contract | task10-final-evidence.md |
| Focused 10C | npx vitest run tests/integration/phase0-demos.test.ts --reporter=verbose | exit 0 | nonzero/missing contract | task10-final-evidence.md |
| Full suite | npx vitest run --reporter=verbose | exit 0 | any failure or privacy output | task10-final-evidence.md |
| Typecheck | npm run typecheck:node and npm run typecheck:web | both exit 0 | either nonzero | task10-final-evidence.md |
| Build | npm run build | exit 0 and asset preflight marker | nonzero/black fallback | task10-final-evidence.md |
| Smoke | after the Task 10B declaration `"smoke": "electron ."`, ten isolated iterations each run `npm run smoke` with the four required environment variables | all ten exit 0 and nonblank markers | missing/invalid isolation or any exit 1/2 or blank marker | task10-final-evidence.md |
| Demos | exact P0-D1, P0-D2 cloud/core, P0-D3, P0-D4, P0-D5 commands | each exit 0 and required markers | any exit 2, missing marker, or raw content | task10-final-evidence.md and retained user-data |
| Soak | exact cloud OfflineLoop command with `--soak-ms 1800000 --sample-ms 300000 --timeout-ms 1920000 --marker-timeout-ms 15000 --no-time-compression` | 7 samples at 0 through 1800000 ms, advancing media, no stop, memory thresholds pass | short/compressed run, missing sample, stop, growth breach | task10-final-evidence.md and retained soak run |
| Model scan | exact rg runtime model-literal/fallback command | exit 1, no output | match or non-1 result | task10-final-evidence.md |
| Restart scan | exact rg app.relaunch command | exit 1, no output | match or non-1 result | task10-final-evidence.md |
| Privacy scan | exact rg privacy command | exit 1, no output | match or non-1 result | task10-final-evidence.md |
| Package | preflight-installed electron-builder --dir --win --x64 --publish never | exit 0, output below ignored directory | nonzero or tracked output | task10b-package-preflight/ |
| Resource hashes | exact app.asar.unpacked and extraResources hash/length checks | equal fixed values and decodable | mismatch/missing location | task10-final-evidence.md |
| Whitespace | exact git diff --check Task 10 path list | exit 0, no output | nonzero/output or extra path | task10-final-evidence.md |
| Credential-free | no .env read; no credential value in output | evidence contains only metadata | any key/value or .env access | task10-final-evidence.md |

The candidate-lock command in the matrix is the exact command in 10B:
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
--save-dev --save-exact electron-builder@26.15.3. No alternative npm flag is
allowed.

## Final requirement-to-command-to-evidence mapping

| Requirement | Exact command | Expected exit/marker | Evidence |
| --- | --- | --- | --- |
| P0-D1 exact lifecycle | node scripts/run-phase0-demos.mjs --demo P0-D1 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success | 0; six exact PHASE_DEMO_STEP states | final evidence; retained D1 run |
| P0-D2 cloud fallback | node scripts/run-phase0-demos.mjs --demo P0-D2 --case cloud-failure --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success | 0; OfflineLoop, nonblack, reason, OFFLINE_LOOP_SAMPLE | final evidence; retained D2 cloud run |
| P0-D2 local-core fallback | node scripts/run-phase0-demos.mjs --demo P0-D2 --case core-failure --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success | 0; Maintenance, nonblack, reason | final evidence; retained D2 core run |
| P0-D3 Console observability | node scripts/run-phase0-demos.mjs --demo P0-D3 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success | 0; Overview/Events/Phase Tests query markers | final evidence; retained D3 run |
| P0-D4 reopen | node scripts/run-phase0-demos.mjs --demo P0-D4 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success | 0; PHASE_REOPEN_RESULT config/record/event readable | final evidence; retained D4 run |
| P0-D5 fixtures/config | node scripts/run-phase0-demos.mjs --demo P0-D5 --build-commit phase0-task10 --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --timeout-ms 120000 --marker-timeout-ms 15000 --retain-on-success | 0; fixture hashes, rollback, simulator, preservation statuses | final evidence; retained D5 run |
| SQLite v2/records | npx vitest run tests/unit/sqlite-phase-tests.test.ts --reporter=verbose | 0; migration, schema, transaction, read, close assertions | final evidence; focused test output |
| OfflineLoop source/package | npx vitest run tests/unit/offline-loop-packaging.test.ts --reporter=verbose | 0; decode/hash/publicDir/fallback/config assertions | final evidence; focused test output |
| Demo harness integration | npx vitest run tests/integration/phase0-demos.test.ts --reporter=verbose | 0; isolation/markers/reopen/fixtures assertions | final evidence; focused test output |
| Full regression | npx vitest run --reporter=verbose | 0; complete suite | final evidence; full output |
| Node/web typing | npm run typecheck:node; npm run typecheck:web | both 0 | final evidence; complete outputs |
| Build | npm run build | 0; generated asset/fallback preflight | final evidence; complete output |
| Ten smoke boots | after the Task 10B declaration `"smoke": "electron ."`, the exact 1..10 PowerShell loop sets the four required environment variables and invokes `npm run smoke` with unique IDs | ten 0 exits; nonblank markers | final evidence; ten exit records |
| Actual soak | node scripts/run-phase0-demos.mjs --demo P0-D2 --case cloud-failure --build-commit phase0-task10-soak --user-data-root .superpowers/sdd/2026-08-19-phase0-task8-boot-ipc-mirror/task10-user-data --soak-ms 1800000 --sample-ms 300000 --timeout-ms 1920000 --marker-timeout-ms 15000 --no-time-compression --retain-on-success | 0; seven samples at 0 through 1800000 ms, media advances, no stop, thresholds pass | final evidence; retained soak run |
| No runtime model literal/fallback | exact rg runtime scan | 1; no output | final evidence |
| No app.relaunch | exact rg app.relaunch scan | 1; no output | final evidence |
| Privacy | exact rg privacy scan | 1; no output | final evidence |
| Builder contract | exact version and JSON-parse v26 schema node commands for installed node_modules/app-builder-lib/scheme.json | 0; 26.15.3/status supported | final evidence; preflight metadata |
| Windows package/resource | exact preflight-installed electron-builder --dir --win --x64 --publish never command and hash checks | 0; equal fixed hashes/lengths, decodable paths | final evidence; ignored package output |
| Task 10 scope/whitespace | exact git diff --check Task 10 path list | 0; no output | final evidence |
| Phase record authority | 10A tests plus D1–D5 PHASE_RECORD_WRITTEN and Console Phase Tests | one row/attempt, newest 20, telemetry supplementary | final evidence; SQLite/Console metadata |
| Project record | git diff --check -- PROGRESS.md after authorized update | 0; no output | root-reviewed PROGRESS diff |
| Release decision | root-only git commit and annotated tag phase0-v0.3.1 | root acceptance; no worker push | root review record and tag |

## Root review checklist

- [ ] Review only the returned worker diffs and metadata-only evidence; do not
      run tests, typechecks, builds, packaging, demos, scans, or soak commands.
- [ ] Confirm Task 10A changed only its exact named files and proves v1 to v2,
      exact schema, atomic pruning, defensive reads, Console wiring, and
      exactly-once close.
- [ ] Confirm Task 10B used the accepted ignored package candidate, applied
      package-lock text exactly, keeps generated/package output ignored, and
      proves both packaged resource locations and the nonblack fallback.
- [ ] Confirm Task 10C has one runner, isolated process A/B reopen, exact
      markers, one phase record per attempt, D1 exact states, both D2 fallbacks,
      D3 Console queries, and D5 fixture/config preservation.
- [ ] Confirm all tester commands have complete stdout, stderr, exit code,
      path, and metadata-only interpretation in task10-final-evidence.md.
- [ ] Confirm the 1,800,000 ms soak used wall clock with
      `--soak-ms 1800000`, `--sample-ms 300000`, process timeout
      `--timeout-ms 1920000`, marker timeout `--marker-timeout-ms 15000`, and
      `--no-time-compression`; confirm exactly seven samples at 0 through
      1800000 ms, media advancement/no stop, and the explicit memory thresholds.
- [ ] Confirm negative model/fallback, app.relaunch, and privacy scans exited
      1 with no output.
- [ ] Confirm the installed v26 check parsed
      node_modules/app-builder-lib/scheme.json as JSON, recursively collected
      schema keys/definition names, required all seven names, and kept the
      later electron-builder --dir Windows package command as real
      configuration validation.
- [ ] Confirm Windows evidence does not claim macOS Keychain, TCC, signing,
      entitlements, packaged-worker, or LaunchAgent field verification.
- [ ] Confirm no .env was read, no credential value appears, and no
      transcript/audio/memory/private content appears.
- [ ] Confirm only the authorized PROGRESS.md update follows tester PASS;
      DECISIONS.md remains unchanged.
- [ ] After acceptance, root alone commits the exact accepted Task 10 paths
      and creates annotated tag phase0-v0.3.1.
- [ ] Do not push without separate user authorization. Keep Phase 1 blocked
      until the accepted tag exists.

## Explicit non-goals

- No application work outside the exact Task 10A, 10B, and 10C file lists.
- No implementation worker runs npm, install, test, typecheck, build,
  packaging, demo, validation, network, or cleanup commands.
- No worker or tester installs except the tester-owned copied-package preflight
  in task10b-package-preflight; no tracked install output.
- No commits, pushes, tags, delegation, worker spawning, review-worker
  creation, or root-review claim by any worker.
- No root validation command.
- No change to scripts/install-node-lts.ps1, product documents, accepted
  lifecycle, accepted services, runtime model IDs, active.json, credential
  handling, or LaunchAgent ownership.
- No OpenAI/provider call, API key, .env read, camera, microphone, face
  embedding, hardware, macOS field verification, or packaged-worker claim.
- No transcript, audio, extracted memory value, private context, credential,
  image, embedding, prompt, raw error, or secret in logs, telemetry, records,
  reports, or exports.
- No automatic model substitution, new model resolver, second fallback
  service, app.relaunch, second restart owner, or black-screen path.
- No schema beyond v2, authoritative telemetry storage, source video download,
  ffmpeg generation, non-atomic asset replacement, or broad destructive
  cleanup.
- No phase advancement before external root acceptance and annotated
  phase0-v0.3.1 tag.

## Canonical invariant checklist 1-12

- [ ] 1. Final transcripts and conversation audio remain RAM-only. Extracted
      memory values and injected private context remain RAM-only. Diagnostics,
      phase records, telemetry, reports, and exports contain only IDs, enums,
      counts, timings, statuses, reasons, hashes, paths, and exit codes.
- [ ] 2. Face recognition proposes a candidate only. Private memory follows
      explicit verbal confirmation. Task 10 preserves this future boundary.
- [ ] 3. guestId and candidateProfileId remain in Electron Main only. They
      never cross renderer/model-tool boundaries or enter demo records.
- [ ] 4. A profile change closes the old session, confirms in a clean
      Persona+Master-only session, then updates the agent in that same clean
      session. Task 10 preserves this future boundary.
- [ ] 5. Extraction writes only to ownerProfileIdAtTurnStart captured at turn
      start. Task 10 preserves this future boundary.
- [ ] 6. Identity, naming, switching, group, sleep, and spell control turns
      skip personal-memory extraction. Task 10 preserves this future boundary.
- [ ] 7. A scene requires normalized exact full-transcript spell matching,
      one trigger per turn, and approved presets only. Task 10 preserves this
      future boundary.
- [ ] 8. Exactly one microphone owner exists at a time, with explicit
      release-then-acquire handoff. Task 10 preserves this future boundary.
- [ ] 9. Every ignore, drop, fallback, or degrade is visitor-visible or a
      metadata-only Console event with a stable reason. This includes SQLite
      close/rejection, asset availability, OfflineLoop, Maintenance, process,
      and cleanup outcomes.
- [ ] 10. Failures degrade without gating conversation or unrelated adapters.
      Cloud failure selects OfflineLoop; local-core failure selects
      Maintenance; corrupt assets never produce black output.
- [ ] 11. Model IDs come only from versioned configuration. No source literal
      or silent substitution is accepted; configured failure is visible and
      bounded. Demo fixture IDs are isolated test configuration, not runtime
      fallback.
- [ ] 12. Credentials are read by Main through safeStorage; Windows uses DPAPI
      and the target Mac uses Keychain. Keys never enter renderer data, logs,
      telemetry, records, exports, or evidence.
