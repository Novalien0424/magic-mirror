# Superseded memory planning and foundation progress — 2026-10-05

Archived when the approved implementation replaced the earlier design-only status.
The dated entries below are historical evidence, not current delivery claims.

## Current design: keep Realtime, add relationship memory — 2026-10-05

The user clarified that Realtime already works well and feels shallow because
it lacks memory, accepted keeping that voice path, and requested architecture
plus self-review before presentation. The new
[design](../realtime-relationship-memory-design-2026-10-05.md) and
[same-author self-review](../realtime-relationship-memory-self-review-2026-10-05.md)
recommend a small confirmed-guest relationship brief, selective semantic/keyword
recall of dated topic summaries, and background summary learning. Ordinary
Realtime replies do not wait for final transcripts or a retrieval stage.
Private memories remain per avatar/person; no implicit cross-guest sharing.

This supersedes the earlier proposal to audition local speech first and the
October 4 mandatory pre-response retrieval design. Self-review added explicit
turn-start attribution work, stale-tool cancellation, pending context/batch
overlap, correction epochs covering inserts, and deletion failure recovery.
The model can still miss a recall cue; summarization can omit useful detail.
Both need separate quality measurements, alongside real voice and storage tests.

Design/docs only. No application changes, models installed, automatic learning
enabled, runtime restarted or data migrated. Next is user review of this
architecture; subsequent implementation must prove the SDK context-update
contract, lifecycle correctness and multi-visit conversational quality.

## Architecture reopened — 2026-10-05

The user requested more evidence before choosing speech or memory architecture:
1–3 avatars, returning-guest continuity, selective recall, compact back-and-forth
speech and lasting summaries rather than transcripts. The new
[options survey](../avatar-conversation-memory-options-2026-10-05.md) compares
Realtime, local STT/TTS with cloud reasoning, and the newly considered GPT-Live
backend split; it also compares compact briefs, searchable episode summaries,
and summaries augmented with structured facts/links. New primary-source data
includes Apple Silicon speech reports, Mastra, TiMem, Hindsight and a Redis
memory evaluation. Published results are not reproduced local benchmarks.

The prior recommendation to proceed straight into the amended memory implementation
is superseded. Next: clarify guest sharing, establish a compact-turn voice
baseline/local audition, and compare memory representations on synthetic
encounters before selecting the architecture. Working assumption: private
guest memories remain separate, shared knowledge explicit. No speech/backend,
database, embedding or automatic-learning choice is finalized. Research/docs
only; app, dependencies, models, credentials and runtime remain unchanged.

## Clock-out — 2026-10-05

Research/design only this session; no new memory implementation, migration,
model download, app restart or deployment. Runtime left untouched; runtime
observations and PIDs below are dated evidence, not reverified live status.

All survey/design documents are saved locally:
[Apple Silicon speech stack](../apple-silicon-voice-stack-survey-2026-10-04.md),
[persona and memory portability](../persona-memory-migration-survey-2026-10-04.md),
[memory research](../conversational-memory-research-2026-10-04.md),
[architecture](../conversational-memory-architecture-2026-10-04.md),
[initial self-review](../conversational-memory-self-review-2026-10-04.md),
[production comparison and amended verdict](../conversational-memory-production-review-2026-10-05.md).
The [earlier implementation record](../reusable-memory-implementation-2026-10-04.md)
is explicitly marked as an insufficient foundation for the corrected scope.

Latest retrieval decision: semantic search is primary; keyword search only
supplements it and cannot filter out semantic candidates. Compare lexical-only,
vector-only and combined retrieval before choosing weights or a reranker.
Next on resume: follow the six production-review amendments and begin bounded
synthetic lifecycle checks plus local embedding/storage comparisons. Full
conversational memory remains unbuilt; quality and performance are unmeasured.

## Current design: full conversational memory — 2026-10-04

**2026-10-05 review:** compared the design with current AWS AgentCore, Google
Memory Bank, Mem0, Zep, Letta and official OpenAI documentation. The
[production review](../conversational-memory-production-review-2026-10-05.md)
conditionally approves the direction with six amendments covering write
consistency, pending context, retained evidence, deletion, retrieval selection
and custom-engine scope. This addendum supersedes the earlier completeness
verdict. No application changes or runtime acceptance in this review.

The user rejected explicit-only lexical memory as the target and requested
short-term context plus automatic long-term vector memory for a few avatars
and users. Latest direction: finish research, architectural design and
self-review before building. Those documents are now saved:
[research](../conversational-memory-research-2026-10-04.md),
[architecture](../conversational-memory-architecture-2026-10-04.md),
[self-review](../conversational-memory-self-review-2026-10-04.md).
They cover current October sources, local storage/embedding alternatives,
automatic semantic/episodic learning, Realtime response timing, deletion and
quality/performance acceptance. Read-only hardware check: Apple M6, 32 GiB.
No runtime changes, model downloads, dependency installs or migration in this
research/design step. The existing implementation below remains the running
foundation and is not acceptance of the corrected scope. Next: bounded model/
storage integration comparisons, then the documented implementation sequence;
embedding choice, latency and conversational quality still require measurements.

## Current: reusable local memory — 2026-10-04

Implemented explicit remember/recall/correct/forget with a private Main-owned
SQLite/FTS5 store, scoped by avatar and verbally confirmed person. Console →
Avatars → Memories supports immediate-save add/edit/search/delete. Automatic
extraction remains off. No vector server, embedding model, dependency or runtime
model change. [Research, design and limits](../reusable-memory-implementation-2026-10-04.md).

TDD covered persistence, correction/deletion, Chinese retrieval, owner/session
isolation, stale confirmations and late ASR confirmation. Twelve focused unit
files: **225 passed**, exit 0. `npm run typecheck`, `npm run build`, and
`git diff --check`: exit 0. `node scripts/run-phase4-qa.mjs --memory`: exit 0,
**7 Console checks passed** using real rendered controls, preload, Main and
SQLite in isolated user data. [QA evidence](../../.artifacts/phase4-qa/2026-10-04T13-13-07-280Z);
empty-panel screenshot reviewed. Final build additionally clarifies the pending
confirmation tool instruction; Console implementation is unchanged from that run.

Normal app restored through the existing LaunchAgent, PID **68790**. Main,
Mirror and Console reported ready; private database created with mode 0600.
No operator config or existing memories were edited. Live spoken memory-tool
selection, cloud acceptance of the requested truncation budget, and spoken
remember → new session → recall → forget remain unverified. These are the next
acceptance checks, not established by mocked SDK tests or Console QA. No phase
promotion. Prior operator-confirmed media wake result remains below.
