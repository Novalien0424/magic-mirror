# Raven — project-owned master

The new [V11 performance candidate](v11/README.md) (2026-09-16) adds restrained
state motions and requires the matching renderer changes. It retains V10's MOC
and artwork and is **not yet visually accepted**; see its [audit](v11/AUDIT.md).

As of 2026-09-09, **v10** is the preceding project-owned Raven delivery.
Use [v10/runtime/raven-lord.model3.json](v10/runtime/raven-lord.model3.json)
in Console → Live2D Cubism → Browse/import. Keep its entire runtime directory.
It has 17 files, seven motion groups and five expressions.

## Ownership and editing

- `v10/runtime/`: authoritative exported master for this version. Imports copy
  these bytes into Electron user data; they do not move or edit this master.
- [v10/cubism/raven-lord-v09.cmo3](v10/cubism/raven-lord-v09.cmo3): canonical
  editable rig. The v09 filename is intentional: v10 changed expression JSON,
  not the rig. Do not substitute `qa/editor-session-preserved.cmo3`.
- `v10/source/`: PSDs and source artwork; `v10/qa/`, `v10/docs/`, `v10/qa-scripts/`
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

As of the 2026-10-03 Mac mini migration, the complete 251-file V10 archive
(445,921,244 bytes), V11 runtime and supporting files are tracked in normal
Git. A clone includes the canonical editable CMO, layered PSDs, source artwork,
QA evidence and tooling. Git LFS is not required. The V10 `.gitattributes`
rule preserves the original bytes, including historical documents.

Verify the archive against `v10/MANIFEST-SHA256.json` after checkout. The
[migration handoff](../../../docs/development/mac-mini-migration.md) includes
a portable checksum command and the repository skill locations. Earlier
out-of-band instructions in the immutable V10 archive and the
[original storage handoff](../../../docs/testing/avatar-storage-2026-09-09.md)
describe the 2026-09-09 delivery, not the current Git policy.

Latest model limits and next renderer work remain in the
[v10 handoff](../../../RAVEN-V10-EXPRESSION-FIX-HANDOFF.md).
Earlier v7/v8 retention is indexed in
[RAVEN-AVATAR-VERSIONS.md](../../../RAVEN-AVATAR-VERSIONS.md); this migration
did not move or delete those versions.
