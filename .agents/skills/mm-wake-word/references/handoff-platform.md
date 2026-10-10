# Physical wake RCA and microphone handoff

Mac is the canonical Raven deployment target. Inspect the actual input route and
loaded implementation; historical Windows or synthetic results do not establish
physical Mac acceptance.

## Locate the failed boundary

| Boundary | Useful evidence | What it does not establish |
|---|---|---|
| Native capture | Selected input route, mute/gain, increasing blocks, fresh `lastBlockAgeMs`, peak/RMS from the existing owner | An open stream or running process does not prove delivered speech; energy alone does not identify the phrase |
| Permissions | Actual `getMediaAccessStatus('microphone')`, request outcome and launched app/helper identity | A QA helper's assumed `granted` result or silent PCM does not prove OS permission status |
| Acoustic delivery | Output route, stimulus timing, fresh native level change during the stimulus and physical audibility when available | A playback callback does not prove sound reached the microphone; speakerphone echo cancellation remains a hypothesis without comparison evidence |
| Detector | Loaded native module/package, compiled tokens/tuning, match/reset on known RAM-only PCM | One synthetic positive/negative does not establish a physical accuracy rate or explain a missed acoustic attempt |
| Lifecycle/handoff | Worker event, Main acceptance, release acknowledgement, renderer acquisition and session identity | A detector match alone does not prove conversation activation; a failed wake module does not by itself mean Maintenance |

[Capture](../../../../src/main/wake/capture.ts) uses `decibri` at 16 kHz, mono
int16 with DC removal and an 80 Hz high-pass. [Worker](../../../../src/main/wake/worker.ts)
`input_activity` reports blocks and conditioned peak/RMS; [supervisor](../../../../src/main/wake/supervisor.ts)
projects freshness, `waiting`, `silent`, `signal`, `stalled` and recovery. Its
`silent` label is a level threshold, not a TCC verdict. Missing/stale blocks,
fresh low-energy blocks and fresh signal with no match are separate findings.
Use these metadata from the current owner when capture is authorized; a second
diagnostic microphone would change the ownership/device conditions.

For an authorized capture/replay diagnostic, explicitly release that owner before
opening the same capture implementation elsewhere, and close it before restoring
the worker. Keep bounded PCM in RAM, record the capture process, and replay the
identical samples/configuration before changing gain, chunking or keyword bias.
Identical live/replay misses localize the result to the delivered waveform plus
detector configuration; they do not distinguish device DSP, room acoustics,
conversion or model robustness. Clean-source success alone cannot do that either.

Installed decibri 5.7.0 captures the device default format and resamples to the
requested format. At Jabra's 32 kHz, `framesPerBuffer: 1600` requests 50 ms native
buffers while reblocking delivered 16 kHz PCM into 100 ms chunks. Read native
`overrunCount` before stop; stop clears it. `backpressure` counts Readable pressure,
not lost samples. Zero counters do not exclude native-to-JS queue latency; compare
sample totals, delivery timing and processing duration as well. These are
[version-specific source findings](https://github.com/decibri/decibri/blob/npm-v5.7.0/crates/decibri/src/microphone.rs),
not permission or human-accuracy evidence.

## macOS permission and QA boundary

[Main](../../../../src/main/index.ts) requests microphone access before native
wake capture. [Permission policy/helper](../../../../src/main/wake/microphone-permission.ts)
now uses `needsWakeMicrophonePermission`, with normal Mac operation and Raven's
`nativeWakeQa` included. The failed-run baseline excluded Phase 4 QA; that dated
finding does not describe this subsequent source change or prove runtime access.
The helper still returns `granted` when `required` is false, without querying TCC.
Real microphone QA must use the production permission/status path, or explicitly
report bypassed coverage as unproven. Synthetic renderer input does not exempt
native wake capture in the same run. See [QA evidence modes](../../mm-ui-qa/references/modes.md).

Check the launched bundle's `NSMicrophoneUsageDescription`, signing/helper
identity and applicable audio-input entitlement when diagnosing packaging or
TCC. Do not assume every launch is attributed to Terminal or to the nearest
signed ancestor. A grant for one launch identity does not establish another's
access. Confirm denial from permission evidence rather than silence, and keep
permission, device, resampling, stalled-delivery and detector failures distinct.
[Electron permission API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesgetmediaaccessstatusmediatype),
[Apple usage description](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription),
[Apple audio-input entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input).

## Mic Handoff (invariant #8)

Normal wake capture holds the mic in Dormant/OfflineLoop. On detection: worker closes its stream
and confirms release -> Main tells renderer to acquire -> Realtime session
owns mic. Reverse on Suspending/OfflineLoop - and note the Realtime SDK's
`close()` does NOT stop app-owned mic tracks: the renderer must `track.stop()`
each track before Main hands the mic back. Retained tracks violate ownership;
whether the device reports busy depends on the backend. Handoff failure is a
local audio fault -> Maintenance, rather than a cloud OfflineLoop failure.
During Active the worker must not reopen the mic. The active
avatar's exact wake phrase may stop its running scene through the transcript
controller; it does not start a second wake listener or request sleep.

The Active-only sleep command uses the current avatar configuration and directed-intent contract, never a wake keyword. Preserve the configured exact farewell; reject quoted, negated, hypothetical or incidental mentions. After goodbye playback completes,
Main owns the payload-free transition back to Dormant and the release-then-
acquire mic handoff.

Unexpected worker exit has one restart in the supervisor; recoverable device
failures have a separate wait/retry path. `setWakeRuntimeStatus` records module
health without changing lifecycle; [boot handoff failures](../../../../src/main/boot.ts)
raise `LOCAL_AUDIO_FAILED`. Do not equate every worker failure with a whole-app
restart or Maintenance. Calibration detection deliberately retains its capture
for measurement, unlike normal wake activation.

## Native version evidence

As checked 2026-10-10, installed `sherpa-onnx-node` and `sherpa-onnx-darwin-arm64`
are both 1.13.6. [Detector module resolution](../../../../src/main/wake/sherpa-detector.ts)
can select a separate packaged/development score extension before the npm
binding. Check the resolved module and platform binary, not just a package label.

[Upstream issue #3791](https://github.com/k2-fsa/sherpa-onnx/issues/3791) reports a
1.13.4/ORT 1.27.0 zipformer convolution regression on SME-capable Apple Silicon,
with a working ORT 1.27.1 comparison. [Release 1.13.5](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.5)
includes ORT and macOS signature fixes. This is a bounded historical failure,
not a claim that all KWS misses share that cause or authority to change pins.

## Dated diagnostic evidence

The [2026-10-10 RCA](../../../../docs/testing/wake-spell-rca-2026-10-10.md)
separates the earlier unmeasured speaker attempts from a later LaunchAgent run
with granted permission and fresh nonzero Jabra input. Clean PCM recognized the
phrase; the physical route did not. Snapshot polling can miss intermediate
scores, so observed partial-token maxima are not a hard decoder limit. Neither
that result nor a speakerphone's documented echo cancellation establishes human
far-field accuracy. Use the report's route-specific evidence and current runtime
state; do not turn a dated hypothesis into a general skill rule.
