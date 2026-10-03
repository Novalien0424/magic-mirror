# Persistent avatar names and versions — Windows

## Contract

The model3 filename is not a release identifier. Every managed model can have
an explicit `avatar-label.json` sidecar: `{ "name": "Raven", "version": "v10" }`.
It is local library metadata, not Cubism FileReferences or a configuration
schema migration. No UUID, folder-path or Raven-specific inference is built in.

Console → Live2D Cubism → select an entry → edit **Name** and **Version** →
**Save library label**. Save before changing selection. Selector, Selected and
Loaded headings show the saved label and short ID; selecting is not loading.
An unknown version is explicitly shown as “version not set.” Built-in Ren
cannot be relabeled. Appearance's existing library refresh also receives saved
names; published avatar/persona settings are not rewritten.

Name is 1–60 characters without controls; version is empty or 1–16 ASCII
letters/digits/dots/hyphens/underscores/plus signs, beginning alphanumerically.
The Main-only IPC validates sender, exact payload keys and bounded ID. Atomic
write targets only the existing validated managed model. Symlink/junction
destinations and caller-supplied paths are rejected. No label text enters logs.

Missing sidecars retain legacy imports. Malformed labels produce a visible
warning and filename fallback; the valid rig remains available and its label
can be repaired. Import accepts an optional valid sidecar beside model3 and
copies it into the new managed entry. A future release can supply that file;
otherwise label the new import explicitly. Saving a managed label never edits
the project-owned immutable export or its checksum inventory.

## Implementation owners

- `src/shared/avatar-library.ts`: schema, bounds and name formatting.
- `src/main/avatar/model-import.ts`: sidecar read/import/atomic persistence.
- `src/main/ipc.ts`, `index.ts`, `src/shared/bridge.ts`, preload: Console-only API.
- `CubismStudio.tsx`: editable label, explicit selected/loaded identities.
- Existing isolated Cubism QA now saves labels and checks refresh persistence.

## Evidence

- RED: `npx vitest run tests/unit/avatar-model-import.test.ts` — exit 1,
  two new cases failed because saveAvatarModelLabel was absent.
- Focused import/IPC/Console tests — exit 0, **53 tests / 4 files**:
  `npx vitest run tests/unit/avatar-model-import.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts tests/unit/console-config-ui.test.ts`.
- `npm run typecheck` and `npm run build` — exit 0. Initial typecheck caught an
  unsupported ConsoleReason literal; it was replaced by the existing bounded
  runtime-action failure reason before the successful run.
- Normal Console showed Dormant, active v12, saved draft 64 changes and no
  unsaved-edit indicator before restart. No Save Draft/Publish was invoked.
- Initial source inventory check included a v8 non-runtime backup directory;
  it failed on that absent managed path. Corrected verification compares the
  manifest and every FileReferences entry, not unrelated authoring backups.

The fresh isolated run exited 0: **221 checks, 22 motion starts, 15 expressions,
6 captures** including label-save/refresh for managed Ren and project Raven v10.
[Evidence and build stamp](../../.artifacts/phase4-qa/2026-09-08T23-21-58-463Z/evidence.json).
Inspected saved labels, selected/loaded headings and rendered Ren/Raven captures.
Ren's initial/return capture hashes match.

Final review added a filename-collision regression: RED exit 1 showed a label
could overwrite a referenced file named `avatar-label.json`. Save/import now
reject that reserved-name collision, including case variants, before writing.
The four-file focused command then passed **54 tests**, exit 0. The isolated
221-check build predates only this guard; final typecheck/build and native QA
use the guarded code. Do not relabel its old build stamp as the final build.

## Native completion and operator state

Native Computer Use saved **Raven · v7 / v8 / v10** for the existing verified
entries. UIA set-value was unsupported (`CacheRequest 0x80070057`); refreshed
state, verified input selection and used ordinary typing instead. No product
workaround or direct metadata injection was used to claim UI success.

- Loaded v8 from its labeled entry; [ready neutral capture](../../.artifacts/avatar-library-labels/native/v8-loaded.png).
- Fully stopped/restarted the normal application after all labels were saved.
  Fresh-process selector retained all versions: [restart capture](../../.artifacts/avatar-library-labels/native/versions-after-restart.png).
- Selected/loaded v10 after restart: [ready neutral v10](../../.artifacts/avatar-library-labels/native/v10-loaded-after-restart.png).
- Normal built Electron remains running, Main **61564**, Console at Cubism
  selector with v10 loaded neutral; Mirror Dormant/published v12. Point-in-time
  observation, not a watchdog. Earlier Main 56424/65300 were stopped for this
  authorized restart/persistence check. No unsaved edits were discarded.
- Read back the three on-disk sidecars: `e7eaac2d` → v7, `c4d3cf1b` → v8,
  `49076b95` → v10; these are evidence IDs, not application mappings.

Final guarded build: source
`879e261e3e7cddae718ec93580ed9449c338c79ae9e46ed8dcdf90d60239cb8f`, output
`b918365ec7b842ff8e22856e5e6055408943e61fd315e56a7d1e994752b7bad0`, built at
2026-09-08T23:26:48.738Z. Final typechecks/build exit 0.

Before/after configuration SHA-256 unchanged:

```text
active ABF27F0C257B123AFAE96C0A35C561A7C98916245264417581CDF60DD34AEB35
draft  446D82AEB23A988FE049FBB7F7316E73A501BA3993057D89015C5A8BC4771189
```

No source/managed rig bytes, draft configuration, publication, dependencies,
runtime model selection or SDK were changed for labels. No new physical speech,
portrait/Mac acceptance or expression-integration claim. No commit/push.
