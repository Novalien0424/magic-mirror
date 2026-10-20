# Memory priority fixes — 2026-10-05

Scope: fix the reproduced memory exclusions, older-record corrections, rigid
confirmation vocabulary and conflicting conversation instructions. This is a
local implementation result, not new live conversation acceptance.

## Research and implementation decisions

Sources were checked on 2026-10-05. Runtime models remain selected by the existing
versioned configuration; no framework or model migration was introduced.

- [OpenAI voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
  recommends starting simply, removing conflicting absolute instructions and
  adjusting response length to the task. The shared catalog now guides normally
  short, complete turns, useful clarification and situational empathy. It no
  longer imposes 25 words or prohibits every follow-up. Lightweight lookups and
  confirmations skip preambles. This is guidance, not an audio censor or a claim
  that every generated reply will comply. The synthetic harness retains length
  measurements but no longer fails an exchange solely on word count.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  constrains output shape, not semantic truth. `memory/intent.ts` interprets the
  actual visitor utterance against either the delivered identity question or a
  proposed explicit operation. Main still owns identity, question/playback
  binding, the current turn, cancellation and storage. The interpreter cannot
  return a person ID or select a different owner. Missing, malformed or failed
  interpretation leaves private access or mutation unapproved.
- [LangMem's memory formation guide](https://github.com/langchain-ai/langmem/blob/main/docs/docs/concepts/conceptual_guide.md)
  separates immediate actions from background formation and uses scoped stores.
  Its [store-manager implementation](https://github.com/langchain-ai/langmem/blob/main/src/langmem/knowledge/extraction.py)
  retrieves existing memories and supplies them to extraction/update. We adapt
  that pattern to the current private SQLite repository: draft, retrieve relevant
  scoped records, reconcile, then commit against captured revisions. Exact topic
  lookup covers the whole scope; semantic/keyword retrieval handles changed
  wording. This is an application-specific design, not a LangMem integration.
- [Current Mem0 add documentation](https://docs.mem0.ai/core-concepts/memory-operations/add)
  describes additive storage and automatic earlier-message context on its managed
  platform. It is not evidence that adding that SDK would solve this project's
  correction semantics. We retain local structured summaries and RAM-only source
  evidence rather than adopting an external conversation archive.

## Behavior and boundaries

Ordinary speech no longer loses learning eligibility because it contains words
such as “remember” or “我是”. Application-recognized controls remain excluded;
the existing background extractor interprets other control intent in context.
Normal conversational replies do not await the new interpreter. Explicit memory
tools and the already-existing identity exchange use the configured extraction
model for contextual interpretation, with a six-second request timeout. This
adds latency/cost to those operations and needs live measurement.

Confirmation accepts a contextual yes/no/unclear judgment, rather than a phrase
whitelist. Main rechecks the question token and current session after the async
result. Chinese introductions select catalog-based Chinese confirmation and
policy disclosure; English is the other supported disclosure language. This
does not claim unrestricted localization.

Consolidation does not load the entire database into the model or rebase a stale
write. The UI's recent-100 listing remains a UI limit. Background learning and
Markdown import share retrieval/reconciliation; raw input is never persisted.
Explicit saves use the atomic write's revision to detect corrections and clear
old private context, rather than guessing from a bounded search result.
Embedding failures use visible metadata and keyword/exact lookup degradation.
Relevance and semantic correctness remain model/retrieval quality concerns,
not guarantees established by a schema or synthetic vector fixture.

## Verification

184 focused Node tests across 22 files passed. `npm run typecheck`,
`npm run build` and `git diff --check` passed. No Electron restart was performed;
the built changes have no new runtime acceptance evidence.

TDD reproduced both ordinary-story exclusions before repair. The reconciliation
tests separately reproduce older-than-100 correction failures. Focused checks
cover ownership isolation, stale revision rejection, interpretation failure,
delayed answers, question tokens, control exclusion, transient HTTP payloads and
Chinese disclosures. Semantic responses and vectors in local tests are fixtures:
these tests establish wiring and boundaries, not live model interpretation quality.
Applicable invariant checks: 1 (RAM-only source/no content diagnostics), 2–4
(confirmed ownership and clean replacement), 5–6 (captured owner and controls),
9–12 (visible failure, independent conversation, configured models and Main-only
credential source). Spell and microphone ownership paths were unchanged.

No additional paid API run was made. The prior allowance of three additional
real conversations was exhausted before this task. Existing live evidence stays
historical; human conversation/acoustic testing and a focused generated retest
remain pending. No automatic speech gate, approval itinerary, dependency change,
schema migration, runtime-model change or phase promotion was added.
