# Magic Mirror — current handoff, 2026-10-23

Latest delivery on `field/macmini-deploy`: Studio narration owns the full Chinese
opening/name question and processed audio tail before listening or starting the
30-second deadline. Early/echo input cannot skip steps. A fresh visit asks the
name again. The Avatar remains visible until the drawing announcement finishes.
Review requires a new heard reply; silence cannot authorize a revision. Edits
carry the published art style, and byte-identical provider edits retain the old
picture with a failure reason. No transcript/audio retention or model-ID change.

Tailnet web Console is deployed at
**https://macmini-m6-33.tailf9113c.ts.net:8443/** while Magic Mirror is running.
It uses the existing Console UI and validated Main controls behind private
Tailscale Serve. Browser editing/save/publish, mode changes, managed media,
Avatar previews and reconnect work. Host file selection/import, private memories,
voice audition, wake calibration and simulator remain on the Mac with visible
guidance. Existing public Funnel 443 is unchanged; Console 8443 is private.

Normal canonical LaunchAgent runtime is **running**, Raven **v21**, Interactive
Studio mode, Dormant/listening. Main/renderer/web server were ready at 18:43
Taipei; HTTPS returned 200 and the Studio button route acknowledged mode success
and TV awake. Production active/draft hashes match task entry. Four questions,
Chinese opening/name collection, modern minimalist multicolour vector style and
default farewell remain configured. The unrelated saved draft is preserved and
still awaits publication. Jabra output reads **70.08%**, unmuted, after reset and
subsequent read-back. Owner clarified that **1% during QA is intentional; cleanup
must always restore Jabra to 70%**, including failure/cancellation, rather than
restore a captured low test level. This rule is recorded in `mm-ui-qa`; a fresh
native output-status check confirmed 70.08%. The previously unknown original
internal-speaker volume remains 1%.

Canonical build **18:33:38 Taipei**: source `3b4a1b97354b8d0e`, output
`c6f00fed3d61befed`. Build verification passes; deployment runs that output.

## Evidence and limits

- Final focused Studio/runtime/tools/HTTP selection **79/79**; subsequent HTTP
  authentication, SSE and media checks pass. Node/web typechecks and build pass.
- Real provider four-question journey **26/26**, exit 0: name correction and
  confirmation, four brief comments, drawing order, a visible silver-wing edit,
  exact feedback/farewell, transfer and a fresh name question on restart. All 22
  classified lines Chinese. The earlier verbatim-offer mismatch is retained.
- Real provider silent journey **23/23**, exit 0: stop during opening/restart,
  name fallback after 30 seconds, two configured unanswered questions, one image,
  **zero visitor ASR and zero revisions**, review timeout and normal farewell.
- Isolated editor journey **23/23**, exit 0: name list, question limits/content,
  validation/save/reload/publish/default restoration and narrow layout.
- Actual Safari HTTPS journey: save/publish persisted, media played, Ren preview
  rendered at 60 FPS and its motion control worked. Backend outage/recovery kept
  unsaved edits and restored Connected automatically. Production UI also checked.
- Speech QA uses synthetic visitor audio through real WebRTC/ASR/tools/playback;
  human Jabra microphone acceptance and a second tailnet computer were not run.
  No second-peer SSH details were supplied. Existing Chrome profile blocked the
  URL client-side; Safari worked with normal certificate verification.

[Full journey, QA and deployment record](../testing/studio-field-repair-2026-10-23.md) ·
[Retained failures](../testing/studio-field-repair-failures-2026-10-23.txt) ·
[Previous Desktop/STOP/style delivery](progress-before-studio-field-2026-10-23.md).

## Cleanup and next action

Ten exact owned QA runs were reviewed and deleted: **803 files / 160,016,689
bytes**, excluding markers. Task scratch files are removed; metadata failure
evidence remains. Existing owner soul deliverables and AI_Stuff/AI_Avatar Drive
upload are preserved. Test configurations did not overwrite production defaults.

Operator can use the tailnet URL or Studio button. Remaining acceptance is a
second-computer browser visit and human microphone trial; provider verbatim
speech remains variable despite the final passing sample. Printing remains the
requested deferred/no-op skill. The prior Arducam zero-frame issue was not
retested. [TODO](../../TODO.md) owns unrelated acceptance; [DECISIONS](../../DECISIONS.md) owns
other rulings. No phase promotion or additional Electron restart owner.
