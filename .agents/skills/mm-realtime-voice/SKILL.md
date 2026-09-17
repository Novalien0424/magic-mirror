---
name: mm-realtime-voice
description: "Implement or debug Magic Mirror Realtime sessions, voice playback, transcripts, mic handoff, profile switching or Responses extraction."
---

# Realtime voice

Runtime model/voice IDs come from versioned config and frozen session/job snapshots, never this skill or the coding-agent model. Pinned SDK code and accepted contract tests own API details.

| Boundary | Read |
|---|---|
| Structured tool registry, prompt inspector or spoken controls | [Prompts and structured controls](references/prompt-controls.md) |
| Session construction, ephemeral credentials, transcript events or privacy flags | [SDK/session](references/sdk-session.md) |
| Barge-in, output completion, mic handoff, noisy-room tuning, rollover or profile change | [playback/lifecycle](references/playback-lifecycle.md) |
| Responses memory extractor | [memory extraction](references/memory-extraction.md) |

Transcripts, conversation audio, extracted values and injected private context remain RAM-only. Disable audio history and tracing before connect; never expose the master key. Voice never waits for transcripts; missing text disables transcript-driven controls with a metadata reason.

Use one microphone owner with release then acquire. Close caller-owned tracks explicitly. Current processed output mutes the SDK receiver and sends only the shared audio graph to speakers. Actual playback plus the processed tail, not generation completion, governs transitions.

Close old-owner history before clean verbal confirmation and agent update. Guest IDs stay in Main; extraction uses the turn-start owner and skips control turns. Preserve reasoned stale-event rejection. [AGENTS](../../../AGENTS.md) owns the canonical invariants and execution policy.
