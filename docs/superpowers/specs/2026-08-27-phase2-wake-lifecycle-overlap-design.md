# Phase 2 Wake Lifecycle Overlap Design

**Status:** Approved by the user on 2026-08-27. Phase 2 engineering may proceed
while Phase 1 physical evidence is pending; neither phase may be accepted from
mock or unattended evidence.

## Outcome

While Dormant, a Main-owned local worker listens for the replaceable,
versioned default wake phrase `魔鏡阿魔鏡`. A detection immediately presents Waking, explicitly
releases the worker microphone, then starts the existing renderer-owned OpenAI
Realtime conversation. Idle, the exact full command `睡吧`, and manual stop
close Realtime, stop every renderer media track, reacquire the wake microphone,
and only then return to Dormant.

## Phase and evidence boundary

- Preserve a Phase 1 candidate commit before wake runtime changes.
- Develop Phase 2 on `phase2-wake-lifecycle` from that candidate.
- Human verification is one scheduled session with two exact builds: Phase 1
  first, then Phase 2.
- Phase 1 may be tagged only from the Phase 1 build after P1-D1/D2/D5 pass.
- Phase 2 may be tagged only after P2-D1 through P2-D5 and the target-Mac
  checkpoint pass. Windows evidence cannot claim macOS TCC, signing, native
  worker packaging, LaunchAgent, or power behavior.

## Detector selection and training

The target is a Mac mini M4 and the requirement is measured quality, not a
preselected library. Phase 2 evaluates two bounded Mandarin candidates on the
same corpus and deploys only the configured winner:

- Picovoice Porcupine 4.x: phrase-specific Mandarin `.ppn` training,
  macOS arm64 runtime, sensitivity tuning, and vendor-reported high accuracy.
  It requires a Picovoice AccessKey and a platform-specific trained artifact.
- sherpa-onnx >=1.13.5: local Chinese/Chinese-English Zipformer KWS with
  instant phrase replacement through `text2token`, no service key, and an
  official WenetSpeech training recipe when deeper retraining is justified.

openWakeWord is excluded: its upstream documentation remains English-first and
its current issue tracker reports native macOS arm64 TFLite unavailability and
near-zero ONNX scores. Vendor claims do not select the winner. The same target-
Mac corpus measures false rejects, false accepts, detection latency, CPU, and
long-run stability at tuned operating points.

A Wake Model Package is replaceable as one atomic version. Its manifest binds
engine, engine version, phrase, `zh-CN`, `darwin-arm64`, artifact hashes,
tuning, training/import provenance, and corpus result ID. Porcupine packages
are trained in the official Console/model API then imported; sherpa packages
are compiled locally and may later carry a separately trained compatible
model. Runtime never silently falls back to the other engine.

## Runtime design

The existing XState lifecycle remains the only lifecycle. One narrow wake
supervisor in Electron Main owns one Electron utility process; it is not a
general worker framework. The worker owns capture only in Dormant/OfflineLoop,
performs local keyword spotting with the Published detector, persists no audio, and exchanges
only validated metadata commands and outcomes.

The handoff is an explicit two-way protocol:

1. Worker detects -> Main enters Activating -> worker releases -> renderer
   acquires -> existing Realtime start reaches Active.
2. Stop/idle/sleep -> renderer closes and stops tracks -> worker acquires ->
   Main sends `MEDIA_CLOSED` -> Dormant.

A release/acquire failure is `LOCAL_AUDIO_FAILED` and Maintenance. A cloud
failure remains OfflineLoop. Worker crash gets one restart; a second failure is
Maintenance. There is no simultaneous owner, continuous Active wake detector,
audio arbitrator, duplicate Realtime controller, or silent fallback.

## Configuration and privacy

Versioned config retains `wake.phrase` and `wake.modelVersion` and adds one
model-package reference. Engine-specific tuning lives in the immutable package
manifest rather than accumulating environment knobs. Old configs migrate
without losing values. The phrase/package is configurable through existing
Draft/Publish; invalid or phrase-mismatched packages never replace Active. The
worker model and assets are versioned resources resolved through
`process.resourcesPath` when packaged.

Conversation transcripts/audio remain RAM-only. The sleep matcher runs on a
completed renderer transcript and sends only a payload-free control request.
Wake events record keyword configuration, counts, timings, statuses, and
bounded reasons; sherpa-onnx exposes no per-event confidence and none is
invented.

## Scope limits

Use exactly one capture backend after a real load check. The two detector
adapters exist only to run the demanded quality comparison and explicit
operator selection; only one is active. Do not add an automatic fallback,
Python runtime and Node runtime together, automatic tuning, multi-device routing, camera/addressee
gates, speaker diarization, voiceprint, raw audio diagnostics, Phase 3 avatar
work, or Phase 7 endurance gates. The system-default microphone is the Phase 2
baseline; add device selection only if physical evidence proves it necessary.

## Research basis

- https://picovoice.ai/docs/porcupine/
- https://picovoice.ai/docs/api/porcupine-nodejs/
- https://picovoice.ai/docs/benchmark/wake-word-porcupine/
- https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html
- https://github.com/dscripka/openWakeWord/issues/309
- https://github.com/dscripka/openWakeWord/issues/336
