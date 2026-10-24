# LLM media search repair — 2026-10-24

Implements the owner-approved follow-up to the
[field audit](music-search-audit-2026-10-24.md). Preserve Raven's published
personality and speaking style; improve search and execution without scripted
jokes. No dependency, model, command-authorization or persona change.

## Research and implementation decisions

Primary sources opened on 2026-10-24:

- [OpenAI Realtime prompting](https://developers.openai.com/api/docs/guides/voice-prompting):
  specify when to act, clarify and recover; use brief natural preambles; avoid
  repeated failed calls and unnecessary confirmation for harmless lookup.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling):
  make tool arguments/results clear, use enums for valid states, and put
  predictable operations in code instead of making the model reconstruct them.
- [Elastic phonetic filtering](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-phonetic-token-filter):
  retain distinct original/phonetic matching with different priorities.

Application-specific inference: the existing small local catalog does not need
another model, embeddings or a search server. The Realtime model extracts
original-language title, performer and version clues; bounded deterministic
retrieval ranks real assets. `find_media.context` distinguishes a new/corrected
request from a refinement. Application code retains the immediate pending
shortlist, intersects a refinement with fresh authorized results, expires it
after cancellation/topic replies or another unrelated turn, and clears it on
playback, other skills and session close. Raw requests remain in session RAM.
If the model labels complete fresh clues as a refinement after that context has
expired, the app now searches those clues afresh. It does not consume an extra
model/visitor round merely to correct the context enum. Unconfirmed choices
need fresh lookup results. Successfully played public asset IDs can be reused
for a later explicit replay request; Main revalidates scope and availability.
The bounded session cache clears on close, blocks same-turn duplicates, and
cannot override a pending search for a different version.

All local search routes now return consistent play/ask/explain guidance. A
unique phonetic result follows the same play path as a literal result. A
same-turn ambiguous selection, invented ID or expired unconfirmed choice is
rejected with a metadata reason. An unavailable selection returns `find_media`
instead of sending the visitor through an unnecessary clarification. Main
still independently validates available assets/scope.
No hidden online-search phrase, spell, stop or wake authorization changed.

The original string/phonetic search remains first. After a miss, word
segmentation tolerates grammatical/request wording while requiring every
substantive clue, including conflicting versions. It cannot combine arbitrary
fragments of different aliases into a false title. Literal matches precede
phonetic candidates. Existing full-title, short-title and negative controls
remain covered. This is bounded lexical/phonetic retrieval, not unrestricted
semantic understanding.

The tool guidance asks for useful search progress on new clues and one
discriminating question on real ambiguity. Character comes from the published
settings; no song-specific banter, canned reply or mandatory joke was added.

## Visitor journey

1. Ask for a known song in natural or sound-alike wording. Raven may speak a
   short natural in-character line, searches and plays the clear match that turn.
2. If a requested version is absent, preserve that constraint and explain the
   local miss; do not substitute another version. At most one revised lookup
   removes conversation filler without removing substantive clues.
3. A useful new clue triggers a lookup. A version clue can narrow the pending
   shortlist; a correction/new title replaces the request. Normal teasing can
   receive an in-character conversational response without invented actions.
4. If two versions remain plausible, ask which one using their real names.
   The visitor's selection plays without another permission round.
5. Cancellation, topic replacement, playback and sleep cannot leave a stale
   unconfirmed selection ready to fire later. A new request can reuse known
   clues in a fresh lookup or replay a previously successful asset. Music
   leaves the avatar visible; video/pictures use existing display
   and return behavior.

## Operator journey

Console → Avatars → Raven → Media → **Search aliases**. Choose a linked file,
enter one alternate title/pronunciation/English name per line, then **Save search
aliases**. Up to 16 aliases, each 120 characters. Save applies to the next
lookup without renaming files or publishing the avatar. Shared-file aliases
apply to every avatar. The filename list remains compact.

The existing search box previews the same matcher. Cancel discards unsaved
alias edits; clearing and saving removes aliases. Refresh and restart retain
saved aliases. Main rejects invalid input, unknown files and another avatar's
private folder. Old folder configurations remain readable. Duplicate aliases
across versions remain discoverable as ambiguous choices rather than silently
hiding later files. Production aliases/settings are not populated by QA.

## Verification

- Focused matcher, session, context, catalog, folder persistence, IPC, playback,
  web and preload-boundary tests. Development failures and final commands are
  retained in the [checks metadata](music-search-repair-checks-2026-10-24.json).
  **413 distinct cases pass**, reusing unchanged passes; the final context,
  adapter and catalog/fixture checks reran **194/194**.
- Both TypeScript projects pass; canonical build verified. Compatibility
  preserves older two-argument QA tool catalogs; current model tools require
  the explicit context enum. The rendered UI pass predates the voice-only
  context/replay refinements; unchanged UI/backend passes are reused, and the
  refinements have their own focused and provider evidence.
- Rendered `--media-skill-functional` journey: **23 checks, exit 0**, 15 screenshots.
  Real Console alias validation/Save/Cancel/reload/removal; local discovery;
  decoded music/video/pictures, stop/return, loops, stale/deleted resources.
  Inspected alias authoring, music/avatar, decoded video and uncropped picture
  screenshots. Raven's separate portrait capture is correctly framed on black,
  without captions; the screenshot does not establish conversational quality.
  Built-in synthetic avatar proves controls/media, not Raven's personality.
- Real-provider `phonetic_media`: four retained development samples, each
  **exit 2**; this is not an overall QA pass. The final build passed **6/6
  functional turns**, but only **1/6 overall turn-quality judgments** passed.
  Published Raven persona/model/voice, synthetic visitor audio and fixture
  tracks. Natural wording, absent version, teasing, homophones and one version
  clarification. Transcript/audio retained only in RAM; no human Jabra claim.

The [first provider sample](music-search-repair-provider-1-2026-10-24.json)
exited 2: five of six runtime turns passed, but the later sound-alike request
returned zero candidates; only two of six dialogue-quality turns passed. The
judge flagged unsupported claims/unnecessary questions and weak character in
some conversational turns. Actual query/transcript text was not retained, so
the failed lookup's precise argument/cause cannot be reconstructed. Inspection
found and repaired the expired-refinement dead end above, and narrowed miss
guidance to ask only for missing clues, without invented explanations. No
persona or rubric was changed to make the sample pass. Later samples retain
bounded query-match/result-code metadata to distinguish matching from context.

[Sample 2](music-search-repair-provider-2-2026-10-24.json) passed all six runtime
turns but four of six overall turn-quality judgments. [Sample 3](music-search-repair-provider-3-2026-10-24.json)
exposed a separate, directly localized regression: the model reused the
successfully played song ID on a later clear request, and the new selection
guard rejected it instead of playing. That overrestriction is repaired with
the successful-play cache above. The fixture now accepts either fresh lookup
or direct replay while still requiring the exact requested asset, Main playback
and completion. It does not treat a rejected play call as success. Sample 3's
five-of-six runtime / one-of-six quality result remains retained.

The [final-build sample](music-search-repair-provider-4-2026-10-24.json) passed
natural/reordered clues, missing-version non-substitution, conversation without
unrequested playback, sound-alike lookup, ambiguity and the later version choice.
The sound-alike turn used `context=refine` after the detour and successfully
searched fresh, directly exercising that repair. Successful direct replay has
focused adapter/context evidence; this final provider sample chose a new search.
The dialogue judge still flagged mechanism narration, an unsupported claim in
banter, a playback preamble and low naturalness/character. Exact wording is
RAM-only. The rubric and published persona were unchanged; these remaining
voice-quality failures are open, not hidden by the functional passes. No
staged jokes or transcript-based speech filters were added. No percentage here
is a general recognition or personality accuracy rate.

Normal Electron was already owner-stopped at 17:32:38 Taipei before this work's
QA. Preserve STOP and the black-HDMI cover. Jabra is lowered to approximately 1%
only for isolated QA, then restored/read back at approximately 70% through an
EXIT trap on every run. Mute/input gain and other output levels are preserved.
Production active config, draft and media-folder settings are hash-checked.
Final build: source `5da9746c55d736c4e7bdbe0addd2f7473fbba2bcbf3741e79d617fa4e4966211`,
output `ada4d477c3c241ca10b5ccdcadd957cf12c84295feb93ba6359a8eabf8242628`,
built 2026-10-24 19:30:37 Taipei. Ready for the owner's next START; no normal
Electron launch overrides STOP. Metadata, development failures and cleanup
receipts are retained in the checks/provider JSON files; owned QA images,
audio fixtures and isolated settings are disposable test artifacts.

## Limits

Synthetic provider samples establish observed integration behavior, not a human
recognition accuracy rate, physical loudness or universal persona consistency.
The earlier camera/USB microphone interruptions remain a separate issue.
No claim that the original field conversation was replayed: its transcript had
cleared at Dormant. Broader Studio recovery issues remain outside this repair.
