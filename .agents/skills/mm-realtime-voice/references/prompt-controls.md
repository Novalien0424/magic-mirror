# Prompts and structured controls

General prompt practice for Raven (sections, preambles, language, sample
phrases, evaluation by rates) lives in
[roleplay-control-prompts](../../roleplay-control-prompts/SKILL.md). This page
holds only Magic Mirror wiring, rulings and evidence.

## Sources and assembly

- **Prompt and tool sources.**
  - `resources/config/prompts/realtime.v1.json` owns the session template,
    application speech and defaults.
  - `realtime-tools.v1.json` owns native function schemas, `useWhen` /
    `avoidWhen` / `speech` rules and structured results.
  - Operator configuration owns persona values: personality, speaking style,
    greeting and farewell.
  - Code owns assembly, authorization and ordering.
- **Loading and validation.**
  - `src/shared/realtime-tools.ts` validates and freezes the catalog. It
    renders the rules into the prompt **and** sends each `description` as the
    function definition, so do not repeat one in the other.
  - `src/renderer/realtime/realtime-tool-bindings.ts` binds only implemented
    handlers and validates arguments before effects.
  - Schemas are strict objects with every field required; unsupported keywords
    fail loading.
- **Results.** Small JSON (`status`, metadata-only `code`, `speech` owner).
  Sleep and media use background completion. Camera adds one RAM-only image
  with `triggerResponse: false`. Memory's private result goes only to the
  transient tool output. `background_on_reset` suppresses replies until Main
  replaces the session.
- **Application speech.** Greeting, farewell, scene cue, scene dialogue and
  audition use response-scoped instructions with `input: []` and
  `tool_choice: none`, never persistent user messages.
- **Rebuild needed.** Both catalogs are bundled; rebuild and restart after
  edits. The Console **Effective realtime prompt & tool** view shows
  draft/published snapshots built by the same builders. Any new model-visible
  path must appear there.

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
- **Sound-alike ruling (DECISIONS 2026-10-11).**
  - The whole final transcript must be the command, once per turn.
  - "Normalized" includes deterministic sound-alike folding: OpenCC
    Simplified→Traditional plus toneless pinyin from
    `src/main/wake/lexicon/data.ts`. Optional in/ing and en/eng merges only
    after positive and negative phrase tests.
  - Added, missing or different words, quotes and negations never match. No
    substring, edit-distance or model-judged authorization.
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
- **Application-owned turns.** A spell-prefix turn gets no model reply. The
  model's automatic VAD response can be created *after* the application's
  interrupt (measured 0.11 s later on 2026-10-10). Cancel every
  non-application `response.created` for that turn; prompt silence alone
  cannot stop it.
- **Cue timing (MX-05, DECISIONS 2026-10-10).** An authorized scene starts
  without waiting for the cue. VAD may cancel cue speech, not the scene.
  Session change and Stop clean up. Cue and scene dialogue must share one
  speech queue.

## Evidence

- **Check the failing boundary:** schema/inspector parity, arguments,
  duplicate/stale events, matching, or cue/playback ordering.
- **Know the limits of each harness:**
  - Lifecycle and spell QA use synthetic text.
  - Raven QA sends synthesized PCM through WebRTC ASR. Apple TTS voices
    changed the meaning in ~17% of judged turns, so they understate human
    recognition.
  - Neither proves physical microphone or speaker acceptance.
- **History:** [2026-10-10 RCA](../../../../docs/testing/wake-spell-rca-2026-10-10.md)
  and [2026-10-11 audit](../../../../docs/testing/second-audit-remaining-failures-2026-10-11.md).
  These are dated results, not accuracy rates.
