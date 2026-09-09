# Raven — project-owned master

As of 2026-09-09, **v10** is the current project-owned Raven delivery.
Use [v10/runtime/raven-lord.model3.json](v10/runtime/raven-lord.model3.json)
in Console → Live2D Cubism → Browse/import. Keep its entire runtime directory.
It has 17 files, seven motion groups and five expressions.

## Ownership and editing

- `v10/runtime/`: authoritative exported master for this version. Imports copy
  these bytes into Electron user data; they do not move or edit this master.
- [v10/cubism/raven-lord-v09.cmo3](v10/cubism/raven-lord-v09.cmo3): canonical
  editable rig. The v09 filename is intentional: v10 changed expression JSON,
  not the rig. Do not substitute `qa/editor-session-preserved.cmo3`.
- `v10/source/`: PSDs and source artwork; `v10/qa/`, `docs/`, `qa-scripts/`
  and `skill-update-snapshot/`: preserved delivery evidence and tooling.
- [v10/MANIFEST-SHA256.json](v10/MANIFEST-SHA256.json): original inventory for
  250 files (excluding itself). All 251 copied files were verified against the
  original. Keep v10 intact; author the next change as a new version.

The original Codex output is retained as a secondary local copy, not the
canonical import path. Historical documents inside v10 retain their original
absolute links; prefer this index for current assets. Do not rewrite the
archived delivery and invalidate its inventory just to update those links.

## Runtime and packaging

The existing imported v10 remains at
`%APPDATA%/magic-mirror/assets/avatars/model-d5fef684-d4c0-4140-afdf-72f149076b95/`.
All 17 files match this master. There is no need to reimport it merely because
the master moved. A future import receives a new ID; do not modify managed
files manually. Preview loading does not publish Appearance or switch Mirror.

This directory is a source archive, **not an additional bundled default**.
`prepare-avatar-assets.mjs` still copies only Ren into generated build assets.
No import, publication, rendering, model mapping or packaging behavior changed.
Future imports from elsewhere still use AppData; project archiving is an
explicit delivery step, not a new automatic importer side effect.

## Git and backup policy

The 17-file runtime (~3.5 MiB), original README and checksum inventory are
eligible for normal Git tracking, together with this index. The larger CMO,
PSD/source, QA and supporting archive directories are explicitly ignored by
the root `.gitignore` and delivered out-of-band. No LFS/dependency or remote
upload was introduced. **Nothing was committed or pushed by this task.**

A clone alone will not contain the ignored editable archive. Back up the whole
`Raven/v10` directory separately when transporting/restoring editable sources,
then verify the inventory. The second local copy is not an off-machine backup.
For the original location and verification evidence, see the
[storage handoff](../../../docs/testing/avatar-storage-2026-09-09.md).

Latest model limits and next renderer work remain in the
[v10 handoff](../../../RAVEN-V10-EXPRESSION-FIX-HANDOFF.md).
Earlier v7/v8 retention is indexed in
[RAVEN-AVATAR-VERSIONS.md](../../../RAVEN-AVATAR-VERSIONS.md); this migration
did not move or delete those versions.
