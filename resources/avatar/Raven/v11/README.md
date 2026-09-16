# Raven V11 — restrained performance candidate

This version changes performance and playback ownership, retaining V10's MOC,
texture atlas and Layout byte-for-byte. It is not a new native Cubism rig.
Generated A3/A4 eyelid and A1/A2 beak references are visual targets, not baked
textures. New artwork requires the original layered PSD/CMO and Editor export.

## Acting plan (before implementation)

| State | Intent | Motion / ending |
| --- | --- | --- |
| Dormant | Rest, eyes and beak closed | 16 s loop; tiny breath, no scanning or nodding |
| Waking | Quietly become attentive | 2.4 s eye opening with <1 unit head adjustment; hold endpoint |
| Listening | Patient, stable attention | 14 s loop with pauses, modest glance; automatic blink |
| Thinking | One restrained look aside | 18 s loop with long holds; no repetitive nod |
| Speaking | Speech is primary | 11 s restrained emphasis; beak follows processed output audio |
| Scene | A single modest acknowledgement | 4 s gesture then hold neutral; explicit actions remain one-shots |
| Suspending | Settle and close eyes | 2.8 s, endpoint equals Dormant start; hold closed |
| OfflineLoop | Existing independent media | No stale motion or mouth ownership |

The numeric angles are rig parameter units, not physical viewing degrees.
All changes stay close to the original three-quarter portrait. Large-angle
rotation, feather stretch and eyelid/beak topology are not repairable with
motion JSON alone.

## Runtime contract

`runtime/raven-lord.model3.json` opts into `MagicMirror` version 1,
`Performance: raven-calm-v1`. This requires the renderer changes in this branch.
It survives the normal importer because the original manifest is copied.
No filename or imported UUID selects behavior. Existing models retain their
previous behavior. Import as a separate Console draft; do not replace V10 or
silently select it in the live Mirror.

The profile disables generic breath and physics, which otherwise rewrite
already-authored head/body/breath. Motion owns those parameters and transitional
eyelids; automatic blink owns active-state eyelids. Expressions are face-only.
Audio owns mouth opening after effects; silence and interruption must close it.
Console preview uses its selected motion group, not its hidden Dormant lifecycle,
to decide effect ownership. Manual parameter sliders have final authority.

## Reproduction and acceptance

Run `node scripts/generate-raven-v11.mjs` to regenerate JSON and copy the exact
V10 MOC/atlas. Inspect `AUDIT.md` for actual evidence and remaining gates.
This candidate is not artistically accepted until inspected in the canonical
Windows app at installation size, including interrupted transitions, preview,
blink, audio onset/offset and prolonged rest. Browser-only evidence is separate.
