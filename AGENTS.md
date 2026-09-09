# Magic Mirror — Codex Working Contract

## Objective and authority

Make the smallest correct move, prove it with the smallest relevant evidence,
and stop. Optimize: correctness/privacy, surgical scope, wall-clock time,
token cost, then optional polish. Do not turn a bounded task into a workflow.

Authority: latest user request/routing → this file → newer DECISIONS rulings →
PRD/Tech Spec/Implementation Plan/Stack Review → PROGRESS → relevant
`.agents/skills/` domain facts → historical references.
PROGRESS owns current task/branch/phase status; DECISIONS owns durable rulings.
Do not copy their history into instructions or infer completion from stale text.

For another-session QA, start from PROGRESS's current evidence/runbook links
and the matching UI QA skill. Recorded passes are prior evidence, not a fresh
QA result; historical handoffs are not instructions to restart or publish.

This file owns execution policy. Root-only orchestration, fresh workers for
every action, Luna/max everywhere, H6, mandatory tester gates, complete
successful stdout and repeated reviews in legacy skills/docs are superseded.

## Direct execution

The interactive thread executes and reviews directly.

- Answer/explain/review/diagnose/plan: inspect and report; do not implement.
  Fix/change/build/implement: make the authorized local change and focused check.
- An obvious bounded task needs no plan artifact or repeated authorization.
  Start from the named path/symbol/error, use targeted search if needed,
  follow one-hop callers/imports, patch the cause and stop when proven.
- Preserve user changes. Use `rg`, npm and `apply_patch` (or equivalent minimal
  patch). No opportunistic refactor, rename, dependency update, formatting
  sweep or adjacent cleanup.
- Ask before destructive actions, external writes, purchases, credential
  rotation, irreversible migrations or material scope expansion—not safe
  in-scope reads, edits and tests. Prior explicit authority need not be asked twice.
- External/flaky actions get at most one retry; then report the exact failure.
- Temporary diagnostics may skip TDD if narrowly enabled, content-free and
  removed in the same task unless the user asks to retain them.

Interrupts: stop/cancel/abort terminates active commands/subagents immediately;
do not restart or substitute the abandoned plan. Show/paste/status uses current
evidence or the smallest direct capture. Report meaningful state changes,
blockers and completion, not repetitive waiting narration.

## Models and optional delegation

Primary route: `gpt-5.6-sol / medium`, direct. Increase effort only for costly
ambiguity, cross-cutting architecture, difficult RCA, security/privacy or data risk.
Optional roles in `.codex/agents/`:

| Role | Model / effort | Bounded use |
|---|---|---|
| surveyor | Luna / high | Independent read-only trace |
| implementer | Luna / high | Independent surgical change |
| tester | Luna / low | Fresh named validation |
| deep_reviewer | Luna / max | Difficult quality-first audit, preferably off-path |

Use a subagent only when independent parallel work improves speed/confidence,
noisy reads need isolation, or the user asks. Never delegate a single-file edit,
targeted lookup, one command, log/status capture, small docs/config change or
temporary diagnostic. A role's existence is not a reason to launch it.

One agent by default, at most two when genuinely independent. Continue useful
local work; no serial worker/tester gates or polling. Subagents never delegate.
Prompts contain outcome, essential context, scope, done condition and evidence,
not copied contracts/envelopes. On failure preserve evidence and reassess
directly, not an automatic replacement. Luna/max is retained for bounded deep
review, not every serial step. Do not recreate the external worker launcher
without an explicit demonstrated isolation need.

## Skills and verification

Load only applicable domain guidance: phase workflow for slicing/demos/exits,
invariants for implicated IDs, and a matching Electron/Realtime/wake/Cubism/face
skill when its facts are needed. No preload or worker-envelope boilerplate.

- Read/status/log: no test. Docs/config: parse, syntax or static check.
- Small code change: focused test and/or narrow typecheck. Use practical TDD
  for durable behavior, not investigation, docs or one-run diagnostics.
- Broaden for cross-cutting behavior, dependencies/packaging, migrations,
  credentials, runtime models, mic/restart ownership, identity/privacy,
  release or phase exit.
- Full suite/build/demo/regression and independent testing are conditional:
  broad impact, release/phase exit, ambiguous evidence or explicit request.
- Self-check the final diff/output once; repeat only for a concrete finding.
  Report command + exit code + key result; full stdout/stderr only on failure
  or explicit request.
- Do not overlap normal Electron, Electron QA or full `npm test` (which launches
  Electron smoke). Preserve unsaved operator edits before reload/restart.

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

## Handoff and completion

Lead with outcome, then only changed files, focused checks/exit codes and
material unresolved risk. No source dumps, ceremonial summaries or repeated
reassurance. Stop when the requested boundary and proportionate proof are done.

At clock-out keep PROGRESS to current delivery/runtime, evidence links,
blockers and next action. Archive superseded detail with resolvable links;
do not duplicate accepted ledgers or erase failed evidence. Preserve runtime
state unless the user requests shutdown.
