# Eyes and mouth

Use the current selection, values, lock state and editing mode. Save a checkpoint, lock unrelated Parts and enable Lock Default Forms. Green keys show a selected object's shapes, not the parameter default. Do not copy tutorial mesh density or nonstandard defaults into another portrait.

## Mesh and blink

Follow thin eyelash/lip contours with suitable vertices and avoid narrow twisted triangles. Include cover skin in the mesh or a correctly ordered separate ArtMesh. Commit stroke/path operations, connect the mesh and exit Mesh Edit. Large whites/irises/interiors can use inspected auto meshes. Topology changes after keys require a copy and rechecking affected shapes.

Complete one eye before the other. Key `ParamEyeLOpen` at 0/1; add 0.5 only if interpolation needs it. Shape the eyelash/eyelid into a connected closed contour. Shrink the eye-white mask behind that contour; do not simply squash the iris. Clip iris/highlight to the white's ID and inspect for colored slivers and disappearing highlights.

Test the continuous 0→1 path and eye-open 0/0.5/1 against gaze's four axes and corners. Then author the other visible eye, retaining intentional asymmetry. A three-quarter design can intentionally expose only one eye; do not invent another visible eye for symmetry. Model-preview EyeBlink settings and Animation track blinking are different UI paths. Export EyeBlink IDs for the driven eyes and inspect the actual result.

### Diagnose disappearing lids

Compare drawable vertices, opacity, draw order and clipping at open, half and closed. An opaque closed-eye patch fading over an unchanged iris produces a dissolve; stable alpha coverage alone does not prove a blink. Inspect an enlarged eye through closure and reopening before adjusting timing.

For a suitable painted closed-eye underlay, keep it opaque beneath the iris and let a shrinking aperture mask reveal it. An aperture-only parent Warp can add EyeOpen keys without multiplying existing socket Head/Smile keyforms. Keep iris geometry stable, match the closure contour to the painting and prevent the mask backing from covering the revealed lid. Derive order, contour and key positions from this model; do not reuse another model's numeric values. Check that the fully closed mask leaves no colored/highlight sliver, including during smile and head movement. Add a corrective intermediate key only when the rendered interpolation needs one.

A supplied closed-eye frame can guide the contour without proving separate upper/lower lid layers. Compare closure and reopening at near-closed values in the important body/head/contact poses. Check draw-order and opacity changes over all affected keys. A mask ArtMesh in a hidden Part can release clipping; 0% ArtMesh opacity and a hidden Part are not interchangeable. If a transparent mask is needed, verify its actual export and renderer behavior rather than hiding its Part. See [Clipping Mask](https://docs.live2d.com/en/cubism-editor-manual/clipping-mask/) and [Multiple Keys Editing](https://docs.live2d.com/en/cubism-editor-manual/multi-key/).

## Mouth grid

Choose anatomy before the grid. The following lip/vowel examples apply to humanoid mouths. For a bird, begin with closed/half/open beak, hinge/interior coverage and head-turn combinations; do not create lips, teeth or vowel forms absent from the character design. See [acting and rig foundations](acting-rig-foundations.md).

Separate upper/lower lips with cover skin, interior and intended teeth/tongue; clip teeth/tongue to the interior. Match lip contour topology for closure. Inspect existing value directions before extending a rig.

Typical authoring grid: MouthForm -1/0/+1 × OpenY 0/0.5/1. Closed forms are pursed/neutral/smile; half-open examples resemble U/E/I; full-open examples resemble O/A/wide A. These are artistic references, not a universal phoneme mapping.

Author all three closed forms without teeth/interior leakage, then neutral open and remaining shapes. Move teeth/tongue plausibly rather than stretching them with lips. Inspect rows, columns and diagonal interpolation without selection overlays; check closed-to-half lip ghosts and mouth-corner tears. Small jaw follow may help, but do not scale the entire lower face with each syllable. Combine with Head XY and expressions.

## Audio paths

- Editor WAV lip-sync/bake produces offline curves for a separate fixed motion.
- Motion-sync requires its own analysis/settings and compatible SDK integration; a mouth grid does not implement it.
- Magic Mirror's output RMS/envelope drives OpenY; verify the loaded performance profile and current code. The generic path historically uses a 0.8 blend, while `raven-calm-v1` uses full replacement after effects. Upstream motions/expressions must not retain mouth-open values. Where supported, MouthForm remains expression-controlled. RMS does not classify A/I/U/E/O.

For explicitly requested Editor Motion-sync experiments, add actual IDs, map Silence/vowels, use Apply to store and Confirm to read back. Red IDs/ranges are ignored and must be corrected. For unreadable audio, a supported 16-bit/44.1 kHz WAV is a useful diagnostic; stereo conversion/low levels may affect results. Record threshold, smoothing and blending separately from presets. Its analysis sample rate is not WAV sample frequency. Save `.cmo3` and `.motionsync3.json`; label product integration unimplemented unless actually done.

Finish with independent blink, mouth closure, gaze extremes, Head XY combinations, valid masks/parents and Viewer/SDK inspection. Preserve failed poses and actual screenshots; tutorial viewing is not production evidence. Sources: [mouth tutorial](https://docs.live2d.com/en/cubism-editor-tutorials/mouth-aiueo/), [Motion-sync](https://docs.live2d.com/en/cubism-editor-manual/motion-sync/), [lip-sync](https://docs.live2d.com/en/cubism-sdk-manual/lipsync/).
