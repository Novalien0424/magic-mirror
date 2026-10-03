# Fragile Photopea and Cubism operations

These are observed failure modes, not proof that an old helper works on today's document.

Read only the section needed for the operation.

## Visible seams

At the failing pose, isolate the suspected surface and compare source alpha/texture, mesh coverage, mask and draw order. Stop expanding diagnosis once the owner and mechanism are clear. A straight cut drawn over other feathers is an opaque texture seam even without a gap. Cut the visible fringe along intact feather tips and extend matching hidden artwork underneath; avoid tightly abutting contours. Meshes need margin around alpha detail, not a vertex on every barb. Preserve backfill/collar relationships. Whole-head reordering, blur or reduced motion cannot repair missing/mismatched art.

## Native repair loop

Establish the document, object ID, parameter key and unsaved state; save a recoverable CMO revision before repair. Within current tool policy, batch deterministic inputs on a stable surface and inspect after a meaningful edit or uncertain result, rather than every keystroke. Reobserve after focus, modal or selection changes; export may open Explorer over Cubism. Use the documented Computer Use API and reuse it while unchanged. In file dialogs, focus the filename field and confirm the path before submitting.

Restore temporary visibility/opacity diagnostics before export. Save the edited CMO, export through the Editor to a new runtime directory, then save any export-setting changes and hash the final files. Retain the raw exported model3 separately before restoring the accepted motion/expression mappings. Do not copy an old MOC into a new version or package a pre-final CMO hash.

## Photopea

`Layer.duplicate()` may return undefined and may not activate the duplicate. Find/select the new named layer explicitly before clear/move/rename. Check alpha bounds, opacity, isolated checkerboard and composite; save/reopen meaningful revisions. A valid PSD parser result or nonempty bounding box does not prove distinct usable parts. Compare upper/lower beak and paired-eye pixel content; opacity-zero content is different from separated movable art.

In the installed PWA, File → Script with `d.saveAs(new File(...), new PhotoshopSaveOptions())` has produced PSD/PNG downloads, sometimes ZIP, while a native picker remained open. Inspect actual downloads before asking to repeat a successful save. Keep source/review/output versions. F5/Shift+F5 may both reload the PWA; preserve unsaved work. Use Edit → Fill rather than assuming Shift+F5 invokes Fill.

In a Cubism 5.3.04 document, a disabled Photopea raster mask still affected reimport. A separate PSD with the mask removed restored the outline. Retain both sources, reimport actual files and compare contours/alpha/atlas/display size. Do not generalize one version's mask behavior to all versions.

## Numeric values, selection and copy forms

- Ctrl+A before entering signed values; double-click can omit the minus sign. Press Return to commit, then read back exact value and editable keyform state. A slider can land on interpolation rather than the intended key.
- Copy Form uses Editor copied-form state that text automation/clipboard use may overwrite. Recopy neutral per axis/object, set endpoint and Apply Rate, commit, Apply and inspect. Do not share unverified forms across X/Y/Z or ArtMeshes.
- Keep beak/jaw pivots coordinated through a shared parent before local jaw edits; inspect Y/Z junction holes.
- Shift+Down after selecting an ArtMesh can move canvas art rather than extend tree selection. Undo wrong movement immediately and verify.
- For batch child edits, use the observed Part context menu, Manage Child Objects → Select All, and verify the exact selected IDs/count before Multiple Keys Editing. Ctrl+Alt+D selected unrelated eye/root children in one V14 document; do not assume that shortcut means the intended Part's children. Check all endpoints afterward.
- Parent-only copy may produce an empty deformer. Copy the intended children and reparent, or use Select including children/root Alt+click. Reparenting may preserve world pose; verify masks and copied IDs rather than assuming hierarchy survived.
- Parameter popup arrows are hover controls; clicking may execute Select and add the original eye to selection. For L→R remapping, retain copied-eye-only selection and use Change directly. Verify selection before/after and Verify Mapped Parameters for both eyes. Mapping success still needs actual Core render.

## Deformers and atlas

When adding articulated limbs to a mature model, separate new-part import from replacement of existing artwork. In Cubism 5.3.04, a full replacement PSD with old and new layers produced incorrect source associations despite plausible names. Import the new layers with Add all layers as new ArtMeshes; explicitly assign a replacement source to the intended existing ArtMesh. Verify source association, new drawable count and composite before rebuilding the atlas. Keep the former CMO checkpoint until the resulting MOC has been rendered.

Confirm the ArtMesh's active source in the Project palette; similarly named files or earlier reference renders may differ. Preserve PSD canvas and pixel registration. For a local feather fringe, duplicate the relevant mesh/keyforms and parent relationship, register the new PSD without adding ArtMeshes, create an independent Model Image, then use Set as input image for selected ArtMeshes on the duplicate. Source-layer replacement can alter a shared Model Image and affect the original. Verify the selected IDs, associations and composite. Apply intended layering across all affected keyforms, not only the current pose. Keep backfill and original sources until the replacement is verified.

Inspect clipping IDs even when the mask drawable has opacity zero: it can still affect clipped ArtMeshes. A front-only reverse mask may cut a three-quarter face if its parent remains active. Isolate the mask and affected art, change only the demonstrated faulty relationship, and recheck open-mouth/head combinations before retaining the change.

For gaze amplitude across existing Head×Gaze keys, an iris-only parent Warp with Consider child keyforms can help. Preserve socket clipping; bind only gaze axes, author axial keys, then synthesize selected corners. Moving the socket with the iris does not increase relative gaze. In the observed Editor, drag the Warp's red bounding-box center and verify all edges translated.

Opacity-zero mask handles can select art behind them. If needed, temporarily make the exact key visible, commit and verify ID, edit, then restore opacity zero and commit; never export diagnostic opacity as final.

Bake nested Rotation/Warp from inner child outward, checking neutral, intermediate values and both extremes after each stage. Parent-first baking caused beak/jaw misalignment at intermediate X despite valid neutral. Save checkpoints.

For a local addition, place only its new image in available atlas space or a new page; avoid repacking unrelated art. Auto-arrange may affect only placed/selected items. In Cubism 5.3.04, double-clicking an intended Unset Textures Only thumbnail placed it. Verify its association and full mesh coverage, including transparent margins. Historical unused images may legitimately remain unplaced. Inspect detail at full size; fine seams can vanish when reduced.

For arm form/trajectory decisions use [arm anatomy](arm-anatomy.md). Two operational traps recur: hiding a forearm behind the torso can leave a floating hand mid-gesture; old wrist keys can be wrong after an endpoint changes. A replacement PSD with a different canvas width may need a common translation of the imported arm parts. Derive it from current body anchors; the registration-body layer is a guide, not duplicate runtime artwork.

For native animation evidence, create/rebind a real track from the current CMO, extend both the scene and model track through the final frame, and verify the work area before export. A long scene with a short model track produces disappearing artwork. Preserve diagnostic blink curves separately from production motions, and refresh the animation's model material after CMO repairs before claiming the video represents the final export.

## Motion segment integrity

The first motion curve point is `[time,value]`; later segment encoding depends on segment type. For linear/step segments it is `[type,time,value]`, with no trailing type after the final endpoint. Cubic Bezier has additional control points, so do not apply a linear-only length formula universally. Validate actual segment types and Meta point/segment counts with the current parser.

Never fabricate CMO/MOC or substitute CSV/API metadata for real ArtMesh/deformer/keyform authoring. Template/form/3D-rotation helpers require compatible topology and current Editor state. Verify the actual export in Core; layer names are not completion evidence.
