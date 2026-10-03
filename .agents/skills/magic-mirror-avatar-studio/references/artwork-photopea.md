# Portrait preparation in Photopea

Prepare editable separation art and a distinct Cubism import PSD. A single portrait is source art, not a rig. Keep the original, repair copies, and stable canvas coordinates.

## Artwork suitability

Inspect the complete head, jaw, neck, shoulders and upper torso, with enough margin for turns and movement. Identify missing eye whites/irises, fused lips/teeth, repeated ears, broken hair edges or merged hands/accessories. Fix image defects before mesh work. Auto-deformer tools are most suitable for centered upright front-facing humanoids; side views, crossed arms and stylized/nonhuman subjects often need manual authoring.

Repaint hidden face beneath hair, eye whites beneath moving irises, mouth interior, skin around lips, neck behind the jaw and collar, and backs of moving hair/clothing/accessories. Extend the neck behind the jaw toward mouth height and into the collar. Match adjacent linework, skin, shadows and texture. Skin-colored cover art may avoid unnecessary mouth clipping; choose masks only when the style and deformation warrant them.

## Parts and PSD contract

Use the character's anatomical L/R, not the viewer's sides. Keep names unique, ASCII and stable across reimport. Typical independent parts include `Face_Base`, `Neck`, `Torso`, `EyeWhite_L/R`, `Iris_L/R`, `Lash_L/R`, `Brow_L/R`, `MouthUpper`, `MouthLower`, `MouthInside`, hair groups and accessories. Do not create artificial L/R names for unpaired parts.

Groups become Parts. Auto facial motion additionally needs separate left/right eye, iris, brow and ear Parts where those structures exist. Keep the original guide in the separation source, but remove it from the import copy: hidden PSD layers may still import.

In the import copy, apply masks, merge each moving part's line/fill/shadow/clipping/filter content to one pixel layer, remove unnecessary paths, and use RGB 8-bit sRGB with transparency. Do not flatten the whole portrait. Preserve original size and alignment when copying layers; compare against an overlay to catch centered pastes. Changed names/order/hierarchy require rechecking reimport mappings.

## Save and import

Use the installed Photopea App/PWA. Save as PSD, verify the resulting file and reopen it. If the picker fails, a supported File → Script save may work; inspect actual downloaded PSD/ZIP contents. A still-open dialog does not prove the export failed. Browser read-only evaluation is not a mutation route. See [reliability](reliability-photopea-cubism.md).

Before rigging, verify both the PSD structure and real Cubism import: correct target version, expected ArtMeshes, transparency, positions, source mappings, draw order and hidden-region coverage. A parser pass is insufficient. Preserve sources on failure; use manual repair or an authorized alternative editor if required.

## Image direction

For new art, request the user's chosen character with complete head/neck/shoulders, readable eyes and lips, separated hair, consistent linework and sufficient margins. Do not force a front view or symmetry onto an existing portrait.

For repairs: “Reconstruct only [missing region]. Preserve identity, proportions, exact canvas, face position, scale, camera angle, colors, lighting and line style. Return aligned art for placement beneath existing layers.” Inspect alignment and alpha afterward; negative prompts do not prove correctness.

Sources: [illustration processing](https://docs.live2d.com/en/cubism-editor-tutorials/psd/), [PSD import](https://docs.live2d.com/en/cubism-editor-manual/psd-import/), [PSD precautions](https://docs.live2d.com/en/cubism-editor-manual/precautions-for-psd-data/), [Photopea scripts](https://www.photopea.com/learn/scripts), [Photopea API](https://www.photopea.com/api/).
