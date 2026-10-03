# Per-avatar realtime voice changer — research and proposed plan

Date: 2026-09-09, Asia/Taipei. Status: research/proposal, not approved runtime
architecture, implementation, dependency selection, or Mac acceptance.

Execution follows AGENTS.md: direct, sequential work and proportionate checks.
No automatic delegation, commits, dependency installs, or phase promotion.

## Recommendation

Build one **Voice Studio** for public avatar profiles, with two independently
selectable layers:

1. **Character effects:** Signalsmith Stretch WASM/AudioWorklet for independent
   pitch/formant shaping, plus a small Web Audio effects rack. This is the
   recommended first implementation candidate: cross-platform, no neural voice
   training, and a comparatively small integration surface.
2. **Neural identity conversion:** a warm local RVC worker, evaluated on the
   actual Mac before committing to its backend. Compare a source-auditable
   w-okada/RVC baseline with Apple-native MLX RVC after its license/provenance
   check. Keep backend-specific controls visible, not fake universal sliders.

These layers are complementary. DSP can make a voice deeper, brighter, metallic
or cavernous; it cannot reliably invent the identity of a particular voice actor.
RVC needs an appropriate target voice model. Keep the current conversational
provider; this proposal is not an STT/LLM/TTS replacement.

Working assumption: process **outgoing AI speech**, one active public avatar at
a time. Visitor microphone conversion, training tools, third-party app routing,
and replacing the conversational model are outside the initial scope. The
operator has been asked to confirm output scope and exact Mac/RAM configuration.

## Hardware and evidence boundary

- M4 is the immediate target. The exact M4/Pro, RAM, OS and output device remain
  unconfirmed. Test an existing 16 GB base M4 if that is the deployment machine;
  do not assume a Pro/Max benchmark applies to it. A 24 GB machine offers a more
  comfortable experimental memory budget, but is not a measured requirement or
  a reason to buy hardware before the spike.
- Apple announced M6/M5 Pro Mac mini on August 25, with availability beginning
  September 22. M6 is a real announced target, but this research establishes no
  voice-conversion benchmark on it. Re-run the same acceptance suite on M6 and
  its shipping OS. Do not translate advertised AI speedups into voice latency.
  [Apple announcement](https://www.apple.com/newsroom/2026/08/apple-unveils-a-more-powerful-mac-mini-featuring-the-all-new-m6-and-m5-pro/),
  [current specifications](https://www.apple.com/mac-mini/specs/).
- This session has a Windows workspace, not an attached Mac test host. All
  upstream performance below is author-reported, not reproduced here. Source
  inspection establishes credible runnable candidates, not our Mac acceptance.
- MLX documents native Python >=3.10 and macOS >=14.0; the selected project's
  lockfile and native wheels may narrow that compatibility. Use arm64 Python,
  not a Rosetta environment. [MLX installation](https://ml-explore.github.io/mlx/build/html/install.html).

## Shortlist and evidence quality

| Candidate | What the primary source establishes | Decision |
| --- | --- | --- |
| Signalsmith Stretch | MIT; C++ pitch/time processing, formant adjustment, explicit latency/reset/flush APIs; official WASM/AudioWorklet release; Mac compiler testing | First DSP candidate. Validate actual Electron live-stream behavior and latency. Not neural speaker conversion. |
| w-okada voice-changer / RVC | Mac Apple Silicon distributions, realtime client/server operation and RVC support; source tree has MIT notices | Practical comparison baseline. Pin source and binary separately; current v.2 root is principally distribution/docs, not proof that the whole delivered binary is auditable from that tree. |
| tizee/rvc-mlx-realtime | Apple-native streaming RVC; MLX runtime, headless CLI, SOLA stitching; target RVC v2 40 kHz/RMVPE | Promising MLX streaming candidate, **license clarification required before incorporating its code**. M5 evidence only. |
| Acelogic RVC-MLX | MLX inference engine; author reports 1.27 s conversion of a 13.5 s clip; package metadata declares MIT | Candidate underlying engine, after notices/provenance audit. Whole-file throughput does not establish low-latency streaming. |
| Seed-VC | Apple Silicon install path; zero-shot reference-voice conversion; separate realtime tiny model | Secondary experiment if reference-only voices are essential. Published realtime example is RTX 3060 Laptop, not M4. GPL-3.0 code. |
| acrossoffwest/Voicebox | Mac-oriented RVC source, MIT file, realtime GUI/CLI; author lists M3/M4 ~300–370 ms | Useful implementation comparison, not selected core. README also describes a 384 ms accumulation window and a placeholder release link; numbers need measurement before trust. |
| Rubber Band | Mac builds, pitch/time processing, GPL-2.0-or-later or commercial licensing | DSP alternative if listening tests favor it. More packaging/license work than the MIT-first route. |

Primary sources:
[Signalsmith](https://github.com/Signalsmith-Audio/signalsmith-stretch),
[its Web Audio source](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/main/web/web-wrapper.js),
[w-okada](https://github.com/w-okada/voice-changer),
[v.2 tree](https://github.com/w-okada/voice-changer/tree/v.2),
[tizee](https://github.com/tizee/rvc-mlx-realtime),
[Acelogic](https://github.com/Acelogic/Retrieval-based-Voice-Conversion-MLX),
[Acelogic license declaration](https://github.com/Acelogic/Retrieval-based-Voice-Conversion-MLX/blob/main/pyproject.toml),
[Seed-VC](https://github.com/Plachtaa/seed-vc),
[Seed license](https://github.com/Plachtaa/seed-vc/blob/main/LICENSE),
[Voicebox](https://github.com/acrossoffwest/Voicebox),
[Voicebox license](https://github.com/acrossoffwest/Voicebox/blob/main/LICENSE),
[Rubber Band](https://github.com/breakfastquay/rubberband).

Important qualifications:

- tizee's README reports ~95–105 ms inference per 200 ms block on M5; its
  performance document reports ~60 ms fp32/~53 ms fp16. These are inconsistent
  summaries, neither an M4 result nor end-to-end delay. Treat the discrepancy as
  a reason to reproduce the pinned revision, not average the numbers. Its root
  listing, README and package metadata inspected here do not establish a license
  for its new contributions. [Performance document](https://github.com/tizee/rvc-mlx-realtime/blob/main/docs/performance.md).
- w-okada issue 1642 reports MPS trouble on M4/macOS 26 with a 2.1.4 alpha.
  The reporter also marks the preinstalled model working, and the supplied log
  is a padding warning. This is a compatibility risk report, not proof that all
  M4 RVC inference fails. [Issue](https://github.com/w-okada/voice-changer/issues/1642).
- Seed's documented realtime example is approximately 430 ms latency with
  150 ms computation per chunk on the NVIDIA test machine. Its left-context
  window is historical context, not automatically additional future delay.
  Test the tiny realtime model, not the default offline or V2 style model.
- LLVC is a worthwhile CPU research alternative but needs a trained target and
  integration; its README does not establish an M4-ready product. OpenVoice and
  the Apache-licensed mlx-vc wrapper are secondary reference-voice experiments.
  The wrapper's ~300 ms streaming claim is not an independently established M4
  result. TTS-cloning paths in that wrapper regenerate speech from text and are
  not equivalent to preserving the provider's speech performance.
  [LLVC](https://github.com/KoeAI/LLVC),
  [mlx-vc](https://github.com/feiyuehchen/mlx-vc).

## Non-commercial use and voice assets

Non-commercial intent does not erase software, checkpoint, dataset or voice
permissions. Keep four separate records: engine license, dependency notices,
checkpoint license, and the rights/consent for target recordings. A public repo
without an established license is not automatically reusable open source.
[GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

Use an original/consenting performer or a voice with explicit permitted use.
Do not treat an arbitrary celebrity/anime checkpoint as cleared because its
engine is MIT. Beatrice and bundled character voices have separate terms;
they are not blanket MIT assets. GPL dependencies remain candidates for this
personal build, but redistribution needs its own review; placing code in a
subprocess is not a blanket license exemption. No licensing conclusion here
substitutes for review of the exact artifacts we would ship.

Proposed storage, **not an existing official directory contract**:

- Project-owned, versioned voice masters:
  `resources/voice/<voice-name>/<version>/` with manifest, license/provenance,
  checksums and the retained voice package.
- Managed runtime copy:
  `app.getPath('userData')/assets/voices/<voice-model-id>/`.
- Shared encoder/pitch models stored once in a separate managed engine asset
  directory; presets reference immutable IDs/hashes, not arbitrary user paths.
- Keep voice identity separate from Cubism export version: Raven v8 and v10 may
  share one voice preset, or intentionally bind different ones. A rig library
  entry is not the public avatar profile.
- Large weights/source recordings need an explicit backup policy; a Git-ignored
  master is not backed up by pushing the repository.
- Conversation audio remains RAM-only, including all worker queues. Imported,
  authorized training/reference assets are separately managed source assets,
  never harvested from visitor conversations. No automatic runtime downloads.
- Do not load untrusted pickle-style `.pth` checkpoints in the live app. Use a
  controlled offline conversion step for trusted sources and validate the
  runtime format, shapes, sizes and hashes before loading. Conversion needs no
  credentials or access to operator data.

## Voice Studio controls

Proposed dedicated Console page: **Voice Studio**, adjacent to Live2D Cubism.
Keep the existing Cubism page's silent testing contract unchanged. Voice Studio
can mount the shared avatar renderer for an explicitly audible voice/lip-sync
preview; it must not publish or switch the live Mirror implicitly.

Always show public avatar name, selected rig name/version, voice preset
name/version, loaded engine/model, and Preview versus Published status.

| Control group | Proposed knobs | Initial behavior |
| --- | --- | --- |
| Base performance | Existing provider voice and speaking style | Session configuration, not a post-processing emotion slider |
| Pitch and size | Pitch -12..+12 semitones; formant -6..+6 semitones; formant preservation | Smooth live preview; advanced extremes only after listening tests |
| Tone and level | Low/mid/high EQ +/-12 dB; output -24..0 dB; compression amount | Safe output ceiling, meters and clipping warning |
| Character effects | Saturation/grit amount; robot/ring-mod amount; chorus depth/rate | Separate bypass for each effect; default off |
| Space | Reverb mix/decay; delay time/mix/feedback | Conservative initial tail budget; immediate cancellation on interruption |
| Neural voice | Target model; pitch; index influence 0..1; consonant protection; loudness-envelope blend | Only expose controls actually supported by the selected engine |
| Advanced performance | Chunk size, history context, crossfade, pitch extractor, precision | Stop/warm/restart preview for structural changes; show latency impact |

These ranges are product-design proposals, not upstream performance promises.
Consonant protection must translate the backend semantics correctly: RVC's
`protect=0.5` means protection disabled, so a human-facing "more protection"
slider must not silently invert the expected effect. Index influence is not
the same as dry/wet output mixing; disable it if no index exists.

Preview buttons: Play sample, Loop sample, A/B original/processed, Stop/reset,
Reset one effect, Save preset, Duplicate preset, Assign to avatar, Test latency.
Use authorized synthetic Mandarin/Taiwan-accented Mandarin and English samples.
A/B should be loudness-matched. Switching presets resets queues/effect memory.
Optional live mic monitoring is a separate later feature with explicit mic
ownership; it is not acquired by opening the page.

Illustrative presets for listening, not claims of validated sound:

- Raven: pitch -3 semitones, formant -2, mild saturation, restrained short room.
- Ren: neutral pitch/formant, gentle EQ/compression.
- Spirit: modest raised formant plus light chorus; robot: controlled ring-mod.

Do not add an arbitrary continuous playback-speed slider to the live stream:
consuming audio slower than it arrives grows latency. Keep streaming duration
1:1 initially; speaking pace belongs in source performance or a later bounded
time-mapping design. Avoid stacking neural and DSP pitch shifts unintentionally.

## Repository integration and critical changes

Inspected current owners:

- `src/shared/avatar-profiles.ts`: public AvatarProfile already owns voice and
  speakingStyle; modelId separately identifies the Cubism rig.
- `src/main/avatar/avatar-config.ts`: strict catalog validation.
- `src/main/realtime/session-start-bundle.ts`, shared session DTOs and
  `src/renderer/realtime/realtime-session-adapter.ts`: frozen session config.
- `src/renderer/realtime/realtime-audio-output.ts`: SDK element currently plays
  the only audible voice; MediaStreamSource -> analyser is a silent tap;
  mute/volume currently act on the element.
- `src/renderer/audio-devices.ts`: routes an object exposing setSinkId.
- `src/renderer/realtime/playback-completion.ts`: upstream stopped event
  resolves completion immediately; bounded analyser is fallback.
- `src/renderer/avatar/audio/avatar-audio-coordinator.ts`: lip-sync consumes the
  output analyser. Runtime dependencies and owner coordinate cleanup/rollover.

Proposed audio order: incoming provider speech -> optional neural converter ->
pitch/formant -> tone/character/space rack -> output gain/limiter -> selected
speaker. The final **voice-only** playout stream supplies lip-sync, never room
mic or mixed background music.

This changes the existing sole-audible-element implementation. A routing spike
must establish one audible sink, including dry bypass, with no doubled original
voice. Test redirecting the SDK element through Web Audio versus a suppressed
receiver with a MediaStream source; do not assume muting/pausing the receiver
preserves Chromium stream processing. Keep its stream attached as required.
Route volume, mute and output-device changes to the actual new sink, not only
the now-inaudible receiver. Do not edit the installed SDK.

**Playback and interruption are release blockers, not polish:**

1. Upstream completion plus local queue/effect-tail drainage determines audible
   completion. No early Listening, idle timeout, farewell teardown or rollover.
2. Barge-in/Stop/disconnect immediately mutes and invalidates queued audio,
   resets neural overlap and DSP tails, and closes the avatar mouth. Late
   worker replies cannot play after cancellation or avatar replacement.
3. Carry session/utterance generations, sequence numbers and sample clocks on
   internal audio frames. Keep queues bounded with a visible overload reason.
4. The provider's WebRTC truncation tracks its own playback buffer, not our
   added processing queue. Therefore draining our queue alone does **not** fix
   conversational history alignment. Prove item/sample mapping and compatible
   truncation with the pinned SDK/API before shipping neural processing.
   If precise mapping cannot be established on WebRTC, keep neural mode
   preview-only and separately propose a client-clocked transport change.
   Do not silently migrate the whole application to WebSocket.
   [Official interruption/truncation contract](https://developers.openai.com/api/docs/guides/realtime-conversations#interruption-and-truncation).
5. Keep reverb/delay tails bounded; flush them on cancellation, not after they
   naturally decay. Measure lip-sync at output time, not worker-arrival time.
6. Hardware echo cancellation must still recognize the transformed loudspeaker
   signal; re-test the actual room/speakerphone. Never process visitor input
   through the voice changer to solve this problem.

For neural conversion, Electron Main owns one warm worker and a narrow control
protocol. PCM must use a bounded binary channel, not JSON/base64 telemetry or
temporary WAV files. Prefer private child-process pipes; a loopback service is
an evaluated alternative only with local binding, per-run authorization and
origin checks. The inference thread never blocks the audio callback. Initialize
models before an audible test, report warming/ready/error, and load one target
at a time initially. No new whole-app restart owner.

Save public avatar -> immutable voice preset revision in versioned config.
Existing configurations migrate to bypass. Draft knob edits affect only preview;
Publish affects subsequent sessions, matching existing snapshot rules. Missing
models never silently substitute a different voice. An operator-selected
effects-only fallback may be offered explicitly; any runtime degradation must
be visible and must not block unrelated adapters or microphone release.

## Proposed implementation slices and acceptance gates

This is a planning sequence, not authorization to execute it or a phase change.
Each slice gets focused tests and one final diff review. Current Windows runtime
and unrelated worktree edits remain untouched.

### 1. Prove the audio boundary before building the full UI

- [ ] Create an isolated synthetic audio harness for streaming DSP, single-sink
  routing, timestamps, immediate cancel and finite tail drainage. Proposed files:
  `src/renderer/voice/voice-output-pipeline.ts`,
  `tests/renderer/voice/voice-output-pipeline.test.ts`, and a dedicated manual
  audio test entry. Tests precede durable implementation.
- [ ] Benchmark Signalsmith live input in the pinned Electron on Windows and
  then M4; log only timings/counters/device metadata, not audio content.
- [ ] Test muted receiver/redirected-element behavior, output selection and
  suspend/resume. Pick and document the graph only after this evidence.
- [ ] Reproduce provider interruption/truncation behavior under deliberately
  delayed playout. No neural runtime integration until this contract is sound.

Deliverable: measured feasible audio path, or an exact blocker. Approval at this
point selects the DSP dependency and the revised audio-owner contract.

### 2. Ship per-avatar DSP preview and preset persistence

- [ ] Add `src/shared/voice-presets.ts` and matching tests for ranges, immutable
  references, bypass defaults and invalid presets. Extend avatar/config/session
  DTO owners above without creating a second source of truth.
- [ ] Add `src/renderer/console/VoiceStudio.tsx`, register it in Console App,
  and use the shared avatar renderer. Do not change CubismStudio's silent mode.
- [ ] Implement the selected worklet and effects graph with smooth automation,
  A/B, looping sample, per-effect reset and peak protection.
- [ ] Prove Ren/Raven presets remain distinct after reload, draft preview does
  not publish, and rig v8/v10 identity stays explicit.
- [ ] Extend isolated Console QA only for the new page; use computer use plus
  human listening for actual sound quality. A screenshot cannot prove audio.

Deliverable: useful standalone Voice Studio with effects, no neural dependency.

### 3. Wire accepted DSP into live avatar output

- [ ] Update realtime-audio-output, runtime dependencies/owner, output routing,
  playback-completion and avatar audio coordinator using slice 1's proven graph.
- [ ] Cover one-sink playback, downstream drain, mute/duck, barge-in, repeated
  stop, stale callbacks, sleep/farewell and session rollover in focused tests.
- [ ] Run isolated Electron regression sequentially with normal app stopped only
  after preserving unsaved edits. Conduct the approved live-session check with
  RAM-only audio and actual speakerphone echo/barge-in testing.

Deliverable: live effects with unchanged guest/privacy and mic ownership rules.

### 4. Benchmark, select and integrate one neural backend

- [ ] Resolve tizee contribution licensing and Acelogic attribution before
  incorporating either. If unresolved, evaluate the auditable RVC source route;
  do not copy the unlicensed streaming implementation as a shortcut.
- [ ] On the actual M4, use the same authorized voice, Mandarin/English samples,
  output device and workload to compare source-pinned RVC and cleared MLX RVC.
  Include cold start, warm inference, hard consonants, laughter and long turns.
- [ ] Select exactly one backend based on quality and measured latency. If none
  passes, retain working DSP and label neural mode experimental/preview-only.
- [ ] Add a managed voice-package importer and Main worker owner under
  `src/main/voice/`, a worker under `workers/voice/`, and the bounded renderer
  bridge. Include missing/invalid package, crash, overflow, cancel and stale
  generation tests; no checkpoint downloads in a conversation.
- [ ] Add only the supported neural knobs and repeat slice 3's audible lifecycle
  checks. Do not add model training or multiple simultaneous voices here.

Deliverable: one measured local neural mode, not a large bundled model zoo.

### 5. Mac runtime/package acceptance

- [ ] Test arm64 dependencies and selected OS on M4; repeat independently on M6
  after availability. Keep Mac port/signing/LaunchAgent work explicitly scoped.
- [ ] Verify packaged WASM/worker assets, clean-machine launch, offline readiness
  after explicit asset installation, device unplug/replug and sleep/wake.
- [ ] Run a 30-minute workload with Raven rendering and representative scene
  video/audio. No normal/QA Electron overlap. Check memory growth, underruns,
  thermal degradation, stop latency and actual acoustic feedback.
- [ ] Update relevant domain harness facts and DECISIONS only for accepted
  implementation changes; PROGRESS records measured hardware and evidence.

## Proposed performance gates (targets, not measurements)

Measure added processing delay separately from cloud response time and hardware
output latency. Use wired output for the baseline; test Bluetooth separately.

| Metric | Proposed acceptance |
| --- | --- |
| DSP added delay | p95 <=80 ms; <=50 ms preferred |
| Neural added delay | p95 <=300 ms preferred; 300–450 ms requires explicit listening acceptance; >450 ms not default live mode |
| Neural inference budget | p95 <=70% of chunk duration under combined workload; no sustained backlog |
| Cancellation | local queued voice silenced <=50 ms after interrupt signal; separately measure physical device tail |
| Lip-sync timing | <=50 ms mismatch against actual voice playout |
| Stability | 30 minutes without audible dropouts or unbounded queue/memory growth |
| Intelligibility | Human Mandarin/English A/B acceptance; no material consonant/word loss at chosen preset settings |

Physical end-to-end latency needs loopback/correlation on synthetic samples;
inference RTF alone is insufficient. Record p50/p95/max, buffer depth, inference
time, underruns, cold-load time, engine/model hashes, OS/chip/RAM/output device,
and combined rendering load. Keep human quality judgments separate from metrics.

## Research revision anchors

Default-branch commits resolved through GitHub API during this session; these
are research anchors, not an instruction to install their current dependencies.

| Repository | Commit |
| --- | --- |
| Signalsmith-Audio/signalsmith-stretch | `57b93f4e9206a089a45387eaa39bdc9f310d3308` |
| tizee/rvc-mlx-realtime | `95a69ae2467738c605762bb5e84e8cdcef09d83d` |
| Acelogic/Retrieval-based-Voice-Conversion-MLX | `eec7791a59eb09d0f56f1189df55e9852848e692` |
| acrossoffwest/Voicebox | `9a8f5b4e1cf4449b13d8bfe05aedadce0c1cd399` |
| Plachtaa/seed-vc | `51383efd921027683c89e5348211d93ff12ac2a8` |
| w-okada/voice-changer (master, not a v.2 binary) | `f1caf8e7c39fd0d6866202be27bf142790191a51` |

## Handoff

Research only: no product code/dependencies/config/runtime/model assets changed,
no tests or audio benchmarks claimed, no commit/push/deploy. Existing preview-loop
work remains local and uncommitted. Runtime was not restarted or QA-controlled.
Next action: confirm machine/RAM and output scope, approve the two-layer design,
then authorize slice 1. Neural backend selection remains conditional on its
license and M4 test, not on a GitHub README's realtime label.
