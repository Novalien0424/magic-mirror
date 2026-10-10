# Magic Mirror — review remediation, 2026-10-11

## Latest delivery and runtime

[Finding ledger and current evidence](docs/testing/review-remediation-2026-10-10.md)
cover every ID in the requested performance/correctness/UI review: PE-01–15,
CO-01–13, CX-01–14, MX-01–12 and its MM-01–07 references. MX-01 is intentional
black Dormant; other findings have scoped implementations and focused checks.
The separate whole-project review is not claimed complete.

Main lifecycle recovery now closes old session authority, waits for microphone
release and bounds recovery; hidden rendering/Console/embedding work is reduced.
Memory preserves local calendar dates, recovers workers without replaying failed
writes, and proposes unique script-variant names before verbal confirmation.
Console errors identify/focus fields, editing no longer rerenders at meter rate,
Stop All stays reachable, and Chinese Mirror failures remain visible. The
authorized exact spell starts its scene without waiting for the optional cue.
Operator sleep spelling was corrected through Console publish. Retired privileged
HDMI watchdog files are inert; independent ADB and AnyLauncher stay in place.

284 Main checks, 211 memory checks and additional renderer/Console integration
checks pass; both typechecks and production build pass. Real Raven evidence
includes renderer crash/recovery, hidden FPS 0/resume and 18 media/BGM checks.
The final calendar retry passes all four cases; a prior invalid proposal was
rejected and remains recorded. Normal Raven and isolated QA never overlap.

**Open acceptance:** final live media routing/playback/once-return passes in
English and Chinese, but preambles and some wrong-language replies still fail
quality. Negated sleep stays Active after the prompt fix. Exact spell passed
the focused retry after an earlier ASR mismatch, but extra non-cue speech still
fails quality. No fuzzy authorization, intent regex or model substitution was
added. Physical wake under audible looping media, TV/Mac cold boot, camera power
savings and live Wi-Fi RCA remain unqualified. The TV is currently absent from
both HDMI and wired control. Final deployment metadata is in the ledger.

Final deployment through the existing LaunchAgent exited **0** after **15.042 s**
of dual absence. No app workers remain, the five settings files are unchanged,
and independent ADB remains running. Raven is currently stopped; start it after
the TV returns. This is checkout deployment, not new package/cold-boot acceptance.

[Earlier media/BGM/TV-loss delivery](docs/testing/media-fallback-bgm-tv-shutdown-2026-10-10.md)
and the historical field observations below remain available. New human speech
and physical TV acceptance are not inferred from synthetic/provider checks.

## Current TV work

**Latest:** [TV boot-to-HDMI investigation and resume steps](docs/testing/tv-hdmi-boot-2026-10-10.md).
Direct Ethernet restored ADB. Persistent addresses are **Mac en0 192.168.77.1/24**
and **TV eth0 192.168.77.2/24**. Mac Internet remains on Wi-Fi; no Internet
sharing is configured or required. Temporary bootpd has stopped. **AnyLauncher
1.13 is installed and is default HOME**, forwarding to HDMI-IN; Quickstep is
configured as backup. An agent-requested TV reboot increased boot count 49→50,
preserved the address/HOME selection, and opened HDMI without Mac intervention.
The old HDMI watchdog is unloaded and **persistently disabled**.

That reboot exposed a separate HDMI identity failure: macOS saw an unnamed
1280×720 display instead of T749. Applying the TV's unchanged, checksum-valid
EDID through BetterDisplay recovered T749 and its portrait layout. Automatic
application to this connection's fallback display is enabled; a second reboot
passed (boot count 50→51), retaining T749, HDMI and rotation. Layout is saved permanently: Virtual 16:9 Main,
T749 to its right. **Mac rotation 90° + Android user_rotation=2 (180°) is
physically confirmed upright.** Mac and Android screen captures were inspected.

Wi-Fi RCA remains open. Three saved networks permit autojoin, but the latest
scan record reports its connectivity manager disabled. Ethernet arbitration
versus abnormal suppression is unresolved; link-statistics errors are not proof
of packet failure. Wired ADB is the operational control path.
Installed the standalone root **board-adb** daemon, listening only on
127.0.0.1:5038. Wired standby/wake passed with it: Asleep/OFF remained reachable,
then explicit wake returned Awake/ON and HDMI, without a TV reboot. Source and
installed plist/binary hashes match; syntax/plist checks pass. An earlier stale
host transport and rejected ADB listen syntax are retained in the report.
**User power-on check passed at 21:50:** boot count 51→52, Awake/ON,
AnyLauncher still HOME, HDMI-IN foreground without an assistant launch call,
static wired address and both rotations preserved. Raven's existing PID 4658
automatically rehomed its window to T749; a screenshot shows reflective Dormant.
The user reported powering on the TV; mains removal was not separately
established. Mac cold boot remains untested.

Historical, now-disabled Mac watchdog fix: require an awake
board, successful activity query and confirmed stock launcher before starting
HDMI; check Android launch status before logging success. **11 fake-ADB cases
pass**, plus zsh syntax and whitespace checks. Deployed via the existing root
LaunchDaemon; source/installed SHA256 matches
`68b6f000670262215e236c3930a3bd157f6c47f01640a9975f74ab3289912383`.
These are simulated watchdog checks; it has been replaced by TV-side
AnyLauncher and a standalone ADB server. [Operator runbook](deploy/macos/README.md).
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
- Fresh real-Raven QA at 21:34/21:37 passed local-first fallback, once completion,
  relevant follow-up and three of four empathy/context quality turns. Both runs
  exited 2: playback had `tool_preamble`/`wrong_language`; the date-correction
  turn had `wrong_language`. No provider errors. Avatar-only screenshot is
  upright. These are synthetic PCM/real WebRTC ASR runs, not human acoustic
  acceptance. [Run links and limits](docs/testing/tv-hdmi-boot-2026-10-10.md#clean-app-shutdown-and-current-conversation-evidence).

## Earlier TV runtime and remaining physical acceptance

**Historical runtime before the media work.** At 21:43:58 the sole
app LaunchAgent started PID **4658** (fifth launch); both renderers are Ready,
T749 is selected/full-screen, and wake input reports listening at 21:43:59.
A fresh native screenshot confirms the expected black portrait Dormant screen.
ADB daemon PID 4320 remains running; Virtual is Main and T749 is extended right.
Normal Raven was cleanly stopped during both isolated QA runs; they did not
overlap. The subsequent user power-on check passed as recorded above.

At 21:23, `com.magicmirror.launchagent` had started PID **2967**, fourth launch,
with both renderers Ready on T749. It reached Dormant, detected the user's wake
at 21:23:41, and reached Active at 21:23:46. The operator confirmed Raven appears
and, after the TV rotation correction, is upright. Reflective Dormant normally
hides the avatar against black. A separate held-stop check proved clean exit 0,
no remaining app/worker processes, and removal of Jabra audio assertions; the
operator confirmed BGM stopped. An immediate restart resumes Dormant ambience.
The operator reports unrelated YouTube speech. Metadata records a media lookup,
but retained logs contain no conversation text; attribution remains open.
At 21:32:11, the user's subsequent looping-media test detected wake, stopped
media and handed off the microphone; Active followed at 21:32:15. The assistant's
TV reboot/HDMI operations interrupted the live loop picture, so those blackouts
are not classified as media-player faults. The user subsequently approved
further testing. Standby/wake and isolated QA results are recorded above.

The earlier wake deployment reached Ready/Dormant at PID 71712; that is
historical evidence. All five operator settings hashes matched the
pre-investigation baseline then.
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
