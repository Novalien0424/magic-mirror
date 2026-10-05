# Conversation-quality implementation and bounded real-route QA

Implements the [source-grounded architecture review](../conversation-quality-architecture-review-2026-10-05.md). The existing Realtime models, local embeddings, private database schema and microphone/restart owners remain unchanged.

**Implementation and local checks are complete; full conversation-quality acceptance remains incomplete.** All three additionally authorized live tests were used. The final run completed both conversations and recalled every requested fact, but manual review found false save-failure commentary and unnecessary thinking narration. The save-result repair and corrected QA judgment pass local regressions; they have not received another live run.

## Delivered behavior

- **Confirmation is application-owned.** Main issues an opaque question token and exact catalog wording. The renderer waits for prior speech playback, acknowledges the provider configuration, then delivers the question. Main accepts a subsequent affirmative only after matching generated question text, the corresponding output start/stop, the existing processed-output tail, and a matching delivery receipt. Wrong questions, cancellation, expired/old operations, unrelated answers and session changes cannot unlock memory.
- **Policy and identity are synchronized even with an empty brief.** A serialized `session.update` carries the full persona/rules plus confirmed state, actual mode and bounded reference data. Provider acknowledgments must match the expected instructions and response setting. Private row/owner IDs are omitted. Confirmation alone temporarily controls automatic replies; ordinary conversation remains ungated. Missing configuration/answer completion and media interference have bounded clean-session recovery.
- **Disclosure is short and accurate.** Application-selected catalog lines describe automatic, explicit-only, off or temporary mode. They are delivered through the existing response-scoped speech builder. General conversation instructions prioritize short answers, useful examples, restrained follow-ups, no routine pre-tool filler and distinctions between plans and completed actions. Prompt inspection includes synthetic examples of the new paths.
- **Historical Markdown carries provenance.** Bounded chunks retain heading ancestry, source dates and speaker roles in RAM. Source time is separate from import time. Assistant-only proposals without visitor evidence and undated calendar proposals without a matching explicit date are rejected. Instructions retain uncertainty, cancellations, completion and corrections across chunks. Persona review remains separate; there is no database migration or raw-history archive.
- **The real test checks the actual exchange.** It waits for Main's production question-delivery receipt and checks the generated question before saying yes. The fixture includes a changed deadline and explicit non-completion. It judges both return-visit answers, policy disclosure, compactness and specific unsupported claims; a full transcript review remains necessary beyond those case-specific checks.

Implementation lives in `src/main/memory/{session,relationship,ipc,import,extractor}.ts`, `src/renderer/realtime/memory-dialogue.ts` and its adapter/tool bindings, shared prompt builders/catalogs/inspection, and the existing memory-conversation QA route. `speakVerbatim`'s scene callback was deliberately left unchanged: privacy confirmation has its own correlated delivery state rather than broadening an unrelated scene contract.

## Verification

TDD first reproduced acceptance of a yes before question delivery. New local coverage includes incorrect/stale delivery, expiry, unrelated answers, cancellation, all policy modes, empty briefs, missing and duplicate acknowledgments, absent transcription, media interference, pre-tool playback ordering and no duplicate follow-up. Import/extractor tests exercised historical context across chunk boundaries, role attribution, uncertain dates and revision handoff. Existing SQLite pipeline, ownership, prompt and adapter checks were retained.

Focused checks cover 128 tests across 13 files, using passing runs for unchanged portions. The final affected seven-file run passed 97 tests, including playback-order, unrequested-save and judgment regressions. Node/web typechecks, production build and whitespace checks pass. No full Electron suite was run alongside QA.

Metadata/local check logs are under [the task artifact directory](../../.artifacts/conversation-quality-implementation-2026-10-05/); the import worker's [completion report](../../.artifacts/conversation-quality-implementation-2026-10-05/import-worker-result.md) identifies its exact checks. Normal visitor diagnostics remain metadata-only. Full text below belongs only to the explicitly authorized isolated synthetic QA.

## First live attempt — retained failure

[Run evidence](../../.artifacts/phase4-qa/2026-10-05T08-34-16-711Z/evidence.json), [full synthetic transcript](../../.artifacts/phase4-qa/2026-10-05T08-34-16-711Z/full-transcript.md).

The first visit confirmed identity and learned the changed deadline. The second visit generated the intended question, then failed at `memory_conversation_return_confirm_response` (runner exit 2, 216.8 seconds). Metadata shows `memory_dialogue_failed` at the second affirmative's speech-start and no prior second-visit delivery receipt. No provider error was reported. The harness had treated generated text and any output stop as sufficient to answer, while production could queue the question behind pre-tool speech. The failed run also showed continued verbosity.

Repairs: wait for pre-tool playback before dispatching the question; wait for Main's actual delivery receipt in QA; use exact policy-disclosure wording; strengthen the ordinary-turn contract with compact examples. A focused regression covers the playback ordering. The single permitted retry uses the rebuilt final code, including the missing-transcription/media recovery guards.

First-attempt Realtime usage: **16,288 input (4,416 cached), 2,044 output; 18,332 total tokens**. This excludes background Responses extraction. The failure is preserved, not counted as acceptance.

## Retry — improved first visit, incomplete second visit

[Run evidence](../../.artifacts/phase4-qa/2026-10-05T08-43-11-964Z/evidence.json), [full synthetic transcript](../../.artifacts/phase4-qa/2026-10-05T08-43-11-964Z/full-transcript.md), [raw transcript/tool outcomes/timing/usage](../../.artifacts/phase4-qa/2026-10-05T08-43-11-964Z/synthetic-conversation-transcript.json).

The real first visit delivered the intended question, accepted the spoken yes, disclosed automatic summary memory accurately, learned four records and closed normally. Actual reply lengths were **4 words for identity, 17 for policy, 15 for the background reaction and 26 for the project reply**. The two substantive replies were substantially shorter than the previous attempt. The project reply suggested focusing on tested samples; it did not claim the visitor had already tested or delivered them. This is improvement in this fixture, not general human-quality acceptance.

The return visit made a `recall` call that failed argument validation. Metadata confirms `tool_arguments_rejected`; the tool result was the generic `memory_rejected`. The model then incorrectly described that rejection as absence of project memory. No second identity question was delivered, so the strengthened harness correctly withheld yes and stopped at `memory_conversation_question_playback` (runner exit 2, 182.8 seconds). It never reached the two recall questions. The captured call retained action but not its full argument shape, so the exact malformed field is unknown and is not guessed here.

The local follow-up distinguishes `memory_tool_arguments_rejected` from a completed empty lookup. Shared rules specify one corrected call with all required string fields and prohibit treating rejection as a search miss. A failing-then-passing regression proves invalid arguments cannot reach Main/storage and receive the distinct result. Future synthetic QA records argument field names/types for diagnosis without saving their values. **The model's response to this repair has not been live-tested.**

Retry Realtime usage: **16,254 input (5,824 cached), 1,473 output; 17,727 total tokens**. Both attempts total **36,059 Realtime tokens**, excluding background extraction. No third paid attempt was made: [AGENTS.md](../../AGENTS.md) says, “External/flaky actions get one retry at most, then the exact failure.”

## Additional authorized run 1 — complete route, incomplete detail

[Run evidence](../../.artifacts/phase4-qa/2026-10-05T10-13-53-477Z/evidence.json), [full synthetic transcript](../../.artifacts/phase4-qa/2026-10-05T10-13-53-477Z/full-transcript.md).

Both visits completed using two real WebRTC connections and eight actual audio/ASR utterances, with no injected text or provider errors. Both questions were delivered and confirmed; automatic policy was accurate. Five summaries retained the corrected Saturday deadline and explicit non-completion. The return visit used the confirmed brief directly, with no recall tool needed for these facts. Both identify calls were valid; this verifies the repaired path's successful use, not recovery from a freshly generated malformed call.

Material and both reasons were correct. The final answer was: “You promised Maya the cork color samples by Saturday afternoon, and you still need to test the visuals too.” It omitted **two**, so the unchanged strict judge rejected commitment completeness. Reply groups averaged 17.625 words (maximum 21), but two identity turns included unnecessary preparation/thinking narration. The full transcript contains no unsupported completed-action claim. Runner exit 2, 186.7 seconds; this is not an acceptance pass.

The follow-up prompt change preserves quantities, recipients, current deadlines and reasons when relevant, while removing generic reassurance. The shared tool description now explicitly requires silence before calling; no runtime tool gate or model substitution was added. Ten affected prompt/inspection/judgment checks and the rebuilt production bundle passed.

Realtime usage: **22,156 input (9,344 cached), 1,869 output; 24,025 total tokens**, excluding extraction.

## Additional authorized run 2 — interrupted greeting blocked confirmation

[Run evidence](../../.artifacts/phase4-qa/2026-10-05T10-18-08-514Z/evidence.json), [full synthetic transcript](../../.artifacts/phase4-qa/2026-10-05T10-18-08-514Z/full-transcript.md).

The visitor's first introduction was transcribed and generated a valid silent identify call. Main returned `memory_confirmation_required`, but no question followed; QA timed out at `memory_conversation_first_identify_response` (exit 2, 43.5 seconds). There were no provider errors. The capture includes a cancelled greeting response, but did not retain every playback event, so its exact event order cannot be reconstructed.

Source inspection found that a late `response.done` could re-add previously stopped audio, and cleared audio was never removed from the confirmation wait. Two failing regressions reproduced these orders. The adapter now remembers bounded completed playback IDs, handles both stop and clear, and does not re-arm finished audio from late generation events. Generation completion still does not replace playback completion. The focused green run has 83 tests; typechecks and rebuild passed before the final authorized run.

Recorded Realtime usage events sum to **4,035 input, 122 output; 4,157 total tokens**. The greeting usage appears in both completed and cancelled events; this sum is reported event usage, not a deduplicated billing statement.

## Additional authorized run 3 — complete factual recall, quality defects retained

[Run evidence](../../.artifacts/phase4-qa/2026-10-05T10-21-48-813Z/evidence.json), [full synthetic transcript](../../.artifacts/phase4-qa/2026-10-05T10-21-48-813Z/full-transcript.md), [transcript, tools and usage](../../.artifacts/phase4-qa/2026-10-05T10-21-48-813Z/synthetic-conversation-transcript.json).

Both production-route sessions completed with eight real audio/ASR turns, two confirmed identity exchanges, three learned summaries, two successful return-visit recall tool calls and no provider errors. Both policies were accurate. Material recall named recycled cork, reduced glare, easier carrying and the alternative acrylic. Commitment recall said: “You promised two cork color samples to Maya. You originally said Friday afternoon, but it changed to Saturday afternoon, and they haven’t been delivered yet.” All requested facts and the correction are correct. Reply groups averaged 20 words, with a maximum of 40 including pre-tool narration. Duration: 188.8 seconds.

The original judge rejected any occurrence of Friday, including a correctly identified superseded deadline, and therefore exited 2 at `memory_conversation_recall_incomplete`. The evidence is retained unchanged. The judge now accepts an explicit old-to-current correction while still rejecting Friday as the current deadline, ambiguous Friday-or-Saturday answers and omitted quantities. Local regressions include the actual final answer; this does not retroactively change the runner exit.

Full-transcript review found a separate real quality failure: after an unsolicited `remember` returned `memory_source_required`, the avatar said it had trouble saving and could not store the full picture. Background extraction actually succeeded. It also narrated thinking before two memory calls despite the shared silence instruction. These are not a factual-recall failure, but prevent a clean conversation-quality acceptance claim.

The final local repair returns `ignored` / `memory_action_not_requested` with the actual policy for an unrequested mutation, rather than implying a storage rejection. The versioned catalog supplies immediate result guidance: no explicit change occurred, background learning is independent, and the model should answer the visitor's actual question without save commentary. Tests prove no explicit write or learning invalidation occurs and ordinary summary learning continues. QA additionally flags the observed false-save and thinking-narration patterns, so correcting its deadline criterion cannot hide these failures. This feedback repair is locally checked but **not live verified**. The prompt-only silence rule remains imperfect; deterministic suppression would need further design and live evidence without delaying ordinary conversation.

Final-run Realtime usage: **33,225 input (14,208 cached), 2,261 output; 35,486 total tokens**. The three additional runs sum to **63,668 reported Realtime tokens**; all five current-task runs sum to **99,727**, excluding extraction and subject to the duplicate-event caveat above. No fourth additional API test was run.

## Remaining interpretation limits

Question receipts establish application delivery, not human attention or strong identity authentication. The fixed identity question is currently English; natural multilingual confirmation needs further language-specific evidence. Human microphone acoustics, prosody, interruption comfort and broad conversational preference remain human-test boundaries. Unknown historical role/date formats remain unknown; the actual large user Markdown has not been imported. Local import tests validate preparation and rejection contracts, not perfect model understanding of arbitrary archives.

Invariants reviewed: **1–6 and 8–12** through the affected contracts and focused checks. **7** remains unchanged application-owned exact spell matching. No phase or packaging promotion is claimed.

Normal Raven runtime was restored through the existing LaunchAgent (PID **40010**). Console verified Dormant/Ready, Raven and published configuration v15 with no needs-attention entries. Avatar, camera, wake listening and local embeddings reported ready; [metadata evidence](../../.artifacts/conversation-quality-implementation-2026-10-05/runtime-restored-final.json). Operator configuration hashes match the pre-restoration files. The final build includes the locally checked unrequested-action feedback repair, which has not been live verified.
