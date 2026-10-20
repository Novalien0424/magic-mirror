# Acting and rig foundations

Use for a naturalness survey, a character with expressive but broken motion, or a restrained revision that has lost readable acting. These are authoring recommendations grounded in the official sources below, not proof that a particular avatar has passed. Research-only work ends with findings and a concrete next experiment; do not turn it into an unsolicited rebuild.

## Separate the causes

Distinguish artwork coverage, mesh/keyform geometry, temporal acting, and runtime composition. Compare source/runtime hashes when versions claim different rigs. Unchanged MOC and atlases mean geometry and texture defects have not been repaired by new motion/expression JSON.

Find the first visibly bad parameter interval with secondary writers isolated. If a seam or feature distortion occurs during a slow manual sweep, repair artwork/keyforms. If individual channels look sound but combinations break, examine cross-keyforms, masks and writer order. If shape remains sound but movement feels mechanical, revise timing, pose choice and coordination. Several causes can coexist; parameter deltas alone cannot choose among them.

## Character intent and readable movement

Derive acting from the supplied design and the application's actual states. Separate observed character facts from proposed personality. For each required state, name its attention target, characteristic action, hold, entry/exit and mouth/eye owner. An expression is a sustained facial disposition; a motion is a timed action. Required group counts are not required numbers of images or unique full-body poses.

Define both the usable rig range and the performance range. Parameter numbers are not viewing angles. First show a clear, intentional action within the visually proven rig range; then decide how often it occurs. Reducing every channel toward zero can conceal broken geometry while failing the acting requirement. Quiet rest can be almost still; active states still need readable distinctions at the intended display size.

Use direction changes, asymmetric timing, acceleration/deceleration and meaningful holds. Coordinate head and body with an intentional lead/follow relationship. Add small settling only where the character calls for it; universal overshoot, constant sine waves and compulsory motion on every axis are not naturalness rules. Long state durations must not force frequent repetition of the same nod or glance. Check a short state visit as well as prolonged dwell, because a gesture late in a long loop may never be seen.

For an anthropomorphic bird, preserve the beak's hard silhouette, eye sockets and feather direction. Convey attention primarily with head orientation, eyelid shape and posture; do not import human smiling lips, teeth, eyebrows, large pupil travel or A/I/U/E/O forms without source-design support. A beak may have coordinated upper/lower motion, but lower-jaw opening is a useful initial controllable design. Treat anatomical simplifications as artistic choices.

## Reference to editable form

For a guide-set audit or new generated poses, use [guide-to-editor](guide-to-editor.md) to map coverage to actual Editor operations. Distinguish an external pose overlay from Cubism's per-layer Model Guide Image. Reference completeness and production-layer readiness are separate findings.

1. Choose an identity/texture master and a neutral pose. Inspect supplied stills and video before requesting more generated art. Keep source provenance and timestamp/frame index for accepted reference poses.
2. Separate the reference's head turn, body turn, camera motion, blink and jaw state. A turning video is not automatically a calibrated angle sequence or a fixed-body set. Map visible landmarks (beak tip/root, sockets, skull contour, neck insertion, collar) before comparing shapes.
3. Use consistent intermediate views as guide images for keyform targets. Align the relevant head and torso regions separately when necessary. Do not replace atlas layers with unregistered frames or crossfade two complete heads to imply a continuous rotation.
4. Identify only missing geometry: far-side eye/socket, beak underside/interior, eyelid cover, rear neck or collar underlap. Generate or repaint those specific regions while preserving the accepted master. The required number of reference images depends on gaps, not a fixed batch of nine.
5. In the layered source, extend surfaces that will become exposed and preserve feather/light continuity. Reimport only affected parts with source mappings preserved, then build or correct actual Editor meshes, deformers, keys and masks. Export a new genuine MOC/atlas when those surfaces change.

## Joint design and Editor operations

| Area | Useful starting construction | Evidence to inspect |
|---|---|---|
| Head/neck | A torso parent with neck turn/shape correction, head tilt rotation, head XY warp and local feature children | Skull, sockets, beak root and neck remain coordinated; collar stays attached to torso |
| Bird jaw | Upper/lower beak surfaces, covered hinge region, dark mouth interior; local jaw rotation plus perspective correction under head orientation | Closed/half/open at side, intermediate and front; no sliding beak root or rubber silhouette |
| Eyelids | Socket/cover feather and lids, with iris/highlight clipped to the intended aperture | Full closure contains no surviving eye highlight; iris is not merely flattened; far eye stays properly occluded |
| Neck/collar | Continuous underpaint, rear neck, local front feather overlap and stable collar/lapels | No transparent gap, doubled feather edge or block-shaped patch as the neck turns |
| Jewelry/feathers | Rigid badge/watch forms; articulated chain or small feather-tip outputs only if useful | Metal retains shape; secondary motion follows and settles instead of stretching with breath |

This is a dependency sketch, not a universal hierarchy. Inspect the existing model before reparenting. Use Parts for organization and deformers for motion. Add cross-keyforms where independent jaw/eye/head channels do not compose correctly. Automatic corner generation can seed shapes; correct them manually. The official automatic facial-motion function is limited to front-facing faces and is not evidence of a good nonhuman or three-quarter rig.

For resting arms, joint proportions or hand-to-face gestures, use [arm anatomy](arm-anatomy.md). Its focused checks separate articulation, shape and acting without loading an unrelated full-face workflow.

## Diagnose visible joins before hiding them

| Symptom | Candidate cause | Appropriate check/repair |
|---|---|---|
| Background appears between pieces | Missing underpaint, insufficient overlap, mesh separation | Inspect alpha and isolated layers; extend hidden artwork, correct parents/keys; Glue only truly shared seam vertices |
| Opaque rectangular patch or abrupt feather change | Mismatched lighting/texture, poorly registered replacement or cut boundary | Compare source mappings and neutral/intermediate poses; repaint/align the local source; opacity cannot restore texture continuity |
| Double eyes, beaks or feather outlines mid-turn | Two pose layers visible together, wrong occlusion | Inspect draw order, aperture masks and local visibility at intermediate X; replace whole-head crossfade with coherent geometry/occlusion |
| Bright/dark outline appears mainly on another background | Matte RGB, alpha fringe or atlas sampling | Compare black/white/checker and actual export; inspect atlas padding and anti-bleed export settings |
| Rigid part bends or joint drifts | Incorrect pivot/parent, broad warp or stretched mesh | Repair hierarchy and local keyforms rather than lowering every motion amplitude |

These are hypotheses until reproduced. Glue joins vertices; it does not paint missing feathers or fix mismatched texture. Local opacity can represent legitimate occlusion, but two individually attractive poses do not establish a sound intermediate pose.

## Smallest useful authoring sequence

Preserve validated primitives and prioritize the user's largest missing behavior. A new head rig starts with a sound neutral, independent blink/jaw and only the turn range actually needed. A character whose head already works but body is frozen can start with a visible chest-breath study, then attention and articulated gestures. A full frontal turn is not a prerequisite for a three-quarter performance. Author one short expressive study before expanding to every application state; include a natural return and a partial-entry cancellation where the application may interrupt it.

Check continuity during forward/reverse sweeps and natural entry/exit, at full and installation size. Use closed/half/open eye/jaw samples at the turns that stress the model; expand to a full grid when coverage warrants it, not as a universal 81-pose gate. Check structural integrity and performance legibility separately: a motionless model can pass the former and fail the latter.

Then integrate the application's actual motion/expression/voice policy. Use [performance ownership](performance-ownership.md) and [perceptual QA](perceptual-qa.md). Preserve closed-mouth silence and uninterrupted blink closure. Keep live output speech out of state-motion curves. Parameter-controller preview, reference video, edited CMO, exported MOC and actual application playback are distinct evidence levels.

Record each demonstrated failure with pose/time, affected area, suspected cause, minimal change and fresh result. Add only recurring decision lessons to the skill; keep this character's parameter tuning, screenshots and unresolved aesthetic decisions in its job outputs. Never promote a proposal to a proven recipe because static validation passes.

## Official source basis

Page bodies reviewed 2026-09-17; embedded videos were not fully watched in this survey.

- [Material separation](https://docs.live2d.com/en/cubism-editor-manual/divide-the-material/): separated editable source and hidden-area additions.
- [XY keyforms](https://docs.live2d.com/en/cubism-editor-manual/keyform-xydirection/): interacting parameter forms and corner coverage.
- [Rotation deformers](https://docs.live2d.com/en/cubism-editor-manual/making-and-rotation-of-rotationdeformer/): parents, pivot and standard angle.
- [Clipping masks](https://docs.live2d.com/en/cubism-editor-manual/clipping-mask/), [Glue](https://docs.live2d.com/en/cubism-editor-manual/glue/): different mechanisms for aperture/occlusion and shared seams.
- [Automatic facial motion](https://docs.live2d.com/en/cubism-editor-manual/face-auto-edit/): semi-automatic, front-facing limitation.
- [Motion quality](https://docs.live2d.com/en/cubism-editor-tutorials/motion-hint/), [Graph Editor](https://docs.live2d.com/en/cubism-editor-manual/grapheditor/): coordinated timing, readable movement, holds and curve editing. Adapt the human-character examples to the user's character.
- [Expression mechanism](https://docs.live2d.com/en/cubism-sdk-manual/expression/): Add/Multiply/Overwrite and order of application.
- [Embedded export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/): native outputs and texture anti-bleed precautions.
