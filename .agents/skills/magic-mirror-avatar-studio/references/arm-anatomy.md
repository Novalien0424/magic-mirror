# Arm anatomy and gesture repair

Use for humanlike arms on stylized characters. Preserve hand design and separate observed defects from hypotheses; no universal human proportion template applies.

## First decision

Compare rest, a useful intermediate and contact at the accepted reference's torso scale. Mark shoulder socket, elbow center and wrist/cuff; label hidden landmarks as estimates. Sleeve folds are not joint centers. For new segmented art, first match the assembled neutral to the complete reference. Repaint only an absent/wrong surface, finger pose or overlap.

| Look for | Decision |
|---|---|
| Extra elbow tip, flap or cuff-like lobe at contact | Isolate upper sleeve, forearm and support hand before changing proportions; the visible endpoint may belong to the wrong overlapping piece |
| Arm appears attached to chest; elbow moves at a sleeve cut | Inspect actual mesh parents and pivots before repainting |
| Elbow collapses, sleeve looks flat or palm never turns | Inspect local shape/perspective forms, not only rotation angles |
| Hand reaches contact only after enlarging the forearm | Recheck all joint landmarks, proportions, hand pose and perspective together |
| Endpoints look good but intermediate crosses the torso awkwardly | Correct the joint path and intermediate forms before changing timing |
| Shapes hold during a scrub but playback feels mechanical | Adjust coordination, acceleration and holds |

Isolate an ambiguous junction by temporarily hiding one candidate ArtMesh, observing the disappearing contour, then restoring visibility. Check its parent, keyform and order. A protruding sleeve endpoint may need a local tuck behind the forearm while preserving volume/cuff/support contact. Change length or pivots only with landmark evidence. Diagnostic hiding is not the repair.

## Authoring mechanics

- Separate upper arm, forearm and hand meshes; shoulder → elbow → wrist Rotation parents are useful. Verify actual parents; Parts only organize. Isolate joints, then coordinate them. Separate runtime parameters are optional.
- Elbow bending, forearm rotation and wrist bending differ. Palm turns need shape/perspective and sometimes new surfaces; rotating a flat hand cannot reveal its other side or curl fingers.
- Use Rotation for articulation and local ArtMesh/Warp forms for axilla, elbow volume, cuff and shortening. Large vertex-only rotations can shrink intermediates. Keep the wrist anchor attached after sleeve edits; a sibling Warp does not move it automatically.
- Rotation Scale also scales descendants. Do not enlarge the forearm merely to reach the face. Perspective changes projected lengths; equal screen lengths, constant scale and numeric angle limits do not prove anatomy.
- Preserve hidden coverage and front/back order. Glue cannot paint cloth or fix a joint. Check support palm against elbow and thinking fingers against chin.

## Smallest useful check

Start with rest, useful lift samples and contact, then a slow forward/reverse sweep and normal-speed return. Fix the failing interval before expanding. Inspect:

1. Shoulder–elbow–wrist location and plausible trajectory.
2. Segment proportions and explained perspective changes.
3. Elbow/axilla cloth volume and cuff attachment.
4. Palm facing, finger pose and support/contact relationship.
5. Overlap, alpha continuity and readable acting at display size.

Record frame/parameter and observation. Compare same-coordinate before/after crops and full silhouette; preserve accepted rest. Recheck breath/eyes/mouth only where contact, shared parents or masks create an interaction. No unrelated facial suite. Export after native forms pass, then use [runtime QA](runtime-qa-harness.md) for the affected path.

## Source basis

Page bodies reviewed 2026-09-18; these principles do not certify an authored model:

- [Live2D hierarchy](https://docs.live2d.com/en/cubism-editor-manual/combintion-of-parent-child-relation/) and [rotation](https://docs.live2d.com/en/cubism-editor-manual/making-and-rotation-of-rotationdeformer/): articulation, shape correction, scale and standard angle.
- [Live2D interpolation](https://docs.live2d.com/en/cubism-editor-manual/deformer/) and [arm tutorial](https://docs.live2d.com/en/cubism-editor-tutorials/deformer/): intermediate shrinkage and raised-arm thickness correction.
- [OpenStax movement anatomy](https://openstax.org/books/anatomy-and-physiology-2e/pages/9-5-types-of-body-movements): distinguishes shoulder rotation, elbow bending, forearm rotation and wrist movement.
