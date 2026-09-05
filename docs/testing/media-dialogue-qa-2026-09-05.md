# Media imports and avatar dialogue — Windows, 2026-09-05

Scope: follow-up to the Console redesign. No phase promotion, dependency/model
changes, credentials inspection, or replacement of the operator's configuration.

## Bounded design and implementation

1. Reuse the managed local media import pipeline. Scene actions get their own
   single-file Browse & upload button and immediately select the imported asset.
2. Media library accepts mixed batches of up to 32 files. Keep successful files
   when another fails; show per-file reasons. Save Draft and Publish stay explicit.
3. Show decoded image/video thumbnails, including newly imported unsaved assets.
   Audio cards share one local preview player at 50% gain, use selected speakers
   with Windows-default fallback, and stop when leaving the library.
4. Avatar / Audio gets Wake greeting and Sleep farewell fields in the shared
   scene/presentation draft. Existing configuration defaults remain compatible.
   Empty greeting means silent wake; farewell must be nonempty, maximum 500 chars.
5. Fresh Realtime starts greet once after connection; rollover does not greet.
   Sleep tool instructions require silent invocation and the configured farewell
   only. Interrupt preceding output and require a new playback start/end pair
   before requesting Dormant. Barge-in clears the pending sleep latch.

Defaults: greeting `我在，請說。`; farewell `如你所願，再會`. Both use the
existing configured avatar voice. Published edits apply to the next conversation.

## Self-review

- Console-only IPC validates request shape; renderer cannot supply source paths.
  Main uses a native picker and existing managed asset validation/hash checks.
- Unsaved previews resolve only registered managed assets; normal published
  playback remains separate. Errors do not disclose source paths.
- Scene authoring and dialogue settings share a draft, avoiding conflicting
  forms overwriting each other's unsaved edits. Import errors stay in Scenes.
- No microphone acquisition for library previews. At most one preview player;
  effect cleanup stops it on switching tracks/views. Output fallback stays visible.
- Regression reproduced before fixing: audio that began before the sleep tool
  was incorrectly eligible to complete the farewell and trigger Dormant.
- Realtime speech is still model-generated. Instructions plus interruption are
  not a deterministic guarantee against an already audible pre-tool preamble or
  changed wording. A live acoustic acceptance test remains necessary. No new TTS
  model or recording storage was introduced to claim an unproven guarantee.

## QA plan and results

- Focused RED/GREEN tests: mixed success/failure, failed-probe cleanup, picker
  cancellation, sanitized failures, legacy/default/custom dialogue parsing,
  fresh-start greeting versus rollover, and sleep playback ordering.
- IPC: reject Mirror/extra path/malformed requests; sanitize importer exceptions.
- Real Console: inline upload auto-selection; image/video preview before Save;
  mixed image/audio/bad-video batch; one audio player and navigation cleanup;
  Save/Test/Publish spoken lines without losing media references; existing scene,
  presentation, invalid-edit, contrast, font-size and responsive checks.
- Native Windows Computer Use: imported PNG and WebM together through the actual
  picker; observed `Imported 2 file(s)`, both thumbnails, and audio card transition
  from Test play to Stop preview to Preview finished. UIA geometry needed fresh
  screenshot-coordinate targeting; no product change was required for that.

Commands:

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | Node and renderer checks |
| Focused five-file `npm test -- ...` | 0 | 62 tests |
| `npm test` | 0 | 89 files, 847 tests |
| `npm run build` | 0 | Canonical production bundle |
| `npm run test:phase4:qa:console` | 0 | 23 checks, 21 screenshots |
| `git -c core.safecrlf=false diff --check` | 0 | No whitespace errors |

Initial automated artifacts:
`.artifacts/phase4-qa/2026-09-05T13-14-26-072Z/`.
Final rerun after the Avatar error-panel fix also passed all 23 checks:
`.artifacts/phase4-qa/2026-09-05T13-22-18-885Z/`.
Portrait display verified: 800×1280 logical pixels, scale factor 2. Inspected
media and dialogue screenshots; typography is readable and cards distinguish
image/video/audio and failed previews. Removed the unrelated import-error panel
from Avatar settings after inspection.

Native QA used isolated synthetic fixtures via `npm run test:phase4:qa:manual`.
It was intentionally stopped with Ctrl-C after inspection (exit 1, not an
automated-test failure). Native checks do not prove physical audibility. No
transcript or conversation audio was retained.

## Operator listening acceptance

1. In Avatar / Audio, set greeting/farewell, Save Draft, Test Draft, Publish.
2. From Dormant say the wake phrase; expect exactly one greeting in the configured
   voice, no repeated greeting after ordinary conversation or rollover.
3. Say the direct sleep command `恭送渡鴨大人`; listen for only the configured
   farewell, no command-processing preamble, and Dormant after its final syllable.
4. Repeat while the avatar is speaking, then interrupt the farewell with speech:
   confirm no premature or delayed surprise sleep. Test quoted/negated mentions
   separately: these must not deactivate the mirror.

Live provider wording, acoustic timing, far-field wake recognition and physical
speaker identity are not certified by the automated or native UI checks above.
