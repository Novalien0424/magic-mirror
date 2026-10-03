# Perceptual avatar QA

Inspect the changed feature at diagnostic detail and intended display size. Select evidence for the failure risk; this is not a full-avatar checklist.

| Change | Useful evidence |
|---|---|
| Arm/rest/contact | [Arm anatomy](arm-anatomy.md): joint volume, trajectory, palm facing and contact at relevant intermediates |
| Feather/skin seam | Source contour and isolated layer at the failing pose; opaque texture continuity and hidden overlap during affected motion |
| Crop / framing | Intended aspect ratio and silhouette. In an agreed half-body crop, resting hands may be offscreen; keep gesture contact legible and the torso cutoff outside the frame. Prefer layout changes to extending unseen artwork. |
| Blink | Adjacent closure/reopening frames, especially near-closed; both lid contours, corners, iris/highlight coverage |
| Head turn | Used range: skull, socket, beak root and neck; no duplicate features or whole-head crossfade |
| Gaze | Used axes/corners; iris stays legible inside its aperture |
| Mouth/alpha | Relevant head poses/opening; black/white/checker backgrounds when transparency/fringing is at issue |
| Motion/expression | Entry, strongest action, hold, exit and relevant interruption/loop |

Do not force unrelated combinations. A neck seam starts with rest and the failing head/breath pose; add interactions only when they stress that join. A hidden eye remains unobserved, without requiring a new viewpoint.

Use adjacent time deltas and post-fade samples for playback. Sweeps and resets do not prove natural timing/return. Check writer order for combined behavior; a final manual EyeOpen override can hide broken composition.

Compare RGBA, not only alpha. Export identity establishes the inspected revision; unchanged MOC/texture cannot prove an art/geometry repair. Numeric differences locate defects but do not judge naturalness. Preserve feather tips; gap-free layers may still have a straight texture cut.

Record relevant file/frame, pose/time, finding and uncertainty; preserve failed samples. Distinguish Editor, export, application display and user acceptance. Report agent verification without inventing user approval or waiting for another one unnecessarily.

Keep CMO, atlas, MOC, CDI and physics paired, preserving model3 mappings. Stop after affected export checks and requested display pass. Expand only for failures or changed shared parents, masks or timing.
