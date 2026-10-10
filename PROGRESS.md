# Magic Mirror — Raven wake decoder fix, 2026-10-10

## Current delivery

The user authorized physical microphone/unmute investigation, real Raven/API
conversation QA, in-scope repairs, deployment, commit and push.
[Current wake RCA, fixes and evidence](docs/testing/wake-phrase-rca-2026-10-10.md).
[Earlier wake/spell investigation](docs/testing/wake-spell-rca-2026-10-10.md).

Fixed a reproduced Mac wake miss by widening decoder search from four to 32
paths. Paired identical PCM isolates search width; eight and 16 still missed
some voices. Model, keyword, threshold and bias remain unchanged. Added native
format/independent-converter, stock-engine, voice/rate and negative controls.
Fixed diagnostic startup/EOF accounting, explicit speaker routing, and stale
Realtime observer counters across local close/reconnect. Removed an experimental
retry that could reacquire wake input during Active; acoustic tests now require
Dormant. Updated wake and QA guidance against evidence and the WebRTC contract.

**59 focused Node tests across eight files pass**, plus the separate keyword
compiler checks. Node typecheck and the production build pass; unchanged renderer
code retains the earlier web-typecheck evidence. Operator configuration, device
preferences, media folders, threshold/bias, dependencies and model IDs are unchanged. No transcripts,
conversation recordings, private context or credentials enter retained evidence.
Invariants 1, 7, 8, 9, 10, 11 and 12 were directly examined; no phase acceptance
or packaging/signing claim is added.

## Current findings and limits

- Jabra input/output unmute writes succeeded and read back unmuted. Native
  input is delivered. Raven's dormant ambience explains an open output stream;
  Apple Music was open but not streaming during the process check.
- Final quiet physical QA recognizes **5/5 Raven positives** (four voice/rate
  combinations live, one native-rate capture/replay) and both default-keyword
  controls. Three negative controls trigger none. Peak live processing is
  18.7 ms/100 ms block, with zero reported overruns/backpressure. A valid keyword
  encoding and independent Apple conversion rule out those suspected causes
  for the reproduced decoder-width miss.
- **Wake during audible looping media still fails.** In the final real-Raven run,
  muted-media wake detects once, stops media, releases wake input, activates
  Realtime and resumes spoken conversation. The post-wake reply passes quality;
  the loop request still has a tool preamble, so overall QA exits 2. Earlier
  misses and ambiguous media selections remain recorded. Native wake has no
  playback-reference AEC; the library supports it, but the reference path is
  not implemented or qualified. Human speech/placement acceptance remains open.
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

The fix is deployed through the existing `com.magicmirror.launchagent`,
PID **71712**. Main and both renderers are Ready; Raven is Dormant, the media index
is ready and the wake worker is listening. The stamped build matches current
source/output. All five operator settings hashes match the pre-investigation
baseline. [Deployment metadata](.artifacts/wake-capture-2026-10-10/deployment.json)
and [startup events](.artifacts/wake-capture-2026-10-10/runtime-start-events.json).
The existing LaunchAgent remains the sole restart owner. No synthetic spell or
experimental keyword bias/threshold is published.

Next: qualify playback-reference AEC on audible loop wake, including actual local
and YouTube output and unchanged single-owner handoff; obtain representative
human wake trials on the Jabra route; configure the intended spells/approved
scenes; evaluate a compact command cue
handoff against processed output ownership without regex speech filters or
delaying ordinary dialogue. The previously offered larger-model comparison has
not been answered or performed. Physical wake and full conversation-quality
acceptance remain open. Failed evidence is retained.

[Previous delivery/runtime snapshot](docs/archive/progress-before-wake-spell-rca-2026-10-10.md).
