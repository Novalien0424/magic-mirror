# Magic Mirror — Working contract

Complete the requested outcome with the smallest correct change and relevant evidence. Prioritize correctness/privacy, surgical scope, then time and token cost. Continue through in-scope fixes and checks until done or concretely blocked; stop when the requested boundary is proven.

## Authority and context

Latest user request/routing → this file → newer DECISIONS rulings → product/spec/implementation/stack documents → PROGRESS → applicable domain facts → history. This ordering resolves project documents, not system/developer instructions.

`PROGRESS.md` owns current delivery, runtime, blockers and evidence links; `DECISIONS.md` owns durable rulings. Read each only as the task needs. For QA, start with current PROGRESS runbook links and `mm-ui-qa`; prior passes are history.

## Execution

- Explain/review/diagnose/plan means inspect and report. Fix/change/build means make the authorized local change and finish its relevant checks. Obvious bounded work needs no plan artifact or repeated approval.
- Start at the named path, symbol or error; use targeted `rg` and follow relevant callers/imports. Preserve user edits. No adjacent cleanup, refactor, rename, dependency update or formatting sweep.
- In-scope reads, reversible edits, isolated tests and task-caused repairs are authorized. Ask only for unresolved destructive actions, external writes, purchases, credential rotation, irreversible migration or material expansion; existing explicit authority persists.
- External/flaky actions get one retry at most, then the exact failure. Stop/cancel/abort terminates active commands and agents; do not substitute or restart the abandoned task.
- Report meaningful findings, blockers and completion. Status/show/paste uses current evidence or the smallest direct capture.

## Skills and verification

**2026-10-04 workflow ruling:** one agent completes the fix and its focused
checks. No mandatory survey/implementer/tester/reviewer chain, plan artifact,
approval gate, independent reviewer or routine full suite; one final diff review
is enough unless it finds a problem. Delegate only when an independent
substantial task will save time.

Load only task-relevant skills/references. Skills hold domain facts and link
AGENTS/DECISIONS instead of restating them. Write harness instructions in
English and keep them concise.

Raven's dialogue is a probabilistic realtime speech model. Prompts and the
versioned tool catalog shape behavior rates; application code owns
authorization, ordering and application-spoken turns. Judge model behavior by
rates over repeated real-provider runs with synthetic and human audio, keep
failures, and never add regex speech filters (`roleplay-control-prompts`).

Use the smallest meaningful regression check for behavior changes and static
checks for docs/config; run them directly. Reuse passing evidence for unchanged
code; rerun only after relevant changes or a concrete failure. Broaden checks
only for affected integration, packaging, privacy, mic/restart ownership or
release boundaries. Report changed files, check results and unresolved risks
briefly; keep full failure output, but do not transcribe successful commands or
source reads. Add an evidence artifact only when useful for a reproducible
runtime result or handoff. Never claim untested runtime acceptance.

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
   diagnostics are metadata-only. Main's private local database may keep
   selected facts and validated distilled summaries, scoped by avatar and
   confirmed person under that scope's learning policy. Imported history stays
   transient, persona edits stay separate, and no raw conversation is archived.
2. Face recognition proposes; private memory loads only after verbal confirm.
3. Guest/candidate profile IDs stay in Electron Main and never cross
   renderer/model boundaries.
4. Profile change closes old history, confirms in a clean Persona+Master-only
   session, then updates the agent.
5. Extraction writes to the owner snapshot captured at turn start.
6. Identity/naming/switch/group/sleep and spoken-command (spell, stop,
   media-wake) control turns skip extraction.
7. A spoken command (scene spell, stop phrase, media wake) triggers only when
   the whole final transcript equals it after deterministic normalization,
   including shared-lexicon sound-alike folding; never substring, edit distance
   or model judgment. The application authorizes once per turn; approved presets
   alone control hardware.
8. Exactly one microphone owner, with explicit release then acquire.
9. Every ignore/drop/fallback/degrade is visitor-visible or a metadata-only
   Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Runtime model IDs come only from versioned config; no silent substitution.
12. Electron Main alone loads `OPENAI_API_KEY` from the ignored root `.env`,
    the sole master-key source. No Console provisioning, `safeStorage`,
    Keychain, DPAPI, process-env or other fallback. Agents/workers never inspect
    or output its value; missing/empty/read failures are metadata-only reasons.

## Platform and protected boundaries

- This Mac (`/Users/novalien0424/magic-mirror`) is Raven's final deployment
  target (2026-10-03); scoped deployment work here is authorized. Mac TCC,
  signing, entitlements, packaged workers, LaunchAgent, power/performance and
  wake quality need actual Mac evidence; Windows results never establish them.
- Launch Electron only from the canonical checkout (Windows:
  `C:\Project\magic-mirror`). Worktrees may run Node-only tests, typecheck,
  build and package, never Electron runtime, demos or live smoke. An explicit
  no-launch boundary stays binding.
- Windows only: before the first Electron run, verify persistent Private rules
  `MagicMirror.Development.Electron.TCP`/`.UDP` target canonical
  `node_modules\electron\dist\electron.exe`. If absent or mismatched, stop and
  ask once for elevated `scripts\configure-windows-electron-firewall.ps1` from
  the canonical checkout. Never create worktree rules or rely on a Defender
  prompt; recheck only after a path/install change or a failed lookup.
- User LaunchAgent `KeepAlive={SuccessfulExit=false}` is the sole Electron
  restart owner. Recreate a failed renderer once; a failed or repeated recovery
  exits with code 1 for LaunchAgent supervision. Never `app.relaunch()` or a
  second Electron restart owner. Field services (board ADB daemon, audio
  preference) never own or restart Electron; the board-HDMI watchdog is retired.
- Do not modify `scripts/install-node-lts.ps1`, immutable historical inputs,
  protected review/product docs, dependencies, runtime model config or phase
  status unless the task explicitly requires and names it.
- Official phases, runtime integration, demos, exits, regression, tags and
  promotion remain sequential. Dated prep-only exceptions are not phase starts.

## Handoff

Lead with outcome, changed files, focused checks and material unresolved risk. At clock-out keep PROGRESS to current delivery/runtime, evidence, blockers and next action; archive superseded detail with resolvable links. Preserve failed evidence and runtime state unless shutdown is requested. Compaction does not change phase acceptance.
