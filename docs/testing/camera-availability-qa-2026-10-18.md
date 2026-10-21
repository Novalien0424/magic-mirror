# Camera availability QA — criteria frozen before experiments, 2026-10-18

Current owner criteria (22:50 Taipei update, before further trials): preserve
actual **1920×1080**, allow very low delivered frame rates, and deliver a fresh
acceptable photo within **5 seconds** normally (recovery allowance remains
15 seconds). Tiny defects at image edges are acceptable; visible damage across
a face is not. Decoder warnings remain diagnostics, not an automatic rejection:
their affected area must be conservatively bounded before accepting a damaged
frame. A warning location alone does not prove earlier pixels intact. The old
3-second, 15-FPS and zero-warning gates below remain historical, superseded
prospectively by this owner instruction. A persistent direct-USB/custom-driver
solution is authorized; availability across restart/reboot and the 48-hour soak
must still be demonstrated. Cable replacement is unavailable while the owner
is abroad. No historical failed trial is reclassified as a pass.

Latest owner directive (21:31 Taipei): **highest advertised camera resolution
is mandatory**. The current descriptor maximum is 1920×1080. Lower resolutions
are diagnostic controls only and cannot be offered as accepted portrait or
video fallback. This prospectively tightens C4/C5 below: source and delivered
photo must preserve actual 1920×1080 pixels, with no resizing/upscaling to meet
the criterion; the photo must decode in RAM. Keep normal still <=3 s, total
recovery <=15 s, 30-second video >=15 delivered fps, and the 48-hour qualification.
Original ledger results retain their original criteria and verdicts.

Latest quality discriminator (22:29 Taipei): **ImageIO decoding is insufficient
to certify an intact JPEG.** Strict libjpeg-turbo STOPONWARNING validation accepts
only two of 975 ImageIO-valid images in the 35-second MJPEG30 test. Historical
dimension/throughput/codec results below remain valid at their stated scope,
but must not be interpreted as usable-photo/video acceptance. Strict warning-free
decompression is now an additional prospective source-integrity gate; human
quality acceptance remains separate. No production driver is promoted.

Next discriminator: administrator access is available (`sudo -n true`, exit 0).
After normal capture release and fresh separate-Jabra verification, a unique
0c45:0520-targeted diagnostic may temporarily detach the camera's composite
driver, claim video interfaces and restore ownership in guaranteed cleanup.
Record numeric ownership/transfer/frame metadata only. No hub or other USB
device, firmware, system security setting or persistent extension is changed.
Root alone owns hardware; parallel research/source workers never open devices.
Independent USB frames are a diagnostic until actual dimensions, decode,
freshness, latency and sustained delivery meet the same gates above.

Owner objective: VIP enrollment/recognition, occasional video clips, and a fresh
guest portrait for art. The appliance runs for days, with the camera released
between uses. The existing cable is the only available cable. The owner
authorizes systematic software/device checks. No multi-day success may be
inferred from a short streaming pass.

## Acceptance levels

| ID | Check | Pass criterion |
| --- | --- | --- |
| C1 | Exact mode and freshness | Report actual dimensions/pixel format/frame interval and advancing source timestamps. Readback without delivered frames is insufficient. Reject stale/repeated timestamps. |
| C2 | On-demand acquisition | 20 acquire/capture/release cycles with zero failed requests. Normal first fresh still <=3 s; any automatic recovery <=15 s and reported separately. Zero camera children during idle and at most one while capturing. |
| C3 | Enrollment capture supply | Eight fresh RAM-only snapshots in a 10-second active window, all decodable and from advancing timestamps. Usable face detail must be assessed separately with a consented subject. 320x240 is diagnostic only, not enrollment/art acceptance. |
| C4 | Portrait supply | Fresh decodable still at least 1280x720 (or verified 1280-long-edge equivalent with agreed framing), within C2 latency; no cached pre-request image. Image stays in RAM. Human likeness and final artwork are separate. |
| C5 | Video supply | Initial target 30-second burst at >=1280x720, >=15 delivered fps on average, no source gap >250 ms after startup, no spontaneous reset/restart. Measure native sample counts and timestamps, not throttled heartbeat receipts. Actual clip encoding/decoding is a separate gate. |
| C6 | Recovery | Induced delivery stall detected and recovery initiated <=3.5 s after last frame; requested fresh still within 15 s; existing two-attempt budget/backoff preserved. Exhaustion fails visibly and promptly. No Jabra interruption or system-wide restart. |
| C7 | Repeatability | A promising mode must pass five minutes without spontaneous reset before 20-cycle qualification. Preserve every failed trial. One changed hypothesis per experiment; no unchanged retry loop. |
| C8 | Days-long intermittent availability | After C1-C7 camera-supply gates pass: 48-hour soak with varied idle intervals (including >=60 min), >=200 requests, mixture of still bursts and 30-second video bursts. 100% request completion within C2, zero unexplained video stalls, no owner leaks, bounded resources. Report measured duration/counts; an unfinished soak remains pending. |
| C9 | Privacy and coexistence | No frame/audio/transcript/embedding/private context in diagnostics or artifacts. One camera owner; no disruption of Jabra or unrelated USB. No camera worker/watchdog while the avatar is inactive except the explicitly isolated QA owner. |

The owner accepted these initial targets on 2026-10-18: 30-second clips, a fresh
still within 3 seconds normally, and recovery within 15 seconds. Changes must
be prospective, never made after a failed experiment to turn it into a pass.

## Feature boundaries

The current face-identity skill states that recognition is not implemented yet;
current identity is verbally confirmed. C3 certifies the camera input needed by
future enrollment/recognition, not VIP matching accuracy. Separate future human
checks require consented enrollment, genuine/impostor/ambiguous visits, and
verbal confirmation before private memory loads. No phase is advanced here.

C5 first tests video frame delivery. A successful delivery test does not certify
a recording feature, encoding, storage or playback. Portrait camera supply and
the cloud art workflow are likewise distinct. No synthetic camera image can
rescue a failed physical-camera gate.

## Ordered experiment ladder

1. Same signed helper/LaunchAgent control with QA-only mode selection: production
   VGA YUY2, 320x240 YUY2 at 5 fps (single-transaction candidate), VGA at 5 fps,
   then verified compressed modes at usable portrait/video dimensions.
2. Correlate native metadata, UVC GET controls/active alternates and allowlisted
   driver counters. Separate transfer/framing faults from application queues.
3. Test a justified session/preset/format-order or output conversion alternative,
   normal/low-light controls if supported, and bounded release/reacquire versus
   targeted USB re-enumeration. Preserve production behavior until qualified.
4. If delivery remains broken, examine feasible direct USB access and driver
   ownership on this host. No blind firmware flash, whole-system media-service
   kill, SIP disable, unrelated device reset, or unverified OS replacement.
5. Alternate cable, physical port/hub, second camera/host, firmware/RMA and
   switched-port power remain explicitly unavailable until the necessary
   hardware or exact vendor firmware exists. Their absence does not block the
   software experiments above.

Before interrupting runtime preserve operator edits, acquire the Electron lease,
and stop normal Electron. QA uses isolated data and stamped builds. Restore
normal runtime when the bounded investigation finishes; record any extended QA
ownership explicitly. Sound-producing checks use the existing minimum-volume
wrapper with guaranteed restoration; camera-only checks are silent.

## Results

Criteria were written before the experiments. The result is **not qualified**:
The initial 20 physical trials comprise 18 screening experiments (one invalid
native configuration) and two on-demand trials. Two subsequent 1080p/5 screens
bring the initial total to 22. The follow-up below adds nine direct rate-API
trials (six terminate at API rejection) and two post-USB-cycle delivery trials,
for **33 camera/API trials**, plus the separate USB operation probes. No usable
HD mode passes. All 12
product invariants remain in force; no phase is advanced.

### Failure identified before proposed remedies

The signed production helper, launched through the one-shot QA LaunchAgent,
reproduces failure with Vision, JPEG encoding and pixel copying bypassed.
Camera permission is granted and USB enumeration remains available. In the
fresh VGA/15 baseline, only **five advancing samples** arrive in 24.261 seconds,
with a **9.554-second source gap** and two exhausted recovery attempts. The
first fresh sample arrives about 11.4 seconds after trial start, after a reset.
The native helper has already started; this is not just a renderer preview
problem or slow face detection.

Correlated allowlisted Apple UVC counters show **2,112 invalid payloads out of
2,112 received packets** before the first baseline reset, then 2,720/3,696 and
2,076/2,112 in later samples. Low-bandwidth capture also reports 90,020 invalid
payloads out of 136,192 and 10 append errors. Apple's counter definitions are
not public here: these identify rejected delivery below application image
processing, but cannot distinguish a cable/power fault, firmware framing,
host transport or Apple parser defect. Counter “complete frames” are not a
substitute for observed advancing application samples.

[Baseline native evidence](../../.artifacts/phase4-qa/2026-10-18T10-29-09-054Z/camera-availability.json),
[driver baseline](../../.artifacts/camera-availability-2026-10-18/driver-baseline.json),
[driver mode counters](../../.artifacts/camera-availability-2026-10-18/driver-modes.json).

### Experiment ledger

All times below are Taipei on October 18; linked artifact directories use UTC.
Screening allows five seconds for startup and measures the following 30 seconds,
or ends early on exhausted recovery. Sample totals include startup; reported
cadence uses advancing source timestamps. A zero source-gap value with zero/one
sample is **not** a pass. Long final silence is included in receipt-gap checks.
“MJPEG” names are requested AVFoundation candidates: wire COMMIT and actual
buffers must corroborate them. `formatVerified` in the JSON checks AVFoundation
input readback, buffer dimensions and frame duration, not the USB wire format.

| Time / evidence | Changed hypothesis | Samples / source fps | Max source gap | Resets | Result |
| --- | --- | --- | --- | --- | --- |
| [18:29:09](../../.artifacts/phase4-qa/2026-10-18T10-29-09-054Z/camera-availability.json) | Production VGA YUY2/15 baseline | 5 / 0.40 | 9,554 ms | 2 | Fail; exhausted |
| [18:30:17](../../.artifacts/phase4-qa/2026-10-18T10-30-17-216Z/camera-availability.json) | 320×240 YUY2/5 | 85 / 2.48 | 1,851 ms | 0 | Fail cadence; wire mode/active alternate verified |
| [18:32:00](../../.artifacts/phase4-qa/2026-10-18T10-32-00-336Z/camera-availability.json) | VGA YUY2/5 | 10 / 0.45 | 8,088 ms | 2 | Fail; exhausted |
| [18:32:26](../../.artifacts/phase4-qa/2026-10-18T10-32-26-012Z/camera-availability.json) | 720p MJPEG candidate/15 | 1 / — | — | 2 | Fail; delivered buffer still VGA |
| [18:32:51](../../.artifacts/phase4-qa/2026-10-18T10-32-51-697Z/camera-availability.json) | 1080p MJPEG candidate/15 | 0 / — | — | 2 | Fail; no frames |
| [18:33:21](../../.artifacts/phase4-qa/2026-10-18T10-33-21-397Z/camera-availability.json) | 720p NV12 candidate/15 | 0 / — | — | 2 | Fail; no frames |
| [18:33:51](../../.artifacts/phase4-qa/2026-10-18T10-33-51-117Z/camera-availability.json) | 720p YUY2/5 | 2 / 0.71 | 1,408 ms | 2 | Fail; long silence, exhausted |
| [18:34:20](../../.artifacts/phase4-qa/2026-10-18T10-34-20-837Z/camera-availability.json) | Low mode, native YUY2 output | 86 / 2.53 | 5,562 ms | 1 | Fail; removing NV12 conversion does not cure it |
| [18:34:57](../../.artifacts/phase4-qa/2026-10-18T10-34-57-695Z/camera-availability.json) | Low mode, no VGA preset | 91 / 2.66 | 2,079 ms | 0 | Fail cadence |
| [18:35:34](../../.artifacts/phase4-qa/2026-10-18T10-35-34-533Z/camera-availability.json) | 720p candidate, no VGA preset | 207 / 5.99 | 1,237 ms | 0 | Fail; actual output only 320×240 |
| [18:37:03](../../.artifacts/phase4-qa/2026-10-18T10-37-03-858Z/camera-availability.json) | Explicit CV output dimensions | 187 / 5.44 | 1,674 ms | 0 | Fail; still 320×240 despite requested 720p |
| [18:38:29](../../.artifacts/phase4-qa/2026-10-18T10-38-29-860Z/camera-availability.json) | HD session preset | 161 / 5.62 | 937 ms | 1 | Fail; still 320×240 and reset |
| [18:39:41](../../.artifacts/phase4-qa/2026-10-18T10-39-41-605Z/camera-availability.json) | 320×240/15 | 214 / 6.22 | 1,204 ms | 0 | Fail cadence |
| [18:40:18](../../.artifacts/phase4-qa/2026-10-18T10-40-18-460Z/camera-availability.json) | 720p candidate/5 | 38 / 1.56 | 8,311 ms | 2 | Fail; mixed delivered sizes after resets |
| [18:40:55](../../.artifacts/phase4-qa/2026-10-18T10-40-55-325Z/camera-availability.json) | AVVideoWidth/Height output keys | 0 / — | — | 0 | Invalid configuration: helper crashed/restarted six times; removed experiment, not camera-delivery evidence |
| [18:41:32](../../.artifacts/phase4-qa/2026-10-18T10-41-32-152Z/camera-availability.json) | Configure format after start | 0 / — | — | 2 | 720p MJPEG COMMIT reached, but no frames; alternate 0 at sample |
| [18:43:04](../../.artifacts/phase4-qa/2026-10-18T10-43-04-240Z/camera-availability.json) | Low mode, manual exposure 15.6 ms | 101 / 2.97 | 1,612 ms | 0 | Fail; exposure control restored |
| [18:45:06](../../.artifacts/phase4-qa/2026-10-18T10-45-06-271Z/camera-availability.json) | Low mode, backlight compensation 0 | 103 / 2.98 | 1,536 ms | 0 | Fail; original value 1 restored |
| [18:46:48](../../.artifacts/phase4-qa/2026-10-18T10-46-48-347Z/camera-availability.json) | Low-mode acquire/capture/release | 20 cycles, 27 decoded stills | 1,618 ms across active windows | 0 | Bounded acquisition pass; 320×240 only |
| [18:50:49](../../.artifacts/phase4-qa/2026-10-18T10-50-49-275Z/camera-availability.json) | 720p YUY2 on-demand still | 0 / — | — | 0 | First request timed out at 3.002 s; no decoded still |

The low-mode cycle run took **130.862 seconds**. All 27 stills decoded in RAM;
the first eight arrived in **6.467 seconds**, and the slowest request took
**2.991 seconds**. Maximum observed helper ownership was one; idle ownership
was zero. Idle intervals were only 1/3/10 seconds. This was an additional
diagnostic despite the failed cadence screen, **not C7 qualification**: it does
not establish portrait quality, HD video, recovery under induced failure or
days-long availability. No low-resolution production default was adopted.

### USB/control discriminators and limits

- The low5 stream was observed at interface 1 alternate **2**, with COMMIT
  **320×240 YUY2/5, 256-byte payload**. That endpoint uses one USB transaction
  per microframe. Its failure weakens a theory limited exclusively to
  high-bandwidth multi-transaction handling; it does not exclude USB transport
  or load-sensitive faults. [Active readback](../../.artifacts/camera-availability-2026-10-18/uvc-low5.json).
- Explicit-size and HD-preset runs claimed 720p in AVFoundation while COMMIT
  and delivered buffers remained **320×240**, active alternate 3, payload 800.
  This is why requested format alone is rejected as proof.
  [Explicit-size readback](../../.artifacts/camera-availability-2026-10-18/uvc-explicit-output.json),
  [HD-preset readback](../../.artifacts/camera-availability-2026-10-18/uvc-hd-preset.json).
- Temporary manual-exposure and backlight changes were confirmed during capture
  and restored/read back in `finally`. Final controls are AE mode 8, exposure
  156, backlight 1, gain 0, power-line frequency 1. The exact Arducam SKU is
  unknown; no vendor-specific firmware or extension-unit write was attempted.
  [Manual trial](../../.artifacts/camera-availability-2026-10-18/control-manual.json),
  [backlight trial](../../.artifacts/camera-availability-2026-10-18/control-backlight0.json),
  [final inventory](../../.artifacts/camera-availability-2026-10-18/control-final-inventory.json).
- Both streaming interfaces are driver-owned; a normal libusb claim returned
  **ACCESS (-3)**. Interface 2 advertises a frame-based H.264 GUID, but that
  stream was not opened. New macOS Accessory Access prototype compilation
  succeeded; ad-hoc launch was killed for a restricted entitlement. No valid
  signing identity is installed. [Driver investigation](arducam-driver-research-2026-10-18.md#subsequent-driver-investigation-and-implementation-path).
- Host sleep/display sleep/low-power mode were disabled already; the host
  thermal query reported no performance warning. These do not measure camera
  voltage or temperature. The existing cable and physical topology were used
  throughout. No alternate cable, independent host, electrical analyzer or
  exact-board firmware was available. [Power metadata](../../.artifacts/camera-availability-2026-10-18/power.txt).

### Implemented changes and verification

Production safety fixes in `src/main/camera/tracker.ts` enforce **one total
15-second snapshot deadline**, including the initial attempt, waiting for reset
and retry; the old sequence could take roughly 21 seconds. Empty/unknown
microphone labels now suppress composite USB resets. Existing two-attempt reset
budget, spacing, child release and independent Jabra protection remain intact.
These repairs improve bounded failure behavior; they do not cure invalid USB
payloads. The helper's production format/processing remains unchanged.

QA additions provide strict numeric-only sample events, actual buffer/readback
checks, source and receipt gap metrics (including trailing silence), repeated
RAM-only snapshots, owner checks, and a review-UI-only silent camera scenario.
An invalid configuration now stops QA on its first helper restart. The removed
AVVideoWidth experiment and an early unsupported macOS `inputPriority` compile
failure remain recorded. A format-comparison key-order bug in the first harness
iteration was fixed and unit-tested; it did not account for the physical frame
loss. Do not rerun the removed crashing case.

| Command/check | Result / evidence |
| --- | --- |
| `npm run build` | Exit 0; native helper compiled/signed, stamped app built. [Final build](../../.artifacts/camera-availability-2026-10-18/build-restore.log) |
| `npx vitest run tests/main/camera` | Exit 0; **87 tests, six files**, including total deadlines, microphone guard, parser privacy, stale/mismatched/empty windows, ownership, RAM snapshot decode and isolated QA. [Log](../../.artifacts/camera-availability-2026-10-18/camera-tests-delivery-final.log) |
| `npm run typecheck:node` | Exit 0. [Log](../../.artifacts/camera-availability-2026-10-18/typecheck-delivery-final.log) |
| `node --check scripts/run-raven-conversation-qa.mjs` and `node --check scripts/raven-qa-launchagent.mjs` | Exit 0 |
| Physical trial command | `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario camera_availability --camera-case <case> --camera-check screen` under the outer Electron lease. Each failed screen exits 2; `low5 --camera-check cycles` exits 0; `yuy2720 --camera-check cycles` exits 2. Each linked run retains `evidence.json` and camera details. |
| Offline native payload auditor | ASan/UBSan pass, 65,536 synthetic header cases; no physical USB input. [Implementation/command](../../research/arducam/README.md), [final result](../../.artifacts/camera-availability-2026-10-18/uvc-payload-audit-test-final.log) |
| macOS 27 Accessory Access probe | Compile/sign exit 0; launch **SIGKILL (-9)**, restricted entitlement. No device open. [Result](../../.artifacts/camera-availability-2026-10-18/accessory-process.json) |

No full suite or Electron smoke was run concurrently with this work. All
screens were native delivery-only; the cycle checks exercised production
Vision/JPEG and decoded returned images in RAM. No images, audio, transcripts,
embeddings, private context, credentials or camera serial identifiers were
written to evidence. Native driver/control probes retain allowlisted numeric
metadata only; no ordinary camera preview or raw USB packet trace was saved.
Final diff/whitespace review, runner syntax checks and build-stamp verification
pass; 81 local documentation links resolve. Normal LaunchAgent operation was
restored at 18:58:54 Taipei, with Dormant/wake-worker-ready telemetry, no
camera/reset helper and the owner lease released. Jabra remains the default
input/output and is unmuted; no volume was changed by camera QA.
[Runtime evidence](../../.artifacts/camera-availability-2026-10-18/runtime-restored.json),
[audio readback](../../.artifacts/camera-availability-2026-10-18/audio-route-restored.json).

### Acceptance decision and next discriminator

| Gate | Current outcome |
| --- | --- |
| C1 | Advancing samples/mode mismatch measured; no usable stable HD mode |
| C2 | Diagnostic 320×240 20-cycle pass only; HD acquisition fails |
| C3 | Eight low-resolution decoded stills in 6.467 s; usable face detail/human check not accepted |
| C4 | Fail: no timely usable-resolution portrait demonstrated |
| C5 | Fail delivery; actual clip encoding/decoding not executed |
| C6 | Deadline/guard tests pass; physical induced-stall recovery qualification not executed |
| C7 | No candidate passed screening, so five-minute stability qualification not entered |
| C8 | 48-hour/200-request qualification not entered because prerequisites fail |
| C9 | Metadata-only capture, one observed owner, zero idle camera helpers; no unrelated USB reset |

Next: obtain properly provisioned USB access or an independent host and compare
transport completion status with payload/header/frame assembly. The original
offline auditor is ready for a bounded transport adapter; it is not a working
driver. Exact SKU/board/firmware and a cable/power comparison remain useful
independent discriminators. Do not declare the issue resolved, promote a
requested mode from readback alone, or label a short 320×240 pass as days-long
availability. Normal runtime restoration is recorded in the current handoff.

### Follow-up: highest resolution at one frame per second

Owner hypothesis: request one highest-resolution frame per second to reduce USB
pressure. The inspected USB descriptors advertise 1920×1080 MJPEG at approximately
30/25/20/15/10/5 fps and YUY2 at 5 fps only. No 1 fps interval is advertised.
Application snapshot frequency and sensor/USB stream frequency are different;
discarding four out of five already received frames saves application work but
does not remove their USB transfers.

Prospective check: run the existing signed-helper delivery screen at **1080p/5**
for the MJPEG candidate and uncompressed YUY2, read back COMMIT/active alternate,
and require actual 1920×1080 buffers at advancing 5 fps, no reset/restart, maximum
250 ms source gap. This is a bandwidth experiment for still supply, not a pass
for the accepted 15 fps video target. If delivery passes, test timed RAM-only
snapshots; current snapshot IPC scales a 1920×1080 source to 1280×720, so full-HD
source delivery and full-HD returned JPEG are separate requirements. This first
experiment did not force an unadvertised 1 fps value. The owner's subsequent
explicit request is tested in the direct-API follow-up below.

Executed at 20:26–20:28 Taipei with isolated data, the same signed helper and
one-shot LaunchAgent route. Camera-only QA was silent. The two new cases change
only the selected format/rate; production capture remains VGA/15.

| Requested source | Actual result | Verdict |
| --- | --- | --- |
| [1920×1080 MJPEG candidate / 5 fps](../../.artifacts/phase4-qa/2026-10-18T12-26-24-823Z/camera-availability.json) | **One actual 1920×1080 NV12 sample**, first arrival 14.342 s after start, then no more frames; two resets exhausted, trial 28.646 s | Fail; proves full-HD-sized delivery can occur, not repeatable still supply or image quality |
| [1920×1080 YUY2 / 5 fps](../../.artifacts/phase4-qa/2026-10-18T12-27-14-538Z/camera-availability.json) | Zero samples; two resets exhausted, trial 28.300 s | Fail |

The first MJPEG probe at ~7 s still read the previous 720p YUY2 mode; its
post-trial readback was format 1/frame 1, interval 2,000,000 × 100 ns, payload
800: **1080p MJPEG/5**. Both samples observed alternate 0, so they do not prove
an active transfer's wire behavior. The delivered 1080p buffer is independently
recorded by the helper.
[Early readback](../../.artifacts/camera-availability-2026-10-18/uvc-mjpeg10805.json),
[post-trial readback](../../.artifacts/camera-availability-2026-10-18/uvc-mjpeg10805-after.json).

The YUY2 trial exposes a further negotiation inconsistency: both during and
after capture, successful GET responses report format 2/frame 9, 5 fps,
**17,171,712 maximum frame bytes and 8,192 maximum payload bytes**. That frame
descriptor is 1920×1080 YUY2 and specifies 4,147,200 frame bytes; the largest
advertised endpoint service-interval capacity is 3,072 bytes. Alternate 0 was
observed and no frame arrived. This is evidence of inconsistent control state,
not proof that those transfers occurred or that a particular component caused
it. Duplicate 1080p frame indices and host/device negotiation deserve comparison
through an independent stack.
[During](../../.artifacts/camera-availability-2026-10-18/uvc-yuy210805.json),
[after](../../.artifacts/camera-availability-2026-10-18/uvc-yuy210805-after.json).

A GET-only descriptor check found **stillCaptureMethod=0, triggerSupport=0**
on both video-streaming interfaces, and no still-image frame descriptors. The
camera does not advertise a separate UVC still-trigger path. Software can still
take snapshots from video; no supported one-photo-only USB mechanism was found.
[Measured descriptors](../../.artifacts/camera-availability-2026-10-18/uvc-still-capabilities.json),
[Microsoft description of device-advertised still methods](https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/uvc-camera-implementation-guide#method-2-or-method-3-still-capture-support).
Apple requires frame durations within the active format's supported ranges;
unsupported values raise an exception. Its HTML/Markdown tools were unavailable;
the official documentation JSON supplied this rule.
[Apple maximum frame duration](https://developer.apple.com/documentation/avfoundation/avcapturedevice/activevideomaxframeduration).

Uncompressed YUY2 calculations, excluding headers: 1920×1080×2 = **4.1472 MB per
frame**; a hypothetical 1 fps would carry 4.1472 MB/s, supported 5 fps carries
20.736 MB/s, versus VGA/15 at 9.216 MB/s. Compression can reduce actual bytes;
no MJPEG wire-throughput measurement was obtained here. Sampling only one
already-delivered frame each second does not reduce USB delivery. Releasing the
camera between photos reduces idle traffic but adds startup delay; the observed
14-second first full-HD frame cannot satisfy a regular 1 Hz request schedule.
Low-bandwidth 320×240/5 already failed cadence, so bandwidth volume alone is not
an established explanation.

No snapshot-frequency test followed the failed source screens. Full-HD frame
content was not retained or visually assessed. New stamped build, 87 focused
camera tests and node typecheck pass; sources were reviewed and whitespace/build
verification passes. [Build](../../.artifacts/camera-availability-2026-10-18/build-1080-low-rate.log),
[tests](../../.artifacts/camera-availability-2026-10-18/camera-tests-1080-low-rate.log),
[typecheck](../../.artifacts/camera-availability-2026-10-18/typecheck-1080-low-rate.log).
Normal operation restored **20:28:28 Taipei**, PID 9714, Dormant/wake ready,
zero camera/reset owners; lease released.
[Restoration](../../.artifacts/camera-availability-2026-10-18/runtime-restored-low-rate.json).

### Follow-up: direct API requests and disable/re-enable

Owner explicitly requests **actual 1/2/5-fps API calls**, lowest-rate avatar
capture, targeted USB disable/re-enable, and broader macOS webcam research.
Prospective checks: directly invoke both AVFoundation frame-duration setters
under the device configuration lock at 320×240 YUY2, VGA YUY2 and 1080p MJPEG
candidate. Catch Objective-C exceptions in a small native QA-only boundary;
record only accepted/invalid-argument/other codes, supported-range membership,
and duration readback. Restore the original durations on rejection and end
that case promptly. Do not infer rejection merely from our prior range guard.

Setter acceptance and physical delivery are separate gates. An accepted mode
must deliver the requested dimensions and cadence for the normal 30-second
screen with no reset/restart. Prospective source-gap limits for the 1/2-fps
experiments are one requested interval plus 250 ms (receipt limit another
250 ms); 5-fps checks keep the existing 250/500-ms limits. These checks do not
replace the accepted video requirement or permit a failed mode as the normal
avatar setting. Returned snapshots remain RAM-only.

USB investigation: release all capture owners, confirm Jabra is the microphone,
select exactly one 0c45:0520 device, attempt only bounded reversible operations,
and always resume/restore original configuration after a state-changing probe.
Record API status and observed device state separately, then test fresh frame
delivery. No hub/controller reset, whole-system media-service kill, driver
seizure, privilege escalation or security reduction is part of these probes.

Executed **21:01–21:07 Taipei** on the signed helper, macOS 27.0.1, existing
cable and isolated LaunchAgent route. Both actual duration setters were called
under the device lock, including unadvertised values. An Objective-C boundary
caught exceptions and restored the previous durations after rejection; no
exception text or image was retained. All six rejected cases report
`NSInvalidArgumentException` for **both** setters and successful restoration.

| Source selection | 1 fps API | 2 fps API | 5 fps API and delivered frames |
| --- | --- | --- | --- |
| 320×240 YUY2 | [Rejected](../../.artifacts/phase4-qa/2026-10-18T13-01-25-531Z/camera-availability.json) | [Rejected](../../.artifacts/phase4-qa/2026-10-18T13-01-27-925Z/camera-availability.json) | [Accepted, both durations 0.2 s](../../.artifacts/phase4-qa/2026-10-18T13-01-30-318Z/camera-availability.json); 93 samples, 2.692 delivered fps, 1.627 s maximum source gap, zero resets. Delivery fails. |
| 640×480 YUY2 | [Rejected](../../.artifacts/phase4-qa/2026-10-18T13-01-05-656Z/camera-availability.json) | [Rejected](../../.artifacts/phase4-qa/2026-10-18T13-02-07-157Z/camera-availability.json) | [Accepted, both durations 0.2 s](../../.artifacts/phase4-qa/2026-10-18T13-02-09-549Z/camera-availability.json); 21 samples, 0.830 delivered fps, 6.851 s maximum source gap, two resets. Delivery fails. |
| 1920×1080 MJPEG candidate | [Rejected](../../.artifacts/phase4-qa/2026-10-18T13-02-38-272Z/camera-availability.json) | [Rejected](../../.artifacts/phase4-qa/2026-10-18T13-02-40-661Z/camera-availability.json) | [Accepted, both durations 0.2 s](../../.artifacts/phase4-qa/2026-10-18T13-02-43-052Z/camera-availability.json); zero samples, two resets exhausted in 28.139 s. Delivery fails. |

Delivered FPS is calculated from advancing source timestamps, not API readback
or requested snapshots. The accepted 5-fps modes did not meet the frozen
30-second delivery screen. The rejected cases ended before streaming rather
than crashing the helper. This tests AVFoundation requests on this device and
OS; it does not prove a future firmware/raw-USB implementation could never
offer 1/2 fps. No unsupported UVC SET interval was sent behind Apple's owner.

Avatar rendering has its own `requestAnimationFrame` loop
([renderer](../../src/renderer/avatar/cubism-avatar.ts)); camera acquisition is
a separate Main-owned worker. Thus a **5-fps camera** need not make the animated
avatar render at 5 fps. Lower sampling of already received images can reduce
face-analysis cost but not USB traffic. The production camera remains VGA/15
while activating/active, released while Dormant. This follow-up ran isolated
camera screens, not an avatar-active coexistence qualification, and did not
promote an unreliable 5-fps mode. Current production-processing 320×240/5
acquire/release evidence remains the earlier 20-cycle diagnostic pass, not HD
portrait, video or days-long acceptance.

USB operations selected exactly one matching camera after Electron/capture
release and a fresh Jabra input/output check. The diagnostic used normal
`USBDeviceOpen`, never seizure, and always executed cleanup:

| Operation | Actual outcome | Subsequent capture result |
| --- | --- | --- |
| Suspend for 2 s, resume | Both API statuses success, but suspended flag 0 before/during/after. Actual suspend transition **unconfirmed**. [Probe](../../.artifacts/camera-availability-2026-10-18/usb-cycle-suspend.json) | [1080p/5](../../.artifacts/phase4-qa/2026-10-18T13-04-09-357Z/camera-availability.json): one full-HD-sized sample at 13.067 s, then failure; two resets, 28.135 s total. |
| Unconfigure, wait 2 s, restore | Configuration **1 → 0 → 1**, successful SET calls. [Initial probe](../../.artifacts/camera-availability-2026-10-18/usb-cycle-configure-initial.json) | [1080p/5](../../.artifacts/phase4-qa/2026-10-18T13-05-16-104Z/camera-availability.json): zero samples, two resets, 28.180 s total. |
| Reconfiguration readback validation | Added explicit GET status recording and performed one validation cycle: all three GETs and both SETs succeeded; **1 → 0 → 1**, 2.455 s including the dwell. [Verified probe](../../.artifacts/camera-availability-2026-10-18/usb-cycle-configure.json) | Confirms reversible device state only; no further unchanged stream retry. |

No probe timed out; all cleanup calls succeeded. Unconfiguring disables the
composite device's interfaces, including its microphone, but does **not** prove
VBUS power was removed. Existing production `USBDeviceReEnumerate` already
requests logical unplug/replug and driver rediscovery. Neither successful API
call certifies firmware reboot or valid image delivery. No new USB operation
was installed in automatic recovery because the delivery checks failed.

Read-only libusb 1.0.30 inspection found two Apple hubs advertising per-port
switching and one ganged hub, but **none is the camera's upstream hub**. The
camera has no libusb parent and IOKit places it directly on an XHCI root port.
No currently exposed, individually power-switchable hub route to this camera
was found; unrelated ports were untouched. A different existing port could
change the topology, but moving the cable requires physical access.
[Hub capabilities](../../.artifacts/camera-availability-2026-10-18/usb-hub-capabilities.json),
[verified IOKit ancestry](../../.artifacts/camera-availability-2026-10-18/usb-camera-ioservice-ancestry-verified.json).
The first ancestry scripts mistakenly iterated a dictionary as a root list;
their zero-match outputs are invalid and retained separately. The corrected
walk identifies one device plus its five interfaces.

Build, node typecheck and **111 focused tests** pass. The standalone USB probe
also builds with warnings-as-errors. Tests cover numeric-only exception
metadata, rejected-case termination, ownership and build provenance. This is
software/diagnostic validation, not a camera repair.
[Build](../../.artifacts/camera-availability-2026-10-18/build-api-rates.log),
[tests](../../.artifacts/camera-availability-2026-10-18/tests-api-rates.log),
[typecheck](../../.artifacts/camera-availability-2026-10-18/typecheck-api-rates.log),
[USB probe build](../../.artifacts/camera-availability-2026-10-18/usb-cycle-build-readback.log).

Normal production LaunchAgent restored **21:06:56 Taipei**, PID 11293;
21:08 readback confirms Dormant/wake ready, zero camera/reset helpers and Jabra
default input/output. Output scalar 0.812730, input 0.571429, output unmuted;
the original production audio levels are restored. The inherited Electron
lease is released. No new production rate or recovery operation was enabled.
[Runtime restoration](../../.artifacts/camera-availability-2026-10-18/runtime-restored-api-usb.json),
[audio restoration](../../.artifacts/camera-availability-2026-10-18/audio-restored-api-usb.json).
Final GET-only UVC control readback matches the measured originals: AE mode 8,
priority 0, exposure 156, backlight 1, gain 0 and power-line 1.
[Control restoration](../../.artifacts/camera-availability-2026-10-18/uvc-controls-api-usb-restored.json).

## Full-resolution independent-USB experiments, from 21:31 Taipei

These experiments follow the owner's mandatory **1920×1080** directive above.
Earlier 320×240 results remain diagnostic history, not accepted fallbacks.
Administrator access was available (`sudo -n true`, exit0). Normal Electron was
cleanly stopped under the retained `camera-full-resolution` ownership lease.
Every native invocation checks zero capture/reset helpers and Jabra default
input/output. Fresh preflight audio readback was output0.0625, input0.571429,
unmuted. That current operator state supersedes the earlier 21:08 volume value.

The new exact-device ownership probe detached Apple's whole composite driver,
claimed video interfaces0/1/2, released each and attached the driver again;
every API returned0. Independent subsequent GET-only checks found all three
drivers active. No other device was detached. This also temporarily removes the
camera's audio interfaces; the separate Jabra is required throughout.
[Ownership evidence](../../.artifacts/camera-availability-2026-10-18/usb-root-claim.json),
[actual five-interface layout](../../.artifacts/camera-availability-2026-10-18/usb-interface-layout.json).

The isolated headless libuvc transport requests full-HD directly, without
AVFoundation or Apple's UVC parser. Upstream commit is
`d07de4fa23905ee8cac06f5d24b2a03d42a3b363`, linked with installed libusb1.0.30.
After the first stock trial, an instrumented patch counts native transfer and
packet statuses and validates header bounds. No image or encoded stream is
saved. The baseline queue is20 transfers of32 microframe packets each.

| Requested 1920×1080 mode | Buffers delivered / validated full-HD images | Result |
|---|---:|---|
| MJPEG5, stock library | 1 / 0 | First buffer1.956s; then33.715s gap; no validated photo. |
| MJPEG15, instrumented | 3 / 0 | All20 transfers fail;34.578s final gap. |
| YUY2/5 | 0 / 0 | Correct frame1 negotiation:4,147,200-byte frame,3,072-byte payload,alt6. All20 transfers fail. |
| H264/15, VS2 | 3 / **not decoded** | Actual descriptor frame2 at1920×1080;35.394s trial,34.323s final gap. All20 transfers fail. No decoded-image claim. |
| MJPEG15, queue100 | 10 / 0 |99 reported transfer failures;34.411s final gap. Larger queue fails. |
| MJPEG15, one resubmission per transfer | 4 / 0 |20 bounded resubmissions,40 transfer errors;34.097s final gap. |
| MJPEG, direct1 FPS interval | 3 / 0 | PROBE echoes10,000,000×100ns;20 transfer errors; no valid1 FPS supply. |
| MJPEG, direct2 FPS interval | 3 / 0 | PROBE echoes5,000,000×100ns;20 transfer errors. Four observed FID transitions spaced≈260ms, not500ms. |
| MJPEG30 | 3 / 0 | PROBE333333, payload1600,alt4;20 transfer errors;34.703s final gap. |
| MJPEG15,8 packets/transfer | 3 / **1** | One ImageIO-decoded1920×1080 image, all3 buffers within≈1.004s; then20 transfer errors and34.708s final gap. Promising burst evidence only. |

All rows fail sustained delivery. An assembled library buffer is **not** a
validated image. MJPEG validation requires framing markers, actual decoded
dimensions and an in-memory bitmap draw; YUY2 validation checks exact size.
H264 decoding was not implemented because transport already stops after its
initial burst. A successful process exit is not a QA pass. The 8-packet result
does not establish repeated still-request reliability or a video clip.

Instrumented transfer failures are `0xe000400e` (`kIOUSBNotSent1Err`, transaction
not sent), mapped to `LIBUSB_TRANSFER_ERROR`. Successful packets in these runs
have zero counted invalid/truncated headers, device-error flags or missing EOH.
This differs from the Apple-driver counter observation and does not prove the
two paths fail identically. The error does not uniquely identify cable damage.
Every row independently verifies restoration of drivers0/1/2. Zero image data
is retained in the artifacts:
[MJPEG5](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5.json),
[MJPEG15](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15.json),
[YUY2](../../.artifacts/camera-availability-2026-10-18/libuvc-yuy25.json),
[H264](../../.artifacts/camera-availability-2026-10-18/libuvc-h26415.json),
[queue100](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-q100.json),
[retry](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-retry1.json),
[1 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg1.json),
[2 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg2.json),
[30 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30.json),
[8-packet batching](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-p8.json).

The application now preserves actual full-HD snapshots at JPEG quality0.95,
bounded to4MiB JPEG /6MiB framed IPC. No smaller source is upscaled. The QA cycle
gate now requires decoded photo dimensions to equal the requested source mode;
a1080p source followed by a1280×720 photo fails. The snapshot worker passed300
focused Node tests and both typechecks; root's additional15 QA-gate tests pass.
Native helper compilation and the stamped application build pass. These are
software checks, not new hardware acceptance or a production mode promotion.

### JPEG validation correction before burst repetition

The initial validator required EOI in the buffer's final two bytes. An initial
3-second burst failed that strict rule, although both returned buffers contained
EOI. Thus earlier zero decoded-image counts have a **strict-framing limitation**;
they do not prove that every candidate was incomplete. Their measured transport
stalls and failed cadence remain valid.

A bounded JPEG parser now finds the primary EOI using segment lengths and
entropy-byte rules, avoiding false EOIs inside EXIF thumbnails. Complete image
prefixes are decoded in RAM at actual1920×1080; no missing image data is invented.
The synthetic marker/truncation/65,536-length-pair test passes ASan/UBSan.
The corrected first burst passes the3-second threshold: valid photo0.923972s,
request plus cleanup1.342425s,6 trailing bytes excluded, all three Apple drivers
restored. The image is neither saved nor uploaded. This is an independent
research capture path; it has not been integrated into production.
[Original strict burst failure](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-burst1.json),
[corrected burst](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-burst2.json).

The corrected path then completed **20 consecutive independent acquisitions**
(first corrected burst plus19 further trials). All photos decoded at1920×1080.
Maximum first-valid latency was**0.991320s**; maximum process/request-and-cleanup
time including the first corrected burst was**1.342425s**. Every trial verified
driver-active=1 on interfaces0/1/2 after release. Inter-request dwells cycled
1/3/10 seconds. This is a bounded research burst result, not the signed
application C7 runner, an8-photo rapid burst, video encoding, avatar-active QA,
human visual acceptance or48-hour qualification.
[Repeated bursts](../../.artifacts/camera-availability-2026-10-18/fullhd-burst-cycles.json)
(cycle1 is the separately linked `burst2` artifact; cycles2–20 are this file).

### Native IOUSBHost comparison

The second original transport uses native IOUSBHostPipe isochronous frame lists
with ASAP scheduling,8 slots ×128 packets. Its first physical run stopped safely
at an overly strict26-byte control-length guard. GET-only inspection established
**GET_LEN=34 for both PROBE and COMMIT despite bcdUVC=1.00**. The prototype now
accepts verified26/34-byte controls, preserves extra fields, and reads COMMIT
back. The immediate post-destroy driver probe saw VS1/2 not yet attached; a
delayed read confirmed both returned. The guarded caller now waits up to5s for
reattachment instead of declaring failure from that transient sample.
[Initial failure](../../.artifacts/camera-availability-2026-10-18/native-asap.json),
[delayed restoration](../../.artifacts/camera-availability-2026-10-18/native-asap-delayed-restore.json),
[length readback](../../.artifacts/camera-availability-2026-10-18/native-uvc-control-length.json).

The corrected native run delivered payloads across the entire20-second window:
**297FID transitions,292EOF markers,103,407,124 payload bytes**, generally about
5.2MB/s. There were156,152 successful packets and4,744 packets reporting
`0xe00002ed` (`kIOReturnNotResponding`), preserved separately in the ledger.
Successful packets had no counted invalid header/length/device-error/EOH defects.
All1,257 submitted transfers completed and joined; alt0 restoration and device
destruction succeeded, and Apple drivers were independently verified back after
an0.807s wait. This is **transport progress, not a decoded-video pass**: no image
assembly/decoding occurred in this version.
[Native20-second evidence](../../.artifacts/camera-availability-2026-10-18/native-asap-34.json).

A controlled follow-up gave legacy libusb the same34-byte control length while
retaining its existing USB scheduling and8-packet batches. It still stopped:
2 candidate buffers /1 validated full-HD JPEG in35.659s, with20 NotSent1 transfer
errors and34.723s final gap. Therefore34-byte negotiation alone does not explain
or repair the legacy transport failure.
[Legacy34-byte comparison](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-ctrl34.json).

### Legacy backend trace and correction

The instrumented libusb Darwin backend found139 good packets and21 failed
packets inside20 aggregate NotSent1 failures. Its existing completion branch
did not return those good per-packet results; libuvc retired every failed
request, eventually emptying the queue. A camera-specific experimental fix
clears per-packet metadata on submit, bounds actual lengths and preserves mixed
completion results with individual errors. Raw aggregate errors remain counted.
This concerns the independent libusb path, not a proven defect in Apple's UVC
implementation. [Trace](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-backendtrace.json).

The corrected MJPEG15 run stayed live for35.022s:511 candidate buffers,469
validated1920×1080 images, no poll timeouts,68ms maximum candidate receipt gap.
Failed packet statuses remained9,618; no USB reset/reopen was used during the
stream. [15FPS correction](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-partialiso.json).

At requested30FPS, a separate5s warmup +30s measurement produced**857 validated
full-HD images:28.566667 validFPS**, per-second counts24–30, and maximum valid
receipt gap**100.008ms**. No poll timeouts occurred;7,288 packet failures remained
visible. All three Apple drivers returned after release. This meets the initial
decoded-frame delivery FPS/gap targets, but encoded recording, human quality,
avatar-active operation and days-long availability remain separate gates.
[30FPS correction](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30-partialiso.json).

libusb's documented isochronous API permits a completed transfer to contain
failed packets and requires callers to check individual statuses. The experiment
preserves that distinction instead of discarding good data or suppressing packet
failures. [Primary API contract](https://libusb.sourceforge.io/api-1.0/group__libusb__asyncio.html).

### Five-minute full-resolution delivery and independent decoding

The corrected MJPEG30 backend completed a 5-second warmup and exact 300-second
measurement without reset/reopen: **8,517 valid 1920×1080 images, 28.39 valid
FPS, 24–30 per second, maximum valid receipt gap 133.957 ms**. First valid
image arrived in 0.750057 s. There were no polling timeouts. All 54,346 failed
packet statuses and 49,666 raw NotSent1 aggregates remain counted. Apple drivers
0/1/2 were independently verified restored. This passes this diagnostic's
decoded-delivery target, not application, human image-quality or 48-hour QA.
[Five-minute metadata](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30-stable.json).

The independently implemented native IOUSBHost path now assembles bounded JPEGs
and forces ImageIO bitmap decoding in RAM. Requested MJPEG15 produced 487 decoded
full-HD images in 35 seconds; the exact 30-second measurement contained 422
(14.0667 FPS), with a 208 ms maximum fresh-frame gap. PTS advanced consistently,
with no duplicates/regressions. First completed decode arrived in 0.941 s from
request. The native path therefore confirms continuous fresh full-HD transport,
but **does not meet the initial 15 actual FPS video threshold at this setting**.
All decoded candidates had a transport-incomplete marker because failed packets
occurred within their boundaries; complete JPEG parsing/decoding does not prove
visual integrity. 22 candidates lacked a complete primary JPEG; nine further
decodes failed, and one was dropped under bounded processing pressure. Error
counts remain visible. All USB/decode jobs joined and all Apple drivers returned.
[Native decoded run](../../.artifacts/camera-availability-2026-10-18/native-asap-decoded35.json).

### Actual 1 / 2 / 5 FPS requests after transport repair

All three experiments retain actual 1920×1080 MJPEG and 34-byte controls. The
camera echoes the requested interval, but FID changes arrive about every 260 ms
for **all three settings** (~3.85 source FPS). Thus accepted PROBE values do not
establish an implemented 1 or 2 FPS sensor cadence. No application-side frame
dropping was used to manufacture a low-rate result.

| Requested FPS | Echoed interval (100 ns) | Valid decoded FPS over 30 s | First valid photo | Largest valid gap |
| --- | --- | --- | --- | --- |
| 1 | 10,000,000 | 3.700 | 2.022 s | 520 ms |
| 2 | 5,000,000 | 3.700 | 2.016 s | 520 ms |
| 5 | 2,000,000 | 3.767 | 1.984 s | 520 ms |

All selected alternate 3 / 800-byte payload capacity, retained packet errors,
and restored Apple drivers. The low-bandwidth mode is usable as a research
candidate; true 1/2 FPS and avatar-active operation are not established.
[1 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg1-partialiso.json),
[2 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg2-partialiso.json),
[5 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-partialiso.json).

### Actual full-HD hardware video encode/decode

The corrected MJPEG30 path fed only validated full-HD images from the exact
30-second measurement window into VideoToolbox H264 encoding and then decoded
the actual compressed samples. **848 submitted = 848 accepted = 848 encoded =
848 decoded**, all actual 1920×1080; hardware encoder and decoder usage were
verified. Measured image supply was 28.2667 FPS, with 100 ms maximum valid receipt
gap. Relative timestamps advanced from 0.030636 to 29.993827 s without input,
encoded or decoded PTS errors. There were zero codec errors, codec/backpressure
drops, missing outputs or wrong dimensions. The bounded pool peaked at four
in-flight frames and drained to zero. Total compressed data processed in RAM:
46,270,325 bytes; no image/video file was retained. Apple drivers returned.

This passes the initial full-HD codec-throughput target. It is **not a muxed
30-second video-file/playback test**, human image-quality acceptance, avatar
integration or days-long qualification. Source packet/JPEG rejection counts are
still recorded separately; encoding does not repair missing source images.
[Video codec metadata](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30-encode.json).

### Strict image-integrity check overrides usable-image interpretation

Uncompressed YUY2/5 with the corrected backend stayed live but produced **zero
complete frames out of 130**: buffers ranged 3,855,956–4,062,560 bytes, short of
the required 4,147,200. It is not a photo alternative.
[Uncompressed evidence](../../.artifacts/camera-availability-2026-10-18/libuvc-yuy25-partialiso.json).

A second full-image decoder, installed libjpeg-turbo 3.2.0 with STOPONWARNING,
checks the complete primary JPEG in bounded RAM after ImageIO. It does not
accept recovery/concealment warnings. This exposed a material limit in the
earlier acceptance metric:

| Full-HD setting | ImageIO-valid images | Warning-free images | Result |
| --- | --- | --- | --- |
| MJPEG30, 20×8 packet queue | 975 | 2 | First clean image 23.812 s; 0.067 clean FPS over measurement; fails |
| MJPEG5, 20×8 packet queue | 124 | 5 | 119 premature entropy-end warnings; first clean image 16.029 s; fails |
| MJPEG30, 20×128 packet queue | 965 | 2 | 962 premature entropy-end warnings and one bad-Huffman warning; first clean image 24.796 s; fails |

All trials lasted about 35 seconds and restored Apple drivers. Enlarging each
transfer from 8 to 128 microframe packets reduces callback frequency and
increases queued lead time, but did not fix image integrity. This is distinct
from the old queue-exhaustion defect, which the custom backend does correct.
The codec still encodes/decodes all admitted frames correctly; it cannot repair
missing source JPEG data. The earlier 20 bursts and five-minute stream therefore
**cannot qualify photo/video usability**, even though their ImageIO counters
and timing remain accurate. No production capture backend was replaced.

[Strict MJPEG30](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30-strict.json),
[strict MJPEG5](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-strict.json),
[larger transfers](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30-strictp128.json).

The synthetic check passes ASan/UBSan: 65,536 marker-length cases, a generated
complete 1920×1080 JPEG accepted, and the same JPEG with missing entropy but an
EOI marker retained rejected with a warning. No camera data was used. This
guards against mistaking marker completeness for complete compressed image data.
The first compile lacked `explicit_bzero`; it was corrected with a bounded
volatile wipe. An old binary rejected the new flag before touching USB. Both
failures are retained. A cached CMake JPEG target also required clearing stale
JPEG discovery variables before the successful 128-packet build.

The independent native ASAP implementation also fails strict integrity at
full-HD MJPEG15: **495 complete primary JPEG candidates, zero strict-valid
images** (58 premature entropy-end warnings and 437 decoder errors); ImageIO
alone displayed 483 of them. PTS still advances, so fresh timestamps do not
prove intact pixels. All transfer/decode jobs joined, memory was released, and
Apple drivers returned. This comparison makes a legacy libusb-only explanation
for the remaining damage insufficient. It still does not uniquely distinguish
camera firmware, electrical transport or macOS host behavior.
[Native strict evidence](../../.artifacts/camera-availability-2026-10-18/native-asap-strict35.json).

The camera's own full-HD H264 output was also tested through the corrected
20×128-packet transport. The initial run delivered 1,029 candidate buffers in
35 seconds, using about 1.24 MB/s of payload, but did not decode them. The
follow-up sent 1,027 buffers directly through a private pipe to an unprivileged
FFmpeg 9.0.2 decoder (`err_detect=explode`). It reported 693 decoded 1920×1080
frames **and 655 error log lines**. Both processes exited 0, demonstrating why
exit status/decoded counts alone are inadequate acceptance. Clean-decode QA
explicitly failed. No per-frame decode-error flags were reported by this
ffprobe build, so their absent values are not evidence of clean frames. Only
allowlisted counts/dimensions/error totals were retained; raw logs and all media
were discarded. Apple drivers returned. The lower-payload H264 mode is not a
qualified replacement for full-HD MJPEG.
[H264 transport](../../.artifacts/camera-availability-2026-10-18/libuvc-h26430-strictp128.json),
[H264 decoding](../../.artifacts/camera-availability-2026-10-18/camera-h264-decode.json).

The final targeted check reproduced the original cold-start still strategy,
using MJPEG15, the original 26-byte control behavior and 20×8-packet queue,
with strict integrity added. **Zero clean photos within the three-second
deadline**: 33 candidate buffers, 31 ImageIO-valid images, all 31 rejected for
premature entropy end. Total capture/release took 3.544 s and Apple drivers
returned. This directly rejects the apparent earlier sub-second burst success
as a usable-photo solution; it is not merely an inference from the video tests.
[Strict cold-start burst](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-strictburst.json).

### Full-resolution investigation restoration, 22:42 Taipei

The stamped production build verified and the normal LaunchAgent returned at
22:41:02, PID 17351. Fresh telemetry confirms Dormant, wake-worker-ready and
wake-worker-listening; zero camera/reset/research capture helpers remain. The
Electron lease shell exited 0 and released ownership. All three Apple video
drivers were verified active after the final capture. GET-only camera controls
match the original AE 8, priority 0, exposure 156, backlight 1, gain 0, power-line 1.

Jabra remains default input/output and unmuted. App startup changed output from
the latest preflight 0.0625 to 0.752425; the task restored exactly 0.0625 and
read it back. Input remains 0.5714285969734192. No system driver, firmware,
dependency, security setting or privileged service was installed. Research
data is metadata-only. The production capture format was not promoted or
claimed repaired; actual full-HD source integrity remains the blocker.
[Runtime](../../.artifacts/camera-availability-2026-10-18/runtime-restored-full-resolution.json),
[audio](../../.artifacts/camera-availability-2026-10-18/audio-restored-full-resolution.json),
[controls](../../.artifacts/camera-availability-2026-10-18/uvc-controls-full-resolution-restored.json).

### Owner's relaxed edge/FPS criteria: new full-HD trials, 22:50–23:13

These trials use the new 5-second normal photo target and preserve 1920×1080.
Low FPS is permitted. Tiny edge defects require a conservative spatial bound;
neither a decoder warning nor its detection row supplies that bound by itself.
The research libuvc patch now maps the first reported failed USB packet to the
assembled frame's compressed-byte offset. A bounded 64-entry sequence ring
rejects unmatched records. A second RAM-only decoder consumes only the prefix
before that offset and stops on warnings/errors. Its completed-row count is a
conservative progress diagnostic, not the measured visual area of damage.
Boundary ambiguity and losses in empty payloads can over-reject; no damaged
frame is automatically promoted to face/art acceptance.

| Changed hypothesis | Physical result | Evidence |
| --- | --- | --- |
| 5 FPS with largest advertised USB reservation (alt 6, 3072 bytes) | 3/125 ImageIO-valid frames decode without warnings; first 28.504 s. No improvement. | [max reservation](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-maxpayload.json) |
| Standard compression quality 5000 | Echoed exactly; 4/125 clean, first 15.771 s. | [quality 5000](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-quality5000.json) |
| Standard compression quality 100 | Echoed exactly; 3/121 clean, first 20.194 s. Same observed quantization-sum range as 5000; an effective quality change is unproven. Maximum prefix progress 992/1080 rows. | [quality 100](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-quality100.json) |
| High-priority process/USB event thread | Process nice -10 and QoS setter succeeded. 5/124 clean, first 16.810 s; source gaps still exceed 5 s. | [priority](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-priority.json) |
| Advertised MJPEG10 | 0/271 clean; first reported loss in first compressed decile for 284/309 buffers. | [10 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg10-lossmap.json) |
| Advertised MJPEG20 | 0/646 clean; maximum prefix progress 496 rows, zero last-eight-row candidates. | [20 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg20-lossmap.json) |
| Advertised MJPEG25 | 0/794 clean; maximum prefix progress 1040 rows, zero last-eight-row candidates. | [25 FPS](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg25-lossmap.json) |
| Actual 5-second cold photo attempt at requested 5 FPS | 13 buffers, 12 ImageIO-valid, zero clean; maximum prefix progress 224 rows. Failed, exit 2; complete cleanup 5.325 s. | [5-second burst](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-strictburst5.json) |
| H264 at requested 5 FPS, original bitrate | 13 buffers then receive queue retired on all-failed transfers; zero decoded frames, 24 decoder error lines. | [H2645](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-decode.json) |

No DRI restart interval was found in the parsed MJPEG candidates. Early
prototype raw RST byte-pair counts included metadata; the later marker walker
counts entropy markers only. Neither counter establishes restart recovery
without a valid DRI/sequence. The prefix progress and ring-wrap synthetic tests
pass together with 65,536 marker-length combinations under ASan/UBSan. These
tests validate the diagnostic, not physical image quality.

### Sonix vendor controls, same full-resolution hardware

GET_INFO/GET_LEN show extension units 3 and 4 matching the published Sonix GUIDs.
Unit 3 advertises 24 selectors but only 1–5 answered the capability queries;
unit 4 answered selectors 2, 3, 5, 6, 8. Its substream FPS selector 7 stalled and
frame-dropping selector 9 is not advertised. Do not send those undocumented
commands to this specimen. All video endpoints are isochronous; no advertised
bulk transport was found.
[Capability metadata](../../.artifacts/camera-availability-2026-10-18/uvc-extension-capabilities-detailed.json).

The published fixed chip-ID read handshake returns 0x92 and DRAM code 0x00,
matching SNC292A. It uses command-selection OUT requests, not a register data
write. No flash API is used. Initial readback: MJPEG 45,000,000 bps, H264
10,000,000 bps, H264 GOP 29 and mode 1 (CBR). This is observed protocol support
on the specimen, not a claim that unrelated Kurokesu/Arducam firmware is safe.
[Primary control implementation](https://github.com/Kurokesu/C1_SONIX_Test_AP/blob/master/sonix_xu_ctrls.c),
[specimen readback](../../.artifacts/camera-availability-2026-10-18/sonix-controls-after-gop.json).

| Vendor-control trial at requested 5 FPS | Result |
| --- | --- |
| MJPEG 8 Mbps | Readback exact; 0/121 clean; no last-eight-row candidates. Original 45 Mbps restored/read back. [Evidence](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-sonix8m.json). |
| MJPEG 4 Mbps | Readback exact; 3/125 clean, first 20.727 s; maximum prefix progress 928 rows. Original restored/read back. [Evidence](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg5-sonix4m.json). |
| H264 1 Mbps, original GOP | All 129 source buffers delivered over 35 s; 77 full-HD decoded frames, 41 decoder error lines. Substantial delivery improvement, not intact-frame qualification. Original 10 Mbps restored/read back. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1m-decode.json). |
| H264 1 Mbps, GOP 1 | Readbacks exact; 129 source buffers, 48 decoded full-HD frames, 176 decoder error lines. Original GOP 29/bitrate 10 Mbps restored/read back. Per-frame IDR/error-flag discrimination is still required before accepting any photo. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1mgop1-decode.json). |

Every completed trial restored Apple video interfaces 0/1/2 and kept Jabra
separate, default and at its preflight levels. All real and synthetic media
stayed in RAM. No persistent service, firmware or system-driver replacement is
installed. The following checks complete this bounded experiment cycle.

### H264 independent-frame checks and cold-start repeatability, 23:18–23:32

`research/arducam/ram-h264-check.c` replaces ffprobe's incomplete damage
reporting for these experiments. The unprivileged decoder accepts Annex-B over
a private pipe, retains numeric metadata only, and inspects actual 1920×1080
output, `decode_error_flags`, corrupt/discard/interlace flags, decoder errors,
and packet-to-frame association. An independently decodable IDR requires NAL
type 5 and conservative matching opaque metadata/PTS; an I-picture/keyframe
label alone is insufficient. Reported arrival time is monotonic stdin parser
availability, including lookahead/backpressure, not the sensor timestamp.
Source PTS is measured separately; these completed trials had no zero,
duplicate or regressing source values.

The checker passes 19 focused tests and twelve RAM-only integration cases:
valid full HD, fragmented input, B-frame delay, non-IDR I-pictures, malformed/
truncated input, wrong dimensions, oversized input and arrival gaps. The valid
sample produces 60 frames and four clean IDRs. Logs become numeric counters;
no raw decoder stderr or media is retained. Clean-IDR counts are a source
integrity screen, not pixel-level, face-quality or predictive-frame
certification. Whole-stream exit 1 can coexist with an individually clean IDR;
both must be reported.
[Implementation/test evidence](../../.artifacts/camera-availability-2026-10-18/h264-check-worker.txt),
[pinned physical-test binary](../../.artifacts/camera-availability-2026-10-18/h264-screen-build.sha256).

All settings below request full-HD H264 at 5 FPS, with a 1 Mbps bitrate setting.
Readbacks were exact; actual bandwidth is measured separately and is not
guaranteed by that setting. The preliminary GOP-5 ffprobe run decoded 64 frames
with 122 error lines, so it also required the stronger checker.

| Setting / window | Source buffers / decoded frames | Decoded frames with damage flags | Clean IDRs / result |
| --- | --- | --- | --- |
| CBR, GOP 1, 35 s | 129 / 34 | 32 | 0; fails. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1mgop1-idr-check.json). |
| CBR, GOP 5, 35 s | 129 / 55 | 50 | 0; fails. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1mgop5-idr-check.json). |
| VBR, GOP 1, original QP 25, 35 s | 7 / 4 | 4 | 0; queue exhausted on all-failed transfers. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1mgop1-vbr-idr-check.json). |
| VBR, GOP 1, QP 35, 35 s | 106 / 13 | 13 | 0; queue exhausted, maximum source gap 6.843 s. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1mgop1-vbr-qp35-idr-check.json). |
| CBR, original GOP 29, 35 s | 129 / 105 | 82 | 1 at 2.251 s, then no further clean IDR; maximum clean-IDR gap including the window end 33.214 s. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1m-idr-check.json). |
| CBR, original GOP 29, cold-start window 1 | 12 / 9 | 5 | 1 at 2.558 s; transport/release completed in 5.571 s. Individual still-supply screen passes, not whole-stream QA. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1m-cold5-1-idr-check.json). |
| Same cold-start window 2 | 13 / 7 | 4 | 0 within 5 s; repeatability fails. Transport/release completed in 5.335 s. [Evidence](../../.artifacts/camera-availability-2026-10-18/camera-h264-5-sonix1m-cold5-2-idr-check.json). |

The cold-start experiment tests whether the first independent frame can supply
on-demand stills despite later predictive-frame damage. It stopped after the
second window failed; this is not a 20-cycle qualification or a recovery pass.
The source prototype's `--h264-pipe --burst5` reports transport-only evidence;
the separate decoder owns image acceptance and its five-second arrival check.
The positive first frame is retained as a lead, not generalized to reliability.
The relaxed edge-defect policy does not rescue these failures: no conservative
face-safe damage bound has been demonstrated. The original 15-FPS video floor
is superseded; source corruption/repeatability, not low FPS, blocks deployment.

### Final runtime and device restoration, 23:32 Taipei

After the final cold-start check, MJPEG bitrate 45 Mbps, H264 bitrate 10 Mbps,
GOP 29 and mode 1 were read back. VBR QP 25 was restored before returning to CBR,
where the camera reports QP 0. All original UVC controls and Apple video
interfaces 0/1/2 were verified restored. The stamped production build verifies.
The normal LaunchAgent started PID 19470; fresh telemetry at 23:32:41–42 confirms
Dormant, wake-worker-ready and wake-worker-listening. There are zero camera,
reset or research capture helpers. The ownership shell exited 0 and released
its lease.

Jabra is the default input/output, unmuted, with output 0.0625 and input
0.5714285969734192 restored/read back. No persistent privileged service, system
driver or firmware was installed. App source retains the full-resolution
snapshot-cap fix; production source selection was not promoted as repaired.
Restart/reboot, avatar-active camera use and the 48-hour/200-request soak remain
unqualified because usable full-HD supply is not repeatable.
[Sonix readback](../../.artifacts/camera-availability-2026-10-18/sonix-controls-final-restored.json),
[runtime](../../.artifacts/camera-availability-2026-10-18/runtime-restored-full-resolution.json),
[audio](../../.artifacts/camera-availability-2026-10-18/audio-restored-full-resolution.json),
[UVC/Apple ownership](../../.artifacts/camera-availability-2026-10-18/uvc-controls-full-resolution-restored.json).
