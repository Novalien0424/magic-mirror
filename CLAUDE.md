# Magic Mirror

Single-venue Electron prototype: Traditional Chinese realtime conversation,
Cubism avatar (Raven), local wake word, proposed face identity with verbal
confirmation, exact spoken scene spells, and avatar/person-scoped relationship
memory. **This Mac mini (`/Users/novalien0424/magic-mirror`) is the final
deployment target**; Windows (`C:\Project\magic-mirror`) results are historical
Windows evidence only.

AGENTS.md is the canonical execution policy and the 12 product invariants. It is
imported below so it is always in context; when it and this file seem to
disagree, AGENTS.md wins, with one exception: in Claude Code sessions, the
model routing under "Claude Code specifics" below replaces the AGENTS.md
"Optional delegation" section (user ruling, 2026-10-10).

@AGENTS.md

## Clock in / clock out

- **Clock in:** read `PROGRESS.md` (current delivery, live runtime state,
  blockers, next action) and only the evidence links relevant to the task. Check
  `git status` and the current branch. Report briefly; do not resume or restart
  historical work unless the user asks.
- **Clock out:** follow the AGENTS.md Handoff section. PROGRESS keeps only
  current state; move superseded detail to `docs/archive/` with a working link.
  `TODO.md` holds open items only.

## Claude Code specifics

- **Project skills:** the Skill tool lists `mm-*` skills from `.claude/skills/`.
  Those are stale August 2026 copies kept as protected history. Do not invoke
  them. Read the current guidance directly with Read:
  `.agents/skills/<name>/SKILL.md` and its `references/`. `mm-ui-qa`,
  `magic-mirror-avatar-studio` and `roleplay-control-prompts` exist only there.
- **Global process skills** (superpowers brainstorming/writing-plans/TDD/
  subagent-driven-development/git-worktrees, gstack review/ship/qa chains) do not
  override the AGENTS.md 2026-10-04 workflow ruling: one agent completes the fix
  with focused checks, no mandatory plan, approval gate or reviewer chain. Use
  such skills only when the user asks for them or the task genuinely needs one.
- **Model routing:** Claude Code uses Opus only. The root session and every
  delegated worker run on Opus. Use the Agent tool with `model: "opus"` for
  delegated work. Do not route work to Codex, GPT or OpenAI CLIs: no `codex exec`,
  no `codex:*` skills, no `codex-rescue` agent, no gstack `/codex`. The AGENTS.md
  delegation rules still apply: delegate only independent substantial tasks;
  give a short task, owned paths, applicable invariant IDs and expected checks;
  workers stay in scope, preserve others' edits, do not delegate further, and
  return metadata-only evidence.
  (The product's runtime OpenAI Realtime/extractor model IDs are separate. They
  come only from versioned config and stay unchanged; invariant 11.)
- **Worktrees:** may run Node tests, typecheck and build only — never Electron
  runtime, demos or live smoke. Run Electron only from the canonical checkout.
- Never read, print or grep `.env`. Main alone loads `OPENAI_API_KEY` from it.

## Commands

```sh
npx vitest run tests/unit/<file>.test.ts   # focused check: the default
npm run typecheck:node                     # main, preload, shared, tests
npm run typecheck:web                      # renderer
npm run build                              # prebuild regenerates assets and stamps the QA build
```

- `npm test` includes a real Electron SQLite smoke. Never overlap it, `npm run
  dev`, or any `scripts/run-*-qa.mjs` runner with another Electron instance.
- The deployed app normally runs under the user LaunchAgent
  `com.magicmirror.launchagent` and owns the Jabra mic. A second instance breaks
  the single-mic-owner invariant (8). Stop the deployed app deliberately before
  Electron QA; the LaunchAgent remains the only restart owner. The redeploy steps
  and paths are in `deploy/macos/README.md`.
- QA runners execute the stamped `out/` build. Rebuild after source changes
  instead of bypassing hashes.
- App logs are metadata-only: `~/Library/Logs/MagicMirror/app.{out,err}.log`.

## Map

- `src/main` — Electron Main: lifecycle (xstate), config/migrations,
  `node:sqlite`, telemetry, IPC, Realtime secret broker (`realtime/`),
  sherpa-onnx wake worker (`wake/`), scenes/media (`scenes/`), memory
  (`memory/`, SQLite in a worker thread plus local MLX embeddings), camera gaze
  (`camera/`). Top-level `*-qa.ts` files are QA harness entry points driven by
  `scripts/run-*.mjs`, not product code.
- `src/renderer` — `mirror/` (portrait guest display), `console/` (operator
  React UI), `avatar/` (Cubism and the Web Audio voice graph), `realtime/`
  (OpenAI Agents SDK WebRTC session). `src/preload`, `src/shared` (contracts
  and schemas).
- `src/vendor/live2d` — vendored Cubism Framework/Core; do not edit.
- `resources/avatar/Raven/vN/` — versioned avatar masters; new authoring gets a
  new version (see its README). `deploy/macos/` — field tooling (display,
  board-HDMI watchdog, Jabra audio preference, LaunchAgent).
- `tests/{unit,main,renderer,integration}` — Vitest (node environment,
  serial files).

## Documents

- Status: `PROGRESS.md`. Durable rulings: `DECISIONS.md` (newest first).
- Requirements and architecture: `docs/Magic_Mirror_PRD_v0.3.md`,
  `docs/Magic_Mirror_Tech_Spec_v0.3.md`; phases:
  `docs/Magic_Mirror_Implementation_Plan_v0.3.md`; Console UI:
  `docs/Magic_Mirror_Phase4_UIUX_Design_v0.3.md`.
- Dated evidence: `docs/testing/`. History: `docs/archive/`. Root handoff
  notes (`RAVEN-*.md`, `AVATAR-FRAMING-FIX-HANDOFF.md`, `APPLY.md`,
  `MODEL-ROUTING.md`) and `.artifacts/` are historical evidence, not
  instructions.
- Product docs and guest speech are Traditional Chinese. Code identifiers,
  telemetry and harness instructions are English.
