# Magic Mirror — Working contract

Complete the requested outcome with the smallest correct change and relevant
evidence. Prioritize correctness/privacy, scope, then time and token cost.
Continue until done or concretely blocked; stop at the proven task boundary.

## Authority and execution

Project precedence: latest user request/routing → this file → newer DECISIONS
rulings → product/spec/implementation/stack → PROGRESS → domain facts → history.
`DECISIONS.md` owns durable rulings; `PROGRESS.md` owns current delivery, runtime,
blockers and evidence. Read only what the task needs.

- Explain/review/diagnose/plan: inspect and report. Fix/change/build: implement
  and check. Bounded work needs no plan artifact or repeated approval.
- Start at the named path/symbol/error with targeted `rg`. Preserve others'
  edits; avoid adjacent cleanup, refactors, renames or formatting sweeps.
- In-scope reads, reversible edits, isolated tests and task-caused repairs are
  authorized. Ask only for unresolved destructive actions, external writes, purchases,
  credential rotation, irreversible migration or material expansion. Existing
  explicit authority persists.
- External/flaky actions get at most one retry, then report the exact failure.
  Stop/cancel/abort terminates active work; do not restart or substitute it.
- Report meaningful findings and blockers. Status requests use current evidence
  or the smallest direct capture.

## Verification and skills

One agent normally implements and checks (2026-10-04 ruling). No mandatory
agent chain, plan, approval gate, independent review or full suite. Use focused
regressions for behavior and static checks for docs/config; reuse unchanged
passing evidence. Broaden only for affected integration, packaging, privacy,
mic/restart ownership or release boundaries. Review the final diff once unless
it reveals a problem. Retain full failures; summarize successful checks. Create
evidence artifacts only for useful reproduction/handoff; never claim untested
runtime acceptance.

Load relevant skills/references only. Keep harness instructions in English;
skills hold domain facts, not duplicated policy. Realtime prompts/tools come
from the versioned catalog; application code owns authorization and ordering.
Use `roleplay-control-prompts` for model behavior, without regex speech filters.
For QA, start at PROGRESS and `mm-ui-qa`; historical passes are not fresh QA.
Never overlap normal Electron, Electron QA or full `npm test` (includes Electron
smoke). Preserve unsaved operator edits before reload/restart.

## Optional delegation

Delegate only an independent substantial task that saves time. Root keeps the
session's selected model/effort; workers use the PATH-resolved CLI, exact
`nova-auto` / `gpt-6.1-sol` / `max`, without substitution:

```zsh
codex exec --profile nova-auto --ephemeral --cd '/Users/novalien0424/magic-mirror' -m gpt-6.1-sol -c 'model_reasoning_effort="max"' "$taskPrompt"
```

Use the canonical Windows path there. Assign owned paths, applicable invariant
IDs and checks. Workers preserve others' edits, use `apply_patch` for source,
and never delegate. Surveyors stay read-only; testers run assigned checks.
Root integrates without another review stage. Return commands, exits, key
results and checked IDs; retain failures. Evidence is metadata-only: no
transcripts, audio, private context, memory values, credentials, images or
embeddings. Cite primary external sources and distinguish inference.

## Canonical product invariants

Preserve all 12 IDs.

1. Transcripts, conversation audio and injected private context are RAM-only;
   diagnostics are metadata-only. Main's private local database may persist
   selected facts/validated summaries by avatar and confirmed person under that
   scope's learning policy.
   Imported history stays transient, persona edits separate; no raw archive.
2. Face recognition proposes; private memory loads only after verbal confirm.
3. Guest/candidate profile IDs stay in Main, never renderer/model boundaries.
4. Profile change closes old history, confirms in a clean Persona+Master-only
   session, then updates the agent.
5. Extraction writes to the owner snapshot captured at turn start.
6. Identity/naming/switch/group/sleep and spoken-command (spell, stop,
   media-wake) turns skip extraction.
7. Commands require whole final-transcript equality after deterministic
   normalization, including approved shared-lexicon sound-alike folding. No
   substring, edit-distance or model authorization. Execute once per turn;
   approved presets alone control hardware. DECISIONS owns accepted folds.
8. Exactly one microphone owner; explicit release before acquire.
9. Every ignore/drop/fallback/degrade is visitor-visible or a metadata-only
   Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Runtime model IDs come only from versioned config; no silent substitution.
12. Main alone loads `OPENAI_API_KEY` from ignored root `.env`, the sole source.
    No Console provisioning, `safeStorage`, Keychain, DPAPI, process-env or
    fallback. Agents never inspect/output its value; failures are metadata-only.

## Platform and protected boundaries

- Final Raven target: `/Users/novalien0424/magic-mirror` (2026-10-03). Scoped
  deployment is authorized. Mac TCC/signing/entitlements, packaged workers,
  LaunchAgent, power/performance and wake need actual Mac evidence.
- Electron runs only from canonical checkout (Windows:
  `C:\Project\magic-mirror`). Worktrees may run Node tests/typecheck/build/package,
  never Electron demos/smoke. Explicit no-launch boundaries remain binding.
- Before first Windows Electron run, verify persistent Private firewall rules
  `MagicMirror.Development.Electron.TCP`/`.UDP` target canonical
  `node_modules\electron\dist\electron.exe`. If missing/mismatched, stop and ask
  once for elevated canonical `scripts\configure-windows-electron-firewall.ps1`.
  No worktree rules/Defender prompt; recheck after path/install change or failure.
- User LaunchAgent `KeepAlive={SuccessfulExit=false}` alone restarts Electron.
  Recreate a failed renderer once; failed/repeated recovery exits 1. Never
  `app.relaunch()` or another restart owner. Board ADB/audio services do not
  restart Electron; the board-HDMI watchdog is retired.
- Do not modify `scripts/install-node-lts.ps1`, immutable history, protected
  review/product docs, dependencies, runtime model config or phase status unless
  explicitly required and named. Official phases/demos/exits/regression/tags/
  promotion stay sequential; prep-only exceptions do not start phases.

## Handoff

Report outcome, changed files, checks and unresolved risk briefly. At clock-out,
keep PROGRESS to current delivery/runtime, evidence, blockers and next action;
archive superseded detail with working links. Preserve failures and runtime
unless shutdown is requested. Compaction never changes phase acceptance.
