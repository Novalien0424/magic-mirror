# Pinned SDK session and transcription contracts

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Packages and session creation

- `@openai/agents` **0.16.1** and `@openai/agents-realtime` **0.16.1**;
  realtime imports use the official subpath `@openai/agents/realtime`.
  The package graph uses `@openai/agents-core` and `@openai/agents-openai`.
  `openai ^7.2.0` is an umbrella-package dependency, not an
  `agents-realtime` peer or an exact Phase 1 direct pin; the operator-generated
  `package-lock.json` owns the concrete compatible resolution. Peer: **Zod v4**.

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
- Transcription model and language configuration come from the versioned config and pinned SDK contract.
- **Transcripts lag or go missing by design.** The model can answer before the
  transcript lands. The voice hot path never waits on transcripts. Missing
  transcript means no spell, no identity confirmation, and no memory; log
  `transcript_unavailable` as metadata only.

Final transcripts, conversation audio, extracted memory values, and injected
private context remain RAM-only. Do not write them to disk, a database,
backups, telemetry, or debug logs, even temporarily for debugging.

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
