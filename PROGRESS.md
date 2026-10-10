# Magic Mirror — TV HDMI investigation and Raven status, 2026-10-10

## Current TV work

**Latest:** [TV boot-to-HDMI investigation and resume steps](docs/testing/tv-hdmi-boot-2026-10-10.md).
Access returned at 19:32; vendor APK inspection confirmed native boot-app hooks.
The user chose **AnyLauncher** to replace Quickstep as HOME. Official v1.13 is
downloaded and inspected, but **not installed**: ADB dropped again before
transfer. No TV boot properties/HOME selection were changed. The Mac watchdog
is **paused/unloaded since 19:56** for the user's reboot/network capture; Raven
remains stopped. Boot history proves a 19:34 requested reboot, while the later
19:42 connection loss remains unexplained. At 20:00, the TV address sent ARP/mDNS
traffic but did not answer unicast TCP/ICMP. The operator reports that Wi-Fi
reconnection and a normal reboot did not restore access, and is testing the
Connect to the computer toggle. A 15-minute reconnect/log-capture watcher
started at 19:59; ADB had not returned by 20:07. Vendor network/reboot code
candidates are documented but not yet tied
to the incident. Do not equate failed probes with TV power-off.
Next: restore stable access, install/configure AnyLauncher with Quickstep escape,
and test independent reboot/standby with the Mac watchdog unloaded.

Fixed the Mac watchdog's unsafe blank-foreground recovery: require an awake
board, successful activity query and confirmed stock launcher before starting
HDMI; check Android launch status before logging success. **11 fake-ADB cases
pass**, plus zsh syntax and whitespace checks. Deployed via the existing root
LaunchDaemon; source/installed SHA256 matches
`68b6f000670262215e236c3930a3bd157f6c47f01640a9975f74ab3289912383`.
These are simulated control checks and installation evidence, not proof of
physical TV standby/resume. [Operator details and test](deploy/macos/README.md).
No Electron changes or credential access; invariants 9 and 10 apply.

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

**Raven is stopped at the user's request.** At the current TV investigation,
`com.magicmirror.launchagent` is unloaded and no Raven Electron process is
running. Its plist remains installed; a future login can load it. Do not launch
Raven for TV work. The earlier wake deployment reached Ready/Dormant at PID
71712; that is historical evidence, not the current runtime. All five operator
settings hashes matched the pre-investigation baseline then.
[Deployment metadata](.artifacts/wake-capture-2026-10-10/deployment.json)
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
