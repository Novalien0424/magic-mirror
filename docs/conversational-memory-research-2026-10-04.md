# Conversational memory research — 4 October 2026

Status: research only. No new runtime, dependency, model download or data migration was performed. This survey replaces the earlier recommendation to stop at explicit, keyword-searchable facts. The running implementation remains that earlier foundation.

Read with the [architecture](conversational-memory-architecture-2026-10-04.md) and [self-review](conversational-memory-self-review-2026-10-04.md).

## 1. What we are building toward

The requested outcome is a conversational companion that maintains immediate context, automatically learns useful information, remembers shared experiences across sessions, retrieves by meaning, handles changes over time and can genuinely forget. A few avatars and users simplify deployment and ownership; they do not reduce these capabilities.

**Verified product boundary:** OpenAI documents memory carrying context between chats and distinguishes ChatGPT memory from local Codex memory. Its documentation does not establish ChatGPT's internal vector database, retrieval algorithm, extraction policy or complete architecture. We can target comparable user-facing behavior, but cannot claim to reproduce an undisclosed implementation or achieve equal quality without evaluation. [OpenAI memory documentation](https://learn.chatgpt.com/docs/customization/memories).

Short-term memory does not need a vector database: recent turns, a working summary and open conversational threads belong in working context. Long-term memory benefits from structured records, detailed episode records and semantic search. A vector index alone provides neither learning nor conflict resolution.

## 2. Verified local baseline

Read-only hardware query `sysctl -n machdep.cpu.brand_string hw.memsize` returned **Apple M6**, **34,359,738,368 bytes (32 GiB)**. This verifies the target; it does not benchmark any embedding model.

Repository inspection establishes:

- [Current store](../src/main/memory/store.ts): synchronous SQLite/FTS5, explicit topic records, normalized names, 2,000 records per scope, no embeddings or episodes.
- [Current session](../src/main/memory/session.ts): Main-checked separate-turn identity confirmation, explicit memory requests and reset on owner/session change. No automatic learning pipeline or working-summary service.
- [Realtime adapter](../src/renderer/realtime/realtime-session-adapter.ts): live audio, asynchronous transcript observation, tool-driven recall, a requested 16,000-token post-instruction truncation budget and no automatic retrieval-before-response coordinator.
- [Model configuration](../resources/config/default.json) and [snapshot service](../src/main/model-settings.ts): packaged extractor is `gpt-5.6-luna`; published runtime/job snapshots remain authoritative. No extractor API integration is implemented. Private active configuration was not inspected.
- Existing 225 tests and seven Console checks validate the earlier implementation, not automatic or vector memory. The approximately 1.5 ms lexical storage result says nothing about embedding inference or end-to-end conversational quality.

## 3. Current research that changes the design

| Primary source | Verified finding | Design implication (our judgment) |
| --- | --- | --- |
| [LongMemEval, ICLR 2025](https://github.com/xiaowu0162/LongMemEval) | Evaluation includes extraction, reasoning across sessions, knowledge updates, temporal reasoning and abstention. | Test evolving facts and unknown answers, not just save/search/reopen. |
| [LongMemEval-V2, 2026](https://github.com/xiaowu0162/LongMemEval-V2) | Current successor evaluates agent experience using web/enterprise trajectories, including state changes, workflows, local pitfalls and premise awareness. | Useful evidence that memory extends beyond fact recall, but its agentic/multimodal task distribution is not a direct voice-companion acceptance benchmark. Keep it distinct from the conversational v1. |
| [LoCoMo](https://github.com/snap-research/locomo) | Long multi-session conversations support recall and event-oriented evaluation. | Preserve useful episodes as well as extracted profile facts. |
| [LoCoMo-Plus, February 2026](https://arxiv.org/abs/2602.10715) | Tests retained constraints where the later conversational cue is semantically disconnected from the original statement. | Core preferences must influence answers without an explicit recall request. |
| [LOCOMO-CONV, revised 22 September 2026](https://arxiv.org/abs/2609.03467) | Conversational, implicit and composed queries expose gaps missed by direct memory QA. Better retrieval does not automatically imply a better answer. | Evaluate retrieval and natural conversational behavior separately, including appropriate silent use of remembered preferences. |
| [Lexical-dense fusion, June 2026](https://arxiv.org/abs/2606.04194) | Reports improvements from combining lexical and dense retrieval on conversational-memory tasks. These are the authors' experimental results. | Use hybrid retrieval; do not assume vector-only retrieval is best for names, titles and exact entities. We must measure our own fusion/ranking policy. |

These findings support a layered design. They do not establish a universal winning framework, prove performance on this Mac or justify copying vendor benchmark scores into our acceptance report.

## 4. Memory frameworks

| Option | Verified current capability | Suitability for this app |
| --- | --- | --- |
| [Mem0 OSS](https://docs.mem0.ai/open-source/overview) | Python and Node library options as well as a self-hosted server; configurable LLM, embeddings, vector store and reranker. Its documented defaults include cloud models and a separate history store. | Closest reusable memory-engine candidate. Adoption would still need an audit of ownership timing, automatic writes, history retention, deletion and credential injection. Do not assume its defaults satisfy our invariants. |
| [Letta current Agent SDK](https://docs.letta.com/agent-sdk/memory) | Agent-owned memory, in-context system memory, demand-loaded files and background consolidation through dreaming. Current docs describe MemFS backed by git. | Valuable architecture reference, but adopting its agent runtime and git-backed private memory introduces a larger change than adding memory to our existing Realtime owner. Git history complicates physical forgetting. |
| [Letta legacy v1](https://docs.letta.com/v1-sdk/concepts/stateful-agents) | Core memory blocks, archival memory and persisted conversation state. | Keep distinct from the current SDK; older MemGPT descriptions are not a current implementation specification. |
| [LangMem](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/) | Semantic, episodic and procedural memory patterns; explicit and background formation. | Useful separation of responsibilities. Adding Python/LangGraph orchestration is unnecessary solely to use those patterns. |
| [Graphiti](https://help.getzep.com/graphiti/getting-started/overview) | Temporal facts, episode ingestion, invalidation and hybrid graph/vector/text retrieval; graph backends include Neo4j, FalkorDB and Neptune. | Stronger fit if complex relationship traversal becomes a measured need. For our small cast, relational links and validity timestamps cover the initial requirements without a graph service. |

**Recommendation:** use existing database and embedding engines, with a bounded Magic Mirror memory coordinator for our identity, turn timing and deletion rules. Do not build a general-purpose agent framework. Keep Mem0 as the main alternative if an implementation spike shows its library can reduce code while passing exactly the same lifecycle/privacy tests. Framework marketing or recall scores alone do not establish that fit.

## 5. Local vector storage

| Option | Verified capability | Decision |
| --- | --- | --- |
| [SQLite + sqlite-vec](https://github.com/asg017/sqlite-vec), [KNN documentation](https://alexgarcia.xyz/sqlite-vec/features/knn.html) | Local vector search, metadata/partition columns and exact distance queries over ordinary SQLite columns. The project still warns that it is pre-v1. | Preferred: one authoritative database for facts, episodes, relationships and vectors; retain FTS5 alongside it. Pin the extension and verify the packaged Electron/macOS ARM64 combination. |
| [LanceDB](https://docs.lancedb.com/search/hybrid-search) | TypeScript hybrid search, reciprocal-rank fusion and metadata prefiltering. | Credible embedded alternative. A second authoritative store or cross-store deletion protocol would add work while we already have SQLite. |
| [Qdrant](https://qdrant.tech/documentation/quickstart/), [Qdrant Edge](https://qdrant.tech/documentation/edge/) | Qdrant offers a server; current Edge documentation also describes embedded operation. The Python client has a local mode. | Do not repeat the earlier oversimplification that Qdrant requires Docker. Edge deserves consideration, but our TypeScript/Electron path is simpler with SQLite unless benchmarks establish otherwise. |

**Design choice, not measured proof:** exact vector search over an authorized scope is an appropriate starting point for tens of thousands of records. Few users do not imply few lifetime memories, so test growth to 100,000 records. At 1,024 float32 dimensions, 10,000 vectors occupy about 39.1 MiB and 100,000 about 390.6 MiB before database overhead. These are arithmetic storage estimates, not latency estimates. Add approximate indexing only if measured scan cost requires it.

## 6. Local embeddings as of the research date

| Model | Verified primary-source properties | Assessment |
| --- | --- | --- |
| [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), [official GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) | 0.6B parameters, multilingual support, up to 1,024 dimensions, instruction-aware queries; official GGUF and llama.cpp usage. | Preferred reproducible integration baseline. Begin with the official Q8_0 artifact and full dimensions; benchmark quantization and reduced dimensions before trading recall for size. |
| [Microsoft Harrier OSS v1 270M](https://huggingface.co/microsoft/harrier-oss-v1-270m) | 270M parameters, 640 dimensions, multilingual including Chinese, MIT license; instruction-aware queries and normalized last-token pooling. | Strong newer small-model challenger. Compare against Qwen for Chinese/English conversational recall. A tested packaged Metal runtime path has not been established here. |
| [EmbeddingGemma 300M](https://huggingface.co/google/embeddinggemma-300m) | Designed for on-device multilingual embeddings, trained on 100+ languages; publisher terms apply. | Worth a comparison if access and deployment fit. Its size does not prove it beats either candidate on our memory queries. |
| [LFM2.5-Embedding-350M](https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M) | Recent compact model; its published supported-language list covers 11 languages and does not include Chinese. | Exclude as the default for this Chinese-heavy application despite its speed positioning. |

[llama.cpp's build documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md) verifies that Metal is enabled by default on macOS. The [server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) provides an embedding-serving surface. **Unverified:** performance, embedding parity, memory use and competition with Live2D/wake processing on this M6. No model was downloaded or run in this research step. Never copy examples using verbose prompt logging into our runtime.

The final embedding choice must come from a small reproducible local comparison, not an assertion that the newest or largest model is best. Model revision, quantization, dimension, tokenizer, pooling, normalization and query instruction are part of the embedding version; changing any relevant component requires a controlled reindex.

## 7. Extraction and Realtime compatibility

**Verified:** the configured packaged extractor model advertises Structured Outputs. Use the actual frozen job-model configuration with the Responses API, validate output in Main, and keep credentials in Main. Schema conformance does not guarantee factual correctness. [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

**Verified:** Realtime can retain voice activity detection while the application controls when a response is created; the documentation explicitly identifies retrieval-augmented use cases and a latency tradeoff. Transcripts must be reconciled by item identity. [Conversation control](https://developers.openai.com/api/docs/guides/realtime-conversations), [transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).

**Architecture implication:** background automatic learning should never delay speech. However, relevant memories needed for the current answer must be selected before that answer starts, with a bounded deadline and a visible degraded fallback. Updating memory context after automatic generation has begun does not prove that the answer used it. A future local STT/TTS backend can reuse the same coordinator.

## 8. Recommendation and remaining uncertainty

Recommended stack: existing TypeScript/Electron and React; short-term context in RAM; structured long-term facts and episodes in local SQLite; sqlite-vec plus FTS5 hybrid retrieval; a warm local embedding runtime; asynchronous schema-validated extraction using the configured cloud model. Persona and application rules remain separate from learned memory.

The current explicit-memory implementation is useful scaffolding, not the requested endpoint. The replacement must include automatic formation, working summaries, episodic recall, meaningful retrieval before responses, correction/consolidation, deletion across derivatives, and a simple operator UI.

Remaining empirical questions are bounded: which shortlisted embedding wins on our languages; whether the pinned extension loads in packaged Electron; latency under simultaneous rendering/wake/camera load; extraction accuracy/cost; and natural voice behavior. These require implementation spikes and tests after this research/design/self-review phase. No benchmark parity, model speed or ChatGPT equivalence is claimed.
