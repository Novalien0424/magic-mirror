# Magic Mirror — current handoff, 2026-10-24

Latest work is an **audit**, not a repair: the owner's field visit was stuck in
name confirmation. Production remains `f3957b0` on `field/macmini-deploy`; the
previous media/picture delivery is preserved. [Previous handoff](docs/archive/progress-before-studio-audit-2026-10-24.md).

## Findings and next action

The 10:35–10:38 Taipei field log shows seven transcription events, three accepted
name submissions, five rejected story-answer calls while confirmation remained
pending, three repeats and **no accepted name confirmation**. Camera trouble
caused two earlier mic recoveries; later speech did reach the session.

Two fault probes confirmed recovery defects: repeat accepts no fresh visitor
input, and a failed opening can leave no listening step/silence deadline while
rejecting later names. Operator UI has no way to rescue that name step without
abandoning the visit. Tool exposure/rejection recovery, fresh-turn guarding,
failed-cue recovery and metadata-only diagnostics are the next bounded repair.
Do not clear the field issue because one synthetic visit passed.

[Full visitor/operator journey audit and repair criteria](docs/testing/studio-journey-audit-2026-10-24.md) ·
[Provider metadata](docs/testing/studio-journey-audit-provider-2026-10-24.json) ·
[Operator metadata](docs/testing/studio-journey-audit-operator-2026-10-24.json) ·
[Retained failure/probe evidence](docs/testing/studio-journey-audit-failures-2026-10-24.txt).

## Fresh evidence

- Real provider `soul` journey: **26/26, exit 0**, one attempt. Name denial,
  correction, confirmation, all four answers/comments, generation, visible silver
  wing revision, transfer/printer no-op, verbatim farewell, Dormant, fresh restart
  and visitor-requested entry. Synthetic microphone/camera; not human acceptance.
- Rendered operator journey: **23/23, exit 0**; Save/Publish/reload, name list,
  question limits/order, prompts/picture controls, mode switching and narrow UI.
  This runner does not execute a visitor conversation. Three UI screenshots and
  both real generated-picture screenshots inspected.
- Focused tests: **219 passed, one failed**. Failure is an old image-prompt text
  assertion; current guard exists. Two temporary fault probes confirmed defects
  and were removed. No source fix, typecheck/build rerun or deployment claimed.
- Existing build verifies: source `afade18e8be63055`, output `b53cc6350748189d`,
  built 2026-10-23 22:11:20 Taipei. Full hashes/commands are in the audit.

## Runtime and cleanup

Normal Electron remains **stopped**, preserving the owner's 10:38:15 STOP state.
Native black-HDMI cover process is active. Jabra output **70.08%** read back after
both sequential QA runs; QA used 0.97% by device identity, with EXIT-trap resets.
No mute/input-gain edits. Production tailnet Console is unavailable while the app
is stopped; no second-computer test was performed.

Production active/draft settings unchanged, including modern multicolour vector
style, the four questions, and the unrelated saved draft:
active `336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`,
draft `d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`.
No test configuration was published to production. Both exact owned QA roots were
reviewed and deleted with the artifact tool: **178 files, 40,178,787 bytes**,
excluding retained markers. Four task scratch/helper files and the temporary
fault-probe test were removed. Owner deliverables and synced media untouched.

Unrelated unresolved camera, human voice, physical hardware and second-computer
acceptance remain in [TODO](TODO.md). [DECISIONS](DECISIONS.md) owns rulings.
