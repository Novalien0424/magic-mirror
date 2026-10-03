# Avatar framing fix — Windows QA

Scope: [framing handoff](../../AVATAR-FRAMING-FIX-HANDOFF.md). Restore Raven
v08's scale to v07 without changing assets, parameters, motions, CSS, schema,
SDK or published configuration. Scale regression fixed; extreme-pose crop
acceptance remains separate and is not a full artistic pass.

## Implementation and focused proof

- `src/renderer/avatar/avatar-framing.ts` creates a fresh projection/MVP using
  canvas aspect and the initialized/authored model matrix, without mutation.
- `cubism-avatar.ts` calls it instead of the per-frame width-units threshold.
  Model initialization/Layout, framebuffer/viewport and draw lifecycle remain.
  Both Console and Mirror use this renderer; no new Mirror publication tested.
- `tests/renderer/avatar/avatar-framing.test.ts` covers v07/v08 scale, equivalent
  physical vertices at width units 0.999/1/1.001/1.360255, height/width Layout
  plus translation over 100 draws/resizes, and isotropic DPR/resolution mapping.
- Initial RED was the missing new module; the implemented framing/layout tests
  passed 15 cases. Resumed focused command below: **exit 0, 32 tests / 6 files**.

```powershell
npx vitest run tests/renderer/avatar/avatar-framing.test.ts tests/renderer/avatar/portrait-layout.test.ts tests/renderer/avatar/cubism-preview.test.ts tests/renderer/avatar/avatar-runtime-controller.test.ts tests/unit/avatar-model-import.test.ts tests/unit/avatar-component-contract.test.ts
npm run typecheck
npm run build
```

Node/web typechecks and the final production build after diagnostic removal:
exit 0. No full-suite, physical speech, hardware or Mac claim.

The implementation follows the separation of model Layout and projection in
[Live2D's Layout documentation](https://docs.live2d.com/en/cubism-sdk-manual/layout/).
Height-based framing is this product's default, not universal automatic crop.

## Same-size actual render evidence

Both runs used fresh imported model instances in the production Console,
isolated user data, neutral reset, 360×640 CSS / **540×960 canvas pixels**, DPR
1.5. The temporary driver altered only its isolated preview host dimensions,
used production UI/IPC, and substituted picker returns. It is now removed.

- Before: `.artifacts/phase4-qa/2026-09-08T13-54-57-043Z/`.
- After: `.artifacts/phase4-qa/2026-09-08T13-57-01-526Z/`.
- Each exited 0 and captured 56 files, but **neither is a complete visual pass**:
  Ren's direct canvas alpha capture was empty and some combined-pose inputs
  had stale UI/readout state. Neutral Raven/Haru captures remain usable.
- Stricter capture run `.artifacts/phase4-qa/2026-09-08T13-59-50-799Z/` checked
  clamped parameter readback before each pose. It was interrupted by the user's
  physical Escape after `v08-mouth-0-0.png`; no final evidence JSON was written.
  Captured images survive, but the run is not passed/completed.

Source hashes, actual Core canvas/origin/PPU and Layout are in the completed
after run's [framing.json](../../.artifacts/phase4-qa/2026-09-08T13-57-01-526Z/screenshots/framing.json).
Core version 100663297 (6.0.1). v07 canvas 941×1672, origin 470.5/836, PPU 941;
v08 1280×1672, origin 640/836, PPU 941; both Layout absent. v08 MOC SHA-256
`8b96dd720f221bd47bf7a51ec0e5efce7de3301c6a996d13aa9c07e4338d3918` matches handoff.

Alpha threshold 16/255, actual raster bounding boxes at 540×960:

| Neutral | Before bbox (left, top, right, bottom) | After bbox |
|---|---|---|
| v07 | 0, 119, 540, 960 | 0, 119, 540, 960 |
| v08 | 71, 215, 469, 834 | 0, 120, 540, 960 |
| Haru | 63, 50, 476, 899 | 63, 50, 476, 899 |

Inspected [comparison sheet](../../.artifacts/avatar-framing-review/neutral-before-after.png)
and full-size [v07](../../.artifacts/phase4-qa/2026-09-08T13-57-01-526Z/screenshots/v07-neutral.png)/
[v08](../../.artifacts/phase4-qa/2026-09-08T13-57-01-526Z/screenshots/v08-neutral.png):
common suit/accessory scale and placement match again. Different head artwork
is expected. Bboxes reaching sides/bottom include the existing half-body crop,
not a proof that every important feature fits at every pose.

Haru's actual rig/texture bytes were unchanged; only an isolated manifest copy
mapped its existing Idle clip to required lifecycle groups for import. Both
neutral full-body images match; no exhaustive Haru animation acceptance claimed.
Blank Ren slots in the comparison are rejected capture evidence, not a product
rendering conclusion. Resumed standard window capture shows intact built-in Ren.

## Visual findings and limits

- Inspected head/body axes and head XY grid: top of head and chest accessories
  remain visible. **ParamAngleX +30 clips the side-facing beak at the left edge**
  at restored v07 scale. This needs an operator-approved fixed per-model Layout
  calibration; no export or motion range was silently changed to hide it.
- Seven motion/five expression representative frames show their authored pose
  differences. [Action sheet](../../.artifacts/avatar-framing-review/actions.png)
  is a sampled-pose inspection, not smoothness or complete timeline proof.
- The first gaze/mouth sheets contain stale combined poses and are not accepted
  combined-control evidence. Stricter interrupted captures retain verified
  head/gaze combinations and frontal closed/half/open beak samples.
- Matrix tests prove no framing drift through repeated draws/resize; alpha
  images alone cannot prove artistic quality or fluid motion. Human acceptance
  and a complete black/white/checker mouth-alpha matrix remain unclaimed.

## Resumed production and native QA

User explicitly resumed Computer Use/QA after the interruption. The rebuilt
production contains no temporary `MIRROR_FRAMING_CAPTURE` hook/module.
Standard mode uses Raven **v08**, not the earlier v07 fixture:

```powershell
$env:MIRROR_CUBISM_QA_MODEL = 'C:\Users\b8901\Documents\Codex\2026-09-07\new-chat\outputs\raven-lord-v08\runtime\raven-lord.model3.json'
npm run test:phase4:qa:cubism
```

Fresh production run: **exit 0, 219 Console checks, 22 motion starts,
15 expressions, 6 screenshots** across built-in Ren, managed Ren with an
extra Scene clip, and Raven v08. Actual MOC parameters (73/73/27) exercised
min/max/default/readback. Import cancellation, switching back, cleanup and
unchanged configuration passed. See [evidence.json](../../.artifacts/phase4-qa/2026-09-08T14-06-20-531Z/evidence.json)
and [build stamp](../../.artifacts/phase4-qa/2026-09-08T14-06-20-531Z/build.json).
The first/return Ren captures are byte-identical. Inspected neutral Raven,
open side beak and blink captures; this mode hides Mirror and is not a portrait
display or physical-provider acceptance.

Native Windows computer use then selected/loaded built-in Ren and existing
managed Raven v08 (`c4d3cf1b`), confirmed corrected neutral scale, head min/max,
reset, maximized/restored Console sizing, and Waking start/finish. Neutral
parameter readbacks settled to zero after reset. Retained native captures:

- [Extreme side beak crop](../../.artifacts/avatar-framing-review/native/v08-side-crop.png).
- [Maximized neutral framing](../../.artifacts/avatar-framing-review/native/v08-resized-neutral.png).
- [Final restored-size neutral](../../.artifacts/avatar-framing-review/native/v08-final-neutral.png).

Normal built Electron remains running, Main PID **56424** (point-in-time),
Raven v08 loaded neutral in Console; published Mirror remains v12/Dormant.
No save, validation or publication in this resumed QA. Active/draft SHA-256
before/after are unchanged:

```text
active ABF27F0C257B123AFAE96C0A35C561A7C98916245264417581CDF60DD34AEB35
draft  9FDF232C4D953DAA800BB5B9E4FFEC34C2CF16323B1CB9A82357FF144E2FC711
```

Both edited local skills pass `quick_validate.py`; final diff whitespace check
passes. Engineering framing/Console checks pass; the visual limits above are
still open and must not be relabeled as full avatar acceptance.

## Handoff boundaries

Local Cubism/UI QA skills and DECISIONS now record height/Layout framing and
the capture/readback pitfalls. The installed external avatar-studio harness
under `C:\Users\b8901\.codex\skills\magic-mirror-avatar-studio\` was **not**
modified; its owner still needs to synchronize the contract per handoff §7.
No runtime dependency on that personal skill path was introduced.

Normal active/draft hashes before resumed native checks match the pre-fix
baseline recorded in [Cubism Console QA](cubism-console-2026-09-08.md#operator-state).
Neither configuration nor avatar source/managed bytes were edited for framing.
No publication, commit, push or phase promotion is part of this work.
