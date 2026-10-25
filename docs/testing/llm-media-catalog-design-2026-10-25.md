# LLM media selection redesign — research, 2026-10-25

Status: research and proposed design only. No runtime replacement or new provider
QA was performed. The owner rejected reliance on rigid aliases and matching
rules. The library will contain **at least 50 songs**; no upper bound is assumed.

## Finding

The normal conversation model cannot see the complete local catalog.
`src/shared/avatar-prompt.ts:buildAvatarPrompt` includes it only for the QA
`baseline` variant. Main already supplies the authorized public catalog through
`src/main/boot.ts` and `folderMediaSkill`; production prompt construction omits it.
The model consequently sees only candidates admitted by `find_media`'s literal,
phonetic and token rules. A candidate rejected there is unavailable for the
model's interpretation. Adding aliases does not correct that architectural gap.

`src/shared/media-discovery.ts` returns at most 20 matches from 512 resources.
`src/renderer/realtime/media-search-context.ts` adds pending-selection/refinement
and successful-replay bookkeeping. These selection rules should not be the
authority over what the visitor means. Main's current scope, file availability,
path containment and playback checks remain necessary.

## Research and recommendation

Primary sources were checked on 2026-10-25. The design below is an engineering
recommendation for this application, not a claim of measured superiority.

- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
  recommends clear, predictable tools, fewer tools and combining operations that
  always occur in sequence. Code should handle known parameters and predictable
  execution; this does not require code to decide fuzzy language meaning.
- [OpenAI Realtime prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
  recommends starting with a minimal prompt, evaluating behavior and adding
  instructions for observed failures. Keep character and tool responsibilities
  clear instead of adding a long matching procedure to Raven's dialogue.
- [Anthropic contextual retrieval](https://www.anthropic.com/research/contextual-retrieval)
  explains that a knowledge base fitting comfortably in context can be supplied
  directly. Its published context-size example is model-specific; it is not our
  acceptance threshold. The article was published in 2024, not today.
- [OpenAI retrieval](https://developers.openai.com/api/docs/guides/retrieval)
  documents semantic retrieval and combined semantic/text ranking. This is an
  option when the catalog outgrows a measured context/latency budget, rather than
  necessary infrastructure for 50 short titles.

Use the **existing conversation LLM with the complete compact authorized
catalog**, initially evaluating 50, 200 and 512 entries. Do not introduce a
second selection model, vector database, generated alias database or mandatory
search-then-play sequence for this bounded catalog.

1. Supply each resource's existing asset ID, title and media type as data.
   Include factual artist/version metadata only when available; the current
   folder scanner derives titles from filenames and does not extract audio tags.
   Do not infer unavailable metadata or include filesystem paths/private memory.
2. Let the LLM interpret the request and conversation against these candidates:
   partial titles, Chinese/English wording, similar sounds, corrections and
   version clues. Select an existing asset ID through the playback tool.
3. Ask one distinguishing question when multiple actual items remain plausible.
   Preserve explicit version/artist constraints; a missing requested version
   does not authorize playing a different one. Do not depend on numeric model
   confidence as a guarantee of correctness.
4. Main validates the selected ID against current scope and availability before
   execution. Retain duplicate-execution, session ownership and lifecycle guards.
   Replace prior-search-membership authorization with current catalog membership;
   the model never supplies a filesystem path.
5. Refresh catalog context safely when the operator refreshes files, including
   during an active visit. Replace stale catalog data rather than accumulating
   snapshots. An unavailable/deleted item produces a useful failure response.

The same selection mechanism covers music, video and pictures. Existing media
presentation behavior and hidden online-search authorization remain application
owned. The current YouTube fallback also calls local discovery; adapt that
coupling without weakening the explicit online permission gate. Hidden hardware,
stop and wake commands retain deterministic authorization under invariant 7.

## Visitor and operator journeys

The operator links a folder and refreshes it. Console shows recognized items,
counts, skipped files and availability. No alias entry is required to make a
normal title or pronunciation variation usable. Existing authored aliases can
be preserved as optional metadata, but the redesigned path must pass with all
aliases empty; do not generate a replacement alias dictionary.

The visitor describes a song imperfectly. Raven sees the actual choices, reasons
about title and version, then plays the selected item. If the version is unclear,
Raven asks one focused question and uses the answer immediately. Corrections and
replay use ordinary conversation context. An unavailable version receives an
honest response. Natural witty or sarcastic dialogue remains governed by the
published persona; no staged jokes or search-mechanism narration is introduced.

A new or removed file becomes reflected after refresh, with matching updates to
Console and the active model catalog. Renaming files or maintaining aliases is
not a prerequisite. Uninformative filenames still limit what can be identified;
this design does not claim to recognize unknown lyrics, mood or audio content.

## Scale and implementation boundary

The existing scanner caps each linked folder at **200 files** and the merged
public catalog at **512 resources**. A larger library requires explicit changes
to these bounds and visible handling of omissions. Do not silently truncate and
then tell the visitor the song does not exist.

The configured dialogue model is `gpt-realtime-2.1-mini` in
`resources/config/default.json`. Its [published context window](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)
is 128,000 tokens, but conversation, tools and output need room. Capacity does
not establish selection accuracy or latency. Measure actual catalog tokens and
provider performance before choosing a production catalog budget.

If measured size or latency makes full context unsuitable, retrieve a broad
candidate set with semantic plus lexical search and let the LLM make the final
selection, with a widening path on uncertainty. Do not reintroduce exact-name
or manual-alias admission as the sole filter. This is a later scale option,
not part of the minimal initial change.

The initial implementation affects prompt/catalog assembly, versioned media
tool instructions, adapter selection guards and the operator media panel.
Retire redundant voice-search/refinement rules only after checking other
callers. Preserve optional stored metadata and unrelated command/name behavior.

## Acceptance evidence required before deployment

Compare the existing path with full-catalog selection on the same configured
model, persona and voice, using fixed cases and repeated runs at 50, 200 and 512
resources. No manual aliases in the main test cases. Include:

- Similar-sounding Chinese/English titles, partial/reordered clues, mixed
  languages and realistic microphone input.
- Near-duplicate versions, explicit exclusions, missing versions, genuinely
  ambiguous choices and unrelated distractors.
- One-step clarification, corrections, replay, cancellation and topic changes.
- Added/deleted files, live refresh, stale/invalid IDs, scope boundaries and
  instruction-like filenames treated as data.
- Actual music/video/picture presentation, online authorization, STOP/restart
  and unchanged spontaneous character behavior.

Measure correct selection on the first request, wrong-track rate, clarification
rounds, end-of-speech-to-playback latency, tokens/cost and independent dialogue
quality. Separate speech recognition, model choice and actual playback evidence.
Require zero invalid/out-of-scope executions and zero unrequested version
substitutions in the acceptance cases; retain any failures. Functional tool
success alone is not a voice-quality pass. Restore operator settings and Jabra
to 70%, and remove owned QA artifacts after runtime testing.

The previous implementation's provider QA remains **not green**: its final
sample had 6/6 functional turns but 1/6 overall quality judgments. These results
are historical evidence, not acceptance of this proposed design.
