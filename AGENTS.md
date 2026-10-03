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

Current worker routing (user decision, 2026-10-03) is profile `nova-auto`,
exact model `gpt-6.1-sol`, and reasoning effort `max`. This supersedes
historical worker-route references, including Luna routes in older plans and
records. Those records remain provenance, never active dispatch. Pin the
exact worker ID; no auto-latest or silent model substitution. Runtime model
IDs remain unchanged.

Write skill and harness instructions in English; preserve exact product phrases and necessary non-English examples. Load skills for their actual workflow, not a keyword match. Keep descriptions short; put conditional detail in references. Skills add domain facts, not blanket preloads, approval loops, fixed itineraries or repeated test/review gates.

Realtime function definitions, rules and results come from the versioned tool catalog shared by runtime and inspector. Bind and validate handlers explicitly; keep exact spell authorization in the application. See `mm-realtime-voice` for the contract.

The interactive root uses the session's selected model/effort; workers use the exact dated route above and the dispatch contract below. Roles in `.codex/agents/` are bounded tools, not additional required stages. Workers do not delegate or create reviewers; root review follows their return.

Match verification to the changed boundary: reads need no tests; docs/config need named static checks. Durable behavior/application work uses one focused failing test, the smallest implementation, then a green result before any refactor. The tester owns named validation; obey explicit task exclusions and report pending verification instead of claiming runtime acceptance. Temporary diagnostics stay narrowly enabled, content-free and are removed in the same task unless retention is requested.

Broaden for cross-cutting changes, dependencies/packaging, migrations, credentials, runtime models, mic/restart ownership, identity/privacy, release or phase exit. Full suite/build/demo/independent review are conditional, not routine. Check the final diff once; repeat only for a concrete finding. Report command, exit code and key result; full output on failure or request.

Do not overlap normal Electron, Electron QA or full `npm test` (includes Electron smoke). Preserve unsaved operator edits before reload/restart.

## Dispatch contract

For every post-plan implementation, repository survey or research, and
test/validation worker, root launches a fresh profile-backed worker through
the direct PATH-resolved `codex` wrapper. The canonical launchers use every
routing flag explicitly; no `.Source` assignment is used. Selecting the actual
platform workspace for `--cd` is user-authorized and does not permit silently
changing the other routing flags. Substitute only the task prompt in the
matching platform example.

Canonical Windows PowerShell:

```powershell
codex exec --profile nova-auto --ephemeral --cd 'C:\Project\magic-mirror' -m gpt-6.1-sol -c 'model_reasoning_effort="max"' $taskPrompt
```

Canonical macOS zsh for this workspace:

```zsh
codex exec --profile nova-auto --ephemeral --cd '/Users/novalien0424/magic-mirror' -m gpt-6.1-sol -c 'model_reasoning_effort="max"' "$taskPrompt"
```

Every task prompt must repeat these fields and values:

```text
model: "gpt-6.1-sol"
reasoning_effort: "max"
role: exactly one of "implementer", "surveyor", or "tester"
fresh_worker: true
task: one bounded unit with explicit non-goals
write_scope: exact named files; read-only unless the named scope grants a write
skills: relevant .agents/skills paths
self_invariants: relevant canonical IDs; use IDs 1–12 for product behavior
evidence: exact changed files, diff summary, complete command output and exit codes, and risks
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
```

The dispatch must name the exact files, relevant skills, invariant IDs, read or
write scope, and evidence format. Do not infer a role from a request or rely
on the project backstop for model or effort. Every Codex CLI discovery or
dry-run uses `--profile nova-auto`, `--ephemeral`, explicit
`gpt-6.1-sol`, and explicit `max`. Profile-less collaboration calls may
coordinate context only; they have no profile field and are not execution
substitutes. A missing profile, model, effort, role, scope, skill, invariant,
or evidence field is a dispatch failure.

The implementer may write only the exact bounded paths named in its prompt and
must use `apply_patch` for every write. The surveyor is read-only. The tester
may run only the named validation commands and may write only the named
ignored evidence artifact. No worker may widen its scope, modify immutable
sources, create a review worker, or silently choose another model.

## Worker evidence and privacy

Use metadata-only artifacts and examples: IDs, enums, counts, timings,
statuses, reasons, hashes, paths, and exit codes. Never place transcripts,
audio, extracted memory values, private context, credentials, images,
embeddings, prompts containing user content, or secrets in source, logs,
reports, telemetry, or worker output. Survey/research findings must cite
primary-source URLs and label each finding `verified` or `unverified`.
Every worker returns exact files changed, a concise diff summary, complete
stdout/stderr for every command with exit codes, and unresolved risks. A
tester returns complete output even for a failed or unavailable command.

## Canonical product invariants

Preserve all 12 IDs; worker prompts name applicable IDs and reports identify those checked.

1. Transcripts, conversation audio, extracted memory values, and injected
   private context are RAM-only; diagnostics are metadata-only.
2. Face recognition proposes; private memory loads only after verbal confirm.
3. Guest/candidate profile IDs stay in Electron Main and never cross
   renderer/model boundaries.
4. Profile change closes old history, confirms in a clean Persona+Master-only
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

- **2026-10-03 user authority:** this Mac is the FINAL deployment target for
  Raven. The canonical Mac workspace is `/Users/novalien0424/magic-mirror`;
  explicitly scoped deployment work here is authorized. This supersedes older
  deferred-Mac/M4-port wording without changing phase acceptance or runtime
  model IDs. Target TCC, signing, entitlements, packaged workers, LaunchAgent,
  power/performance and wake quality require their own actual Mac evidence.
- Windows development and functional results remain Windows evidence; never
  claim Mac readiness from them. On Windows, launch development Electron only
  from canonical `C:\Project\magic-mirror`. On Mac, use the canonical Mac
  workspace. Worktrees may run Node-only tests, typechecks/build/package, never
  Electron runtime demos or live smoke. A task's explicit no-launch boundary
  remains binding.
- On Windows, before the first Electron run verify persistent Private rules
  `MagicMirror.Development.Electron.TCP` and
  `MagicMirror.Development.Electron.UDP` target canonical
  `node_modules\electron\dist\electron.exe`. If absent/mismatched, stop and
  ask for elevated `scripts\configure-windows-electron-firewall.ps1` once
  from canonical checkout. Never create worktree rules or rely on a Defender
  prompt. After an exact match, recheck only if path/install changes or an
  actual lookup fails; do not ask again otherwise.
- User LaunchAgent `KeepAlive={SuccessfulExit=false}` is the sole Electron
  restart owner. Recreate a failed renderer once; a failed or repeated recovery
  exits with code 1 for LaunchAgent supervision. Never `app.relaunch()` or a
  second Electron restart owner. Board-HDMI recovery and audio-preference
  services do not own or restart Electron.
- Do not modify `scripts/install-node-lts.ps1`, immutable historical inputs,
  protected review/product docs, dependencies, runtime model config or phase
  status unless the task explicitly requires and names it.
- Official phases, runtime integration, demos, exits, regression, tags and
  promotion remain sequential. Dated prep-only exceptions are not phase starts.

## Handoff

Lead with outcome, changed files, focused checks and material unresolved risk. At clock-out keep PROGRESS to current delivery/runtime, evidence, blockers and next action; archive superseded detail with resolvable links. Preserve failed evidence and runtime state unless shutdown is requested. Compaction does not change phase acceptance.
