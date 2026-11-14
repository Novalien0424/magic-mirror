# Magic Mirror

Single-venue Mac Electron/Cubism Raven; current product and user stories:
[PRD](PRD.md). Shared policy, invariants and clock-in/out:

@AGENTS.md

## Claude Code routing

Only in Claude Code, this replaces AGENTS' Optional delegation section (owner
ruling, 2026-11-10, superseding 2026-10-10). Root is Fable; implementation workers
are Opus (`implementer`, or `model: "opus"`) and test/QA workers Sonnet (`tester`,
or `model: "sonnet"`). Never route to Codex/GPT/OpenAI CLIs. Application model IDs
are separate. One agent normally implements/checks; delegate only independent
substantial work with owned paths, invariant IDs and checks. Workers preserve
edits, stay scoped, never delegate and return metadata-only evidence. A tester
launches Electron only when its brief says so, under the no-overlap rule.

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
  `out/`; rebuild changed source, never bypass hashes, and never build while
  production runs (it can load half-replaced `out/`; Phase 0/runner tests refuse
  then too). Venue keys, speakers, TV board: [Stream Deck](deploy/macos/stream-deck.md),
  [buttons](deploy/macos/raven-button.md). Metadata logs: `~/Library/Logs/MagicMirror/`.
- [Document map](docs/README.md): baselines/evidence/history are not extra
  instructions. Product/guest text is Traditional Chinese; code/telemetry English.
  Windows evidence does not establish Mac acceptance.
- Vendored Cubism is not editable; Raven CMO/PSD masters get new versions.
