# Physics, animation, expressions and export

## Physics

Start with one output that has actual endpoint shapes. Verify input IDs and min/center/max normalization, then output scale and pendulum behavior. No response calls for ID/key/scale diagnosis, not ever-larger input. Observe Output Maximum and avoid sustained clamping. Give each hair/clothing output a clear owner.

Shared output groups blend in processing order; blue shared-output indicators are not simple averaged percentages. Red backward dependencies require reordering or removing the dependency. Record FPS (60 is a useful starting choice, not a quality guarantee), group order, scale/influence and whether FPS is exported. Test both cursor input and the actual motion playlist with decay after stopping. SDK delta/gravity/wind can differ; product runtime testing requires its own scope.

## State motions

Create `.can3` scenes against the current `.cmo3`; record name, start, duration, FPS and target. Reload Material after model edits. Derive visible state actions from the character brief: Dormant rest, Waking engagement, Listening attentive reactions, Thinking an intentional attention shift, Speaking selective emphasis, Scene a distinct declaration and Suspending relaxation. Set amplitude and frequency separately within the demonstrated rig range; see [acting and rig foundations](acting-rig-foundations.md).

In Cubism 5.3.04, a native CMO model track also exposes right-click → Import Motion. Imported motion3 curves can be an editable timing starting point; inspect them on the current model and retain the CAN3. Import may extend scene duration while leaving the model track and Work Area short. Display Entire Scene, move the indicator to the intended last frame, and use Set current position to the end of track (Shift+N), then extend the Work Area. Confirm all three ranges. A 16-second curve ending at frame 480 at 30 FPS occupies frames 0–480; video export contains 481 frames. Do not confuse the short default track disappearing with missing model geometry.

Native motion export is File → Export For Runtime → Export motion file (Ctrl+Alt+Shift+S). Use keyed owned parameters and inspect the resulting JSON: the observed export wrote Loop=true and per-parameter FadeOutTime=0 even when the imported study used another policy. A native round trip does not preserve every runtime fade/loop intention. Keep diagnostic studies separate from application state clips, restore intentional metadata explicitly and verify actual SDK transitions.

Key only owned parameters at frame zero. Exclude `ParamMouthOpenY`, Model-target EyeBlink/LipSync curves and Audio dependencies. Eyelid curves require an explicit runtime policy disabling automatic blink in those states; Raven V11 uses this for sleep/wake transitions. Hair can follow physics rather than duplicating its curves. Preserve each required group and its first file; Console may test additional indices. See [performance ownership](performance-ownership.md).

Inspect interpolation and exported curve compatibility. Loop editing does not enable runtime looping; check endpoint pose and velocity, fades and actual completion behavior separately. Fade priority is parameter, model3 overall, then motion3 overall. Short motions may never reach peaks under long fades.

## Expressions and optional controllers

Expressions are fixed parameter changes, not timed motions. A two-frame expression scene can export expression motion for OW Viewer conversion, or use Add Expression. Add applies deltas, Multiply can preserve blink scaling, and Overwrite replaces the underlying value. Exclude live mouth-open; test each expression × blink × head motion, including saturation/clamping. A common 500 ms fade is not a quality guarantee.

Export all `.exp3.json` files, then Export Model Settings for their references. Reopen the model3 and verify `exp_01`…`exp_05` names/mapping; an unsaved `*` or renamed file alone is insufficient.

Parameter Controllers are Editor authoring tools, not runtime tracking. Target Follow weights 0/100 mean no/full follow; bake controller animation to parameter curves before runtime export and inspect optimized curves. `paramctrl3.json` is not a substitute for baked motions.

## Atlas and export

Inspect atlas layout at original and intended display size: no overlap, adequate padding and clear eye/mouth detail. 2048/4096 are examples, not universal performance requirements. Record atlas dimensions/count/scales.

Export genuine MOC3/model3/textures with the supported target, intended hidden/guide settings, scale, physics and FPS. Export the intended scenes/work area separately. Do not bake live voice, blink or runtime physics into state motion; fixed demos use separate outputs. Preserve exported anti-bleed textures without resaving them in an image editor.

Cubism 5.3 advanced blend/offscreen requires matching Core and Framework/renderer. Record offscreen count/nesting and actual resolution/performance. ArtPath SDK(N/A) is not Web support.

## Acceptance and diagnosis

Keep Editor source, reopened OW Viewer embedded data and Magic Mirror import/display as separate evidence. For no motion, inspect actual MOC parameters and the first motion; diagonal defects point to keys/masks/parents; physics mismatch points to group order/FPS/input. Product-specific mouth, interruption and performance checks apply only to authorized integration.

Inspect current code and loaded profile for update order. The generic chain historically is loadParameters → motion → saveParameters → physics → breath → blink → expression → pose → output mouth → model.update, with a 0.8 mouth blend. `raven-calm-v1` changes secondary-effect, eyelid and mouth ownership; use [performance ownership](performance-ownership.md), not the generic snapshot, for that profile. A static validator does not prove natural movement. See [acceptance](acceptance-resume.md).

Sources: [physics](https://docs.live2d.com/en/cubism-editor-manual/physics-operation/), [fade](https://docs.live2d.com/en/cubism-editor-manual/about-fade/), [expressions](https://docs.live2d.com/en/cubism-editor-manual/facial-expression-system/), [embedded export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/), [5.3 compatibility](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5-3/).
