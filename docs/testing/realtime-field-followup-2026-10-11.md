# Realtime field follow-up — 2026-10-11

The owner explicitly authorizes Raven and real-provider/device testing while
the TV remains off. The isolated QA launch already excludes TV-presence
shutdown; use that session-scoped path and preserve the installed TV policy.
Jabra and Arducam remain connected. Operator v17 active/draft and production
model IDs remain unchanged during comparisons. This continues the
[third-audit ledger](third-audit-remediation-2026-10-11.md).

## Research and changes under evaluation

Checked current official guidance on 2026-10-11:

- [Realtime prompting](https://developers.openai.com/api/docs/guides/voice-prompting):
  begin with a minimal prompt and add rules for measured failures; keep short
  sections, precise tool triggers and consistent language across tool results.
- [Configured mini model](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini):
  the production model remains `gpt-realtime-2.1-mini`; full-model trials use
  only the existing versioned comparison config.
- [Voice architectures](https://developers.openai.com/api/docs/guides/voice-agents):
  changing to a different architecture is not required for this repair.

Inference to test: stale instructions identifying the previous transcript's
language as *current* can oppose the model's understanding of newly heard audio.
The hint now gives explicit precedence to the new complete sentence. Added
missed Chinese local-only and English retry sentence forms without changing
command authorization. A five-tool `focused` QA candidate reduces prompt
prose and spells out original-language title discovery and outcome-only speech.
It has not been promoted merely because it is shorter.

## Evidence

Raw dialogue, captured audio, private context and camera images
remain in RAM. Retained failures and verdicts are metadata-only. Physical
speaker-to-Jabra input, synthetic WebRTC input and human acceptance are distinct.

Completed run metadata and complete runner output are byte-verified in
[the follow-up archive](../../.artifacts/realtime-field-followup-2026-10-11/).
Original phase4 run IDs below also name their archive subdirectories. Reviewed,
finished scratch runs may be removed with the marked-artifact helper after
archival; active runs remain untouched.

- Initial focused unit run: 152 passed, one new language case failed. Fixed
  the omitted `Only look…` imperative; rerun: 153 passed. Both typechecks and
  the build pass. Logs: `/tmp/magic-mirror-fourth-*.log`.

### Camera: extended capture exposed another failure

The earlier short recovery pass did not establish sustained capture. Extended
tests failed with missing frames after a successful reset. Splitting bounded
Vision work from capture and using the exact advertised 15.000015-fps duration
did not alone fix it. Holding the device lock through commit/start corrected
the delivered size from 1280×720 to 640×480, but the advertised NV12 input still
stalled. The measured YUY2 input (NV12 output conversion) passes:

- `.artifacts/phase4-qa/2026-10-11T10-42-52-798Z/camera-native.json`, exit 0:
  six snapshots across 25 seconds, no stale/reset event during baseline,
  42 frame receipts, largest receipt gap 1,056 ms.
- Injected missing frames triggered app-owned USB reset; tracking returned
  4,648 ms after reset request, followed by three 640×480 snapshots. No manual
  unplug, hub reset, system media-service kill or Electron restart.
- Retained failed runs: `10-32-56-739Z`, `10-35-42-672Z`, `10-39-41-413Z`,
  `10-41-27-587Z` under the same dated phase4-qa directory. These failures are
  not replaced by the later pass.

Apple's [format guidance](https://developer.apple.com/documentation/avfoundation/capture-device-formats)
distinguishes macOS automatic configuration from iOS `inputPriority`; the local
Mac SDK confirms that preset is unavailable on macOS. Keep the configuration
lock through startup and use a format/duration the device actually advertises.
The reason for this camera driver's NV12 stalls remains an inference; the
input-format comparison above is the measured result.

### Physical Realtime camera path

`2026-10-11T10-44-01-652Z` passed, exit 0: native Mac-speaker stimulus → real
Jabra microphone → configured mini Realtime → `capture_camera` → actual
Arducam image. All four image-grounding criteria passed; no camera-stale/reset
event occurred in the question. Release and provider-error checks passed.
The ASR was not an exact copy and the model emitted commentary; this capability
pass is not a general language/preamble-quality pass. No image/audio retained.

Earlier physical runs (`10-26-20-665Z`, `10-31-02-903Z`) failed before camera
invocation. Native speaker output outside Chromium's AEC reference, at the
device's native sample rate/channel layout, repaired this test-delivery path.

### Actual Main hang and restoration

`scripts/run-main-hang-qa.mjs` blocks the real Electron Main event loop via a
loopback-only inspector. The first run recovered Main but failed restoration
because launchd had not finished unloading its temporary job. The runner now
waits for job removal before bootstrapping the original definition.

- Failed restoration retained:
  `.artifacts/main-hang-qa/2026-10-11T10-48-26-142Z/results.json`.
- Complete pass, exit 0:
  `.artifacts/main-hang-qa/2026-10-11T10-50-12-375Z/results.json`.
  Watchdog marker observed, exactly one launchd restart, renderer ready after
  60,010 ms. Installed plist, active and draft bytes preserved; original TV
  policy restored; final exit 0 and no running app.

### Focused research on remaining failures

The owner additionally requested focused research on reproduced failures.
Current [voice prompting guidance](https://developers.openai.com/api/docs/guides/voice-prompting)
supports concise sections, explicit language continuity, prompt-controlled
preambles and measuring the lowest adequate reasoning effort. A versioned
`minimal` trial (`10-46-12-416Z`, focused/mini) passed all three local-only
runtime routes but failed all three quality turns: preambles/narration and
language mismatches remain. No candidate or reasoning setting is promoted.

The preceding `focused` trials also retain all failures: mini
`10-16-50-889Z`, full `10-20-53-597Z`, and revised-channel mini
`10-23-29-258Z`. Each passed three local-only runtime routes but failed all
three quality turns. The full model kept the tested reply languages correct
in that sample, while preamble/narration failures remained. The five-tool
candidate measures 556 prompt + 513 tool tokens and 38 clauses against the
published persona. Shorter instructions and fewer tools alone did not qualify
it. Unknown historical reasoning effort remains a separate rate group;
physical and synthetic input routes are also separated.

The guide exposes `commentary` and `final_answer` phases, but WebRTC
[`output_audio_buffer.clear`](https://developers.openai.com/api/reference/resources/realtime/client-events)
interrupts the current audio response. Muting based solely on generation-time
phase events could discard queued final speech; no such unmeasured filter was
added. ASR remains asynchronous guidance, not the audio model's exact hearing.
The dedicated transcription guide discusses `delay`, while the GA call/API
reference restricts it to `gpt-realtime-whisper`; retain the existing model
allowlist rather than silently assuming `gpt-live-transcribe` honors it here.

Jabra publishes [full-duplex support](https://www.jabra.com/en-gb/business/speakerphones/jabra-speak-series/jabra-speak2-75)
and an [Easy Call Control API](https://developer.jabra.com/sdks-and-tools/javascript/easy-call-control).
The current SDK **4.4.6** was installed only in `/tmp/magic-mirror-jabra-research`,
with tracking disabled, and discovers exactly one supported Speak2 75.
Its `appId` is self-chosen; the optional partner key is recommended before
production deployment. No existing app credential was borrowed. The bounded
call-mode comparison (`11-23-04-612Z`) exits 2:

| Playback bed | Wake detections | Negative detections |
|---|---:|---:|
| Jabra music, −20 dB | 10/10 | 0/10 |
| Jabra speech, −20 dB | 0/10 | 0/10 |
| Mac music, normal test gain | 10/10 | 0/10 |
| Mac speech, normal test gain | 2/10 | 0/10 |

Input stayed fresh. The SDK reported one call during the trial and zero after
`endCall`; restoration passes. Compared with the earlier Jabra 0/10 music
sample, explicit call mode is a useful lead, but speech still fails. This
comparison does not isolate firmware DSP from acoustic masking, and does not
qualify SDK integration or a production route/volume change. No product
dependency was added. The RAM-only audio, exact wrapper and metadata are
retained separately from representative human acceptance. Jabra Direct reports
firmware 2.54.0 as current; no firmware or persistent device setting changed.

Four Raven screenshots (`10-16-50`, `10-20-53`, `10-23-29`, `10-46-12`) were opened:
Raven is visible against black with an intact head and expected lower-body
crop on the virtual landscape display. They do not cover the powered-off TV.

### Complete real-provider audit

`10-51-45-661Z`, trimmed/mini/low, exits 2 after 27.8 minutes: **78/92 checks**
pass, including all ten scenarios, 45 judged turns and the extra capabilities.
No case was skipped. **26/45 quality turns** pass: empathy 3/4, local media 2/6,
local scope 1/3, fallback 1/4, YouTube modes 2/4, local loop 1/2, memory 8/10,
spell control 1/2, sleep/spells 6/8, identity denial 1/2.

All ten scenario quality gates fail; four additional runtime failures are the
two default-fallback routes, YouTube-loop acoustic wake and Chinese folder
title selection. Own/shared English folder playback, camera grounding, real
WebGL recovery, interruption/follow-up, identity denial, release and provider
error checks pass. There are 52 ASR items, zero text-injected turns and only the
benign `response_cancel_not_active` diagnostic. Exact spell execution and
farewell ordering pass; one farewell has no exact cue match. The local-tone
loop wake pass is separate from failed YouTube/music-bed wake.

The run exposed a deterministic source-policy defect: an explicit new request
preceded by an English or Chinese introduction kept the earlier local-only
restriction. Chinese 寶庫/宝库 was also absent from the local-scope vocabulary.
Six new unit cases reproduced these defects, with nine passing cases in the
same file. The complete failure is retained in
`magic-mirror-fourth-source-policy-before.log`. The repair recognizes bounded
new-request introductions, preserves local wording and title-only retries,
and accepts normal ASR punctuation variations. The focused adapter/source/
probe regression initially passes 129 checks; final suite follows.

The full-run Raven screenshot was opened: intact Raven on black, consistent
virtual landscape framing, no Console/desktop leakage. The approved sage
persona can now be selected by `--persona sage` in isolated QA; publication
remains unchanged. A dedicated `media_stop` real-ASR case covers the owner's
exact phrase, a negated command and the next ordinary conversation turn.

The dedicated stop run `11-27-54-841Z` passes **8/8 checks**, exit 0: real
provider ASR exactly recognized both the negation and the approved stop;
negative speech kept media running, the exact stop used no model tool or
reply, the next ordinary turn received an audible answer, and release passed.
The Jabra remained the physical output; the visitor input was synthetic WebRTC
audio. This is application-stop/provider coverage, separate from human accuracy.

Source repair recheck `11-29-15-039Z` passes the English new-request chain
`find_media → search_youtube → play_youtube`; no stale local restriction remains.
The Chinese request reaches online playback but skips local discovery, so the
run remains failed (9/11 checks, 2/4 quality turns). Application ordering now
performs local discovery before an implicit online search, returns found local
candidates, and does not turn a failed local lookup into a confirmed miss.
Only a same-query result from the current turn is reused; interruption cancels
the continuation. Explicit YouTube still bypasses local discovery. Real QA
reports these actual application operations separately from provider calls.

The new guard's first focused regression had one failure: an old interrupted-
search test expected online lookup despite a matching local resource. It now
explicitly requests YouTube and still verifies stale completion and control
exclusion. Repaired focused regression: **138 passed**. Provider recheck
`11-36-54-497Z` remains failed: the model stops after a local miss in English
and after search in Chinese. Those missing follow-up calls remain model-quality
failures; application ordering does not guarantee model completion.

The approved sage persona with the focused five-tool prompt (`11-31-17-792Z`)
passes all three local-only routes but still fails overall quality. Preamble,
narration and language failures remain. No persona/model/tool promotion.

The first sage capability run (`11-41-00-894Z`) fails two folder checks. Own-
folder discovery uses the wrong query. Chinese discovery finds the requested
title and calls playback, but QA samples before the merged tool acknowledges
playback. The harness now waits for outstanding tool calls to finish after a
media request; ordinary production replies do not wait for final ASR. This
failed sample remains retained. The affected capability recheck follows below.

Recheck `11-48-27-790Z` completes, exit 2, **9/10 checks passed**. Own/shared
folder playback, WebGL recovery, four camera judgments, interruption/follow-up,
real audio route and release pass. Chinese lookup again uses a different title
despite exact ASR (`requestedTitleMatched=false`, zero candidates). The harness
race is repaired, but this model title-selection defect remains open. No
persona, five-tool catalog or full-model candidate is promoted.

Three further screenshots (`11-29-15`, `11-31-17`, `11-36-54`) were opened:
Raven remains intact on black with the expected virtual landscape crop. Two
captures are mid-blink. No Console or desktop leakage was visible.

### Final regression

Earlier checkpoint: 1,983 passed, 1 skipped (70.24 s). Final `npm test`:
**1,987 passed, 1 skipped**, 182 passing files, exit 0 (70.27 s),
including sequential Electron smoke and Phase 0 integration. Both TypeScript
projects, the final stamped build and source/output verification pass. The
metadata rate-label follow-up passes its two focused tests. Updated camera and
QA skill references validate. The initial system-Python skill check failed for
missing `yaml`; the existing validation virtual environment passes.

A build verification mistakenly run during the full suite returned
`qa_build_output_changed`; the particular transient output was not captured.
Verification after the suite completes passes without rebuilding. This was
an invalid concurrent verification, not a substituted or ignored build hash.

Final scoped diff review and `git diff --check` pass. At 19:51 Taipei, production
v17 active and draft bytes still match the starting published SHA-256. The
three configured models and low reasoning effort are unchanged. Installed and
loaded LaunchAgent TV host is restored; `KeepAlive={SuccessfulExit:false}` and
`ExitTimeOut=20` remain. Normal Raven has exit 0 and is stopped, with no Raven
Electron/camera/wake children. Independent root board-ADB remains PID 4320.

All completed follow-up metadata and full test/runner logs are byte-verified
in the archive linked above. Rates separate exact prompt/tool/judge/model,
reasoning effort and device-route provenance; unrecorded historical values
remain distinct. Reviewed, marked scratch runs are cleaned only after archival;
the unmarked Main-hang evidence is retained in place as well. Cleanup completed
for all **20** follow-up marked runs (12 initial, eight final), with no failures.
The archive rate report includes 14 completed provider runs and 68 judged turns
across 13 provenance groups; capability-only runs have no quality-rate denominator.

## Remaining boundaries

TV-off authority enables headless testing; it does not establish TV pixels,
physical power cuts, purchased/paired Flic hardware, representative human
recognition or a completed 24-hour soak.
