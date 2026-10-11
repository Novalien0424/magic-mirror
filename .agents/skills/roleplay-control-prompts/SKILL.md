---
name: roleplay-control-prompts
description: "Design or repair prompts for a realtime voice character (e.g. Raven) whose dialogue coexists with hidden spells, application-spoken cues, tools or device effects."
---

# Roleplay control prompts

A realtime prompt shapes behavior rates; it cannot guarantee silence or
authorize effects. The application owns matching, effect ordering, cues,
farewells and identity questions. The model owns character, conversation and
native tool selection from the versioned catalog.

## Diagnose before prompting

Separate delivery, ASR, matching, model reply and playback. The model hears raw
audio and can reply before final ASR: suppress/cancel replies on application-owned
turns in code. Keep hidden commands in the matcher/transcription hints, outside
dialogue prompts. ASR misses do not justify dialogue restrictions, confirmation
gates or regex speech filters.

## Prompt design

- Use short sections for role, language, delivery, tools and character. State
  each rule once; descriptions explain tools, rules guide their use. Replace
  superseded instructions instead of accumulating exceptions.
- Realtime-2 preambles are a model default, with no API switch. Make the desired
  policy explicit and align tool descriptions with it. Magic Mirror's current
  [owner rulings](../../../DECISIONS.md) allow one short in-character line before
  slow YouTube search, none for quick tools, and an Active-only nonverbal cue.
- Avoid quoting unwanted phrases; mark useful style examples as variable.
- Language follows the owner's complete-sentence rule: default Taiwan Mandarin
  with Traditional characters; a complete English sentence switches to English.
  Greetings, names, media titles and tool data do not select it. A per-turn
  language hint is a candidate to test, not an implemented guarantee.
- Give unusual-name pronunciation (渡鴉 dù yā). Persona owns character/delivery;
  configured voice, speed and DSP own audio treatment.
- Hidden spells must not be taught, confirmed or corrected. Application cues
  use exact approved wording; consult the rulings for unmatched spell attempts.

## Evidence

Measure preambles, language, extra application-turn speech and persona quality
over repeated real-provider runs; retain failures. Distinguish prompt assertions,
synthetic text/PCM, provider output, physical playback and human microphone
accuracy. Required speech-before-effect ordering uses actual playback plus its
processed tail, never request time or a fixed delay.

Magic Mirror wiring, implementation gaps and evidence:
[prompt controls](../mm-realtime-voice/references/prompt-controls.md).
Sources checked 2026-10-11:
[realtime models prompting](https://developers.openai.com/api/docs/guides/realtime-models-prompting),
[voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
[realtime prompting cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide).
