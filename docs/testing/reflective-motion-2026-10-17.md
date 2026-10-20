# Reflective mist and avatar fade — 2026-10-17

Owner report: wake/sleep phrases work, but the mist is absent and Raven appears
abruptly. The field Mac has `com.apple.universalaccess reduceMotion = 1`.
Active and draft v18 both select Raven's reflective presentation: 400 ms black
hold, reveal beginning at 1500 ms, 4000 ms entrance, 2400 ms exit. The selected
720×1280, eight-second mist file exists and matches its registered SHA-256.
Recent metadata records successful wake and sleep lifecycle transitions.

## Cause and change

`PresentationStage` skipped ritual playback under `prefers-reduced-motion`.
CSS also hid the video and disabled the avatar animation. Its replacement
opacity selector was weaker than the reflective entering selector, leaving the
avatar at opacity zero until `awake` switched it immediately to one.

Reflective mode now plays its authored mist and timed opacity animations under
either motion preference. Ordinary UI and legacy presentation motion reduction
remain in place. The macOS preference, saved configuration, avatar selection and
recognition/model paths are unchanged. See the 2026-10-17
[ruling](../../DECISIONS.md).

## Evidence

- Focused regression: four files, 46 tests passed, covering ritual invocation
  with both motion preferences, media cleanup/stalls, presentation lifecycle,
  publication continuity and greeting timing.
  [Output](../../.artifacts/wake-sleep-reveal-2026-10-17/unit.log).
- Both typechecks and the stamped production build passed.
  [Web output](../../.artifacts/wake-sleep-reveal-2026-10-17/typecheck-web.log),
  [Node check/harness changes](../../.artifacts/wake-sleep-reveal-2026-10-17/ritual-qa-worker.md),
  [build output](../../.artifacts/wake-sleep-reveal-2026-10-17/build.log).
- Initial `node scripts/run-phase4-qa.mjs --ritual` exited 2 at
  `ritual_production_media_import`, before transition checks. The inspected
  Console capture shows both files imported; the harness queried an obsolete
  status selector. This is retained as a harness failure, not a reproduction
  of the visual defect.
  [Log](../../.artifacts/wake-sleep-reveal-2026-10-17/before-ritual.log),
  [capture](../../.artifacts/phase4-qa/2026-10-17T03-01-01-081Z/screenshots/console-ritual-failure.png).

- Updated `--ritual` harness uses the current status markup, invalid-field
  rejection and **Save & apply** workflow. QA-owned CDP emulation verifies
  `matchMedia`: preview and portrait cycle 1 use `reduce`; portrait cycle 2 uses
  `no-preference`. Emulation is cleared and owned debuggers detached afterward.
- Fresh `node scripts/run-phase4-qa.mjs --ritual`: exit 0, one passed result,
  **13 checks and 13 captures**. Isolated production import/edit/save/apply/reload,
  preview cleanup and two portrait wake/sleep cycles passed.
  [Log](../../.artifacts/wake-sleep-reveal-2026-10-17/after-ritual.log),
  [artifact/build evidence](../../.artifacts/phase4-qa/2026-10-17T03-07-58-679Z/evidence.json).

Portrait measurements:

| Motion preference | Entrance duration | Sample reveal opacity | Exit duration | Sample exit opacity |
| --- | ---: | --- | ---: | --- |
| reduce | 3999 ms | 0.00697 → 0.05126 | 2406 ms | 0.86336 → 0.71880 |
| no-preference | 4007 ms | 0.00551 → 0.04731 | 2416 ms | 0.86267 → 0.72710 |

Every portrait video sample advanced approximately 600 ms with 14–15 frames
and zero dropped frames. Both initial black holds and both settled sleep
captures were RGB zero for every pixel of the 1080×1920 output. Inspected
[entrance](../../.artifacts/phase4-qa/2026-10-17T03-07-58-679Z/screenshots/mirror-ritual-entering.png),
[awake](../../.artifacts/phase4-qa/2026-10-17T03-07-58-679Z/screenshots/mirror-ritual-awake.png)
and [sleep](../../.artifacts/phase4-qa/2026-10-17T03-07-58-679Z/screenshots/mirror-ritual-return-1.png):
mist overlays a partially visible avatar; the awake avatar is present without
mist; settled sleep is entirely black.

Limits: built-in Ren proves shared rendering mechanics, not Raven's physical
artistic acceptance. QA uses lifecycle simulation, not human wake/sleep ASR;
physical sound, panel black level and sustained smoothness are not established
by these captures. Preview's short startup samples included dropped frames,
retained in the log; all rendered progression thresholds passed.

Final check at 11:09 Taipei: field LaunchAgent unloaded, zero canonical app
processes, macOS Reduce Motion still 1. The fresh build is ready for the next
START; no ordinary app launch or TV power command was issued.
[Final runtime/build verification](../../.artifacts/wake-sleep-reveal-2026-10-17/final-state.json).
