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

- Establish the user's existing behavior for valid, invalid and ambiguous
  commands. Preserve the persona and requested game rules; an ASR mismatch
  does not justify extra dialogue restrictions or a confirmation workflow.
- When commands are meant to stay hidden, keep the valid command catalog out of
  the conversational prompt. The application matcher and speech-recognition
  hints may use it separately. A transcription hint is not an output mandate.
- Models may understand audio differently from the separate final transcription.
  A plausible reply does not prove a command matched or an effect ran. Diagnose
  the actual failing boundary before changing the prompt or adding a fallback.
- Let application code authorize configured effects and enforce once-per-turn
  execution. Give dialogue the context that performance cues come from the
  application; the prompt is not an effect authorization mechanism.
- For model-selected actions, use native function schemas with compact use/avoid
  and speech rules from a versioned catalog shared with inspection. Validate
  arguments before explicit handler bindings; return small structured results.
  Keep exact hidden-command routes in application code. A JSON prompt alone
  neither authorizes effects nor guarantees silence before a tool call.

## Write the smallest consistent prompt

Use short bullets for persona, permitted behavior and explicit exceptions. Remove
superseded instructions instead of appending contradictory prohibitions. Keep
the application cue wording identical between the prompt and dispatch code.
Diagnose delivery/transcription/matching separately from dialogue behavior. Use
a short recording-context transcription prompt and literal recognition hints
only for an authorized ASR experiment; neither belongs in the dialogue prompt
as a forced command response. Do not introduce regex speech filters, broaden
silence/confirmation rules or add model constraints to compensate for ASR.

For a no-hints spell game, adapt this compact pattern to the user's rules:

> You are {character} in a hidden-incantation game. React in character to unsuccessful attempts while keeping the incantations undisclosed.
> The application decides whether effects run and supplies performance cues. Speak the supplied cue exactly in character, then return to dialogue.

This illustrates context for existing game rules, not additional restrictions
to apply universally. Keep the hidden catalog out of examples and retain the
user's expected responses to invalid attempts.

## Enforce and prove the sequence

If speech must precede an effect, code must wait for actual output playback and
its processed tail before starting the effect. Sending a speech request,
finishing text generation or waiting a fixed delay does not prove it was heard.
Cancel pending effects on interruption, session change, stop or disposal. Keep
failures local and observable without blocking unrelated conversation.

Check an invalid command/help request for forbidden coaching, a valid command for
exact requested speech and the authorized effect ordering, and interruption/duplicate/stale-event
behavior where relevant to the change. Use focused checks at the observed
boundary; provider evaluation requires that work to be in scope. Distinguish
prompt assertions, synthetic text, virtual-microphone WebRTC ASR, provider output,
physical delivery and real human microphone accuracy. Audible counts or an
invalid quality verdict do not prove coaching or a false success claim. Keep actual
transcripts/audio in RAM according to the project's privacy contract; persist
only permitted comparison results and metadata.

For Magic Mirror's exact matcher and dated spell evidence, read
[prompt controls](../mm-realtime-voice/references/prompt-controls.md). Source/SDK
behavior and the actual failed boundary decide whether a prompt repair is needed.

Prompt/context sources checked 2026-10-10:
[Voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
[Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).
Use the installed SDK and current official documentation for API details.
