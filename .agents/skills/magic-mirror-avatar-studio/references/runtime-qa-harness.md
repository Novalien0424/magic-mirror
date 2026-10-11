# Exported-model QA

Use `scripts/runtime-qa/` to inspect a genuine export through the existing project's Core/Framework. Instruction-only work needs no rendering. Reuse existing evidence for diagnosis; start a renderer only to resolve a remaining question. The harness cannot certify anatomy or application behavior.

## Select evidence, then run

| Question | Smallest useful check |
|---|---|
| Which surface causes a defect? | Reproduce one failing pose; isolate suspected drawables/source edges. Stop once the cause is distinguished. |
| Did a local art/geometry repair work? | Baseline rest, failing pose, useful intermediates and normal-speed forward/return; defect crop plus full silhouette. Densify only failing intervals. |
| Did expression composition change? | Affected entry/hold/fade with relevant writers; `run-v08-qa.mjs --only expressions` for broader coverage when needed. |
| Did timing/ownership change? | Chronological playback matching actual update order and relevant handoff/interruption/loop. |
| Is the export valid/current? | `preflight-v08-runtime.mjs --model-root <fresh> --baseline <prior> --output <report>`; identity/reference evidence, not visual acceptance. |

Choose poses from the defect, not a universal grid. `run-v08-qa.mjs` defaults to `--only all`; its legacy face/motion samples are spot checks, not exit/loop acceptance. `capture-diagnostic-grid.mjs` is also face-specific. Reuse a targeted job runner. Hash unchanged clips instead of replaying every state. No fixed capture quota or multiple-frame-rate requirement.

## Setup when needed

```sh
export RAVEN_PROJECT_ROOT=/Users/novalien0424/magic-mirror
export RAVEN_MODEL_ROOT=/path/to/fresh-runtime
export RAVEN_QA_PORT=4177
node "$RAVEN_PROJECT_ROOT/node_modules/vite/bin/vite.js" \
  --config "$RAVEN_PROJECT_ROOT/.agents/skills/magic-mirror-avatar-studio/scripts/runtime-qa/vite.config.mjs"
```

The project supplies Core/Framework shaders. Set `RAVEN_MODEL3` for multiple manifests; `/runtime/model3.json` maps to it. Confirm served identity once per unchanged run. Use a job-owned CDP browser with exactly one page, never personal browser/Electron: runners select the first page. Reuse a verified harness; recheck stale processes after interruption and close owned helpers when finished.

Runners use explicit `--url`, `--output`, `--cdp`, `--canvas-width`, `--canvas-height`; the main runner requires `--model-root`. Legacy canvas defaults are diagnostic only. Use `--help` when unfamiliar. Verify PNG dimensions; overscan is diagnostic, not production framing.

## Interpret correctly

- `resetToNeutral()`, `setParameters()`, `tick(0)`, `getAllParameterValues()`, `getDrawableInspection()` and `captureDrawablePngDataUrl(id)` support isolated poses. `setParameters()` stops motions/expressions.
- Generic `cubism-qa.js` uses load → motion → physics → expression → manual → Core without saving motion base. Match product order for claims depending on it; SDK playback is not the application controller.
- Inspect opaque texture seams and alpha holes. Equal-scale RGBA comparison proves pixel identity; alpha alone cannot. See affected [visual checks](perceptual-qa.md).
- Core `drawOrders` are authored layer values; `renderOrders` are computed render-sequence positions. Never use a render ordinal as the Editor draw-order value.
- Actual time deltas/post-fade samples test playback; reset neutral and restarting Console clips do not prove continuous return/handoff.
- `audit-motion-design.mjs` has a fixed-stride scan unsuitable for Bezier extrema; exclude its amplitude verdicts from acceptance.

Passing relevant evidence ends validation. Expand only for changes, failures or unresolved risk. Harness code edits call for applicable browser-free tests: `test-run-v08-qa-args.mjs`, `test-portable-harness.mjs`, `test-expression-timeline.mjs`; wording edits do not.
