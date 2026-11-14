# Magic Mirror — Working contract

Finish the requested outcome with the smallest correct change and relevant
evidence. Prioritize correctness/privacy, scope, then time/token cost; preserve
others' edits and stop at the proven boundary or concrete blocker.

## Context and execution

Clock in with branch/status and the relevant [PROGRESS](PROGRESS.md) section.
Latest user request → this contract → newer DECISIONS → product/spec/plan/stack
→ PROGRESS → domain references → history. [PRD](PRD.md) owns current stories;
[TODO](TODO.md) is open-only. Read only what the task needs.

Implement requested changes through relevant checks and task-caused repairs.
Inspection requests remain read-only. In-scope reads, reversible edits and
isolated tests are authorized; prior authority persists. Ask only for unresolved
destructive/external actions, purchases, credential rotation, irreversible
migration or material expansion. Stop/cancel/abort ends work. External failures
get at most one safe retry; retain the exact failure.

Use focused checks, broadening for affected integration, packaging, privacy,
mic/restart ownership or release boundaries. Reuse unchanged passes. Review the
final diff once unless it exposes a problem. No mandatory plan, review chain or
full suite. Preserve others' edits, failed evidence and unsaved operator state.

## Models and skills

Astra orchestrates; delegate substantial separable implementation to Sol and
screen work to Terra when useful. Small tasks stay with the current agent.
Use the user-wide `implementer` and `computer_use` roles, or `codex-sol` /
`codex-terra` aliases. See [user-wide harness](tools/codex-harness/README.md) for
installation, catalog refresh and explicit model overrides. Do not pin worker
versions or force maximum effort here. Workers own assigned paths/surfaces,
preserve concurrent edits and return evidence; no nested delegation. One UI
operator at a time. Root integrates without another mandatory review stage.

Domain skills contain local contracts and fragile operations. Prompt behavior
uses `roleplay-control-prompts`; the versioned catalog defines prompts/tools and
code owns authorization/ordering. No regex speech filters. For invariant edge
cases, read [details](.agents/references/invariant-details.md); for explicitly
requested phase/demo/exit work, read [phase exits](.agents/references/phase-exits.md).

QA starts with current PROGRESS and `mm-ui-qa`; old passes are historical.
Never overlap normal Electron, Electron QA or full `npm test` (includes Electron
smoke). Evidence/handoffs are metadata-only: no transcripts, audio, private
context, memory values, credentials, images or embeddings in diagnostic reports.

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
    Portrait Studio images alone use the owner's ChatGPT sign-in in ignored root
    `.env.chatgpt` (owner-run `npm run chatgpt:login`, refreshed by Main; ruling
    2026-10-17), under the same rules.

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
