# Raven project-owned storage — 2026-09-09

User authorized establishing a durable project-owned Raven master while
retaining the validated AppData runtime copy. This is a file/archive change,
not a renderer fix or automatic-import feature.

## Locations

- Master: [resources/avatar/Raven/v10](../../resources/avatar/Raven/v10).
- Import entry: [raven-lord.model3.json](../../resources/avatar/Raven/v10/runtime/raven-lord.model3.json).
- Original retained: `C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10`.
- Existing managed copy: `%APPDATA%/magic-mirror/assets/avatars/model-d5fef684-d4c0-4140-afdf-72f149076b95`.

Copied the complete v10 delivery (runtime, canonical Cubism CMO, PSD/source,
QA, docs and tool snapshots), not only the model3 entry file. Source was
checked for reparse points; destination was absent and no existing files were
overwritten. All source files remain in place. v7/v8 were not changed.

## Verification

- PowerShell source manifest and exact inventory validation, copy, and
  per-file SHA-256 comparison: **exit 0; 251 files, 445,921,244 bytes**.
- Original inventory: 250 entries plus the inventory itself. Its SHA-256 is
  `1bde095072876abd6aef9bea4446ca4993a5fa28bd258ccc953e63b5503aeea0`.
- `node --input-type=module -e ...` importing the production
  `src/main/avatar/model-bundle.ts`: **exit 0**, valid bundle, 17 files,
  all 16 referenced files present, seven motion groups and five expressions.
  All 17 runtime SHA-256 hashes match existing managed v10. Node emitted its
  module-type auto-detection warning; no package/dependency change was needed.

No new visual QA claim: the runtime bytes are unchanged. No Electron restart,
new import, config edit, publication, dependency/build change or asset deletion.
Prior v10 artistic/integration limits remain in its handoff.

## Recheck the local editable archive

Run from the repository root in PowerShell:

```powershell
$ravenRoot = (Resolve-Path 'resources/avatar/Raven/v10').Path
$ravenInventory = Get-Content (Join-Path $ravenRoot 'MANIFEST-SHA256.json') -Raw | ConvertFrom-Json
foreach ($entry in $ravenInventory.files) {
  $file = Join-Path $ravenRoot $entry.file
  if (-not (Test-Path -LiteralPath $file)) { throw "Missing archive file: $($entry.file)" }
  if ((Get-Item -LiteralPath $file).Length -ne $entry.bytes -or
      (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) {
    throw "Archive mismatch: $($entry.file)"
  }
}
```

This full inventory intentionally requires the ignored editable/QA archive;
it will not pass on a Git-only checkout. See [Git and backup policy](../../resources/avatar/Raven/README.md#git-and-backup-policy).
Runtime and small top-level inventory/readme are eligible for Git; the large
editable and QA archive stays out-of-band. No commit, push or remote backup
was performed. Historical archive documents retain their original links and
bytes; current root handoffs point to the project-owned master.
