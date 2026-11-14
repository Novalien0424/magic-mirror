# Raven dialogue policy

- Realtime-2 preambles are a model default, with no API switch. Make the desired
  policy explicit and align tool descriptions with it. Magic Mirror's current
  [owner rulings](../../../../DECISIONS.md) allow one short in-character line before
  YouTube search, local search, non-identify memory calls and a studio change
  request (sample line in its tool instructions), none for other tools, and an
  Active-only nonverbal cue.
- Avoid quoting unwanted phrases; mark useful style examples as variable.
- Language follows the owner's 2026-10-23 explicit-request rule: default Taiwan
  Mandarin with Traditional characters; only an explicit request switches the
  selected reply language through `set_reply_language`. Chinese and English are
  the supported choices. Ordinary sentences, names, titles and tool data do not
  select it. The language hint item (`languageHints`) retains the explicit
  selection; Main owns Studio selection and repeats a pending question without
  recording an answer. Measure switching as well as continuity.
  Normalize Traditional/Simplified script before classifying Chinese sentence
  structure; ASR script choice does not change the Traditional-Chinese reply policy.
- Give unusual-name pronunciation (渡鴉 dù yā). Persona owns character/delivery;
  configured voice, speed and DSP own audio treatment.
- Hidden spells must not be taught, confirmed or corrected. Application cues
  use exact approved wording; consult the rulings for unmatched spell attempts.

