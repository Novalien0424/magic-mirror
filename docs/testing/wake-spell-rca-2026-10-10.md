# Raven wake and spell RCA — 2026-10-10

Later investigation: [phrase-specific decoder search-width RCA and fix](wake-phrase-rca-2026-10-10.md).
The physical wake findings below are the earlier baseline, not the final state.

Scope: the deployed Mac, published Raven/Cedar, physical Jabra capture and
real-provider spell recognition. The operator is away. No human speech or
far-field acceptance is claimed. Raw audio, transcripts and private context stay
in RAM. Published device routing, spells, scenes, wake tuning and model IDs are
preserved. Prior media/conversation results remain in
[the conversation report](raven-conversation-qa-2026-10-09.md).

## Findings and fixes

| Finding | Evidence and causal boundary | Action |
|---|---|---|
| Physical QA skipped the Mac microphone permission path | Phase 4/smoke flags excluded the request despite Raven QA opening the native wake worker. A direct launch reported `not-determined`; the one-shot LaunchAgent launch reported `granted` and delivered nonzero Jabra samples. This does not prove production permission denial. | Include native Raven QA in the production permission policy; wait for the actual outcome. Add a one-shot LaunchAgent QA option matching deployment context, with no restart behavior. |
| Jabra self-playback is a poor wake stimulus in these tests | Jabra speaker -> Jabra mic produced lower energy and zero observed keyword tokens. Mac speaker -> Jabra mic produced peak about 0.11 and RMS about 0.024, with partial token matches but no wake. | Separate acoustic delivery from detector acceptance. Speakerphone echo cancellation is a plausible contributor, not a uniquely proven cause. Do not automatically change device preferences or thresholds. |
| Recognition fails on delivered physical PCM | Clean-source PCM matches all 12 tokens. Exact captured PCM misses both live and on fresh-detector replay. Rechunking, gain, speaker-tail hold and offline keyword-bias comparisons do not recover it. | The remaining boundary is captured waveform plus detector robustness. Do not label this a proven Jabra, resampling or threshold defect. Preserve production package/tuning pending representative human evidence. |
| Published Raven has no spells/scenes | Both avatar and legacy global collections were empty in the operator snapshot. | The application cannot trigger an unconfigured effect. Intended spells and approved scenes must be authored before production spell acceptance. QA uses one isolated mock fixture only. |
| Existing synthetic spell test failed at the ASR/exact-match boundary | A final transcript existed but did not exactly match. No scene was authorized. The SDK forwarded enabled-phrase hints, but the historical run did not retain server acknowledgement or mismatch-category evidence. | Add RAM-only script-equivalence/edit-distance diagnostics and server-acknowledged hint metadata before choosing a prompt repair. Preserve application exact authorization. |
| Several skills overstated the evidence | Stale guidance conflated silence with TCC denial, synthetic tests with physical acceptance, and future-Mac assumptions with this deployed Mac. | Correct wake, voice, roleplay, QA and Electron foundation references against code and primary docs. |
| Some QA ordering labels lacked explicit assertions | The fixture named announcement-tail and farewell-tail ordering, but the driver mainly checked scene count and final Dormant/released state. | Assert announcement completion before scene start and farewell completion before close, plus mic release before wake acquisition. Add bounded farewell-completed metadata and test its tail/interruption behavior. |

Jabra input and output were successfully set unmuted and read back unmuted.
CoreAudio showed Raven's wake worker using input and Electron's audio service
using output; Apple Music was open but not streaming. Dormant Raven is configured
to play ambience at combined app gain 0.06. This explains why Dormant can still
have an output stream; the exact audible content was not directly identified.

## Physical evidence

- [Initial read-only investigation and unmute](../../.artifacts/wake-spell-rca-2026-10-10/results.json).
- [Direct-launch permission result](../../.artifacts/phase4-qa/2026-10-09T23-41-54-016Z/wake-diagnostic.json).
- [LaunchAgent physical route matrix](../../.artifacts/phase4-qa/2026-10-09T23-43-47-087Z/wake-diagnostic.json):
  12 trials, six positive stimuli and six unrelated-speech controls. No detected
  wake or false wake. Jabra received fresh nonzero blocks on both speaker routes.
  The alternate Arducam input initially clipped and then delivered zero samples;
  it is not the production-selected microphone and was not substituted for Jabra.
- [Fresh detector/capture per stimulus](../../.artifacts/phase4-qa/2026-10-09T23-59-14-998Z/wake-diagnostic.json):
  six positive and six negative trials again yielded no detections. Detector
  carry-over does not explain this result.

The diagnostic uses production calibration on the existing sole wake owner.
Calibration retains capture after detections and suppresses conversation
activation; a calibration detection would therefore still need a normal
wake-to-Realtime handoff test. Polling detector snapshots can miss intermediate
scores; an observed maximum of five tokens does not prove a hard five-token
decoder limit. Energy proves signal delivery, not intelligible speech or the
speaker's physical placement.

[Native pipeline review](../../.artifacts/wake-spell-rca-2026-10-10/wake-detector-review.txt)
found no demonstrated application PCM conversion/coalesced-decoding bug. Native
scores describe token probabilities on a candidate, not a calibrated wake
confidence. Complete tokens and trailing blanks are separate detection criteria.
The bundled default phrase has nine tokens; Raven's derived keyword has 12.

The diagnostic was corrected to start a fresh detector/capture for every
stimulus, wait for fresh input, report per-trial decode deltas and keep paired
candidate token/score/blank measurements. `freshPolls` counts observations, not
unique audio samples. These changes remove misleading attribution without
changing production detector behavior.

### Exact captured-PCM comparisons

The replay probe releases the native worker, then captures using the same
`openWakeCapture` implementation in **Electron Main**. Main closes capture before
the worker reacquires. This isolates delivered PCM but does not reproduce the
worker process's scheduling exactly. No capture is written to disk or sent to a
cloud service. A successful diagnostic exit means measurements completed, not
that wake recognition passed.

| Controlled comparison | Observed result |
|---|---|
| [Original physical PCM](../../.artifacts/phase4-qa/2026-10-10T00-05-00-873Z/wake-replay.json), Mac speaker to Jabra | Live and exact fresh-detector replay both missed, with the same 5/12-token candidate and score. Fixed 1600-sample chunks also matched that result. Roughly 6.35x gain did not recover a wake. |
| [Speaker held open 2.5 s after drain](../../.artifacts/phase4-qa/2026-10-10T00-07-42-497Z/wake-replay.json) | Still missed. Positive source duration 1518 ms; drain 1565 ms. Delivered rate about 16002 Hz; zero native overruns/backpressure. An early speaker close or gross sample-rate relabeling is not supported by this comparison. |
| [Offline keyword bias 1 / 2 / 4](../../.artifacts/phase4-qa/2026-10-10T00-11-32-480Z/wake-replay.json), unchanged threshold 0.32 | All missed the same captured positive, with at most 4/12 matched tokens. Unrelated speech produced no wake. Production bias remains 1. |
| Clean source in each replay run | One detection, 12/12 tokens; unrelated speech zero detections. Physical runs are individual stimuli, not a human accuracy estimate. |

All three replay runs reported zero native overruns/backpressure. Live processing
took at most about 19 ms per 100 ms delivered block. This argues against observed
queue loss or sustained detector overload; it does not prove every upstream
buffer or the device itself was lossless. PCM peak around 0.10 and RMS around
0.013 were nonzero, without clipping in the delivered signal.

[Version-specific native capture research](../../.artifacts/wake-spell-rca-2026-10-10/native-audio-research.txt)
verified that installed decibri 5.7.0 captures the device's default format and
actually resamples Jabra's 32 kHz input to 16 kHz. Processing normalizes channels,
resamples, removes DC, applies the configured 80 Hz high-pass, then converts to
int16. VAD is disabled and does not gate these samples. The overrun counter must
be read before stop. The native-to-JS queue can still accumulate latency without
incrementing overruns; this short run did not demonstrate that failure. The
research also identified an error-path cleanup concern, but no matching runtime
error occurred, so no dependency patch is justified.
[Capture source](https://github.com/decibri/decibri/blob/npm-v5.7.0/crates/decibri/src/microphone.rs),
[Node binding](https://github.com/decibri/decibri/blob/npm-v5.7.0/bindings/node/src/lib.rs),
[JS stream implementation](https://github.com/decibri/decibri/blob/npm-v5.7.0/npm/decibri/src/decibri.js).

The causal conclusion is deliberately bounded: this delivered waveform is not
recognized under the tested detector configurations. Identical replay misses
weaken live state/chunk handling as explanations. They **do not** uniquely locate
the defect before the detector: acoustic/device processing, capture conditioning
and model robustness remain separable possibilities. Keyword bias preserves paths
in beam search; threshold gates a completed candidate. A high score on four tokens
is not a nearly accepted 12-token wake. See
[Sherpa's decoder documentation](https://k2-fsa.github.io/sherpa/onnx/kws/index.html).

## Real-provider spell and dialogue results

[Baseline run](../../.artifacts/phase4-qa/2026-10-09T23-48-32-480Z/raven-results.json):
eight completed ASR turns, no provider errors, no injected visitor text. Exact
spell recognition matched all eight normalized characters and triggered one
mock scene. Quoted/extended spells triggered none. Directed sleep returned to
Dormant with Realtime released. Retained telemetry puts spell announcement
completion before scene acceptance, and output completion before session close.
The newly strengthened in-driver timing assertions were added afterward; their
new farewell marker is unit-tested, not retrospectively present in this run.

[Final unchanged-prompt validation](../../.artifacts/phase4-qa/2026-10-10T00-12-40-375Z/raven-results.json)
ran the strengthened assertions successfully: exact recognition (edit distance
zero), one scene after announcement completion, farewell completion before close,
and Realtime mic release before wake acquisition. All runtime checks passed.
Eight ASR turns completed with no injected input text. One benign
`response_cancel_not_active` provider event was retained; no other provider error
occurred. Dialogue quality passed **6/8** turns, failing extended spell and
directed sleep, so the overall runner correctly exited 2. Both exact spell and
directed sleep showed two output-started responses, one matching the application
cue. The judge accepted the exact-spell turn in this run despite that count;
neither judge acceptance nor the count resolves final physical audibility.

Dialogue quality passed five of eight turns. The judge flagged extra
command-related output on extended spell, exact spell and directed sleep.
[Shorter-context comparison](../../.artifacts/phase4-qa/2026-10-09T23-53-32-758Z/raven-results.json)
again passed exact recognition and the scene/lifecycle checks, but quality
passed only three of eight turns. It still generated an extra response alongside
the exact application cue. The candidate removed prohibitory spell wording in
favor of contextual application ownership; it did not solve the failure and was
**reverted**. No new prompt restriction or model substitution is deployed.

The second run proves the outbound wire request contained the configured model,
three literal keywords including the fixture spell, `zh-tw`/`en` and medium
delay. The server response echoed model/languages but omitted keywords/delay.
That proves request serialization and incomplete echo; it does **not** prove
the service applied or ignored those hints. The previous mismatch cannot be
attributed to Simplified/Traditional conversion: both new exact turns had edit
distance zero, and old raw text was correctly discarded.

The probe's historical `audible` flag means the provider output buffer started
while media was inactive. It does not measure the final processed speaker signal
and can overstate audibility of interrupted/suppressed output. New control
diagnostics explicitly label this boundary. Judge findings establish generated
dialogue failures, not a recording or proof of what a person heard.

There is a concrete sequencing mechanism for the extra generated response:
Realtime VAD is configured to create responses automatically, while the scene
controller waits for the completed transcript before interrupting and requesting
the application cue. The earlier failed run recorded output starting 169 ms
before final transcription. A later exact match can therefore coexist with an
already-started response. This explains why exact recognition alone cannot prove
single-response dialogue. It does not establish that every flagged preamble was
physically heard. See the [code trace](../../.artifacts/wake-spell-rca-2026-10-10/spell-code-review.txt)
and [OpenAI VAD controls](https://developers.openai.com/api/docs/guides/realtime-vad).

## Proposed next fixes and remaining limits

1. Validate an actual human speaking at the mirror under its intended placement
   and ambience, using the selected Jabra. A speakerphone's own playback is not
   representative human acceptance. Physical placement and intelligibility
   cannot be confirmed while the operator is away. Reuse the RAM-only comparison
   if the human trial misses. If intelligible capture still fails KWS, qualify a
   tuning/model candidate against positive speech and unrelated/near-match speech;
   if speech delivery is poor, address the physical route first. None of the
   tested gain/bias changes is a supported production fix.
2. For command speech quality, measure the processed output's response ownership
   before interpreting buffer-start flags as heard speech. Then evaluate a
   compact prompt/tool protocol that gives the model a clear application handoff
   for incantations, against unchanged exact scene authority. Prompt-only silence
   cannot guarantee timing relative to independent final ASR. Do not add regex
   filters or delay every ordinary conversation turn to hide this race. The
   requested larger-model comparison remains unanswered; no runtime model IDs
   were changed.
3. Configure the operator's intended Raven spells and approved scenes. Do not
   promote the synthetic mock spell to production.

Relevant checks: 118 Node tests across seven files covering permission,
calibration, capture/worker/supervisor, Realtime session contracts and QA build
provenance pass; node/web typechecks and builds pass. The prompt/inspector
checks passed for the candidate after updating a stale literal assertion; the
candidate and those assertion edits were reverted. Changed skill frontmatters and
local links passed validation. Invariants 1, 7, 8, 9, 10, 11 and 12 were
directly examined; no cross-person memory or phase-acceptance claim is added.

## Reproduction

Preserve operator edits and stop normal Electron before QA. From the canonical
Mac workspace, build, then run:

```sh
npm run build
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario wake_diagnostic
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario wake_replay
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario sleep_spells
```

Run one Electron instance at a time. Each invocation copies only published
character/assets and creates isolated synthetic fixtures, never the operator's
identity database. The one-shot job has `KeepAlive: false`, a unique label and
cleanup on completion. Only an explicit environment allowlist enters its plist;
Main retains sole ownership of the ignored root `.env` credential source.
Restore the existing `com.magicmirror.launchagent` after QA.

At 2026-10-10 00:17 UTC, normal Raven was restored as PID 63129 under that job.
Main and both renderers were Ready, lifecycle Dormant, media index ready and wake
worker listening. Build provenance matches current source/output; all five
operator-settings hashes match the pre-investigation baseline.
[Deployment metadata](../../.artifacts/wake-spell-rca-2026-10-10/deployment.json),
[startup events](../../.artifacts/wake-spell-rca-2026-10-10/runtime-start-events.json).

## Prompt and authority boundary

Speech transcription and conversational audio understanding are different
provider paths. A dialogue response may precede the final transcript. Literal
`keywords` improve recognition hints but do not force an exact result. A short
transcription context can describe Taiwan Mandarin/English roleplay; it must not
instruct the recognizer to invent the expected spell. See
[OpenAI transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
and [voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting).

Exact whole-turn authorization remains in application code. No fuzzy spell
authorization, regex speech filter, additional conversational gate, threshold
reduction or model substitution is justified by the current evidence.

For Mac permissions use actual status and delivered capture on the launch chain
under test, as described by [Electron](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos).
Jabra documents echo cancellation and full duplex in its
[Speak2 75 specifications](https://www.jabra.com/_/media/Jabra_VXi_Product-Documentation/Jabra-Speak2-75/Technical-specifications/RevC/EN-Speak2-75-Tech-Spechs-180924.pdf);
those features support the DSP hypothesis but do not establish the cause of a
particular missed wake.
