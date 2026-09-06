---
name: mm-realtime-voice
description: Use when implementing or testing anything touching the OpenAI Agents SDK RealtimeSession, WebRTC voice, ephemeral credentials, input transcription, barge-in, session reconnect/rollover, updateAgent profile flow, or the Responses memory extractor (Phases 1, 5, 6).
---

# OpenAI Realtime Voice - Magic Mirror Reference

## Overview

Verified against @openai/agents **0.16.1** and
@openai/agents-realtime **0.16.1** on **2026-08-16**. These facts seed
implementation; the Phase 1 live contract test against the pinned SDK is
still the authority (Spec section 7.6). If this file and the contract test
disagree, fix this file.

## Codex routing

Use [AGENTS.md](../../../AGENTS.md) for execution policy and `mm-invariants`
for applicable product constraints. This skill supplies Realtime-specific
facts only. Evidence and examples remain metadata-only.

Runtime model IDs come from versioned configuration and frozen session/job
snapshots, never the worker route or a catalog in this skill. Preserve configured
IDs exactly; unavailable models fail visibly without silent substitution.

## Packages and session creation

- `@openai/agents` **0.16.1** and `@openai/agents-realtime` **0.16.1**;
  realtime imports use the official subpath `@openai/agents/realtime`.
  The package graph uses `@openai/agents-core` and `@openai/agents-openai`.
  `openai ^7.2.0` is an umbrella-package dependency, not an
  `agents-realtime` peer or an exact Phase 1 direct pin; the operator-generated
  `package-lock.json` owns the concrete compatible resolution. Peer: **Zod v4**.
- `gpt-realtime-2.1` exists and is the SDK default model. Voices include
  `marin`, `cedar` (recommended), `alloy`, `sage`, `verse`, and others.

```ts
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';
const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement }); // pass BOTH
const session = new RealtimeSession(agent, {
  transport,
  model: cfg.realtimeModel,            // from config, never a literal
  historyStoreAudio: false,            // default false - set explicitly anyway
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

**Trap:** `connect()` silently ignores `config`; all config goes in the
constructor. `model` is immutable mid-session; `voice` locks after first
audio.

## Ephemeral credentials (Main-process only)

`POST /v1/realtime/client_secrets` with the Main-only root `.env` key and this body:

```text
{ expires_after: { anchor: 'created_at', seconds: 600 },
  session: { type: 'realtime', model } }
```

The response `value` starts with `ek_`; hand that value to the renderer.
`seconds` is 10-7200. Expiry gates session start, not session duration. Never
use `useInsecureApiKey`.

Electron Main alone loads `OPENAI_API_KEY` from the ignored repository-root
`.env`. Renderer code receives only the short-lived Realtime credential. Do
not add Console provisioning, `safeStorage`, Keychain, DPAPI, inherited-env,
or alternate-key fallbacks. Keys never enter renderer data, configuration,
logs, telemetry, exports, or agent evidence.

## Transcripts

- A completed transcript arrives on raw event
  `conversation.item.input_audio_transcription.completed` with `item_id` and
  `transcript`; the SDK surfaces it via `history_updated` and `history_added`.
- `gpt-live-transcribe` exists; the SDK default is
  `gpt-4o-mini-transcribe`. Set ours explicitly from config. New models take
  `languages: []`.
- **Transcripts lag or go missing by design.** The model can answer before the
  transcript lands. The voice hot path never waits on transcripts. Missing
  transcript means no spell, no identity confirmation, and no memory; log
  `transcript_unavailable` as metadata only.

Final transcripts, conversation audio, extracted memory values, and injected
private context remain RAM-only. Do not write them to disk, a database,
backups, telemetry, or debug logs, even temporarily for debugging.

## Barge-in and playback

- VAD interruption is automatic on WebRTC; use `session.interrupt()` for manual
  interruption such as spell-response cutoff. It emits `audio_interrupted`.
- `audio_stopped` means generation done, not speaker-out done. True playback
  end consumes the exact raw `output_audio_buffer.stopped` boundary through
  `RealtimeSessionHandle.onOutputAudioBufferStopped` via
  `createPlaybackCompletionTransport(session)`; never use a private
  `session.transport` path. Use `PlaybackCompletion.waitForActualEnd(signal)`
  for Speaking -> Listening, the 300 s idle timer, and safe rollover so
  listener, abort, and analyser-fallback cleanup remains owned by the accepted
  component (Spec section 8.3).
- Web Audio: the SDK audio element (ours, unmuted) is the only audible path
  (Spec section 8.2). The analyser is a silent tap:
  `audioCtx.createMediaStreamSource(audioElement.srcObject)` -> AnalyserNode,
  never connected to `destination` because that would double-play. AI
  ducking/mute acts on `audioElement.volume`. Chromium's MediaStreamSource
  quirk is satisfied automatically because the stream stays attached to the
  playing element.
- We supply `mediaStream`, so `close()` does not stop mic tracks. Stop them
  explicitly before handing the mic back to the wake worker.

Exactly one microphone owner exists at a time. Use the explicit release-then-
acquire handoff between the wake worker and renderer; a failed handoff is local
Maintenance, not cloud OfflineLoop.

## Wake-gated noisy-room profile

- In Dormant, only the local wake worker listens; Realtime is disconnected.
- In Active, the `server-vad-noisy` baseline is `far_field` noise reduction
  plus server VAD threshold `0.7`, prefix padding `300` ms, silence duration
  `900` ms, and automatic response/interruption enabled. Semantic VAD `low` is
  an alternate for premature turn endings, not the default noise filter.
- Configure `gpt-live-transcribe` with `languages: ['zh-tw', 'en']`, keyword
  `恭送渡鴨大人`, and `delay: 'medium'`. Do not add browser-side denoising on
  top of conference-speaker DSP and Realtime `far_field` without field evidence.
- Automated evidence covers the exact SDK config and a live provider session;
  a human judges recognition, false turns, pause handling, and barge-in quality.

## Profile switch and reconnect

- `await session.updateAgent(newAgent)` swaps instructions and tools in-session;
  history is retained. That is exactly why a profile change must first CLOSE
  the old session and confirm in a clean Persona+Master session before
  `updateAgent` loads the new owner (invariant #4).
- There is a **60-minute hard session cap** and no `reconnect()`. Rollover is:
  wait for turn + playback end -> new `ek_` -> new `RealtimeSession` using the
  same caller-owned `MediaStream` -> `connect()` -> rebuild context. Same-owner
  rollover may call `updateHistory(snapshot)`; profile switches never carry
  history.
- Tag every session with a local `sessionGeneration`. Ignore and Console-log
  events from closed generations as stale events.

Extraction writes only to the owner snapshot taken at turn start,
`ownerProfileIdAtTurnStart`; never re-read the current owner at job completion.
Identity, naming, switching, group, sleep, and spell control turns do not enter
personal-memory extraction (`controlIntent !== 'none'` -> skip).

## Privacy flags (production posture)

Set these explicitly:

- Session: `historyStoreAudio: false`, `tracingDisabled: true`, and
  server-side `config.tracing = null`. Decide before connect; the API rejects
  later changes.
- Main environment: `OPENAI_AGENTS_DISABLE_TRACING=1`,
  `OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1`, and
  `OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1` (names verified in
  `@openai/agents-core` config).
- Do not set `DEBUG=openai-agents*` in production.

Every ignore, drop, fallback, or degrade must be visitor-visible or a
metadata-only Console event with a reason. A camera, extractor, or single
adapter failure must not block conversation or unrelated adapters; failures
degrade visibly.

## Memory extractor (Responses API, Phase 6)

- Structured Outputs shape is nested under `text.format`, not
  `response_format`:
  `{ type: 'json_schema', name, schema, strict: true }`. Strict mode means all
  properties are required and `additionalProperties: false`. Use the helper
  `zodTextFormat()` from `openai/helpers/zod`.
- Take the model from config and the `JobModelSnapshot` captured at enqueue.
  Pricing and model selection are not fixed by this reference.
- Snapshot boundary rule (P1-D5/D6, P6-D8): sessions freeze a
  `SessionModelSnapshot` at creation; jobs freeze a `JobModelSnapshot` at
  enqueue. A mid-session Publish never retargets live sessions or in-flight
  jobs. Only the next session or job picks up the new revision.

## Realtime gotchas checklist

- Realtime function tools execute in the renderer. Any privileged action is a
  thin IPC call to Main; tools never carry guest IDs (invariant #3).
- Realtime rejects tool `outputSchema`; structured extraction belongs to the
  Responses extractor, not the Realtime model.
- Prefer nested `audio.input/output` plus `outputModalities` config shape;
  top-level `modalities` and `turnDetection` aliases are deprecated.
- The Phase 1 start contract test must cover WebRTC connect with configured
  model and voice, barge-in stop, transcript-to-item-ID mapping,
  `updateAgent` on a clean session, close/fresh-reconnect, and that no
  audio/tracing content persists locally.
