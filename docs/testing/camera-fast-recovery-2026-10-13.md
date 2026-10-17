# Prompt USB camera recovery — 2026-10-13

The owner requires rapid automatic recovery when video/image delivery stops.
This follow-up changes the camera deadline, not the Realtime model or prompt.
TV-off hardware testing remains authorized; normal Raven stays stopped outside
isolated QA and the installed TV policy remains unchanged.

## Change

- Previously Main marked frames stale at 1.5 seconds but waited for the native
  six-second deadline, sampled every two seconds, to request USB reset.
- Main now requests the targeted reset after **2.5 seconds without native frame
  receipts**, sampled every 500 ms: ordinarily about 2.5–3 seconds after the last
  receipt. It does not wait for a visitor's camera request.
- Heartbeats and delayed Vision results do not refresh the delivery deadline.
  Missing face detections alone do not reset a stream still delivering frames.
- Retry spacing is **10 seconds**, down from 30. The two-attempt budget and
  30-second healthy-stream requirement for rearming remain. Persistent failures
  are reported instead of causing an unbounded reset loop.
- The native helper schedules reopening at the end of its two-second USB
  re-enumeration grace, avoiding up to another two seconds waiting for the
  periodic watchdog. The grace itself remains intact.
- Startup/re-enumeration retain their separate native grace period. Permission
  denial, device absence and worker replacement disarm the old stream deadline.
  A pending image request still waits through bounded recovery and retries once
  only after a fresh frame. Resetting the camera does not reset Jabra or Electron.

Changed runtime: `src/main/camera/tracker.ts`. The native QA stall now begins
after successful delivery (`deploy/macos/camera-tracker.swift`); timing evidence
is added in `src/main/camera/native-qa.ts`. Camera regressions, DECISIONS and the
Electron skill reference record the behavior.

## Verification

- Five new timing regressions failed before the change; failures are retained.
- **25 camera regressions pass**, including rapid recovery, delayed Vision,
  fresh-frame gating, two-second gaps without reset, permission/device absence,
  overlapping captures, cancellation and bounded retries across worker restart.
  The updated native-frame fixture initially failed because it supplied only
  a face result; the corrected fixture explicitly proves that a face result
  cannot release recovery before a new frame receipt. That failure is retained.
- Both TypeScript projects, native/renderer build and source/output verification
  pass. Source changes reviewed against this follow-up's starting snapshots.
- Initial hardware run passed: a spontaneous stall requested reset **2.622 s**
  after the last frame, with fresh frames **3.969 s** after the request. The
  injected stall requested reset **2.557 s** after the last frame (**1.962 s**
  after injection), with fresh frames **4.800 s** later. Both phases returned
  six snapshots, but the injected phase could count a snapshot before reset.
  The revised QA waits for recovery before all six snapshots.
- **Final native run passes, exit 0: 12/12 VGA snapshots**, including all six
  recovery snapshots after reset. A spontaneous stall requested reset **2.911 s**
  after the last receipt; fresh delivery resumed **2.976 s** after the request
  (**5.887 s** total). The deliberate stall requested reset **2.759 s** after
  the last receipt (**1.458 s** after injection); fresh delivery resumed
  **2.887 s** later (**5.646 s** total). Actual native reset execution began
  58 ms and 74 ms after Main's respective requests. The run also exercised a
  pending image request waiting through automatic recovery.
- **Physical Realtime camera request passes, exit 0: 5/5 checks and 4/4 image
  criteria.** The route was native Mac-speaker stimulus → actual Jabra microphone
  → real WebRTC/Realtime → native camera. The model answered from the image;
  microphone release and provider-error checks passed. This specific conversation
  did not reproduce a stall; the native test above proves in-flight image-request
  recovery. No screenshots or conversation content were retained.

Both final hardware runs completed by **01:24 Taipei**. The Electron skill
validates, `git diff --check` passes and the final built-source stamp verifies.
Normal Raven is stopped, with production TV policy and the matching v17
active/draft configuration preserved. Scoped changes remain uncommitted.

[Metadata and complete failed-check output](../../.artifacts/camera-fast-recovery-2026-10-13/)
are copied and SHA-256 verified in the
[manifest](../../.artifacts/camera-fast-recovery-2026-10-13/manifest.json).
All three completed scratch runs are reviewed and removed through the marked
QA cleanup tool.

These measured timings are samples, not hard OS/device latency guarantees.
The 10-second retry interval applies if another attempt is needed before the
camera has established sustained health. Cold startup and a completely blocked
native worker retain their separate watchdogs; this change accelerates loss of
frame delivery from an operating stream.

## Evidence boundary

Retain timing, status codes, dimensions and pass/fail metadata only. Images and
conversation content are not retained. USB reset initiation and fresh-frame
return are measured separately; a rapid reset request does not mean immediate
hardware re-enumeration or elimination of the underlying stall.

The [preceding full retest](realtime-retest-2026-10-12.md) retains its failures
and prior 2,023-test full-suite pass. It is not a full-suite pass for this later
camera timing change. Wake/model-quality/TV-on acceptance remain as recorded.
