# Two real audio conversations: memory judgment

**Persistence and recall passed. Natural conversation quality did not pass.**
This was the user-requested focused test: a substantial invented visitor
background, a conversation, normal disconnect, then a fresh conversation asking
related questions. The user explicitly authorized real API calls and recording
the complete synthetic transcripts. Normal visitor recording remains disabled.

## What actually ran

- Mac canonical checkout; isolated QA avatar, user data and initially empty memory.
- Visitor Alex Morgan: Portland museum exhibit designer, former touring set
  builder, sister Nina, retired science-teacher father, elderly dog Miso, quiet
  river walks, careful design habits, and a traveling exhibit with practical
  constraints and a colleague commitment. About 230 words of background were
  spoken across two substantive turns; none was preloaded into memory.
- Avatar Rowan: a warm, practical companion instructed to use one or two short
  sentences. Runtime model IDs stayed unchanged.
- Eight visitor utterances across two distinct WebRTC connections. The Console
  Start Conversation and Disconnect controls drove production lifecycle actions.
  Both transports closed and microphone tracks ended.
- Local AVSpeechSynthesizer audio replaced only the microphone source. The real
  provider performed VAD, transcription, tool selection and speech generation.
  Main performed identity confirmation, automatic extraction, SQLite persistence
  and retrieval. No user-text events, ASR events, memory writes, tool results or
  response requests were injected.
- First-session extraction produced seven distilled records. A read-only Console
  check waited for the project and commitment summaries before starting visit 2.
  It did not send those records to the model; the production confirmation and
  memory retrieval paths did that.

Final command: `node scripts/run-phase4-qa.mjs --memory-conversation`.
Exit **0**, seven checks passed, eight real ASR completions, two connections,
zero injected user-text items, zero provider errors. Duration **266 seconds**,
including local synthesis, replies, extraction and clean shutdown.

## Full-transcript judgment

| Check | Actual second-session answer | Judgment |
| --- | --- | --- |
| Material and reasons | Recycled cork panels; reduced glare; easier for volunteers to carry; small-van constraint | Correct; both reasons survived summarization and the session boundary. |
| Promise and timing | Two recycled cork color samples for the colleague's label colors, by Friday afternoon | Correct; quantity, purpose and deadline survived. |
| Unsupported extra precision | Added October 9, 2026 to Friday afternoon | The extractor resolved the relative date using the test date. That is consistent here, but the visitor never explicitly spoke the calendar date. |
| Confirmation dialogue | Repeated permission questions after Main had accepted the separate yes | Poor dialogue; the user-facing question did not consistently explain the actual pending identity confirmation. |
| Memory policy explanation | Said it could not save automatically without an explicit request | Incorrect: the new scope was automatic, and seven summaries were saved. |
| Short back-and-forth | 39–63 avatar words per visitor turn, mean 51, including pre-tool speech | Too verbose for the intended compact style. |
| Grounding during first visit | Said “You've already tested the visuals” | Unsupported; the visitor described comparing materials, not completed visual testing. |

The two factual recall questions passed manual review against the **actual** ASR
transcript and saved summaries, not just the intended script or keyword checks.
The second session used real `memory` recall calls and received `memory_recalled`.
The brief and archive both remain production mechanisms; this case does not prove
retrieval from a large archive, long-term stability, cross-person isolation, room
acoustics, speaker quality, or human conversational acceptance.

The next dialogue work should make confirmation and policy disclosure accurate,
remove repetitive pre-tool filler, and enforce shorter turns. Another paid run
was not performed just to try for better wording.

## Defect found and repaired

The model attempted an unsolicited explicit save during ordinary conversation.
Main correctly rejected it with `memory_source_required`, but the renderer had
marked every memory tool call as a control turn, suppressing automatic learning.
A failing regression reproduced this. The renderer now leaves memory-management
classification to Main's actual visitor-text checks; sleep-control exclusion
remains in the adapter. The green regression and final live run verify learning
survives that rejected save. The shared speech rule also says to continue the
conversation normally and not expose internal source-reference errors.

Two harness defects were also repaired before final acceptance: the synthetic
microphone must continuously supply silence between utterances, and an empty TTS
buffer is not a sufficient completion signal on this Mac. The helper now waits
for the [utterance-finished delegate](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizerdelegate/speechsynthesizer(_:didfinish:)).
Its generated background/decision audio increased from truncated 12.7/13.5 seconds
to complete 35.4/40.9 seconds. The final ASR contains both complete passages.

Node/web typechecks and production build passed. **110 focused tests in six
files passed**, including the learning regression and speech-helper build-stamp
coverage. No full suite or extra paid acceptance run was needed.

## Evidence and usage

- [Full readable transcript](../../.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/full-transcript.md)
- [Raw transcripts, tool outcomes, VAD events and usage](../../.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/synthetic-conversation-transcript.json)
- [Automatically learned summaries](../../.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/synthetic-learned-summaries.json)
- [Final automated evidence](../../.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/evidence.json)
- [Normal app restored, configuration unchanged](../../.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/runtime-restored.json)
- [First failed audio-source run](../../.artifacts/phase4-qa/2026-10-05T05-59-00-537Z/evidence.json)
- [Failed learning run and partial-source transcript](../../.artifacts/phase4-qa/2026-10-05T06-00-50-977Z/synthetic-conversation-transcript.json)
- [Regression, build and full failure logs](../../.artifacts/memory-implementation-2026-10-05/)

Final Realtime response usage: **35,177 input tokens** (25,152 cached) and
**4,353 output tokens**, totaling 39,530. The two failed diagnostic attempts used
887 and 19,773 Realtime tokens respectively. These are provider-reported token
counts, not a dollar bill; configured Responses extraction and separate
transcription billing are not included in these response counters. Local speech
synthesis made no additional cloud TTS calls.

Full synthetic transcripts and summaries are local ignored artifacts, not part
of normal telemetry or committed conversation archives. The test records no
credentials or internal person IDs. Audio stays in RAM/pipes.
