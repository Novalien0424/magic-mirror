# Repository documentation and cleanup — 2026-10-30

Scope: owner-requested repository/artifact cleanup, compact current handoff and
harness, and a complete current `PRD.md`. This is a static documentation audit,
not new product, physical-device or phase acceptance. Normal Electron stays up;
no operator configuration, credentials, original media or runtime cache is edited.

## Product audit

The new [PRD](../../PRD.md) covers visitor and operator journeys, every Console
page/Avatar section, all eight Neo controls, current behavior and planned work.
The September [baseline](../Magic_Mirror_PRD_v0.3.md) remains intact except for a
historical-status pointer. Historical plans, rulings and failures are retained.

| Product area | Implementation inspected |
|---|---|
| Console pages, drafts, publication, rollback, resource ownership | `src/renderer/console/App.tsx`, `profile-workspace.ts`, `ResourceAccess.tsx` |
| Studio flow, controls, names, pauses and drawing | `src/shared/portrait-studio.ts`, `speech-script.ts`, `src/main/studio/studio-runtime.ts`, `ExperiencesEditor.tsx`; 10-24 name repair and 10-26 redraw reports |
| Personas, presentation, voice, rigs and skills | Console Persona/Appearance/Voice/Skills editors, `src/shared/presentation.ts`, `avatar-skills.ts` |
| Scoped memory and history import | `src/renderer/console/MemoryPanel.tsx`, `src/main/memory/`; maintained face-identity skill distinguishes planned face enrollment |
| Local/online media, folders, pictures | `src/shared/media-folders.ts`, media skill/editor; 10-23 pictures and 10-24 search delivery; deferred 10-25 catalog design |
| Loop, desktop, STOP and Dance | `src/main/operator-loop.ts`, `music-loop.ts`, `dance-floor.ts`, LoopVideo/DanceFloor panels; current Stream Deck runbook |
| Remote Console | `src/shared/web-console.ts`, `src/main/web-console.ts`, `scripts/configure-tailnet-console.mjs` |
| Scene/hardware boundaries | `src/main/scenes/adapters.ts`, scene editor; lighting/fog remain unavailable physical adapters |
| Runtime, recovery and diagnostics | Main/boot, module registry, deployment runbook and current handoff |

Reconciled stale TODO statements: five-key Neo layout, old PLAY LOOP wording,
69% QA restoration, superseded watermark/watercolour style status and older name
evidence. Retained actual gaps: failed Studio speech recovery/operator rescue,
LLM catalog redesign, physical printing, USB/wake/voice acceptance, TV transport,
Dance physical sync and unexplained post-restart Jabra volume change. Face
enrollment, standalone Master Memory and full backup/restore UI are explicitly
planned, not shipped.

## QA evidence retention and disposal

The inventory found 234 marked roots under `.artifacts/phase4-qa`. Of these,
**231 finished runs** have structured evidence: **102 exit 0, 129 exit 2**,
20,349 files and 3,886,209,322 logical bytes before cleanup. Their complete
structured result records (including failed cases, reasons, metrics and build
hashes) are retained in
[compressed historical metadata](../archive/qa-results-before-cleanup-2026-10-30.json.gz).
The archive is 154,316 bytes; SHA-256
`d54b1abe4ca31190d7b992d7897645e65637b1c3bc6f8b0c4a596dbb97174f1b`.
It round-trips through gzip/JSON and links reports that referenced exact run IDs.
It contains no images, audio, profile databases, persona/provenance files or raw
launch logs. Historical visual conclusions stay in their existing reports;
this cleanup makes no new visual claim. Former raw capture paths will be absent.

Review identified failures across character/quality judging, identity/ASR,
camera transport, media, Console controls, Studio and image timing. No failure
was relabeled a pass. The per-run metadata retains the individual records rather
than only these categories. Use `gzip -dc <archive>` to inspect the JSON locally.

Deletion uses the existing `reviewQaArtifact` / `cleanQaArtifact` path for each
exact finished root, binding this report and the inventory fingerprint before
deletion. Never relabel unfinished or unmarked roots. Retained exceptions:

- `2026-10-05T03-51-52-766Z`: unfinished marker, already retained by the 10-20 cleanup.
- `2026-10-17T10-12-54-520Z` and `2026-10-18T06-13-17-851Z`: no structured evidence;
  preserve their launch failure details rather than discard them unreviewed.
- Named older artifact sets, copied markers outside the canonical cleanup root,
  build/research inputs and historical harness ledgers retain their ownership
  boundaries. They are not silently adopted by the cleanup tool.

## Required files preserved

`node_modules`, stamped `out`, `.local/memory-embedding`, generated/native runtime
assets, licensed/vendored code, Raven source masters and their versioned evidence,
original Common media, owner deliverables, credentials, Git history and installed
controls are required or owner data. They are not disposable simply because they
are large or old. Current instructions route through AGENTS and maintained skills;
legacy compatibility entrypoints stay short rather than becoming another policy.

## Completed cleanup and checks

- All 231 selected roots deleted through the guarded API: 20,118 payload files,
  3,886,153,882 bytes, plus 231 ownership markers. No cleanup rejection or bypass.
- Removed the disposable local uv installation cache using
  `uv cache clean --cache-dir <repo>/.local/memory-embedding/cache/uv --offline --no-config`:
  5,766 entries, 295.8 MiB reported. The installed Python/venv/model, pinned wheels
  and bootstrap archive remain for runtime and reproducible provisioning.
- Removed the unused 310-byte `~/Applications/Magic Mirror Controls/dance-floor.svg`
  created during the prior task; no live assignment referenced it. Installed apps
  and recovery profile remain. Removed the retired empty model-default example
  from Git; its historical explanation stays in the setup archive.
- `.artifacts` decreased from 4.2 GiB to 508 MiB. Remaining named historical evidence,
  native-build inputs and three incomplete roots are retained for the reasons
  above. This is removal of unnecessary files, not deletion of every ignored file.
- Compacted current handoff, open-work list and Claude entrypoint; AGENTS routes
  to the current PRD while preserving all 12 invariants byte-for-byte. Refreshed
  the already-stale harness checksums for every retained manifest entry.
- Memory runtime verification: all 34 pinned package versions match, MLX,
  Transformers, tokenizers and safetensors import, model file present; exit 0.
  Transformers printed its optional PyTorch-not-installed notice; this MLX
  runtime does not require PyTorch. No model download or configuration change.
- Static coverage includes all 5 Console pages, 8 System pages, 8 Avatar sections
  and 3 shared libraries. Link checking includes maintained skills; the first run
  found one stale anchor introduced by shortening CLAUDE:

  ```text
  MODEL-ROUTING.md -> CLAUDE.md#session-entry-and-routing: missing anchor
  Traceback (most recent call last):
    File "<stdin>", line 37, in <module>
  AssertionError
  ```

  Corrected it to `#claude-code-routing`. Final check: **224 local links across
  55 current documents/skill references pass**, all nine retained harness
  checksum entries pass, and the PRD has 32 unique story IDs. Invariants plus
  platform/handoff rules remain byte-for-byte unchanged. Diff whitespace passes.
- Build fingerprint verification passed without a rebuild. Normal canonical
  Electron PID 96439 remained running; no test Electron, restart, volume change
  or new physical-device acceptance was introduced by this task.
