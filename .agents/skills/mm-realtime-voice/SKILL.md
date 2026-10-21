---
name: mm-realtime-voice
description: "Implement or audit Magic Mirror Realtime voice, Interactive Studio visits, prompts/tools, playback, mic handoff, profile switching or memory extraction."
---

# Realtime voice

Use versioned config/frozen snapshots and the pinned SDK's contract tests.
Load only the reference for the failing boundary:

| Boundary | Read |
|---|---|
| Prompt design, preambles, language, persona | [roleplay-control-prompts](../roleplay-control-prompts/SKILL.md) |
| Tool catalog, prompt inspector, spoken commands and spells | [prompt controls](references/prompt-controls.md) |
| Interactive Studio visits, name/questions, pictures, mode switches | [Interactive Studio](references/interactive-studio.md) |
| Session construction, transcription config, privacy flags | [SDK/session](references/sdk-session.md) |
| Barge-in, output completion, mic handoff, rollover, profile change | [playback/lifecycle](references/playback-lifecycle.md) |
| Voice Studio pitch/formant DSP, latency or processed-audio cleanup | [playback/lifecycle](references/playback-lifecycle.md#voice-dsp) |
| Responses memory extractor | [memory extraction](references/memory-extraction.md) |

Dialogue hears raw audio independently of ASR and may precede its final text.
Handle late/missing transcripts with metadata reasons. Diagnose input delivery,
final ASR, matching, model reply, cue playback and Main execution separately.

The processed output mutes the SDK receiver; actual playback plus its tail
governs transitions, not generation completion. Synthetic WebRTC tests prove
provider integration, not [physical audio](../mm-wake-word/references/handoff-platform.md).
[AGENTS](../../../AGENTS.md) owns privacy, mic/profile/extraction ownership and
execution policy.
