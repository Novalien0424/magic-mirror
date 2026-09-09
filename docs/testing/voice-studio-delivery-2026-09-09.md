# Voice Studio delivery — Windows, 2026-09-09

User explicitly requested all work committed, pushed and deployed. Product
commit **bbd0256** includes 74 files: Voice Studio/live output, Cubism loops,
existing operator `.codex/config.toml` and `CLAUDE.md` edits, research, repair
handoffs, sample provenance and the owned crop fixture. This accompanying
documentation commit records deployment. Push target is `origin/main` at
`https://github.com/Novalien0424/magic-mirror`, without force.

## Fresh validation

- `npm test`: **exit 0, 938 tests / 102 files**, 82.86 seconds at 16:34.
  Includes the repository's real Electron smoke tests; no normal runtime or
  separate Electron QA overlapped this run.
- `npm run typecheck`: **exit 0**, Node and renderer.
- `npm run build` then `node scripts/qa-build.mjs --verify`: **exit 0**.
- Staged scope and credential-pattern scan: **passed**, filenames only on
  detection; no ignored environment file or runtime data staged/read.
- Staged whitespace review found only trailing EOF blank lines in three
  retained text files. Preserved those bytes; the check with
  `core.whitespace=-blank-at-eof` passes. No source behavior changed for delivery.

Built at **2026-09-09T08:35:51.531Z**:

- Source fingerprint: `5e5788ce5bcc0e6ec2144181dbdea164e7b979f475c3abdc801bb58f03e244fe`
- Output fingerprint: `d67d53100fa1f603e03a7e5cd806c77bbb999bd5ace85492ccb4975d3d991ee9`

## Running deployment

Both enabled Private Allow TCP/UDP firewall rules matched the canonical
`C:/Project/magic-mirror/node_modules/electron/dist/electron.exe` before tests.
No normal Electron was running initially. Launched the built application from
canonical checkout at **16:36:44 Asia/Taipei**, Main PID **38996**.

Fresh stdout: MAIN_READY / smoke=off; shortcut registered; Mirror and Console
WINDOW_LOADED and RENDERER_READY; Mirror WINDOW_SHOWN. Stderr empty when checked.
Process executable matches canonical Electron. Metadata logs remain local:
`.artifacts/voice-deployment-20260909/runtime.stdout.log` and `runtime.stderr.log`.
The app is left running. Config publication and provider calls were not part
of deployment; operator draft/active settings were not edited.

This is the established **Windows local development deployment**. It does not
claim an installer, remote server, Mac release, phase promotion or human acoustic
acceptance. Prior signal/UI/provider evidence and remaining sound/performance
gates are in [the implementation report](voice-studio-implementation-2026-09-09.md).

## Public-repository boundary

The previously untracked Mixkit WAV/WebM downloads and derived fixtures remain
on disk and are now explicitly ignored. Their source inventories, processing
notes and metadata are committed. Mixkit's [terms](https://mixkit.co/terms/),
section 9.4, restrict making items available as stock/inventory collections;
the public repository does not redistribute these standalone media files.
The project-owned `sample/_media/raven/crop.png` is included. No media deleted.

Existing ignored keys, generated builds and Raven editable/QA archives are
unchanged. Claude repair repositories remain installed at their previously
recorded local commits; this deployment does not push to third-party upstreams
or the uv cache remote. The Magic Mirror handoff documents are now tracked.

## Push verification

After pushing both commits, compare `git rev-parse HEAD` with
`git ls-remote origin refs/heads/main`; they must match. `git status --porcelain`
must be empty, and build verification plus PID 38996 must still pass. Final
exact remote hash and runtime metadata are captured in the task response and
the local deployment evidence directory, avoiding a self-referencing commit ID.
