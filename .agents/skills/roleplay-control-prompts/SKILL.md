---
name: roleplay-control-prompts
description: "Design or repair character-agent prompts with hidden game commands and application-controlled speech or effects."
---

# Roleplay control prompts

Use for character/entertainment agents whose dialogue coexists with spells,
hidden commands, scenes or device effects. Do not impose these rules on ordinary
assistants, tutorials or unrelated prompt work; the user's product rules decide
whether players may receive help.

## Separate character behavior from application authority

- Establish the requested behavior for valid, invalid and ambiguous commands.
  Do not add coaching, confirmation, hints or command discovery because a general
  assistant would be helpful. Preserve the persona during failures.
- When commands are meant to stay hidden, keep the valid command catalog out of
  the conversational prompt. The application matcher and speech-recognition
  hints may use it separately. A transcription hint is not an output mandate.
- Models may understand audio differently from the separate final transcription.
  A plausible reply does not prove a command matched or an effect ran. Diagnose
  the actual failing boundary before changing the prompt or adding a fallback.
- Let application code authorize configured effects and enforce once-per-turn
  execution. Model dialogue must not claim effects independently.
- For model-selected actions, use native function schemas with compact use/avoid
  and speech rules from a versioned catalog shared with inspection. Validate
  arguments before explicit handler bindings; return small structured results.
  Keep exact hidden-command routes in application code. A JSON prompt alone
  neither authorizes effects nor guarantees silence before a tool call.

## Write the smallest consistent prompt

Use short bullets for persona, permitted behavior and explicit exceptions. Remove
superseded instructions instead of appending contradictory prohibitions. Keep
the application cue wording identical between the prompt and dispatch code.

For a no-hints spell game, adapt this compact pattern to the user's rules:

> Stay in character. Never teach, reveal, correct or suggest incantations or game mechanics, including after mistakes or requests for help.
> Leave designated command utterances to the application; do not independently announce casting or claim effects.
> For an application performance cue, speak only its exact supplied text in character, without explanation.

Do not expose the hidden command catalog as examples. Do not introduce a general
silence rule when the user expects an in-character response to invalid attempts.

## Enforce and prove the sequence

If speech must precede an effect, code must wait for actual output playback and
its processed tail before starting the effect. Sending a speech request,
finishing text generation or waiting a fixed delay does not prove it was heard.
Cancel pending effects on interruption, session change, stop or disposal. Keep
failures local and observable without blocking unrelated conversation.

Check an invalid command/help request for forbidden coaching, a valid command for
exact requested speech before the effect, and interruption/duplicate/stale-event
behavior. Use focused tests plus a bounded real-provider test when repairing
observed model behavior. Distinguish prompt assertions, synthetic text control
tests, provider output, physical audio and real microphone accuracy. Keep actual
transcripts/audio in RAM according to the project's privacy contract; persist
only permitted comparison results and metadata.

Sources checked 2026-09-17: [Voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
[Realtime function tools](https://developers.openai.com/api/docs/guides/realtime-mcp).
Use the installed SDK and current official documentation for API details.
