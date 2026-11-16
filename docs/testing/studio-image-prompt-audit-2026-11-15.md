# Studio image prompt and model audit, 2026-11-15

**Follow-up completed 15:49:** the owner approved implementation; final prompts
and 2.6 Flare are deployed. This document preserves the earlier audit and model
probe. See the [implementation plan, failures and final checks](studio-prompt-implementation-2026-11-15.md).

The versioned image model is updated from `gpt-image-2.5-flare` to
`gpt-image-2.6-flare` after a real ChatGPT Codex-backend generation and edit
using the shared Studio prompt builders passed. This is a **source change**;
deployment remains pending while another session changes camera source. No
Electron build, restart or operator-setting change was performed for this probe.

## Prompt suitability and style bias

The existing assembly separates subject answers, style, composition and text
constraints, consistent with the official guide's general approach. Its problem
is conflicting art direction rather than prompt length alone. Keep the square
composition, isolated subject, transparent PNG request, clean alpha edges,
padding and white die-cut border. These are format requirements. Mandatory bold
internal outlines and bans on gradients, texture, shading and fine detail are
art-style decisions and can contradict the operator's selected medium. A white
cutting border does not require cartoon outlines inside the illustration.

Published Raven settings inspected during this audit use minimalist multicolour
flat-vector art, explicitly excluding photorealism, gradients and heavy texture.
No imagePrompt overrides were present; absent pictureType resolves to sticker.
Draft style matches published style; draft quality is low, published quality
medium. Both files were left untouched. The fixed sticker frame also requests
gentleness/all-ages suitability and a simple emblem, which plausibly nudges
outputs toward friendly mascot treatment. This is a source-supported explanation,
not a visually graded A/B proof of model bias.

The Art style field is substituted only through an optional {{style}} in the
opening frame. An operator override omitting it can discard the style entirely;
that is not occurring in the inspected published settings. Settings are pinned
per session, so mid-session publication does not update an existing visit.
Console test pictures use fixed sample answers starting with an owl rather than
the current visitor's reflective answers. These also affect comparisons.

Recommended prompt change, not applied by this audit: retain format instructions
and make operator artStyle the sole source of medium, rendering, proportions and
internal linework. Keep the visitor-data guard and symbolic-answer instructions;
shorten redundant constraints without removing meaningful sticker requirements.
The photo prefix's recognizable-face request still conflicts with the default
frame's prohibition on identifiable people. Revisions explicitly redraw in the
complete original frame, so its art restrictions recur on every revision.

Root verification: 79 prompt/runtime/Console editor tests passed. This overlaps
the worker's 44 checks below and must not be summed as unique tests.

## Model choice and alias limit

OpenAI's current [image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting)
identifies 2.6 Flare as the speed-oriented model and recommends testing it for
existing 2.5 Flare workflows. The application uses the owner's ChatGPT plan via
the Codex backend rather than the public API, so acceptance was checked on that
actual route. Acceptance does not reveal the backend's internally resolved model.

No supported moving **latest-fast** alias was verified. The
[`chatgpt-image-latest` model page](https://developers.openai.com/api/docs/models/chatgpt-image-latest)
marks it deprecated, and the [deprecations page](https://developers.openai.com/api/docs/deprecations)
lists its shutdown on December 1, 2026. It is unsuitable for automatic future
upgrades. `gpt-image-2.6-flare` uses the documented family name without a dated
snapshot; it does not promise automatic migration to a future model family.
No invented alias, silent model substitution or fallback was added.

## Live checks and retained failures

All input was synthetic, and all generated/edited images stayed in RAM. The
probe printed only model, operation, timing, byte count, dimensions and decoded
alpha statistics. It did not save images, prompts, credentials or visitor data.

| Case | Result |
| --- | --- |
| 2.6 Flare, simple botanical sticker | Generation accepted in 13.789 s; returned 1536×1024. Initial probe stopped because it incorrectly required a fully opaque alpha-255 pixel. |
| 2.6 Flare, same simple prompt, corrected alpha check | Generation 15.476 s; edit 23.206 s. Both returned 1536×1024 despite square request parameters. Both had transparent and visible pixels; maximum alpha 254. Square-geometry assertion failed. |
| 2.5 Flare, same simple prompt baseline | Generation 15.539 s; edit 25.366 s. Both also returned 1536×1024 with transparent and visible pixels, maximum alpha 254. Square-geometry assertion failed. |
| 2.6 Flare, actual shared Studio builders | **Passed 1/1**, 78.10 s combined test. Four synthetic reflective answers; default Studio settings, medium quality, sticker request. Both generation and revision accepted, decoded as RGBA PNG, square, with transparent and visible pixels; edited bytes differed. |

The simplified prompt did not explicitly say **square**, unlike the actual
Studio frame. Its shared failure across 2.5 and 2.6 does not establish a
2.6-specific regression. It does establish that request-size parameters alone
did not determine returned geometry on this backend. The passing actual Studio
test proves square geometry, not an exact 1024×1024 resolution or repeated-run
reliability. Per-operation metadata for that final case did not reach the final
tool output, so only its combined duration and asserted checks are retained.

The simple comparison is a small sample, not a speed benchmark. The complete
Studio test cannot be directly compared with the simpler leaf prompt.

## Reproduction and local checks

```sh
STUDIO_IMAGE_MODEL_LIVE=1 STUDIO_IMAGE_PROBE_MODEL=gpt-image-2.6-flare \
  node node_modules/vitest/vitest.mjs run tests/integration/studio-image-model-live.test.ts
```

The default uses the shared production Studio builders. To reproduce the
simplified prompt geometry case, add `STUDIO_IMAGE_PROBE_PROMPT=simple`.
The test remains skipped unless explicitly opted in. Its PNG decoder supports
the observed noninterlaced, 8-bit RGBA output and reports an explicit probe
failure for other PNG layouts; this is not a production decoding restriction.

Focused provider/prompt tests: **44 passed**, live test skipped without the
opt-in flag. Node typecheck and `git diff --check` passed. Metadata evidence:
`.artifacts/studio-image-model-2026-11-15/metadata.json`.

Changed files: versioned model configuration, provider unit-test fixture and the
new RAM-only integration probe. Prompt wording and published/draft avatar
settings remain unchanged by this model subtask. Artistic quality, likeness,
style adherence and real-person photo inputs were not visually assessed.
