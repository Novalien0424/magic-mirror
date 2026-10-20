# Realtime relationship memory — self-review

Date: 2026-10-05. Reviewer: the same agent that authored the [design](realtime-relationship-memory-design-2026-10-05.md); not an independent audit. Method: inspect current memory/session/tool code, compare the design against the latest user direction and earlier six production-review amendments, walk through failure scenarios, then amend the design before presentation. No application, provider or model test was run.

## Verdict

Recommend this architecture for implementation planning: retain current Realtime; load a small confirmed-guest relationship brief; retrieve older summaries on demand; consolidate ordinary conversation asynchronously. The architecture now has explicit handling for the failure scenarios below. It is not runtime-approved, and model-triggered recall and summary quality remain empirical risks.

The important reversal from the October 4 design is deliberate: do not wait for final transcripts and semantic retrieval before every reply. The user already likes the current voice experience. A universal response gate solves one retrieval-order problem by imposing a new latency dependency on every exchange. A prepared brief plus tool-based recall is a better initial fit, with missed recall measured honestly.

## Findings addressed before presentation

| Review question / failure | Result and design amendment |
| --- | --- |
| Can automatic conversation stay fast? | Preserve existing VAD and ordinary generation. No mandatory awaited memory I/O. Still measure resource contention; background inference can affect voice even without an explicit await. |
| Can an old lookup talk after barge-in? | Session IDs alone are insufficient. Added turn/response cancellation generation and explicit non-speaking stale tool completion. Current bindings may otherwise resume from an ignored result. |
| Is turn-start ownership already implemented? | No. Current adapter notifies memory on input commit/item creation. Added required speech-start snapshot and safe item binding. Unknown attribution skips learning with a reason. |
| Can an old extractor resurrect a corrected fact by adding a new ID? | Record revision checks alone fail this case. Scope mutation epoch invalidates old proposals, including inserts; contaminated RAM evidence cannot be re-enqueued. |
| Can a recent correction disappear during slow extraction or compaction? | Added bounded pending-evidence overlay, stale-result suppression, context-only batch overlap and separate new-evidence IDs. Pending does not equal saved. |
| Can the same batch learn overlap twice? | Stable source-window/operation identities plus new-versus-overlap marking and atomic operation commits prevent duplicate effects; retries return status only. |
| Can repeated summaries gradually invent a relationship? | Brief derives from retained supported records, not its prior prose. Inferences remain distinct; repetition is not evidence; no automatic rewriting of persona or inferred intimacy. |
| Will proactive memory become annoying? | Added last-surfaced cue metadata, suppression after declined topics, resolved/expired thread removal and no importance boost from repeated mention. |
| Does recalled text become an instruction? | Added explicit untrusted-data handling and immutable application authorization. Memory cannot change identity, tools, spells or retention. |
| Does a single confirmation prove who spoke later? | No. Documented lack of continuous speaker authentication; known group/switch signals pause learning. This is a residual operating limitation, not a solved invariant. |
| Is one final save reliable enough? | No. Commit distilled topic checkpoints plus final consolidation. Abrupt shutdown can still lose the uncommitted tail; no raw journal is introduced. |
| Can a forgotten detail survive in a summary, vector or brief? | Dependency invalidation and conservative whole-summary removal when separability is uncertain; clean cloud session and persisted cleanup-required block on failure. |
| Can Off/temporary mode still save a queued old job? | Added policy-epoch invalidation and cancellation, plus cleanup of already injected private context. Off retains existing disk records unless separately forgotten. |
| Are “found nothing” and “could not search” distinguishable? | Recall returns no-match, partial/incomplete, ambiguous and unavailable separately. Stale embeddings are excluded; committed but unindexed records disclose incomplete semantic coverage. |
| Does the system promise perfect summary or model judgment? | No. Schema/source checks cannot prove natural-language truth. Editable records and separate retention/retrieval/answer evaluations are required. |

## Scenario walkthroughs

1. **Returning guest:** public greeting → clean confirmation → current brief at a safe boundary → suitable unfinished-thread follow-up. No older library dump. If the brief is delayed, the acknowledgment can proceed without private claims; recall remains available.
2. **“What was that place we discussed?”:** model requests recall in the current authorized scope → semantic/keyword/time candidates → compact dated evidence → one SDK continuation. Uncertain reference asks a short clarification. No forced lexical overlap.
3. **“Actually, we cancelled that”:** current RAM captures the correction; stale context is suppressed, explicit/policy-appropriate change commits, dependent brief/vector revisions invalidate. An older extractor finishing later cannot restore the plan. If contextual removal is uncertain, rebuild cleanly and report the transition.
4. **Guest switch while learning:** old eligible evidence retains the original owner; no result enters the new session. Old work can commit only if its policy and mutation epochs remain valid. The new guest confirms in a clean session. Equal names never imply equal identity.
5. **Forget during extraction, then restart:** invalidate pending work, delete sources/derivatives/indexes and clean the active session. A failure persists a content-free private-scope block. Reboot cannot re-enable an incompletely cleaned scope. No value-bearing tombstone or transcript journal survives as an application recovery source.
6. **A long interrupted encounter:** topic summaries already committed remain; unfinished RAM drafts may be lost. Retained summaries distinguish tentative and settled outcomes. The avatar cannot claim exact wording or omitted details later.
7. **A tool returns after a new utterance:** response-generation mismatch rejects delivery, reports a metadata reason and completes without speaking. The new utterance is allowed to use a fresh scoped query. No duplicate response owner.

These are reasoning walkthroughs, not executed acceptance tests.

## Earlier production amendments retained

All six earlier concerns remain covered: atomic/idempotent writes with correction precedence; recent pending context and overlap; independently retained episode evidence; deletion of derived and app-managed storage; relevance/time/entity/abstention beyond top-k; and a bounded custom coordinator with replaceable inference/search libraries. The chosen exact-vector scan avoids making a particular native extension an architectural prerequisite. It must still earn acceptance at measured scope sizes.

## Invariant audit

| IDs | Design check |
| --- | --- |
| 1 | Audio/transcripts/injected context stay ephemeral; selected summaries/facts/vectors persist privately. Automatic-summary policy needs aligned implementation rulings; diagnostics remain metadata-only. |
| 2, 3, 4 | Confirmation before private context; stable IDs confined to Main; clean identity switching. Self-identification and undetected speaker changes remain explicit limitations. |
| 5, 6 | Added required turn-start ownership; late evidence is bound by item; control/group/memory-management turns excluded from general extraction. |
| 7, 8 | Memory cannot authorize hardware; exact application spell matching and the single mic path are preserved. Memory workers have no capture ownership. |
| 9, 10 | Missing transcripts, dropped learning, index gaps and failed recall have reasoned metadata/results. Failures preserve a clean conversation; contaminated private context is blocked. |
| 11, 12 | Configured cloud model snapshots and pinned embedding artifact; no silent fallback. Existing Main-only root `.env` key source and LaunchAgent ownership unchanged. |

## Remaining implementation proofs

- Confirm silent private-context insertion/replacement and acknowledgment with the installed SDK/provider. `updateHistory` delegates to transport history reset; method presence is not a live guarantee about safe context replacement. No duplicate greeting/response is allowed.
- Test at-most-one tool continuation under cancellation, parallel tool calls, media/sleep, identity reset and provider rollover. Current ignored-result behavior needs explicit coverage.
- Measure summary fidelity, no-overlap semantic recall, missed recall selection and grounded concise answers across several visits. An architecture cannot guarantee these from a model card.
- Measure warm query latency, background extraction/indexing load and exact-scan scale on this Mac with avatar/audio/camera active. Pin the embedding runtime only after parity/resource checks.
- Verify migration, correction precedence, duplicate delivery, source-scope checks and deletion after restart, including packaged SQLite/FTS/journal residue using synthetic content only.
- Evaluate operating behavior around confirmation and multiple nearby speakers; do not market verbal confirmation as biometric authentication.

No benchmark scores, latency promises, real-voice acceptance or deployment readiness are claimed. Documentation validation is reported separately in the handoff.
