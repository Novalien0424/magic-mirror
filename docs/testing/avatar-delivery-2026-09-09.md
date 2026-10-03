# Avatar delivery verification — Windows, 2026-09-09

User explicitly authorized commit, push and deployment. Product commit
**979a0ca** contains the completed avatar work; the following delivery commit
adds the byte-preservation rule and this record. Remote target: `origin/main`
at `https://github.com/Novalien0424/magic-mirror` (no force push).

## Fresh checks

```powershell
npx vitest run tests/unit/avatar-model-import.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts tests/unit/console-config-ui.test.ts tests/renderer/avatar/avatar-framing.test.ts tests/renderer/avatar/portrait-layout.test.ts tests/renderer/avatar/cubism-preview.test.ts tests/renderer/avatar/avatar-runtime-controller.test.ts tests/unit/avatar-component-contract.test.ts
node scripts/qa-build.mjs --verify
git diff --cached --check
```

- Focused tests: **exit 0, 82 tests / 9 files**, fresh at 10:12 Asia/Taipei.
- Build verification: **exit 0**. Source fingerprint
  `879e261e3e7cddae718ec93580ed9449c338c79ae9e46ed8dcdf90d60239cb8f`;
  output fingerprint `b918365ec7b842ff8e22856e5e6055408943e61fd315e56a7d1e994752b7bad0`.
- `git diff HEAD -- src resources/avatar scripts package.json`: no output
  after product commit. Runtime/source were not changed by this delivery turn.
- Git whitespace/scope checks and staged credential-pattern check passed.
- All **19 tracked v10 master files** were compared as binary SHA-256 between
  Git index (`git show :<path>`) and original working files: exact matches.
  `.gitattributes` disables newline conversion for this versioned export tree.
  The first byte-preserving staged check flagged original CRLF endings as
  trailing whitespace (exit 2); the scoped attribute now recognizes CR-at-EOL
  while retaining actual trailing-space/blank-line checks. Export bytes were
  not reformatted to silence the check.
- Prior real UI evidence: [label and restart verification](avatar-library-labels-2026-09-09.md).
  Its 221 isolated UI checks are prior evidence, not rerun in this commit turn.

## Local deployment boundary

Normal Electron Main **61564** was rechecked running from
`C:/Project/magic-mirror/node_modules/electron/dist/electron.exe`, started at
07:33 Asia/Taipei after the final build at 07:26. Build/source verification
establishes the current local built deployment. Latest native UI observation
left Raven v10 loaded neutral; v7/v8/v10 labels survived a full process restart.
This turn did not manipulate or restart the operator UI again.

No Appearance publication, new installer, remote-server deployment, Mac release
or phase promotion is claimed. The large ignored editable/QA archive and local
AppData label sidecars are not uploaded by Git. The 17-file Raven runtime and
master inventory are tracked; future imports can label releases in Console.

Unrelated `.codex/config.toml`, concurrent `CLAUDE.md`,
`docs/2D_Avatar_Fable_Suvey.md` and `sample/` changes remain local and unstaged.
No user changes were discarded. To verify remote synchronization after pushing:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

The hashes must match; a successful local commit alone is not push evidence.
