# Mac mini development handoff — 2026-10-03

The repository contains all eight existing `mm-*` project skills and the two
directly related user skills, now available under `.agents/skills/`:

- `magic-mirror-avatar-studio`: authoring references, job template, evaluations,
  validation script and runtime QA harness.
- `roleplay-control-prompts`: character dialogue and application control rules.

These are copies of the installed Windows user skills, including their supporting
files. Generated `.vite` cache is excluded. Use the repository copies for this
project; no separate user-skill installation is needed. Generic personal skills
and plugin installations are outside this project archive.

## Avatar files included in a clone

| Asset | Location |
| --- | --- |
| Bundled default Ren | `resources/avatar/Ren/Ren.model3.json` and its complete directory |
| Raven V11 runtime | `resources/avatar/Raven/v11/runtime/raven-lord.model3.json` and its complete directory |
| Raven V10 runtime and editable archive | `resources/avatar/Raven/v10/` |
| Canonical Raven editable rig | `resources/avatar/Raven/v10/cubism/raven-lord-v09.cmo3` |
| Raven layered PSDs and source artwork | `resources/avatar/Raven/v10/source/` |

V11 retains V10's artwork and rig. Its README and audit describe remaining
artistic limitations. The V10 archive contains 251 files totaling 445,921,244
bytes, including its original 250-entry SHA-256 inventory. Normal Git stores
these files; no LFS download or separate V10 archive is required.

After cloning, verify the full V10 archive from the repository root:

```sh
python3 - <<'PY'
import hashlib
import json
from pathlib import Path

root = Path('resources/avatar/Raven/v10')
manifest = json.loads((root / 'MANIFEST-SHA256.json').read_text(encoding='utf-8-sig'))
for entry in manifest['files']:
    asset = root / entry['file']
    assert asset.stat().st_size == entry['bytes'], asset
    assert hashlib.sha256(asset.read_bytes()).hexdigest() == entry['sha256'].lower(), asset
print(f"Verified {len(manifest['files'])} Raven archive files")
PY
```

## Platform context

This handoff preserves development inputs; it does not certify macOS runtime,
permissions, packaging, devices or wake behavior. Existing Windows evidence
remains Windows evidence. Historical V10 documents retain their original bytes
and Windows paths. Earlier V7/V8 deliveries referenced by historical documents
remain outside this repository; they are not dependencies of V10/V11.

The copied avatar skill also retains its original Windows examples. Set the job
template's `project_root` to the actual clone path. For its optional browser QA
harness on macOS, after installing the project's dependencies, use repository
paths instead of the old personal skill path:

```sh
export RAVEN_PROJECT_ROOT="$PWD"
export RAVEN_MODEL_ROOT="$PWD/resources/avatar/Raven/v11/runtime"
export RAVEN_QA_PORT=4177
node node_modules/vite/bin/vite.js \
  --config .agents/skills/magic-mirror-avatar-studio/scripts/runtime-qa/vite.config.mjs
```

The `.env`, runtime databases, profile/enrollment data, generated build outputs
and downloaded wake models remain excluded. Imported Console library entries
are runtime data: import the tracked Raven model through Console on the new
machine. The repository archive does not copy Windows AppData or publish an
avatar selection.
