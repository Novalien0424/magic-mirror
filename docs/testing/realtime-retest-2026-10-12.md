# Raven authorized TV-off retest — 2026-10-12

Provider/device retesting completed at **00:57 Taipei, Oct 13**. The owner
authorized fresh real-provider and physical Jabra/camera tests with the TV off.
QA temporarily exempted the isolated runs from TV shutdown; production policy,
v17 operator config, model IDs and
persona remain unchanged. Camera recovery belongs to the app, including USB
reset and fresh-frame verification, without manual unplug/replug.

## Latest result

- Native camera **12/12 snapshots** pass: six before and six after a real,
  application-owned USB reset, all 640×480. Maximum frame-receipt gaps in those
  phases were 1.784 s and 1.719 s. This is bounded recovery evidence, not a soak.
- Physical Mac-speaker→Jabra→Realtime→native-camera: **5/5 runtime checks and
  4/4 visual criteria** pass. The camera actually stalled during this request;
  the pending capture waited through automatic USB recovery and returned a
  fresh frame. No operator unplug/replug was needed. The whole visual test step
  took 46 s, including provider interaction; that is not camera-only latency.
- Capability checks: **10/10**, with synthetic-camera grounding **4/4** and
  interruption-follow-up quality **3/3**. Chinese-title playback now passes:
  literal ASR preserved the title, the model's initial query did not, and the
  app's current-turn visitor-clue fallback recovered one match and playback.
  Own/shared-folder playback, WebGL recovery and microphone release also pass.
- Exact **「停止播放」**: **8/8**. Independently seeded identity denial: all
  runtime checks and **2/2** quality turns pass.
- Remaining failures: wake over Jabra speech playback, inconsistent memory/
  narration/language behavior, and an intermittent memory interpreter failure
  whose cause has not been reproduced with the new diagnostics. Details below.

The three final runs exited 0. [Final metadata](../../.artifacts/realtime-retest-2026-10-12/final/)
is retained separately from all earlier failures. No full-conversation quality
pass, human-microphone acceptance, model promotion or phase advance is claimed.

## Baseline and execution

- Build/source verification passes before the run. Active and draft v17 match;
  SHA-256 `9602c950330eb95432714c912b556417a350154b17377b798cf901f9d9653081`.
- Fresh full provider run started at 23:12 Taipei:
  `node scripts/run-raven-conversation-qa.mjs --launch-agent --prompt trimmed --variant mini`.
  Scratch root: `.artifacts/phase4-qa/2026-10-12T15-12-34-388Z`.
  Build inputs remain frozen for the run. Synthetic visitor speech enters the
  real WebRTC/model/tool path; this is separate from physical acoustic acceptance.
  [Baseline metadata](../../.artifacts/realtime-retest-2026-10-12/baseline/)
  and [failed/passing local checks](../../.artifacts/realtime-retest-2026-10-12/checks/)
  are archived with SHA-256 verification. Its Raven screenshot was reviewed on
  the virtual landscape display; marked scratch cleanup removes its screenshots
  and isolated user data. This is not portrait-TV acceptance.
- Optional read-only CLI investigation failed with `Selected model is at
  capacity`; exit 1. No model substitution or device operation occurred.
  The root agent completed the investigation.
- Baseline completed with exit 2: **79/92 checks, 29/45 quality turns**.
  Empathy 4/4, local media 4/6, local scope 2/3, default fallback 0/4,
  YouTube 2/4, local loop 2/2, memory 4/10, spell control 2/2,
  extended sleep/spells 8/8, identity denial 1/2.
  The final interruption and release checks hit the 1,700-second harness budget;
  these are missing acceptance, not proven application failures. The next run
  allows 2,100 seconds with a 2,400-second external watchdog. Per-turn timeouts
  and the no-automatic-retry policy remain unchanged.

## Changes and local verification

The implemented candidate fixes the reproduced English modal/self-introduction
gaps, retains a conditional last-sentence hint across title/name turns, and
selects final structured Responses output in memory intent/extraction and QA.
The prompt distinguishes application control fields from untrusted content and
asks for media completion in the same turn with original-language title clues.
No tool/model/persona promotion is included.

The probe now measures preambles within the same response using event order,
deduplicates transcript aliases by response/item/content index, and reports
unattributed calls separately. Initial judge semantics advanced to `raven-quality.v4`;
the later application-operation repair uses `raven-quality.v5`.
Private-memory lock checks cover the entire visit and returned entries; the
clean-session check also verifies that older peer connections are closed.

Focused checks pass: **107 + 195 tests** across 12 files, including the previously
failing language, protocol and memory regressions. Both TypeScript projects,
build/source verification and edited skill validation pass. Full `npm test`
passes **2,001 tests, 1 skipped**, 182 passing files, exit 0. The source changes
were reviewed against snapshots taken before this session's edits; whitespace
and launcher syntax checks pass. These are intermediate checks; final results
are recorded above and below.

The repaired full-provider run started at 23:48 Taipei with the same production
mini model, published persona and seven-tool catalog. No other Electron owner
or microphone diagnostic overlaps it.
Published-persona prompt measurement with `o200k_base`: **697 session tokens +
611 tool-definition tokens, seven tools**, versus 684 + 604 before this session.
The change replaces conflicting wording; it does not accumulate a large prompt.
The tokenizer runs in a temporary tooling environment, with no product dependency
change or prompt text retained in its output.

The repaired full run completed after midnight Taipei with **69 passed, 13
failed, 9 not executed (91 checks)**; judged quality was **24/35**. An 8-second
identity-interpreter timeout left private memory locked and skipped nine memory
checks. It also prevented the full-run denial fixture from preparing a private
scope; those downstream denial failures are not evidence of a privacy leak.
Empathy 4/4, local media 5/6, local scope 0/3, default fallback 1/4, YouTube 2/4,
local loop 1/2, spell control 2/2, extended sleep/spells 8/8, denial 1/2.
Interruption, synthetic-image grounding and final release pass. Audible YouTube
wake and Chinese-title selection still fail. The screenshot was reviewed on the
virtual landscape display. [Retained repaired-run metadata](../../.artifacts/realtime-retest-2026-10-12/repaired-full/).

Two follow-up QA repairs were implemented: judge v5 receives the same actual
application-operation evidence used by runtime routing checks, so bundled local
discovery is not mistaken for an online-first operation; a failed candidate
setup now skips dependent denial judgments. A current-turn, bounded final-ASR
clue can retry a successful but empty local lookup when the model changed the
query. It preserves ambiguous candidates and does not select or play anything,
reuse an older turn or retry failed discovery. A later regression-driven revision
allows a bounded 1.5-second wait for this lookup's final ASR. A content-free
Console event identifies this fallback; the final live title check passes.

## Defects reproduced before repair

- The English sentence detector misses complete `what should ...` questions,
  including two actual audit fixtures. Focused regression evidence is retained
  in `/tmp/magic-mirror-retest-2026-10-12-regressions-before.log`.
- Language hints are deleted at the next speech onset. A subsequent title or
  short selection cannot replace them. The fresh baseline has wrong-language
  replies after local media; preserving a conditional last-sentence hint is a
  candidate repair, not yet a measured provider improvement.
- QA preamble timing previously joined audio to tools by whole visitor turn.
  This can attribute an allowed YouTube search bridge to a later quick playback
  call. Attribution should follow the actual provider response and event order.
- The probe accepts both legacy/current transcript completion events without
  content-item deduplication. A protocol regression reproduces double counting;
  this does not prove that previous cue-count findings were all duplicates.
- Prompt inference: treating every tool result as never-instruction data
  conflicts with application-owned `next` guidance. The repaired wording must
  distinguish trusted control fields from untrusted labels, memories and images.
- The fresh explicit-memory turn reported `memory_interpretation_schema`.
  Static review and failing regressions reveal that the interpreter, extractor
  and QA judge combine all message phases. A commentary item plus valid final
  JSON is rejected; commentary-only schema-valid JSON can be accepted. The
  installed OpenAI `ResponsesParser` instead admits `final_answer`, missing or
  null phases, and excludes every explicit non-final phase. This is a proven
  compatibility/authorization defect; the discarded live response cannot prove
  it caused that particular provider failure.

## Focused retests after midnight, Oct 13

- Final local suite before this batch: **2,006 passed, 1 skipped**; 225 focused
  checks, TypeScript, build/source verification and scoped diff checks pass.
- Native camera: first six VGA snapshots pass. The app completes its targeted
  USB reset and delivers one fresh snapshot, then stalls; two subsequent
  snapshots time out. **Recovery was unreliable in this batch.** The physical
  Jabra→Realtime camera request also fails at frame delivery, with conversation
  and microphone release intact. These fresh failures supersede the Oct 11
  acceptance claim for current camera reliability.
- Physical wake: quiet **5/5**, speech bed without AEC **0/10**, speech bed with
  AEC **0/10**. All 25 negative trials produce zero wakes. Native input is fresh,
  with no reported backpressure/overrun. The actual played reference is supplied,
  but the AEC never aligns (`delaySamples=null`, `alignmentSeen=false`, ERLE 0).
  This fails qualification; it is not evidence of a working canceller's
  effectiveness. Production AEC stays disabled.
- Exact 「停止播放」 regression: **8/8** including negation, continued
  conversation and release.
- Capability recheck: Chinese-title discovery failed despite command-equivalent
  ASR; the first lookup fallback did not engage. Regression tests reproduced
  late-final-ASR and incomplete-query gaps, plus Simplified-Chinese language-hint
  gaps (**5 failed**). Fixes were applied after the frozen batch ended.
- Judge v5 default-fallback recheck: **3/4 quality turns**. Both local-first
  routes pass; the remaining Chinese turn narrates tool use. Earlier v4 failures
  remain retained. The comparisons are separate judge versions, not a pooled rate.
- Focused memory retry: **15/18 checks, 5/10 quality turns**. Both identity
  confirmations and runtime recall checks pass. An ordinary story still causes
  an unnecessary memory call (correctly rejected), explicit save again reports
  `memory_interpretation_schema`, and quality flags invented facts. The final-phase
  repair is valid but does not resolve the complete live save failure.
- Independently seeded identity denial: **2/2 quality turns**, all runtime
  checks pass. Memory/denial screenshots were reviewed on the virtual display.

The next camera candidate copies one frame into owned RAM before asynchronous
Vision analysis, releasing the driver's reusable buffer promptly. Apple's
[frame-drop guidance](https://developer.apple.com/library/archive/technotes/tn2445/_index.html)
supports that ownership boundary; buffer starvation is a hypothesis for these
stalls, not yet a measured cause. Swift type checking and planar/packed buffer
copy/isolation tests pass. The test fixture's initial Swift type error is retained
alongside the corrected passing check. The candidate is now implemented, with
six post-reset snapshots five seconds apart required; hardware results are
recorded in the next paragraph. Chinese input script is normalized before
sentence classification. An
empty local lookup may wait at most 1.5 seconds for its own final ASR, then retry
with its bounded current-turn clue. Ordinary dialogue remains ungated. Validation
stages are now content-free interpreter diagnostics. All 215 focused checks and
both TypeScript projects pass after these changes.

The next batch completed at 00:48 Taipei. Owned Vision buffers did **not** remove
the native camera stall: initial capture returned 5/6 snapshots, with a 12.18 s
frame-receipt gap and a successful app-owned USB reset. The following physical
Jabra→Realtime→camera run nevertheless passed **5/5 checks and all four visual
criteria**, showing recovery is possible but intermittent. A further repair
keeps one pending snapshot through the existing recovery for at most 15 seconds,
then requests a fresh frame once; it does not increase the two-reset budget.
Three failing regressions reproduce the earlier discarded request; 170 focused
checks and type checking pass after repair. The full suite subsequently passed
**2,021 tests, 1 skipped**. Final review added cancellation on permission loss or
device removal during recovery; all **19 camera tests** pass, as do type checking,
build/source verification, edited skill validation and whitespace checks. The
final camera and capability hardware/provider batch subsequently passed, as
recorded in Latest result. Final full-suite verification is recorded below.

The diagnostic memory run passes explicit save (`memory_saved`), both identity
confirmations and runtime recalls: **16/18 checks, 4/10 quality**. It did not
reproduce the schema failure, so that intermittent failure remains unexplained.
Narration, unnecessary memory use and inaccurate/incomplete recall remain open.
That batch's capability run still failed Chinese-title selection and interruption
reply quality. The visitor-clue fallback ran, but discovery returned empty.
Legacy `recognition.exact` means command-lexicon equivalence, including approved
sound-alike folds; it does **not** establish literal title transcription. Fresh
metadata now additionally measures script-normalized literal equality and whether
the requested Chinese title survived ASR. Media discovery keeps its literal
title matching and does not adopt the command sound-alike lexicon.

All four follow-up runs are retained separately in
[follow-up metadata](../../.artifacts/realtime-retest-2026-10-12/followup/).

## Still failing or unqualified

1. **Wake during audible media.** Quiet physical wake passed 5/5, but a Jabra
   speech bed at −20 dB produced 0/10 positive wakes without experimental AEC
   and 0/10 with it. All 25 negative trials stayed negative. The repaired full
   run also missed the audible YouTube-loop wake. Fresh input and no reported
   overrun rule out an absent input stream; they do not prove intelligibility.
   The reference reached AEC, but no delay alignment was acquired and ERLE was
   zero. Production AEC remains disabled. The next useful experiment must first
   establish synchronized reference/capture alignment, then measure wake; more
   unaligned repeats cannot qualify cancellation.
2. **Memory and dialogue quality.** The latest focused memory run passed 16/18
   runtime checks but only 4/10 quality turns. Explicit saving, identity
   confirmations and runtime retrieval passed. Ordinary storytelling still
   prompted an unnecessary memory call, which the app correctly rejected;
   narration and inaccurate/incomplete recalled answers remain. Default media
   fallback passed application ordering but only 3/4 quality turns because the
   model narrated tool use. Earlier full-run local-scope and language failures
   remain unqualified by a final full dialogue rerun.
3. **Intermittent interpreter errors.** Two explicit-save runs reported
   `memory_interpretation_schema`; another full run hit the 8-second identity
   interpreter timeout. Final-phase parsing repairs a reproduced defect, but
   does not prove the cause of those discarded live responses. The diagnostic
   retry saved successfully, so its new bounded body/envelope/completion/
   final-output/payload reason codes could not localize the prior failure.
   Keep strict validation and fail-closed identity gating. No private database
   leak was established: the baseline judge flag and invalid downstream denial
   setup are separate from Main's passing lock/no-injection checks.
4. **Reliability beyond the passing samples.** Chinese-title playback and
   interruption quality passed the final run after earlier failures. That
   establishes this fixed route, not a general ASR/behavior success rate.
   Camera requests now survive the observed recovery, but stalls still occur;
   the driver/USB root cause and long-duration stability remain unresolved.
   Three harmless `response_cancel_not_active` rejections were recorded during
   successful media transitions; no other provider errors occurred in that run.
5. **Conditions unavailable with TV off.** Physical portrait-TV appearance,
   T1–T5 power/cold-boot behavior and the 24-hour soak were not executed.
   Physical Flic/Karabiner/reboot, representative human conversation and
   packaged/signing acceptance remain separate. Oct 11 persistence/Main-hang/
   button-helper passes remain dated evidence, not fresh acceptance here.

The session stops after bounded, hypothesis-driven tests and fixes; it does not
retry failed provider/device behavior until a lucky pass, relax memory validation,
change undocumented Jabra settings or promote an unqualified model/tool trial.

## Final verification and handoff

Final `npm test`: **2,023 passed, 1 skipped**, 182 passing files, exit 0 in
72.12 s, including sequential Electron smoke and Phase 0 checks. The final source
passes both TypeScript projects, all 19 focused camera regressions, the native
build and source/output verification. Changed skill references cover final-phase
parsing, language continuity, QA attribution and automatic USB recovery. All
four edited skills validate; final source review and `git diff --check` pass.

Retained evidence is byte-verified in the [manifest](../../.artifacts/realtime-retest-2026-10-12/manifest.json).
Earlier screenshots were reviewed on the virtual display before marked cleanup;
the final three runs produced no screenshots. Completed isolated QA data was
removed through the marked review/cleanup tool. Normal Raven remains stopped
with the TV off; the production TV policy and operator v17 config are preserved.

## Focused research

The current [OpenAI voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
supports short, labeled instructions, removal of conflicts, explicit preamble
policy and consistent reply language. Generation phases do not establish
speaker playback alignment. Keep ordinary conversation independent of final ASR.
Structured output parsing has a different boundary: follow the SDK's
[documented final-phase selection](https://github.com/openai/openai-python/blob/main/helpers.md#parsing-responses-api-output),
without using commentary as a fallback authorization or memory proposal.

Jabra documents [full-duplex, beamforming, AGC and echo cancellation](https://www.jabra.com/_/media/Jabra_VXi_Product-Documentation/Jabra-Speak2-75/Technical-specifications/RevC/EN-Speak2-75-Tech-Spechs-180924.pdf).
Those capabilities do not establish wake accuracy on this acoustic route.
The installed decibri 5.7.0 AEC requires actual reference PCM; enabling its option
alone cannot cancel media. No device settings or firmware have been changed.

Read-only Jabra SDK 4.4.6 queries returned `automaticSpeechRecognition=[0]`
and `alwaysOnVoice=[1]`. `echoCancel` and `audioStreaming` reads were unavailable.
The SDK names these fields but the inspected documentation does not establish
their device-specific semantics or valid writes; no speculative setting change
was made. The earlier description of the first field as "off" was an inference,
not a verified interpretation. The experiment instead uses decibri's documented
reference API with bounded RAM-only audio and explicit microphone handoff.

## Evidence boundary

Retain metadata and full failed test output only. Conversation text, generated
audio, images, private references and embeddings stay out of retained evidence.
The [Oct 11 field ledger](realtime-field-followup-2026-10-11.md) remains the
previous result, not fresh acceptance. TV power, physical Flic and 24-hour soak
acceptance require their own conditions and are not implied by this session.
