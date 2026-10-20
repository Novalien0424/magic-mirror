# From pose guides to Cubism authoring

Use to assess supplied/generated stills or video and translate them into editable artwork and keyforms. Preparation-only work stops at the coverage finding and next bounded experiment.

## Coverage before more images

For each requested action, identify the source/frame, neutral, useful intermediate, contact/extreme, release, exposed surfaces and intended Editor operation. Add interruption or eye/jaw combinations only where relevant. Distinguish reference coverage, production-art readiness and actual rig validation; a fixed image count proves none of these.

| Action | What the reference must clarify | Editor consequence |
|---|---|---|
| Breath | Chest movement against an anchored waist; head response | Local chest/shoulder shape with restrained head follow |
| Attention | Readable perk, tilt, down/up nod and settle | Head/neck articulation, body follow and timing |
| Hand-to-face | Shoulder/elbow/wrist, palm facing, contact and withdrawal | Independent limb pieces, hidden overlap, contact correction |
| Blink | Both lid boundaries and corners through close/reopen | Aperture/lid forms, clipped iris and relevant stressed poses |
| Speech | Closed/half/open rigid beak and nearby hand clearance | Hinge/interior art and coordinated jaw motion |

A return drawing suggests trajectory; it cannot prove interpolation. Generate only a missing pose/surface that changes the authoring decision. A beautiful whole pose is not registered production layers.

## Neutral first, then articulation

Choose one identity/texture master and explicit neutral. Assemble all separated pieces in Cubism and match that complete reference before adding motion. Keep body scale, shoulder/elbow/wrist proportions, costume landmarks and hand design. If a bent sleeve leaves an elbow-cap fold in rest, repair that piece rather than deforming the entire arm to hide it. Restore the neutral match before proceeding. Use [arm anatomy](arm-anatomy.md) for joint and contact diagnosis.

Extend surfaces exposed by motion: neck, shoulder/axilla, elbow, cuff and torso. A flattened contact image cannot supply hidden artwork. Generate/repaint only demonstrated gaps; verify requested finger count in the actual image. Keep untouched sources and label design alternatives instead of silently changing anatomy.

## Register the relevant region

Give each guide a purpose: identity, pose, lid contour, jaw shape, contact or occlusion. Preserve camera, side, texture and costume in generation. Register head landmarks separately from collar/shoulder/waist when needed; zoom or camera translation is not head articulation. Multi-panel sheets usually need separate single-pose overlays. Lock aligned guides and record registration choices.

For video, retain dimensions, frame rate, timestamp and frame index. Sample turns coarsely, then adjacent frames around blink closure/reopening or a demonstrated defect. Label unviewed intervals. AI video supplies visual design, not calibrated angles, fixed-camera geometry, biological timing or hidden topology. Do not turn unregistered video frames into atlas layers or crossfade whole heads to imitate rotation.

## Cubism's three guide concepts

- **External guide PNG/JPG:** insert into Modeling, select Guide Image, align/adjust opacity and lock its Part. It supplies no automatic rig or keyforms. [Placement](https://docs.live2d.com/en/cubism-editor-manual/sketch/)
- **Guide Image Part:** holds reference/snapshot objects. Keep production meshes outside it and guide export disabled. [Guide parts](https://docs.live2d.com/en/cubism-editor-manual/edit-parts-sketch/)
- **Model Guide Image:** per-layer flattened image data associated with ArtMeshes after PSD import, distinct from external overlays and the source-image hierarchy. Verify these mappings on reimport. [Image structures](https://docs.live2d.com/en/cubism-editor-manual/original-picture/)

## Authoring, when authorized

1. Prepare stable separated layers and hidden coverage in an editable PSD. [Material separation](https://docs.live2d.com/en/cubism-editor-manual/divide-the-material/)
2. Add/replace only intended parts in the selected model. Verify source mappings, bounds and mesh coverage; preserve existing keys and avoid unrelated automatic remeshing. [Reimport](https://docs.live2d.com/en/cubism-editor-manual/psd-re-import/)
3. Use rotation parents for rigid articulation and local warps for soft shape. Parts organize; deformers move. Shoulder → elbow → wrist is one useful hierarchy, not a universal template. [Hierarchy](https://docs.live2d.com/en/cubism-editor-manual/combintion-of-parent-child-relation/)
4. Author actual parameter keyforms and needed corrective combinations. Linked grids and automatic corners do not solve the forms. [XY keys](https://docs.live2d.com/en/cubism-editor-manual/keyform-xydirection/)
5. Coordinate hand contact, overlap and front/back order. Ordering reveals a surface; it cannot fix joint anatomy or paint missing pixels. [Draw order](https://docs.live2d.com/en/cubism-editor-manual/draworder/)
6. Shape timed entry/hold/release and lead/follow. Native animation and runtime motion files are distinct editable outputs; neither alone proves app interruption behavior. [Graph Editor](https://docs.live2d.com/en/cubism-editor-manual/grapheditor/)
7. Exclude guides, retain needed mask/hidden art, export for the supported target and inspect the genuine result. [Embedded export](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)

These are documented capabilities, not evidence that a particular operation ran. Keep proposals distinct from Editor/export observations. A three-quarter avatar needs no full frontal turn unless the requested performance requires it. Preserve accepted primitives; store character-specific tuning and acceptance history in the job.
