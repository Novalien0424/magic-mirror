# Raven physical wake follow-up — 2026-10-10

This follows the [earlier wake/spell RCA](wake-spell-rca-2026-10-10.md).
The operator remains away; stimuli are synthesized speech through the Mac mini
speaker, captured by the physical Jabra Speak2 75. This is physical acoustic
evidence, not human or far-field acceptance. The existing LaunchAgent is stopped
during isolated QA and restored afterward. Production settings and model pins
are preserved. Conversation/audio/transcription data are RAM-only; retained
results contain metadata.

## Root cause found in paired audio

The application's four-path keyword decoder misses Raven's phrase on a captured
waveform that the same stock engine recognizes with a wider search. Model weights,
keyword tokens, threshold 0.32, bias 1 and input PCM are identical. Eight, 16 and
32 paths each detect the first paired positive once; four paths miss. Increasing keyword bias instead does
not recover it. This isolates the decoder search width as a causal parameter for
the reproduced miss. Beam pruning is the supported mechanism, not a microphone
permission failure or a malformed keyword.

[Paired search-width evidence](../../.artifacts/phase4-qa/2026-10-10T01-36-10-888Z/wake-replay.json)
includes one unrelated and two near-phrase physical negatives: all remain
undetected with eight paths. These few negatives do not establish an operating
false-wake rate. The package-default phrase also benefits from the wider search
in one of its physical captures; the issue is not exclusive to Raven's spelling.

An [eight-path fresh validation](../../.artifacts/phase4-qa/2026-10-10T01-39-14-301Z/wake-replay.json)
recovered both normal-rate Taiwan positives, but missed the slower Taiwan voice
and both mainland Mandarin cases. The [expanded paired comparison](../../.artifacts/phase4-qa/2026-10-10T01-45-29-413Z/wake-replay.json)
then tested five Raven positives, two default-phrase positives and three negatives.
Thirty-two paths recognized all seven positives and none of the negatives;
eight and 16 still missed both mainland Mandarin positives. Slow-voice results
varied between fresh captures, which is why the single earlier eight-path pass
was insufficient for deployment.

The production change is Mac-only `maxActivePaths: 32` in
[sherpa-detector.ts](../../src/main/wake/sherpa-detector.ts). Windows remains at
four pending Windows evidence. No model, dependency, public wake phrase,
threshold, keyword bias, prompt, regex dialogue filter or cloud wake fallback is
changed. Thirty-two is the smallest tested width covering that whole comparison.

Sherpa defines this parameter as the beam size for modified beam search;
keyword bias and final detection threshold serve different purposes.
[Upstream implementation](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.6/sherpa-onnx/csrc/keyword-spotter.cc),
[keyword-spotting design](https://k2-fsa.github.io/sherpa/onnx/kws/index.html).

## Discriminating controls

| Comparison | Result before the fix |
|---|---|
| [Two local TTS voices at normal/slower rates](../../.artifacts/phase4-qa/2026-10-10T01-26-59-305Z/wake-replay.json) | Five physical Raven positives, including one native-rate capture, all missed at four paths. All clean positives detected. |
| [Package-default keyword on the same physical route](../../.artifacts/phase4-qa/2026-10-10T01-33-07-049Z/wake-replay.json) | Default phrase detected with production-conditioned and raw/native input; Raven missed. This disproves a blanket inability of this route to deliver a recognizable wake. |
| Same raw 32 kHz capture converted independently by Apple | Raven still missed at four paths; default phrase detected. Decibri's resampler is not required for that failure. The microphone capture backend is still shared. |
| Stock npm engine vs instrumented native engine | Same baseline misses, with clean positives for both. An instrumentation-only failure is not supported. |
| Native 48 kHz stereo speaker format, one-second silence before/after speech, 2.5-second output tail | Four-path Raven misses persisted. No demonstrated output-format/startup repair. |
| [Public keyword review](../../.artifacts/wake-capture-2026-10-10/keyword-review.txt) | Correct dictionary pronunciation, 12 valid Raven tokens. Default keyword has nine tokens and matches its manifest hash. Partial-token counts do not identify an exact failed phoneme. |

Unhinted real-provider ASR uses the configured transcription model and verifies
the server acknowledgement before sending PCM. The unrelated captured sentence
agreed with its clean source. Raven's uncommon name varied even in clean-source
ASR; physical results generally differed in pronunciation too. ASR therefore did
not independently prove accurate capture of this phrase and did not justify
rewriting its pronunciation. Clean and captured sessions have no shared context
or expected-phrase hints. Only `wake_capture` uploads bounded audio for this
explicitly authorized diagnostic; `wake_replay` and `wake_control` remain local.
[OpenAI transcription session contract](https://developers.openai.com/api/docs/guides/realtime-transcription).

## Diagnostic repairs

- Pin the resolved native input; an unmatched explicit label fails visibly.
- Wait for one second of delivered input before playback. The earlier fixed
  750 ms startup wait was too close to the observed first-block delay.
- Await raw stream EOF before freezing captured PCM. The first two new raw runs
  counted late flush samples after making their replay snapshot, invalidating
  their raw rate/count accounting. They remain retained as failed diagnostic
  evidence; use the later corrected runs for those measurements.
- Keep the stock engine's clean positive control alongside its captured test.
- Add Apple's independent RAM-only conversion and fingerprint that Swift helper
  in build provenance. A one-second 1 kHz tone at 22.05/32/48 kHz converts to
  exactly 16,000 samples with the expected frequency and RMS.
- Route acoustic visitor stimuli from the separate Mac speaker during Raven's
  loop/wake conversation test. Raven's own configured output remains unchanged.
  The first browser-routed attempt could not resolve the native speaker name;
  the corrected driver uses the already verified native output path instead.

The first two raw-accounting runs are
[01:17](../../.artifacts/phase4-qa/2026-10-10T01-17-42-936Z/wake-replay.json) and
[01:20](../../.artifacts/phase4-qa/2026-10-10T01-20-51-128Z/wake-replay.json).
The [01:24 run](../../.artifacts/phase4-qa/2026-10-10T01-24-48-653Z/wake-replay.json)
includes the EOF fix. Speaker underrun totals include startup/terminal empty
queues; they are not proof of a gap during the utterance.

Apple's sample-rate conversion uses its input-block converter, not the simple
format-only overload. [Apple TN3136](https://developer.apple.com/documentation/technotes/tn3136-avaudioconverter-performing-sample-rate-conversions).

## Validation and remaining limits

The [final 32-path physical run](../../.artifacts/phase4-qa/2026-10-10T01-48-37-773Z/wake-replay.json)
passed all ten cases: five Raven positives, two package-default positives and
three negatives. Four Raven voice/rate combinations detected live; the fifth
Raven positive was native-rate capture followed by RAM replay. Each positive
detected once, and each negative zero times. Peak live processing was 18.7 ms per
100 ms block; all native overrun/backpressure counters were zero.
[Validation summary](../../.artifacts/wake-capture-2026-10-10/final-acoustic-validation.json).

Two loop/conversation attempts also found diagnostic defects before any acoustic
stimulus played: [browser output resolution](../../.artifacts/phase4-qa/2026-10-10T01-42-16-714Z/raven-results.json)
and [checking microphone readiness too early](../../.artifacts/phase4-qa/2026-10-10T01-51-12-186Z/raven-results.json).
In the second run, acquisition started at 01:51:31.695Z and listening was reported
786 ms later. A media-selection assertion failed before the usual loop readiness
wait, so the next step sampled the legitimate acquisition transition. The driver
now awaits fresh native input before playback and skips a dependent dialogue
turn if operator recovery itself failed. These runs retain the separate
media-selection/ASR/preamble quality failures; they do not establish wake failure
because the stimulus was never played.

The [first executable loop wake run](../../.artifacts/phase4-qa/2026-10-10T01-55-02-276Z/raven-results.json)
played the correct loop, delivered the physical wake stimulus and received 57
fresh input blocks, but detected no wake. Another run had ambiguous media
selection and never started its loop; that is a separate conversation/fixture
failure, not a physical wake result.

The [paired audible/muted run](../../.artifacts/phase4-qa/2026-10-10T02-04-10-614Z/raven-results.json)
missed both attempts. A later [exact-source comparison](../../.artifacts/phase4-qa/2026-10-10T02-11-26-241Z/raven-results.json)
verified matching configured phrases, a clean-source detection and the expected
1518 ms source duration. It missed with audible media, then detected once with
media muted. Telemetry records worker release, media stop and activation at
02:12:28.633Z, followed by Realtime Active at 02:12:31.166Z. This supports a
playback contribution but does not prove that all remaining misses have one
cause. Human placement/voice and an operating accuracy rate remain unmeasured.

Self-audit found two further QA defects in that last run. The observer relied on
`connectionstatechange` to clear old response/tool counters, although a local
`RTCPeerConnection.close()` does not emit that event. Stale counters could time
out a valid new session. The observer now clears them explicitly on close and
new connection, with a regression test.
[WebRTC close algorithm](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-close).
The experimental fallback then attempted to reacquire wake capture after the
successful activation. The isolated run was terminated, its incomplete evidence
retained, and that fallback removed. The current diagnostic requires Dormant
and never refreshes/acquires a worker during Active. The renderer input in this
QA mode is synthetic; no two-physical-microphone acceptance is claimed.

The [playback/capture review](../../.artifacts/wake-capture-2026-10-10/music-capture-review.txt)
confirms that native wake does not inherit the closed Realtime browser's echo
cancellation. The current capture has none enabled. Installed decibri 5.7.0
supports `aec: 'tau'` and `pushAecReference()`, but enabling the option alone
passes input through when no reference is supplied. Any candidate must deliver
actual post-gain playback PCM in played order, with matching dtype/rate/channels,
to the existing wake owner, entirely in RAM. This is a researched proposal, not
an implemented or validated echo-cancellation fix. The OS default input/output
and app default routing were Jabra; the synthetic visitor speaker was explicitly
Mac mini Speakers. Both remained unmuted. No playback-volume cap was imposed.

The [final observer/handoff run](../../.artifacts/phase4-qa/2026-10-10T02-17-09-319Z/raven-results.json)
passes loop playback, the **muted-media** physical wake/handoff, wake-owner
release, the resumed spoken conversation and cleanup. The audible-loop wake
still fails (zero detections); muting yields one detection. Both use the same
1518 ms, clean-detectable stimulus and configured phrase. Two real ASR turns
complete with zero text injection and no provider errors. The post-wake reply
passes the quality judge; the original loop request still fails tool-preamble
quality. Overall exit is correctly **2**, not an acceptance pass. This also
confirms the observer repair against the real session-close/reopen sequence.

Focused checks pass:
59 tests across eight files covering detector/capture, worker/supervisor,
activation, diagnostic cloud boundaries, QA probe and build provenance. The
separate keyword/compiler checks also pass. Node typecheck and the build pass.
No full suite or overlapping Electron instance was run.

The built fix is restored through the existing `com.magicmirror.launchagent`,
PID **71712**. Main and both renderers are Ready, Raven is Dormant, the media
index is ready and the native wake worker is listening. All five operator
settings hashes match the baseline. The build stamp matches source/output.
[Deployment metadata](../../.artifacts/wake-capture-2026-10-10/deployment.json),
[startup events](../../.artifacts/wake-capture-2026-10-10/runtime-start-events.json).

The operational false-wake rate, actual human voice/distance and intended
placement still require human samples. Wake during audible looping media remains
unaccepted. The next targeted candidate is playback-reference AEC in the existing
native owner, qualified on paired audible-loop positives/negatives and checked
for CPU/drop behavior; the reference must cover actual output, including the
separate YouTube playback surface, rather than only a synthetic tone. An AEC flag
without that reference is not a fix. This investigation does not clear the
earlier spell/conversation-quality failures or populate production spells/scenes.
Invariants directly checked: 1, 7, 8, 9, 10, 11 and 12.

## Reproduction

Preserve operator edits, stop the ordinary LaunchAgent and rebuild before QA.
Run modes serially from the canonical Mac checkout:

```sh
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario wake_control
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario wake_capture
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario local_loop
```

`wake_capture` requires real-provider authorization. Diagnostic mode exit zero
means measurements completed; inspect detection counts. `local_loop` asserts
the wake event, conversation activation and media dismissal. Restore the existing
production LaunchAgent after QA. It remains the sole restart owner.
