# MusicLoop downloads — plan and self-audit, 2026-10-26

## Requested journey

Press MUSIC LOOP. Already cached/downloaded tracks start first and keep looping
while cloud-only files download. Newly completed files join the rotation after
the current track; no abrupt replacement. If nothing is ready, Console shows
preparing and playback starts automatically when the first file is complete.
Repeated MUSIC LOOP preserves both playback and downloads. CONSOLE remains
available; STOP and other modes cancel owned preparation and playback. Failed
downloads are reported without stopping playable tracks. A retry is STOP then
MUSIC LOOP. Production MusicLoop stays empty until the owner adds music.
The owner subsequently capped MusicLoop at **100 MB (100,000,000 bytes)**:
larger files are abnormal and skipped before download/cache access; exactly
100 MB is accepted. Show an explicit failure if every file is oversized.

## Findings and plan

The first implementation has a 35-second startup limit, a 45-second blocking
operator acknowledgement, a native preparation cap of 10 minutes, and an
on-demand next-track copy that can create silence. Its startup cache pruning
also discards a single file larger than the 2 GiB soft budget; that finding is
outside the final scope because the owner now rejects files over 100 MB.

1. Acknowledge the selected music mode after input release, then prepare in the
   background. Say preparing/accepted rather than claiming audible playback.
2. Check all cache hits first. Use a native metadata-only dataless-file probe to
   prioritize locally downloaded source files before cold Drive files. One
   background copy/download owner feeds a separate ready-track rotation.
3. Keep playing ready tracks while that owner waits. Integrate each verified
   completed file at a track boundary, and surface pending-download status.
4. MusicLoop gets a size-based window: 120 seconds plus one second per 256 KiB,
   bounded by 10 minutes (502 seconds at 100 MB). Other media callers and cache
   pruning retain their existing policy. Never download files over 100 MB.
5. Verify delayed preparation beyond the old limits, ready-track continuity,
   joining, failures, repeat presses, cancellation, actual large-file native
   copying/playback at the 100 MB boundary, abnormal rejection, rendered controls
   and cleanup. Separate real cloud hydration
   from synthetic delay/local-copy evidence. Restore Jabra to 70% after sound QA.

## Self-audit before implementation

- Download completion must not interrupt a playing track or publish false playing.
- A first pending cloud file cannot block a later cached/local track.
- Main still owns one player and one preparation pipeline; stale completions
  after STOP/mode change cannot restart anything. Partial copies never play.
- Do not parallel-download the entire folder, repeatedly retry failed downloads,
  change normal media policy, persist paths/transcripts in diagnostics, or alter
  default audio/input devices. Preserve invariants 1–12.
- Finite timeouts, available disk/network and supported audio containers remain
  real limits; do not promise arbitrary file sizes or unmeasured cold downloads.

Review complete. Implementation and evidence follow below.

## Implementation

- Main's MusicLoop manager separates ready-track rotation from one background
  copy/download pipeline. Cache checks precede native local/cloud probes. Oversized
  files never enter cache access or preparation. Track boundaries select the next
  ready file in filename order; downloads do not replace current playback.
- Mode commands acknowledge ownership promptly. Console distinguishes preparing,
  playing while downloading, abnormal skips and failures. Repeated presses are
  idempotent; mode changes/shutdown abort and await owned preparation and playback.
- The native preparation helper gained a metadata-only `SF_DATALESS` probe.
  Ordinary media deadlines/cache policy remain unchanged. MusicLoop uses its own
  size-based deadline within the existing native ten-minute cap.
- The live Neo **Magic Mirror copy 1** profile's top-row third title was changed
  through Stream Deck UI from PLAY LOOP to **VIDEO / LOOP**. Its System → Open
  target remains `Play Loop Magic Mirror.app`; seven assignments remain intact.
  The generated recovery profile uses the same new label. Visual inspection
  confirmed the two-line title fits. No physical keypress acceptance is claimed.

## Focused and native checks

- Final nine-file focused run: **280/280 passed**, covering manager/controller,
  preparation, mailbox, TV/button routing and relevant renderer tests. A further
  four-case QA mailbox-client run passed after its expected success reason was
  updated: **284 distinct tests passed**. Both TypeScript projects and build pass;
  source/output fingerprint, script syntax and native code signatures verified.
- Native coordinated copy of an exactly **100,000,000-byte** synthetic valid WAV
  completed in 380 ms, verified copied header/PCM and complete size, then reused
  the cache on restart. Native AVPlayer reported ready, playing and ended on
  **three outputs**. This file has one second of audio plus a large JUNK chunk:
  it proves size handling/copy/container acceptance, not a long-duration song.
- A **22,001,708-byte** existing shared Drive WAV was copied successfully without
  modifying its source. It was already locally downloaded. No cold internet
  hydration or slow network throughput is claimed. Delayed preparation is tested
  separately with an isolated gate and actual native cached playback.
- Exactly 100 MB accepted; 100 MB + 1 byte rejected before cache/download. Tests
  also cover later cache hits ahead of an earlier pending file, local-source
  priority, download failure preserving ready music, repeated pending presses,
  cancellation without late restart and partial-cache cleanup.

## Retained failures and self-review

[Full failed-attempt output](music-loop-download-failures-2026-10-26.txt) is kept.
The first unit run had three outdated expectations (re-copying on repeat and
waiting for playback acknowledgement); revised tests assert the intended new
behavior. Two QA predicates needed async return types. The first native attempt
was correctly blocked by a newly opened normal Electron instance; no playback
occurred and volumes were restored. Console was inspected for unsaved edits
before stopping the normal app for isolated QA.

The first rendered run completed 24 cases then failed because its QA mailbox
client only accepted `operator_control_complete`. Production already accepts safe
reason codes; MusicLoop now returns `operator_control_music_accepted`. The QA
client was updated to validate the action-specific reason and tested against the
real mailbox server. No failure screenshot was produced by that run; its full
metadata and failure state are retained. This failure is not counted as a pass.

Final source review covered cancellation ownership, ready/download races, size
checks before cache access, truthful command/status semantics, UI labels and the
QA-only gate. No changes to credentials, model configuration, production avatar
settings, dependencies or phase acceptance.

## Rendered journey, deployment and limits

Command: `MIRROR_DISPLAY=T749 <owned minimum-volume guard> node scripts/run-phase4-qa.mjs --operator-loop`.
Final run **2026-10-26T07-40-32-797Z: exit 0, 29/29 cases, 22 screenshots**.
Failed run **2026-10-26T07-36-34-707Z: exit 2, 24 completed cases**.
[Builds, case metadata and native results](music-loop-download-checks-2026-10-26.json)
retain both attempts before cleanup.

- Actual native cached tracks played **34 times** across the 50-second gated
  download interval; completed track joined (case elapsed 51,722 ms). An abnormal
  100 MB + 1 byte file was skipped and Console showed its warning.
- With no ready track, preparation remained active for 46 seconds without the old
  35-second startup/45-second mailbox failure. Return to Avatar cancelled it;
  unblocking caused no late restart (case elapsed 48,008 ms).
- Final Main shutdown deliberately had native music playing and another download
  pending. After exit, process metadata confirmed **zero native players, zero
  preparers and zero Electron processes**. Existing video/Desktop/Console/mode
  transitions, repeated presses, empty-folder and abnormal-folder recovery passed.
- Inspected downloading, preparing and all-abnormal screenshots: status and
  corrective text readable; Return to Avatar and Stop All visible without overlap
  or clipping in the portrait Console. The actual Neo label was inspected in UI.
- Sound QA used minimum output volume and native gain 0.01. Each attempted run
  restored other output levels/mutes; Jabra final helper reset/read-back was
  **70.077%**. Default devices/input gain were preserved.
- Canonical deployment uses build source `9a025a0d0762d2a3288106194add17434a0066ebb46f50f42edc1eb03a33a49d`,
  output `5c9e4bb1a4561946f259af07c0315adb8f0cbdfc033ed91c5ac7d57e135275af`,
  built **2026-10-26 15:40:28 Taipei**. Normal LaunchAgent startup and renderer
  readiness succeeded; Console was restored to Raven, published version 21,
  Conversation, Asleep with wake listening, all modules normal, no loop playing.

Production MusicLoop remains empty, and no operator settings were published.
Physical Neo presses, human acoustic output, output hotplug/inter-device latency
and cold cloud hydration are not established by these checks. The existing board
ADB transport issue still limits TV standby/mouse evidence; no change here.

## Cleanup

Both exact QA roots were marked reviewed against this report and cleaned through
`qa-artifacts.mjs`: **207 files / 129,651,594 bytes**. Their ownership markers
remain. Removed the task-owned scratch directory: **20 files / 175,939 bytes**.
Metadata, full failures and this report remain; generated media/screenshots and
isolated configs were removed. Production MusicLoop was rechecked empty. Normal
runtime and Console remain running, as they were immediately before isolated QA.
