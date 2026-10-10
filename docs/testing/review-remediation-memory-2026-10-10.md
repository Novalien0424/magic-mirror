# Memory remediation — 2026-10-10

Owned fixes and focused Node tests are complete. The worker handoff below is
retained as dated evidence; root's subsequent integration supersedes its pending
items. Main now wires storage report/recovery status, the extractor's calendar
instruction is present, and both the unused renderer binding and shared
typecheck failures were repaired. The integrated Node typecheck passes.

Root qualified four calendar extractions with the real configured provider in
`.artifacts/phase4-qa/2026-10-10T15-31-55-055Z/evidence.json`: Taiwan-midnight
tomorrow/yesterday, historical date, and undated history. **CO-07 is now fixed**
with pinned `opencc-js@1.4.2` candidate comparison in Main, exact-label priority,
unique-match-only proposal and the existing verbal confirmation. Existing
database scopes remain unchanged; ambiguous variants load nothing and request
the existing distinct label. The later 119-test root run includes candidate,
privacy, scope and prompt boundaries. See the
[current ledger](review-remediation-2026-10-10.md) for final integration and
runtime limits. No new human/physical memory timing acceptance is claimed.

## Original worker integration handoff (superseded above)

1. **CO-05 storage status — pending:** pass `{ report: memoryReport }` to `createMemoryRepository`. Handle `memory_storage_ready` by restoring the runtime memory status to ready; `memory_storage_unavailable` remains degraded. Recovery, budget and shutdown reasons are metadata-only. The current `index.ts` still omits this hook as of the last targeted read. No replay of a failed storage call is authorized.
2. **CO-03 prompt ownership — pending:** root owns prompt edits. Add a compact extraction instruction that calendar-only `eventAt` is `YYYY-MM-DD`, explicit instants retain their original timezone offset, and live `observedAt` is Asia/Taipei. The string API remains compatible; old stored UTC timestamps are left unchanged. Imported `sourceAt` now also retains its original offset. Provider checks must exercise relative days around Taiwan midnight and undated historical evidence.
3. **CO-10 — integrated by root:** the assigned `src/main/realtime/memory-dialogue.ts` does not exist; current code is `src/renderer/realtime/memory-dialogue.ts`, owned by root. Root added a `receipting` phase after the processed output tail, accepts one answer item while Main's receipt is pending, buffers an early result, and applies it only after Main accepts delivery. Speech during the tail remains rejected. The adapter's existing `memoryInputQueue` serializes question receipt → speech → final ASR. This task preserves Main's delivered-question/later-answer boundary and verified root's 11 dialogue tests; it did not edit renderer code or root's test edits.
4. **PE-03 — prewarm removal present in Main's concurrent change:** the eager readiness embed call is absent in the current `index.ts`. The embedder releases residency after five minutes with an empty queue in any lifecycle, starts only on demand, and emits `memory_embedding_idle_stopped` / `memory_embedding_cold_start` through its existing report callback. No new lifecycle call is required. Boot `memoryIndexer.schedule()` still starts the model when eligible stored rows need indexing; consider that independent indexing demand when measuring boot residency. Explicit recall still has the existing 1.5 s semantic deadline, reason event and lexical `coverage: incomplete`; ordinary conversation does not wait for this worker.
5. **Shared typecheck — root-owned blocker:** latest `npm run typecheck:node` exits 2 only for `src/renderer/console/HelpField.tsx:16`, unused `helpText` (TS6133), introduced by concurrent work. This task leaves that edit intact. Root must repair it and run the shared typecheck after integration.

## Assigned findings

| ID | Current-code verdict and owned change | Focused evidence | Exact remaining risk |
|---|---|---|---|
| PE-03 | Verified eager boot call and permanent residency. Added empty-queue idle shutdown and lazy cold restart with reason events. | C, exit 0: residency, busy-queue protection, cold restart, idle-close race and existing lexical fallback checks in B. | Actual model RSS/start timing remains runtime evidence. Boot indexing can load the model for existing unindexed records. |
| CO-03 | Verified UTC conversion loses local event day and rejects Taiwan-midnight dates. Keep calendar dates and original offsets; validate real dates; capture +08:00 observation at speech onset; retain imported source offsets. Correct brief/recall ordering across mixed offsets without assigning date-only events an instant. | B/C/D/F, exit 0: UTC/Z/+00:00/+08:00 boundaries, relative-day evidence anchors, unknown-history rejection, date precision and ordering. | Root prompt instruction and real relative-date extraction remain pending. Existing UTC rows cannot regain lost calendar semantics safely; same-day calendar-only entries sort after explicit instants because their time is unknown. |
| CO-05 | Verified terminal worker failures. Demand-driven recovery uses monotonic 1/2/4/8 s backoff and three rebuilds per rolling hour; all failed requests stay failed. Replacement requires confirmed shutdown. Learning also refuses subset retries once a storage mutation starts. | C/F/G, exit 0: failure/timeout recovery, uncertain committed mutation not replayed by facade or learning caller, shared recovery ordering, budget renewal and close/termination races. | Root must wire storage report/status. Unconfirmed shutdown and unsupported storage schemas stay unavailable. An already-dispatched mutation cannot be undone by a late control exclusion; it is never resubmitted, and its uncertainty remains reported. No timer restart loop or fallback store is introduced. |
| CO-06 | Verified filter-after-LIMIT starvation and unsupported missing rows. Page before support filtering; exclude unsupported rows from completeness/corruption probes. | B/F, exit 0: 301 unsupported rows, transitive dependency invalidation, another owner's eligible row, unsupported malformed vector, and limit zero. | Very large stale sets still require scans in the private worker. Stale rows are not deleted or treated as valid. |
| CO-07 | Verified NFKC does not fold the reviewed variants. Installed zh-Hant/zh-Hans/stroke collations distinguish all four tested pairs. Preserve separate scopes and confirmation; report unmatched/ambiguous labels. | B/F, exit 0: distinct UUID scopes and no brief before confirmation; Node collation probe exit 0. | Automatic script reconciliation is unresolved: no reliable installed converter or audited alias relation exists. The bounded alternative below avoids merging people. |
| CO-09 | Verified silent pending evidence discard. Emit `memory_learning_invalidated;count=N` for queued plus active evidence without owner/content. | D, exit 0: pending/active discard counts, cancellation and metadata privacy. | Counts cover evidence already queued/active. Still-awaiting eligibility retains its existing ineligible reason. |
| CO-10 | Verified renderer receipt race; root integrated the receipt phase described above. Main's later verbal confirmation guard remains intact. | E and C, exit 0: early answer during receipt accepted; speech during tail rejected; stale token, cancellation and expiry keep memory locked. | Actual provider/physical timing is root's remaining acceptance work. Renderer changes belong to root. |
| CO-12 (memory) | Verified wall-clock elapsed deadlines. Use monotonic time for question delivery and answer expiry. | D/C, exit 0: forward/backward wall-clock steps and actual elapsed expiry. | Camera/YouTube portions belong to other workers; physical latency is not measured here. |
| MM-05 | Verified temporary state survives active → suspending → dormant. Clear on every non-active observation; retain temporary state across clean replacement within the same active encounter. | B, exit 0: anonymous and confirmed temporary encounters followed by a normal confirmed/learnable encounter. | Actual lifecycle subscription behavior remains root's runtime check. |

## CO-07 bounded alternative

Keep existing canonical labels and UUID scopes distinct. A returning visitor can use the exact stored label through the existing introduction/confirmation flow; ordinary dialogue acquires no additional confirmation step. A future scoped alias feature should bind operator-approved spellings to one existing avatar/owner UUID, reject alias collisions, propose the existing display name, and still require the existing verbal confirmation before retrieval. It must never migrate or merge two existing owners. This requires explicit alias storage/design authorization; a partial S→T map or phonetic/locale equality is insufficient, especially for many-to-one variants. This task adds visibility and regression evidence, not an unproved identity equivalence.

## Checks

- B: `memory-store-relationship` + `relationship-memory`: 65 tests passed, exit 0; fixture dependency revision guards corrected.
- C: `memory-embedding`, `memory-repository`, `memory-import`, `memory-confirmation`, `memory-pipeline`, `memory-indexer`, `memory-store`, `memory-reconciliation`, `memory-consolidator`: 94 tests passed, exit 0.
- D: `memory-extractor`, `memory-learning`, `memory-session`, `memory-storage-worker`: 39 tests passed, exit 0, after the final UTC-prefix validation fix.
- E: root-owned `memory-dialogue`: 11 tests passed, exit 0.
- F: `memory-store-relationship`, `memory-store`, `memory-repository`: 44 tests passed, exit 0, after mixed-offset ordering was repaired.
- G: `memory-learning`: 9 tests passed, exit 0, after the final caller guard against resubmitting an uncertain mutation. Repeated evidence is not added to the unique total: 211 tests across 16 focused files, with unchanged passing evidence reused.
- Node typecheck passed before the last caller guard. The next run exited 2 for a task-owned test inference issue and a concurrent boot-test reason mismatch ([full output](artifacts/review-remediation-memory-2026-10-10/failures-02.txt)). The owned inference issue was repaired; the following shared run has no memory errors and exits 2 only for root's unused `HelpField.tsx:16` binding ([latest full output](artifacts/review-remediation-memory-2026-10-10/failures-03.txt)). The boot-test mismatch no longer appears. Owned diff whitespace check: exit 0. Final diff/caller review found and repaired the UTC-prefix, mixed-offset ordering and learning-retry edges.
- Initial focused run: exit 1, 148 passed and one paging-fixture failure. Initial typecheck: exit 2, task-owned typing issues. Full failures are preserved in [failures-01.txt](artifacts/review-remediation-memory-2026-10-10/failures-01.txt); all reported issues were repaired. Path lookup failures are also retained there.
- No build, Electron, QA, full npm test, configuration, dependency, model or credential action.

## Changed owned paths

`src/main/memory/{calendar,contracts,embedding,extractor,import,learning,recovery,relationship,repository,session,store}.ts`; related `memory-embedding`, `memory-extractor`, `memory-import`, `memory-learning`, `memory-repository`, `memory-session`, `memory-store-relationship`, `relationship-memory` tests and `memory-storage-fixtures.ts`; this note and its failure artifacts. `scripts/memory-embedding-worker.py` required no change. Main index, renderer, shared types, prompts, PROGRESS and root's remediation ledger were not edited by this task.

## Invariants checked

1/3: temporary synthetic stores and metadata-only reports; no raw archive or owner identifiers in reports. 2/4: playback-bound later verbal confirmation and clean owner-switch behavior retained. 5/6: turn-start owner/time and control exclusions retained. 7/8: spell authorization and mic paths untouched. 9/10: counted invalidation, cold/fallback, recovery and bounded shutdown reasons; conversation remains independent. 11/12: same pinned embedding/extractor IDs and existing explicit child environment; no secret inspection or fallback.
