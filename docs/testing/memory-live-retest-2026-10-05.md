# Three authorized live memory rounds — 2026-10-05

**Live acceptance failed.** All three newly authorized rounds were used; no fourth
API run was made. One round completed both visits but missed a stored commitment.
The other two stopped at identity setup. Normal Raven was restored afterward.

## Route and evidence

Each round used `node scripts/run-phase4-qa.mjs --memory-conversation`, a verified
production build, an isolated synthetic profile/database, real WebRTC, generated
microphone audio, provider ASR, production identity/tools and background memory.
No user text, transcript events, memory writes or tool results were injected.
The first conversation closed before the return visit. This is production-route
integration evidence with a synthetic companion, not Raven persona acceptance or
physical Jabra microphone/speaker acceptance.

The fixture retains the larger museum-designer background and changed deadline.
This retest changes confirmation to “That's me, Alex” and includes “I remember
building theater sets” in ordinary biography. Both are regression probes for the
prior implementation. Full synthetic recording remains confined to explicitly
authorized isolated QA; normal visitor diagnostics remain metadata-only.

| Round | Result | Duration | Reported Realtime tokens | Full exchange |
| --- | --- | --- | --- | --- |
| 1 | Confirmation classified unclear; stopped | 73.3 s | 7,324 | [Transcript](../../.artifacts/phase4-qa/2026-10-05T14-02-13-564Z/full-transcript.md) |
| 2 | Both visits completed; commitment recall failed | 244.8 s | 38,030 | [Transcript](../../.artifacts/phase4-qa/2026-10-05T14-05-47-696Z/full-transcript.md) |
| 3 | Identification interpretation unavailable; stopped | 71.3 s | 6,342 | [Transcript](../../.artifacts/phase4-qa/2026-10-05T14-11-53-695Z/full-transcript.md) |

All runners exited 2. Total reported Realtime event usage is **51,696 tokens**;
this excludes Responses interpretation/extraction and is not a billing statement.
Each run directory retains evidence, build provenance, full transcript JSON and
synthetic fixture. [Aggregate metadata](../../.artifacts/memory-live-retest-2026-10-05/run-summary.json).

## Findings and bounded repair

**Round 1:** ASR correctly recognized the natural affirmative, but Main returned
`memory_confirmation_unclear`; no private brief was installed. The generated
reply then sounded like a successful introduction without describing the memory
limitation. Pre-tool thinking narration also remained. There were no Realtime
provider error events.

The interpreter previously received instructions for all three tasks together.
We separated its confirmation, request and introduction instructions and clarified
that short answers refer to the just-delivered question. This is a contextual
prompt change, not an accepted-phrase whitelist. The exact model rationale for
round 1 is unknown; improvement after this change does not establish causality or
general semantic accuracy. A local red→green transport regression checks that
confirmation receives no competing request-task instructions. The three focused
intent/relationship/session files pass **29 tests**.

**Round 2:** The same affirmative succeeded in both visits. Main confirmation
followed completed ASR by **2,254 ms** and **1,854 ms**; these measurements include
Main processing and are not human-perceived response-onset latency. Both policy
disclosures were correct. The biography containing “remember” produced useful
summaries, including the theater history. Six summaries were present before the
return visit, including the correct commitment, changed deadline and explicit
non-completion. The unsolicited `remember` call returned
`memory_action_not_requested`; the avatar did not falsely report a save failure.

Material recall correctly named recycled cork, glare and carrying advantages over
acrylic. Commitment recall incorrectly said no specific promise/date was recorded,
although the stored commitment contained two cork samples for Maya, Saturday
afternoon, not yet delivered. The call returned `memory_recalled`. That run
recorded result codes and confirmed-state installation counts, but not exact
returned entries or installed private reference content. Therefore it cannot
distinguish retrieval omission from model failure to use supplied context.

Conversation quality also failed manual review: the background reply was lengthy,
the project reply introduced an unnecessary Friday-versus-Saturday work question,
and commitment recall began with “Let me pull up” narration. Grouped replies
averaged **35.25 words**, maximum **77**. The automated `clean` check missed that
narration wording, demonstrating why its passing flag is not sufficient. The
material reply also added an inference about van/assembly suitability beyond the
visitor's explicitly stated material-selection reasons. No completed delivery or
testing was falsely claimed.

**Round 3:** The QA capture was extended to retain the exact synthetic tool
arguments/results, installed memory state and output start/stop/clear events.
Production conversation behavior was unchanged from round 2. Identification
returned `memory_interpretation_unavailable` about **5.75 seconds** after the
recorded tool call. The failure reason currently collapses network, timeout and
response-validation failures; it does not establish which occurred. The configured
HTTP timeout is six seconds, but calling this a proven timeout would be a guess.
No identity question was delivered, so the harness correctly withheld confirmation
and stopped. It did not reach the intended retrieval diagnostic. Thinking
narration and a long explanation of internal identification trouble persisted.

## Final state and next work

Source changes this retest: task-specific interpretation instructions in
`src/main/memory/intent.ts`, its focused regression, the two synthetic fixture
phrases, and QA-only capture in `src/main/memory-conversation-qa.ts`.
Node/web typechecks, final production build and diff checks pass. Earlier passing
checks for unchanged memory storage and ownership code remain applicable; no full
Electron suite ran alongside live QA. No model/config/dependency/schema change,
commit, push or phase promotion was made.

Normal Raven is restored through the sole LaunchAgent, **PID 52931**. Console
verified Dormant/Ready, Raven, published v15 and no needs-attention entries; it was
hidden through the menu afterward. All three saved operator config hashes match
the pre-test snapshot. [Restoration evidence](../../.artifacts/memory-live-retest-2026-10-05/runtime-restored.json).

Next investigation should distinguish interpreter timeout/transport/schema
failures with content-free reason codes, and use the added synthetic capture to
trace a missed commitment from storage through retrieval and installed context.
Then address conversational verbosity/narration against actual generated replies.
There is no remaining live-run allowance from this request. Chinese disclosure,
corrections beyond 100 records, arbitrary large user Markdown and human acoustics
were not exercised by these live rounds; their prior local checks are not live
acceptance. Invariants 1–6 and 8–12 remain the relevant boundaries; exact spell
authorization (7) was unchanged and not exercised.
