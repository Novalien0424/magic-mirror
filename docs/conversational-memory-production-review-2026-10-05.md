# Conversational memory: review against production architectures

Date: 5 October 2026. Scope: self-review of the [4 October architecture](conversational-memory-architecture-2026-10-04.md) against current primary documentation. Same root reviewer, not an independent audit. Research/design only: no runtime edits, installations, benchmarks or migrations.

## Revised verdict

**Conditionally approve the architectural direction; do not implement the 4 October specification unchanged.** Its memory layers and local deployment choice are defensible. Its consistency, evidence retention, retrieval selection and deletion contracts need the amendments below. These amendments are part of the revised design, not additional approval stages.

Keep short-term working context, a compact core profile, semantic facts, selected episodic records, local hybrid retrieval and asynchronous learning. Keep one SQLite database and one local embedding runtime. Production systems do not converge on one mandatory vector database, graph or agent framework. Our main risk is the correctness of the memory lifecycle, not insufficient infrastructure.

The earlier verdict was too generous about completeness: it correctly withheld runtime acceptance, but did not identify enough operational failure cases. A few users reduce infrastructure demand; they do not remove write races, ambiguous corrections, lossy learning or forgotten-data resurrection. Comparable ChatGPT behavior remains a quality target, not a verified result or knowledge of ChatGPT internals.

## What the production references establish

“Verified” means the publisher currently documents the behavior. It does not mean we deployed the service, audited its internals or independently reproduced its reliability. Managed products and OSS editions are kept distinct. Our conclusions are architectural judgments.

| System | Verified published behavior | Comparison with Magic Mirror |
| --- | --- | --- |
| **Amazon Bedrock AgentCore Memory** | Separate extraction/consolidation strategies; episodic strategy also supports reflection. Direct ingestion can form long-term memories without a retrievable short-term event. Acceptance precedes availability. `CreateEvent` offers an idempotency token. [Strategies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-custom-strategy.html), [ingestion](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/long-term-ingest-data.html), [event API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_CreateEvent.html). | Supports our asynchronous, selective persistence approach. Exposes missing explicit ingestion/commit states and duplicate-delivery behavior. Not storing raw events is a supported architectural choice, with a recall/recovery tradeoff. |
| **Google Agent Platform Memory Bank** | Isolated scopes, background extraction and consolidation, configurable event batching, TTL and revisions. Structured profiles prepare concise information during generation for fast access. [Memory Bank](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank), [profiles](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/profiles). | Strong support for our separation of working context, core profile and searchable memories. Requires clearer profile freshness, expiry and mutation behavior. We need the patterns, not Google's hosting. |
| **Mem0 Platform and OSS** | Current documentation describes additive automatic extraction, with explicit update/delete for corrections. Platform retrieval combines semantic, keyword, entity and temporal signals; OSS capabilities differ. Platform `add` reports pending work and reuses prior scoped messages for extraction. [Architecture](https://docs.mem0.ai/core-concepts/how-it-works), [add](https://docs.mem0.ai/core-concepts/memory-operations/add). | Do not assume installing Mem0 solves current-value conflicts. Our hybrid search is aligned, but entity/time selection and batch-boundary context need stronger contracts. Platform context retention must not be assumed for a local OSS integration. |
| **Zep** | Separate temporal facts, entities, verbatim source episodes, thread summaries, observations and user summaries. Context assembly selects among these representations. [Context types](https://help.getzep.com/context-types), [episodes](https://help.getzep.com/episodes), [temporal facts](https://help.getzep.com/facts). | Closest comparison for our layered conversational model. The important difference is source fidelity: our selected episodes are not Zep's verbatim evidence store. A SQL relationship table can support bounded links without adopting a graph service. |
| **Letta Agent SDK** | Core `system/` memory stays in context; other files are accessed on demand. Current MemFS uses an agent-owned git repository; dreaming consolidates in the background. [Current memory architecture](https://docs.letta.com/agent-sdk/memory). | Supports hot/core memory plus a larger external store, and demonstrates that vector search is not the universal organizing abstraction. Autonomous persona edits and git-based private history are a poor default fit for our fixed character and forgetting rules. |
| **ChatGPT / local Codex** | Official documentation distinguishes ChatGPT memory from local Codex memory. Local Codex has background generation and separate use/contribute controls. It does not disclose ChatGPT's complete internal memory architecture. [OpenAI documentation](https://learn.chatgpt.com/docs/customization/memories). | Useful behavioral reference, not evidence that ChatGPT uses our chosen storage, summaries or retrieval pipeline. Do not equate local Codex's documented implementation with ChatGPT's internals. |

The old Google overview URL now redirects to the broader Agent Platform page; this review follows its current Memory Bank links. Current Mem0 documentation is also more specific than historical descriptions of an automatic add/update/delete loop. Production comparisons must be tied to edition and version rather than a framework's reputation.

## Findings and required design amendments

### 1. High: asynchronous learning has no complete consistency contract

The architecture has ownership snapshots, deletion epochs and vector revision checks, but does not explicitly protect an operator correction from an older extraction job or make repeated job completion idempotent. One extraction job per owner does not serialize Console edits, explicit writes and shared-scope mutations.

**Amendment:** the SQLite worker serializes every mutation. Each operation carries a stable operation ID, captured policy/owner scope, source turn sequence and expected record revisions. Commit the operation marker and record changes atomically. Repeated delivery returns the original outcome; stale revisions cannot overwrite a correction. Reconciliation must use the latest retained evidence, never blindly retry a stale patch. Enforce scope and revision checks for every source and target record. Explicit corrections invalidate pending dependent work and take precedence over older evidence.

Expose distinct accepted, committed and indexed states internally. Console may continue to show only Learning / Up to date / Unavailable. An API acknowledgement or completed network request is not a saved memory. AWS's ingestion and idempotency contracts make this distinction explicit; the exact local protocol above is our design.

**Required proof:** duplicate callback, timeout-after-commit, old extraction after Console correction, and correction while embedding are all deterministic cases.

### 2. High: recent evidence can fall between short-term and long-term memory

The three-turn/20-second batch proposal does not define overlapping context, compaction interaction or a read-your-recent-writes rule. Pronouns can cross batch boundaries. A delayed batch can leave the next answer using an outdated core fact even though the user just corrected it.

**Amendment:** keep a bounded, scoped RAM overlay of recent eligible evidence and explicit committed changes. Include a context-only overlap when forming each extraction batch; mark which turn IDs are new so overlap cannot be learned twice. Owner metadata comes from turn start, never from enqueue-time identity resolution. Pending corrections suppress conflicting old context until resolved; they do not become verified durable facts merely by entering RAM. Working-context compaction must account for unprocessed eligible evidence. On overload, report a content-free drop/failure reason; never claim the batch was saved.

Raw input still remains RAM-only. Restart can recover committed records and indexing jobs, but cannot replay an uncommitted conversation batch. An operator-visible learning failure and conservative recall are preferable to a hidden raw-transcript journal. This is a real reliability compromise, not parity with systems that retain source events.

**Required proof:** immediate follow-up, cross-batch pronouns, summary rollover during slow extraction, and restart before/after commit.

### 3. High: selected episodes cannot serve as complete original evidence

Zep explicitly retains original ingested episodes. Our schema's session/turn IDs do not make discarded source wording recoverable, and an extracted summary cannot independently verify itself. This difference affects later questions about details that seemed unimportant at ingestion, not merely exact quotation.

**Amendment:** retain bounded selected episode records as independently addressable evidence with event time, participants, decision/outcome, uncertainty and source-kind metadata. Consolidation creates derived facts/views linked to those records; it must not repeatedly rewrite away the only retained detail. Distinguish a source locator from retained evidence and mark whether original evidence is unavailable. Claim-level dependencies are preferable; when dependency coverage is uncertain, discard the contaminated derived record rather than purporting to surgically remove one phrase.

Do not expand into raw conversation archiving silently. AWS's direct-ingestion path shows that distilled-only persistence is legitimate, but it does not eliminate extraction loss. Compare selected episodes against full-history access using synthetic conversations only. Measure lost useful details separately from search failures. If this prevents the requested experience, surface that product tradeoff before calling memory complete.

**Required proof:** future questions about a non-core detail, negative/conditional statements, unsupported “you told me” claims, and forgetting one fact present in several episode derivatives.

### 4. High: deletion promises exceed the specified storage mechanics

Our dependency/epoch/session-reset design is necessary, but searchable deletion is not complete file-level erasure. SQLite documents that ordinary deletion can leave recoverable content; FTS5 has its own secure-delete behavior. [SQLite secure deletion](https://sqlite.org/pragma.html#pragma_secure_delete), [FTS5 secure-delete](https://sqlite.org/fts5.html#the_secure_delete_configuration_option).

Production products also choose different semantics: Google documents a 48-hour recovery window for child revisions after deleting a memory. That is useful recovery behavior, but would contradict an immediate irreversible-forget promise. [Google revision lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank/revisions).

**Amendment:** separate two explicit acceptance boundaries: (a) the app cannot retrieve, inject or recreate forgotten content from its retained state; (b) app-managed storage cleanup covers ordinary rows, FTS entries, vectors, revisions, journals/WAL and temporary files using verified capabilities of the packaged SQLite build. Test secure-delete settings and WAL/checkpoint handling; do not treat enabling one pragma as proof. Do not retain recoverable value history for a forgotten record. If cleanup is incomplete, report that status instead of claiming total erasure. OS snapshots, external backups, cloud retention and physical SSD erasure remain outside the app's guarantee.

**Required proof:** after deletion and restart, all authorized read paths and derivatives return no forgotten material; synthetic storage inspection checks app-managed residue. No real memory content goes into test artifacts.

### 5. Medium: retrieval is underspecified beyond top-k similarity

Hybrid search and a 3,000-token budget are good foundations. However, reciprocal-rank fusion orders results; it does not establish relevance, factual currency or sufficiency. A fixed top-20 list can fill context with plausible but irrelevant memories or miss supporting episode details. Mem0's documented entity/time signals and Zep's multiple context types are useful comparisons, not proof of one winning ranking formula.

**Amendment:** use a staged selector: authorized core/recent context; lexical/vector candidates; explicit entity and temporal eligibility; deduplication and a relevance/abstention check; then bounded linked-episode expansion when needed. Allow an empty retrieval result. Preserve original entity labels and record aliases without merging identities from similarity alone. Historical questions may intentionally include superseded records with validity dates. The existing recall tool can request one focused expansion; no unbounded search loop or mandatory extra LLM per turn.

Specify freshness separately from retention: an expired plan should stop driving current advice without automatically deleting its historical episode. Promotion into the core profile must depend on supported usefulness, explicit importance and current validity, not how often the avatar repeats its own memory. Validate Chinese exact-name retrieval as well as multilingual embeddings; choosing FTS5 alone does not establish language-appropriate tokenization.

**Required proof:** unknown query, conflicting dates, same-name entities, cross-language paraphrase, irrelevant nearest neighbor, and two linked details outside the initial top-k.

### 6. Medium: “small coordinator” understates the custom engine being owned

SQLite and an embedding model provide storage and similarity, not extraction policy, conflict resolution, provenance, forgetting or voice-turn coordination. Adopting a framework can reduce some implementation, but cannot transfer responsibility for these product boundaries. Managed Mem0, its OSS edition, Zep and Letta are not interchangeable drop-in adapters.

**Amendment:** keep a bounded memory engine with explicit interfaces for ingestion, extraction proposals, validated commits, retrieval/context assembly and forgetting. Reuse database/inference libraries; do not create a general agent framework. Compare Mem0 OSS against the same local acceptance cases only if it demonstrably reduces implementation. Do not make multiple-framework integration a prerequisite. Keep a graph service and learned reranker conditional on measured retrieval failures; few users alone is not a valid reason to dismiss relational reasoning.

**Required proof:** memory works through the transport-independent interface; replacing Realtime later does not require migrating identities or changing forgetting semantics.

## What remains approved

- Layered memory: working context, compact core, facts and selected experiences.
- Automatic background learning, with explicit remember/correct/forget as stronger user controls.
- One local authoritative database, hybrid retrieval and a warm embedding runtime. No evidence here warrants a cluster or graph service.
- Main-owned identity and authorization, clean person switching, untrusted retrieved content, fixed application permissions and metadata-only diagnostics.
- Retrieval before response, with a measured deadline and one response owner; production text-memory APIs do not establish our Realtime latency or wake/media correctness.
- Simple Console controls and editable memories. Versioning, model knobs and ingestion machinery stay out of routine UX.

## Implementation and verification consequence

The six amendments refine the existing five implementation slices; they do not add six new gates. Start with synthetic lifecycle tests and a bounded storage/embedding comparison. Build consistency and source/deletion semantics into the schema before enabling automatic collection. Evaluate retrieval, retained-detail coverage and final conversational answers separately. Keep the original Mac packaging, resource contention and real voice acceptance checks.

No production vendor score proves our quality. No new latency measurement or memory test was run in this review. Source verification is current to 5 October 2026; model choice remains provisional. The next step is implementing the amended design with focused evidence, not another general survey.
