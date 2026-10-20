# Modeling and repair

Keep an import PSD separate from the editable separation source. After import, verify source-layer/Model Guide Image/ArtMesh mappings and save a `.cmo3` checkpoint. Fix incorrect source mappings in the Project palette, not with compensating deformation.

## Topology and hierarchy

Finish meshes before substantial keyform authoring. Manually inspect face, eyelash and lip contours; auto meshes for large parts still need checks for dust, open triangles, isolated vertices and atlas overlaps. Re-running automatic mesh generation after keyforms can alter/reset shapes. Before reimport or topology changes, save a version; afterward compare neutral and all affected keys, source mappings and deformers before continuing physics.

Keep PSD names, hierarchy and order stable. Replacing an image and adding a new ArtMesh are distinct import operations. Reassign current sources/model-guide links before removing confirmed-unused old sources.

Parts organize visibility, locking and selection; deformers organize movement. Verify every ArtMesh parent in Inspector. Parent movement should carry children; child movement should not alter parents. Check pivot/Standard Angle and parent links before reshaping drifting parts.

Warp→Warp combines movement and reshaping; Rotation→Warp adds contour repair; Rotation→Rotation suits joints; Warp→Rotation can carry local rotation with breathing/shoulders. Validate protruding child vertices, enlarge/restructure a parent when necessary, and remove only verified-empty task-created deformers.

## Head XY and masks

Author neutral and min/max X/Y keys, then four axial directions before four corners. A 3×3 grid is a coverage check, not a universal deformation magnitude. Missing keyed coverage can make art disappear. Use hierarchy for coordinated perspective, with local warps for local features; avoid flattening the whole face.

Automatic corner synthesis can seed interpolation after axial shapes are ready. Confirm selected objects/parameters, neutral reference and overwrite targets; synthesize before hand-correcting corners so later automation does not erase those repairs.

Establish draw order, usually 0–1000 with higher values in front; equal values use Parts ordering. Use Draw Order Groups for local group ordering when needed. Clipped ArtMeshes reference mask IDs, comma-separated for multiple masks. Check borders, sampling, mask permutations and key coverage in Editor and target SDK. Opacity-zero masks differ from hidden/underdraw or unexported masks. Verify target support before reversed masks; unsupported features need a compatible alternative, not hidden warnings.

## Optional automation

Auto deformers assume centered upright front-facing humanoids. Inspect assignments first; use manual hierarchy for side views, nonhumans, crossed/raised arms or heavily stylized proportions. Auto facial motion requires separate existing face/eyes/irises/brows/ears/mouth/nose Parts; absent anatomical parts can be omitted.

Use Glue only for real shared seams: overlapping seam vertices, bind and inspect weights; unbind before mesh edits. Skinning suits long hair/rope/cloth with ordered rotations from root to tip; verify neutral return and repair mesh/control spacing before accepting jumps. Add Blend Shapes only after base mesh/deformers/default keys are stable; lock default forms and avoid conflicting simultaneous property edits.

Record checkpoints, source mappings, parent tree, parameter ranges, XY grid, masks and selected optional features. Recheck affected keys after topology/parent changes. Editor evidence is distinct from runtime acceptance.

Sources: [reimport](https://docs.live2d.com/en/cubism-editor-manual/psd-re-import/), [manual mesh](https://docs.live2d.com/en/cubism-editor-manual/mesh-edit-manual/), [hierarchy](https://docs.live2d.com/en/cubism-editor-manual/system-of-parent-child-relation/), [keyforms](https://docs.live2d.com/en/cubism-editor-manual/keyform-xydirection/), [clipping](https://docs.live2d.com/en/cubism-editor-manual/clipping-mask/), [corner synthesis](https://docs.live2d.com/en/cubism-editor-manual/synthesize-corners/), [auto deformer](https://docs.live2d.com/en/cubism-editor-manual/auto-generation-of-deformer/), [Blend Shape](https://docs.live2d.com/en/cubism-editor-manual/blend-shape/).
