# Conversational memory architecture self-review

Date: 4 October 2026. Reviewer: the same root agent that researched/designed the change; **not an independent review**. Scope: [research](conversational-memory-research-2026-10-04.md), [architecture](conversational-memory-architecture-2026-10-04.md), the current memory code and relevant voice integration. No implementation or live memory benchmark was performed in this phase.

## Verdict

**Superseded by the [5 October production-architecture self-review](conversational-memory-production-review-2026-10-05.md):** the direction remains sound, but six operational design amendments are required. The findings below retain the first review's evidence and do not constitute final implementation readiness.

The revised architecture addresses the user's requested capability: short-term working memory plus automatically formed long-term semantic and episodic memory with local vector retrieval. It is suitable to proceed to bounded implementation spikes after this research/design stage. It is **not runtime-accepted**, and the exact embedding artifact and latency claims remain unverified.

The previous implementation does not satisfy the corrected requirement. Its passing tests cannot be used as evidence that automatic learning, semantic recall or conversational continuity works.

## Findings and design changes

| Finding | Severity | Resolution in the revised design |
| --- | --- | --- |
| Explicit-only facts and lexical search fail the intended experience | High | Automatic learning, working context, core memory, semantic facts and detailed episodes are required, not deferred optional scope. |
| A vector store alone does not decide what to learn or what is currently true | High | Separate extraction, validation, consolidation, temporal validity, retrieval and context assembly. |
| Current Realtime can answer before ASR/retrieval finishes | High | Application-controlled response timing, item-bound lookups and a bounded fallback. Requires live latency and race tests. |
| Turning off automatic VAD responses does not also disable SDK tool continuations | High | Added one response coordinator and background tool-result delivery, with versioned catalog/binding/inspector parity. Sleep/media speech remains application-owned. |
| Provider rollover and a person change were insufficiently distinguished | High | Added logical conversation ownership: verified same-owner rollover can carry authorized context; sleep/person change ends continuity and requires clean confirmation. |
| Names are a fragile permanent database identity | High | Stable Main-only person IDs, mutable aliases and explicit migration; no silent merging of equal names across avatars. |
| Deleting a fact can leave it in vectors, episodes, summaries or a delayed extraction | High | Record dependencies, scope deletion epochs, cache invalidation, cancellation and clean voice replacement. If cleanup fails, the old private session stops. |
| A migration backup can contradict forgetting | High | Replaced the vague backup/rollback plan with transactional migration and synthetic failure/replay tests; no unmanaged old-data fallback. |
| A generated assistant transcript can include words never heard | High | Added conservative exclusion of interrupted assistant evidence when delivered text cannot be established. Application acknowledgements, not speech promises, establish completed actions. |
| Summaries can discard details or amplify errors | Medium | Retain multiple detailed episodes, source links and recent exact turns; regenerate summaries from their records and evaluate extraction loss separately. Exact utterance reconstruction is not promised. |
| Shared avatar memory can leak private relationships | High | Separate public persona/knowledge, avatar-person experience and explicitly shared personal facts. Apply storage authorization before recall results leave Main. |
| A model's confidence score or a matching JSON schema can be mistaken for truth | High | Use source references, epistemic status, explicit corrections and precision evaluation. Schema validation is only one layer. |
| Current 2,000-record cap confuses small population with small lifetime history | Medium | Remove that design ceiling; bound reads, monitor disk usage and test 100k records. No silent pruning of meaningful facts. |
| New local GPU work can hurt audio/rendering even if average search is fast | Medium | Keep work off Main, prioritize query embeddings, queue background work and benchmark simultaneous appliance load. |
| A local embedding endpoint can expose private text or log prompts | High | Main-only loopback access, per-launch authentication, pinned resources, content-free child output and no master credential in the child. |
| Older framework summaries can be stale in an October 2026 survey | Medium | Included current Letta MemFS/dreaming, Qdrant Edge and newer embedding candidates. Kept legacy Letta and LongMemEval v1 separate from their successors. |
| A good explicit QA score can miss natural personalization | High | Included September 2026 LOCOMO-CONV and LoCoMo-Plus; require implicit conversational use, unknown handling and end-to-end answer scoring. |

## Invariant audit

| IDs | Design result |
| --- | --- |
| 1 | A narrowly documented persistence revision is needed for automatic selected records, episodes and vectors. Raw transcripts/audio remain RAM-only; diagnostic content remains forbidden. This design does not itself enable persistence of new categories. |
| 2, 3, 4 | Main owns stable identities, verbal confirmation and clean owner switching. Local worker thread stays inside the Main process; the model/renderer never receive person IDs. Technical rollover continuity is explicitly distinct from a person switch. |
| 5, 6 | Turn-start ownership and enqueue model snapshots persist through async work. Control turns are excluded; existing eligible jobs cannot be reassigned by a later switch. |
| 7, 8 | Retrieval/learning cannot authorize scene commands or acquire a second microphone. Response scheduling must be tested with exact spells, loops, wake, greetings and interruption. |
| 9, 10 | Timeout, overload, missing models and failed extraction produce content-free reasons and continue unrelated conversation. They do not masquerade as successful memory. |
| 11, 12 | Cloud models remain configured/frozen; the embedding artifact gains an explicit versioned configuration. Main remains the sole reader of the existing ignored `.env` master key. |

## Open empirical checks before rollout

1. Compare Qwen3-Embedding-0.6B with Harrier 270M on Traditional Chinese, English, mixed-language and implicit memory queries. Confirm pooling/instruction correctness and quantized-runtime parity. No winner can honestly be declared from model-card scores alone.
2. Verify a pinned sqlite-vec build in Electron 44/macOS ARM64, extension loading, deletion/index behavior and migration rollback. The pre-v1 API warning makes a pin necessary.
3. Measure retrieval p50/p95, added speech latency, peak RAM and frame/audio behavior at 1k/10k/100k records. The targets in the architecture are not current measurements.
4. Validate real configured extractor/API behavior, refusal handling, hallucinated-memory rate, update accuracy, cost and queue drain. Main validation cannot perfectly prove arbitrary natural-language truth; evaluation and editable memories remain necessary.
5. Exercise the exact provider/SDK response sequence. Assert at most one generation path per turn, suppression of stale context, clean deletion and no wake/media regression.
6. Measure the recall loss from selected episodes versus full raw history. If the agreed conversational quality cannot be reached, disclose that tradeoff; do not quietly start archiving all conversations or call a weaker feature complete.

These checks are implementation acceptance work, not a reason to build during the requested research-only phase or to claim a current pass. No independent audit or benchmark equivalence is asserted.

## Scope check

The proposed system uses one authoritative database, one local embedding runtime and the already configured cloud extraction model. It adds no graph service, cluster, separate agent framework or training pipeline. The response coordinator and provenance/deletion logic are necessary correctness work, not optional embellishments. Advanced retrieval/rerankers remain conditional on evidence; automatic learning and vector retrieval are required scope.

Document validation completed: the read-only Python Markdown/scope check exited 0 (five files, 52 local link targets, balanced code fences, no trailing whitespace, documentation-only changes). `git diff --check` exited 0. Application tests and builds were intentionally not run for this design-only change.
