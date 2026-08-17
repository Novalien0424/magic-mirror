# Codex Harness Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox syntax (- [ ]) for tracking. The root Codex thread is the sole orchestrator and reviewer; workers do not create a review seat. Worker self-review and plan self-review are each capped at three passes, and root review is external to that self-review count.

**Goal:** Move the Magic Mirror repository from the legacy Claude-specific harness to a repo-scoped Codex control plane and seven individually validated .agents/skills while preserving the product contract, application task order, immutable legacy sources, and dependency set.

**Architecture:** The root Codex thread owns orchestration and review. Fresh bounded implementer, surveyor/research, and tester workers receive explicit gpt-5.6-luna plus reasoning_effort: "max", one role, a narrow scope, and an evidence contract; no worker is a review agent. The new control files and migrated skills are additive, while CLAUDE.md, .claude/skills/, product sources, and application code remain unchanged.

**Tech Stack:** Codex project control files (AGENTS.md, TOML), skill-creator init_skill.py and quick_validate.py, YAML/TOML parsers available in the local Python installation, PowerShell on Windows, existing Electron/Vite/TypeScript/Vitest repository, and Git.

**Spec:** docs/superpowers/specs/2026-08-16-codex-harness-migration-design.md

## Global Constraints

- Work in place on branch phase0-foundation (Ruling R1); do not create a worktree, change branch, or change the Phase 0 application task order.
- The root Codex thread is the sole orchestrator/reviewer. It does not implement, perform exploratory repository survey/research, or execute tests; it reads worker diffs and evidence and accepts, requests a scoped follow-up, or rejects.
- Every implementation, repository survey/research, and test/validation worker dispatch explicitly sets model: "gpt-5.6-luna" and reasoning_effort: "max", names exactly one of implementer, surveyor, or tester, and states its write scope and evidence format. A project default is only a backstop.
- Every post-plan survey, implementation, and test/validation worker is launched by root as a fresh profile-backed Codex CLI worker with --profile nova-auto, --ephemeral, --cd C:\Project\magic-mirror, -m gpt-5.6-luna, and -c 'model_reasoning_effort="max"'. The first pre-flight verifies that the named profile loads by asking for a non-secret PROFILE_READY marker only; it never prints or records profile contents, credentials, or environment secrets. The collaboration API has no profile field and is not the execution mechanism after approval; collaboration calls may coordinate only, while CLI execution remains mandatory.
- There is no reviewer role or reviewer worker. Root review is external to worker self-review. Each worker self-review and this plan's self-review may run at most three passes; the root records any requested follow-up without increasing that worker's self-review allowance.
- CLAUDE.md and every .claude/skills/*/SKILL.md are immutable byte-for-byte source references. No task may edit, reformat, rename, delete, or line-ending-convert them. The first task captures SHA-256 hashes; the final tester compares them.
- Prefer leaving .claude/skills unchanged as migration sources. Active routing vocabulary lives in AGENTS.md, .codex/, and .agents/skills/; active files must not contain legacy Claude-only paths, Opus dispatches, Claude Agent-tool instructions, or equivalent legacy routing.
- Preserve Ruling R1 (in-place branch), Ruling R2 (authoritative handleSimulator(cmd: SimulatorCommand): { op: OpStatus; lifecycleEvent?: string } shape), and Ruling R5 (Tasks 2–5 execute sequentially). Rulings R3 and R4 are superseded by the user’s Codex policy.
- Preserve the current application state: Phase 0 Task 1 remains done and reviewed, Task 2 (lifecycle state machine) remains next, and the development Node prerequisite of >=22.22.2 or >=24.15.0 remains before application Task 3. Do not mark Task 2 complete or change any application task status.
- Create exactly these seven active skill directories, each with exactly SKILL.md and agents/openai.yaml: mm-phase-workflow, mm-invariants, mm-electron-foundation, mm-realtime-voice, mm-wake-word, mm-live2d-avatar, and mm-face-identity.
- Initialize every new skill with the installed skill-creator init_skill.py, pass valid display_name, short_description, and $skill-name-containing default_prompt interface values, then run quick_validate.py against that one skill before moving on. Do not batch skill creation or validation.
- Translate harness vocabulary only. Preserve each source skill’s name, trigger intent, safety rules, product facts, version pins, dependencies, phase workflow, and invariant references. In particular, gpt-5.6-luna is the worker harness model, never a replacement for any configured Magic Mirror runtime model ID.
- Before active AGENTS.md and .agents/skills exist, run fresh Luna/max RED baselines for mm-phase-workflow and mm-invariants and store the prompts, outputs, and absence evidence in the ignored SDD ledger. After each process skill migration, run its fresh Luna/max GREEN behavior evaluation. Each of the five domain skills gets positive-trigger, negative-trigger, retrieval, and application-forward tests after migration.
- Migrate and validate one skill at a time. The next skill may not be initialized until the prior skill’s frontmatter, UI metadata, source-preservation diff, trigger/retrieval/application evidence where applicable, worker self-review, and root external review are accepted.
- All worker prompts that touch Magic Mirror behavior carry the relevant canonical invariant IDs. At minimum preserve: (1) RAM-only transcript/audio/private context and memory values; (2) face recognition is candidate-only with verbal confirmation; (3) guest IDs stay in Main; (4) profile change closes old history and confirms in a clean session; (5) jobs use owner-at-turn-start snapshots; (6) control turns skip extraction; (7) scenes require exact normalized spell matching and consume one turn; (8) one microphone owner with release/acquire handoff; (9) every ignore/drop/fallback is visible with a metadata-only reason; (10) failures degrade rather than gate and never black-screen; (11) model IDs come only from config with no silent substitution; and (12) credentials use Main-only safeStorage.
- No application feature code, product source, runtime model ID, dependency, lockfile, renderer, Main-process, test, or package configuration change is permitted. The only tracked changes are the control plane, seven target skills, and the three process records, plus this plan artifact.
- Every tracked task ends with git diff --check, a scope check, root external review, and one conventional commit. The RED task may also record ignored evidence; its tracked status note is committed. Never commit generated application artifacts or raw transcript/audio/private data.
- All tracked edits use apply_patch. Ignored generated hashes, ledgers, forward-test reports, and final-validation reports are also created or updated with apply_patch after commands compute values; do not use Set-Content, Out-File, Add-Content, redirection, or another shell write shortcut for repository artifacts. Commands may print computed values for the worker to place into an apply_patch hunk.
- Every per-task scope check compares the full working-tree tracked and untracked delta against the exact task allowlist; it must not pre-filter status output to allowed paths. The final scope check compares commit range 15eae49..HEAD plus the current working-tree delta against the final allowlist, which includes this plan and the one-line design status update.
- Commands in this plan are PowerShell-safe and use repository-relative paths from C:\Project\magic-mirror. If a local Codex discovery probe is unavailable, record the exact command and failure reason; do not substitute another model or weaken static validation.

## File Map

Tracked files created or changed by the execution of this plan:

| Path | Responsibility |
|---|---|
| AGENTS.md | Root/worker boundary, explicit dispatch envelope, scope rules, immutable-source rule, three-pass self-review cap, and R1/R2/R5/R3/R4 process policy. |
| .codex/config.toml | [agents] Luna/max routing backstop. |
| .codex/agents/implementer.toml | Bounded implementation role with Luna/max, scoped writes, invariant and evidence contract. |
| .codex/agents/surveyor.toml | Read-only repository survey/research role with Luna/max, citations, and verified/unverified findings. |
| .codex/agents/tester.toml | Validation role with Luna/max, command-output evidence, and no behavior changes. |
| .agents/skills/mm-phase-workflow/{SKILL.md,agents/openai.yaml} | Codex process skill for phase slicing, dispatch, demo, and exit evidence. |
| .agents/skills/mm-invariants/{SKILL.md,agents/openai.yaml} | Codex process skill carrying the 12 canonical Magic Mirror invariants. |
| .agents/skills/mm-electron-foundation/{SKILL.md,agents/openai.yaml} | Electron/Main/IPC/SQLite/config/credential foundation guidance. |
| .agents/skills/mm-realtime-voice/{SKILL.md,agents/openai.yaml} | Realtime/WebRTC/privacy/session/extractor guidance. |
| .agents/skills/mm-wake-word/{SKILL.md,agents/openai.yaml} | Wake worker, keyword encoding, tuning, and microphone handoff guidance. |
| .agents/skills/mm-live2d-avatar/{SKILL.md,agents/openai.yaml} | Cubism/MotionSync/audio-clock/lip-sync/avatar guidance. |
| .agents/skills/mm-face-identity/{SKILL.md,agents/openai.yaml} | YuNet/SFace candidate identity, enrollment, rebuild, and camera degradation guidance. |
| DECISIONS.md | Newest-first Codex routing ADR while retaining earlier durable decisions. |
| PROGRESS.md | Harness migration state and final evidence without changing Phase 0 application status. |
| .superpowers/sdd/2026-08-16-phase0-foundation/progress.md | Ignored operational ledger with RED/GREEN evidence and superseded routing rulings. |

Ignored operational artifacts created only for evidence:

| Path | Responsibility |
|---|---|
| .superpowers/sdd/2026-08-16-phase0-foundation/immutable-source-hashes.json | Baseline SHA-256 values for CLAUDE.md and all seven legacy source skills. |
| .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/*.md | Per-skill application-forward evidence; metadata and code snippets only, never user content. |
| .superpowers/sdd/2026-08-16-phase0-foundation/final-validation.md | Complete final tester command output and local discovery limitation, if any. |

Never modify: CLAUDE.md, .claude/skills/**, docs/Magic_Mirror_*.md, src/**, tests/**, package.json, package-lock.json, electron.vite.config.ts, tsconfig*.json, and vitest.config.ts.

## Pre-execution Planning Checkpoint

Before Task 1 starts, root applies this plan and exactly the one-line design status change from awaiting written-spec review to approved for implementation, then reviews and commits only those two paths. Root runs the following PowerShell check before dispatching any execution worker:

~~~powershell
$checkpointAllowed = @('docs/superpowers/plans/2026-08-17-codex-harness-migration.md','docs/superpowers/specs/2026-08-16-codex-harness-migration-design.md')
$checkpointChanged = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$checkpointUnexpected = @(Compare-Object -ReferenceObject $checkpointAllowed -DifferenceObject $checkpointChanged | Where-Object SideIndicator -eq '=>' | ForEach-Object InputObject)
if ($checkpointUnexpected.Count -ne 0) { throw "Unexpected pre-execution scope: $($checkpointUnexpected -join ', ')" }
if ((git diff --numstat -- docs/superpowers/specs/2026-08-16-codex-harness-migration-design.md | Measure-Object -Line).Lines -ne 1) { throw 'Design status update is not exactly one changed line' }
git diff --check
git add -- docs/superpowers/plans/2026-08-17-codex-harness-migration.md docs/superpowers/specs/2026-08-16-codex-harness-migration-design.md
git commit -m "docs: approve codex harness migration plan"
~~~

Expected evidence: one commit contains only the plan and the one-line status update; the plan’s execution baseline remains commit 15eae49 for the final range comparison. Root does not launch Task 1 until this checkpoint is green.

## Worker Dispatch Contract

For every task below, the root dispatches a fresh worker with the following fields. The root supplies the task-specific prompt verbatim after the common fields:

~~~
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: one of "implementer", "surveyor", or "tester"
fresh_worker: true
write_scope: the exact task Files list; read-only for surveyor/tester unless an ignored evidence path is named
evidence: exact files changed, diff summary, commands with complete output, and unresolved risks
self_invariants: include the relevant canonical invariant IDs; for any skill or behavior evaluation use IDs 1–12 and report metadata-only evidence
self_review: read your own diff/output; no more than 3 passes; do not create a review worker
root_review: external root gate after your return; it is not part of your self-review count
~~~

Root launches every execution worker with this exact PowerShell-safe command, substituting only the task prompt string; the executable is resolved from PATH so no versioned executable path is embedded:

~~~powershell
$codex = (Get-Command codex).Source
& $codex exec --profile nova-auto --ephemeral --cd 'C:\Project\magic-mirror' -m gpt-5.6-luna -c 'model_reasoning_effort="max"' $taskPrompt
~~~

The task prompt must include the role, exact write scope, invariant IDs, and evidence contract from the common fields. The root must reject a profile-less execution or a dispatch that omits either explicit model or explicit reasoning effort, even when .codex/config.toml supplies a default. The collaboration API has no profile argument and therefore must not be used for execution work after approval. A worker may read source documents needed for its bounded task; root does not perform that exploratory reading on the worker’s behalf. A surveyor may not write tracked files. A tester may write only the named ignored evidence artifact. All worker prompts say “Do not edit immutable legacy source files” and “Do not create a review worker.” All workers preserve invariant IDs 1–12 when their task touches product behavior.

When a worker uses the local Codex CLI for a discovery or dry-run, it uses the same profile-backed command with --profile nova-auto, --model gpt-5.6-luna, and an explicit max reasoning override. Collaboration spawn envelopes have no profile field and are not an execution substitute.

## Task 1: Freeze Sources and Capture RED Baselines

**Files:**

- Modify: PROGRESS.md (add only a harness-migration status note; preserve every application task/status line)
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/progress.md (append-only RED evidence)
- Create: .superpowers/sdd/2026-08-16-phase0-foundation/immutable-source-hashes.json (ignored hash receipt)
- Do not modify: CLAUDE.md, .claude/skills/**, active control-plane or skill paths (they must not exist yet)

**Interfaces:** Produces the immutable-source hash receipt and two recorded RED baselines. Consumes the existing design, Phase 0 plan, source skills, and current SDD ledger. No application code or dependency is touched.

- [ ] **Step 1: Launch a fresh profile-backed read-only Luna/max tester to verify the pre-migration state.** Root launches it through the Worker Dispatch Contract CLI with `--profile nova-auto`, role `tester`, and write_scope `none`; use the common fields and this exact prompt:

~~~
In C:\Project\magic-mirror, verify the pre-migration state for the Codex harness plan. Run:
  git branch --show-current
  Test-Path -LiteralPath AGENTS.md
  Test-Path -LiteralPath .codex
  Test-Path -LiteralPath .agents
$codex = (Get-Command codex).Source
$profileOutput = & $codex exec --profile nova-auto --ephemeral --cd 'C:\Project\magic-mirror' -m gpt-5.6-luna -c 'model_reasoning_effort="max"' 'Return exactly PROFILE_READY.' 2>&1
if ($LASTEXITCODE -ne 0 -or ($profileOutput -notmatch 'PROFILE_READY')) { throw 'nova-auto profile failed to load; no secret-bearing output may be recorded' }
  Get-ChildItem -LiteralPath .claude\skills -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
Do not edit any file. Return the exact outputs for the repository checks, but report only the profile probe exit code plus PROFILE_READY or a non-secret failure reason; never print profile contents, credentials, or environment secrets. Confirm branch phase0-foundation, confirm AGENTS.md/.codex/.agents are absent, and confirm exactly the seven legacy skill names. Do not create a review worker.
~~~

Expected evidence: branch phase0-foundation; the three active paths report False; the source names are exactly mm-electron-foundation, mm-face-identity, mm-invariants, mm-live2d-avatar, mm-phase-workflow, mm-realtime-voice, and mm-wake-word; the profile probe exits 0 and returns PROFILE_READY without exposing profile contents or secrets.

- [ ] **Step 2: Assign the hash receipt and pre-flight record to a fresh profile-backed Luna/max implementer.** Root launches a fresh CLI worker with role implementer and exact write scope `PROGRESS.md, .superpowers/sdd/2026-08-16-phase0-foundation/progress.md, .superpowers/sdd/2026-08-16-phase0-foundation/immutable-source-hashes.json`, using the Worker Dispatch Contract command. The worker runs this read-only computation and prints the values:

~~~powershell
$hashRoot = '.superpowers/sdd/2026-08-16-phase0-foundation'
New-Item -ItemType Directory -Force -Path $hashRoot | Out-Null
$immutablePaths = @((Resolve-Path -LiteralPath 'CLAUDE.md').Path) + @(
  Get-ChildItem -LiteralPath '.claude/skills' -Recurse -File |
    Sort-Object FullName |
    ForEach-Object { $_.FullName }
)
$hashRecords = foreach ($path in $immutablePaths) {
  $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
  [ordered]@{ path = (Resolve-Path -LiteralPath $path -Relative); sha256 = $hash.Hash }
}
$hashRecords | ConvertTo-Json -Depth 3
~~~

The worker then uses apply_patch to create the ignored JSON receipt from those printed values and append the pre-flight section plus the harness status note to the ledger and PROGRESS.md. It must not use Set-Content, Out-File, Add-Content, or redirection. Expected evidence: one JSON object per source file, including CLAUDE.md plus seven .claude/skills/*/SKILL.md files, with 64-hex-character SHA-256 values. The file is ignored and is the comparison baseline, not a product artifact.

- [ ] **Step 3: Run the fresh profile-backed mm-phase-workflow RED baseline before active skills exist.** Root launches a fresh CLI tester with role tester, write_scope none, and the exact Worker Dispatch Contract command plus this prompt:

~~~
In C:\Project\magic-mirror, run a RED baseline for the future active mm-phase-workflow skill without reading or using .claude/skills. Confirm that .agents/skills/mm-phase-workflow/SKILL.md does not exist. Then answer this request using only currently active repository instructions: “Plan one bounded Phase 0 Task 2 lifecycle unit with a mock-first path, a failure-path test, a Console increment, an explicit worker route, and a root review gate.” Report whether active skill retrieval succeeded, whether a current AGENTS.md route exists, and whether the requested process contract is supplied by an active skill. Do not edit files and do not create a review worker.
~~~

Expected RED evidence: active_skill_path_exists: false, active_skill_retrieval: RED, and no active AGENTS.md dispatch contract. The worker may still reason about the request; the baseline is RED because the target skill and control plane are absent.

- [ ] **Step 4: Run the fresh profile-backed mm-invariants RED baseline before active skills exist.** Root launches a fresh CLI tester with role tester, write_scope none, and the exact Worker Dispatch Contract command plus this prompt:

~~~
In C:\Project\magic-mirror, run a RED baseline for the future active mm-invariants skill without reading or using .claude/skills. Confirm that .agents/skills/mm-invariants/SKILL.md does not exist. Then answer this request using only currently active repository instructions: “Design a test for a profile-switch IPC change and list the Magic Mirror safety checks that must reject transcript persistence, guest-ID leakage, model substitution, and microphone ownership violations.” Report whether active skill retrieval succeeded, whether the canonical 12-invariant checklist is available from an active skill, and whether the request has an active worker-dispatch contract. Do not edit files and do not create a review worker.
~~~

Expected RED evidence: active_skill_path_exists: false, active_skill_retrieval: RED, and no active canonical checklist source. The baseline must not copy private content or write artifacts.

- [ ] **Step 5: Assign baseline evidence recording to a fresh profile-backed Luna/max implementer.** Root launches a fresh CLI implementer with exact write scope `.superpowers/sdd/2026-08-16-phase0-foundation/progress.md` and the Worker Dispatch Contract command, injecting the two tester outputs. The worker uses apply_patch to append dated sections named Codex migration pre-flight, mm-phase-workflow RED, and mm-invariants RED to the ignored ledger. It must not use shell file-writing shortcuts. Include the exact worker model/effort/role, prompts, command output, the hash receipt path, and explicit RED reasons; do not alter the Task 2 next action or Node prerequisite.

- [ ] **Step 6: Run the scoped checks and root external review.** Run:

~~~powershell
git diff --check
$allowed = @('PROGRESS.md')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object SideIndicator -eq '=>' | ForEach-Object InputObject)
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
$hashJson = Get-Content -Raw '.superpowers/sdd/2026-08-16-phase0-foundation/immutable-source-hashes.json' | ConvertFrom-Json
$sourcePaths = @((Resolve-Path -LiteralPath 'CLAUDE.md').Path) + @(Get-ChildItem -LiteralPath '.claude/skills' -Recurse -File | Sort-Object FullName | ForEach-Object FullName)
foreach ($sourcePath in $sourcePaths) { $relative = Resolve-Path -LiteralPath $sourcePath -Relative; $record = $hashJson | Where-Object path -eq $relative; if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $record.sha256) { throw "Immutable source changed: $relative" } }
~~~

Expected result: only the intended PROGRESS.md tracked note is changed in the full working-tree delta and every immutable source hash still matches. Root reviews the worker evidence against the design, including that root review is external to worker self-review and no worker spawned another agent.

- [ ] **Step 7: Commit this tracked RED-baseline deliverable.** Run:

~~~powershell
git add -- PROGRESS.md
git commit -m "chore: capture codex harness red baselines"
~~~

Expected evidence: one commit containing only the migration status note; the ignored ledger and hash receipt remain on disk for later tasks.

## Task 2: Add the Codex Control Plane

**Files:**

- Create: AGENTS.md
- Create: .codex/config.toml
- Create: .codex/agents/implementer.toml
- Create: .codex/agents/surveyor.toml
- Create: .codex/agents/tester.toml
- Read-only inputs: approved design, PROGRESS.md, DECISIONS.md, and the seven source skills

**Interfaces:** AGENTS.md is the human-readable dispatch contract. .codex/config.toml must contain exactly the [agents] backstop keys default_subagent_model = "gpt-5.6-luna" and default_subagent_reasoning_effort = "max". Each role file follows the installed project custom-agent schema: name, description, model = "gpt-5.6-luna", model_reasoning_effort = "max", and developer_instructions.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer with the control-plane write scope.** Root uses the exact Worker Dispatch Contract CLI command with role implementer and write_scope `AGENTS.md, .codex/config.toml, .codex/agents/implementer.toml, .codex/agents/surveyor.toml, .codex/agents/tester.toml`, and supplies this exact prompt:

~~~
Read the approved design at docs/superpowers/specs/2026-08-16-codex-harness-migration-design.md, current PROGRESS.md and DECISIONS.md, and all seven .claude/skills/*/SKILL.md source files. Create only the Codex control-plane files named in this task. Do not edit CLAUDE.md, .claude/skills, product docs, src, tests, package files, or the plan.

AGENTS.md must state: the root Codex thread alone orchestrates and reviews; root does not implement, perform exploratory repository survey/research, or execute tests; every worker dispatch explicitly supplies model gpt-5.6-luna, reasoning_effort max, exactly one role, bounded task, exact files, relevant skill paths, invariant IDs, write/read-only scope, and evidence format; no separate review role is created; root review is external to worker self-review; every current and future plan and worker self-review is capped at 3 passes; the legacy harness document and seven source skills are immutable; R1/R2/R5 remain, R3/R4 are superseded; Task 2 remains next and the Node >=22.22.2 or >=24.15.0 prerequisite remains before application Task 3; no application feature or dependency changes; every Codex CLI discovery or dry-run passes --profile nova-auto, while collaboration spawn calls have no profile field and still require explicit Luna/max.

.codex/config.toml must be:
[agents]
default_subagent_model = "gpt-5.6-luna"
default_subagent_reasoning_effort = "max"
It may carry a non-secret comment that CLI discovery/dry-runs use --profile nova-auto; the profile itself is user-level and is never copied into project files.

Use the installed custom-agent TOML schema. Each role file must declare its name, description, model = "gpt-5.6-luna", model_reasoning_effort = "max", and developer_instructions. The implementer role permits only its named bounded writes and requires invariant/evidence reporting. The surveyor role is read-only and requires cited primary-source URLs for external research plus verified/unverified labels. The tester role runs only named validation commands, may write only named ignored evidence, and returns complete output. None may create a separate review role or silently choose a different model.

Use imperative wording, metadata-only examples, and no stale legacy harness vocabulary in active files. Refer to the immutable legacy sources without embedding their old path or model vocabulary in active files. Do not create .codex/agents/reviewer.toml. Return the diff, parsed field summary, and any schema limitation; do not create a review worker.
~~~

- [ ] **Step 2: Implement the exact control-plane files with apply_patch.** Include no generic model defaults other than the two required config values. In every role’s developer_instructions, repeat the explicit Luna/max requirement, narrow scope, no review-worker creation, metadata-only/privacy rule, and maximum-three-self-review rule. Keep role names exactly implementer, surveyor, and tester.

- [ ] **Step 3: Parse and inspect every TOML file.** Run:

~~~powershell
$tomlFiles = @('.codex/config.toml') + @(Get-ChildItem -LiteralPath '.codex/agents' -Filter '*.toml' -File | Sort-Object Name | ForEach-Object { $_.FullName })
foreach ($tomlFile in $tomlFiles) {
  python -c "import pathlib, tomllib; p=pathlib.Path(r'$tomlFile'); tomllib.loads(p.read_text(encoding='utf-8')); print('TOML PASS: '+str(p))"
}
$roleNames = @(Get-ChildItem -LiteralPath '.codex/agents' -Filter '*.toml' -File | Sort-Object Name | ForEach-Object { $_.BaseName })
$expectedRoles = @('implementer','surveyor','tester')
if ((Compare-Object -ReferenceObject $expectedRoles -DifferenceObject $roleNames).Count -ne 0) { throw "Role set mismatch: $($roleNames -join ', ')" }
$agentsText = Get-Content -Raw 'AGENTS.md'
if ($agentsText -notmatch '--profile nova-auto') { throw 'AGENTS.md does not require the nova-auto profile for Codex CLI calls' }
$configText = Get-Content -Raw '.codex/config.toml'
if ($configText -notmatch '--profile nova-auto') { throw '.codex/config.toml does not document the required CLI profile' }
~~~

Expected evidence: all four files parse; role set is exactly the three expected names; each role has model equal to gpt-5.6-luna and model_reasoning_effort equal to max; no reviewer file exists.

- [ ] **Step 4: Scan active control files for actual stale routing forms and unresolved template text.** Provenance, immutability, and prohibition wording is allowed; only active route instructions fail. Run:

~~~powershell
$activeFiles = @('AGENTS.md') + @('.codex/config.toml') + @(Get-ChildItem -LiteralPath '.codex' -Recurse -File | ForEach-Object { $_.FullName })
$legacyPatterns = @('model\s*:\s*"opus"','model\s*=\s*"opus"','subagent_type\s*:\s*"general-purpose"','(?i)(use|load|read|invoke|dispatch)[^\r\n]*\.claude[\\/]skills','(?i)Claude\s+Agent(?:[ -]tool)?\s+(?:tool|instruction|invocation)')
foreach ($pattern in $legacyPatterns) { $legacy = & rg -n -i $pattern -- $activeFiles; if ($LASTEXITCODE -eq 0) { $legacy | Write-Output; throw "Legacy active route found: $pattern" } }
$markers = @('T' + 'BD','TO' + 'DO','implement ' + 'later','fill ' + 'in details')
foreach ($marker in $markers) { $templates = & rg -n -i --fixed-strings $marker -- $activeFiles; if ($LASTEXITCODE -eq 0) { $templates | Write-Output; throw 'Unresolved template text found' } }
~~~

Expected evidence: both scans return no matches. Root review checks that active wording still makes root review external to worker self-review and sets the three-pass cap.

- [ ] **Step 5: Check the full working-tree scope and commit the control plane.** Run git diff --check, compare all tracked and untracked status paths against the exact five task paths, obtain root external review, then:

~~~powershell
git add -- AGENTS.md .codex/config.toml .codex/agents/implementer.toml .codex/agents/surveyor.toml .codex/agents/tester.toml
git commit -m "chore: add codex worker control plane"
~~~

Use this full-delta check before the commit:

~~~powershell
$allowed = @('AGENTS.md','.codex/config.toml','.codex/agents/implementer.toml','.codex/agents/surveyor.toml','.codex/agents/tester.toml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object SideIndicator -eq '=>' | ForEach-Object InputObject)
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
~~~

## Task 3: Migrate and GREEN-Test mm-phase-workflow

**Files:**

- Create: .agents/skills/mm-phase-workflow/SKILL.md
- Create: .agents/skills/mm-phase-workflow/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/progress.md (GREEN behavior evidence only)
- Read-only source: .claude/skills/mm-phase-workflow/SKILL.md

**Interfaces:** Target frontmatter name remains mm-phase-workflow. Preserve phase order 0 Foundation/Console → 1 Realtime Voice → 2 Wake Lifecycle → 3 Avatar/Audio → 4 Scenes → 5 Identity/Profiles → 6 Memory → 7 Field Hardening; the 0.5–2 day unit template; one implementation unit per dispatch; mock-first; failure/fallback test and Console increment; phase demo and exit evidence; and no phase advance when exit evidence fails. Translate only the worker route to explicit Luna/max implementer dispatch and root-owned review.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer with scope limited to this skill and its ignored evidence.** Root uses the Worker Dispatch Contract CLI command with role implementer, write_scope `.agents/skills/mm-phase-workflow/**, .superpowers/sdd/2026-08-16-phase0-foundation/progress.md`, and this prompt:

~~~
Read .claude/skills/mm-phase-workflow/SKILL.md, the approved migration design, AGENTS.md, the writing-plans guidance already supplied for this plan, and the existing SDD ledger. Run the installed script exactly:
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-phase-workflow --path .agents\skills --interface 'display_name=MM Phase Workflow' --interface 'short_description=Plan and route Magic Mirror phase units' --interface 'default_prompt=Use $mm-phase-workflow to plan one bounded Magic Mirror phase unit.'
Then replace only the generated SKILL.md body/frontmatter with a faithful Codex translation of the source. Preserve the phase order, unit template, mock-first rule, one-unit dispatch, failure-path test, Console increment, demos, and exit gate. Every worker route must say model gpt-5.6-luna and reasoning_effort max explicitly; root alone reviews; no separate review worker; self-review is at most 3 passes and root review is external. Do not mention or copy legacy harness paths or model names into active text. Do not edit CLAUDE.md or .claude/skills.
~~~

- [ ] **Step 2: Validate this one skill and its UI metadata before any other skill is touched.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills\mm-phase-workflow
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-phase-workflow/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-phase-workflow' in i['default_prompt']; print('openai.yaml PASS')"
~~~

Expected evidence: Skill is valid!, valid YAML with only the three interface keys, a 25–64-character short description, and a default prompt containing $mm-phase-workflow.

- [ ] **Step 3: Run the fresh profile-backed Luna/max GREEN behavior evaluation.** Root launches a fresh CLI tester with write_scope `.superpowers/sdd/2026-08-16-phase0-foundation/progress.md` via the Worker Dispatch Contract command and this exact prompt:

~~~
Use the active skill at .agents/skills/mm-phase-workflow for this request: “Plan one Phase 0 Task 2 lifecycle unit.” Return a compact dispatch brief containing all eight source unit-template fields, a mock-first step, a failure/fallback test, a Console increment, a phase-demo step, and an exit-evidence gate. State the worker route exactly as model gpt-5.6-luna with reasoning_effort max, name role implementer, state that root alone reviews, and state that no separate review worker is created. Include the target skill path selected and the source facts retrieved. Do not edit tracked files or create another agent.
~~~

Expected GREEN evidence: target skill selected; all eight fields present; mock-first, failure path, Console increment, demo, exit gate, explicit Luna/max route, root review, and no separate review role all appear. The tester returns the prompt, full output, RED-to-GREEN comparison, and validation command output; a profile-backed implementer with the named ledger write scope uses apply_patch to append that evidence.

- [ ] **Step 4: Run a negative trigger check in the same tester turn.** Use the exact unrelated prompt Write a short product-neutral explanation of why sorted JSON keys make SHA-256 fingerprints deterministic. Expected result: mm-phase-workflow is not selected, or the tester records a local discovery limitation instead of claiming a false selection.

- [ ] **Step 5: Root reviews the source/target diff and evidence, then commits only this skill.** Run git diff --check; verify no other .agents/skills directory exists besides the one being validated; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-phase-workflow/SKILL.md','.agents/skills/mm-phase-workflow/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-phase-workflow/SKILL.md .agents/skills/mm-phase-workflow/agents/openai.yaml
git commit -m "feat: migrate mm-phase-workflow skill"
~~~

## Task 4: Migrate and GREEN-Test mm-invariants

**Files:**

- Create: .agents/skills/mm-invariants/SKILL.md
- Create: .agents/skills/mm-invariants/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/progress.md (GREEN behavior evidence only)
- Read-only source: .claude/skills/mm-invariants/SKILL.md

**Interfaces:** Target frontmatter name remains mm-invariants. Preserve all 12 canonical rules, their source anchors, the classic-shortcut resolutions, red flags, and accepted scope notes. The active skill must require the checklist in every implementation/test dispatch, keep all diagnostics metadata-only, and state the three-pass self-review cap plus root external review. No product invariant may be weakened or renamed.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer and initialize only this skill.** Root uses the Worker Dispatch Contract CLI command with role implementer, write_scope `.agents/skills/mm-invariants/**, .superpowers/sdd/2026-08-16-phase0-foundation/progress.md`, and this prompt:

~~~
Read .claude/skills/mm-invariants/SKILL.md, the approved migration design, AGENTS.md, and the existing SDD ledger. Initialize only this target with:
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-invariants --path .agents\skills --interface 'display_name=MM Invariants' --interface 'short_description=Apply Magic Mirror privacy and safety invariants' --interface 'default_prompt=Use $mm-invariants to check a Magic Mirror change against all canonical invariants.'
Replace the generated SKILL.md with a faithful active Codex copy of the source. Preserve the complete 12-row table, anchors, shortcut resolutions, red flags, and accepted scope notes exactly in substance. Add only the harness translation: every implementation/test worker prompt carries the checklist; workers are explicit Luna/max; root alone reviews; no separate review worker; self-review max 3 passes and root review external. Do not edit CLAUDE.md, .claude/skills, product files, or application files.
~~~

- [ ] **Step 2: Run individual frontmatter, metadata, and quick validation checks.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills/mm-invariants
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-invariants/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-invariants' in i['default_prompt']; print('openai.yaml PASS')"
$content = Get-Content -Raw '.agents/skills/mm-invariants/SKILL.md'
foreach ($needle in @('RAM only','verbal confirmation','guestId','ownerProfileIdAtTurnStart','controlIntent','exact full-transcript','one mic','degrade','safeStorage')) { if ($content -notmatch [regex]::Escape($needle)) { throw "Missing invariant evidence: $needle" } }
~~~

Expected evidence: quick validation passes, metadata has only valid interface keys, and the source-derived terms for all 12 rules are present.

- [ ] **Step 3: Run the fresh profile-backed Luna/max GREEN behavior evaluation.** Root launches a fresh CLI tester with the named ignored ledger write scope via the Worker Dispatch Contract command and this exact prompt:

~~~
Use the active skill at .agents/skills/mm-invariants for this request: “Design a test for a profile-switch IPC change.” Return the complete canonical 12-invariant checklist by number, then state the rejection/evidence behavior for transcript persistence, guest-ID leakage, silent model substitution, microphone ownership violations, control-turn extraction, and candidate-only face matching. State that diagnostics are metadata-only, workers use explicit model gpt-5.6-luna and reasoning_effort max, root review is external, and no separate review worker is created. Include the selected skill path. Do not edit tracked files or create another agent.
~~~

Expected GREEN evidence: all IDs 1–12 appear with the source rules; the six adversarial cases are explicitly rejected or degraded visibly; metadata-only and routing boundaries are present. The tester returns the full output and RED-to-GREEN result; a profile-backed implementer with the named ledger write scope uses apply_patch to append it to the ledger.

- [ ] **Step 4: Run the negative trigger check.** Use the exact unrelated prompt Create a pure TypeScript helper that sorts object keys before hashing. Expected result: mm-invariants is not selected, or the tester records the local discovery limitation without claiming a false positive.

- [ ] **Step 5: Root reviews and commits only this skill.** Run git diff --check; verify Task 3’s skill is unchanged; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-invariants/SKILL.md','.agents/skills/mm-invariants/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-invariants/SKILL.md .agents/skills/mm-invariants/agents/openai.yaml
git commit -m "feat: migrate mm-invariants skill"
~~~

## Task 5: Migrate and Validate mm-electron-foundation

**Files:**

- Create: .agents/skills/mm-electron-foundation/SKILL.md
- Create: .agents/skills/mm-electron-foundation/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/mm-electron-foundation.md
- Read-only source: .claude/skills/mm-electron-foundation/SKILL.md

**Interfaces:** Preserve Electron 43.x, electron-vite 5, TypeScript/React, XState 5, node:sqlite, WAL, safeStorage with Keychain/DPAPI, Main-owned IPC and workers, TCC/kiosk/crash recovery behavior, and the prohibition on keytar. Preserve sender-frame/webContents validation, simpleFullscreen, LaunchAgent restart ownership, config atomic writes, and OfflineLoop non-black fallback. No package is installed.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer to initialize and translate only this skill.** Root uses the Worker Dispatch Contract CLI command with role implementer, write_scope `.agents/skills/mm-electron-foundation/**, .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/mm-electron-foundation.md`, and runs:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-electron-foundation --path .agents\skills --interface 'display_name=MM Electron Foundation' --interface 'short_description=Design safe Electron shell and IPC boundaries' --interface 'default_prompt=Use $mm-electron-foundation to design a safe Magic Mirror Electron boundary.'
~~~

Replace only the generated target SKILL.md with a source-grounded migration. Keep source facts and pins unchanged; add only explicit Luna/max worker routing, root-only review, no separate review worker, three-pass cap, immutable legacy-source wording, and metadata-only evidence instructions.

- [ ] **Step 2: Validate frontmatter and UI metadata.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills/mm-electron-foundation
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-electron-foundation/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-electron-foundation' in i['default_prompt']; print('openai.yaml PASS')"
~~~

Expected evidence: valid frontmatter and exactly the three valid interface fields.

- [ ] **Step 3: Run positive and negative trigger tests with a fresh profile-backed Luna/max tester.** Root uses the Worker Dispatch Contract CLI command with role tester, write scope only to the named forward-test file, and supplies these exact prompts:

~~~
Positive trigger: “Add a Main-owned Electron IPC handler that opens a node:sqlite database in WAL mode and stores an API credential through safeStorage.” Use .agents/skills/mm-electron-foundation and report whether it is selected.
Negative trigger: “Explain why canonical JSON sorting produces stable hashes in a pure language-neutral utility.” Report whether mm-electron-foundation is not selected.
Do not edit source or application files, do not create another agent, and return raw selection evidence.
~~~

Expected evidence: positive selection; negative non-selection or an explicit local discovery limitation. The tester returns both outputs; a profile-backed implementer with the named forward-test write scope uses apply_patch to record them in forward-tests/mm-electron-foundation.md.

- [ ] **Step 4: Run retrieval and application-forward tests with fresh profile-backed Luna/max workers.** Root launches fresh CLI tester and implementer workers, each through the Worker Dispatch Contract command with their exact role and named forward-test write scope. Retrieval prompt:

~~~
Use .agents/skills/mm-electron-foundation to answer: which Electron major, SQLite module and journal mode, credential store, IPC sender check, and restart owner does Magic Mirror require? Quote the exact identifiers and explain that the renderer never opens SQLite. Return the selected skill path and no file changes.
~~~

Application-forward prompt to a fresh implementer with write scope only to the ignored forward-test file:

~~~
Use .agents/skills/mm-electron-foundation to produce a metadata-only validation note for a hypothetical Phase 0 IPC/SQLite change. Include a complete node:sqlite plus PRAGMA journal_mode = WAL check, senderFrame/webContents validation, Main-only safeStorage credential handling, and a crash-recovery/TCC degradation check. Do not modify src, tests, package files, or dependencies. Return the note and list every pinned identifier preserved.
~~~

Expected evidence: retrieval names Electron 43.x, node:sqlite, WAL, safeStorage, sender validation, and LaunchAgent/in-app recovery; forward note contains no feature diff, no keytar, no secrets, and no runtime model substitution. Workers return prompts and complete outputs; the implementer uses apply_patch to record them in the ignored file.

- [ ] **Step 5: Root reviews source preservation, all four tests, and scope, then commits only this skill.** Run git diff --check; verify Tasks 3–4 are unchanged; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-electron-foundation/SKILL.md','.agents/skills/mm-electron-foundation/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-electron-foundation/SKILL.md .agents/skills/mm-electron-foundation/agents/openai.yaml
git commit -m "feat: migrate mm-electron-foundation skill"
~~~

## Task 6: Migrate and Validate mm-realtime-voice

**Files:**

- Create: .agents/skills/mm-realtime-voice/SKILL.md
- Create: .agents/skills/mm-realtime-voice/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/mm-realtime-voice.md
- Read-only source: .claude/skills/mm-realtime-voice/SKILL.md

**Interfaces:** Preserve @openai/agents 0.16.0, openai 7.4.0, @openai/agents/realtime, WebRTC transport with both media stream and audio element, gpt-realtime-2.1, gpt-live-transcribe, gpt-4o-mini-transcribe, marin/cedar, configured gpt-5.6-luna/gpt-5.6-terra extractor tiers, snapshot boundaries, privacy flags, Main-only ephemeral credentials, playback-end clock, and session rollover/clean profile-switch rules. The worker harness route must never replace a runtime model ID.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer to initialize and translate this skill only.** Root uses the Worker Dispatch Contract CLI command with the exact write scope and runs:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-realtime-voice --path .agents\skills --interface 'display_name=MM Realtime Voice' --interface 'short_description=Apply pinned Realtime voice and privacy contracts' --interface 'default_prompt=Use $mm-realtime-voice to apply the Magic Mirror Realtime voice contract.'
~~~

Read the source and design; preserve every SDK/version/model/voice/privacy/session/extractor fact; translate only routing to explicit Luna/max workers and root-only review. Do not edit any other file.

- [ ] **Step 2: Run quick validation and metadata parsing.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills/mm-realtime-voice
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-realtime-voice/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-realtime-voice' in i['default_prompt']; print('openai.yaml PASS')"
~~~

- [ ] **Step 3: Run positive and negative trigger tests with a fresh profile-backed Luna/max tester.** Root uses the Worker Dispatch Contract CLI command with role tester and the named forward-test write scope. Use:

~~~
Positive trigger: “Configure a RealtimeSession over WebRTC with an ephemeral credential, input transcription, an output voice, and a clean-session profile switch.” Use .agents/skills/mm-realtime-voice and report selection.
Negative trigger: “Write a SQLite migration that creates an app_migrations table and enables WAL.” Report that mm-realtime-voice is not selected.
Do not edit tracked files or create another agent; return raw selection evidence.
~~~

Expected evidence: positive selection and negative non-selection or a recorded discovery limitation. The tester returns both outputs; a profile-backed implementer uses apply_patch to store them in the named ignored forward-test file.

- [ ] **Step 4: Run retrieval and application-forward tests with fresh profile-backed Luna/max workers.** Root launches tester and implementer CLI workers through the Worker Dispatch Contract command with their exact roles and named forward-test write scope. Retrieval prompt:

~~~
Use .agents/skills/mm-realtime-voice to list the exact SDK/package versions, Realtime model, transcription IDs, recommended voices, privacy flags, playback-end event boundary, and session snapshot/rollover rules. State that worker routing gpt-5.6-luna is not a runtime model substitution. Return selected skill path and no file changes.
~~~

Application-forward prompt:

~~~
Use .agents/skills/mm-realtime-voice to produce a metadata-only review note for a hypothetical Realtime constructor. Show a config-sourced model/voice/transcription shape, historyStoreAudio:false, tracingDisabled:true, ephemeral Main credential flow, actual-output-audio clock, and clean-session profile switch boundary. Do not call an API or change source/dependencies. Preserve every named runtime ID exactly as a config value, never as a source literal.
~~~

Expected evidence: retrieval includes all pins and boundaries above; forward note rejects transcript/audio persistence, useInsecureApiKey, waiting on transcripts, stale generations, and history carryover across profile changes. Workers return complete outputs; the implementer uses apply_patch to record them.

- [ ] **Step 5: Root reviews and commits only this skill.** Run git diff --check; inspect model-ID preservation against the source; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-realtime-voice/SKILL.md','.agents/skills/mm-realtime-voice/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-realtime-voice/SKILL.md .agents/skills/mm-realtime-voice/agents/openai.yaml
git commit -m "feat: migrate mm-realtime-voice skill"
~~~

## Task 7: Migrate and Validate mm-wake-word

**Files:**

- Create: .agents/skills/mm-wake-word/SKILL.md
- Create: .agents/skills/mm-wake-word/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/mm-wake-word.md
- Read-only source: .claude/skills/mm-wake-word/SKILL.md

**Interfaces:** Preserve sherpa-onnx-node@1.13.5 or newer, sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01, decibri@5.x, Python sherpa-onnx==1.13.5 fallback, keyword encoding/tuning, kws.reset(stream), and release/acquire microphone handoff with local Maintenance on handoff failure. Preserve Main-owned worker, TCC, crash, and false-wake rules.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer to initialize and translate only this skill.** Root uses the Worker Dispatch Contract CLI command and runs:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-wake-word --path .agents\skills --interface 'display_name=MM Wake Word' --interface 'short_description=Tune wake-word workers and microphone handoff' --interface 'default_prompt=Use $mm-wake-word to tune the Magic Mirror wake-word handoff.'
~~~

Preserve all model/package/version/tuning/handoff facts and translate only routing/self-review language. No other file is in scope.

- [ ] **Step 2: Validate this skill’s frontmatter and metadata.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills/mm-wake-word
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-wake-word/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-wake-word' in i['default_prompt']; print('openai.yaml PASS')"
~~~

- [ ] **Step 3: Run positive and negative trigger tests with a fresh profile-backed Luna/max tester.** Root uses the Worker Dispatch Contract CLI command with the named forward-test write scope and these prompts:

~~~
Positive trigger: “Tune the Chinese sherpa-onnx keyword threshold and implement the wake worker release-to-Realtime microphone handoff.” Use .agents/skills/mm-wake-word and report selection.
Negative trigger: “Choose the correct OpenCV YuNet/SFace model pair for face enrollment.” Report that mm-wake-word is not selected.
Do not edit tracked files or create another agent; return selection evidence.
~~~

Expected evidence: positive selection; negative non-selection or explicit discovery limitation. The tester returns both outputs; a profile-backed implementer uses apply_patch to store them in forward-tests/mm-wake-word.md.

- [ ] **Step 4: Run retrieval and application-forward tests with fresh profile-backed Luna/max workers.** Root launches tester and implementer CLI workers through the Worker Dispatch Contract command with their exact roles and named forward-test write scope. Retrieval prompt:

~~~
Use .agents/skills/mm-wake-word to report the minimum sherpa version, exact keyword model, capture package, Python fallback, 16 kHz/featureDim settings, threshold/boost/trailing-blank rules, reset requirement, and both directions of microphone ownership handoff. Return selected skill path and no file changes.
~~~

Application-forward prompt:

~~~
Use .agents/skills/mm-wake-word to produce a metadata-only tuning note for a hypothetical four-syllable wake phrase. Include a config-only threshold/boost choice, kws.reset(stream) after detection, explicit worker release confirmation before renderer acquire, renderer track stop before wake reacquire, and Maintenance on handoff failure. Do not install dependencies or edit application code.
~~~

Expected evidence: exact pins and handoff order; no retry loop on permission denial, no confidence score invented, no simultaneous microphone owners, and no application diff. Workers return complete outputs; the implementer uses apply_patch to record them.

- [ ] **Step 5: Root reviews and commits only this skill.** Run git diff --check; confirm Tasks 3–6 remain untouched; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-wake-word/SKILL.md','.agents/skills/mm-wake-word/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-wake-word/SKILL.md .agents/skills/mm-wake-word/agents/openai.yaml
git commit -m "feat: migrate mm-wake-word skill"
~~~

## Task 8: Migrate and Validate mm-live2d-avatar

**Files:**

- Create: .agents/skills/mm-live2d-avatar/SKILL.md
- Create: .agents/skills/mm-live2d-avatar/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/mm-live2d-avatar.md
- Read-only source: .claude/skills/mm-live2d-avatar/SKILL.md

**Interfaces:** Preserve official Cubism 5 SDK for Web R5, MotionSync R2, global live2dcubismcore.js, analyser/RMS lip-sync-first path, actual-output-audio clock, state-gated motions, parameter ordering, and designer asset requirements. Preserve the prohibition on transcript-timed mouth motion, one motion manager for all curves, and treating priority as state gating.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer to initialize and translate only this skill.** Root uses the Worker Dispatch Contract CLI command and runs:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-live2d-avatar --path .agents\skills --interface 'display_name=MM Live2D Avatar' --interface 'short_description=Build audio-driven Live2D avatar behavior' --interface 'default_prompt=Use $mm-live2d-avatar to design audio-driven Magic Mirror avatar behavior.'
~~~

Preserve every SDK, plugin, parameter, motion, audio, and asset fact; translate only harness routing. Do not edit other files.

- [ ] **Step 2: Validate frontmatter and metadata.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills/mm-live2d-avatar
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-live2d-avatar/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-live2d-avatar' in i['default_prompt']; print('openai.yaml PASS')"
~~~

- [ ] **Step 3: Run positive and negative trigger tests with a fresh profile-backed Luna/max tester.** Root uses the Worker Dispatch Contract CLI command with the named forward-test write scope and these prompts:

~~~
Positive trigger: “Make the Live2D mouth follow the actual WebRTC output audio with an AnalyserNode and gate speaking motions by lifecycle state.” Use .agents/skills/mm-live2d-avatar and report selection.
Negative trigger: “Design a face candidate margin threshold and enrollment rollback policy.” Report that mm-live2d-avatar is not selected.
Do not edit tracked files or create another agent; return selection evidence.
~~~

Expected evidence: positive selection; negative non-selection or recorded discovery limitation. The tester returns both outputs; a profile-backed implementer uses apply_patch to store them in forward-tests/mm-live2d-avatar.md.

- [ ] **Step 4: Run retrieval and application-forward tests with fresh profile-backed Luna/max workers.** Root launches tester and implementer CLI workers through the Worker Dispatch Contract command with their exact roles and named forward-test write scope. Retrieval prompt:

~~~
Use .agents/skills/mm-live2d-avatar to list the exact Cubism/MotionSync versions, global-script rule, RMS/lip-sync parameter path, actual-audio clock, parameter-write order, state-gated motion rule, and required designer asset files. Return selected skill path and no file changes.
~~~

Application-forward prompt:

~~~
Use .agents/skills/mm-live2d-avatar to produce a metadata-only review note for a hypothetical lip-sync component. Include a silent AnalyserNode tap on the actual output stream, RMS clamp to 0..1, mouth write before model.update, body/expressions/blink/breath ordering, and zero-mouth behavior on interrupt/disconnect. Do not drive from transcript text, do not import Cubism Core as ESM, and do not edit renderer code or dependencies.
~~~

Expected evidence: all exact identifiers and order rules are retained; forward note uses actual output audio, avoids a second audible path, and contains no feature diff. Workers return complete outputs; the implementer uses apply_patch to record them.

- [ ] **Step 5: Root reviews and commits only this skill.** Run git diff --check; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-live2d-avatar/SKILL.md','.agents/skills/mm-live2d-avatar/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-live2d-avatar/SKILL.md .agents/skills/mm-live2d-avatar/agents/openai.yaml
git commit -m "feat: migrate mm-live2d-avatar skill"
~~~

## Task 9: Migrate and Validate mm-face-identity

**Files:**

- Create: .agents/skills/mm-face-identity/SKILL.md
- Create: .agents/skills/mm-face-identity/agents/openai.yaml
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/forward-tests/mm-face-identity.md
- Read-only source: .claude/skills/mm-face-identity/SKILL.md

**Interfaces:** Preserve the pinned YuNet/SFace pairs: opencv-python==4.14.0.94 with face_detection_yunet_2023mar.onnx, or 5.0.0.93 with face_detection_yunet_2026may.onnx, plus face_recognition_sface_2021dec.onnx. Preserve candidate-only matching, cosine/margin gates, enrollment persistence, quality order, pair hashes, rebuild/rollback, camera/TCC degradation, and verbal confirmation. Do not choose or normalize one pair and do not persist runtime frames or embeddings in diagnostics.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer to initialize and translate only this skill.** Root uses the Worker Dispatch Contract CLI command and runs:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\init_skill.py mm-face-identity --path .agents\skills --interface 'display_name=MM Face Identity' --interface 'short_description=Apply YuNet and SFace identity safeguards' --interface 'default_prompt=Use $mm-face-identity to apply safe YuNet and SFace identity guidance.'
~~~

Preserve source facts and all safety gates; translate only harness vocabulary. Do not edit other files.

- [ ] **Step 2: Validate frontmatter and metadata.** Run:

~~~powershell
python C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills/mm-face-identity
python -c "import pathlib, yaml; p=pathlib.Path('.agents/skills/mm-face-identity/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$' + 'mm-face-identity' in i['default_prompt']; print('openai.yaml PASS')"
~~~

- [ ] **Step 3: Run positive and negative trigger tests with a fresh profile-backed Luna/max tester.** Root uses the Worker Dispatch Contract CLI command with the named forward-test write scope and these prompts:

~~~
Positive trigger: “Implement a YuNet/SFace face-candidate scan with pair pinning, cosine margin gates, enrollment quality checks, and verbal confirmation.” Use .agents/skills/mm-face-identity and report selection.
Negative trigger: “Tune a Chinese wake-word threshold and release the worker microphone.” Report that mm-face-identity is not selected.
Do not edit tracked files or create another agent; return selection evidence.
~~~

Expected evidence: positive selection; negative non-selection or recorded discovery limitation. The tester returns both outputs; a profile-backed implementer uses apply_patch to store them in forward-tests/mm-face-identity.md.

- [ ] **Step 4: Run retrieval and application-forward tests with fresh profile-backed Luna/max workers.** Root launches tester and implementer CLI workers through the Worker Dispatch Contract command with their exact roles and named forward-test write scope. Retrieval prompt:

~~~
Use .agents/skills/mm-face-identity to list both valid OpenCV/ONNX detector pairs, the exact SFace recognizer, candidate-only/confirmation behavior, cosine threshold and margin starting ranges, enrollment quality order, pair-hash rule, rebuild/rollback rule, and camera/TCC degradation. Return selected skill path and no file changes.
~~~

Application-forward prompt:

~~~
Use .agents/skills/mm-face-identity to produce a metadata-only policy note for a hypothetical candidate matcher. Include max-over-N cosine scoring, a 0.40–0.45 starting threshold, a 0.05–0.10 margin gate, no candidate authorization before verbal confirmation, detector/recognizer pair hashes, no runtime-frame persistence, and camera failure as visible Degraded rather than a conversation gate. Do not download models, install Python packages, or edit application files.
~~~

Expected evidence: both supported pairs and the one recognizer remain verbatim; forward note rejects int8/fp32 mixing, bbox-only alignCrop, cross-pair comparison, silent permission retry loops, and private-memory access before confirmation. Workers return complete outputs; the implementer uses apply_patch to record them.

- [ ] **Step 5: Root reviews and commits only this skill.** Run git diff --check; confirm every earlier skill remains unchanged; compare the full tracked and untracked working-tree delta with this exact allowlist; then:

~~~powershell
$allowed = @('.agents/skills/mm-face-identity/SKILL.md','.agents/skills/mm-face-identity/agents/openai.yaml')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- .agents/skills/mm-face-identity/SKILL.md .agents/skills/mm-face-identity/agents/openai.yaml
git commit -m "feat: migrate mm-face-identity skill"
~~~

## Task 10: Update Process Records and Supersede R3/R4

**Files:**

- Modify: DECISIONS.md
- Modify: PROGRESS.md
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/progress.md
- Read-only inputs: approved design, current Phase 0 plan, all task commits, and all prior evidence

**Interfaces:** Records must be newest-first and durable. DECISIONS.md gets an ADR naming the Codex root as sole orchestrator/reviewer, explicit Luna/max dispatch, no separate review role, three-pass cap, and user-policy supersession of R3/R4 while retaining R1/R2/R5. PROGRESS.md records migration progress but preserves Task 1 done, Task 2 next, sequential T2–T5, and the Node prerequisite. The ignored ledger amends R3/R4 in place and leaves R1/R2/R5 and task order intact.

- [ ] **Step 1: Launch a fresh profile-backed Luna/max implementer with records-only write scope.** Root launches the worker through the Worker Dispatch Contract CLI with `--profile nova-auto`, role `implementer`, and write_scope `DECISIONS.md, PROGRESS.md, .superpowers/sdd/2026-08-16-phase0-foundation/progress.md`; the collaboration API is not an execution substitute. Use this exact prompt:

~~~
Read the approved design, current DECISIONS.md, PROGRESS.md, the Phase 0 plan, and the full SDD ledger. Update only the three named process records. Use apply_patch for every tracked or ignored record edit; do not use Set-Content, Out-File, Add-Content, redirection, or another shell write shortcut. In DECISIONS.md insert a newest-first 2026-08-17 ADR stating: root Codex is sole orchestrator/reviewer; root does not implement, survey/research, or run tests; all worker dispatches explicitly use gpt-5.6-luna and reasoning_effort max with exactly one bounded role; no separate review role; root review is external to worker self-review; every current and future plan and worker self-review is capped at 3 passes; user policy supersedes R3/R4; R1/R2/R5 remain. In PROGRESS.md add migration state/evidence without changing any application task status, keeping Task 2 as next and Node >=22.22.2 or >=24.15.0 before application Task 3, and translate the old “CLAUDE.md harness rule” wording to “root harness rule” so active records have no stale legacy path. In the ignored ledger amend R3 and R4 to “superseded by the user’s Codex policy,” restate R1/R2/R5 verbatim in substance, and add the three-pass process record. Do not rewrite the task order, mark Task 2 complete, edit immutable legacy source files, or create a review worker.
~~~

- [ ] **Step 2: Verify exact record preservation and routing statements.** Run:

~~~powershell
rg -n 'Codex|sole orchestrator|external to worker self-review|3 passes|R1|R2|R3|R4|R5|Task 2|22\.21\.0|22\.22\.2|24\.15\.0|sequential' -- DECISIONS.md PROGRESS.md .superpowers/sdd/2026-08-16-phase0-foundation/progress.md
$progress = Get-Content -Raw 'PROGRESS.md'
foreach ($required in @('Task 2  | Lifecycle state machine','upgrade dev Node from 22.21.0 to ≥22.22.2 or ≥24.15.0','Tasks run SEQUENTIALLY')) { if ($progress -notmatch [regex]::Escape($required)) { throw "Existing progress contract missing: $required" } }
$ledger = Get-Content -Raw '.superpowers/sdd/2026-08-16-phase0-foundation/progress.md'
if ($ledger -notmatch 'R3.*superseded|superseded.*R3' -or $ledger -notmatch 'R4.*superseded|superseded.*R4') { throw 'Ledger did not supersede R3/R4' }
if ($ledger -notmatch 'Ruling R1' -or $ledger -notmatch 'Ruling R2' -or $ledger -notmatch 'Ruling R5') { throw 'R1/R2/R5 were not retained' }
~~~

Expected evidence: the existing application table and next-action text remain; only migration records are added or amended; no Task 2 completion line exists.

- [ ] **Step 3: Run scope and immutable checks, obtain root external review, and commit.** Run git diff --check, compare the seven source hashes to the Task 1 receipt, and compare the full tracked and untracked working-tree delta against exactly `DECISIONS.md` and `PROGRESS.md`; then:

~~~powershell
git diff --check
$baseline = Get-Content -Raw '.superpowers/sdd/2026-08-16-phase0-foundation/immutable-source-hashes.json' | ConvertFrom-Json
$baselineMap = @{}; foreach ($item in $baseline) { $baselineMap[$item.path] = $item.sha256 }
$immutablePaths = @((Resolve-Path -LiteralPath 'CLAUDE.md').Path) + @(Get-ChildItem -LiteralPath '.claude/skills' -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName })
foreach ($path in $immutablePaths) { $relative = Resolve-Path -LiteralPath $path -Relative; if (-not $baselineMap.ContainsKey($relative) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $baselineMap[$relative]) { throw "Immutable source changed: $relative" } }
$allowed = @('DECISIONS.md','PROGRESS.md')
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected full working-tree scope: $($unexpected -join ', ')" }
git add -- DECISIONS.md PROGRESS.md
git commit -m "docs: record codex harness routing"
~~~

The ignored ledger remains operational state and is not force-added to Git.

## Task 11: Final Luna/Max Validation and Handoff

**Files:**

- Modify: PROGRESS.md (append final harness-validation evidence only; preserve application status)
- Modify: .superpowers/sdd/2026-08-16-phase0-foundation/final-validation.md (ignored complete report)
- Read-only all active files, immutable sources, design, records, and repository state

**Interfaces:** The final tester is the evidence owner. Root only reviews its complete output and does not run the commands itself. Acceptance requires valid TOML/YAML/frontmatter, no stale active vocabulary, exact seven skill names, immutable hashes/diffs, local Codex discovery/routing where possible, npm run typecheck, npm test, and clean scope. No product feature or dependency change is allowed.

- [ ] **Step 1: Launch one fresh profile-backed Luna/max tester with exact final-validation prompt.** Root launches the named tester through the Worker Dispatch Contract CLI with `--profile nova-auto`, role `tester`, and write_scope `PROGRESS.md, .superpowers/sdd/2026-08-16-phase0-foundation/final-validation.md`; the collaboration API is not an execution substitute. The named tester, not root, uses apply_patch for both report and PROGRESS edits. Use this prompt:

~~~
You are the final validation tester for the Codex harness migration in C:\Project\magic-mirror. Use model gpt-5.6-luna with reasoning_effort max, do not create a review worker, do not edit CLAUDE.md/.claude/skills, and do not modify application behavior or dependencies. Use apply_patch for the report and the final PROGRESS note; do not use Set-Content, Out-File, Add-Content, redirection, or another shell write shortcut. Run every command below from the repository root, capture complete stdout/stderr and exit codes, and write the report only to .superpowers/sdd/2026-08-16-phase0-foundation/final-validation.md. You may append final metadata-only evidence to PROGRESS.md; do not change application task status. Root only reviews your complete report and never performs these test commands or writes PROGRESS.md.

1. Validate the exact active skill set:
$expected = @('mm-phase-workflow','mm-invariants','mm-electron-foundation','mm-realtime-voice','mm-wake-word','mm-live2d-avatar','mm-face-identity')
$actual = @(Get-ChildItem -LiteralPath '.agents/skills' -Directory | Sort-Object Name | ForEach-Object { $_.Name })
if ((Compare-Object -ReferenceObject $expected -DifferenceObject $actual).Count -ne 0) { throw "Skill set mismatch: $($actual -join ', ')" }
foreach ($name in $expected) {
  $skillRoot = (Resolve-Path -LiteralPath ".agents/skills/$name").Path
  $skillFiles = @(Get-ChildItem -LiteralPath $skillRoot -Recurse -File | ForEach-Object { $_.FullName.Substring($skillRoot.Length + 1).Replace('\','/') } | Sort-Object)
  $expectedFiles = @('SKILL.md','agents/openai.yaml')
  if ((Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $skillFiles).Count -ne 0) { throw "Skill file set mismatch for $name: $($skillFiles -join ', ')" }
}

2. Validate every SKILL.md and openai.yaml one at a time:
$validate = 'C:\Users\b8901\.codex\skills\.system\skill-creator\scripts\quick_validate.py'
foreach ($name in $expected) { python $validate ".agents/skills/$name" }
foreach ($name in $expected) { python -c "import pathlib, yaml; p=pathlib.Path(r'.agents/skills/$name/agents/openai.yaml'); d=yaml.safe_load(p.read_text(encoding='utf-8')); i=d['interface']; assert set(i)=={'display_name','short_description','default_prompt'}; assert 25 <= len(i['short_description']) <= 64; assert '$'+r'$name' in i['default_prompt']; print('YAML PASS: '+str(p))" }

3. Parse the control-plane TOML and require exactly three role files:
$tomlFiles = @('.codex/config.toml') + @(Get-ChildItem -LiteralPath '.codex/agents' -Filter '*.toml' -File | Sort-Object Name | ForEach-Object { $_.FullName })
foreach ($file in $tomlFiles) { python -c "import pathlib, tomllib; p=pathlib.Path(r'$file'); tomllib.loads(p.read_text(encoding='utf-8')); print('TOML PASS: '+str(p))" }
$roles = @(Get-ChildItem -LiteralPath '.codex/agents' -Filter '*.toml' -File | Sort-Object Name | ForEach-Object { $_.BaseName })
if ((Compare-Object -ReferenceObject @('implementer','surveyor','tester') -DifferenceObject $roles).Count -ne 0) { throw 'Role set is not exactly implementer/surveyor/tester' }
foreach ($role in @('implementer','surveyor','tester')) { python -c "import pathlib, tomllib; p=pathlib.Path(r'.codex/agents/$role.toml'); d=tomllib.loads(p.read_text(encoding='utf-8')); assert d['name']==r'$role'; assert d['model']=='gpt-5.6-luna'; assert d['model_reasoning_effort']=='max'; assert isinstance(d['developer_instructions'], str) and d['developer_instructions']; print('ROLE PASS: '+str(p))" }
$config = python -c "import pathlib, tomllib; d=tomllib.loads(pathlib.Path('.codex/config.toml').read_text(encoding='utf-8')); assert d['agents']['default_subagent_model']=='gpt-5.6-luna'; assert d['agents']['default_subagent_reasoning_effort']=='max'; print('CONFIG PASS')"

4. Scan active files only for actual stale routing forms and unresolved template text. Provenance, immutability, and prohibition wording is allowed:
$active = @('AGENTS.md','DECISIONS.md','PROGRESS.md') + @(Get-ChildItem -LiteralPath '.codex','.agents/skills' -Recurse -File | ForEach-Object { $_.FullName })
$legacyPatterns = @('model\s*:\s*"opus"','model\s*=\s*"opus"','subagent_type\s*:\s*"general-purpose"','(?i)(use|load|read|invoke|dispatch)[^\r\n]*\.claude[\\/]skills','(?i)Claude\s+Agent(?:[ -]tool)?\s+(?:tool|instruction|invocation)')
foreach ($pattern in $legacyPatterns) { $stale = & rg -n -i $pattern -- $active; if ($LASTEXITCODE -eq 0) { $stale | Write-Output; throw "Stale active route found: $pattern" } }
$markers = @('T' + 'BD','TO' + 'DO','implement ' + 'later','fill ' + 'in details')
foreach ($marker in $markers) { $templates = & rg -n -i --fixed-strings $marker -- $active; if ($LASTEXITCODE -eq 0) { $templates | Write-Output; throw 'Unresolved active template text found' } }

5. Compare immutable source hashes:
$baseline = Get-Content -Raw '.superpowers/sdd/2026-08-16-phase0-foundation/immutable-source-hashes.json' | ConvertFrom-Json
$baselineMap = @{}; foreach ($item in $baseline) { $baselineMap[$item.path] = $item.sha256 }
$paths = @((Resolve-Path -LiteralPath 'CLAUDE.md').Path) + @(Get-ChildItem -LiteralPath '.claude/skills' -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName })
foreach ($path in $paths) { $relative = Resolve-Path -LiteralPath $path -Relative; $now = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; if (-not $baselineMap.ContainsKey($relative) -or $baselineMap[$relative] -ne $now) { throw "Immutable source changed: $relative" } }

6. Probe local Codex discovery/routing where available, using explicit Luna/max and read-only mode. For each skill, run the command below with the skill-specific prompt. Record a visible PASS, or the complete failure and limitation; a failure does not authorize another model:
$codex = (Get-Command codex).Source
$probePrompts = @{
  'mm-phase-workflow' = 'In a clean prompt, select the active skill for planning one bounded Magic Mirror phase unit and return the selected skill path plus one mock-first and one failure-path requirement.'
  'mm-invariants' = 'In a clean prompt, select the active skill for checking a Magic Mirror profile-switch change and return invariant IDs 1, 3, 8, 9, 10, 11, and 12.'
  'mm-electron-foundation' = 'In a clean prompt, select the active skill for a Main-owned node:sqlite WAL and IPC sender-validation task and return the exact Electron and SQLite identifiers.'
  'mm-realtime-voice' = 'In a clean prompt, select the active skill for a Realtime WebRTC session and return the SDK version and privacy flags.'
  'mm-wake-word' = 'In a clean prompt, select the active skill for tuning a sherpa-onnx wake worker and return the pinned model and mic handoff rule.'
  'mm-live2d-avatar' = 'In a clean prompt, select the active skill for actual-output-audio Live2D lip sync and return the Cubism/MotionSync pins.'
  'mm-face-identity' = 'In a clean prompt, select the active skill for YuNet/SFace candidate matching and return both supported detector pairs.'
}
foreach ($name in $expected) { $result = & $codex exec --profile nova-auto --ephemeral --sandbox read-only --cd 'C:\Project\magic-mirror' -m gpt-5.6-luna -c 'model_reasoning_effort="max"' $probePrompts[$name] 2>&1; "DISCOVERY $name"; $result }

7. Run the repository checks as this tester and capture complete output:
node --version
npm run typecheck
npm test

8. Verify clean scope. Include the full execution commit range from design checkpoint 15eae49 through HEAD plus the current tracked and untracked working-tree delta. The only allowed paths are the control plane, seven target skill pairs, DECISIONS.md, PROGRESS.md, this plan artifact, and the design spec’s one-line status update:
$allowed = @('AGENTS.md','.codex/config.toml','.codex/agents/implementer.toml','.codex/agents/surveyor.toml','.codex/agents/tester.toml','DECISIONS.md','PROGRESS.md','docs/superpowers/plans/2026-08-17-codex-harness-migration.md','docs/superpowers/specs/2026-08-16-codex-harness-migration-design.md') + @($expected | ForEach-Object { ".agents/skills/$_/SKILL.md"; ".agents/skills/$_/agents/openai.yaml" })
$rangeChanged = @(git diff --name-only 15eae49 HEAD)
$worktreeChanged = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object { if ($_.Length -ge 4) { $_.Substring(3) } })
$changed = @($rangeChanged + $worktreeChanged | Sort-Object -Unique)
$unexpected = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $changed | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })
if ($unexpected.Count -ne 0) { throw "Unexpected execution scope: $($unexpected -join ', ')" }
if (Test-Path -LiteralPath 'package-lock.json') { git diff --exit-code -- package.json package-lock.json electron.vite.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json vitest.config.ts src tests }

The report must include command text, complete outputs, exit codes, exact skill/role sets, hash result, discovery result or limitation, Node version, typecheck/test result, clean-scope result, and residual risks. Do not claim PASS for a command that was not run. The profile probe and every discovery command must show --profile nova-auto; record only PROFILE_READY or a non-secret failure reason, never profile contents.
~~~

- [ ] **Step 2: Append the final evidence to PROGRESS.md without changing application status.** The named final tester uses apply_patch to add a Codex harness migration validation section naming all completed task commits, the final report path, the discovery result/limitation, the immutable hash result, and npm run typecheck/npm test results. The existing Task 2 next and Node prerequisite text remains byte-for-byte in substance; root never writes this record.

- [ ] **Step 3: Root performs the final external review.** Check that every worker self-review stayed at or below three passes, root review was the only review gate, no reviewer role/worker exists, all seven skills were independently validated, all process RED/GREEN evidence is in the ignored ledger, and no raw user content appears in any artifact. If the local discovery probe failed, verify that the exact limitation is recorded and static validation still passes.

- [ ] **Step 4: Run the final scope check and commit the final evidence-bearing record.** The tester’s complete output is the acceptance evidence; root does not re-run the suite. After root accepts:

~~~powershell
git diff --check
git add -- PROGRESS.md
git commit -m "chore: record final codex harness validation"
~~~

Expected final state: no application feature/dependency changes, no source hash drift, exactly seven active skill names, three non-review roles, valid control-plane/skill metadata, and all required test outputs recorded.

## Plan Self-Review (Pass 2 of Maximum 3)

This is the one additional plan self-review requested after the first review: pass 2 of the maximum 3. No third plan self-review is performed. Root review remains external to this self-review count.

- **Profile-backed execution:** Every post-plan survey, implementation, and test worker is root-launched through the exact PATH-resolved `codex exec --profile nova-auto --ephemeral --cd C:\Project\magic-mirror -m gpt-5.6-luna -c 'model_reasoning_effort="max"'` command; no versioned executable path remains. The plan explains that collaboration spawn calls have no profile field and are not the approved execution mechanism.
- **Task 1 ownership and edit policy:** Hash receipt creation, ignored-ledger updates, and the PROGRESS note belong to a fresh profile-backed Luna/max implementer with an exact write scope; RED and preflight work belongs to fresh profile-backed testers. Task 11 assigns the PROGRESS update to the named tester. All tracked and ignored artifact edits require apply_patch, with shell output used only to compute or display values.
- **Stale vocabulary:** Control-plane and final scans match only active legacy route forms (Opus model fields, general-purpose subagent fields, instructions to use/load `.claude/skills`, or Claude Agent-tool invocations), so allowed provenance, immutability, and prohibition statements do not produce false failures.
- **Scope and checkpoint:** Each task checks the complete tracked/untracked working-tree delta against its exact allowlist. The pre-execution checkpoint commits only this plan and the one-line approved design status update; final validation compares `15eae49..HEAD` plus the working tree and allows that plan/spec pair plus the intended control, skill, and record paths.
- **Header, future process, and source policy:** The header uses valid `- [ ]` checkbox wording. AGENTS.md acceptance applies the three-pass cap to every current and future plan and worker. CLAUDE.md and all original `.claude/skills` sources remain byte-for-byte immutable, and no application or dependency paths are in scope.
- **Spec coverage:** Tasks 1–2 cover immutable freeze, RED baselines, the root control plane, explicit Luna/max routing, profile preflight, role schema, and no reviewer role; Tasks 3–4 cover both process skills and RED/GREEN behavior; Tasks 5–9 cover each domain skill independently with initialization, validation, positive/negative trigger, retrieval, and application-forward evidence; Task 10 covers all three records and R1/R2/R5 versus R3/R4; Task 11 covers TOML/YAML/frontmatter, exact skill names, immutable comparison, discovery limitation, npm checks, and final scope.
- **Placeholders, paths, and Windows commands:** No unresolved template wording, unspecified file, unnamed role, batched skill task, or “later” implementation step remains. Target names, metadata paths, source paths, role names, record paths, hash paths, and ignored evidence paths are consistent. Commands use PowerShell-safe syntax and avoid bash-only variables and shell redirection.
