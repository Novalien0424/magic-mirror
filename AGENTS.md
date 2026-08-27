# Magic Mirror — Codex Working Contract

## Objective

Make the smallest correct move, prove it with the smallest relevant evidence,
and stop. Optimize in this order: correctness/privacy, surgical scope,
wall-clock time, token cost, optional polish. Do not turn a bounded request into
a workflow project.

## Authority and state

Instruction order:

1. The user's latest request and explicit routing instruction.
2. This `AGENTS.md`.
3. Newer durable rulings in `DECISIONS.md`.
4. Product PRD, Tech Spec, Implementation Plan, and Stack Review.
5. Current state in `PROGRESS.md`.
6. Relevant domain facts in `.agents/skills/`.
7. Historical harness/source documents as reference only.

`PROGRESS.md` owns task/branch/phase status; `DECISIONS.md` owns durable rulings.
Do not duplicate their history here or infer completion from stale text.

This file owns execution policy. Skill or legacy text that mandates root-only
orchestration, a fresh worker for every action, Luna/max everywhere, H6 before
every task, separate tester gates, complete successful stdout, or repeated
review passes is superseded. Skills supply domain knowledge only.

## Direct execution is the default

The interactive Codex thread is the primary executor and reviewer. It may read,
edit in-scope files, and run proportionate non-destructive checks directly.

- For `answer`, `explain`, `review`, `diagnose`, or `plan`: inspect and report;
  do not implement unless asked.
- For `fix`, `change`, `build`, or `implement`: make the requested local change
  and run the smallest relevant check without asking again.
- Do not make a plan for an obvious bounded task. Start with the first
  evidence-producing action.
- Never delegate a single-file edit, targeted lookup, one command, log/status
  request, error capture, small config/docs change, or temporary diagnostic.
- Do not launch a worker merely because a role exists.

Ask before destructive actions, external writes, purchases, credential
rotation, irreversible migrations, or material scope expansion—not before safe
local reads, edits, and tests already authorized by the request.

### Interrupts

- `stop`, `cancel`, `abort`: terminate active commands/subagents immediately.
  Do not restart, substitute, or continue the abandoned plan.
- `show`, `paste`, `status`: answer from current evidence. If absent, perform
  only the smallest direct read or one-run capture needed.
- Do not request authorization twice for reversible in-scope work.
- Do not emit repetitive waiting commentary. Report only a meaningful state
  change, concrete blocker, or completion.

## Minimal effective move

1. Identify the requested observable outcome.
2. Inspect the named path, symbol, error, or command first.
3. Use targeted search only when the owner location is unknown.
4. Change the fewest files and lines that solve the cause.
5. Run the smallest check that proves the changed boundary.
6. Stop when the outcome is proven.

Operational rules:

- Discover read scope incrementally; it need not be perfect before the first
  targeted inspection.
- Prefer one-hop callers/imports over repository-wide exploration.
- Preserve existing user changes; never revert unrelated work.
- Prefer `apply_patch` or an equivalent minimal patch.
- No opportunistic refactor, rename, dependency update, formatting sweep, or
  adjacent cleanup.
- Retry an external/flaky action at most once, then report the exact failure.
- A temporary diagnostic may skip TDD if it leaves no product behavior behind.
  Keep it narrowly enabled, avoid persistent sensitive output, run only as
  needed, and revert it in the same task unless asked to retain it.

## Models and delegation

Primary critical path: `gpt-5.6-sol / medium`, executing directly. Increase
primary effort only for material ambiguity, cross-cutting architecture,
difficult root-cause analysis, security/privacy, destructive data risk, or
another high-value task where a mistake is costly.

Optional role routing is defined in `.codex/agents/`:

| Role | Model / effort | Intended use |
|---|---|---|
| `surveyor` | Luna / high | Focused independent read-only trace |
| `implementer` | Luna / high | Clear bounded change that can run independently |
| `tester` | Luna / low | Fresh command-oriented validation |
| `deep_reviewer` | Luna / max | Difficult bounded quality-first audit, preferably parallel/off-path |

`Luna + max` is deliberately retained for deep bounded review: Luna's low
per-token cost can justify extra reasoning, but max is not latency-efficient.
Do not place it in every serial step.

Use a subagent only when independent parallel work materially improves speed or
confidence, noisy read-heavy context would harm the primary thread, or the user
explicitly asks.

- Never make a subagent a mandatory serial gate around routine direct work.
- Use one by default; at most two concurrently when genuinely independent.
- The primary thread continues useful work instead of polling.
- A subagent never delegates.
- Prompt only: outcome, essential context, scope, done condition, evidence.
  Do not repeat this file, every skill, model/effort, freshness, and review
  boilerplate.
- On worker timeout/failure, keep existing evidence and reassess directly; do
  not auto-launch a replacement.

Use the built-in optional roles in `.codex/agents/` when delegation is
justified. The retired external worker launcher and prompt-envelope protocol
must not be recreated without an explicit, demonstrated isolation need.

## Skills

Do not preload skills. Read only relevant sections of:

- `mm-phase-workflow` for phase slicing, demos, exit evidence, or promotion;
- `mm-invariants` for detailed interpretation of an implicated invariant;
- one matching domain skill for Electron, Realtime voice, wake word,
  Live2D/avatar, or face identity.

Do not copy skill worker envelopes or orchestration boilerplate into prompts.

## Verification proportional to risk

- Read/status/log inspection: no test.
- Docs/config: relevant parse, syntax, or static check.
- Small code change: focused test and/or narrow typecheck for that boundary.
- Cross-cutting behavior, dependency/packaging, schema/destructive migration,
  credentials, runtime models, microphone/restart ownership, identity/privacy,
  release, or phase exit: broaden checks according to risk.
- Full suite/build/demo/regression and an independent tester are conditional,
  not routine. Use for broad impact, release/phase exit, ambiguous evidence, or
  explicit request.
- Use TDD for durable behavior changes when a focused failing test is practical;
  not for investigation, status reads, log capture, one-run diagnostics,
  reversible spikes, or docs-only work.
- The primary thread may validate directly. Perform one final diff/output
  self-check; repeat only if it finds a concrete issue.

Report successful checks as command + exit code + key result. Include complete
stdout/stderr only on failure or explicit request.

## Canonical product invariants

Preserve applicable IDs; delegated prompts name only relevant IDs.

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

- This Windows PC is the development and functional-verification host through
  all phases. The Mac mini M4 port happens afterward; macOS TCC, signing,
  entitlements, packaged-worker, LaunchAgent, power/performance, and final wake
  quality evidence are deferred to that port and do not block continued
  sequential PC engineering. Label Windows evidence explicitly and never use
  it to claim Mac behavior or deployment readiness.
- On this Windows host, commands that launch development `electron.exe` run
  only from the canonical `C:\Project\magic-mirror` checkout. Worktrees may run
  Node-only tests, typechecks, builds, and packaging, but not Electron runtime
  demos or live smoke. Windows Firewall program rules bind an exact executable
  path: before the first Electron run, verify the persistent Private-profile
  rules `MagicMirror.Development.Electron.TCP` and
  `MagicMirror.Development.Electron.UDP` target the canonical
  `node_modules\electron\dist\electron.exe`. If either rule is absent or
  mismatched, stop and ask the user to run
  `scripts\configure-windows-electron-firewall.ps1` once from the canonical
  checkout with elevation. Never create per-worktree rules or rely on an
  interactive Windows Defender Firewall prompt. After an exact match is
  verified, proceed without asking again; recheck only after the Electron path
  or installation changes, or an actual rule lookup fails.
- The user LaunchAgent with `KeepAlive={SuccessfulExit=false}` is the sole
  restart owner. Never call `app.relaunch()` or add another restart owner.
- Use npm.
- Do not modify `scripts/install-node-lts.ps1`, immutable historical inputs,
  protected review/product docs, dependencies, runtime model config, or phase
  status unless the task explicitly requires and names it.
- Official phase order, runtime integration, demos, exit decisions, regression,
  tags, and promotion remain sequential. Prep-only exceptions in
  `DECISIONS.md`/`PROGRESS.md` are not phase starts.

## Completion

Lead with the outcome, then only: changed files; focused checks and exit codes;
material unresolved risk/blocker. Omit performative narration, repeated
reassurance, source dumps, and ceremonial process summaries. Stop when the
requested outcome and proportionate verification are complete.
