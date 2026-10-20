# Performance, correctness and UI/UX review — 2026-10-10

## Scope and method

- **Target:** branch `field/macmini-deploy` at `3fdb497`. Product `src/` is
  unchanged since the earlier
  [whole-project code review](whole-project-code-review-2026-10-10.md)
  (MM-01 – MM-57). Only `deploy/macos/board-hdmi-keepalive.sh` changed (b98102e).
  This review **does not repeat MM findings**. It adds performance, efficiency,
  new correctness findings and a UI/UX audit.
- **Method:** six read-only Opus reviewers worked in parallel:
  - Main-process performance
  - Mirror renderer performance
  - Worker performance (wake, memory, camera, watchdog)
  - Fresh correctness sweep
  - Console UI/UX
  - Mirror guest UX

  The root session merged duplicates and re-read the code for every
  finding marked *verified*.
- **Runtime evidence:** Codex was operating the live app (LaunchAgent PID 94357)
  during this review. Nothing was launched, rebuilt or restarted. `out/`, the
  mic, the camera and `.env` were not touched. Evidence is limited to:
  - `ps`/`top` CPU and RSS
  - one 3 s `sample` of Main
  - event-name counts from telemetry
  - presentation and phrase fields of the operator config
  - Node-only probes in the session scratchpad: wake spotter benchmark, Cubism
    moc probe, synthetic SQLite, timezone probe and a `getConfig` vitest probe
- **Checks:** `npm run typecheck:node` exit 0; `npm run typecheck:web` exit 0.
  No Electron, QA runner, full suite or build was run.
- Nothing here is runtime, physical or phase acceptance.

## Live runtime snapshot (Dormant, 20:40–21:00)

| Process | CPU | RSS | Note |
|---|---|---|---|
| Electron Main | **~65 %** while being driven; ~0.2 % otherwise | 100–270 MB | See below |
| Wake utility process | 8–19 % | 62 MB | PE-02 |
| Mirror renderer | ~1 % | 141–262 MB | rAF loop never pauses (PE-04) |
| Console renderer (hidden) | ~0.3 % | 62–204 MB | Created at boot (PE-12) |
| GPU process | ~0.7 % | 235 MB | |
| Memory-embedding Python | 0 % | **1.41 GB** | PE-03 |
| camera-tracker | 0.3 % | 57 MB | 5 Hz Vision |

**The 65 % Main CPU is not product code.** A 3 s stack sample attributes the
busy Main-thread time to AppKit answering external **Accessibility** queries:
`_XCopyMultipleAttributeValues`, `_XCopyAttributeValue`, `_XCopyAttributeNames`
and `NSMenu _forEachAccessibleMenuItem`. These come from the ChatGPT
computer-use agent (`cua_node`) that is driving the app. No JavaScript frame
was hot. Idle Main CPU measured when the app was not being driven was about
0.2 %. Treat any CPU figure taken while a UI-automation client is attached as
invalid.

## Executive summary

| Area | High | Medium | Low |
|---|---|---|---|
| Performance and efficiency (PE) | 1 | 5 | 9 |
| Correctness (CO) | 0 | 7 | 6 |
| Console UI/UX (CX) | 2 | 7 | 5 |
| Mirror guest UX (MX) | 1 | 6 | 4 |

The main themes:

1. **The Console `getConfig()` is on hot paths it was never meant for**
   (PE-01). It runs on every avatar file request and on every finished visitor
   utterance. Each call does 15 config file reads and zod parses, a 13 MB ONNX
   SHA-256, a keyword-file rewrite and 5–7 telemetry lines, all behind the
   Console's serial queue. This one change would remove most Main-side waste
   and about two-thirds of the telemetry volume.
2. **24/7 idle waste on the kiosk.** The wake spotter runs 2 ONNX threads where 1 is
   equivalent (about 4× the CPU, PE-02). The embedding model holds 1.4 GB from
   boot (PE-03). The Cubism loop renders 60 fps even when the deployed
   `reflective` mode hides the avatar in Dormant (PE-04). A media AudioContext
   runs from boot (PE-09). Camera gaze IPC runs at 5 Hz forever (PE-10).
3. **Network calls without a deadline** (CO-01). A stalled client-secret mint
   holds Activating for up to about 300 s with wake already released.
4. **Guest-facing failure states** (MX-02, MX-03). Black Dormant is
   intentional (MX-01, owner intent), so failure states must be clearly
   distinct from it. OfflineLoop and Maintenance currently show English debug
   codes. Waking shows nothing for at least 400 ms (MX-04).
5. **Console operability** (CX-01, CX-02). Failure reasons are raw snake_case
   codes, and "is the mirror listening?" is hidden behind two collapsed panels.

## Quick wins (small, low-risk, high value)

| # | Change | Finding |
|---|---|---|
| 1 | **Operator config typo:** published `sleepPhrase` is `恭送渡鴨大人` (鴨 "duck"), wake phrase is `有請渡鴉大人`. It is also fed to ASR as a keyword. Correct it in the Console (operator action; not changed by this review). | MX-10 (**verified** in active + draft) |
| 2 | `numThreads: 2` → `1` in the wake spotter, then one positive wake replay. | PE-02 (**verified**) |
| 3 | Sanitize avatar-runtime `reason` (lowercase, `:`→`_`) before IPC. | CO-02 (**verified**) |
| 4 | `AbortSignal.timeout(~10 s)` on client-secret mint and model probe. | CO-01 (**verified**) |
| 5 | Cache control phrases and avatar file lists per published version instead of calling `getConfig()`. | PE-01 (**verified**) |
| 6 | Pause the Cubism rAF loop while the avatar is hidden. | PE-04 |

---

## Performance and efficiency

### PE-01 — Console `getConfig()` runs per avatar file and per visitor utterance (High · **verified**)

**Location**
- Callers:
  - `src/main/index.ts:1091` (avatar protocol host)
  - `src/main/index.ts:1352-1356` (`controlPhrases`, called per turn from `src/main/memory/relationship.ts:152`)
- Cost:
  - `src/main/console-config.ts:765-835`, `:1181-1192` (serial queue)
  - `config-service.ts:914-958`, `:1238-1247`
  - `index.ts:953-962` (`getWakeTuningDefaults`)
  - `wake/model-package.ts:97,162,184-187`

**Problem.** One `getConfig()` does:
- three `readState` calls and two `service.diff` calls, which is five
  `resolveSlots` runs: 15 file reads and 15 zod parses
- a reload of the wake package: about 12.7 MB of ONNX read and SHA-256 hashed
  synchronously on Main
- a rewrite of the keyword file
- 5–7 info telemetry lines

All of this waits in the Console serial queue.

**Impact.**
- Boot logs 19 `getConfig` calls. On the 13:04 boot they ran for about 0.4 s
  just before `avatar_runtime_metadata`, with about 250 MB of transient Buffers.
- Every utterance repeats the whole cost on the renderer's serialized
  `memoryInputQueue`. A concurrent Console Test draft or Publish stalls memory
  inputs and memory tool calls.
- `config_loaded` + `config_diff_computed` are **66 % of `telemetry-0.jsonl`**
  (8,885/13,393 lines, Oct 3–10) and 78 % of the last two days. They push real
  degrade events out of the Console's 2000-event ring (invariant 9).
- If the read fails, `controlPhrases` returns `[]` silently, so spell and sleep
  turns reach extraction with no reason (invariants 6 and 9).

**Fix.**
- Keep the parsed published slots in memory. Main is the only writer, so
  refresh after each write.
- Serve avatar files from an in-memory model index.
- Memoize `getWakeTuningDefaults` by package and phrase.
- Emit `config_loaded` only on migration, recovery or version change.
- Emit a reason when control phrases are unavailable.

### PE-02 — Wake spotter uses 2 ONNX threads; 1 gives the same latency at about ¼ the CPU (Medium · **verified**)

**Location:** `src/main/wake/sherpa-detector.ts:106` (`numThreads: 2`).

**Evidence.** Scratch probe with the Mac v1 model, paced in real time with
100 ms blocks:

| Threads | Paths | CPU of one core |
|---|---|---|
| 2 | 32 | 13.8–17.9 % |
| 1 | 32 | 3.1–4.0 % |

Batch wall time is identical (real-time factor ≈ 0.007). The second thread
spin-waits. Going from 4 to 32 paths adds only about 10 % CPU, so **CPU is not
a reason to narrow the search for D-3**.

**Impact:** about 1.5–2 wasted core-hours a day, 24/7.

**Fix:** `numThreads: 1`. This is not a runtime model ID, so invariant 11 is
unaffected. Re-run one positive and one negative wake replay.

### PE-03 — The embedding worker loads at boot and holds 1.4 GB forever (Medium)

**Location:**
- `src/main/index.ts:1319` (eager prewarm `embed('Memory runtime readiness.')`)
- `src/main/memory/embedding.ts:82-87,317` (no idle stop)
- `scripts/memory-embedding-worker.py:121-131`

**Problem.** The bf16 Qwen3-0.6B weights are 1.19 GB. They stay resident
through hours of Dormant even when no confirmed person uses memory. That is
about 10 % of a 16 GB Mac mini.

**Fix.**
- Drop the boot prewarm and prewarm on wake or on identity proposal instead.
- Stop the worker after N minutes of Dormant with an empty queue.
- A cold start already degrades visibly to lexical recall with
  `coverage: 'incomplete'`.

### PE-04 — The Cubism render loop never pauses (Medium)

**Location:** `src/renderer/avatar/cubism-avatar.ts:596-648,698`. The avatar is
hidden by:
- `presentation.css:10-11` (reflective asleep: `visibility:hidden`)
- `mirror/styles.css:22` (media video)
- `mirror/styles.css:126-131` (cover scene visual)

`backgroundThrottling:false` is set at `index.ts:398,565`.

**Problem.** The deployed config is `presentation.mode = "reflective"`, so the
avatar is invisible for the whole of Dormant. The loop still runs update, clear,
the mask pass and a full 1080×1920 draw at 60 Hz. The same happens behind
full-screen media and while the TV is in standby.

**Impact:** 60 wakeups per second in both the renderer and the GPU process, around
the clock. The Raven v11 frame is cheap (Cubism `update()` takes 0.022 ms), so
the waste comes from frame frequency, not per-frame cost.

**Fix:**
- Add `setPaused(boolean)`: cancel the rAF and reset `previousTimestamp` on
  resume.
- Pause while reflective asleep or inactive, while the media skill hides the
  avatar, and while a cover visual is shown.
- Optionally cap `always_visible` Dormant at 20–30 fps.

### PE-05 — Avatar runtime IPC runs at frame rate and carries the full device list (Medium)

**Location:**
- `src/renderer/mirror/App.tsx:834-841,860,1328-1334`
- `lip-sync-driver.ts:131`
- `src/preload/mirror.ts:556-569`
- `src/main/ipc.ts:296-316,1543-1555`

**Problem.** During speech, about 60 messages per second each carry the whole
`AvatarRuntimeSnapshot`, including up to 128 audio devices. A further 2 per
second are sent forever. Main validates each one fully, but the data is read
only when the Console polls.

**Fix:**
- Throttle mouth and waveform updates to 10 Hz or less, or sample them only
  when the Console polls.
- Send `audioDevices` only when it changes.
- Skip sends when nothing changed.
- Rate-limit `ipc_payload_invalid` (see CO-02).

### PE-06 — The Console re-renders its 2,500-line root twice a second (Medium)

**Location:**
- `src/renderer/console/App.tsx:2271,2277` (500 ms poll, new state object every
  tick)
- `:1524-1532` (2× `draftFingerprint` and 2× `workspaceChanges` per render)
- `:2432-2441` (non-memoized `ScenesPanel` with inline props)
- `SceneComposer.tsx:116,178`

**Problem.** Every poll reply replaces state. All mounted panels re-render and
recompute fingerprints and `structuredClone`s.

**Impact:** typing lag in large catalogs, worst during a live conversation on the
Mac mini.

**Fix:**
- Set state only when the reply changes, or have Main push changes.
- Move runtime state into a small store used only by Devices and the banner.
- `useMemo` the fingerprints.
- `React.memo` `ScenesPanel`.

### PE-07 — The board-HDMI watchdog has no adb timeouts and pulls full dumpsys every 20 s (Low–Medium)

**Location:** `deploy/macos/board-hdmi-keepalive.sh:36-61`. This is separate from
the MM-06 root-PATH fix.

**Problems:**
- `adb connect` to an absent board blocks for about 75 s. The daemon log shows
  START→UNREACHABLE at 18:00:05→18:01:20. The real retry period is therefore
  about 95 s, not 20 s.
- `adb shell dumpsys …` has no timeout. A half-open Wi-Fi session can wedge the
  loop silently, and `KeepAlive` does not restart a hung process.
- Each cycle spawns about 11 processes (about 47k a day) and transfers the full
  `dumpsys power` and `dumpsys activity activities` output.

**Fix:**
- Check reachability first with `nc -z -G 2 <ip> 5555`.
- Bound each adb call with a background job and a kill.
- Filter on the device (`grep -m1 mWakefulness=` and `grep -m1 mResumedActivity`).
- Start the adb server once.
- Back off to about 60 s while `HDMI_VIEW_ACTIVE`.

### Low

| ID | Location | Finding | Fix |
|---|---|---|---|
| PE-08 | `wake/worker.ts:133-135`; `sherpa-detector.ts:73-78`; `WakeCalibrationPanel.tsx:107` | Each settled calibration slider value builds a new spotter (about 71 MB native). The addon has no destroy method, so 20 edits reached about 709 MB without GC in the probe. | Restart the wake utility process when calibration ends, after the mic release. |
| PE-09 | `avatar-media-controller.ts:49,56-60` | The media `AudioContext` runs from boot forever; a 1 MB Console test WAV is preloaded in the Mirror. | Create it lazily, or `suspend()` it when no media is attached; set `preload='none'`. |
| PE-10 | `index.ts:1075-1078`; `camera/tracker.ts:66-68`; `camera-tracker.swift:110-113` | Gaze results are sent to the Mirror at 5 Hz all day, including repeated `null` (about 432k IPC messages a day). | Send on change only; lower Vision to 1–2 Hz after a minute without a face in Dormant. |
| PE-11 | `index.ts:1000-1007`; `avatar/media-folders.ts:65-109` | Media folders under `~/Library/CloudStorage` are rescanned every 30 s, including while Active. | Skip while Active; use `fs.watch` or back off. |
| PE-12 | `index.ts:453,597-600` | The hidden Console renderer is created at boot (about 60–200 MB) and adds 2 `getConfig` calls to boot. | Create it on first Ctrl+Shift+D. |
| PE-13 | `processed-audio-output.ts:50`; `voice-effects.ts:147-166` | Every `speech_started` regenerates reverb and echo impulses (up to 230k `Math.pow` samples) and 7 nodes, even when nothing is playing. | Cache the impulse buffers by settings; flush only if output was active. |
| PE-14 | `cubism-avatar.ts:527-547`; `avatar-framing.ts:11`; `cubism-performance.ts:23-33` | 13 linear `getId()` lookups and about 10 small allocations per frame. | Resolve ids once and hoist constants (matters only alongside PE-04). |
| PE-15 | `out/renderer/assets/realtime-session-adapter-*.js` | Renderer output is unminified. A 2.5 MB shared vendor chunk is loaded by both the Mirror and the hidden Console. | Optional: `build.minify` for the renderer; split Console-only vs Mirror-only vendor code. |

---

## Correctness (new; MM-01 – MM-57 excluded)

### CO-01 — Client-secret mint and model probe have no deadline (Medium · **verified**)

**Invariants:** 9, 10.

**Location:**
- `src/main/realtime/client-secret-broker.ts:191-211` (a signal is used only
  if the caller passes one) and `:277+`
- No signal is passed from `session-start-bundle.ts:45`, `boot.ts:1320`
  (recovery probe) or `boot.ts:2152`.
- `lifecycle.ts:72-77`: `activating` has no `after` timeout.
- `mirror/App.tsx:207-238` has no timeout either.

**Failure scenario.** After a Wi-Fi blip the upstream is half-open. A visitor
wakes the mirror, and Activating holds for up to about 300 s (undici's
headers timeout). Wake has already released the mic, and no reason is shown.
In OfflineLoop, a hung recovery probe delays the return to Dormant by the
same amount. By contrast, `youtube-search.ts:49` already uses
`AbortSignal.timeout(10000)`.

**Fix:**
- `AbortSignal.any([caller, AbortSignal.timeout(10_000)])` for both the issue
  and the probe, mapped to the existing `fetch_failed`/`start_failed` reasons.
- Optionally add an Activating deadline in the lifecycle.

### CO-02 — A colon or uppercase in an avatar reason makes Main reject every later runtime report (Medium · **verified**, latent)

**Location:**
- Producers:
  - `mirror/App.tsx:1200` (`avatar_motion_dispatched:${group}`)
  - `cubism-avatar.ts:676-681` (`avatar_motion_${phase}:${group}`, groups are
    capitalised, e.g. `Dormant`)
  - `App.tsx:954-966` (`avatar_music_play_failed:…`)
- The reason is retained in `avatarMetricsRef` (`App.tsx:834-836`).
- Main checks `^[a-z][a-z0-9_]{0,95}$` (`ipc.ts:259,308`), then
  `payloadRejected` (`ipc.ts:1550-1552`).

**Problem.** Once such a reason is merged into the ref, every later
`reportAvatarRuntime` fails validation. That includes the 2 Hz metrics and the
60 Hz mouth updates. It lasts until an unrelated clean reason overwrites it.

**Impact.**
- The Console avatar runtime freezes stale.
- Telemetry gets about 7,200 `ipc_payload_invalid` lines an hour while idle,
  and about 3,600 a minute during speech.
- Latent today: the trigger is an explicit `playMotion` from a scene motion
  action or Console motion test, the active config has no motion actions, and
  the current telemetry has 0 occurrences.

**Fix:**
- Normalize the reason in `reportAvatarRuntime`.
- Do not carry a rejected reason forward.
- Rate-limit `payloadRejected`.

### CO-03 — Memory `eventAt` uses UTC days; valid Taiwan-midnight dates are rejected (Medium)

**Location:**
- `src/main/memory/extractor.ts:15-24` (`mentionsEventDate` compares by UTC
  day), `:91,96`
- Live `observedAt` is a UTC ISO string (`relationship.ts:110,116`).

**Problems:**
- (a) Text `2024年3月5日` with `eventAt` `2024-03-05T00:00:00+08:00` throws,
  and the whole chunk is dropped as `memory_extraction_invalid`. Confirmed by
  probe.
- (b) Accepted +08:00 values are stored as the previous UTC day.
- (c) Relative dates ("明天") are resolved against UTC, so the result is off by
  one day between 00:00 and 08:00 Taipei time. Plausible.

**Fix:**
- Send local-offset `observedAt` (Asia/Taipei).
- Keep `eventAt` as a calendar date or with its original offset.
- Compare days in the venue zone.

### CO-04 — `controlPhrases` failure silently disables control-turn exclusion (Medium)

**Invariants:** 6, 9. **Location:** `index.ts:1353-1354` (`if (!config.ok) return []`).

This is covered by the PE-01 fix (cache plus reason event). It is listed
separately because it is an invariant 6 hole, not only a performance issue.

### CO-05 — One embedder or storage-worker failure disables memory until restart (Medium)

**Invariant:** 10.

**Location:**
- `memory/embedding.ts:163-176,297` (terminal `failed` state)
- `memory/repository.ts:49-55,72`: any single 10 s timeout or worker exit sets
  `status='failed'` permanently
- `index.ts:1315-1319`: these are built once

**Impact.** A single 30 s request timeout, or the OS killing the 1.4 GB Python
child under memory pressure, turns off semantic recall and indexing for days.
A storage failure also turns off recall, learning, policy and the Console
memory pages.

**Fix:** rebuild with backoff and an hourly budget. This pairs naturally with
PE-03.

### CO-06 — Hidden stale rows can stop vector indexing for everyone (Medium; amplifies MM-20)

**Location:**
- `memory/store.ts:436-440`: SQL `ORDER BY e.rowid LIMIT ?` runs first, then
  JS `filter(supported)`.
- `memory/indexer.ts:19-20`: `if (!records.length) return`.

**Problem.** Once 8 unsupported rows occupy the lowest rowids, `pendingIndex`
returns `[]` and the indexer stops for every person. The `missing` probe at
`store.ts:398-401` also reports `incomplete` forever, so
`memory_consolidation_retrieval_incomplete` repeats.

**Fix:** do the support filter in SQL, or page with a rowid cursor. Exclude
unsupported rows from `missing`.

### CO-07 — Person names are not folded between Simplified and Traditional (Medium · plausible)

**Invariants:** 2, 4, 9.

**Location:** `memory/relationship.ts:52-62` (NFKC, case and spaces only),
`session.ts:12,55`, `store.ts:36-41`. The ASR is known to emit Simplified
characters: `spell-trigger.ts:104` hardcodes `施放咒语→施放咒語`.

**Failure scenario.** A returning visitor's name comes back as `陈小华`. A new
empty scope is created and their memories are not found. If they re-identify
mid-conversation in the other script, the result is
`memory_clean_session_required`.

**Fix:** fold the script before candidate and identity comparison (a small S→T
map or OpenCC) and store a canonical key.

### Low

| ID | Location | Finding | Fix |
|---|---|---|---|
| CO-08 | `wake/model-package.ts:184-187` | Each `getConfig` truncates and rewrites the live keyword file in place. A concurrent wake `update_config` or restart could read a truncated file. | Write only if missing or different, via temp file and rename. |
| CO-09 | `memory/learning.ts:52-57` | `learning.invalidate` drops up to about 20 s or 6 turns of pending evidence with no reason event. | Emit `memory_learning_invalidated` with a count. |
| CO-10 | `realtime/memory-dialogue.ts:45-53,102-124` | A visitor who answers "對" before Main acknowledges `question_played` makes the dialogue fail and replaces the whole Realtime session. PE-01 widens this window. | Accept speech after the receipt arrives instead of failing. |
| CO-11 | `src/main` (no handler); `index.ts:450,480,482,637,1396-1398` | No `uncaughtException` or `unhandledRejection` handler; `void loadURL/loadFile/stopAll` can reject. Electron's default can put a modal error dialog on the kiosk. | Add handlers that emit metadata and take the exit-1 path; `.catch` the void calls. |
| CO-12 | `memory/session.ts:32-89`; `camera/tracker.ts:96,101`; `avatar/youtube-player.ts:84` | Elapsed time is measured with `Date.now()`. An NTP step can expire identity confirmation early or kill a healthy camera worker. | Use `performance.now()`. |
| CO-13 | `ipc.ts:913-924` | Every clean quit logs `ipc_snapshot_delivery_failed window=mirror cause=window_unknown` (5 of the last 6 boots). | Stop publishing snapshots once shutdown starts. |

### MM-01 – MM-07 status against current code

All seven are **still present**:

| ID | Evidence in current code |
|---|---|
| MM-01 | `boot.ts:1446-1460`: no renderer stop and no wake re-acquire. |
| MM-02 | `index.ts:629-661`: lifecycle is not reset. |
| MM-03 | Nothing produces `RETRY_STARTUP`. |
| MM-04 | `realtime-session-adapter.ts:1342-1350` is unchanged. |
| MM-05 | `relationship.ts:70-77` is unchanged. |
| MM-06 | **Still live.** b98102e did not touch line 12. Both the repo copy and the installed root copy `/Library/Application Support/MagicMirror/board-hdmi-keepalive.sh` still export `PATH=/opt/homebrew/bin:…`. |
| MM-07 | `profile-workspace.ts` still has no model scope. |

---

## Console UI/UX audit

Static audit of `src/renderer/console/*` against
[Phase 4 UI/UX design](../Magic_Mirror_Phase4_UIUX_Design_v0.3.md) and QA
screenshots up to 2026-10-09. MM-07, 24, 34, 36, 45, 46 and 48 are excluded.

### CX-01 — Failure and fallback reasons are raw codes (High · invariant 9)

**Location:**
- `App.tsx:487-494` ("Needs attention" shows `error_code`, `session_id`,
  `reason` and `source`)
- `App.tsx:520`, `:600-610`, `:786`, `:1114-1115`, `:1550-1551`, `:1575`,
  `:1659-1660`
- `WakeRecoveryStatus.tsx:13`, `VoiceStudio.tsx:123`, `CubismStudio.tsx:195-196`
- Screenshot `profile-invalid-save.png`: "Cannot save
  (console_config_invalid): avatarCatalog: invalid_avatar_catalog."

**Impact.** Reasons are visible, so the invariant is met. A venue operator still
cannot tell what failed or what to do next.

**Fix.** Add one shared `reasonCopy(code)` map: a plain sentence plus a recovery
step. Show the raw code inside a "Technical detail" disclosure. Reuse the tone
of the existing `WakeCalibrationPanel` and `MediaFoldersPanel` explanations.

### CX-02 — "Is the mirror listening?" is not answerable at a glance (High)

**Location:**
- The header pill shows the raw lifecycle, e.g. `dormant` (`App.tsx:2392`).
- Wake status sits inside collapsed "Technical health" (`:495-514`) and
  System › Devices › Diagnostics (`:793-822`).
- The banner shows only when `wakeInput.recovery` exists **and** the runtime
  poll succeeds (`:2395-2396`).

**Problem.** Wake states `stalled`, `inactive` and `failed` without a recovery
object never surface. The banner vanishes exactly when the poll fails. An empty
"Needs attention" looks the same as "not loaded".

**Fix.** Add a persistent status strip:
- Mirror state in words, e.g. "Asleep — listening for 「有請渡鴉大人」" or
  "In conversation".
- Wake listener OK, Stalled or Failed, with the recovery step.
- An explicit "All normal" or "Status unavailable".

Drive it from `wakeInput.state`.

### Medium

| ID | Location | Finding | Fix |
|---|---|---|---|
| CX-03 | See PE-06 | Whole-Console re-render at 2 Hz causes typing lag. | See PE-06. |
| CX-04 | `console/index.html:2` | `lang="zh-Hant"`, but all copy is English, so screen readers read English with a Chinese voice. The product language is Traditional Chinese, but no decision on Console language is recorded. `field-help-text.ts:55` lists Simplified `咒语` as an accepted variant. | Set `lang="en"` now and mark Chinese examples `lang="zh-Hant"`. Decide on the Console language and centralize strings. |
| CX-05 | `styles.css:6,42,62-64,141,170,203`; screenshots `console-ritual-fields-1024.png`, `profile-invalid-save.png` | At 1024 px, four nested columns leave inputs about 130 px wide. The sticky publish bar covers about 20 % of the viewport and hides the "Avatar name" and "Wake phrase" inputs, and can hide keyboard focus. | Collapse lists to a select below about 1200 px; single-column form grid; compact one-row bar; `scroll-padding-bottom`. |
| CX-06 | `SceneComposer.tsx:87,136,184,187`; `VoiceStudio.tsx:111-115`; `App.tsx:1685`; `MemoryPanel.tsx:66` | Removing a scene, deleting a step or trigger, overwriting a voice preset, "Discard my edits" and switching to "Memory off" have no confirmation. Undo sits at the bottom of the fieldset. | Use an inline confirm (as MemoryPanel delete already does); show undo as a toast next to the item. |
| CX-07 | `SceneComposer.tsx:86,124-125`; `SceneActionFields.tsx:36-71`; `App.tsx:1195,1575,1648` | `Number(value)` is not clamped; an empty field becomes 0 and negative cooldowns are accepted. Errors appear only as a joined `path: message` sentence in the bar, with no `aria-invalid`. | Clamp on blur; map `fields[].path` to inline errors; focus the first invalid field. |
| CX-08 | `SceneActionFields.tsx:29,35`; `SceneComposer.tsx:12,173`; `App.tsx:1805,1809` | Divergences from the spec: the Lighting/Fog "approved preset" is free text (spec §4, invariant 7 wording); the Kind select shows raw `avatar_dialogue`/`visual`; there is no per-stage warning for on-without-off (§5) and no draft-change count (§2). | Use a preset select from the adapter catalog, friendly labels and a per-stage warning, or update the spec. |
| CX-09 | `styles.css:326-336,362-376`; `App.tsx:1806,1905` | `--mock` uses the same green as success, so "Physical not connected" and "Mock / simulator" look healthy (spec §4: mock never counts as physical). "Disabled" uses the failure red, and neutral notices use the error color. | Amber or neutral for mock; neutral for disabled; an info style for notices; an icon as well as color (§8). |

### Low

| ID | Finding |
|---|---|
| CX-10 | There are five Stop buttons. Those inside `<fieldset disabled>` are disabled during test startup, exactly when needed (`SceneComposer.tsx:60-61,152,166,177`). Stop All is hidden on Memories. Fix: one always-enabled Stop outside the fieldset. |
| CX-11 | Stale and inconsistent copy: "Save Draft first" refers to a button that no longer exists (`App.tsx:1631`); "test this Draft on Windows" (`SceneActionFields.tsx:72`); "Abort" vs "Stop"; mixed Title Case; jargon such as "Main-owned safe fields", "RAM page", "beforeSequence: cursor". |
| CX-12 | The same result is announced three times by live regions (`App.tsx:1682,1818`; `SceneComposer.tsx:169`). Status nodes mount together with their text, so the first message is missed. Fix: one persistent `aria-live` region per page. |
| CX-13 | "Mic owner" is inferred from the lifecycle in the renderer (`App.tsx:509`) and can disagree during a failed hand-off (invariant 8). Fix: show Main's value, or label it inferred. |
| CX-14 | The disabled "Delete avatar" keeps its red border, and its reason text sits two blocks below it. |

**Works well:**
- Unsaved-edit navigation guard and `beforeunload` protection; conflict
  detection keeps local edits.
- Phased Saving…/Checking… labels with abort.
- Disabled actions explain why.
- Keyboard-reachable help with Escape to dismiss.
- 44 px targets and a 3 px focus ring.
- Native modal delete with Cancel focused first.
- Wake-recovery messages give concrete steps.
- Lists use stable keys.

---

## Mirror guest UX audit

Deployed Raven presentation (metadata from `active.json`):
- mode `reflective`
- entranceMs 4000, exitMs 2400, blackHold 400, revealStart 1500
- wake `有請渡鴉大人`, sleep `恭送渡鴨大人`, greeting `來者何人？所問何事？`

### MX-01 — Black Dormant is intentional; the operator needs the liveness signal instead (withdrawn as a guest defect)

**Owner intent (2026-10-10):** Dormant must be completely black. The
reflective TV shows a plain mirror, and the surprise of Raven appearing after
the wake phrase is the experience. No Dormant mark, glint or wake hint will be
added. The spec's 「不黑畫面」 (`Tech_Spec:18`, `PRD:74`, Implementation Plan
P7-D4) applies to *failure* states (Maintenance, OfflineLoop, recovery,
avatar-asset failure), not to a healthy Dormant.

**Location:** `presentation.css:11-12` (reflective asleep: avatar `opacity:0;
visibility:hidden`); `PresentationStage.tsx:98-99`; screenshot
`mirror-ritual-asleep.png`.

**Remaining consequence.** On the screen, a healthy Dormant looks the same as a
crashed app, a dead wake listener or lost HDMI. Visitors cannot tell, so
the operator must be able to:
- See wake health without opening panels. CX-02 now carries this.
- Rely on every failure state being visibly non-black on the Mirror (MX-02,
  MX-03). Starting (`App.tsx:1350`) is also black, which is acceptable only if
  it is short.
- Get a Console event when the ambience fails (`presentation-ambience.ts:30-31`
  already emits `presentation_ambience_failed`); this is fine as is.

### MX-02 — OfflineLoop shows English debug text and a tiny placeholder (High)

**Location:** `App.tsx:555-569,730-768`; `styles.css:88-96`;
`resources/generated/mock/offline-loop-v1.mp4` (1,687 bytes).

**Problem.** The visitor sees "OFFLINELOOP" and "Cloud unavailable; local
fallback is playing.", or the raw `offline_loop_asset_unavailable`, in a strip
of about 544×160 px. The PRD (§US-OUT) asks for a full-screen
「明確而具魔幻感的訊號」. Nothing tells the visitor to wait.

**Fix:** a full-bleed authored loop with an in-persona line such as
`渡鴉暫時聽不見遠方的聲音，請稍後再喚醒我`. Keep codes Console-only.

### Medium

| ID | Location | Finding | Fix |
|---|---|---|---|
| MX-03 | `App.tsx:687-692,711-718,1263-1269`; `AvatarCanvas.tsx:157` | Maintenance, the no-bridge state and the avatar fallback show snake_case English codes at 17–18 px and 65 % opacity. Because of MM-03, Maintenance can last indefinitely. | Show a fixed Chinese line, e.g. `魔鏡休息中，請洽現場人員`; codes Console-only. |
| MX-04 | `PresentationStage.tsx:73`; `presentation.css:13`; `presentation-greeting-gate.ts:44-55` | After the wake phrase the screen stays black for at least 400 ms, the reveal starts at 1.5 s, and the greeting cannot start before about 4.25 s plus Realtime latency. NFR-01 targets a 150 ms first frame. Visitors repeat the wake phrase, and in Active that is treated as ordinary speech. | Acknowledge within 150 ms without spoiling the black-to-reveal surprise (MX-01): prefer a short local audio cue, or begin the ritual video immediately instead of after the black hold. Start the greeting at reveal, or shorten entranceMs. |
| MX-05 | `scene-transcript-controller.ts:118-127`; `spell-announcement.ts:32-34` | After an exact match, any VAD `speech_started` before the 「施放咒語」 announcement finishes (crowd noise, trailing words) cancels it and `triggerScene` never runs. Only a metadata event is emitted, and there is 1–3 s of dead air before the effects. | Commit the scene on match and play the announcement alongside it, or treat `speech_started` as non-fatal here; give a visible cue on match. |
| MX-06 | `avatar-audio-coordinator.ts:151-153`; `realtime.v1.json` ("stay silent" rules) | After a silent tool reply, a failed spell or a dropped response, Raven stays in the Thinking pose indefinitely, including through a whole song. The `scene` conversation state is never set. | Return to Listening after N s with no `output_started`; show the Scene state during spells. |
| MX-07 | `styles.css:76-86` | Visitor status text is about 17 px at 0.65 opacity. On a 55" portrait panel that is about 11 mm, which is marginal at 2 m, worse for CJK strokes. | Size from `vh` (about 3–4 vh, i.e. 58–77 px), full opacity, 5 % safe-area inset. |
| MX-08 | `styles.css:126-132`; `App.tsx:1337-1345` | Cover scene video (z 20) hides the avatar while the conversation continues, and there are no captions anywhere. Visitors get no face, no state indicator and no text. | Show a small listening/speaking glyph during cover visuals. Optional RAM-only reply captions dropped at turn end would fit invariant 1, but need an owner decision. |

### Low

| ID | Finding |
|---|---|
| MX-09 | In landscape (TV rehomed without rotation, or 2160p) the 9:16 canvas is pillarboxed, and Raven's right shoulder is clipped at a hard edge (`portrait-layout.ts:30-41`; `raven-live.png`). Fix: feather the canvas edges or recentre the framing; emit a Console event when the viewport is not portrait. |
| MX-10 | Copy issues: the sleep phrase typo 渡**鴨** vs 渡**鴉** (**verified**; also biases ASR through the keyword list at `index.ts:1356`). The default wake phrase `魔鏡阿魔鏡` would normally be written `魔鏡啊魔鏡`. Memory disclosure lines are plain policy prose that clashes with Raven's archaic voice. The identity question falls back to English `Are you {{name}}?` when the language is unknown (`memory/intent.ts:28`, `realtime-prompts.ts:47`). |
| MX-11 | The full-screen ritual video has no flash or brightness guard; reduced-motion only affects the mist (`PresentationStage.tsx:107-110`, `presentation.css:33`). |
| MX-12 | Scene `<video>` uses an inline ref callback, so React detaches and reattaches it on every App render, cancelling the running fade transition (`App.tsx:1337-1345`; `scene-visual-controller.ts:121-142`). Plausible visual glitch. Fix: a stable `useCallback` ref, or guard with `host.firstChild !== media`. |

**Privacy (invariant 2):**
- The Mirror never draws names, transcripts or identity data.
- The current `你是{{name}}嗎？` name comes from the visitor's own words; no
  face-to-name path is wired.
- When face proposal arrives, saying a candidate name aloud tells bystanders
  who is enrolled. Consider a prompt that does not say the name.

**Works well:**
- Raven v11 has per-state motions and blink handling.
- Lip sync follows the audio that is actually played.
- The greeting gate never blocks the connection or the visitor's audio.
- Scene visuals do a hard handoff and stop when the session leaves Active.
- Ambience ducks under speech and keeps its position.

---

## Sound areas checked (no new findings)

- **Media serving:** streams files, with Range, HEAD, suffix ranges, 416 and
  abort handling.
- **Telemetry:** the writer is asynchronous with bounded queues.
- **Lifecycle snapshots:** sent only on actor changes.
- **Window and `screen` listeners:** scoped and removed.
- **Bounded caps:** scene turns, imported previews and models, media cache.
- **Wake capture:** 100 ms blocks; per-block copies and parsing are negligible;
  `input_activity` at 2 Hz.
- **Camera tracker:** 640×480 at 15 fps, Vision at 5 Hz, capped pipe buffer
  and watchdogs.
- **Embedding protocol and recall:** one job at a time; recall about 40 µs per
  vector on the storage worker, fine below about 10k rows per person.
- **SQLite:** indexes cover `row`, `recent`, dependencies and FTS scope.
- **Renderer media:** listener and object-URL cleanup is correct; preload
  `on*` methods return unsubscribe functions; `TranscriptBuffer` is capped.
- **Invariant 5:** turn-owner snapshot (epoch, token, owner captured at
  `speech`).
- **Contracts:** preload/shared snapshot key and enum parity, and the
  memory-tool strict schema.

## Not verified

- Wake detection quality at `numThreads: 1`: CPU was benchmarked, but no wake
  replay was run.
- Embedding cold-start time.
- Actual watt or thermal savings from PE-02, PE-03 and PE-04.
- Wake-to-visible latency (MX-04).
- The scene-video fade glitch (MX-12).
- Electron's default handling of an unhandled rejection (CO-11).
- All UI/UX findings come from code and existing screenshots (latest
  2026-10-09), not a live walkthrough.
- No Electron, build, QA runner, full suite or physical check was run.
