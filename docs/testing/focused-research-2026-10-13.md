# Focused reliability research — 2026-10-13

This round challenges both the implementation and the measurement. TV remains
off; the authorized isolated LaunchAgent runs use the real provider, Jabra and
camera where specified. Conversation speech, transcripts and camera images stay
in RAM. Production model configuration, voice, persona and TV policy are unchanged.
No phase or human acceptance is implied.

## Changes justified by evidence

- Camera recovery now has an independent four-second reset-command deadline.
  A helper whose capture queue cannot service recovery is retired; Main waits
  for its actual close before a replacement resets the exact camera before
  opening capture. The existing two-attempt budget, ten-second spacing and
  healthy-stream rearm remain. This bounds a credible hang path; it is not a
  claimed fix for the observed invalid USB payloads.
- Main now reports bounded identity equality/formatting comparisons and
  interpreter failure stage, HTTP/status, size and elapsed-time categories.
  No name, response body or private text enters diagnostics. Matching and consent
  rules are unchanged; no fuzzy private-profile selection.
- Two-visit QA now rejects a wrong first identity before confirming or learning.
  One explicit denial and spelled introduction may recover a proposal; a fresh
  delivered question and later separate confirmation remain necessary. The
  original failed row remains failed. Failed learning prerequisites skip recall.
  A further audit found that keyword presence alone did not prove learning had
  settled. The gate now also requires a Main-only boolean covering observation
  awaits, queued batches and active consolidation/commit, without forcing a flush.
- A local media miss now asks once for another title, alias or artist. A corrected
  clue stays local, and a second miss ends the lookup. Public names are listed
  only on request, at most three. No new tool or speculative playback route.
- New controls isolate camera delivery, acoustic levels and grader calibration.
  Comparison provenance now includes the dialogue measurement-probe hash.

## Camera: application processing is no longer the leading explanation

Production native QA `2026-10-13T10-11-29-028Z` fails: 2/6 requested snapshots,
two resets inside the attempted stability window. Last frame to reset request
is 2.948 s; request to first new frame is 2.841/2.938 s. Release begins in 6/4 ms,
native USB entry in 66/50 ms, completion in 136/120 ms. The stream stalls again.
These timings do not demonstrate a blocked reset queue in this sample.

The same signed production helper and LaunchAgent, with Vision, JPEG and pixel
copying bypassed, fails the 60-second control
`2026-10-13T10-41-06-077Z`: three sampled fresh-frame receipts, only two of twelve
five-second observation windows with receipts, 48.035 s maximum gap, two resets.
The callbacks require advancing source timestamps. Counts are throttled receipts,
not camera FPS. macOS reports invalid payloads in all three corresponding UVC
summaries: 2089/2112, 2600/2640 and 2161/2640 packets.

Read-only UVC GET controls confirm YUY2 640×480, 666666 × 100 ns interval,
614400-byte frame limit and 1600-byte payload limit, matching the request.
Advertised isochronous capacity is sufficient by arithmetic; this is not a
measurement of successful USB traffic. USB version is 2.0; `bcdDevice=0100`
is not verified firmware identification. No firmware was flashed or driver detached.

Three standalone minimal Swift probes delivered zero frames. Their signing and
launch context differ and they produced no matching UVC summaries; they are
**inconclusive controls**, not independent proof of a driver defect. The matched
helper control above supplies the useful processing discriminator.

Conclusion: removing our image-processing work does not restore delivery.
Device firmware, USB transport and Apple's current UVC parser remain unresolved.
Public FFmpeg/OpenCV macOS paths also use AVFoundation; changing wrappers does
not provide an independent driver. Public Linux/libuvc parser checks cannot define
Apple's invalid-payload counter. More unchanged resets or format guesses add little.
The next useful boundary is packet/header/transfer-error evidence or a controlled
alternate device/host, not an assertion that software reset power-cycles USB.

## Wake: level is relevant, but the test cannot prove the entire cause

Native Mac speakers deliver synthetic visitor speech; Jabra plays a speech bed
and supplies the microphone. Production conditioning and keyword settings remain.
Each cell alternates three positive trials and three near-negative trials. Source
PCM gain is bounded by clipping headroom, about +2.17 dB for the wake phrase.

| Condition | Original Mac level | Mac level raised by 10 dB |
| --- | --- | --- |
| Quiet, original stimulus | 3/3 | 3/3 |
| Quiet, raised PCM | 3/3 | 3/3 |
| Jabra output open with digital silence | 2/3 | 3/3 |
| Speech bed at 0.07 gain, original stimulus | 0/3 | 0/3 |
| Same bed, raised PCM | 0/3 | 0/3 |
| Speech bed at 0.007 gain, raised PCM | 2/3 | 3/3 |

All 36 near-negative trials across these runs produce no false wake. The loud
run restores the exact original Mac scalar afterward; Jabra levels are unchanged.
Runs: `2026-10-13T10-02-51-475Z`, `2026-10-13T10-21-29-867Z`.
Captured dBFS measures digital energy, not acoustic SPL or simultaneous SNR.
Fresh-stream replay and live decoding have different prior acoustic context;
their one disagreement does not itself prove dropped audio.

An additional loud-stimulus ASR control, `2026-10-13T10-43-36-196Z`, again has
quiet 3/3, original speech bed 0/3, quieter bed 3/3, negatives 0/9. Unhinted
configured transcription recognizes the clean source by approved pronunciation
equivalence but fails equivalence on the quiet microphone sample as well as the
two playback samples. Because its acoustic positive control fails, it cannot
localize the wake miss to detector versus delivered speech. No cloud wake fallback
is introduced. Synthetic visitor and background use the same TTS voice; these
are stress samples, not representative human-microphone acceptance.

Jabra Direct reports firmware 2.54.0, matching the current official release.
CoreAudio reports Jabra input mono 32 kHz, output stereo 48 kHz; native conversion
and exact output format are accounted for. Vendor AEC/full-duplex claims do not
establish double-talk performance on this route. Production AEC remains unchanged.

## Identity, memory and judgment

Two-visit QA `2026-10-13T10-27-58-667Z` reaches every recall turn. Both first and
return proposals match the intended person; no spelling recovery is exercised.
Main safely resolves a formatted return-name difference. Automatic learning,
explicit save, visit closure and new-session confirmation execute. Material and
preference recall pass semantic criteria; corrected commitment fails. Overall
graded quality is 5/10, with tool preambles/mechanism narration among failures.
The correction turn also receives `asr_changed_meaning`. This sample does not
prove which factual boundary failed, or erase the two older identity failures.

Grader calibration `2026-10-13T10-42-21-441Z` passes 10/10 expected classifications:
four good answers, four bad answers and two bad answers carrying instructions to
the grader to mark them passed. It uses the unchanged v8 criteria and configured
judge. Creative imagery passes; invented shared history and missing requested
correction details fail. However, its invented-history cases also receive
`private_context_leak` despite no private context being supplied. Diagnostic codes
are investigative hypotheses, not independently verified causes. Calibration
does not retroactively validate unknown historical wording.

The conversation probe observes provider audio-buffer events, not physical
speaker delivery. Continuous-buffer attribution is an inference; a started,
later cancelled response can include text that was not fully heard. Keep these
limits distinct from model quality. Mixed-language synthetic utterances currently
select the Chinese TTS voice when they contain Han characters; this is another
stimulus limitation, not evidence that it caused the archived failure.

## Current primary research

Sources checked October 13, 2026; applicability matters more than recency alone.

- [OpenAI voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting):
  start simple, resolve conflicts, use explicit triggers/exceptions and evaluate
  small changes. It supplies no universally optimal prompt length or tool count.
- [Realtime evaluation](https://developers.openai.com/cookbook/examples/realtime_eval_guide)
  and [evaluation practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices):
  inspect harness errors, separate audio from transcription, calibrate graders
  and include adversarial examples. Transcript grades cannot certify vocal acting.
- [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
  versus [Realtime client events](https://developers.openai.com/api/reference/resources/realtime/client-events):
  standalone transcription and conversational-session fields have different
  documented support. Do not copy a new delay option into another endpoint's
  production configuration without its own acknowledgement test.
- [Jabra support](https://www.jabra.com/supportpages/jabra-speak2-75) and
  [technical specification](https://www.jabra.com/_/media/Jabra_VXi_Product-Documentation/Jabra-Speak2-75/Technical-specifications/RevD/EN-Speak2-75-Tech-Spechs-150125.pdf):
  firmware and device DSP facts; no proof of this test route's acoustic quality.
- [Decibri AEC](https://decibri.com/docs/audio/aec),
  [Snowman experiments](https://github.com/herrkaefer/snowman/blob/master/realtime/README.md):
  reference gain/timing and preserved near-end speech matter. Measurements on
  another board/microphone cannot justify enabling its cancellation settings here.
- [Apple capture setup](https://developer.apple.com/documentation/avfoundation/setting-up-a-capture-session),
  [OpenCV macOS backend](https://github.com/opencv/opencv/blob/a16c4a9fe22a5e0aec30e4a02e9ee98c026bbc5d/modules/videoio/src/cap_avfoundation_mac.mm),
  [Arducam wrapper](https://github.com/ArduCAM/ArducamUVCPythonDemo/blob/main/camera.py):
  capture ownership and queueing matter, but release/reopen is not sustained recovery.
- [macuvc](https://pypi.org/project/macuvc/),
  [uvc-avf](https://github.com/VimalMollyn/uvc-avf): read-only endpoint-zero UVC
  inspection offers a discriminator. Their different device/OS results do not
  establish compatibility with this camera. No package was installed.
- [Linux UVC parser](https://github.com/torvalds/linux/blob/a3d78e74dd3ed04797ea351edb7f0a19b961c063/drivers/media/usb/uvc/uvc_video.c),
  [libuvc parser](https://github.com/libuvc/libuvc/blob/d07de4fa23905ee8cac06f5d24b2a03d42a3b363/src/stream.c):
  header length, ERR/FID/EOF and transfer failures are useful discriminators;
  Apple's deployed parser and counter definitions remain unavailable.

## Matched model and capability results

Capabilities `2026-10-13T10-46-12-493Z`: **10/10 runtime checks pass**, including
Chinese folder playback, renderer WebGL recovery, fixture-image grounding,
interruption and release. The title succeeds initially; the new clarification
branch is not exercised. Camera grounding here uses a synthetic image and says
nothing about native camera reliability.

| Frozen character case | Mini | Full |
| --- | --- | --- |
| Run | `2026-10-13T10-48-28-456Z` | `2026-10-13T10-54-18-884Z` |
| Overall dialogue quality | 8/10 | 10/10 |
| Character | 9/10 | 10/10 |
| Runner exit | 2 | 0 |

Prompt, tools, rendered prompt, rubric, measurement probe, cedar voice and low
effort match; only the versioned dialogue model trial changes from
`gpt-realtime-2.1-mini` to `gpt-realtime-2.1`. Mini fails local-miss handling and
precise correction. Both runs receive an ASR-change diagnosis on correction,
but full answers correctly. This is evidence that dialogue-model capability
matters and that final ASR does not fully describe native audio understanding.
One matched pair does not establish a stable win rate or justify claiming all
memory/device failures are model limitations. Production remains mini; the full
model is the strongest next candidate for repeated held-out dialogue trials.

The memory, mini and full screenshots were inspected: Raven renders visibly on
black without an error overlay. This landscape capture proves basic presentation,
not portrait-TV acceptance, motion quality or physical audio.

The memory audit found no demonstrated revision-overwrite defect. Its corrected
deadline is inside one utterance, so the case does not exercise replacement of
an already persisted old commitment. Field-level ASR → committed summary → recall
→ reply comparison remains the next factual discriminator; retained diagnostics
alone cannot reconstruct it. The new settled gate proves current inactivity,
not correctness of committed content.

Evidence is under [focused research artifacts](../../.artifacts/focused-research-2026-10-13/).
## Final memory-gate retests and limits

`2026-10-13T11-00-05-299Z` fails before learning: the proposed identity is correct,
but `memory_dialogue_failed` and `memory_question_rejected` prevent question
delivery acceptance. Confirmation, learning and recall are correctly skipped.
The generic event does not distinguish an unexpected response, altered question,
playback interruption or state-update failure. No provider error is recorded.

One bounded retry, `2026-10-13T11-03-18-500Z`, delivers the question and confirms
identity. The ordinary biographical “I remember…” turn incorrectly takes
`memory.remember`; metadata records `memory_learning_invalidated;count=1` and
`memory_saved`. Final ASR differs from the scripted request. A later correction
is automatically committed. The stricter learning barrier still fails and skips
explicit save, return visit and all recall grades. These runs do not provide a
new recall pass. The original overall failed rows are retained.

The gate's queue and keyword subconditions were not separately retained in that
retry; their exact failing combination remains unknown. Future artifacts now
record four bounded flags (settled, listing accepted, material present, samples
present). Presence checks are fixture guards, not semantic correctness. The
45-second QA wait is not a production completion SLA; automatic debounce and
multiple bounded extractor calls can consume it. No timeout was blindly extended.

Direct interpreter control `2026-10-13T11-16-45-190Z` passes **6/6**: exact fixture
biography, third-party quotation and negated save/deletion are unauthorized;
explicit save/deletion are authorized. Calls use the configured Main interpreter
and fixed public text; no write/delete executes. This does not replay the live
ASR or exact model-proposed payload and cannot prove why the earlier write was
accepted. The observed invalidation of pending automatic evidence is real; which
facts were lost or replaced is not established. Do not silently equate this with
a wrong-person write or claim the entire interpreter is broken.

Judgment: full dialogue is a promising next candidate; camera/USB and acoustic
delivery remain separate. Memory still needs field/turn attribution and a
specific confirmation-delivery failure reason. More blanket prompt rules or
another unchanged full conversation would not resolve those boundaries.

## Verification and handoff

- Final `npm run typecheck`, `npm run build`, `npm test`: exit 0. Full suite:
  **2,143 passed, one skipped**, 187 files passed/one skipped; 74.19 s.
  Focused worker checks and their initial failures remain in `worker-evidence`.
- Native Swift static check passes. Physical camera and wake failures above
  remain failures; neither the unit suite nor build overrides them.
- Final incremental changes reviewed; `git diff --check` passes. Four skill
  frontmatters validate with installed `js-yaml`; local documentation links pass.
  The bundled Python skill validator could not run because PyYAML is absent;
  no dependency was installed. The attempted Node `yaml` parser was also absent;
  these tooling failures are retained in `skill-validator-limitation.txt`.
- Both later memory screenshots were also inspected with the same basic visual
  finding. Screenshot hashes/findings are in `visual-review.json`; no physical
  TV or human-listening acceptance is claimed.
- Final runtime check at **19:19 Taipei**: zero normal/QA Electron processes,
  zero camera helpers; production Raven v18, active=draft, previous=v17,
  mini/low, cedar and configured memory/transcription models unchanged.
  TV policy remains installed; original Mac stimulus volume was restored.

Changed production paths are the native camera/tracker recovery, memory intent
diagnostics and relationship comparisons, the observational learning-state getter,
and two catalog media-miss instructions. Other source changes are isolated QA
controls, prerequisite checks and provenance. Domain references/DECISIONS record
the reusable conclusions; [open issues](open-issues-2026-10-13.md) is the compact
next-research entry point. No dependency, runtime model configuration, operator
persona, phase status or unrelated uncommitted work was replaced.

The [archive manifest](../../.artifacts/focused-research-2026-10-13/manifest.json)
maps all thirteen runner executions to metadata evidence, including every failed
run. Owned scratch review/removal receipts are recorded separately in
[cleanup.json](../../.artifacts/focused-research-2026-10-13/cleanup.json).
