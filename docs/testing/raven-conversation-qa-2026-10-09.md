# Raven real conversation QA — 2026-10-09

Status: real-provider QA has exposed and repaired defects; complete live acceptance
has not yet been established. Dates in artifact names are UTC; the final checks
continue on October 10 in Taipei.

The user authorized real API conversations with the published Raven and repairs
to conversation/media behavior. This suite uses the active Raven persona, Cedar
voice and effects, imported Raven rig, presentation, wake/sleep phrases and
versioned model settings. It does not substitute Ren or a generic QA persona.

## Reproduction

Preserve operator edits and quit the ordinary Electron instance first. Do not
overlap this run with normal Electron, other Electron QA, or the full test suite.
From the canonical Mac checkout:

```sh
npm run build
node scripts/run-raven-conversation-qa.mjs
```

A focused repeat accepts `--scenario` with a fixture scenario ID,
`additional_capabilities`, or `camera`. It records the selection; a focused pass does not
establish full-suite acceptance. Normal Raven must be restored through the
existing LaunchAgent after QA. No model/dependency change or phase promotion.

## What the test exercises

The runner copies published public avatar settings/assets into an isolated
user-data directory, with generated local media and a mock hardware spell.
macOS synthesizes English/Traditional Chinese visitor speech entirely in RAM.
The renderer sends actual audio through its production WebRTC connection. Real
provider ASR and Raven responses invoke the production shared tool catalog,
authenticated IPC, folder discovery, YouTube search and visible official player.
The harness does not inject final transcripts, user text, tool results or playback
requests into the model conversation.

Nine scenarios contain 41 turns: contextual empathy/helpfulness and corrections;
local aliases and ambiguity; English/Chinese local-only and retained scope;
unspecified-source local-first fallback; explicit YouTube once/loop; local loops;
identity denial; automatic and explicit memory across two separately confirmed
visits; and sleep/exact spell controls. Additional checks exercise real own/shared
folder indexing, a camera question using a generated shapes image, and spoken
interruption with live Raven lip movement and follow-up quality.

Actual playback receipts, completion, restored avatar visibility, loop crossings,
microphone release and wake capture are checked separately from generated speech.
Loop interruption plays synthesized wake speech through the selected output into
the native wake microphone/detector. A failed wake remains failed even if operator
recovery permits later independent cases to continue.

The configured Responses model grades the observed dialogue in RAM against
semantic criteria and 0–4 quality dimensions. Strict parsing rejects missing
turns, unknown fields, free-form output and contradictory pass flags. A grade
cannot substitute for successful runtime checks.

## Evidence and limits

Each run creates `.artifacts/phase4-qa/<timestamp>/` with stamped build provenance,
the original published configuration/avatar fingerprints, metadata-only checks,
validated quality verdicts and an avatar-only screenshot. Generated dialogue,
audio, tool payloads and judge input are never written as evidence. Distilled
synthetic memories may exist in the isolated Main database; ordinary operator
memories are not copied or read.

The camera image and hardware effects are fixtures. Identity denial uses a spoken
name candidate, not actual face recognition/enrollment. Synthesized acoustic wake
coverage is not human far-field acceptance. This run does not prove portrait
framing, physical speaker quality, camera hardware, fog/lights, TCC/signing,
packaging or subjective human conversational preference. Failures and unexecuted
boundaries must remain explicit in the final run report.

## Repairs and regression evidence

- Local discovery tolerates extra wording around a literal multiword or Chinese
  alias and reports tied top candidates explicitly. It preserves all candidates;
  Raven asks for the distinguishing clue instead of picking the first result.
- Source enforcement recognizes more English/Chinese local-only requests,
  negation and incidental YouTube mentions. New requests cannot inherit stale
  permission to skip local lookup.
- Spoken instructions require the current language, useful concrete help,
  corrected facts and silent tool invocation. Declining playback is distinct
  from stopping existing playback. Accepted stops suppress an SDK follow-up;
  ignored/failed stops permit an answer. Camera success permits a visual answer
  instead of returning a contradictory silence directive.
- Memory interpretation exposes only allowlisted failure reasons and has an
  eight-second bound. Answer handling has a twenty-second speech-to-confirmation
  bound and binds replies to their input item. Main derives a candidate name
  from the actual introduction; spelling differences in a model tool argument
  cannot prevent the application question. This does not confirm identity.
  A unique stored name differing only in whitespace is proposed using its
  existing label; exact labels win, ambiguous candidates are never selected,
  and no records are merged or retrieved before confirmation.
- Semantic recall timeout still permits bounded keyword retrieval. Control-turn
  exclusion preserves other eligible learning evidence. A committed memory
  correction still requires clean-session replacement after newer speech.
- QA waits for pending tool results and SDK follow-up responses, attributes late
  events to their originating turn, accepts legitimate cached media selection,
  verifies folder asset IDs, and skips dependent checks after failed prerequisites.
  It retains failed verdicts rather than treating operator recovery as success.

The final affected Node regression set passes **376 tests in 16 files**
(`/tmp/mm-raven-regressions-final-complete.log`), including the real SQLite
pipeline, owner-switch and formatting/stale-candidate cases.
It covers the tool SDK boundary,
matching/source policy, folder access, confirmation/ownership/learning, memory
IPC and boot IPC, plus the fixture/parser/probe. Node/web typechecks and production
build pass. No dependencies, pinned model IDs, operator settings or phase status
were changed. Invariants 1–12 were checked within these affected boundaries;
physical wake acceptance is separate.

## Retained live results

All runs use real synthesized speech, real WebRTC/ASR, the published Raven, real
OpenAI calls and configured YouTube search. No user text is injected into the
model. Aggregate runtime/quality metadata is in each linked `raven-results.json`.

| Run | Evidence and outcome |
| --- | --- |
| Initial broad run | [15:17](../../.artifacts/phase4-qa/2026-10-09T15-17-34-317Z/raven-results.json): failures retained; exposed alias, ambiguity, source, quality and harness issues. |
| Integrated rerun | [15:59](../../.artifacts/phase4-qa/2026-10-09T15-59-56-243Z/raven-results.json): bilingual empathy/correction quality passed; local-first YouTube fallback, YouTube once/loop, local loop and barge-in runtime passed. Other quality checks and prerequisites failed; not full acceptance. |
| Local matching | [16:27](../../.artifacts/phase4-qa/2026-10-09T16-27-56-582Z/raven-results.json): alias, clarification, selected piano and once completion/return passed. A play preamble and a negative-playback stop mistake failed quality; subsequent stop/catalog repair requires its focused result. |
| Folder and interruption | [16:34](../../.artifacts/phase4-qa/2026-10-09T16-34-33-389Z/raven-results.json): exact own, Chinese and shared-folder playback passed; live interruption/lip movement and useful follow-up passed. Camera description failed. |
| Camera diagnosis | [16:39](../../.artifacts/phase4-qa/2026-10-09T16-39-21-037Z/raven-results.json): exact ASR, accepted capture and audible response, but no correct visual answer. The contradictory camera success speech contract was repaired afterward. |
| Camera repair | [16:47](../../.artifacts/phase4-qa/2026-10-09T16-47-28-439Z/raven-results.json): all five checks pass, including both shapes/colors and their positions, accepted image capture, real audio route and clean release. |
| Two visits after repairs | [16:40](../../.artifacts/phase4-qa/2026-10-09T16-40-52-521Z/raven-results.json): both confirmations, automatic/explicit writes and recall tool routes completed. Quality failed on return identification and all three recall answers. This is not cross-visit recall acceptance. |
| Local conversation after repair | [16:48](../../.artifacts/phase4-qa/2026-10-09T16-48-21-889Z/raven-results.json): every runtime case passed, including negative and quoted playback. Clarification, selection, once return and follow-up conversation passed quality. A spoken preamble before alias playback still failed the silence criterion. |
| Same-scope memory repair | [16:52](../../.artifacts/phase4-qa/2026-10-09T16-52-41-556Z/raven-results.json): all runtime checks pass, including the explicit same-name assertion, separate confirmation and three recall turns. Eight of ten turns pass quality. Material recall is incomplete and commitment recall is flagged for an invented fact; full quality acceptance still fails. |

The initial full run completed both identity confirmations, automatic learning,
explicit save and recall calls, but did not pass conversation grading. The
integrated run exposed an interpreter timeout; [16:32](../../.artifacts/phase4-qa/2026-10-09T16-32-55-874Z/raven-results.json)
then exposed an identification rejection. Their dependent cases remain
unexecuted, not passed.

The final memory run's [scope audit](../../.artifacts/phase4-qa/2026-10-09T16-40-52-521Z/identity-scope-audit.json)
found two names differing only in whitespace: three records in the first scope,
none in the second. Only counts and comparison booleans were retained. This
explains the empty return lookups. The harness now requires the same Main-derived name on return and
stops dependent checks on mismatch; it cannot call two different confirmed
scopes a successful two-visit test. The subsequent Main formatting-candidate
repair preserves exact labels and verbal confirmation; no fuzzy identity merge
or confirmation bypass was introduced. The [post-repair content audit](../../.artifacts/phase4-qa/2026-10-09T16-52-41-556Z/memory-content-audit.json)
confirms one scope and three records, with both material choices and both reasons
present in stored summaries. The incomplete spoken material answer therefore
remains a quality failure. Grading of the earlier run also flagged tool preambles, language drift and an
invented/incomplete recall answer; successful IPC is not conversational success.

Acoustic loop trials received fresh native PCM blocks but measured zero RMS/peak
and no detections during synthesized speaker playback. Output-to-microphone
delivery was not demonstrated, so these trials establish neither a working nor
a broken acoustic detector. The October 4 human wake confirmation is historical.
The synthetic exact spell was not recognized; exact-match authorization was
preserved, with no fuzzy bypass. Hardware wake and exact spoken spell acceptance
remain unresolved for this run.

Official documentation lists image input for the pinned
[GPT-Realtime-2.1 Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini),
and the installed SDK sends the documented
[Realtime image message](https://developers.openai.com/api/docs/guides/realtime-conversations#image-inputs).
Model capability support alone is not evidence that this application's visual
answer works; the live result remains the acceptance criterion.

## Deployment

Source commit `7f6b377` was rebuilt and restored through the existing LaunchAgent,
PID **50961**. Main and both renderers report Ready; fresh events confirm Dormant,
the media-folder index and local wake listening. The five operator configuration,
audio and folder hashes are unchanged. [Deployment metadata](../../.artifacts/raven-conversation-2026-10-09/deployment.json)
and [startup events](../../.artifacts/raven-conversation-2026-10-09/runtime-start-events.json).
Normal Raven remains running. This deploys the verified repairs; it does not
declare full conversational or acoustic acceptance.
