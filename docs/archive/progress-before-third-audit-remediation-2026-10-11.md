# Magic Mirror — current delivery, 2026-10-11

## Runtime

Normal Raven was restored through the existing LaunchAgent at **15:31 Taipei**,
PID **70615**, run **6**. Fresh Console readback confirms Dormant, published
**v17**, **0 changed areas**, and live Jabra microphone blocks (856 blocks;
last block 246 ms old). Input and output remain System default — Jabra Speak2
75; BGM/voice/effects remain 20/100/100%. The Console is hidden again. The
independent root board-ADB remains PID **4320**. T749 is present over HDMI.
[Restoration metadata](../../.artifacts/second-audit-remediation-2026-10-11/final-restoration.json).

Normal Raven is currently stopped cleanly for the third-audit remediation.
The application now resets the selected USB camera automatically. A real-device
QA run passed baseline capture and an injected stall followed by a real targeted
USB re-enumeration: six fresh snapshots total, with recovery in about five
seconds. Manual USB unplug/replug is not required. See the camera section of
the [remediation ledger](../../docs/testing/second-audit-remediation-2026-10-11.md).

Mac en0 **192.168.77.1/24** → TV **192.168.77.2/24** remains the control path.
AnyLauncher 1.13 is the TV HOME/HDMI launcher; the old Mac HDMI watchdog is
retired. Last accepted layout: Virtual 16:9 Main, T749 right, Mac rotation 90°
and Android rotation 2. [TV evidence](../../docs/testing/tv-hdmi-boot-2026-10-10.md)
and [operator runbook](../../deploy/macos/README.md).

TV absence intentionally stops Raven. Startup allows three minutes for first
detection, then uses the normal 15-second dual-absence shutdown. A person
controls TV power. Start with
`launchctl kickstart gui/$(id -u)/com.magicmirror.launchagent` when wanted;
LaunchAgent remains the sole restart owner.

## Delivery and evidence

The [second-audit remediation ledger](../../docs/testing/second-audit-remediation-2026-10-11.md)
maps the [audit](../../docs/testing/second-audit-remaining-failures-2026-10-11.md)
to the uncommitted changes, checks and retained failures. Bounded fixes cover
startup/Maintenance, mic degradation, speech queue/cancellation, whole-utterance
sound-alike controls, control-memory exclusion, Console state, audio interruption,
provider reason codes, prompt/language guidance and 12 dB Dormant attenuation.
Production model IDs, Raven's operator persona and v17 settings are unchanged.

- Latest full `npm test`: **1,916 passed, 1 skipped**, 176 passing files,
  exit 0 after the camera recovery changes. Includes sequential Electron smoke and Phase 0 regression
  fixtures. The opt-in native replay skipped by default separately passes
  **1/1** with `MIRROR_WAKE_NATIVE_REPLAY=1`. Both TypeScript projects and
  build pass; final source/output stamp verification passes.
- Full Console: **38 checks passed**; media/BGM integration: **18 passed**;
  earlier focused UI review: **14 passed**. All final captures were reviewed.
  Legacy Console driver/fixture failures were repaired and retained.
- Live mini-model spell guard: **8/8 runtime and 8/8 quality turns passed**.
  Extended/exact spell cases each have one application cue and no extra
  provider audio starts. Final whole transcripts retain effect authority;
  partial-prefix data stays in RAM. Later in-flight memory/camera race checks
  also pass and are included in the final full suite.
- Restored memory wording: both mini/full trials pass **10/10 runtime** cases,
  including Main's pre-confirmation lock, but quality passes only **7/10** and
  **6/10**. Preambles and recall/grounding remain unreliable. A semantic
  consent-boundary flag is not proof of private-memory release.
- Local-only media: three runtime routes pass without YouTube fallthrough;
  mini quality is **0/3**, with preamble/language/ASR/grounding findings.
- Controlled quiet Mac-speaker playback into Jabra capture detects music
  **10/10**, speech **9/10**, and **0/20** negative false wakes. Its uninterrupted
  **30-minute soak passes with zero false wakes** and fresh minute samples.
  Production Jabra playback still detects **0/10** in every audible music/speech
  cell, including −12 dB and −20 dB trials. Routing remains unchanged.

Metadata-only results, failures, logs and build provenance are retained under
[the evidence directory](../../.artifacts/second-audit-remediation-2026-10-11/).
Completed marked QA scratch state/images were removed after review and
byte-checked metadata archival. The ledger preserves earlier failed/invalid
runs, observer repairs and the first accidental smoke overlap. Later full tests,
normal Electron and isolated QA ran sequentially. No phase acceptance advances.

Prior delivery: **a5f7118** runtime remediation and **22e4565** second audit.
[Earlier ledger](../../docs/testing/review-remediation-2026-10-10.md),
[owner rulings](../../DECISIONS.md). Pre-existing `CLAUDE.md`, audit-document,
`.claude/settings.json` and `deploy/macos/owner-check/` edits are preserved.

## Remaining work

Jabra wake during audible media, reliable model language/
preambles/recall, human wake/spell trials and **T1–T5** physical power-cut/cold-boot
checks remain open. Published Raven has no production spells/scenes; physical
effect acceptance needs owner-authored presets. The controlled alternative
speaker test is not actual local-video/YouTube or human acceptance. TV Wi-Fi is
closed as unnecessary; Mac Wi-Fi is the acceptance target. Screen-lock change
still requires owner authentication. [Wake RCA](../../docs/testing/wake-phrase-rca-2026-10-10.md).

Current work: systematically implement and verify the
[third audit](../../docs/testing/third-audit-prompts-skills-persistence-2026-10-11.md),
tracked in its [remediation ledger](../../docs/testing/third-audit-remediation-2026-10-11.md).
Choose the production speaker/AEC direction from the recorded
acoustic evidence, then test actual media and representative human speech.
The full-model comparison provides no basis for production model/persona
promotion. Merged media tools, `wait_for_user` and AEC remain experiments.
No packaged/signing, phase or physical acceptance is claimed.

[Previous handoff](../../docs/archive/progress-before-second-audit-remediation-2026-10-11.md);
[older full handoff](../../docs/archive/progress-before-harness-clockout-2026-10-11.md).
