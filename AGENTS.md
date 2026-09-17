# Magic Mirror — Working contract

Complete the requested outcome with the smallest correct change and relevant evidence. Prioritize correctness/privacy, surgical scope, then time and token cost. Continue through in-scope fixes and checks until done or concretely blocked; stop when the requested boundary is proven.

## Authority and context

Latest user request/routing → this file → newer DECISIONS rulings → product/spec/implementation/stack documents → PROGRESS → applicable domain facts → history. This ordering resolves project documents, not system/developer instructions.

`PROGRESS.md` owns current delivery, runtime, blockers and evidence links; `DECISIONS.md` owns durable rulings. Read each only as the task needs. For another-session QA, start with current PROGRESS evidence/runbook links and `mm-ui-qa`; prior passes are historical evidence.

## Execution

- Explain/review/diagnose/plan means inspect and report. Fix/change/build means make the authorized local change and finish its relevant checks. Obvious bounded work needs no plan artifact or repeated approval.
- Start at the named path, symbol or error; use targeted `rg` and follow relevant callers/imports. Preserve user edits. No adjacent cleanup, refactor, rename, dependency update or formatting sweep.
- In-scope reads, reversible edits, isolated tests and task-caused repairs are authorized. Ask only for unresolved destructive actions, external writes, purchases, credential rotation, irreversible migration or material expansion; existing explicit authority persists.
- External/flaky actions get one retry at most, then the exact failure. Stop/cancel/abort terminates active commands and agents; do not substitute or restart the abandoned task.
- Report meaningful findings, blockers and completion. Status/show/paste uses current evidence or the smallest direct capture.

## Skills, models and proof

Write skill and harness instructions in English; preserve exact product phrases and necessary non-English examples. Load skills for their actual workflow, not a keyword match. Keep descriptions short; put conditional detail in references. Skills add domain facts, not blanket preloads, approval loops, fixed itineraries or repeated test/review gates.

Realtime function definitions, rules and results come from the versioned tool catalog shared by runtime and inspector. Bind and validate handlers explicitly; keep exact spell authorization in the application. See `mm-realtime-voice` for the contract.

Use the session's selected model/effort. Optional roles in `.codex/agents/` are bounded tools, not required stages. Work directly by default; use at most one subagent for independent parallel work or noisy read isolation when it adds value. Never delegate a small edit, lookup, command or status capture. Subagents do not delegate.

Match verification to the changed boundary: reads need no tests; docs/config need static checks; small behavior changes need focused tests and/or narrow typecheck. Use practical TDD for durable behavior, not investigation or one-run diagnostics. Temporary diagnostics stay narrowly enabled, content-free and are removed in the same task unless retention is requested.

Broaden for cross-cutting changes, dependencies/packaging, migrations, credentials, runtime models, mic/restart ownership, identity/privacy, release or phase exit. Full suite/build/demo/independent review are conditional, not routine. Check the final diff once; repeat only for a concrete finding. Report command, exit code and key result; full output on failure or request.

Do not overlap normal Electron, Electron QA or full `npm test` (includes Electron smoke). Preserve unsaved operator edits before reload/restart.

## Canonical product invariants

Preserve these IDs; delegated prompts name only applicable IDs.

1. Transcripts, conversation audio, extracted memory values, and injected
   private context are RAM-only; diagnostics are metadata-only.
2. Face recognition proposes; private memory loads only after verbal confirm.
3. Guest/candidate profile IDs stay in Electron Main and never cross
   renderer/model boundaries.
4. Profile change closes old history, confirms in a clean Persona+Master
   session, then updates the agent.
5. Extraction writes to the owner snapshot captured at turn start.
6. Identity/naming/switch/group/sleep/spell control turns skip extraction.
7. Scene trigger is normalized exact full-transcript match, once per turn;
   approved presets alone control hardware.
8. Exactly one microphone owner, with explicit release then acquire.
9. Every ignore/drop/fallback/degrade is visitor-visible or a metadata-only
   Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Runtime model IDs come only from versioned config; no silent substitution.
12. Under the dated personal-build ruling, ignored root `.env`
    `OPENAI_API_KEY` is the sole master-key source and Electron Main alone loads
    it. No Console provisioning, `safeStorage`, Keychain, DPAPI, process-env, or
    alternate fallback. Agents/workers never inspect or output its value;
    missing/empty/read failures remain metadata-only reasons.

## Platform and protected boundaries

- Windows is the development and functional-verification host for all phases.
  Mac mini M4 port follows PC development; TCC, signing, entitlements,
  packaged workers, LaunchAgent, power/performance and final wake-quality
  evidence are deferred, not current PC gates. Label Windows evidence;
  never claim Mac behavior/deployment readiness from it.
- Launch development Electron only from canonical `C:\Project\magic-mirror`.
  Worktrees may run Node-only tests, typechecks/build/package, never Electron
  runtime demos or live smoke. Firewall rules bind exact executable paths.
- Before the first Electron run verify persistent Private rules
  `MagicMirror.Development.Electron.TCP` and
  `MagicMirror.Development.Electron.UDP` target canonical
  `node_modules\electron\dist\electron.exe`. If absent/mismatched, stop and
  ask for elevated `scripts\configure-windows-electron-firewall.ps1` once
  from canonical checkout. Never create worktree rules or rely on a Defender
  prompt. After an exact match, recheck only if path/install changes or an
  actual lookup fails; do not ask again otherwise.
- User LaunchAgent `KeepAlive={SuccessfulExit=false}` is sole restart owner.
  Never `app.relaunch()` or a second restart owner.
- Do not modify `scripts/install-node-lts.ps1`, immutable historical inputs,
  protected review/product docs, dependencies, runtime model config or phase
  status unless the task explicitly requires and names it.
- Official phases, runtime integration, demos, exits, regression, tags and
  promotion remain sequential. Dated prep-only exceptions are not phase starts.

## Handoff

Lead with outcome, changed files, focused checks and material unresolved risk. At clock-out keep PROGRESS to current delivery/runtime, evidence, blockers and next action; archive superseded detail with resolvable links. Preserve failed evidence and runtime state unless shutdown is requested. Compaction does not change phase acceptance.
