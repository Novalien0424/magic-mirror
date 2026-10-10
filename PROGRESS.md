# Magic Mirror — Raven wake/spell RCA, 2026-10-10

## Current delivery

The user authorized physical microphone/unmute investigation, real Raven/API
conversation QA, in-scope repairs, deployment, commit and push.
[RCA, primary-source research and reproducible evidence](docs/testing/wake-spell-rca-2026-10-10.md).

Fixed the native Raven QA microphone-permission bypass, added an isolated
one-shot LaunchAgent runner, and added bounded RAM-only physical capture/replay
diagnostics. Spell QA now records request/acknowledgement and exact-match
comparison metadata, and explicitly asserts cue/scene, farewell/close and
release/acquire ordering. A completed farewell emits a bounded metadata event.
Wake, voice, roleplay, QA, invariant and Mac foundation guidance now separates
verified behavior from assumptions and synthetic from physical evidence.

**118 focused Node tests across seven files pass.** Node/web typechecks and the
production build pass. Operator configuration, device preferences, media folders,
production tuning, dependencies and model IDs are unchanged. No transcripts,
conversation recordings, private context or credentials enter retained evidence.
Invariants 1, 7, 8, 9, 10, 11 and 12 were directly examined; no phase acceptance
or packaging/signing claim is added.

## Current findings and limits

- Jabra input/output unmute writes succeeded and read back unmuted. Native
  input is delivered. Raven's dormant ambience explains an open output stream;
  Apple Music was open but not streaming during the process check.
- Physical synthesized wake still fails. Clean source matches 12/12 tokens;
  identical captured PCM fails live and on replay. Fresh detector state,
  rechunking, gain, speaker-tail hold and offline keyword-bias changes did not
  recover it. Measured delivery is about 16 kHz with zero reported drops.
  The remaining boundary is captured waveform plus detector robustness, not a
  proven TCC, Jabra DSP, resampler or threshold defect. Human speech/placement
  acceptance is unavailable while the operator is away.
- Fresh real-provider runs recognize the exact fixture spell and trigger one
  scene; quoted/extended phrases trigger none. The final run also passes explicit
  cue/scene, farewell/close and mic release/acquire ordering. Published Raven has **no
  configured spells/scenes**; the isolated mock fixture is not production setup.
- Command dialogue quality remains imperfect. The final unchanged-prompt run
  passes 6/8 turns; extended spell and directed sleep fail quality. The earlier
  baseline passed 5/8; a shorter contextual prompt passed 3/8 and was reverted. Automatic dialogue
  can start before final ASR reaches the exact spell check. Generated output
  counts do not establish final physical audibility.
- Earlier media QA passed own/shared folder playback, local-first YouTube
  fallback, explicit YouTube, default once/return and loop/Dormant handoff.
  The remaining pre-playback preamble and memory-recall quality failures remain
  recorded in the [conversation report](docs/testing/raven-conversation-qa-2026-10-09.md).

## Runtime and next action

The RCA build is deployed through the existing `com.magicmirror.launchagent`,
PID **63129**. Main and both renderers are Ready; Raven is Dormant, the media index
is ready and the wake worker is listening. The stamped build matches current
source/output. All five operator settings hashes match the pre-investigation
baseline. [Deployment metadata](.artifacts/wake-spell-rca-2026-10-10/deployment.json)
and [startup events](.artifacts/wake-spell-rca-2026-10-10/runtime-start-events.json).
The existing LaunchAgent remains the sole restart owner. No synthetic spell or
diagnostic tuning is published.

Next: obtain a representative human wake trial on the current Jabra route;
configure the intended spells/approved scenes; evaluate a compact command cue
handoff against processed output ownership without regex speech filters or
delaying ordinary dialogue. The previously offered larger-model comparison has
not been answered or performed. Physical wake and full conversation-quality
acceptance remain open. Failed evidence is retained.

[Previous delivery/runtime snapshot](docs/archive/progress-before-wake-spell-rca-2026-10-10.md).
