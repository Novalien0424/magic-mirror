# Camera reliability investigation — 2026-10-13

The owner requested a fix for the camera reliability failures after the
[awake-only lifecycle change](camera-avatar-lifecycle-2026-10-13.md). TV-off
physical testing remains authorized; the installed TV policy, production model,
published Raven persona and seven-tool design are preserved.

## Result and retained changes

The underlying stream is **not repaired** by the tested software alternatives.
The Mac's UVC driver reports large numbers of invalid video payloads and only a
few complete frames. This locates a failure below application image reasoning;
it does not distinguish camera firmware, USB transport or Apple's driver as the
ultimate cause. Reset receipts do not establish recovered video.

Two application failure paths are fixed in `src/main/camera/tracker.ts`:

- An image request arriving between a failed worker's exit and replacement now
  joins the existing bounded recovery instead of failing immediately. Concurrent
  requests remain rejected and shutdown cancels the wait.
- Exhausting the USB budget settles pending captures and rejects new ones
  promptly, without another 15-second recovery timeout. Fresh frames permit
  capture again; the two-attempt budget still requires 30 seconds of sustained
  frames before rearming. Exhaustion disarms the stale-frame deadline, avoiding
  repeated attempts to schedule an unavailable reset.

The native helper reports each AVFoundation frame-drop reason at most once per
worker. Main reports these diagnostics without discarding otherwise fresh gaze
or resetting a delivering stream. No frame contents or device identifiers enter
diagnostics. Native QA stops its six-snapshot phase after the first unsuccessful
request, since later successes cannot rescue that phase.

The versioned camera tool now briefly describes its visual capability and says
to call it before answering a request to look at current surroundings. No tool,
model override, transcript-triggered tool execution or speech filter is added.
Physical QA separately judges, in RAM, whether the microphone transcription
preserved the camera/object request; only two booleans are retained. ASR remains
a diagnostic proxy, not proof of what the audio-native model understood.

## Hardware experiments

All runs use the canonical, stamped checkout through the isolated LaunchAgent.
Each table row is a changed hypothesis, not an unchanged retry. All seven native
runs fail the required six sustained baseline snapshots; the deliberate-stall
phase therefore does not execute. Images remain in RAM and are discarded.

| Archive case | Run ID (2026-10-12 UTC) | Baseline snapshots | Finding |
| --- | --- | --- | --- |
| native-initial | 19-02-17-495Z | 3/6 | Skipping repeated device discovery does not eliminate stalls. |
| native-yuy2 | 19-04-43-467Z | 2/6 | Native YUY2 output instead of NV12 conversion still stalls. |
| native-thirty | 19-08-29-614Z | 0/6 | Advertised near-30-fps mode still rejects USB payloads. |
| native-bus-reset | 19-11-27-025Z | 2/6 | Device-level `ResetDevice` plus re-enumeration still stalls. |
| native-uyvy | 19-13-00-773Z | 0/6 | Alternate format selects MJPEG in the UVC driver and still stalls. |
| native-worker | 19-14-57-123Z | 1/6 | Fresh helper trial exposes the request-during-restart gap. |
| native-worker-gap | 19-16-25-564Z | 3/6 | After fixing that gap, fresh helpers still fail sustained delivery. |

The unsuccessful discovery, format, rate, bus-reset and forced-helper-replacement
trials are reverted. Production keeps its earlier VGA YUY2 input, exact
near-15-fps interval, NV12 output and targeted USB re-enumeration path. No hub,
system camera service or unrelated USB device is reset. No manual unplug/replug
is requested. The latest failed native experiment measures reset initiation
2.709 seconds after the last frame and first fresh frame 2.969 seconds later,
but the stream subsequently stalls again.

`uvc-stream-counters.json` retains only timestamps and numeric driver counters:
all 20 collected stream summaries report invalid payloads. The 30-fps trial's
driver interval was 333333, confirming the trial actually changed negotiation.
Camera format enumeration is retained without unique identifiers. No dropped-
frame callback was reported in the failed native runs; this is consistent with
rejection before frames reach AVFoundation, not proof that no frames were lost.

## Realtime and checks

- Initial physical run: **7/8**, exit 2, `raven_qa_camera_not_called`.
  Its ASR language classification is null, so the missing call alone does not
  establish a prompt fault. All three awake/asleep ownership checks pass.
- Final prompt, virtual-microphone and synthetic-image run: **5/5**, exit 0.
  The actual configured Realtime model calls the camera and passes all four
  image-grounding criteria. This is one sample, not a reliability rate or
  physical-camera acceptance.
- Final physical run (`19-20-05-173Z`): **7/8**, exit 2. Both transcription
  criteria pass and Raven calls `capture_camera`, but Main cannot supply an
  image (`raven_qa_camera_not_added`). USB recovery is exhausted. There is no
  extra snapshot/recovery timeout in this run. All three lifecycle assertions,
  Jabra route, release and provider-error checks pass. Across this session's two
  physical runs, all six ownership assertions pass; neither image turn passes.
- Full `npm test`: **2,040 passed, 1 skipped**, 183 passing files, exit 0 in
  72.26 seconds, including sequential Electron smoke/Phase 0 integration.

The initial Swift build failure was a typed constant in a `switch` expression;
using explicit equality checks fixes it. The failed build log is retained.
The existing focused suite passed 118 tests before the final two recovery
regressions. The final camera suite passes 42 tests; both TypeScript projects
and the final build pass. Source/output verification, both edited skills and
whitespace checks pass. The final scoped diff was reviewed.

## Research and evidence

OpenAI recommends explicit tool-use conditions consistent with the advertised
tools. The camera catalog change follows that guidance without expanding the
tool list or session prompt sections. [OpenAI Realtime Prompting Guide](https://developers.openai.com/cookbook/examples/realtime_prompting_guide).

Apple documents dropped-frame reasons and warns that slow processing or held
capture buffers can drop frames. The new diagnostics distinguish those cases;
the captured UVC payload counters are a separate local observation.
[Apple TN2445](https://developer.apple.com/library/archive/technotes/tn2445/_index.html).
The installed macOS SDK's `IOUSBLib.h` distinguishes device reset from
re-enumeration; their unsuccessful comparison is measured above, not a claim
that either guarantees physical power cycling.

[Metadata and full check logs](../../.artifacts/camera-reliability-2026-10-13/)
retain failed experiments separately. No transcript, conversation audio, images,
private memory or credentials are archived. Every reviewed run has zero
screenshots. The [manifest](../../.artifacts/camera-reliability-2026-10-13/manifest.json)
verifies all 70 archived files byte-for-byte.
All ten completed scratch runs were reviewed and removed through the marked
QA-artifact helper after archival; unrelated artifacts remain untouched.

At **03:24 Taipei**, normal Raven and the native camera worker are stopped.
Published and draft config hashes still match the original v17 bytes. The
installed TV host/display policy and `KeepAlive={SuccessfulExit=false}` are
unchanged. Root ADB PID 4320 and audio-prefer PID 1048 remain running. No phase
acceptance, model/persona promotion or human/portrait/soak acceptance is claimed.
The next camera investigation must address the invalid UVC payloads; none of
the tested application reset/format alternatives qualifies as a fix for that
underlying stream failure.
