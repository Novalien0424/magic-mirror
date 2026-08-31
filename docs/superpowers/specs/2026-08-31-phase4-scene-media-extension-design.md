# Phase 4 Scene Media Extension Design

**Status:** Approved behavior, implementation pending
**Date:** 2026-08-31
**Host scope:** Windows development and functional verification; Mac validation remains deferred
**Extends:** `docs/superpowers/plans/2026-08-28-phase4-console-scenes.md`

## 1. Outcome

Extend the current duration-driven Scene runtime with managed images and videos
without turning it into a workflow engine. A Scene remains an ordered list of
Stages. Every Stage starts a bounded set of reusable typed actions together and
has exactly one explicit end condition. Electron Main remains the sole runtime
authority; renderers present media and report observations but never advance a
Stage by themselves.

The extension must support:

- existing Avatar, verbatim dialogue, managed music, lighting, and fog Scenes
  without behavior changes;
- finite video that returns safely to the lifecycle-appropriate Avatar;
- silent looping video with separately managed looping BGM;
- embedded video audio sharing the existing ducked background-audio path;
- exact completed-transcript stop while Realtime owns the microphone;
- deterministic replacement, Stop All, lifecycle cancellation, renderer
  failure, and timeout cleanup;
- Console import, preview, authoring, validation, run status, and human QA.

## 2. Non-goals

- No branches, arbitrary scripts, conditional expressions, hidden waits, or
  model-generated Scene/device parameters.
- No Realtime tool that starts a Scene by name.
- No second microphone listener and no wake-worker acquisition while a Scene
  is running in Active.
- No seamless crossfade, held-frame preloading, playlist editor, transcoder,
  streaming URL, network media, or codec installation.
- No physical-lighting/fog acceptance claim from mock adapters.
- No Mac deployment, signing, TCC, or codec-readiness claim from Windows
  evidence.

## 3. Applicable invariants

- **1:** Transcripts and conversation audio remain RAM-only. Scene events and
  evidence never contain transcript text.
- **6:** A stop phrase or spell is a control turn and skips memory extraction.
- **7:** Spells and the Scene stop phrase use normalized exact completed-
  transcript matching, once per turn. Approved typed presets alone control
  hardware.
- **8:** The renderer remains the only microphone owner while Active. The wake
  worker is not listening concurrently.
- **9:** Every rejection, stale event, timeout, fallback, and cleanup failure is
  visitor-visible or a metadata-only Console event with a reason.
- **10:** One action/adapter failure never blocks conversation or unrelated
  actions. Lifecycle failure preempts Scene media, and black is never a
  fallback surface.

## 4. Ownership

| Concern | Owner | Rule |
|---|---|---|
| Published Scene and asset catalog | Electron Main | Draft/Test/Publish remains atomic; invalid media config never replaces Active. |
| Active run and Stage transition | Electron Main | Exactly one active Scene run; every start/stop/replace/completion is serialized. |
| Run identity | Electron Main | Existing `runId + stageId + actionId` is the lease token. It is carried over IPC but not persisted in telemetry. |
| Spell and stop text | Mirror renderer RAM | Main receives only matched IDs, `turnId`, target `runId`, and a reason enum. |
| Image/video decode and presentation | Chromium renderers | Console performs the authoritative import/Test Draft probe; Mirror reports live playback events carrying the lease token. Neither changes Main state directly. |
| Realtime dialogue audio | Existing SDK audio element | Remains the only audible dialogue path and never joins the background bus. |
| BGM and embedded video audio | Existing Avatar media `AudioContext` | Both join one renderer-owned background gain bus and fail independently. |
| Lighting and fog | Main adapters | Only approved typed commands; Main owns cleanup deadlines and Stop All. |
| Lifecycle/crash recovery | Electron Main | Non-active lifecycle surfaces preempt Scene media; LaunchAgent remains the only restart owner. |

## 5. Configuration model

### 5.1 Managed assets

```ts
type ManagedVisualAsset = Readonly<{
  id: string
  name: string
  kind: 'image' | 'video'
  fileName: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm'
  byteLength: number
  sha256: string
  width: number
  height: number
  orientation: 'portrait' | 'landscape' | 'square'
  durationMs?: number
  audioTrack: 'present' | 'absent' | 'unknown'
  windowsDecode: 'passed'
}>
```

Import constraints:

- images are at most 25 MiB; videos are at most 250 MiB;
- dimensions are positive and at most 4096 by 4096;
- videos have a finite positive duration of at most 10 minutes;
- the Windows Chromium renderer must decode an image or the first video frame;
- audio-track probing is best-effort. Chromium does not expose a dependable
  cross-codec track-presence API, so `unknown` is an expected result rather
  than a failed import;
- embedded audio is rejected only when a dependable probe reports
  `audioTrack === 'absent'`. `unknown` remains publishable with an authoring
  warning and must be exercised by Test Draft;
- the stored file name is Main-generated and basename-only;
- the content hash is recomputed at playback. A mismatch is a playback failure.

The import path uses the current managed-asset picker and user-data storage
pattern. Main exposes an opaque pending token to Console for the Chromium decode
probe, then atomically finalizes or cancels that pending file. The source path
never crosses IPC. The design does not introduce FFmpeg, a system executable,
or a network fetch.

### 5.2 Visual action

```ts
type VisualSceneAction = Readonly<{
  id: string
  name: string
  enabled: boolean
  kind: 'visual'
  assetId: string
  fit: 'contain' | 'cover'
  playback: 'still' | 'once' | 'loop'
  audio: 'muted' | 'embedded'
  gain: number
}>
```

Schema rules bind action fields to the referenced asset:

- images require `playback: 'still'`, `audio: 'muted'`, and `gain: 0`;
- videos require `playback: 'once' | 'loop'`;
- embedded audio is invalid only for an image or a video whose track probe
  definitively reports `absent`;
- muted playback requires `gain: 0`;
- `gain` is finite from 0 through 1.

### 5.3 Stage end condition

```ts
type StageEndCondition =
  | Readonly<{ kind: 'duration'; durationMs: number }>
  | Readonly<{ kind: 'video_complete'; visualActionId: string }>
  | Readonly<{ kind: 'until_stopped'; maxRuntimeMs: number }>

type SceneStageDefinition = Readonly<{
  id: string
  name: string
  endCondition: StageEndCondition
  actionIds: readonly string[]
}>
```

Existing `durationMs` Stages migrate to
`endCondition: { kind: 'duration', durationMs }` without changing timing.

### 5.4 Validity matrix

| Stage visual | `duration` | `video_complete` | `until_stopped` |
|---|---:|---:|---:|
| None or image | valid | invalid | valid |
| Once video | valid | valid | invalid |
| Loop video | valid | invalid | valid |

Hard validation errors:

- zero-Stage Scene or zero-action Stage;
- more than one visual action in a Stage;
- `until_stopped` on a non-final Stage;
- missing, disabled, wrong-kind, or non-once `visualActionId` for
  `video_complete`;
- a combination rejected by the matrix;
- an `until_stopped` maximum outside 1 second through 24 hours;
- a duration outside 1 millisecond through 10 minutes;
- an action list with duplicate IDs.

Authoring warnings do not block Publish:

- Avatar motion/expression linked while a visual action hides the Avatar;
- embedded video audio and BGM intentionally overlap;
- embedded video audio whose track presence is `unknown` requires operator
  confirmation in Test Draft;
- portrait media using `cover` may crop content.

### 5.5 Cleanup policy

There is no second cleanup-action graph. Authors express fades, music stop, fog
off, and lighting off as ordinary actions in the ordered final Stage. Main
independently tracks acquired resource categories and performs automatic system
release on every terminal path. Authored release actions improve the show but
are never the safety boundary.

## 6. Runtime state and serialization

Main holds one `activeRun`:

```ts
type ActiveSceneRun = {
  runId: string
  sceneId: string
  stageId: string
  status: 'starting' | 'running' | 'cleaning'
  abortController: AbortController
}
```

All mutations pass through one Main-owned asynchronous command queue.

### 6.1 Start

1. Validate the request against the frozen published catalog.
2. If a run is active, cancel it with reason `replaced` and perform bounded
   resource cleanup before admitting the replacement.
3. Allocate a new `runId`, capture the Scene, and dispatch the first Stage.
4. Return an immediate start result to Console/Mirror. Completion is reported
   through run-status events; long Scenes do not hold an IPC invocation open.

### 6.2 Stage execution

- Main dispatches all enabled Stage actions without awaiting observational
  feedback.
- `duration` starts its Main timer at Stage dispatch.
- `video_complete` waits for the active visual action's typed playback events.
- `until_stopped` starts a mandatory Main maximum-runtime timer.
- Adapter feedback updates action results but cannot advance a Stage unless it
  is the active visual end-condition event.
- A failed action does not block unrelated actions or later Stages. A failed
  end-condition visual action ends that Stage through the failure-cleanup path.

### 6.3 Stale event fencing

Every renderer report carries `runId`, `sceneId`, `stageId`, and `actionId`.
Main compares all four fields with the active lease. A mismatch is ignored and
emits content-free reason `stale_scene_event`. Run IDs remain RAM-only; persisted
telemetry contains the Scene ID and reason, never transcript or run contents.

### 6.4 Stop phrase

- While Active, Realtime retains the microphone.
- On input-item creation, the Mirror renderer snapshots the current Scene
  `runId` into its existing RAM-only turn mapping.
- On completed transcription, the configured `wake.phrase` is normalized and
  compared exactly.
- A match emits a content-free stop request containing `turnId` and the
  snapshotted target `runId`; it is a control turn and cannot also trigger a
  Scene or memory extraction.
- If the target is no longer active, Main ignores it with
  `stale_scene_stop`.
- Missing transcript produces `transcript_unavailable`; it never falls back to
  substring, intent, or a second microphone listener.

### 6.5 Stop All and lifecycle preemption

Stop All is a queue barrier. It cancels the active run, invalidates Scene starts
already queued before the barrier, runs system cleanup, and returns a bounded
per-resource result. A start submitted after the barrier may run only when the
lifecycle permits.

Transition to Suspending, Dormant, OfflineLoop, or Maintenance invokes the same
barrier. Scene media cannot remain active behind a lifecycle surface.

## 7. Video event protocol and watchdogs

Renderer reports these exact visual events:

```ts
type VisualPlaybackEvent =
  | { type: 'ready' }
  | { type: 'playing'; durationMs: number }
  | { type: 'progress'; currentTimeMs: number }
  | { type: 'ended' }
  | { type: 'failed'; errorCode: string }
```

Each event includes the current action lease. Main applies:

- a 10-second image-readiness watchdog from dispatch to `ready`;
- a 10-second video-start watchdog from dispatch to `playing`;
- a 10-second video no-progress watchdog after `playing`; a loop wrap counts as
  progress even though `currentTimeMs` decreases;
- for once-video playback only, an absolute watchdog at runtime-reported
  duration plus 15 seconds;
- for videos, a duration consistency check allowing the larger of 1 second or
  2 percent difference from imported metadata.

Loop lifetime is bounded by the Stage `duration` or `until_stopped` maximum;
it is never incorrectly bounded by one pass through the source video.

An image's active `ready` or a video's active `playing` acquires the visual
layer. Only an active once-video `ended` is normal video completion. Watchdog
expiry, decode error, hash mismatch, or duration mismatch is failure. Failure
releases the visual action, restores the current lifecycle surface, records a
metadata-only reason, and allows unrelated adapters/conversation to continue.

For `duration`, an early once-video `ended` releases only the visual action and
shows the current Avatar while the Stage timer and other actions continue. A
loop is stopped by the Stage timer. For `until_stopped`, the loop is stopped by
the targeted stop, replacement, Stop All, lifecycle preemption, or mandatory
maximum runtime.

## 8. Display behavior

Display priority is:

```text
Maintenance / OfflineLoop / Suspending / Dormant
  > decoded Scene visual
  > lifecycle-appropriate Live2D Avatar
```

- The Avatar stays visible until an image is decoded or a video reports its
  first playable frame.
- The visual layer acquires display ownership only after readiness.
- Completion, failure, timeout, cancellation, or lifecycle preemption removes
  the visual layer and evaluates the lifecycle at release time.
- Consecutive media Stages return to the Avatar between visuals. A visible
  Avatar transition is acceptable; a black frame is not.
- Dialogue and actual-output lip sync continue while the Avatar is hidden.
- Mirror renderer crash/unresponsiveness cancels the Scene in Main, runs Main-
  owned hardware cleanup, and uses the existing nonblack BrowserWindow
  background/recovery path. Failure to recreate enters Maintenance; Main never
  calls `app.relaunch()`.

## 9. Background audio

Extend the existing `avatar-media-controller` graph:

```text
managed BGM source ----\
                        -> background analyser -> background gain -> destination
video embedded source -/

Realtime SDK audio element ---------------------------------------> speakers
Realtime analyser tap --------------------------------------------> no destination
```

- One renderer controller owns the background gain and duck state.
- Actual Realtime output activity engages ducking. True
  `output_audio_buffer.stopped`, interruption, session close/error, and a
  bounded silence fallback release it.
- Realtime audio stays unmuted and never connects to the background graph.
- Each video playback creates one media element and one associated
  `MediaElementAudioSourceNode`; that pair is detached and discarded once.
- A BGM/video member failure detaches only that member and cannot mute dialogue
  or the other member.
- Embedded audio uses the authored gain before the shared duck gain.

## 10. Resource cleanup

Main tracks four resource categories: visual, music, lighting, and fog.

- Cleanup is idempotent and attempted once per category per terminal run.
- Categories clean in parallel with independent 3-second deadlines.
- Normal completion runs the same system release as cancellation. Any authored
  fades/off commands have already run as ordinary Stage actions.
- Replacement completes the bounded cleanup barrier before dispatching the new
  first Stage. A category whose release times out is skipped in the replacement
  with `resource_handover_failed`; other categories still start.
- Stop All, lifecycle preemption, renderer crash, and shutdown skip decorative
  cleanup and invoke system release immediately.
- Fog retains an independent Main-side continuous-on safety watchdog. A Stage
  duration does not implicitly turn fog off: ordinary later-Stage `off`
  actions remain authoritative presentation policy. The watchdog is capped at
  10 minutes and terminal cleanup always releases fog, so an `until_stopped`
  Scene cannot leave it on for its full 24-hour maximum.
- Cleanup errors are metadata-only Console events and cannot gate conversation.

## 11. IPC and privacy

- All new IPC payloads are exact-key validated and sender-authorized.
- Console-only import, preview, Draft/Test/Publish, and manual-run channels
  reject Mirror senders.
- Mirror playback reports reject Console and unknown senders.
- No payload contains a transcript, conversation audio, guest/profile/candidate
  ID, credential, arbitrary file path, script, URL, or hardware value not
  represented by a published typed action.
- Asset playback uses a Main-registered local protocol resolved only from the
  published asset ID and managed storage.
- The local protocol preserves bounded byte-range requests and response status
  so Chromium can start and seek MP4/WebM without exposing a filesystem path.
- Telemetry and persisted Phase Test records contain metadata only. Run IDs and
  current playback times remain RAM-only.

## 12. Console behavior

The existing Scenes editor gains:

- managed image/video import and metadata preview;
- visual action editor for asset, fit, playback, audio, and gain;
- one end-condition selector per Stage;
- matrix-aware validation and the warnings listed above;
- estimated duration (`unbounded` is never shown because maximum runtime is
  mandatory);
- current run status and Stop All;
- focused preview that uses Draft assets/config but cannot activate Draft;
- explicit mock/physical capability labels and metadata-only recent results.

Publish remains blocked by hard errors. Failed Test Draft or Publish leaves the
previous Active catalog unchanged.

## 13. Verification and human test gate

Automated evidence must prove:

1. Schema migration and every valid/invalid matrix row.
2. Import limits, generated storage names, decode result handling, audio-track
   uncertainty, and playback hash mismatch.
3. One active run, replacement serialization, Stop All barrier, and immediate
   start acknowledgements.
4. Stale ended/error/stop reports cannot affect a replacement run.
5. Start, stall, absolute, duration-mismatch, and mandatory maximum-runtime
   failures.
6. Early once-video restore, loop cancellation, lifecycle preemption, and
   never-black display behavior.
7. Background duck/release and independent BGM/video failure.
8. Per-resource cleanup deadline, failed handover isolation, fog watchdog, and
   renderer-crash cleanup without a second authored cleanup graph.
9. Exact stop phrase, once-per-turn consumption, transcript-unavailable, and
   absence of transcript text in IPC/persisted evidence.
10. Existing Avatar-only duration Scenes retain their current dispatch timing.

The Windows human test is ready only after focused tests, both typechecks,
production build, full repository tests, the deterministic Phase 4 harness,
and firewall-rule verification pass. The operator then verifies:

- import and metadata preview;
- existing Avatar/dialogue/BGM/fog Scene;
- finite video and return to Avatar;
- silent loop plus external BGM stopped by the exact phrase;
- replacement with another Scene;
- embedded audio and actual-dialogue ducking;
- video load/stall failure and Stop All cleanup;
- lifecycle transition and renderer reload without a black fallback.

Physical lighting/fog remains pending real-device evidence. Successful Windows
human testing does not claim Mac readiness or complete Phase 4 acceptance until
all required recorded evidence is reviewed.
