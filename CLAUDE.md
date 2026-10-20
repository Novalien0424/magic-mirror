# Magic Mirror

Single-venue Mac Electron/Cubism Raven: Traditional Chinese/English Realtime,
local wake, verbally confirmed identity, spoken scenes and scoped memory.

@AGENTS.md

AGENTS owns policy. In Claude Code only, the routing below replaces its Optional
delegation section (user ruling, 2026-10-10); runtime model IDs are separate.

## Session entry and routing

- Clock in: read PROGRESS, selected open issue/evidence, branch and `git status`.
  Do not resume historical tasks unasked. Clock out: AGENTS Handoff; TODO is open-only.
- Read project `.agents/skills/<name>/SKILL.md` directly, then only needed
  references. Prompt/persona → `roleplay-control-prompts`; tools/ASR/playback →
  `mm-realtime-voice`; wake → `mm-wake-word`; Cubism → `mm-live2d-avatar`;
  rig authoring → `magic-mirror-avatar-studio`; QA → `mm-ui-qa`; Main/IPC →
  `mm-electron-foundation`. Stale `.claude/skills/mm-*` copies are hidden; never invoke.
- Global superpowers/gstack chains do not override the one-agent ruling; use only
  when requested or needed. Root and every worker run Opus (`model: "opus"`).
  Never route to Codex/GPT/OpenAI CLIs or codex-rescue/gstack `/codex`.
  Delegate only independent substantial tasks with owned paths, invariant IDs
  and checks; workers preserve edits, stay scoped, never delegate and return
  metadata-only evidence.
- Never read, print or grep `.env`.

## Commands and runtime

```sh
npx vitest run tests/unit/<file>.test.ts
npm run typecheck:node
npm run typecheck:web
npm run build
```

Use [Mac runbook](deploy/macos/README.md) for LaunchAgent deployment and
[owner checks](deploy/macos/owner-check/) for field work. The running app owns
Jabra; stop deliberately before Electron QA. Runners use stamped `out/`; rebuild
changed source, never bypass hashes. Metadata logs: `~/Library/Logs/MagicMirror/`.

Code: `src/main` lifecycle/IPC/devices/SQLite, `src/renderer` Mirror/Console/
Cubism/Realtime, `src/preload` and `src/shared` contracts. QA drivers are Main
`*-qa.ts` plus `scripts/run-*.mjs`. Tests use serial Vitest/Node.
Vendored Cubism is not editable; versioned Raven CMO/PSD masters get new versions.
Product docs: `docs/Magic_Mirror_{PRD,Tech_Spec,Implementation_Plan,Phase4_UIUX_Design}_v0.3.md`.
`docs/testing`, `docs/archive`, root handoff files and `.artifacts` are evidence/
history, not extra instructions. Product/guest text is Traditional Chinese;
code/telemetry is English. Windows evidence does not establish Mac acceptance.
