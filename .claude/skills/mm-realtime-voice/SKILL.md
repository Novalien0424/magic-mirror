---
name: mm-realtime-voice
description: Use when implementing or testing anything touching the OpenAI Agents SDK RealtimeSession, WebRTC voice, ephemeral credentials, input transcription, barge-in, session reconnect/rollover, updateAgent profile flow, or the Responses memory extractor (Phases 1, 5, 6).
---

# OpenAI Realtime Voice — Magic Mirror Reference

## Overview

Verified against `@openai/agents` **0.16.0** and `openai` **7.4.0** on
**2026-08-16**. These facts seed implementation; the Phase 1 live contract
test against the pinned SDK is still the authority (Spec §7.6) — if this file
and the contract test disagree, fix this file.

## Packages & Session Creation

- `@openai/agents` 0.16.0, realtime via subpath `@openai/agents/realtime`
  (lockstep with `@openai/agents-realtime|-core|-openai`). Peer: **Zod v4**.
- `gpt-realtime-2.1` exists and is the SDK default model. Voices include
  `marin`, `cedar` (recommended), `alloy`, `sage`, `verse`, etc.

```ts
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';
const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement }); // pass BOTH
const session = new RealtimeSession(agent, {
  transport,
  model: cfg.realtimeModel,            // from config, never a literal
  historyStoreAudio: false,            // default false — set explicitly anyway
  tracingDisabled: true,
  config: {
    audio: {
      input: {
        transcription: { model: cfg.transcriptionModel, languages: ['zh'] },
        turnDetection: { type: 'semantic_vad', interruptResponse: true },
      },
      output: { voice: cfg.voice },
    },
    reasoning: { effort: cfg.reasoningEffort },  // 'low' baseline
  },
});
await session.connect({ apiKey: ephemeralKey }); // ONLY apiKey|model|url|callId here
```

**Trap:** `connect()` silently ignores `config` — all config goes in the
constructor. `model` is immutable mid-session; `voice` locks after first audio.

## Ephemeral Credentials (Main-process only)

`POST /v1/realtime/client_secrets` with the Keychain key, body
`{ expires_after: { anchor: 'created_at', seconds: 600 }, session: { type: 'realtime', model } }`
→ response `value` starts `ek_`; hand that to the renderer. `seconds` 10–7200.
Expiry gates session *start*, not duration. Never `useInsecureApiKey`.

## Transcripts

- Completed transcript arrives on raw event
  `conversation.item.input_audio_transcription.completed` (`item_id`,
  `transcript`); SDK surfaces it via `history_updated`/`history_added`.
- `gpt-live-transcribe` exists; SDK default is `gpt-4o-mini-transcribe` —
  set ours explicitly from config. New models take `languages: []`.
- **Transcripts lag or go missing by design** — the model can answer before
  the transcript lands. Voice hot path never waits on transcripts; missing
  transcript ⇒ no spell, no identity confirmation, no memory, log
  `transcript_unavailable` (Spec §7.1).

## Barge-in & Playback

- VAD interruption is automatic on WebRTC; `session.interrupt()` for manual
  (spell-response cutoff). Emits `audio_interrupted`.
- `audio_stopped` = **generation** done, not speaker-out done. True playback
  end on WebRTC = raw `output_audio_buffer.stopped` via
  `session.transport.on(...)`. Use that for Speaking→Listening, the 300 s
  idle timer, and safe rollover (Spec §8.3).
- Web Audio: the SDK's audio element (ours, unmuted) is the ONLY audible
  path (Spec §8.2). The analyser is a silent tap —
  `audioCtx.createMediaStreamSource(audioElement.srcObject)` → AnalyserNode,
  NEVER connected to `destination` (that would double-play). AI ducking/mute
  acts on `audioElement.volume`. Chromium's MediaStreamSource quirk is
  satisfied automatically because the stream stays attached to the playing
  element.
- We supply the `mediaStream`, so `close()` does NOT stop mic tracks — stop
  them explicitly before handing the mic back to the wake worker.

## Profile Switch & Reconnect

- `await session.updateAgent(newAgent)` swaps instructions/tools in-session;
  history is retained — which is exactly why a profile change must first
  CLOSE the old session and confirm in a clean Persona+Master session before
  `updateAgent` loads the new owner (invariant #4).
- **60-minute hard session cap; there is no `reconnect()`.** Rollover =
  wait for turn + playback end → new `ek_` → new `RealtimeSession` (same
  caller-owned MediaStream) → `connect()` → rebuild context. Same-owner
  rollover may `updateHistory(snapshot)`; profile switches never carry
  history.
- Stale events: tag every session with a local `sessionGeneration`; ignore
  and Console-log events from closed generations.

## Privacy Flags (production posture, set explicitly)

Session: `historyStoreAudio: false`, `tracingDisabled: true`, and server-side
`config.tracing = null` (decide before connect — API rejects later changes).
Main env: `OPENAI_AGENTS_DISABLE_TRACING=1`,
`OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1`, `OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1`
(names verified in `@openai/agents-core` config). No `DEBUG=openai-agents*`
in production.

## Memory Extractor (Responses API, Phase 6)

- Structured Outputs shape is nested under `text.format` (NOT
  `response_format`): `{ type: 'json_schema', name, schema, strict: true }`;
  strict mode = all properties required + `additionalProperties: false`.
  Helper: `zodTextFormat()` from `openai/helpers/zod`.
- Model from config. Current tiers: `gpt-5.6-luna` ($0.20/$1.20 per 1M,
  cheapest, Structured Outputs OK, `reasoning.effort: 'none'` available) —
  sensible Draft baseline; `gpt-5.6-terra` mid-tier. Extraction jobs use the
  `JobModelSnapshot` taken at enqueue.
- Snapshot boundary rule (P1-D5/D6, P6-D8): sessions freeze a
  `SessionModelSnapshot` at creation, jobs a `JobModelSnapshot` at enqueue —
  a mid-session Publish never retargets live sessions or in-flight jobs;
  only the next session/job picks up the new revision.

## Gotchas Checklist

- Realtime function tools execute in the renderer → any privileged action is
  a thin IPC call to Main; tools never carry guest IDs (invariant #3).
- Realtime rejects tool `outputSchema` — structured extraction belongs to the
  Responses extractor, not the realtime model.
- Prefer nested `audio.input/output` + `outputModalities` config shape;
  top-level `modalities`/`turnDetection` aliases are deprecated.
- Contract test (Phase 1 start) must cover: WebRTC connect with configured
  model+voice, barge-in stop, transcript↔item-ID mapping, `updateAgent` on a
  clean session, close/fresh-reconnect, and that no audio/tracing content
  persists locally.
