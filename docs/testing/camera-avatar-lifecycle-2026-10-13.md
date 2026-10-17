# Camera monitoring only while Raven is awake — 2026-10-13

The owner corrected continuous camera monitoring: camera checks should run only
while the Magic Mirror avatar is alive. Main now owns capture only in
`activating`/`active` with a ready Mirror renderer. Entering sleep, offline or
maintenance, or replacing the Mirror renderer, releases capture and its watchdog.
No camera permission request, worker or camera watchdog starts while dormant.

## Implementation

- `src/main/camera/lifecycle.ts` controls permission, capture and release.
  A late permission result cannot start the camera after sleep or shutdown.
  A rapid wake waits for the previous native worker's confirmed exit. A failed
  release prevents a second owner from starting. Repeated status snapshots do
  not request permission or launch workers repeatedly.
- `src/main/index.ts` connects lifecycle snapshots and renderer readiness to
  that owner. Camera startup remains asynchronous and cannot block voice.
- The existing rapid reset deadline applies only during active ownership.
  No changes to the native reset method, model, prompt or audio route are made.
- Ordinary Console capture checks return unavailable while Raven sleeps.
  Explicit native camera QA remains a separately owned diagnostic.
- Physical Raven QA checks actual native child counts before wake, during the
  conversation and after sleep, followed by a three-second no-restart interval.

## Verification

**81 focused lifecycle, tracker and IPC checks pass.** These cover no idle timers,
repeated lifecycle updates, late permission, permission denial, rapid reactivation,
renderer replacement, failed release and shutdown. **Full `npm test`: 2,037
passed, 1 skipped**, 183 passing files, exit 0 in 72.23 seconds, including
sequential Electron smoke/Phase 0 checks. Both TypeScript projects, final build
and source/output verification pass. The initial type check caught a remaining
reference to the removed startup flag in `before-quit`; it now immediately stops
the lifecycle owner. The original failure is retained. A stamp check attempted
during the full suite's build correctly reported changed output; verification
after the suite completed passes. Both edited skills and whitespace checks pass.

The first physical run exited 2 with **7/8 checks passing**. All three lifecycle
checks passed: no worker while dormant, exactly one awake, and none after sleep
or three seconds later. Realtime release, Jabra audio and provider-error checks
also passed. The image request failed (`raven_qa_camera_not_added`) after repeated
stream stalls exhausted both USB recovery attempts and the pending capture timed
out. This is a retained camera-delivery failure, not a passing overall camera
test.

The one unchanged retry also exited 2 with **7/8 checks passing**. All three
lifecycle checks passed again, as did voice release, actual audio routing and
the provider-error check. This time the model never called `capture_camera`
(`raven_qa_camera_not_called`), so the run does not establish image delivery or
repeat the first run's capture failure. Camera-stall/backoff diagnostics were
still present. No further live retries were made.

**The requested lifecycle behavior is verified; overall camera conversation
reliability remains unqualified.** Both physical runs used Mac-speaker synthesized
visitor speech → actual Jabra microphone → real Realtime, with zero screenshots.
All six ownership assertions passed across the two runs. This is separate from
representative human-microphone or long-duration acceptance.

Finished at **02:12 Taipei**. Normal Raven is stopped; original TV policy and
matching active/draft v17 config are preserved. Both completed scratch runs are
reviewed and removed through marked QA cleanup. The
[retained metadata and full check logs](../../.artifacts/camera-avatar-lifecycle-2026-10-13/)
are SHA-256 verified in the
[manifest](../../.artifacts/camera-avatar-lifecycle-2026-10-13/manifest.json).

Evidence contains metadata only; no images, transcripts or conversation audio
are retained.

The [earlier reset timing](camera-fast-recovery-2026-10-13.md) measured roughly
three seconds to request reset and six seconds to fresh frames. Its unconditional
monitoring scope is superseded by this lifecycle gate; timing within an active
camera owner is unchanged.
