# CLAUDE.md — 魔鏡 (Magic Mirror) AI Avatar

## Project Goal

A single-venue prototype for one Mac mini M4: a "magic mirror" that converses
naturally in Traditional Chinese (OpenAI Realtime, speech-to-speech, barge-in),
shows a Live2D Cubism avatar with audio-driven lip sync, recognizes returning
guests (face proposes a candidate, verbal confirmation authorizes), remembers
per-guest facts in SQLite, and triggers Lighting/Fog/Music scenes only on exact
spoken spells. One Electron modular monolith, Phases 0–7, then Phase 8
(multiple personas + operator-owned custom Cubism rig). A long-lived, easily
modifiable prototype — never a platform.

## Authority (read in this order)

1. The user's latest request.
2. `AGENTS.md` — **owns execution policy** (direct execution, proportional
   verification, delegation rules, platform boundaries). Read it first every
   session; this file summarizes, it does not override.
3. `DECISIONS.md` — durable rulings; newer dated rulings supersede docs.
4. `docs/Magic_Mirror_PRD_v0.3.md` (content is v0.4.0; §18 multi-avatar),
   `docs/Magic_Mirror_Tech_Spec_v0.3.md` (§18 fixed architecture decisions),
   `docs/Magic_Mirror_Implementation_Plan_v0.3.md`,
   `docs/Magic_Mirror_Phase4_UIUX_Design_v0.3.md`,
   `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md`.
5. `PROGRESS.md` — compact current verified state, evidence, next action.
   Superseded handoffs are linked archives, not current authority.
6. `.agents/skills/<name>/SKILL.md` — current domain facts.
   **`.claude/skills/` copies date from 2026-08-16 and are stale**; prefer the
   `.agents/skills` version when they differ.
7. `docs/superpowers/plans/` and `docs/testing/` — historical plans and QA
   evidence, reference only.

Docs are Traditional Chinese; code, identifiers, commits, and telemetry are
English. Guest-facing speech and personas are Traditional Chinese.

## Execution Policy (summary of `AGENTS.md`)

- The interactive session executes and reviews directly. Make the smallest
  correct change, prove it with the smallest relevant check, stop.
- Subagents are optional tools, never serial gates: use one only for genuinely
  independent parallel work or noisy read-heavy investigation. The retired
  Opus-orchestrator / H6 worker protocol must not be recreated.
- `answer` / `explain` / `review` / `plan` → inspect and report, do not edit.
  `fix` / `change` / `implement` → edit and run the focused check.
- Ask before destructive actions, external writes, dependency or runtime
  model changes, or material scope expansion. Not before in-scope edits/tests.
- Report checks as command + exit code + key result; full output only on
  failure.

## Current Status (verify in `PROGRESS.md`; do not infer from this file)

Phases 0–3 are accepted **Windows development checkpoints**, tagged
`phase0-v0.3.1` … `phase3-v0.3.1`. Phase 4 Scenes is active, unaccepted,
untagged. The 2026-09-05 multi-avatar Console extension (PRD §18) is
delivered on `main`. Phases 5–7 not started. Mac mini port and all macOS-only
evidence (TCC, signing, LaunchAgent, packaged workers, wake revalidation,
100-cycle/72h soak) come after PC development and are never claimed from
Windows evidence.

## Stack (fixed — do not re-litigate)

TypeScript + Electron + React via `electron-vite`; vitest; npm only.
`@openai/agents-realtime` `RealtimeSession` over WebRTC (dialogue); Responses
model with Structured Outputs (memory extraction, Phase 6). SQLite via
`node:sqlite` is the only truth store. `sherpa-onnx-node` wake worker (one
replaceable hashed package, currently `sherpa-magic-mirror-win-v2`, phrase
`魔鏡阿魔鏡`); Python + OpenCV YuNet/SFace face worker (Phase 5); official
Cubism 5 Web SDK R5 vendored in `src/vendor/live2d/` (Core is a global script,
not an ESM import); typed Lighting/Fog/Music adapters each with a mock; xstate
lifecycle. All runtime model IDs come from versioned config
(`active.json`/`draft.json`/`previous.json`) — never source literals, never a
silent substitute. Installed Electron is 44.0.0 (doc floor 43.x); exact
versions live in `package-lock.json`.

**Credentials (dated personal-build ruling, supersedes docs):** the ignored
root `.env` `OPENAI_API_KEY` is the sole master-key source, loaded only by
Electron Main. No Console provisioning, `safeStorage`, Keychain, DPAPI, or
fallback. Never read, print, or log its value.

## Commands

```bash
npm run dev            # electron-vite dev; predev regenerates offline loop + avatar assets
npm run build          # production build into out/ (QA runners execute out/, not src/)
npm run typecheck      # node + web tsc
npm test               # vitest run (full suite; ~96 files)
npx vitest run tests/<path>          # focused test
npm run test:phase4:qa               # full Cubism/scene/media Electron QA (needs portrait display)
npm run test:phase4:qa:editor        # Console editor journey only
npm run test:phase4:qa:cubism        # dedicated rig tester; set MIRROR_CUBISM_QA_MODEL for Raven
npm run test:phase4:qa:console       # editor + finite video playback
npm run test:phase4:qa:live          # real-provider dialogue (only when in scope)
npm run test:phase1:live             # real-provider Realtime smoke
npm run evaluate:wake                # wake-word corpus evaluator
npm run smoke                        # electron . against built out/
```

Console opens with `Ctrl+Shift+D` from any Mirror screen. Dev server is
`http://localhost:5173/`. Isolated QA artifacts land in
`.artifacts/phase4-qa/<timestamp>/` (gitignored; metadata + synthetic
captures only).

For independent Cubism QA, read PROGRESS and
`docs/testing/cubism-console-2026-09-08.md#independent-qa-handoff`.
It owns the Raven fixture path, rerun commands, previous evidence and native
checks. Without `MIRROR_CUBISM_QA_MODEL`, Cubism mode tests Ren fixtures only.
The mode hides Mirror and does not prove physical speech or portrait playback.
Model release labels are edited in Live2D Cubism (Name/Version → Save library
label) and persisted independently of draft publication. See
`docs/testing/avatar-library-labels-2026-09-09.md`; never infer a version from
the manifest filename or hard-code a managed UUID.
For the Raven v08 framing fix and remaining extreme-pose crop, use
`docs/testing/avatar-framing-2026-09-08.md`. Projection preserves initialized
height/authored Layout; do not restore the canvas-width threshold or mutate
the model matrix during drawing.

## Windows Host Rules

- Launch development `electron.exe` **only** from the canonical
  `C:\Project\magic-mirror` checkout. Worktrees may run Node tests,
  typechecks, and builds, never Electron runtime.
- Windows Firewall rules `MagicMirror.Development.Electron.TCP` / `.UDP` must
  target the exact `node_modules\electron\dist\electron.exe`. If missing or
  mismatched, stop and ask the user to run
  `scripts\configure-windows-electron-firewall.ps1` elevated once. Never
  create per-worktree rules.
- Rebuild before Electron QA; the runners verify build stamps and refuse
  stale output. Never overlap normal Electron, Electron QA or full `npm test`
  (includes Electron smoke). Preserve unsaved Console edits before stopping
  or reloading the normal app.
- Visual QA needs an OS-reported portrait display; ask which panel rather
  than guessing.
- The user LaunchAgent (`KeepAlive={SuccessfulExit=false}`) is the sole
  restart owner; never add `app.relaunch()`.
- Do not modify `scripts/install-node-lts.ps1`, protected review docs,
  dependencies, runtime model config, or phase status unless the task names
  them.

## Repository Layout

```text
src/main/         Electron Main: lifecycle owner, config, SQLite, telemetry, IPC
  avatar/         model-bundle.ts (Cubism contract), model-import.ts (managed copy)
  realtime/ scenes/ wake/
src/preload/      contextBridge only
src/renderer/
  avatar/         cubism-avatar.ts, AvatarCanvas, PresentationStage, audio/ (lip sync, ducking)
  console/        Admin/Developer Console (App.tsx, scene editor, avatar editor)
  mirror/ realtime/ shared/
src/shared/       types, bridge contracts, avatar-profiles, avatar-prompt, presentation
src/vendor/live2d Cubism Core + Framework (proprietary; keep build copy + CSP path)
resources/avatar/ Ren (dev rig, Live2D free-material license) and Haru sample bundles
                  Raven/v10 project-owned master (runtime + local editable archive;
                  see resources/avatar/Raven/README.md for Git/backup policy)
resources/generated/  gitignored; produced by scripts/prepare-avatar-assets.mjs
resources/wake-models/  hashed sherpa packages (only manifest.json tracked)
scripts/          asset generation, QA runners, firewall setup
tests/            mirrors src/ (main/, renderer/, unit/, integration/, fixtures/)
sample/           operator media, untracked; never modify
```

## Project Skills (read the matching one before working in that area)

| Skill | Use when |
|---|---|
| `mm-phase-workflow` | Slicing, executing, or judging any Phase work unit, demo, or exit |
| `mm-invariants` | Interpreting an implicated invariant; cite IDs in reviews |
| `mm-electron-foundation` | Main/renderer, lifecycle, SQLite, config, workers |
| `mm-realtime-voice` | RealtimeSession, WebRTC, transcripts, reconnect, `updateAgent`, extractor |
| `mm-wake-word` | sherpa-onnx keyword package, mic handoff, corpus evaluation |
| `mm-live2d-avatar` | Cubism rendering, lip sync, motions/expressions, presentation, rig contract |
| `mm-face-identity` | YuNet/SFace pipeline, enrollment, embedding rebuild (Phase 5) |
| `mm-ui-qa` | Real Electron Console / portrait QA, screenshot inspection |

## Cubism Model Contract (enforced by `src/main/avatar/model-bundle.ts`)

An importable bundle is a `.model3.json` (Version 3) beside its assets, with:
`Moc`, ≥1 `Textures`, `Physics`, ≥1 `Expressions` (`.exp3.json`), `Groups`
containing `EyeBlink` and `LipSync` parameter groups (typically
`ParamEyeLOpen`/`ParamEyeROpen` and `ParamMouthOpenY`), and `Motions` groups
named exactly **Dormant, Waking, Listening, Thinking, Speaking, Scene,
Suspending** (lifecycle uses the first entry; the tester exposes every index).
Relative POSIX paths only, no `..`, ≤128 MB per file, ≤512 MB total. Import
via Console → Avatar / Audio → Appearance → "Browse & import Cubism…",
or use the dedicated **Live2D Cubism** page. Files are copied into managed
storage, originals untouched; validated imports are rediscovered after restart.
The dedicated page tests motions, expressions and actual MOC parameters in a
local silent preview, without publishing or switching the live character.
The renderer also drives
`ParamAngleX/Y/Z`, `ParamBodyAngleX`, `ParamBreath` for breath/idle. Mouth is
written from the actual output-audio analyser in normal runtime; the opt-in
tester can override mouth and other parameters without microphone/audio use.

## Hard Invariants (violation = rejected review; IDs canonical with
`mm-invariants` and `AGENTS.md`)

1. No transcript/audio persistence — transcripts, extracted memory values, and
   private context are RAM-only; diagnostics are metadata-only.
2. Face proposes candidates; only verbal confirmation loads private memory.
3. Guest/candidate profile IDs stay in Main; never accepted from model output,
   tools, or renderer IPC. Avatar IDs are public character config, not guests.
4. Profile switch = close old session → clean confirmation session →
   `updateAgent` in place.
5. Extraction jobs write only to `ownerProfileIdAtTurnStart`.
6. Control turns (confirm/name/switch/group/sleep/spell) never enter
   personal memory extraction.
7. Scenes trigger only on normalized exact full-transcript spell match, once
   per turn; approved typed presets alone control hardware; LLM never emits
   hardware parameters.
8. One mic owner at a time (wake worker XOR renderer), explicit release then
   acquire.
9. No silent failure: every ignore/drop/fallback/degrade is visitor-visible or
   a metadata-only Console event with a reason.
10. Failures degrade, never gate: cloud failure → OfflineLoop; local core
    failure → Maintenance; never a black screen. Normal sleep is not a cloud
    failure and must not flash OfflineLoop.
11. Runtime model IDs come only from versioned config; unavailable ≠
    substitute.
12. `.env` `OPENAI_API_KEY` is the sole master-key source, Main-only, value
    never inspected or output by agents.

## Work Units and Verification (Implementation Plan §14, proportional per
`AGENTS.md`)

Phase implementation still uses the one-unit format — Story/Phase,
user-visible outcome, files expected to change, Console control or telemetry,
happy-path test, failure/fallback test, non-goals, demo step affected. Done
means both tests pass with output shown, a Console event or metric exists, and
no transcript/audio persistence was added.

- Docs/config → parse or static check. Small code change → focused test and
  narrow typecheck. Cross-cutting, credentials, mic ownership, identity,
  privacy, release, or phase exit → broaden.
- Full suite, build, demos, and independent tester are conditional, not
  routine. 100-cycle and 72-hour soak are Phase 7 only.
- Phase demos (P*-D*) are acceptance evidence; record in Console Phase Tests
  and `PROGRESS.md`. Exit criteria gate phase transitions, not runtime.
- Windows evidence is labeled as such and never claims Mac behavior.

## End of Session

Update `PROGRESS.md` (compact state, evidence, next action; archive superseded detail),
record new ADRs in `DECISIONS.md`, list unresolved defects and skipped checks,
remove scratch artifacts, and report `git status --short --branch`.
