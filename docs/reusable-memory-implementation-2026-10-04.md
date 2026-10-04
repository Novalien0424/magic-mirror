# Reusable local memory — research and implementation

Date: 2026-10-04. Scope: the current Magic Mirror Realtime application on the final Mac. This follows the [speech stack survey](apple-silicon-voice-stack-survey-2026-10-04.md) and [persona/memory survey](persona-memory-migration-survey-2026-10-04.md). Those surveys describe the pre-implementation baseline; this document records the implemented change.

## Decision

Use application-owned SQLite storage with FTS5 keyword retrieval. Keep persona instructions separate from saved facts. Keep the existing speech backend and runtime model IDs. No vector database, embedding model, background extraction service or new dependency is needed for this first version.

This is a suitability decision, not a claim that lexical search has the best semantic recall. Explicit, short, editable memories make correctness and low overhead more valuable than adding an unmeasured retrieval pipeline.

## Primary-source findings

| Option | Evidence | Suitability here |
| --- | --- | --- |
| SQLite FTS5 | **Verified:** indexed full-text queries, relevance ranking, transaction-integrated writes and secure deletion controls are available. [SQLite documentation](https://www.sqlite.org/fts5.html) | Selected. One private local file; no listening server. |
| `node:sqlite` | **Verified:** built-in `DatabaseSync` and prepared statements avoid another database binding. Synchronous operations run on their calling thread. [Node documentation](https://nodejs.org/api/sqlite.html) | Already used by this app. Bound reads and record sizes; measure Main-thread cost. |
| sqlite-vec | **Verified:** provides vector search as a SQLite extension. [Project repository](https://github.com/asg017/sqlite-vec) | Possible later local upgrade, but requires packaging an extension and generating/versioning embeddings. No demonstrated need yet. |
| Qdrant | **Verified:** its local quickstart runs a database service in Docker. [Official quickstart](https://qdrant.tech/documentation/quickstart/) | Capable, but adds a process, deployment and recovery responsibilities to a single-user appliance. Not selected. |

**Verified language caveat:** SQLite's ordinary Unicode tokenizer is not a Chinese word segmenter; trigram full-text queries shorter than three Unicode characters do not match. The implementation therefore segments words with `Intl.Segmenter` and adds adjacent Han-character pairs before indexing. Tests cover two-character Chinese queries. This is lexical retrieval, not bilingual semantic matching or automatic Traditional/Simplified translation. [SQLite tokenizer documentation](https://www.sqlite.org/fts5.html#tokenizers).

**Verified context caveat:** Realtime session context is temporary; truncation is not durable memory. Tool outputs become conversation context and may recur in subsequent model input. Retrieval must be bounded. [Realtime conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations), [cost and truncation guide](https://developers.openai.com/api/docs/guides/voice-latency-cost).

## Implemented behavior

- Main owns `userData/private-memory/memory.sqlite`, separate from public configuration, diagnostics and the prompt inspector.
- Records are scoped to the avatar and normalized person name. There is no implicit sharing between avatars or people. Same-name people need distinct operator-chosen names; this is self-identification, not authentication or face recognition.
- A memory tool first asks for a name, then requires a separate exact spoken confirmation checked by Main. Old turns and old sessions cannot confirm a new pending identity. Ordinary conversation remains available without memory access.
- Explicit remember saves a concise fact under a topic. Reusing the topic updates that fact. Recall searches relevant terms, or returns recent records for an empty query. Forget deletes the exact topic and starts a clean conversation to discard old private context.
- A change of confirmed person also requires a clean session and confirmation again. There is no automatic history transfer.
- Console → Avatars → Memories supports person selection, search, add, edit and delete. Changes save immediately. Editing requires the conversation to be dormant so a running session cannot continue with stale operator-edited facts.
- Automatic extraction is off. The model is instructed to save only explicit requests, exclude control turns/fiction/secrets, treat recalled records as data, and report success only after the application acknowledges the write. Intent recognition still depends on model behavior; it is not a deterministic transcript parser.
- The shared request/reply contract and Main store/session service are independent of speech transport. A future local STT → text model → TTS adapter can reuse them; that backend is not implemented here.

## Bounds and performance

At most 2,000 records per avatar/person, 1,000 characters per memory, 100 Console results and eight recalled records. Recall serialization is capped at 4,500 UTF-8 bytes; this is a byte cap, not an exact tokenizer count. Normal conversation performs no database retrieval unless the model invokes the memory tool.

The Realtime session configuration requests retention-ratio truncation at 0.8 with a 16,000-token post-instructions budget. This bounds retained conversation input separately from the persona/tool prefix. The provider's actual acceptance remains a live verification item; local SDK tests cannot establish it.

**Measured, not a latency guarantee:** the local Node test with 2,000 synthetic records measured list plus recall at 1.64 ms on this Mac. It does not measure cloud response time, microphone latency, cold disks or long-term worst-case performance. SQLite writes remain synchronous; if measured stalls emerge, moving this single store behind a worker is preferable to immediately adding a database server.

## Privacy and deletion

The directory is mode 0700 and the database is mode 0600 on macOS. The file is not application-encrypted. SQLite and FTS secure-delete are enabled; older FTS builds rebuild obsolete index segments. Tests verify correction/deletion remove synthetic markers from the current database file and that reopening does not resurrect records.

Raw conversation transcripts/audio are not archived. Diagnostics contain only operation codes and other metadata. Recalled facts are sent to the configured cloud model; local storage does not mean inference stays local. The Console is an operator interface and can read saved facts without the voice confirmation flow.

App deletion cannot erase prior OS snapshots, external backups or provider-side retention. This feature creates no memory backup/export. Memory import from personal ChatGPT, cross-avatar sharing, automatic consolidation, semantic retrieval, biometric authentication and bulk memory administration remain outside this implementation.

## Evidence and next decision

- Focused unit coverage: persistence/reopen, scoped retrieval, update/delete, Chinese search, bounds, database permissions, sanitized failures, sender/session authorization, separate-turn confirmation, stale owner rejection, tool binding and clean reset ordering.
- Final Mac Electron Console QA: `node scripts/run-phase4-qa.mjs --memory`, exit 0, seven checks passed. Evidence: [isolated run](../.artifacts/phase4-qa/2026-10-04T13-13-07-280Z). Empty-panel capture reviewed; no private memory values are captured.
- The Electron QA drives real rendered controls, preload, Main handlers and SQLite. It uses isolated synthetic records and no cloud inference. Live spoken remember → restart → recall → forget still needs acceptance; do not equate Console QA or SDK mocks with that result.

Add vectors only after a small, consented evaluation demonstrates that keyword/alternate-keyword retrieval misses relevant memories. Measure recall quality and latency on actual Chinese/English query patterns first. If that justifies embeddings, retain SQLite as the source of truth and evaluate an in-process vector extension before introducing a separate service. No new server is provisioned speculatively.
