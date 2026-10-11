---
name: roleplay-control-prompts
description: "Design or repair prompts for a realtime voice character (e.g. Raven) whose dialogue coexists with hidden spells, application-spoken cues, tools or device effects."
---

# Roleplay control prompts

A realtime speech-to-speech model is probabilistic. A prompt shapes rates; it
never authorizes effects or guarantees silence. Application code owns
authority and ordering; the prompt owns character and conversation.

## Split authority

- **Application-owned:**
  - spell/command matching and once-per-turn execution;
  - effect ordering;
  - cue and farewell wording;
  - identity questions.
- **Model-owned:**
  - persona;
  - ordinary replies;
  - choosing native tools from a versioned catalog.

  Keep hidden command catalogs out of the dialogue prompt. They belong only in
  the matcher and the transcription hints.
- **Turns the application owns must not get a model reply** (e.g. a recognized
  spell). Suppress or cancel that reply in code. "Stay silent" in the prompt
  is not enough: the model hears raw audio and can answer before the final
  transcript exists.
- **Separate the failing boundary before editing the prompt.** The boundaries
  are delivery, ASR, matching, model reply and playback. Do not treat an ASR
  miss with dialogue restrictions, confirmation gates or regex speech filters.

## Write the prompt (current OpenAI realtime guidance)

- **Section order:** Role/Personality, Language, Pacing/Variety, Tools and
  Preambles, Character rules. Use short bullets. Say each rule once, in one
  place: either the tool description (what the tool does and when to call it)
  or the tool rules. Delete a superseded rule; never stack a contradiction on
  top of it.
- **Preambles:** gpt-realtime-2 models speak preambles before tools *by
  default*. State the desired policy explicitly in the prompt and in tool
  descriptions ("Preamble: none."). There is no API flag. Pair a no-preamble
  policy with a non-verbal application progress cue for slow tools.
- **Sample phrases:** never quote a phrase you want avoided. The model copies
  quoted phrases. Style samples, if any, must say "vary; do not repeat
  verbatim".
- **Language:** pin it explicitly. Reply in the language of the visitor's
  latest substantive utterance. Chinese means Taiwan Mandarin with Traditional
  characters. Greeting language, names, titles and English tool data do not
  switch it. A per-turn language line set by the application from the
  visitor's transcript is a stronger control than prose alone.
- **Pronunciation and voice:** give the reading of unusual names (渡鴉 dù yā).
  Keep pacing, brevity and variety in the persona text. Voice, speed and DSP
  belong in configuration.
- **For a hidden spell game:** the character reacts in character to failed
  attempts without revealing or correcting incantations. Performance cues come
  from the application and are spoken exactly.

## Prove it

- Measure rates over repeated real-provider runs, not single passes, and keep
  failed runs. Track the preamble rate, wrong-language rate, extra speech on
  application-owned turns and persona consistency.
- Separate these evidence classes:
  - prompt assertions;
  - synthetic text;
  - synthetic PCM through WebRTC ASR;
  - provider output;
  - physical playback;
  - human microphone accuracy.
- If speech must precede an effect, prove it from actual playback plus its
  processed tail, never from request time or a fixed delay.

Magic Mirror specifics (files, matcher, rulings, evidence):
[prompt controls](../mm-realtime-voice/references/prompt-controls.md).
Sources checked 2026-10-11:
[realtime models prompting](https://developers.openai.com/api/docs/guides/realtime-models-prompting),
[voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
[realtime prompting cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide).
