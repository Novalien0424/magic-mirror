# Playback, mic ownership and session lifecycle

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

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
- Current Voice Studio output uses `src/renderer/realtime/processed-audio-output.ts`: the SDK receiver is muted (`volume = 0`), a MediaStreamAudioSource feeds the shared processing graph, and that graph alone connects to AudioContext.destination. Speech/completion analysers, mute, interruption reset and tail completion belong to this output owner; do not re-enable the receiver or add a second audible path.
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
- Read the current versioned per-avatar transcription/language/sleep configuration. Do not hard-code historical model IDs or farewell words. Avoid stacking browser denoising over speaker DSP and provider far-field processing without field evidence.
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
- Reject stale callbacks by the owned `realtimeSessionId`. Generation is diagnostic
  except the positive Main start-bundle generation that commits activation; follow
  the current Main/runtime owner contract.

Extraction writes only to the owner snapshot taken at turn start,
`ownerProfileIdAtTurnStart`; never re-read the current owner at job completion.
Identity, naming, switching, group, sleep, and spell control turns do not enter
personal-memory extraction (`controlIntent !== 'none'` -> skip).
