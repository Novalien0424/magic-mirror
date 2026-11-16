# Stickers for an automatic cutter — 2026-11-16

Owner: "check for me if this is okay for auto sticker cut machine", then "go ahead
with the clean-up step, white margin is fine". [Ruling](../../DECISIONS.md).

## What was wrong

Measured on the three minimalist samples the owner accepted (13:57–13:59, synthetic
answers), assuming a 60 mm sticker. The dust is invisible (alpha 1–8), so only the
alpha values show it.

| | Sample 1 | Sample 2 | Sample 3 |
| --- | --- | --- | --- |
| Smallest gap to the canvas edge | 1.0 mm | 2.0 mm | 0.7 mm |
| Separate pieces | 1 | 1 | 13 |
| Dust pixels away from the subject | 23,736 | 16,018 | 10,102 |
| Body opacity (255 is solid) | 253 | 253 | 253 |
| Glow around the edge | none | none | none |

A 2–3 mm cut margin fell off the canvas in all three, a tracer that counts any
non-clear pixel would cut the dust, and sample 3's water drops were loose pieces.

## What changed

- `src/main/studio/sticker-cleanup.ts`: alpha ≤ 16 becomes clear, alpha ≥ 248 becomes
  solid, and the canvas grows, without resampling, until the subject has 8% empty
  space on every side (4.8 mm of 60 mm), centred. Colour chunks are kept; the
  provider's provenance chunk is dropped because it no longer matches the pixels.
- Studio shows and hands to the printer seam the cleaned copy; a change edits the
  provider's original. The Console test picture is cleaned too. A picture that cannot
  be cleaned is kept, with `studio_sticker_cleanup_skipped`.
- The sticker frame and the concept step ask for one connected shape.
- Not changed: Conversation pictures, full pictures, the drawn border (none).

## Results

The three samples above after the clean-up: canvas 1414, 1330 and 1441 px; gap 8%
(4.8 mm) on the tightest side; dust 0; body opacity 255; 194–222 ms each.

Three fresh pictures at 15:54–15:56 with the new wording and the published Raven
settings (synthetic answers, real concept and image calls):

| | belonging | craft | renewal |
| --- | --- | --- | --- |
| Pieces | 1 | 1 | 1 (13 before, same answers) |
| Gap from the provider | 0.7 mm | 1.0 mm | 0.6 mm |
| Dust from the provider | 18,842 | 6,722 | 2,662 |
| After the clean-up | 1456 px, 8%, dust 0 | 1445 px, 8%, dust 0 | 1454 px, 8%, dust 0 |

The model still fills the canvas, so the empty space comes from the clean-up, not
from the wording. Checks: 9 new tests, 390 Studio and prompt tests, typecheck.
Pictures were kept only in a temporary folder and deleted after measuring.

Reproduce: `STUDIO_STICKER_CUT_LIVE=1 STUDIO_STICKER_CUT_DIR=<temporary folder>
npx vitest run tests/integration/studio-sticker-cut-live.test.ts`.

## Deployed 16:18

Owner approved the stop. STOP 16:09:32, build, Studio journey with the real camera
and synthetic speech at 1% sound: **26/26, exit 0**
(`.artifacts/phase4-qa/2026-11-16T08-10-38-317Z`), with `studio_sticker_cleaned` on
the first picture and on the change, none skipped. Levels restored and read back
(Jabra 80%, A1 65%); START 16:18:08, build stamp matches the source.

The first run of that check failed at launch
(`.artifacts/studio-sticker-cut-2026-11-16/studio-journey-failed-import.log`):
`37205a4` had added `import … from './studio-concept'` to
`src/shared/portrait-studio.ts`, and the runner loads that file with plain Node,
which needs the `.ts` ending. Fixed, and `tests/unit/qa-runner-imports.test.ts`
now loads both runners' source imports under Node.

## Limits

- No real cut: the cutter's model and the sticker size are not known, and printing
  is not connected. Three pictures do not prove every picture comes back in one piece.
- Antennae, claws and feather tips are under 1 mm wide: cut with a margin, not on
  the art's edge.
- White parts of a subject at its edge merge into the white margin when printed.
