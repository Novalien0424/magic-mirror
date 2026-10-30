# Magic Mirror

Single-venue Mac Electron/Cubism Raven; current product and user stories:
[PRD](PRD.md). Shared policy, invariants and clock-in/out:

@AGENTS.md

## Claude Code routing

Only in Claude Code, this replaces AGENTS' Optional delegation section (owner
ruling, 2026-10-10). Root and workers use Opus (`model: "opus"`); never route to
Codex/GPT/OpenAI CLIs, codex-rescue or gstack `/codex`. Application model IDs are
separate. One agent normally implements/checks; delegate only independent
substantial work with owned paths, invariant IDs and checks. Workers preserve
edits, stay scoped, never delegate and return metadata-only evidence. Global
superpowers/gstack chains do not override this rule.

Read maintained `.agents/skills/<name>/SKILL.md` and only relevant references:
prompt/persona → `roleplay-control-prompts`; voice/Studio → `mm-realtime-voice`;
wake → `mm-wake-word`; Cubism → `mm-live2d-avatar`; rig authoring →
`magic-mirror-avatar-studio`; QA → `mm-ui-qa`; Main/IPC →
`mm-electron-foundation`. Disabled `.claude/skills` entries are compatibility
pointers. Never read, print or grep `.env` or `.env.chatgpt`.

## Working map

- Source: `src/main`, `src/renderer`, `src/preload`, `src/shared`; QA drivers:
  Main `*-qa.ts` and `scripts/run-*.mjs`. Focused checks:
  `npx vitest run tests/unit/<file>.test.ts`, `npm run typecheck`, `npm run build`.
- [Mac deployment](deploy/macos/README.md) and [field checks](deploy/macos/owner-check/).
  The app owns Jabra; stop deliberately before Electron QA. Runners use stamped
  `out/`; rebuild changed source, never bypass hashes. Metadata logs:
  `~/Library/Logs/MagicMirror/`.
- [Document map](docs/README.md): baselines/evidence/history are not extra
  instructions. Product/guest text is Traditional Chinese; code/telemetry English.
  Windows evidence does not establish Mac acceptance.
- Vendored Cubism is not editable; Raven CMO/PSD masters get new versions.
