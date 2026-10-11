# Prompts and structured controls

[Prompt practice](../../roleplay-control-prompts/SKILL.md) owns general guidance;
[DECISIONS](../../../../DECISIONS.md) owns accepted behavior. This page separates
current wiring from required command changes still awaiting implementation.

## Sources and assembly

- `resources/config/prompts/realtime.v1.json`: session template, application
  speech and defaults. Adjacent `realtime-tools.v1.json`: function schemas,
  `useWhen`/`avoidWhen`/`speech` rules and structured results. Operator config:
  personality, speaking style, greeting and farewell. Code: assembly/ordering.
- `src/shared/realtime-tools.ts` validates/freezes the catalog, renders rules
  into the prompt and sends descriptions as function definitions; avoid
  duplication. `src/renderer/realtime/realtime-tool-bindings.ts` binds implemented
  handlers and validates arguments before effects. Schemas are strict objects
  with all fields required; unsupported keywords fail loading.
- **Results.** Small JSON (`status`, metadata-only `code`, `speech` owner).
  Sleep and media use background completion. Camera adds one RAM-only image
  with `triggerResponse: false`. Memory's private result goes only to the
  transient tool output. `background_on_reset` suppresses replies until Main
  replaces the session.
- **Application speech.** Greeting, farewell, scene cue, scene dialogue and
  audition use response-scoped instructions with `input: []` and
  `tool_choice: none`, never persistent user messages.
- Catalog edits need rebuild/restart. Console **Effective realtime prompt &
  tool** uses the same draft/published builders; every model-visible path belongs
  in that inspector.

## Spoken commands

- **Separate controls.** Wake detection (local sherpa package), sleep intent
  (`return_to_dormant` tool), wake greeting and farewell are separate.
  Transcription `keywords` carry the selected wake/sleep/enabled spell phrases;
  they are hints, never authorization.
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
  or model authorization. Candidate implementation: OpenCC plus toneless pinyin
  from `src/main/wake/lexicon/data.ts`.
- **One matcher, four callers.** Spells, the scene stop phrase
  ([transcript controller](../../../../src/renderer/mirror/scene-transcript-controller.ts)),
  media-wake (`realtime-session-adapter.ts`) and memory's control-turn
  exclusion (`src/main/memory/relationship.ts`) must share it, or a sound-alike
  spell could reach extraction (invariant 6). Publish must reject spells whose
  folded keys collide.
- **Not yet implemented (2026-10-11).**
  [spell-trigger.ts](../../../../src/main/scenes/spell-trigger.ts) still
  applies NFKC, punctuation and Han-space removal, plus a fixed
  「施放咒语」→「施放咒語」 prefix fold only.
- **Required turn ownership:** prevent model replies on spell-prefix turns,
  including automatic responses created after interrupt. Track response/turn
  ownership; prompt silence alone cannot resolve the measured race.
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
