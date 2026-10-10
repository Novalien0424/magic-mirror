# Whole-project code review — 2026-10-10

## Scope and method

- **Target:** branch `field/macmini-deploy` at `4d44c77` (product code at
  `b1a4f54`). About 48k lines of product code (`src/main`, `src/renderer`,
  `src/shared`, `src/preload`), plus `scripts/`, `deploy/macos/` and a
  coverage-level pass over `tests/`. The vendored `src/vendor/live2d` and the
  binary/asset trees were excluded.
- **Method:** nine read-only Opus reviewers, one per subsystem (A–I below).
  Each one checked its slice against the 12 canonical invariants in
  [AGENTS](../../AGENTS.md) and the rulings in [DECISIONS](../../DECISIONS.md),
  and reported only defects it could ground in code. The root session merged
  duplicates and re-read the code for every **high** finding plus the config
  migration finding. Those are marked *verified*.
- **Limits:** this was static review only. No Electron, QA runner or full suite
  was started, and the deployed LaunchAgent app was not touched. Some reviewers
  reproduced findings with scratch probes against temporary databases and
  in-memory adapters in the session scratchpad; none used operator data.
  Runtime behavior is marked *plausible* when it was not exercised.
  Nothing here is runtime, physical or phase acceptance.

| Slice | Area |
|---|---|
| A | Main lifecycle, boot, crash recovery, display, credential source |
| B | IPC, preload, shared bridge, window security |
| C | Config migrations, model settings, SQLite, telemetry |
| D | Relationship memory (`src/main/memory`, embedding worker, memory dialogue/panel) |
| E | Realtime voice (`src/main/realtime`, `src/renderer/realtime`) |
| F | Wake word, scenes, media |
| G | Avatar, audio graph, Mirror, camera, `deploy/macos` |
| H | Operator Console renderer |
| I | QA harness, build scripts, test-suite health |

## Executive summary

| Severity | Count |
|---|---|
| High | 7 |
| Medium | 23 |
| Low | 27 |

No reviewer found a credential leak, a guest/candidate ID crossing IPC or model
boundaries, private content in telemetry, a cross-scope memory SQL leak, a
media path traversal or an exact-spell-matching error. The IPC boundary,
avatar import, YouTube isolation and the voice audio graph are in good shape.

The risk is concentrated in four themes:

1. **Lifecycle recovery dead-ends (invariants 8, 10).** Main and the Mirror
   renderer do not get back in sync after a failed rollover or a renderer
   crash. Several wake-worker failures turn into **Maintenance, which has no
   exit**: nothing sends `RETRY_STARTUP`, and the process never exits 1 for the
   LaunchAgent to restart it. On a kiosk that runs for days, transient
   CoreAudio/USB, network or GPU events can leave the mirror deaf or stuck until
   someone restarts it by hand. This is the most important group to fix
   (MM-01, MM-02, MM-03, MM-08 – MM-12).
2. **Silent or incomplete state transitions (invariant 9).** Several failures
   end in a state the visitor or operator cannot see: wake not listening while
   the mirror shows Dormant, "temporary encounter" memory left switched off,
   the avatar canvas blank while reporting ready, model changes published
   without review.
3. **Production and QA are not separated.** The LaunchAgent runs the repo's
   mutable `out/` through the same Electron binary that QA uses. QA code ships
   in the production bundle. Only some runners enforce isolated userData and a
   single mic owner.
4. **Host security.** The root board-HDMI LaunchDaemon runs `adb` and core
   tools from the user-writable `/opt/homebrew/bin`, so any process running as
   the operator can get root.

## Recommended fix order

1. **MM-06** (root shell path). A small script change; it is live on this Mac now.
2. **MM-03, MM-01, MM-02, MM-08** as one lifecycle-reconciliation change.
   Define a single rule for "Main leaves Active": stop the renderer
   explicitly, release, then re-acquire wake. Add a way out of Maintenance
   (a bounded retry, then exit 1).
3. **MM-04** (interrupt mute) and **MM-05** (temporary memory). Both are
   one-line-scale fixes with clear tests.
4. **MM-07** and **MM-24** (Console model publish and lost edits).
5. **MM-25 – MM-27** (QA isolation and production separation), before the next
   QA run on the venue Mac.
6. The remaining mediums by subsystem, then the lows.

## Decisions needed from the owner

- **D-1 — SQLite and telemetry failures at boot (MM-12).** DECISIONS says "DB
  failure does not block unrelated conversation", but Tech Spec §598 and the
  P0-D3 demo require Maintenance. The code follows the Tech Spec. A ruling is
  needed before this is changed.
- **D-2 — Production deployment source (MM-27).** Should the LaunchAgent run a
  separate, commit-pinned copy (or a packaged app) instead of the working
  `out/`? This also decides whether QA modules stay in the production bundle.
- **D-3 — Wake search width (MM-23).** The 32-path decoder on the Mac needs
  negative/false-wake measurement at the current 0.32 threshold. It also needs
  a decision on whether the width belongs in the hashed wake package tuning.

---

## High

### MM-01 — A failed rollover leaves Main and the renderer out of sync; the old session keeps the mic, or wake never comes back
- **Slices:** A, E (found independently) · **Invariants:** 8, 9, 10, 1/4 · **Verified**
- **Location:** `src/main/boot.ts:1446-1460` (`recordRealtimeRolloverFailure`),
  `src/main/boot.ts:2442-2477`; `src/renderer/realtime/realtime-runtime-owner.ts:530-634`;
  `src/renderer/mirror/App.tsx:198-238`; trigger `src/main/index.ts:1336-1338`.
- **Problem:** Any rollover outcome other than success (`failed` or `ignored`)
  sends `CLOUD_FAILED`, which puts Main in OfflineLoop. For most failure
  reasons, though, the renderer sets itself back to `active` and keeps the old
  WebRTC session and the mic. Main never sends a stop to the renderer. Unlike
  the start-failure path and `handleRealtimeFailure`, it also never calls
  `reacquireWakeAfterCloudFailure()`.
- **Failure scenario:** A broker hiccup at the 60-minute rollover (or a
  memory-invalidation reset) makes the Mirror show OfflineLoop while the
  visitor keeps talking to the old session. That session still holds the
  private context that was meant to be removed. The probes then return Main to
  Dormant with wake still released. The next wake gets `start_requires_idle`
  and falls back into OfflineLoop, so the mirror cannot be woken until the app
  restarts. In the `rollover_connect_failed` case the renderer does release the
  mic, but wake is still never re-acquired.
- **Fix:** Make both sides follow one rule. Either keep the old session
  authoritative when the renderer reports that it kept it, or have Main
  dispatch an explicit stop, wait for it, then release and re-acquire wake.

### MM-02 — Recreating the Mirror renderer never resets Main's lifecycle state
- **Slice:** A · **Invariants:** 8, 10 · **Confidence:** confirmed
- **Location:** `src/main/index.ts:630-661` (`onRenderProcessGone`);
  `src/main/boot.ts:2341-2377`, `:2484-2492`;
  `src/renderer/realtime/realtime-runtime-owner.ts:712`.
- **Problem:** When the renderer that owns the Realtime session and the mic
  dies, Main is not told. Its lifecycle stays `activating`, `active` or
  `suspending`, wake stays released, and there is no activation watchdog.
- **Failure scenario:** The renderer crashes (OOM or GPU) during playback. Main
  stays `active` indefinitely, because the idle timer is paused while a playback
  session ID is set. A later Disconnect or idle stop reaches the fresh renderer,
  which answers `stop_no_active_session` → `ignored`. That is recorded as a stop
  failure, which leads to Maintenance (see MM-03).
- **Fix:** When the Mirror renderer is gone, clear the pending and active
  session identity and move to Dormant (re-acquiring wake explicitly), or to
  OfflineLoop/Maintenance according to health. Treat `stop_no_active_session`
  as already closed.

### MM-03 — Maintenance has no exit, and a missing or dead wake worker sends every conversation end there
- **Slices:** A, F · **Invariants:** 8, 10 · **Verified** (no `RETRY_STARTUP` producer anywhere in `src`)
- **Location:** `src/main/lifecycle.ts:95-98`, `src/main/boot.ts:674`;
  `src/main/wake/supervisor.ts:107-111`, `:207`, `:379-396`;
  `src/main/boot.ts:2110-2142`, `:2403-2420`; `src/main/index.ts:943-950`.
- **Problem:** Every `LOCAL_AUDIO_FAILED` or `LOCAL_CORE_FAILED` is terminal for
  the life of the process. `RETRY_STARTUP` is declared but nothing sends it, and
  the app never exits 1, so the LaunchAgent cannot help. When the wake child is
  missing (repeated exits, spawn failure, or waiting for a device),
  `release()` reports success but `acquire()` fails with
  `wake_worker_unavailable`. Boot treats that as a hand-off failure and goes to
  Maintenance. `release()` also cancels the pending device retry, so device
  recovery is abandoned.
- **Failure scenario:** The wake mic is briefly unplugged, or the worker
  crashed twice earlier. A Console-started conversation ends, re-acquiring wake
  fails, and the mirror is in Maintenance until someone restarts it by hand.
  A cloud failure reaches the same state through
  `reacquireWakeAfterCloudFailure`.
- **Fix:** Separate "wake module already failed or absent, and the mic is
  provably unowned" (degraded, not a hand-off failure) from a real
  release/acquire failure. Implement the specified single owner-rebuild retry
  that sends `RETRY_STARTUP`, then exit 1 after a bounded Maintenance window.
  Do not let `release()` cancel a device retry that the next acquire needs.

### MM-04 — Interrupts started by the app (spell match, Console Interrupt) do not mute the processed audio locally
- **Slice:** E (slice G assumed the opposite; resolved by reading the code) · **Invariant:** DECISIONS ≤50 ms interruption mute, zero stale cancelled audio · **Verified**
- **Location:** `src/renderer/realtime/realtime-session-adapter.ts:1342-1350`
  (exported `interrupt()` only calls `session.interrupt()`), the
  `audio_interrupted` handler at `:1246-1255`; SDK
  `@openai/agents-realtime/dist/openaiRealtimeWebRtc.mjs:601-612` (WebRTC
  `interrupt()` sends `response.cancel` + `output_audio_buffer.clear` and emits
  nothing). Only `openaiRealtimeWebsocket.mjs:561` emits `audio_interrupted`.
  Callers: `src/renderer/realtime/realtime-runtime-owner.ts:775`,
  `src/renderer/mirror/scene-transcript-controller.ts:102,118`.
- **Problem:** The local graph is muted only through
  `notifyAudioActivity('interrupted' | 'speech_started')`. Over WebRTC,
  `audio_interrupted` never fires, so an interrupt started by the app leaves
  the cancelled reply playing until the server-side clear arrives. Visitor
  barge-in still works, because it goes through `speech_started`. The memory
  dialogue's interrupt wrapper at `:484` already calls `notifyAudioActivity`
  first. Unit tests fake `audio_interrupted`
  (`tests/unit/realtime-session-adapter.test.ts:463,826`), which hides the gap.
- **Failure scenario:** An exact spell matches while the automatic reply is
  playing. The cancelled reply keeps playing for roughly 150–300 ms or more,
  overlapping the spell announcement.
- **Fix:** Call `notifyAudioActivity('interrupted')` synchronously in the
  adapter's `interrupt()` before `session.interrupt()`, and stop the test fake
  from emitting `audio_interrupted`.

### MM-05 — "Temporary encounter" never resets after a normal sleep, so memory stays off for every later visitor
- **Slice:** D · **Invariants:** 1, 9 · **Verified** (traced through `runtime.subscribe → memory.observe()` at `src/main/index.ts:1391-1392`)
- **Location:** `src/main/memory/relationship.ts:70-78`.
- **Problem:** `temporary` is cleared only when the session key changes
  *while* the lifecycle is `dormant`. `active` is computed as
  `lifecycle === 'active'`, so at active→suspending the key becomes `''` with
  the lifecycle at `suspending`, and nothing is cleared. At suspending→dormant
  the key is already `''`, so the reset block never runs. `reset()` does not
  clear it either.
- **Failure scenario:** One visitor asks to keep the encounter off the record.
  Every later visitor until the app restarts gets `memory_turn_unowned` and
  `memory_disabled`, an empty brief, and an avatar that says the encounter is
  temporary. A reviewer reproduced this with a scratch probe.
- **Fix:** Clear `temporary` on any transition to a non-active lifecycle,
  whether or not the key changed. Add an active→suspending→dormant test.

### MM-06 — The root board-HDMI LaunchDaemon runs `adb` and core tools from user-writable Homebrew (local privilege escalation)
- **Slice:** G · **Invariant:** none (host security) · **Verified on this Mac**
- **Location:** `deploy/macos/board-hdmi-keepalive.sh:12`
  (`PATH=/opt/homebrew/bin:…`), `:36-54`;
  `deploy/macos/install-board-hdmi-daemon.sh:14-15`;
  `deploy/macos/com.magicmirror.board-hdmi.daemon.plist:9-10`.
- **Problem:** The installer makes the script root-owned so it cannot be
  edited by the user. The daemon then runs `adb` (and resolves `sed`, `awk`,
  `grep` and others) as root every 20 s, from `/opt/homebrew/bin` first.
  `/opt/homebrew/bin` is `drwxrwxr-x novalien0424:admin`, and the `adb`
  symlink and its Caskroom target are owned by the operator account.
- **Failure scenario:** Any process running as the operator replaces the
  Caskroom `adb`, or drops a `sed` into `/opt/homebrew/bin`. Within 20 s
  launchd runs it as root, with no password prompt.
- **Fix:** At install time, copy a pinned `adb` into the root-owned
  `/Library/Application Support/MagicMirror/` and call it by absolute path.
  Set `PATH=/usr/bin:/bin:/usr/sbin:/sbin`.

### MM-07 — Model IDs saved in the Models panel are published by the Avatars workspace without appearing in its review
- **Slice:** H · **Invariants:** 11, 9 · **Verified**
- **Location:** `src/renderer/console/App.tsx:1882-1889` (`saveModelDraft`),
  `:1913` ("Model drafts apply to simulator tests"), `:1600-1607`
  (`saveAndCheck` publishes `publishDiff`), `:1531`, `:1814`, `:1016-1035`;
  `src/renderer/console/profile-workspace.ts:46-50` (`workspaceChanges` has no
  `aiModels` key); `src/main/console-config.ts:616-637`.
- **Problem:** Model IDs typed in the Models panel go into the shared config
  draft. The Avatars "Publish all changes" and "Save & apply all changes"
  buttons publish the whole draft, but the change scope and confirmation never
  list a model change. "Save & apply" has no review step at all.
- **Failure scenario:** The operator saves a test model ID, trusting the
  "simulator tests" wording. Later they change a background and click Save &
  apply. The model goes live for the next conversation with no visible notice.
- **Fix:** Show `publishDiff` changes of kind `model` in the scope and
  confirmation, and block Save & apply when there are model changes.
  Alternatively, keep Models-panel drafts out of the shared draft, and correct
  the "simulator tests" text.

---

## Medium

### Lifecycle and process ownership

**MM-08 — OfflineLoop ignores `LOCAL_AUDIO_FAILED`, so a failed wake re-acquire leaves Dormant with nothing listening** (A; inv 9, 8; confirmed)
`src/main/lifecycle.ts:91-94`, `:248-256`. The boot fallback actor
(`boot.ts:669-673`) does allow this event, so the two transition tables
disagree. `finishRecoveryProbeCycle` later clears `maintenance` and goes to
Dormant with no wake listener. *Fix:* add `offlineLoop: LOCAL_AUDIO_FAILED →
maintenance`, or re-acquire wake before `RECOVERY_PASSED`. Build both tables
from one source.

**MM-09 — A closed Mirror or Console window, or a Mirror that fails to load, is never recreated and never causes an exit** (A; inv 10; confirmed)
`src/main/index.ts:439-451`, `:663-667`, `:1492-1494`. If Cmd+W closes the
Mirror, the process keeps running with no visitor window. A closed Console
cannot be reopened (`console_window_missing`). A recreated Mirror that hits
`did-fail-load` stays black. *Fix:* hide the Console instead of closing it,
block closing the Mirror outside quit, and send Mirror load failures through
`crashRecovery.decide`.

**MM-10 — The exit-1 path has no deadline, and one rejected shutdown step skips the rest** (A, D; inv 10; plausible)
`src/main/index.ts:695-711`, `:1446-1466`, `:1385-1389`. The `give_up`
path waits for a full graceful shutdown, including draining up to 8 learning
batches with two 30 s extractor calls each. The cleanup steps form one `.then`
chain. *Fix:* race shutdown against a hard deadline of a few seconds on error
exits, and give each step its own catch.

**MM-11 — Wake request timeouts never kill the worker** (F; inv 8, 10; plausible)
`src/main/wake/supervisor.ts:213-217`, `:299-300`, `:360-362`;
`src/main/wake/worker.ts:73`, `:164-171`. A hung `Microphone.open` blocks every
later command, including release, so the next start goes to Maintenance. A
late `ready` reply is dropped and wake stays deaf. *Fix:* kill the worker on
any request timeout and treat its exit as release confirmation.

**MM-12 — SQLite or telemetry failures at boot force Maintenance even though conversation does not need them** (A, C; inv 10; confirmed code path — **needs decision D-1**)
`src/main/boot.ts:1474-1483`, `:1538-1563`, `:1679-1690`; `mirror.sqlite`
holds only phase-test records. *Fix (if ruled):* report these as degraded
modules and keep `LOCAL_CORE_FAILED` for config and model settings.

### Wake and scenes

**MM-13 — The wake restart budget is one restart for the life of the process, and watchdog stalls use it up** (F; inv 10, 9; confirmed)
`src/main/wake/supervisor.ts:169-182`, `:289-295`, `:355-373`; asserted by
`tests/main/wake/supervisor.test.ts:380-416`. Two audio stalls days apart
disable wake for good. *Fix:* reset the budget after a sustained healthy
period, or rate-limit restarts within a time window.

**MM-14 — A detector exception leaves wake permanently deaf** (F; inv 10; confirmed)
`src/main/wake/worker.ts:110-113`; `supervisor.ts:283-296`.
`wake_detector_failed` neither restarts nor re-acquires. *Fix:* handle it like
a mic failure (kill the worker, then do a bounded restart).

**MM-15 — Spell trigger and stop IPC are not tied to the session or lifecycle** (B; inv 7, 9; plausible race, confirmed missing check)
`src/main/ipc.ts:1894-1938`. Every other conversation-scoped Mirror channel
checks `{realtimeSessionId, sessionGeneration}`. A trigger queued behind the
leave-Active `stopAll` can start a scene while suspending or Dormant. *Fix:*
add the identity envelope and re-check it inside the queued operation; emit
`scene_trigger_stale` when the check fails.

**MM-16 — Spell turn IDs restart when the renderer is recreated, so valid spells are skipped as `duplicate_turn`** (B, F; inv 7, 9; confirmed)
`src/renderer/mirror/scene-transcript-controller.ts:71`;
`src/main/scenes/scene-runtime.ts:159`, `:504-510`; `src/main/ipc.ts:1380`,
`:1913` (media is stopped before the skip decision). *Fix:* make turn IDs
unique across renderer lifetimes (session ID plus item ID, or a UUID), or reset
`consumedTurnIds` when the renderer is recreated. Move `mediaSkill.stop` into
the accepted path.

**MM-23 — The 32-path Mac wake search is hardcoded and its false-wake rate is unmeasured** (`b1a4f54` review; inv 11-adjacent; **decision D-3**)
`src/main/wake/sherpa-detector.ts:10`. The 0.32 threshold was tuned at 4
paths, and only 3 negatives were run at 32. `evaluatedSettings` does not record
the path count, so Windows and Mac reports look identical. *Fix:* measure
negatives at 32 paths, and move the width into the hashed package tuning.

### Realtime voice

**MM-17 — A transport drop during Active is probably never reported** (E; inv 9, 10; plausible)
`src/renderer/realtime/realtime-session-adapter.ts:999-1001`, `:1183-1190`;
the SDK `RealtimeSession` does not re-emit `connection_change`. After a
Wi-Fi drop the mirror stays "Active" and silent until the idle timer fires,
with no failure reason. *Fix:* subscribe to the transport's
`connection_change`/`disconnected` events and report `active_disconnect`.

**MM-18 — The rollover playback gate gives up after 2.5 s and cuts long replies** (E; DECISIONS playback-completion rule; confirmed)
`src/renderer/realtime/playback-completion.ts:133-134`, `:223-227`;
`realtime-runtime-owner.ts:538-542`, `:600`. *Fix:* measure the fallback from
the last non-silent sample, or keep waiting while the analyser still shows
audio, up to a much larger hard cap.

### Memory

**MM-19 — "Forget" deletes the exact topic row, but the same fact survives in auto-extracted episodes** (D; inv 1, 5; plausible)
`src/main/memory/store.ts:245-257`; `extractor.ts:49` (episodes are written
with no `sources`). The visitor hears `memory_forgotten`, but the episode is
recalled again. *Fix:* also remove or confirm matching entries in the scope
(for example, `hybridRecall` candidates), or record evidence-level links.

**MM-20 — `commitLearning` can leave hidden, permanently stale entries** (D; data integrity; confirmed by probe)
`src/main/memory/store.ts:301-346`. If a batch revises a source and also cites
one of its dependents, the dependents keep their old revision, so they are
invisible to voice and indexing, and re-learning that topic returns `stale`
forever. *Fix:* treat such entries as removed or stale, or rewrite their
dependency revisions in the same transaction.

**MM-21 — The control-turn check normalizes less than the spell matcher, so spell turns can reach extraction** (D; inv 6; plausible)
`src/main/memory/relationship.ts:18`, `:156` vs
`src/main/scenes/spell-trigger.ts:91-105`. `施放咒语，星空。` triggers the
scene but is not marked as a control turn. *Fix:* reuse `normalizeTranscript`,
or have the scene controller send an explicit `control` input for each turn it
consumes.

### Configuration and Console

**MM-22 — Migrating a pre-v5 config empties all media, actions, scenes and spells if one spell or scene is invalid, then reports success** (C; inv 9, DECISIONS "migrations preserving operator values"; **verified**)
`src/main/config-service.ts:462-494` (all five collections set to `[]`),
persisted to active, draft and previous by `:672-728`. Current schema is v5,
so this affects restored or legacy configs, not the live v5 config. Rollback
cannot recover, because `previous` is rewritten too. *Fix:* drop only the
failing entries, or block the migration, and keep a raw `.bak` copy of each
slot first.

**MM-24 — Unsaved Config and Models panel edits are overwritten by refreshes, and Models save failures are hidden** (H; inv 9, 11; confirmed)
`src/renderer/console/App.tsx:1098-1100` (draft reset on every config
change), `:2226-2239` (an Events filter change refetches config and models),
`:1868-1889` (`run` ignores the `ConsoleResponse`, then reloads the stored IDs).
The operator loses edits with no notice, or believes a rejected model ID was
saved. *Fix:* adopt refreshed drafts only when the panel is clean, stop the
Events filter from refetching config, and show `ok`/`error`/`fields`.

### QA and production separation

**MM-25 — Generic Phase 4 QA modes run on the operator's real userData when the isolation env vars are missing** (I; inv 1, 11; confirmed)
`src/main/phase0-demo-runner.ts:173-177`; `src/main/index.ts:101`,
`:124-130`, `:744-762`. Only the Raven/wake suites and Phase 1 check isolation
inside the app. Profile QA clicks "Confirm publish" against whatever config it
booted with. *Fix:* treat missing isolation as invalid whenever
`MIRROR_PHASE4_QA` or `MIRROR_SMOKE_MS` is set.

**MM-26 — The Phase 4, Phase 1 and smoke runners do not check whether the production Electron is running; `--profiles` opens the real wake mic** (I; inv 8, 9, 10; plausible)
`scripts/run-phase4-qa.mjs:107-110`, `:297`;
`src/main/wake/microphone-permission.ts:2-9`. The app takes no single-instance
lock. *Fix:* move the Raven runner's already-running check into a shared
helper used by every runner, and skip native wake capture in isolated QA
unless the mode asks for it.

**MM-27 — Production runs the repo's mutable `out/`, and QA code ships in the production bundle** (I; inv 10, 11; confirmed — **decision D-2**)
`package.json:7`; `scripts/qa-build.mjs:52-79`;
`src/main/index.ts:31`, `:58`, `:87`. Every QA rebuild changes what the next
KeepAlive restart serves to visitors. The QA stamp records hashes, not a
commit.

### Avatar, display and camera

**MM-28 — Any face box past the frame edge discards the whole camera frame, and camera status flaps** (G; inv 9, 10; plausible)
`deploy/macos/camera-tracker.swift:155-163`;
`src/main/camera/nearest-face.ts:20-21`; `src/main/camera/tracker.ts:66-79`.
A visitor's head near the top edge makes status flip up to about 10 times a
second, churning telemetry. *Fix:* clamp boxes to [0,1] in the worker and
reject only non-finite values.

**MM-29 — A lost WebGL context leaves the avatar blank while it reports ready** (G; inv 9, 10; plausible)
`src/renderer/avatar/cubism-avatar.ts:596-699`. No code anywhere handles
`webglcontextlost`, and Main has no GPU `child-process-gone` handler. *Fix:*
handle context loss (stop the loop, report a degraded state, show the
fallback) and restore or fail visibly.

**MM-30 — QA raw-capture close race can briefly leave two mic owners** (`b1a4f54` review; inv 8; QA-only)
`src/main/raven-wake-replay-qa.ts:171`, `:244-251`. If the capture does not
close within 2 s, or an earlier throw happens, `owner.acquire()` runs without
waiting for the close. *Fix:* await the close (or a confirmed timeout kill)
before acquiring.

---

## Low

| ID | Slice | Location | Finding | Fix |
|---|---|---|---|---|
| MM-31 | C | `src/main/telemetry.ts:500-534` | A persistently failing `0→1` rotation rename deletes one rotated JSONL per emit, then disk logging stops. | Rename `0→1` first; back off on failure. |
| MM-32 | C | `telemetry.ts:452-470,617-629`; `console-data.ts:424-459`; `boot.ts:1656` | Drop and writer-failure counters live only in RAM and are never shown; the JSONL has unmarked gaps. | Show `getStats()` in the Overview; write a summary line when the writer recovers. |
| MM-33 | C | `src/main/sqlite-service.ts:178` | Phase-test pruning keeps 20 rows across all phases, so newer phases delete older evidence. | Prune per phase. |
| MM-34 | C | `config-service.ts:1220-1225`; `console-config.ts:1052-1060` | Rollback overwrites a saved, unpublished draft without warning. | Refuse, or include the draft discard in the confirmation. |
| MM-35 | C | `config-service.ts:771-813` | Publish/rollback writes previous→active→draft with no journal; a crash mid-sequence loses the rollback target. | Write `previous` last, or add an intent journal. |
| MM-36 | B | `src/main/ipc.ts:1959-1976,2076-2104` | Developer Mode simulate/avatar-control is gated only in the renderer; Main accepts it in production. | Reject in Main when developer mode is off. |
| MM-37 | B | `src/main/index.ts:369-421` | No permission handler on the default session; any app renderer or prompt window gets mic and camera. | Allow `media` only for the tracked Mirror webContents. |
| MM-38 | F | `index.ts:326-329`; `wake/conversation-activation.ts:29-35` | The wake activation result is discarded; an ignored wake leaves the mic released with no event. | Emit the outcome; re-acquire on ignored/failed. |
| MM-39 | F | `scenes/scene-config.ts:165,317-327`; `spell-trigger.ts:111-114` | A punctuation-only spell phrase disables all spells (`catalogVersion` is stored before the guard is built). | Reject phrases that normalize to empty; set the version after the build. |
| MM-40 | F | `wake/calibration.ts:50-56`; `supervisor.ts:272,398-406` | A failed calibration restore leaves calibration active, so visitor wakes are swallowed silently. | Clear the calibration flag or restart with the original package; emit the failure. |
| MM-41 | E | `realtime-runtime-owner.ts:335,343` | Transcripts that arrive during the rollover wait are dropped silently, so spells are not checked. | Accept `rolling_over` for the current session, or emit a reason. |
| MM-42 | E | `realtime-session-adapter.ts:1115-1182` | `input_audio_transcription.failed` is not handled; scene and memory turn boundaries are left open. | Emit `transcript_unavailable`; close the turn. |
| MM-43 | E | `src/renderer/realtime/turn-controller.ts` | Appears unused. | Remove after confirming. |
| MM-44 | G | `cubism-avatar.ts:567-574` | The Cubism shader manager keeps every WebGL context and canvas after a remount. | Delete the context's shader entry on final dispose. |
| MM-45 | H | `App.tsx:1485-1504,1552,1651-1652,1842` | One-shot `acceptRefresh` and `retainLocalDraft` flags survive a failed refresh and apply to a later one. | Tie them to a refresh generation. |
| MM-46 | H | `SceneComposer.tsx:88-187`; `App.tsx:1429-1480` | "Undo removal" restores an old snapshot and drops media imported after the removal. | Clear undo on external draft changes, or undo only the removed item. |
| MM-47 | D | `src/main/index.ts:1326-1336` | A background commit while Dormant leaves `cleanup_required=1` until that person confirms again (search empty, import fails). | Clear the flag when no session holds that owner. |
| MM-48 | D | `store.ts:259-262`; `MemoryPanel.tsx:46-50` | Read-only Console lookups create permanent person-name scope rows (including partial names). | Make `policy()` read-only; delete empty scopes. |
| MM-49 | I | `scripts/run-phase4-qa.mjs:265-295` | Unlisted `MIRROR_*` env vars (for example a leftover `MIRROR_VOICE_QA=1`) switch the suite, and the pass is reported under the requested mode. | Use an allowlist; add an explicit `--voice` mode. |
| MM-50 | I | `src/main/raven-wake-replay-qa.ts:236-238` | `wake_replay` / `wake_capture` / `wake_control` always report `passed` as `raven_conversation`. | Report `diagnostic` status and the scenario, or assert detections. |
| MM-51 | I | `scripts/run-phase1-live-smoke.mjs:84-92,301-309`; `predev` | Phase 1 smoke uses an unstamped dev build; `predev` rewrites `out/native/camera-tracker` under the running app. | Use stamped `out/`; send dev native output to a dev-only directory. |
| MM-52 | b1a4f54 | `raven-wake-replay-qa.ts:67` | Up-front device resolution breaks plain `wake_replay` when no default device is flagged. | Fall back to the system default when no native-rate device is needed. |
| MM-53 | b1a4f54 | `scripts/memory-qa-speech.swift:18` | A missing zh-CN voice silently falls back, but the trial stays labelled zh-CN. | Fail or record the actual voice. |
| MM-54 | b1a4f54 | `raven-conversation-qa.ts:401` | The muted-media diagnostic may mute a stale audio element and still record `backgroundMediaMuted: true`. | Track the actual loop element. |
| MM-55 | b1a4f54 | `raven-conversation-qa.ts:183` | The QA wake stimulus check loads a KeywordSpotter synchronously in Main before every playback, skewing timing. | Compute once per stimulus, before the timed window. |
| MM-56 | b1a4f54 | `raven-conversation-qa.ts:179,349`; `raven-wake-replay-qa.ts:106,136-160` | Duplicated playback routine, dead renderer acoustic path, and an unused KeywordSpotter per raw trial. | Share one helper; remove the dead path; create `live` only when needed. |
| MM-57 | I | `tests/unit/phase4-qa-runner.test.ts` | Mostly source-text `toContain` checks, so behavioral regressions in runner isolation cannot be caught. | Replace with behavioral tests of the env/isolation resolver. |

## Areas reviewed and found sound

- **IPC boundary (B):** exact-sender and main-frame checks, exact-key payload
  validation, `ek_`-only secret mapping, frozen preload DTOs,
  sandbox/contextIsolation, navigation blocking and CSP. No guest/candidate ID,
  transcript or credential crosses IPC.
- **Credentials (A, E):** `.env` is read only in Main. Minting uses the frozen
  snapshot model with a 600 s secret and no substitution (invariants 11, 12).
- **Telemetry content (C):** field allow-listing and reason regexes keep it
  metadata-only (invariant 1).
- **Memory scoping (D):** avatar and owner scoping in SQL and FTS, owner-ID
  containment, worker and embedder lifecycles, secure delete, and epoch/token
  guards on background commits.
- **Scenes and media (F):** exact full-transcript matching with once-per-turn
  dedupe, hardware limited to preset IDs, media path containment
  (`realpath`/inside checks, hash-verified serving), YouTube isolation
  (separate partition, URL allowlist, no preload).
- **Audio and avatar (G):** one audible route (SDK `<audio>` muted, a single
  MediaStreamSource), immediate gain-zero on graph interrupt, safe avatar import
  with Raven masters untouched, camera frames kept in private pipes.
- **Console (H):** React-only text rendering (no `innerHTML`); listener, timer
  and media cleanup in the studio and preview components; scene draft
  conflict detection.
- **QA harness (I):** hash-pinned downloads, metadata-only markers, synthetic
  camera and mic substitution, exact-case-count pass checks in the
  YouTube/media-intent runners. Nearly every product module has tests.

## Not verified

- Runtime behavior of the network drop (MM-17), the GPU context loss (MM-29),
  Vision box overflow on this camera (MM-28), and concurrent production + QA
  runs (MM-26).
- Interrupt mute latency (MM-04) was not measured; the code path is verified.
- No full test suite, Electron run or physical audio check was performed for
  this review.
