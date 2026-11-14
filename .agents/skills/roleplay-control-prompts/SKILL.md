---
name: roleplay-control-prompts
description: "Design or repair Realtime character dialogue alongside application-owned cues, commands and tools."
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
- Raven preambles, language selection, pronunciation and hidden commands:
  [current dialogue policy](references/raven-policy.md). Read for those behaviors.

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
