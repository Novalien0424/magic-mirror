# Magic Mirror — current handoff, 2026-10-23

Latest delivery on `field/macmini-deploy`: fixed Studio losing name input after
microphone recovery during opening/name narration. The narration guard temporarily
disabled capture; recovery copied that temporary state and left the replacement
disabled. Recovery now uses the intended state saved before narration. Capture
remains paused during speech and resumes afterward, including delayed acquisition.
The reported production visit and two failing regression tests establish this
cause. No transcript/audio retention, model-ID or production configuration change.

Normal canonical LaunchAgent runtime is **running** in Interactive Studio mode.
Main/renderer/web server became ready at **20:36:06 Taipei**; the physical Studio
button route acknowledged mode success/TV awake at 20:36:13. It was Dormant with
fresh wake-input blocks at the last direct capture; no subsequent visitor session
appeared in metadata through 20:42. Owner agreed to a human name trial and received
the wake/name instructions; **the human result is pending**. Leave this runtime
available for the trial rather than restarting it.

Canonical build **20:31:07 Taipei**: source `20023ee7ce9f699d`, output
`7ed6700559849daa`. Node/web typechecks and build verification pass; deployment
runs that output. Production active/draft hashes match task entry: Raven v21,
four questions, Chinese opening/name collection, name database and modern
minimalist multicolour vector style. The unrelated saved operator draft is
preserved. Jabra output reads **70.08%** after cleanup and a fresh read-back at
20:42. Owner-requested QA output remains 1%; cleanup must always restore 70%,
including failure/cancellation. Input gain was unchanged; internal speakers
remain at their prior 1%.

Tailnet Console remains available while Magic Mirror runs:
**https://macmini-m6-33.tailf9113c.ts.net:8443/**. Existing public Funnel 443 is
unchanged; Console 8443 is private. Its preceding browser/operator QA is linked
from the archived handoff below, not claimed as a fresh test for this repair.

## Evidence and limits

- Two regression tests failed before the fix with the replacement microphone
  disabled after narration. Final Studio/microphone recovery selection **61/61**.
- Physical Jabra run, exit 2: two actual recoveries during narration; the WebRTC
  sender was **live, enabled and unmuted** at name input. One ASR completion
  arrived, but the quiet synthetic name was unrecognized and Raven repeated the
  question. This verifies the repaired device handoff, not human name acceptance.
  Full failure metadata is retained; no louder/repeated acoustic trial.
- Clear synthetic microphone with real providers, **8/8**, exit 0: name,
  denial/correction/confirmation, question one and a fresh name after restart.
  Six ASR completions; all six input checkpoints had exactly one live, enabled,
  unmuted sender. No provider errors or images generated. The confirmation
  screenshot showed only the test name as text.
- Added bounded `--studio-name-only` QA to exercise this journey without image
  generation, and metadata-only actual sender-state checks for Studio input.

[Diagnosis, journey and QA](docs/testing/studio-name-microphone-2026-10-23.md) ·
[Retained failures](docs/testing/studio-name-microphone-failures-2026-10-23.txt) ·
[Preceding Studio/web delivery](docs/archive/progress-before-name-microphone-2026-10-23.md).

## Cleanup and next action

Both exact owned QA runs were reviewed and deleted: **190 files / 39,660,818
bytes**, excluding markers. Nine task scratch/helper files were removed. Existing
owner soul deliverables and Drive upload remain untouched; no test settings were
published to production.

Await the owner's live name result; use only fresh metadata to investigate any
remaining failure. Human microphone acceptance and the prior second-computer
browser trial remain open. Known Arducam missing-frame/recovery errors occurred
during physical QA and were not addressed by this microphone repair. Printing
remains the requested deferred/no-op skill. [TODO](TODO.md) owns unrelated
acceptance; [DECISIONS](DECISIONS.md) owns other rulings. No phase promotion or
additional Electron restart owner.
