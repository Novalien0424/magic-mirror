# Pinned SDK session and transcription contracts

Installed SDK and application builders own wire behavior; current official docs
describe supported provider fields. A configured object is distinct from a
server-acknowledged configuration and measured recognition quality.

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
        transcription: cfg.transcription, // model, languages, keywords, delay from the current builder
        turnDetection: cfg.turnDetection,
      },
      output: { voice: cfg.voice },
    },
    reasoning: { effort: cfg.reasoningEffort },
    tracing: null,
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

Use the existing Main-only credential path under [AGENTS invariant 12](../../../../AGENTS.md);
the renderer receives only the short-lived Realtime credential. RCA does not
inspect keys or retain them in evidence.

## Transcripts

- A completed transcript arrives on raw event
  `conversation.item.input_audio_transcription.completed` with `item_id` and
  `transcript`; the SDK surfaces it via `history_updated` and `history_added`.
- [Current adapter](../../../../src/renderer/realtime/realtime-session-adapter.ts)
  takes the transcription model from the session snapshot and languages/delay
  from the versioned prompt catalog. It supplies selected wake/sleep/enabled spell
  phrases as `keywords`; it currently supplies no transcription `prompt`.
- In installed SDK 0.16.1, `OpenAIRealtimeBase._getMergedSessionConfig` forwards
  the nested transcription object without stripping those fields. This proves
  serialization, not server acknowledgement or that a hint was recognized.
- Transcription is separate from the dialogue model's audio understanding.
  Dialogue can begin before the final transcript lands. Match completed events
  by `item_id`; cross-turn completion order is not guaranteed. Missing text
  disables transcript-driven controls and extraction for that turn with a
  metadata reason, without holding ordinary conversation hostage.

For a scoped recognition experiment, use a short transcription-only `prompt`
describing the recording context, such as “Taiwan Mandarin fantasy dialogue
using Traditional Chinese spell names.” Keep literal enabled-phrase `keywords`
and expected `languages` separate. These are candidate context improvements,
not a proven repair or instructions to force a spell into the transcript. Do
not change dialogue restrictions, exact matching, model IDs or tuning merely
because ASR differed. Validate synthesis voice/locale and RAM-only PCM
duration/level/clipping when synthetic input is involved.

[Official Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
supports recording context, literal keyword hints, expected languages and delay;
keywords do not mandate output. Model-specific fields must follow the configured
model's contract rather than a copied example. Compare request/acknowledgement
flags, exact-match outcome and event timing separately; keep raw text/audio in RAM.

Final transcripts, conversation audio and injected private context remain
RAM-only, including during debugging. Selected facts and validated distilled
summaries may persist only through Main's scoped memory policy under current
invariant 1. RCA evidence contains comparison categories/counts/timing, never
raw conversations, private memory values or credentials.

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

Use bounded metadata reasons for unavailable transcripts and SDK failures;
[AGENTS](../../../../AGENTS.md) owns privacy and visible-degradation policy.

## Realtime gotchas checklist

- Realtime function tools execute in the renderer. Any privileged action is a
  thin IPC call to Main; tools never carry guest IDs (invariant #3).
- Realtime rejects tool `outputSchema`; structured extraction belongs to the
  Responses extractor, not the Realtime model.
- Prefer nested `audio.input/output` plus `outputModalities` config shape;
  top-level `modalities` and `turnDetection` aliases are deprecated.
- Choose focused checks for the changed contract: configured model/voice,
  interruption, item-ID mapping, fresh session/history ownership or privacy.
