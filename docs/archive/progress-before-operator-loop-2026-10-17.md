# Magic Mirror — current handoff, 2026-10-17

Latest fix: reflective wake/sleep mist and gradual avatar reveal/retreat now
play with macOS Reduce Motion enabled. Previously the JS playback gate and
CSS suppressed mist/animation, with a selector conflict leaving the avatar
invisible until it abruptly appeared at Awake. Ordinary motion reduction,
saved Raven v18 and the system preference are preserved.

Fresh checks: 46 focused tests, both typechecks, stamped build and `--ritual`
Electron QA pass (13 checks, 13 captures). Reduced-motion and normal-motion
portrait cycles both show moving mist, increasing/decreasing partial opacity,
four-second entrance, 2.4-second exit and exact-black sleep. Captures inspected.
Initial obsolete Console import-check failure is retained; harness now follows
the current Save & apply UI. This is shared-renderer Ren/simulated-lifecycle
evidence, not Raven physical/ASR acceptance.
[Fix and evidence](../../docs/testing/reflective-motion-2026-10-17.md).

Current runtime at 11:09 Taipei: field LaunchAgent unloaded, zero canonical app
processes; OS Reduce Motion remains enabled. The fresh build will load on next
START. Prior work through Stream Deck/TV controls was committed and pushed as
`b5fedaf9` on `field/macmini-deploy`; this motion fix follows that baseline.

## Earlier delivery — Stream Deck and TV controls

Delivered: connected Stream Deck Neo has green START MIRROR and red STOP MIRROR
on the first two top-row keys. Elgato 7.6.0 (23012) installed and verified current;
Neo firmware updated to 1.00.017; Elgato login startup enabled; selected layout
survives app relaunch. Executable scripts and quiet app wrappers use the existing
queued LaunchAgent control. [Setup](../../deploy/macos/stream-deck.md) ·
[implementation and fresh QA](../../docs/testing/stream-deck-controls-2026-10-17.md).

Owner confirmed the physical Neo buttons work. Follow-up delivered: STOP now
puts the reflective TV in standby before app shutdown; START loads the saved
active avatar's application and wakes the TV onto HDMI. Standby is Android
Asleep/display OFF, not shutdown or mains power-off. Mac and wired TV control
remain powered; standby watts and full-shutdown wake are unmeasured/unproven.

Checks: 65 focused tests pass; eight real combined TV/app cases pass, including
duplicate presses, ordered STOP→START, portrait window/HDMI foreground and a
30-second off interval. Initial duplicate-sleep and redundant-ADB-connect failures
are retained; confirmed-state checks and reuse of the working transport resolved
the tested failures. A later brief transport failure prompted a bounded 350 ms
settling delay before reconnect verification/retry; the final eight-case run passed.
Earlier frozen-Main app cleanup remains passing evidence:
forced stop 46.2 s, zero app processes, then successful start/clean stop.
USB reconnect and cold-login acceptance still need owner evidence.

At automated QA completion Magic Mirror is stopped/job unloaded, TV is in
standby, and Elgato is running with the two-key profile selected. START bootstraps
the existing field plist. Production model/TV-presence policy and phase acceptance are unchanged. Preserve
the saved field configuration. Earlier model/camera work remains below.

Final direct check 2026-10-17 10:50:21 Taipei: job unloaded, zero canonical
Electron/native app processes, TV Asleep/OFF
([metadata](../../.artifacts/tv-controls-2026-10-17/final-state.json)).

## Prior delivery — 2026-10-14 clock-out

Start at [unresolved issues](../../docs/testing/open-issues-2026-10-13.md), then today's
[review, fixes, QA and research](../../docs/testing/review-fixes-2026-10-14.md). The
previous handoff is [archived](../../docs/archive/progress-before-review-fixes-2026-10-14.md).

All QA finished at 00:18 Taipei 10-15; no Electron or ordinary Magic Mirror app
is running. Production remains Raven v18,
`gpt-realtime-2.1-mini`/low (the owner intends to keep mini as the default),
cedar, configured transcription/memory models and the installed TV policy.
Nothing is committed; preserve the extensive uncommitted work on
`field/macmini-deploy`. No phase or human acceptance advances.

Delivered today (unit-tested; stamped build current at clock-out):

1. Review fixes: barge-in cue release, pending identity question kept, explicit
   save keeps learning evidence, every authored tool rule rendered, weak alias
   asks, camera spawn failure degrades.
2. Second round: guest memory guard (`memoryLocked`) with memory and correction
   wording; button queue cannot loop; per-response preamble diagnostic and
   `measured_tool_preamble` rate; five camera robustness fixes (stale watchdog,
   helper exits on stdin EOF, Dormant status, USB reset spares an Arducam
   microphone owner, fast capture failure while retiring).
3. Tried and reverted: quick-tool preamble wording in the session prompt and
   "call before speaking" in tool descriptions (no benefit; memory preambles rose).

Checks: both typechecks exit 0; full `npm test` 187 files, 2,162 passed,
1 skipped (before the final prompt-only edits; prompt suites rerun after);
`npm run build` exit 0.

Evidence: character turns mini 37/50 vs full 48/50 before fixes; mini 77/100
pooled after. Mini still speaks before the local search in nearly every run.
Memory application checks pass; first-identity failures track ASR mishearing
the synthetic name. `camera_native` reproduces the 10-13 stall: the Arducam
delivers invalid UVC payloads below the app; software recovery works but cannot
keep it streaming.

Owner ruling 2026-10-14 ([DECISIONS](../../DECISIONS.md)): one short in-character
line is allowed before local search and non-identify memory calls; the session
prompt, probe quick-tool set and judge criteria follow it (unit-tested; stamped
build current). Mini re-measure: character 9, 9, 10 = 28/30, the first full mini
pass; `local_media` 5/6; memory stopped at the first identity on inexact ASR
([ledger](../../docs/testing/review-fixes-2026-10-14.md)). Owner decisions still open: production model switch
(invariant 11); subscription path (invariant 12).

Owner ruling 2026-10-14 (late): online media only after a hidden opening phrase
(default 「在雲上找找」, Console Persona field); the keyword local-only policy is
removed. Unit-tested; full `npm test` exit 0 (2,159 passed, 1 skipped); build
current. Live mini QA: the gate held in all 11 media turns; `local_media` 6/6;
remaining faults are mini wording/tool slips, not source decisions
([index](../../.artifacts/qa-2026-10-14/cloud-phrase/chain-index.txt)).

Next: owner camera hardware discriminators (another cable/port or powered hub,
Photo Booth, second webcam) and the wake 10+10 check per [TODO](../../TODO.md).
