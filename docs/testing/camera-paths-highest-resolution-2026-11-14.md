# Highest-resolution camera paths — 2026-11-14 follow-up

## 11-15 revision (owner: "high resolution but not unnecessary gates")

The statements below about rejecting sub-HD images are superseded
([ruling](../../DECISIONS.md), 2026-11-15):

- The helper selects the camera's best mode within the snapshot limit (1920×1080) instead of
  refusing every camera whose maximum is not exactly 1920×1080 (reason now
  `camera_mode_unsupported`, only when no mode fits). The per-frame "delivered = selected"
  check and the frozen-stream check stay; Main's and the photo path's own full-HD rejections
  are removed. The one-face rule for photos is unchanged.
- **Defect found by the daylight run:** a camera question's picture is one Realtime message,
  and the connection refuses messages above about 256 KiB. The 11-14 runs passed at night with
  a small picture; at 14:25 and 14:27 on 11-15 a 359 KB picture was refused and Raven gave no
  answer (`raven_qa_camera_answer_settled`, twice; no marker existed). Now Main fits that
  picture (full size, lower JPEG quality first, smaller only if needed; `camera_question_image_fitted`),
  and a refused send is reported (`camera_image_send_failed`) and spoken. The photo used for
  portrait art keeps the camera's full quality.

| Check, 11-15 14:20–14:37, sound at 1% | Result |
| --- | --- |
| Typecheck; 15 camera, photo, IPC and adapter test files | Passed (410 tests) |
| Native USB recovery on production selection | Passed, 12/12 snapshots 1920×1080 |
| Open/capture/release, 20 cycles | Passed, 27/27 decoded 1920×1080, no resets, zero owners after release |
| Real-camera conversation, before the fit | **Failed twice** at `camera_visual_question`; third run with the new marker: `camera_image_send_failed`, picture 358,671 bytes |
| Real-camera conversation, with the fit | Passed 8/8; picture 353,241 bytes at 1920×1080, fitted; all four image judgments passed |

[Recovery](../../.artifacts/phase4-qa/2026-11-15T06-21-09-735Z/camera-native.json)
· [cycles](../../.artifacts/phase4-qa/2026-11-15T06-22-17-767Z/camera-availability.json)
· [failed](../../.artifacts/phase4-qa/2026-11-15T06-24-40-870Z/raven-results.json)
· [failed retry](../../.artifacts/phase4-qa/2026-11-15T06-26-56-916Z/raven-results.json)
· [send refused](../../.artifacts/phase4-qa/2026-11-15T06-31-21-350Z/raven-results.json)
· [passed](../../.artifacts/phase4-qa/2026-11-15T06-35-23-943Z/raven-results.json)
· [logs](../../.artifacts/camera-gates-2026-11-15/).
Recovery and cycles ran on the first 11-15 build; the helper and Main's tracker did not change
afterwards. Not tested: a camera other than the Arducam, a picture that needs shrinking, and
the photo path with a person (still waiting for a consenting person). Synthetic visitor speech;
no images or transcripts retained.

### 11-15 15:25: several people allowed in a photo (source only)

Owner: "multiple people is allowed. we will lock into the nearest people that has the full
face" ([ruling](../../DECISIONS.md)). The still carries the box of each clear face (same
confidence as gaze, clipped to the picture); `src/main/camera/photo-subject.ts` picks the
largest face not touching the edge (else the largest) and, with several people, cuts the photo
to that person (`image_photo_nearest_person_selected`). Statements below about the single-face
gate are superseded. Checks: typecheck, helper type-check with its header, 442 tests in 12
focused files. Not built, not deployed, and no real still with several people has been taken:
the next real runs below now also need a run with two or more consenting people in view.

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
