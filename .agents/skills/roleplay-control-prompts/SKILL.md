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
For a missed visual tool call, check separately whether the microphone
transcription preserved the camera request and whether an image reached the
session. ASR is a diagnostic proxy for the audio the model heard, not proof of
its internal interpretation. Do not gate tool/image assessment on that proxy;
an unavailable ASR judge is unknown. Keep diagnostic verdicts metadata-only.

## Prompt design

- Use short sections for role, language, delivery, tools and character. State
  each rule once; descriptions explain tools, rules guide their use. Replace
  superseded instructions instead of accumulating exceptions.
- Start with the smallest prompt that explains the desired behavior. Token/tool
  counts are measurements, not optimization targets: keep necessary capabilities
  and compare matched evaluations before claiming that pruning improved quality.
- Preserve the operator persona across ordinary help, failures, corrections and
  language changes. Prefer observable attitude/diction over generic "stay in
  character" repetition. Character never licenses invented facts or capabilities;
  sincere AI-identity questions still get truthful answers. Character design and
  evaluation: [character and evidence](references/character-evaluation.md).
- Realtime-2 preambles are a model default, with no API switch. Make the desired
  policy explicit and align tool descriptions with it. Magic Mirror's current
  [owner rulings](../../../DECISIONS.md) allow one short in-character line before
  YouTube search, local search, non-identify memory calls and a studio change
  request (sample line in its tool instructions), none for other tools, and an
  Active-only nonverbal cue.
- Avoid quoting unwanted phrases; mark useful style examples as variable.
- Language follows the owner's complete-sentence rule: default Taiwan Mandarin
  with Traditional characters; a complete English sentence switches to English.
  Greetings, names, media titles and tool data do not select it. The visitor
  language hint item (`languageHints`) retains the last complete sentence across
  title/name turns and explicitly yields to new complete speech. It shapes the
  rate without waiting for final ASR; measure switching as well as continuity.
  Normalize Traditional/Simplified script before classifying Chinese sentence
  structure; ASR script choice does not change the Traditional-Chinese reply policy.
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
Sources checked 2026-10-13 (model-family advice requires evaluation on the configured model):
[realtime models prompting](https://developers.openai.com/api/docs/guides/realtime-models-prompting),
[voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
[realtime prompting cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide).
