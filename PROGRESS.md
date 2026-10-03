# Magic Mirror — Raven deployment on the final Mac, 2026-10-04

## Clock-out for operator reboot — 2026-10-04

Implementation checkpoint: `be7272f` on `field/macmini-deploy`. The operator
requested commit/push and is rebooting the Mac to address the permission/camera
problems. No reboot was initiated by the agent. Last clock-out observation:
LaunchAgent running, Main PID 34513; leave it in place for the operator's reboot.

After reboot: verify the single LaunchAgent started Raven on HDMI; check Jabra
input/output and microphone permission, then camera frame delivery and Computer
Use permissions. If the camera still returns no frames, physical USB replug may
still be necessary. Continue live voice diagnosis only after checking the changed
permission/hardware state. Never treat the pending reboot as a passed test.

## Resume here

This Mac is the user-confirmed FINAL Raven deployment target. Incoming runtime
and local HDMI policy are integrated; the 15 conflict resolutions have been
reviewed and validated. Check the field branch's local deployment checkpoint
commit for the resolved merge. Dependencies and Electron 44
are installed. The operator supplied `.env.rtf`; it was converted locally to
plain root `.env`, with both files owner-only and ignored. Never inspect either
value. Main-only `.env` loading now avoids inherited environment fallback or
process-environment mutation. A real broker issued an ephemeral key and confirmed
the configured models available; active voice has not yet passed.

Raven v11 is imported (17 files, model ID
`model-290002c3-7e18-466c-b547-d98a67e054eb`) and selected as `raven-field` in
published config v8. Prior default profile/config is preserved. The Mac wake
package `sherpa-magic-mirror-mac-v1` is installed with verified upstream neural
and token hashes, bundled-lexicon keywords and unchanged tuning/model version.
Spoken accuracy is not yet verified.

The user LaunchAgent is installed at
`~/Library/LaunchAgents/com.magicmirror.launchagent.plist`, with the sole app
restart policy `KeepAlive={SuccessfulExit=false}`. Actual Mac startup reports both
renderers ready and the Mirror on `T749-fHD720` with simple fullscreen and
screen-saver level. Crash recovery passed: verified Main PID 33024 was killed,
launchd started PID 33087, and the HDMI Mirror returned ready. All 17 installed
Raven files match the source bundle. After the microphone repair/build the field
app is **running**, PID 34513, with `cubism_avatar_ready`; native microphone
permission is pending. No other app restart owner exists.

Nearest-person gaze uses largest face area with a 600 ms switching hold and
smoothed, bounded gaze. Apple Vision capture is RAM-only and identifies no
visitors. Camera worker and active Realtime microphone hotplug recovery are
implemented. Wake retries a missing microphone and cancels retries on release.

Current blockers: Arducam enumerates and camera permission is authorized, but
the real 12-second probe produced zero frames. macOS reported
`kIOReturnNotResponding` (`0xe00002ed`) while starting the stream. Explicit supported
640×480 NV12 capture also produced zero frames after rebuild. The operator says
nobody can reach it physically; USB replug remains required. Do not repeat this
probe until hardware state changes.
Computer Use window access is blocked by macOS permissions; the operator is
remote and reports its Allow control disabled. Helper signature verifies as
OpenAI and this Mac is not MDM-enrolled. Remote-input restrictions are a possible
cause, not a verified diagnosis. No TCC security controls were bypassed.

Mac microphone status was `not-determined`. Main now requests permission before
native wake capture, exposes denial/unavailable/pending reasons and prevents
late startup after shutdown. The real app currently reports
`wake_microphone_permission_required`; operator approval was requested.
Isolated cloud smoke plus its one diagnostic retry returned `active_timeout`
after 60 seconds, with valid provenance, model availability, and zero orphans.
No connect-start metadata followed key issuance. Do not claim live conversation
or Jabra audio from these results; investigate further after permission changes.

Codex's `local_thread_store_compression` under-development flag was disabled in
the user config. TOML parses and fresh workers no longer show that warning.
No evidence establishes it as the previous crash cause. Other warnings await
the operator's exact text, if any.

Next: approve the pending microphone request, verify native Jabra input and live
voice, then perform visual/spoken QA and physical camera/HDMI/Jabra unplug/replug
and reboot checks when accessible. Nearest-person gaze is implemented and
unit-tested. Named-person recognition/enrollment is not enabled: the incoming
configuration still uses mock face-model IDs and there is no live identity
backend. Camera gaze does not provide that feature. Live gaze, spoken wake
accuracy, clean quit and real reboot remain unverified. This is a checkout
deployment through local Electron, not signed packaged deployment evidence.

## Current worker routing — 2026-10-03

Exact model `gpt-6.1-sol`, effort `max`, profile `nova-auto`, fresh `--ephemeral`
workers; native `--cd /Users/novalien0424/magic-mirror` is authorized. This
supersedes historical Luna routes. Runtime model IDs remain unchanged;
fresh Sol tester evidence is linked below. See [AGENTS](AGENTS.md) and
[DECISIONS](DECISIONS.md) for the exact dispatch contract.

## Current workspace and verification boundary

- Canonical Mac workspace: `/Users/novalien0424/magic-mirror`; recovered
  origin/main integration on the field branch. Preserve operator data and local edits.
- [Tracking build/checks](.artifacts/mac-deployment/tracking-green.md): typecheck,
  build and 104 focused tests passed. [Recovery checks](.artifacts/mac-deployment/recovery-green.md):
  80 tests/build passed; test fixture type error subsequently fixed.
- [Fresh types/camera tests](.artifacts/mac-deployment/recovery-types.md):
  typecheck exit 0; 12 tests passed. [Wake/audio recovery](.artifacts/mac-deployment/wake-hotplug-green.md):
  typecheck exit 0; 71 tests passed. Red evidence retained beside each report.
- [Final build and credential checks](.artifacts/mac-deployment/final-checks.md):
  typecheck/build exit 0; 20 tests passed. Swift inputPriority and smoke temp-path
  provenance problems are fixed; historical failed evidence is retained.
- [Actual crash recovery and cloud check](.artifacts/mac-deployment/deployment-runtime.md):
  crash/HDMI recovery and 17 managed-file hashes passed; cloud active timeout.
  [Voice diagnostic retry](.artifacts/mac-deployment/voice-diagnostics.md): key
  issued, model available, active timeout, microphone not-determined.
- [Microphone permission checks](.artifacts/mac-deployment/microphone-permission-green.md):
  typecheck/build and 20 focused tests passed; real OS approval is pending.
- The old display test now correctly expects a configured-but-absent target to
  remain hidden. QA temp fixtures use canonical macOS paths. Windows historical
  evidence below is not Mac runtime acceptance. No phase promotion is claimed.

## Historical evidence

[Earlier Windows delivery and Mac field observations](docs/archive/progress-before-mac-reboot-2026-10-04.md)
are archived with their evidence links. They do not establish current Mac acceptance.
