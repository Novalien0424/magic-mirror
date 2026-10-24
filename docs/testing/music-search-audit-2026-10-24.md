# Music search conversation audit — 2026-10-24

Scope: inspect the latest owner conversation's available metadata, diagnose the
extra rounds, and recommend improvements while preserving Raven's dry wit.
No production code, persona, configuration, volume or runtime changes.

## Observed field sequence

Normal Electron was owner-started at 16:58:31 Taipei. The latest session began
at 16:59:14 and returned to Dormant at 17:04:09. Console transcripts clear at
Dormant; no verbatim exchange, query, candidate names or selected asset is
recoverable from the retained metadata. This audit cannot attribute a specific
misheard word or independently verify which song ultimately played.

| Taipei time | Retained event |
| --- | --- |
| 16:59:31.250 | Local search returned no match. |
| 16:59:31.621–.623 | Same-turn final visitor clue fallback also missed; first search tool completed. |
| 16:59:57.502, 17:00:18.501, 17:00:40.030 | Three further visitor transcripts, with assistant responses but no media search/play call. |
| 17:00:57.411 | Second search returned ambiguous matches. |
| 17:00:58.184 | Playback requested, without another visitor turn. |
| 17:00:59.488 | Local music playing; analyser active at 17:01:00.479. |

First search to playback: 88.238 seconds. Second result to playback: 2.077
seconds, including 1.275 seconds of file preparation. No playback failure or
YouTube call in this sequence. The elapsed time is predominantly before the
second search, not file loading. Without words, the three intervening turns
cannot all be classified as avoidable clarification rather than enjoyed banter.

Camera USB resets preceded two microphone recoveries at 16:59:24 and 16:59:35
(63 and 73 ms between recovery-started/ready metadata). This is a potential
input interruption, not proof of a particular recognition error or the cause of
the entire delay.

## Reproduced and code-confirmed gaps

- The linked catalog includes the requested priestess track and the separate
  intro. Folder entries expose filename stems with empty aliases; artist,
  version and translated-title metadata are not indexed separately.
- `src/shared/media-discovery.ts:61` ranks full/contained strings and
  whitespace-separated clues. Mandarin homophones work, but missing/reordered
  title parts embedded in ordinary Chinese prose can fail.
- A read-only Node/Vite characterization of the current matcher ran 12 cases:
  full/short homophones, spaced clues and a version fragment matched; the broad
  title remained ambiguous; four natural possessive/request/reordered variants
  missed; an absent version and unconfigured English translation missed.
  These are synthetic probes of current behavior, not a replay or accuracy rate.
- `findLocalMedia` retries the current final ASR only after zero results. Its
  search cache is same-turn; it has no structured pending-request/candidate
  refinement state across turns. The model's conversation supplies that context.
- The find tool's catalog says to ask on ambiguous results, but its application
  result supplies explicit `next: ask` only for weak/kind-mismatch cases.
  Playback followed an ambiguous result here; prior conversational intent may
  have resolved it, but metadata cannot establish that.
- The restricted-online local fallback returns `next: ask` even for a unique
  phonetic result. This is a separate code gap, not observed in this session.

The first probe completed all cases, but Vite's background dependency scan raced
with server shutdown (`The server is being restarted or closed. Request is
outdated`, `vite:dep-scan`). Disabling dependency discovery/entries for this
read-only module runner removed the setup warning; the 12-case rerun exited 0.
No Electron QA instance, provider session, media playback or file-content read
was launched. No raw conversation or audio was saved.

## Recommended bounded repair

1. Preserve the published personality. Require useful search progress whenever
   a visitor supplies a new clue for a pending media request. Keep the permitted
   short in-character search line; do not turn banter into permission to play.
2. Extract title/artist/version clues separately; compare literal and phonetic
   clues with explicit ranking. Preserve conflicting version words rather than
   dropping them to force a match. Keep no-match distinct from likely candidates.
3. Hold the pending media request and shortlist in session RAM. Apply a short
   follow-up version/ordinal selection to that shortlist. Clear it on cancellation,
   topic replacement, playback, sleep and restart. Never persist raw utterances.
4. Return consistent structured guidance: clear selected match → play this turn;
   genuinely ambiguous candidates → one discriminating question with two names;
   miss → one bounded local relaxation, then one useful clue question.
5. Add operator-authored aliases for linked media without requiring file renames.
   English labels should be explicit aliases, not invented translations.
6. Verify exact/homophone/natural-phrase requests, two-version clarification,
   correction, wrong-version refusal, stale cancellation and source authorization.
   Measure request-to-play and unnecessary clarification turns with metadata.
   Repeated provider samples and a human Jabra pass must retain wit as well as
   task completion. The camera/USB microphone interruption needs separate evidence.

Research: [Elastic's primary phonetic-filter documentation](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-phonetic-token-filter)
recommends separate original/phonetic fields with different boosts and tradeoffs.
Applying that principle to the existing small local index is an engineering
recommendation; adding Elasticsearch or changing models is unnecessary.

Acceptance target, not a measured promise: a specific known song plays in the
request turn; a truly ambiguous version needs at most one useful clarification.
The humorous line remains optional and natural. This audit does not implement
the proposed changes or claim the field issue resolved.
