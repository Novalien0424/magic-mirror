# Avatar conversation and memory: reopened architecture survey

Date: 2026-10-05. Research and decision support only. No model downloads, inference, microphone use, runtime edits, migrations or deployment. External results below are publisher/author reports, not reproduced Magic Mirror measurements. This document reopens the previous architecture recommendation; it does not select a production stack.

## Product target and decision boundary

The latest user request is for 1–3 avatars with lasting relationships across guest visits, compact back-and-forth conversation, relevant older context loaded only when needed, and lasting summaries instead of full transcripts. Speech architecture and memory architecture are two decisions. Neither should be selected merely because an embedding library or speech model runs.

Working assumption pending clarification: each avatar remembers each confirmed returning guest separately; shared avatar knowledge is explicit. “Across guests” does not yet establish permission to disclose one guest's private history to another. Unconfirmed visitors get public persona/knowledge and current RAM context. Cross-visit private continuity requires a confirmed identity. The existing product uses one active avatar at a time; three avatar definitions need not mean three resident speech models.

The earlier recommendation to move directly into implementing the amended SQLite/vector design is withdrawn as the next action. The six consistency/deletion amendments in the [production review](conversational-memory-production-review-2026-10-05.md) remain useful constraints, but they do not prove that design is the best fit. Storage engine, embeddings, extraction frequency and response scheduling remain open.

## Evidence that changes the comparison

| New data point | What was actually reported | Implication and limit |
| --- | --- | --- |
| [OpenAI voice architecture guide](https://developers.openai.com/api/docs/guides/voice-agents) and [GPT-Live](https://developers.openai.com/api/docs/guides/live) | Three architectures: Realtime speech/reasoning/tools; a controlled STT–text–TTS chain; full-duplex GPT-Live with a separate backend. | The previous two-way comparison omitted a relevant candidate. Published support is not account access, Mandarin quality or local integration proof. |
| [LiveKit turn detector](https://docs.livekit.io/agents/logic/turns/turn-detector/) | Current audio turn detector supports Chinese and a local CPU mini version. Its documented endpointing defaults are 0.3–2.5 seconds with audio detection; the older text detector is deprecated. | Endpointing deserves an independent test. VAD plus a fixed silence timeout is not the only local option. No adoption of LiveKit's automatic model fallback is proposed. |
| [MLX Qwen ASR implementation](https://github.com/moona3k/mlx-qwen3-asr) | Maintainer reports M4 Pro, 48 GB: median 0.10 s for a ~2.5 s clip and 0.23 s for a 10 s clip using 0.6B 8-bit. It also documents windowed streaming with rollback. | A credible local trial exists beyond generic MLX examples. These are clip-processing measurements, not end-of-speech-to-audible-answer latency. Its small multilingual sample does not establish Taiwan Mandarin accuracy. |
| [Swift/MLX speech implementation](https://github.com/maxgoff/qwen3-asr-swift/blob/main/README.md) | M2 Max, 64 GB: Qwen TTS 0.6B 4-bit reports ~120 ms first packet, but 1.6 s generation for its short case, versus RTF ~0.7 on longer cases. | First-packet latency and sustained delivery can tell different stories. The table does not prove a continuous, natural short reply on our Mac. This implementation lists PersonaPlex as English-only. |
| [Mastra observational memory](https://mastra.ai/research/observational-memory) | Background observations/reflection, no per-turn retrieval in the reported design. LongMemEval-S: 84.23% with GPT-4o actor; 94.87% with GPT-5-mini actor, using Gemini 2.5 Flash ingestion. | A serious alternative to mandatory per-turn vector retrieval. These are different reader configurations, not evidence of universal superiority or voice readiness. An always-loaded observation log alone does not meet our dormant-context requirement. |
| [TiMem](https://arxiv.org/abs/2601.02845) | Temporal hierarchy and complexity-aware recall; reported 76.88% on LongMemEval-S with GPT-4o-mini, and 52.20% less recalled context on LoCoMo. Its ablations show overly narrow recall can lose accuracy. | Supports testing hierarchical summaries and selective expansion. Its representation and benchmark are not proof of our summary-only retention policy. |
| [Hindsight](https://arxiv.org/abs/2512.12818) | Separates facts, experiences, entity summaries and beliefs; retain/recall/reflect with temporal/entity-aware retrieval. Reports 83.6% versus 39.0% full-context accuracy using the same OSS-20B backbone on LongMemEval. | Useful counterexample to simple top-k similarity. Borrow distinctions between evidence and inference; do not assume its full infrastructure or retained source policy fits this app. |
| [Redis research comparison](https://redis.github.io/redis-ai-research-public/longmemeval-agent-memory/) | On its LongMemEval Small evaluation, extracted facts scored 71.2%; facts plus raw-excerpt retrieval scored 86.1%, task-averaged. | Shows an extraction-loss risk. It does not justify retaining transcripts against the user's requirement. We must measure which useful details our summaries preserve. |

These scores are not a leaderboard: reader, extractor, retained material, context budget, task aggregation and evaluation protocol differ. [LongMemEval](https://arxiv.org/abs/2410.10813) provides useful categories—updates, time, multiple sessions and abstention—but does not evaluate natural spoken interaction, guest authorization or forgetting guarantees.

## Decision A: should local speech be tested first?

**Provisional answer: yes, run an isolated comparative audition before committing to the voice architecture.** Establish a compact-turn Realtime baseline first, then compare the local chain. Continue memory representation research independently. A failed speech audition should not invalidate the memory design or require its rewrite.

| Candidate | Why it remains in contention | Main uncertainty |
| --- | --- | --- |
| Current Realtime plus improved turn policy | Existing wake, output, media and interruption integration; direct audio interaction | Whether shorter replies and better turn boundaries already deliver the desired experience; recall timing |
| Local STT → cloud text reasoning → local TTS | Replaceable voice, application-owned text/context, direct control of recall before reply | Endpointing, echo, short-phrase prosody, lost vocal cues, cloud and local stage delays |
| GPT-Live plus application-owned backend | Published continuous/full-duplex conversation while backend work runs | Account access, supported privacy configuration, Chinese/persona quality, cancellation and context integration |

The [GPT-Live client-delegation documentation](https://developers.openai.com/api/docs/guides/live-delegation) explicitly lets the application select backend context and validate results. It also makes clear that interrupted speech does not cancel backend work. Thus this is a candidate with real ownership work, not an automatic upgrade. No runtime model substitution is authorized by this survey.

Local shortlist: Qwen3-ASR 0.6B and 1.7B; multilingual Whisper through [Argmax's Apple Silicon implementation](https://github.com/argmaxinc/argmax-oss-swift) as an independent ASR comparator; Qwen3-TTS 0.6B and 1.7B CustomVoice for synthesis. [Qwen ASR](https://github.com/QwenLM/Qwen3-ASR) documents streaming in its vLLM backend; that does not prove parity in every Apple port. [Qwen TTS](https://github.com/QwenLM/Qwen3-TTS) advertises low-latency streaming, but its headline 97 ms is not our end-to-end Mac result. [MLX Audio](https://github.com/Blaizzy/mlx-audio) supplies both model families and a small Kokoro speed comparator. Select one port initially; compare another only when quality, streaming or timing warrants it.

OAuth is independent of this experiment. Existing authorized API access can isolate the speech question without changing the master-key contract. Do not combine authentication migration, new speech, new memory and new persona into one comparison.

### What human-like conversation means here

Proposed behavior, applied consistently to all candidates:

- Ordinary response: one conversational move, usually one or two short sentences, then yield. No automatic recap, list or concluding paragraph.
- Ask at most one useful follow-up; do not end every turn with a question. Acknowledgment, humor and silence can be appropriate.
- Extend when the guest asks for a story or explanation. Do not make a word limit cut off meaning or interrupt audio mid-sentence.
- Distinguish a listening cue such as “嗯” from a correction or request to stop; tolerate pauses and self-corrections.
- Stop promptly on genuine interruption and remove unheard answer tails from working history and memory proposals.
- Use relevant memories naturally without reciting the memory record. Never fabricate familiarity to fill a retrieval miss.

This is partly dialogue policy, partly turn detection, partly voice quality. [OpenAI prompting guidance](https://developers.openai.com/api/docs/guides/voice-prompting) recommends concrete response-length rules and one question at a time. [Semantic VAD guidance](https://developers.openai.com/api/docs/guides/realtime-vad) distinguishes speech completion from silence. Neither source establishes that prompting alone makes any candidate human-like.

Repository observation: `configuredTurnDetection` in `src/renderer/realtime/realtime-session-adapter.ts` already supports semantic modes and a noisy-room server mode with 900 ms silence. This is available configuration, not a live reading of the selected profile. Baseline tuning is a real comparator before attributing all awkwardness to the backend.

### Speech experiment design — proposed, not executed

1. **Component audition:** identical short Mandarin/mixed-English phrases for TTS; synthetic or explicitly provided clips for ASR. Test names, numbers, negation, quiet speech and background audio. Listen for Raven voice suitability, not only transcription round-trip correctness.
2. **Dialogue audition:** matched persona and a fixed small set of synthetic memories; 12 scenarios spanning greeting, returning guest, pauses, interruption, short acknowledgments, corrections, unknown memory, joking and a requested longer story. Counterbalance backend order. Repeat scenarios; a few dozen turns can screen candidates but cannot establish a stable p95 or rare-failure rate.
3. **Room/integration trial for finalists:** actual Jabra mic/speaker, current effects and avatar; media playback/wake handoff; long-session resource contention and restart. One mic owner and sequential runtime runs remain mandatory.

Measure end-of-guest-speech → first **meaningful audible** reply, full reply duration, clipping/underruns, interruption-to-silence, premature turn endings, missed interruptions, false interruptions, ASR correction burden, memory-answer correctness, peak memory and avatar frame drops. Separate cold/warm and ordinary/recall turns. A filler phrase must not count as a useful answer. Compare the extra delay tolerated by the user, not a previously invented absolute target. Report p50 and sufficient-sample p95 with sample counts; use human preference ratings for naturalness, persona and willingness to continue talking.

The [MLX Audio maintainer's TTS benchmark](https://gist.github.com/Blaizzy/0f04043849274e858724d2d4fd714385) provides first-buffer and inter-chunk timing ideas, but its English prompts and component measurements need adaptation. No live speech/transcripts should be written into benchmark artifacts.

## Decision B: what should be remembered, and when should it be loaded?

**Leading hypothesis to compare:** a small current relationship brief plus searchable, dated summaries of encounters/topics. Keep the authoritative retained summaries distinct from derived search indexes and profile views. A vector is an access path, not the memory itself.

| Layer | Content | When the model receives it |
| --- | --- | --- |
| Public avatar definition | Persona, lore, speaking style, permitted actions | Session start; stable and operator-controlled |
| Current conversation | Recent exchanges, unresolved references, running topic summary | RAM during this encounter; clears on owner change/sleep/restart |
| Small relationship brief | Confirmed name preference, a few relevant stable preferences, active commitment or last unfinished thread | Only after guest confirmation; bounded and independently correctable |
| Episode/topic summaries | What happened, decisions, reasons, dates, relevant people, changes and unresolved outcomes | Only after an authorized query passes relevance checks |
| Avatar-shared knowledge | Explicitly designated public knowledge or shared experiences | Small essentials at start; other material on relevant search |

All private layers are scoped by avatar and confirmed guest. Person references inside a summary do not authorize another person's memory bank. Group conversation needs an explicit ownership/sharing rule; speaker detection alone cannot decide it. Shared experiences must have deliberate scope rather than being copied automatically across guests or avatars.

### Three memory designs worth testing

| Design | Strength | Failure to test |
| --- | --- | --- |
| Compact relationship/observation brief only | Predictable context and no search delay; strong simple baseline | Loss of older detail, increasing compression, unwanted context always loaded |
| Relationship brief + searchable topic/encounter summaries | Closest to selective recall and summary-only persistence; summaries retain decisions and reasons together | Summary omissions, bad query formation, related memories missed across topics |
| Above plus structured facts/commitments and relationship links | Better current-value updates, dates and multi-episode connections | More write consistency, deletion and consolidation complexity |

Compare these before making the third design mandatory. One giant repeatedly rewritten biography risks detail loss and makes correction hard. A bag of isolated facts risks losing the meaning of an encounter. A graph service is not required to test simple links. SQLite remains a plausible local store, but database brand is downstream of the representation and lifecycle decision.

### Selective recall contract

For normal small talk, use the current encounter and small brief. For a historical question or a relevant topic cue, form a query from the current utterance plus enough RAM context to resolve “that trip” or “her.” Run authorized semantic and keyword candidate search independently, then combine; keyword absence must not eliminate a semantic match. Exact names, dates and identifiers can be useful lexical signals. Compare lexical-only, vector-only and combined variants on the same retained records and context budget.

Scope first, then search, then check relevance/currentness, then load a few matching summaries. Permit no result. A nearest neighbor is not proof of relevance. Expand a linked summary only if needed; dates distinguish an old plan from its correction. Storage/index processing is distinct from supplying memory text to the conversation model: records can stay searchable without being in its prompt.

Two response-scheduling variants remain open. Tool-triggered recall preserves ordinary-turn speed but may miss implicit cues. Application retrieval before every response gives more predictable access but can add delay and false relevance. Test a mixed policy: core/recent context immediately, targeted recall for relevant cues and explicit history questions, bounded prefetch where possible. A memory-dependent claim must wait for its result; a timeout should produce a compact admission or clarification, not fabricated recollection. Late results cannot trigger an unsolicited second answer.

### Summary-only learning contract

The user-facing conversation stays short. The lasting summary is an internal record, not an obligatory spoken recap.

Use recent RAM exchanges to prepare a draft as a topic develops. At a topic boundary or encounter end, consolidate a self-contained summary with outcome, reason, dates, changed preferences and pending commitments. Exclude filler, control turns and speculative assistant claims. Distinguish what a guest said, what was agreed, and what the avatar inferred. Persist only distilled records under the selected learning policy. Index those records; no raw transcript archive or transcript-search fallback.

Example synthetic record: “On October 5, the guest changed Saturday's outing from hiking to the museum because rain is expected. Booking remains undecided. Hiking is still a preference, not the current plan.” A bare “likes museums” would change the meaning and lose useful future recall.

Checkpoint policy remains a real choice: final-summary-only loses the unfinished encounter on a crash; periodically committed distilled topic summaries reduce that loss but permit partial memories before the encounter ends. Proposed comparison: topic-summary checkpoints plus final consolidation, with unfinished/settled status. Do not quietly substitute raw conversation journaling. Explicit remember/correct/forget still commits immediately and overrides older automatic work.

Use retained summaries as the source for rebuilding brief/index views, with dependency links. Avoid repeatedly summarizing only the previous summary until details vanish. Corrections invalidate stale derived records; deletion removes the summary and contaminated derivatives, pending jobs and injected context. Revisions/idempotency, turn-start ownership and content-free diagnostics from the earlier review still apply. The current app's explicit-only learning policy remains unchanged until implementation is separately undertaken.

## Evidence required to choose the architecture

Use the same synthetic encounters, retained-token budget, extractor and answering model for representation comparisons. Change one dimension at a time. Include 3 avatars and multiple returning guests, same-name people, Chinese/English paraphrases, unrelated queries, corrected dates, tentative plans, a month-later callback, one question needing two summaries, and a detail deliberately omitted from the summary.

Score separately:

- **Retention:** was the required fact/decision/relationship preserved in the summary? If absent, this is not a search failure.
- **Retrieval:** did the right retained summary reach context, and did irrelevant summaries stay out?
- **Answer:** did the avatar answer correctly and briefly, use uncertainty appropriately, and avoid unsupported “you told me” claims?
- **Lifecycle:** guest/avatar separation, correction precedence, duplicate writes, restart recovery and no resurrection after forgetting.
- **Conversation:** recall delay, proactive relevance, awkward callbacks, repetition and human preference across several encounters.

A full-history reader can be an evaluation upper reference using synthetic data only; it is not a production option. Compare summary compression levels so the cost of omitted detail is explicit. Summary-only memory cannot promise exact recall of information that was never retained.

Next decision sequence: agree the behavior and guest-sharing interpretation; obtain the compact-turn Realtime baseline and local speech audition; compare the three memory representations in text; then choose the voice integration and memory implementation based on the observed tradeoffs. GPT-Live deserves an access/fit check, not automatic selection. Speech auditions and text-memory experiments can be scheduled independently without committing to either final stack.

Verified here: primary-source research and narrow read-only code inspection. Unmeasured: our target-Mac voice latency/quality, long-term summary fidelity, retrieval quality, resource contention and provider access for new models. No architecture is declared best or production-ready.
