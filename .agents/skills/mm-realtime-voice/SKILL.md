---
name: mm-realtime-voice
description: "Implement or debug Magic Mirror Realtime sessions, prompts/tools, voice playback, transcripts, spoken commands, mic handoff, profile switching or Responses extraction."
---

# Realtime voice

Raven is a speech-to-speech LLM, not a deterministic program. Prompts shape
behavior rates; application code owns authorization, ordering and
application-owned turns. Runtime model, voice and transcription IDs come only
from versioned config and frozen snapshots. The pinned SDK and contract tests
own API details.

| Boundary | Read |
|---|---|
| Prompt design, preambles, language, persona | [roleplay-control-prompts](../roleplay-control-prompts/SKILL.md) |
| Tool catalog, prompt inspector, spoken commands and spells | [prompt controls](references/prompt-controls.md) |
| Session construction, transcription config, privacy flags | [SDK/session](references/sdk-session.md) |
| Barge-in, output completion, mic handoff, rollover, profile change | [playback/lifecycle](references/playback-lifecycle.md) |
| Responses memory extractor | [memory extraction](references/memory-extraction.md) |

- **Dialogue can start before the final transcript.** Raven hears raw audio
  and replies independently of the separate ASR model. Transcript-driven
  controls must handle late or missing text with a metadata reason.
- **For a spell or command failure, isolate one boundary at a time:** input
  delivery, final ASR, application matching, model reply, cue playback, then
  Main execution.
- **Know what each check proves.** Synthetic WebRTC ASR exercises the provider
  path only. Physical microphone and speaker acceptance need those routes
  ([physical wake boundaries](../mm-wake-word/references/handoff-platform.md)).
- **Output completion means playback.** The processed output mutes the SDK
  receiver, and actual playback plus its processed tail, not generation
  completion, governs transitions.

[AGENTS](../../../AGENTS.md) owns the invariants (privacy, single mic owner,
profile change, extraction ownership) and execution policy. Do not restate them
here.
