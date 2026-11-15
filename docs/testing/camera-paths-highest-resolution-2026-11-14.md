# Highest-resolution camera paths — 2026-11-14 follow-up

## Delivery and remaining physical input

The owner authorized implementation and real runs after the camera-path audit.
Production now accepts only the connected camera's highest supported capture
within the current full-HD snapshot contract: **1920×1080 NV12 near 5 FPS** for
this Arducam. The lower-resolution portrait acceptance gap is closed. Native
capture checks both active input and delivered buffer dimensions against the
selected maximum, and never resizes a snapshot. Main and the shared Conversation/
Studio photo validator reject sub-HD images. A future camera with a maximum above
the supported cap is explicitly unavailable rather than silently downscaled.
Only isolated availability experiments may opt into lower-resolution snapshots.

Normal production was restored at 20:33 Taipei after testing. The published
operator configuration was preserved. Speaker restoration succeeded after both
sound-producing tests (Jabra 80%, A1 65%, unmuted readback; normal output reset).

**Remaining:** real-person photo-reference Conversation and Studio runs. The 12
native samples at 20:18 detected zero faces. The camera is aimed at room/objects;
a consenting person is needed to exercise the single-face gate, capture, cloud
artwork and real retake. The readiness question is pending. No source portrait
was substituted to claim that these runs passed.

## Fresh evidence on the stricter build

| Check | Result |
| --- | --- |
| Focused camera, validation, consent, retake and Studio tests | 296 passed across 12 files |
| TypeScript checks, native Swift checks, build | Passed |
| Production native USB recovery | 12/12 HD snapshots; six before and six after injected stall/reset; fresh frames in 4.842 s |
| Open/capture/release | 20/20 cycles; 27/27 decoded 1920×1080 snapshots; no resets/restarts; zero owners after each release |
| Ordinary Conversation real-camera flow | 8/8 checks: consent, real image, grounded room answer, wake/sleep ownership and cleanup |
| Default Studio soul interview | 26/26 checks: name, four answers, real cloud generation, reveal, revision, farewell/Dormant, fresh restart, Conversation entry, cleanup |
| Photo-reference Conversation/Studio and real-person retake | Not executed: waiting for a consenting person |

[Native recovery](../../.artifacts/phase4-qa/2026-11-14T12-18-46-640Z/camera-native.json)
· [20 cycles](../../.artifacts/phase4-qa/2026-11-14T12-20-19-009Z/camera-availability.json)
· [Conversation](../../.artifacts/phase4-qa/2026-11-14T12-23-11-034Z/raven-results.json)
· [Studio](../../.artifacts/phase4-qa/2026-11-14T12-24-43-732Z/raven-results.json)
· [Build/test/audio-restoration logs](../../.artifacts/camera-paths-2026-11-14/).

The two conversation tests use synthetic visitor speech with actual Realtime and
image services, and the native camera active under Main ownership. The default
Studio intentionally generates from answers, so it does not prove the optional
photo-reference path. Audio was held at 1%; physical human speech recognition and
subjective portrait quality are not claimed. Images and transcripts were not
retained. Printing is still the existing deferred sink.

The earlier [30-minute soak](usb-camera-audit-2026-11-14.md) remains historical
hardware evidence at the same resolution/rate. This follow-up changed validation
and removed resizing; it reran capture/recovery/cycles and application journeys,
not another 30-minute soak.

## Implementation

- `deploy/macos/camera-tracker.swift`: highest-mode support check, active/delivered
  dimension agreement, no snapshot scaling.
- `src/shared/camera-tracking.ts`, `src/main/camera/tracker.ts`: shared production
  full-HD predicate, defensive low-resolution rejection and isolated diagnostic
  opt-in; unsupported maximum does not trigger futile USB resets.
- `src/main/studio/image-skill-ipc.ts`: the shared photo path now requires HD,
  exactly one face, and matching decoded dimensions before cloud use.
- `src/main/raven-conversation-qa.ts`: Studio photo QA now includes a fresh-consent
  retake and rejects pre-approval capture or multiple captures.
- Focused tests cover low-resolution rejection, unsupported maxima, mismatched
  buffers, portrait orientation, stale approvals and replacement-photo generation.

Next real runs, with a consenting person facing the camera and audio protected:

```sh
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario image_skill --native-camera
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --native-camera --studio-story soul --studio-photo
```

Use the Electron ownership lease, stop normal production first, keep source frozen
while QA runs, restore calibrated output levels, and return normal production.
