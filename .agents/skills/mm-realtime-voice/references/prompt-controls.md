# Prompts and structured controls

[Prompt practice](../../roleplay-control-prompts/SKILL.md) owns general guidance;
[DECISIONS](../../../../DECISIONS.md) owns accepted behavior. This page maps that
behavior to the current wiring.

## Sources and assembly

- `resources/config/prompts/realtime.v1.json`: session template, application
  speech and defaults. Adjacent `realtime-tools.v1.json`: function schemas,
  `useWhen`/`avoidWhen`/`speech` rules and structured results. Operator config:
  personality, speaking style, greeting and farewell. Code: assembly/ordering.
  The authoritative persona is Console draft → Publish, assembled by
  `src/shared/avatar-prompt.ts`; catalog `defaults` are fallbacks, not Raven's
  published character. Do not edit defaults to pretend to update the operator persona.
- The session catalog reinforces character continuity through tools, failures,
  corrections and language changes, while preserving truthful AI disclosure.
  Its default response length permits expansion for requested detail and complete
  recall. Evaluate actual character separately; a prompt assertion is not evidence
  that the configured model stays in character.
- `src/shared/realtime-tools.ts` validates/freezes the catalog, renders rules
  into the prompt and sends descriptions as function definitions; avoid
  duplication. `src/renderer/realtime/realtime-tool-bindings.ts` binds implemented
  handlers and validates arguments before effects. Schemas are closed objects
  with all fields required; unsupported keywords fail loading. The Realtime wire
  carries no `strict` flag, so the bindings' validation is the enforcement.
  Omitted unused memory strings are filled before validation; supplied wrong
  types and unknown fields still fail.
- **Results.** Small JSON (`status`, bounded `code`, optional `next` and data).
  Speech ownership and identity-question receipts stay out of model output.
  `memory_confirmation_pending` is a background result: the application-owned
  identity question speaks next, and identifying the pending name again keeps
  its token. `memory_identity_required` carries catalog `memoryLocked` as `next`:
  an unconfirmed visitor's own statements are answered from the conversation.
  Mini preambles before local search and memory regardless of wording (2026-10-14
  ledger), so the owner now allows one short line before `find_media` and
  non-identify `memory` calls; identify and other tools stay silent. The probe's
  quick-tool set and the judge criteria follow that ruling. The
  `tool_<name>_<outcome>_preamble_<yes|no>` diagnostic and
  `raven-quality-rates.mjs` `measured_tool_preamble` use the calling response's
  measured audio, not the judge label or earlier speech in the turn. Compact rendering removes only duplicate wording; every authored
  `useWhen`/`speech`/`avoidWhen` rule reaches the model.
  Sleep and media use background completion. Camera adds one RAM-only image
  with `triggerResponse: false`. Memory's private result goes only to the
  transient tool output. `background_on_reset` suppresses replies until Main
  replaces the session.
- **Application speech.** Greeting, farewell, scene cue, scene dialogue and
  audition are out-of-band responses (`conversation: 'none'`, `input: []`,
  `tool_choice: 'none'`, `src/shared/realtime-prompts.ts`), never persistent
  user messages.
- **Interactive Studio.** `start_portrait_studio` switches to the studio agent;
  catalog availability is `conversation`, `studio` or `all`. Visit ownership,
  ordering, cleanup and editor sources: [Interactive Studio](interactive-studio.md).
- Catalog edits need rebuild/restart. Console **Effective realtime prompt &
  tool** uses the same draft/published builders; every model-visible path belongs
  in that inspector.
- **Media source order (DECISIONS 2026-10-14).** Media searches stay local.
  The adapter allows `search_youtube`/`play_youtube` only when the latest final
  transcript opens with the avatar's hidden `cloudSearchPhrase` (default
  「在雲上找找」; `opensWithSpokenPhrase`, sound-alike key, prefix allowed); the
  phrase alone also covers the next turn, and returned URLs stay playable for a
  later selection. Otherwise `search_youtube` performs only a local lookup and
  returns `media_source_restricted`/`_unconfirmed` with catalog `mediaNoMatch` as
  `next`. On an allowed turn a `find_media` miss returns `mediaOnlineSearch`.
  The phrase is a Console Persona field and transcription hint, never model text;
  a phrase turn is a control turn for memory. `media_discovery_weak` (an alias
  merely contained in the sentence, often an artist) returns `next: ask`; a title
  contained in the sentence still matches.
  Local Mandarin discovery now has a separate pronunciation index (owner request,
  2026-10-23): homophones, tones, in/ing, en/eng and zh/z, ch/c, sh/s can find
  title/alias candidates. Literal matches rank first; tied versions remain
  ambiguous and contained artist aliases remain weak. Unknown text and syllable
  boundaries are preserved. This reuses pinned public pronunciation data, never
  the command matcher or its authorization rules. `media_discovery_phonetic`
  reports the fallback without retaining query text.
  The tool uses `all` unless a visitor specifies a media type. On a type-filter
  miss Main also checks the authorized local catalog across types and returns
  `media_discovery_kind_mismatch` plus `next: ask` when a title exists in another
  type. This prevents a guessed video filter from hiding a music track; it never
  dispatches playback or grants online access.

## Spoken commands

- **Separate controls.** Wake detection (local sherpa package), sleep intent
  (`return_to_dormant` tool), wake greeting and farewell are separate.
  Transcription `keywords` carry the selected wake/sleep/enabled spell phrases;
  they are hints, never authorization.
- **Media stop.** The owner-confirmed 「停止播放」 is an application command
  during Active playback, using the same whole-transcript matcher and control
  exclusion. `stop_media` is retired from the model's tools. Dormant loops use
  the configured native wake phrase.
- **Online search phrase.** The avatar's hidden `cloudSearchPhrase` uses the
  same key but may open a longer request (owner exception to whole-utterance
  equality, DECISIONS 2026-10-14). It unlocks online media search only; see
  Media source order above.
- **Hidden spells.** They stay in the matcher and the hints, never in persona
  text or model tools. Main
  ([ipc](../../../../src/main/ipc.ts),
  [scene runtime](../../../../src/main/scenes/scene-runtime.ts)) checks
  enabled scope, duplicate turn, cooldown and approved presets. Only presets
  drive hardware.
- **Sound-alike target (2026-10-11 ruling):** whole-final-transcript equality,
  once per turn. Shared-lexicon folding accepts script variants, homophones,
  tones and in/ing, en/eng; zh/z, ch/c, sh/s remain held. Test positive/negative
  phrases. No added/missing words, quotation/negation, substring, edit-distance
  or model authorization. Matcher: `spokenCommandKey`/`isSpellAttempt` in
  `src/shared/spoken-command.ts` with the generated
  `src/shared/command-lexicon.json` (regenerate per the
  [lexicon README](../../../../src/main/wake/lexicon/README.md)). Add cases to
  `tests/unit/spoken-command.test.ts`; DECISIONS owns the accepted folds.
- **One matcher, five callers.** Spells, the scene stop phrase
  ([transcript controller](../../../../src/renderer/mirror/scene-transcript-controller.ts)),
  media-wake and the online search phrase (`realtime-session-adapter.ts`) and memory's control-turn
  exclusion (`src/main/memory/relationship.ts`) share that key, so a
  sound-alike spell never reaches extraction (invariant 6). Publish rejects
  spells whose folded keys collide (`normalized_spell_collision`). Never compare
  commands with the older character-exact `normalizeTranscript` in
  `spell-trigger.ts`.
- **Turn ownership.** Spell-prefix turns are application-owned: the adapter
  interrupts on `isSpellAttempt`, then cancels and mutes late automatic
  responses. Provider audio can still start before final ASR; prompt silence
  alone cannot close that race.
- **Cue timing (MX-05, DECISIONS 2026-10-10).** An authorized scene starts
  without waiting for the cue. VAD may cancel cue speech, not the scene.
  Session change and Stop clean up. Cue and scene dialogue must share one
  speech queue.

## Evidence

Check schema/inspector parity, arguments, stale/duplicate events, matching and
cue/playback ownership separately. [QA modes](../../mm-ui-qa/references/modes.md)
defines text, synthetic WebRTC and physical evidence. Dated results:
[RCA](../../../../docs/testing/wake-spell-rca-2026-10-10.md),
[second audit](../../../../docs/testing/second-audit-remaining-failures-2026-10-11.md).
Synthetic recognition rates do not establish human accuracy.
