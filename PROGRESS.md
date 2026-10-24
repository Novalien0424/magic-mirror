# Magic Mirror — current handoff, 2026-10-24

Delivered the **Chinese/English guest-name matching repair** on
`field/macmini-deploy`. The canonical `out/` is built and ready for the next START;
normal Electron remains stopped, preserving the owner's STOP state.
[Previous audit handoff](docs/archive/progress-before-name-repair-2026-10-24.md).

## Delivery

- English dictionary phonetics, bounded Chinese/English near-sounds, distinct
  candidate deduplication and exact-spelling priority. All seven English pairs
  missed in the audit now match. Jose/José remain separate caption choices.
- Console → Avatars → Raven → Interactive Studio → **3 · Name and questions**
  now has optional pronunciation/bilingual aliases and **Test name matching**.
  Preview uses unsaved edits without starting a visit or calling a provider.
  Save/Publish applies the roster to the next visit. Raven's production list is
  still empty; no synthetic roster was published.
- Main owns the pending spelling. `studio_confirm_name` accepts it only after
  read-back and a later visitor agreement, with a current-step receipt. Rejected
  candidates are skipped for the visit; restart clears them. Repetition also
  requires fresh visitor input. Names remain captions, never private identity.

[Research, user journeys, repair and QA](docs/testing/guest-name-repair-2026-10-24.md) ·
[Checks and retained failures](docs/testing/guest-name-repair-checks-2026-10-24.json) ·
[Chinese provider](docs/testing/guest-name-repair-provider-zh-2026-10-24.json) ·
[English provider](docs/testing/guest-name-repair-provider-en-2026-10-24.json).

## Fresh evidence and runtime

- **215/215 distinct focused/boundary tests**, plus **52/52** affected tests rerun
  after the accent refinement. Both TypeScript projects and build pass.
- Final-build rendered operator journey **23/23, exit 0**: aliases, previews,
  invalid references, Save/Publish/reload, restoration, disabled controls and
  narrow layout. Two earlier development failures are retained and repaired.
- Real-provider name visits **8/8 Chinese + 8/8 English, exits 0**, one attempt
  each: intended caption, agreement → question one, fresh restart. Chinese also
  denies the first ambiguous candidate and reaches the next. Zero spelling
  corrections. Synthetic speech, not human Jabra acceptance. The later accent
  refinement leaves those tested paths unchanged and has separate unit evidence.
- Final build source `252f2b640c3bc2a6`, output `f193d345f1968221`, built
  2026-10-24 12:39:41 Taipei; full hashes in the report.
- Jabra output restored/read back **70.08%** after each run; no mute/input-gain
  edits. Normal Electron is stopped. Black-HDMI cover PID 80539 remains active.
- Active config unchanged: `336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`.
  Saved draft unchanged: `d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`.
- Six owned QA roots cleaned: **480 files / 96,280,063 bytes**, excluding retained
  markers. Failure/results metadata retained; scratch helpers removed. No
  conversation transcripts/audio retained. Owner deliverables untouched.

## Remaining boundary

Next acceptance: enter the real event roster/aliases, preview likely spellings,
then test human names through Jabra. Dictionary coverage and personal readings
are finite; aliases cover exceptions. One passing provider sample per story is
not an accuracy rate. No new image-generation or full four-question provider run
was needed for this scoped repair.

The broader [journey audit](docs/testing/studio-journey-audit-2026-10-24.md) still
has failed-opening recovery and operator-rescue gaps. Unrelated camera, physical
hardware and second-computer acceptance remain in [TODO](TODO.md). The repeat
without-fresh-input and name shortlist/confirmation defects are repaired here;
do not claim every field-loop cause is closed. [DECISIONS](DECISIONS.md) owns rulings.
