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

## Skills and verification

**2026-10-04 workflow ruling:** default to one agent completing the fix and its
focused checks. No mandatory survey → implementer → tester → reviewer chain,
plan artifact, approval gate, or evidence report for routine work. Delegate only
when an independent substantial task will save time. This supersedes older
mandatory worker, tester-ownership, and repeated-review instructions.

Load only task-relevant skills/references. Skills provide domain facts, not fixed
itineraries. Write harness instructions in English and keep them concise.
Realtime tool definitions, rules and results come from the versioned shared
catalog; keep exact spell authorization in the application.

Use the smallest meaningful regression check for behavior changes and static
checks for docs/config. The implementing agent may run them directly. Reuse
passing evidence for unchanged code; rerun only after relevant changes or a
concrete failure. Broaden checks only for affected integration, packaging,
privacy, mic/restart ownership, or release boundaries. One final diff review is
enough unless it finds a problem. No routine full suite or independent reviewer.
Report changed files, check results and unresolved risks briefly; keep full
failure output, but do not transcribe successful commands or source reads into
reports. Add an evidence artifact only when useful for a reproducible runtime
result or handoff. Never claim untested runtime acceptance.

Do not overlap normal Electron, Electron QA or full `npm test` (includes Electron
smoke). Preserve unsaved operator edits before reload/restart.

## Optional delegation

Root uses the session's selected model/effort. When delegation is worthwhile,
retain the user-selected worker route: profile `nova-auto`, exact model
`gpt-6.1-sol`, effort `max`, through the PATH-resolved CLI. No silent substitution.
Use the canonical platform workspace (`C:\Project\magic-mirror` on Windows):

```zsh
codex exec --profile nova-auto --ephemeral --cd '/Users/novalien0424/magic-mirror' -m gpt-6.1-sol -c 'model_reasoning_effort="max"' "$taskPrompt"
```

Give a short task, owned paths, relevant constraints and expected checks.
Workers preserve others' edits, stay in scope, use `apply_patch` for source
writes, and do not delegate. Root integrates their result without creating a
separate review stage. Successful output needs only commands, exits and key
results; retain complete failures. Surveyors remain read-only; testers run the
named checks. Use metadata-only evidence: no transcripts, audio, private context,
memory values, credentials, images, embeddings or secrets. External findings
cite primary sources and distinguish verified facts from inference.

## Canonical product invariants

Preserve all 12 IDs; worker prompts name applicable IDs and reports identify those checked.

1. Transcripts, conversation audio and injected private context are RAM-only;
   diagnostics are metadata-only. Under the 2026-10-04 lasting-memory request,
   explicitly selected structured memories may persist in Main's private local
   memory database, scoped by avatar and confirmed person. No raw conversation
   archive or automatic extraction is enabled by this exception.
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
