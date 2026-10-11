# Magic Mirror — clock-out, 2026-10-11

## Runtime

Read-only launchd check at **11:46 Taipei**: Raven running, PID **34755**,
`com.magicmirror.launchagent` run 4; independent root board-ADB running,
PID **4320**. Clock-out leaves both running. This is process-state evidence,
not fresh visual/audio or TV acceptance.

Mac en0 **192.168.77.1/24** → TV **192.168.77.2/24** is the control path.
AnyLauncher 1.13 is the TV HOME/HDMI launcher; the old Mac HDMI watchdog is
retired. Last accepted layout: Virtual 16:9 Main, T749 right, Mac rotation 90°
and Android rotation 2. [TV evidence](docs/testing/tv-hdmi-boot-2026-10-10.md)
and [operator runbook](deploy/macos/README.md).

A person controls TV power. TV absence intentionally stops Raven; auto-resume
is not required. Start with `launchctl kickstart gui/$(id -u)/com.magicmirror.launchagent`
when wanted. LaunchAgent remains the sole restart owner.

## Delivery and evidence

- Runtime remediation: **a5f7118** and preceding media/TV work. The
  [ledger](docs/testing/review-remediation-2026-10-10.md) records lifecycle,
  memory, rendering, Console, local-first YouTube, silent-video BGM and
  15-second dual-absence shutdown checks, including failed provider runs.
- **22e4565** adds the
  [second audit](docs/testing/second-audit-remaining-failures-2026-10-11.md)
  and [owner rulings](DECISIONS.md). It reports remaining defects and five
  reproduced focused-test failures; earlier all-pass summaries do not establish
  current acceptance. Operator config v17 corrects Raven's personality spelling.
- This clock-out compacts AGENTS, Codex worker instructions and skill guidance,
  aligns it with the accepted rulings and archives the old handoff. No runtime
  code, model, operator settings or app restart is part of this change.
  The pre-existing untracked `deploy/macos/owner-check/` is preserved.
- Static checks pass: 10 skill schemas, five TOML files, 139 local links,
  all 12 invariant IDs and whitespace. Python validation lacked PyYAML and the
  initial Node fallback lacked `yaml`; equivalent checks passed with installed
  `js-yaml`. No dependencies or runtime tests were needed.

## Open work

Use the second audit's **§1** for correctness fixes: failing fixtures/assertions,
Maintenance restart loops, mic-loss classification, cue/dialogue queue,
rejection handling, audio interruption and remaining Console/state defects.
Startup while the TV is still booting needs separate grace; preserve normal
15-second absence shutdown after detection.

Conversation routing/playback has passing provider evidence, but preambles,
language consistency and extra spell speech remain imperfect. Shared sound-alike
matching/control-turn exclusion, late reply suppression and the approved prompt
changes are not yet implemented. QA-only full-model A/B is authorized; a
production model switch is not. Use **§8–9** and DECISIONS for the accepted
speech/persona policies; retain failed runs.

Audible-loop wake and representative human wake/spell acceptance remain open.
Published Raven has no spells/scenes; QA's mock fixture is not production setup.
The authorized audible test and quieter Dormant loops are still pending.
[Wake RCA](docs/testing/wake-phrase-rca-2026-10-10.md) remains route-specific.

TV Wi-Fi RCA is closed as unnecessary; Mac Wi-Fi is the acceptance target.
Power-on-at-connect and BetterDisplay update freeze were applied in the second
audit. Screen-lock change still needs owner authentication; **§6 T1–T5**
physical power-cut/cold-boot checks remain unaccepted.

Next implementation session: fix the bounded correctness findings first,
then conversation controls/prompt evaluation, then authorized physical checks.
This clock-out does not advance phase, package/signing or physical acceptance.

[Previous full handoff](docs/archive/progress-before-harness-clockout-2026-10-11.md).
