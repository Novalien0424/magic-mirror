# Magic Mirror — current handoff, 2026-10-23

Latest delivery on `field/macmini-deploy`: Studio addresses the name only before
question one, renders no visitor text except the name, and defaults to Traditional
Chinese. Only explicit requests select Chinese/English; a language request repeats
the current question without consuming an answer. The obsolete caption editor is
removed. Shared reply/image language selection follows the same explicit policy.

Stream Deck STOP now covers **T749 HDMI in black**, retains TV standby/app/mouse
cleanup, and resets **Jabra Speak2 75 output to 70%**, with read-back. The native
cover survives Electron shutdown; START/LOOP/STUDIO/CONSOLE clear it only after
renderer readiness and mode acknowledgement. The signed helper is installed;
the existing wrappers use the canonical updated scripts. No new Electron restart
owner, input-gain/default-device change or phase promotion.

Current normal Main **PID 37551**, started **16:25:38 Taipei** through the existing
LaunchAgent. Fresh Console shows **Raven v20**, **Interactive Studio mode**, **Loop
Video Playing**. The saved operator draft awaiting publication was present before
QA and preserved; active/draft/previous config hashes remain unchanged. Jabra is
currently **70.08%** (hardware representation of 70%), original mute state restored.
All input gains and default devices match the pre-test capture.

The deployed build is **16:15:29 Taipei**, source `7b796ad8071d9c04`, output
`e688dd12862d8a59`. `node scripts/qa-build.mjs --verify` passes. Button scripts and
the separately compiled/signed STOP helper are deployed in their canonical paths.

## Evidence

- **329** focused Studio/catalog/renderer/editor/conversation/memory tests passed;
  **115** button/TV tests passed. Typecheck, build and diff checks passed.
- Real Console journey **23/23**, exit 0, 17 captures. Live bilingual Studio
  journey **27/27**, exit 0, 353.473 s, 8 captures. Real providers with synthetic
  PCM/WebRTC: four answers, both explicit switches, 22 spoken lines/zero language
  mismatches, first-question-only name, four short comments, two PNGs, exactly one
  repaint announcement, deferred printer, verbatim farewell and Dormant/release.
  Zero protocol errors. Revised-image capture was visually reviewed and fully
  visible: the preceding live revision/fade-capture gap is now closed.
- Native STOP sequence passed twice (`stopped`, then `already_off`), both with
  black cover, TV standby, mouse release and Jabra 70% read-back. A CUA capture
  showed pure black across the 1080×1920 HDMI surface. Restore returned Studio +
  Loop Video. Physical Stream Deck press/human mic/external HDMI analyser remain
  separate from this evidence; no new claim for them.

[Studio journey, implementation, failures and QA](docs/testing/studio-language-display-2026-10-23.md) ·
[STOP journey, implementation and native checks](docs/testing/stream-deck-stop-2026-10-23.md) ·
[Full local failure log](docs/testing/studio-language-local-failures-2026-10-23.txt) ·
[Earlier name-list/repair report](docs/testing/soul-studio-repair-2026-10-23.md) ·
[Previous handoff](docs/archive/progress-before-language-stop-2026-10-23.md).

## Cleanup and next action

Both owned QA runs (`2026-10-23T08-17-08-439Z`, `2026-10-23T08-17-34-520Z`) were
reviewed, dry-run checked and cleaned: **176 files / 39,392,923 bytes**, excluding
markers. Synthetic transcripts were not retained. All **24** task scratch files
were removed; full local failures remain linked above. Existing five requested
soul deliverables and the earlier AI_Stuff/AI_Avatar Drive upload are preserved.

No required implementation remains. Operator may publish their preserved draft
when ready. Printing remains the requested deferred/no-op skill. [TODO](TODO.md)
owns unrelated acceptance; [DECISIONS](DECISIONS.md) owns other rulings (the latest
owner language request supersedes the historical automatic-switch rule).
