# H6 Worker Protocol

This is the conditional launcher and worker-envelope reference for the root
contract in [AGENTS.md](../AGENTS.md). Read this file fully before every
worker launch. It supplies execution bounds and protocol mechanics; it does
not relax authority, scope, privacy, invariant, freshness, evidence, or
external-root-review requirements.

## Contents

- Launcher, prompt transport, and preflight
- Read/output bounds and protocol parsing
- Deadlines, termination, and stable markers
- Canonical invocation and child argv
- Three command boundaries and exact cleanup
- Required task envelope
- Role write/read/evidence scope

## Launcher, prompt transport, and preflight

For every post-plan implementation, repository survey or research, and
test/validation worker, the interactive root uses
`scripts/invoke-codex-worker.ps1`. It resolves `codex` from `PATH` unless its
test-only `-CodexCommandPath` seam is supplied. PowerShell 7 (`pwsh`) is the
required outer host. Windows PowerShell 5.1 (`powershell.exe`) is unsupported
because its parameter binder can fail before launcher metadata preflight.

The root writes the complete prompt to a temporary file outside the
repository and supplies its exact resolved path with `-PromptPath`. The
launcher prepends the exact role-specific H6 worker-context preamble (CRLF
UTF-8 without a BOM), then appends the original prompt bytes unchanged after
the `--- BEGIN ORIGINAL PROMPT ---` delimiter and streams the combined bytes
to Codex stdin, never to argv.

If launcher entry sees the exact inherited
`MIRROR_CODEX_WORKER_ACTIVE=1` sentinel, it exits `2` with
`codex_worker_launcher stage=preflight status=failed reason=recursive_invocation`
before reading or launching Codex. Only the Codex child environment receives
the sentinel. An already-launched worker executes directly and never
recursively invokes Codex or the launcher.

The H6 preamble carries, in this fixed order: global `subagent-stop`, quiet
reads, `read_scope_enforcement: "exact_only"`,
`source_body_output: "forbidden_unless_evidence_requires"`,
`terminal_read_output: "metadata_only"`,
`repository_wide_discovery: "forbidden"`,
`first_write_deadline_seconds: 480`,
`post_write_idle_deadline_seconds: 120`, and
`max_read_output_lines: 200`.

Workers read only exact targeted paths. Broad discovery and source/skill body
output are suppressed unless exact evidence requires a bounded excerpt. Do
not dump unrelated source or skill content or flood worker output.

## Read/output bounds and protocol parsing

Keep source/skill reads separate from validation commands; never combine source
or skill dumps with validation in one shell command. Returned validation
evidence still includes complete stdout/stderr and exit codes for the named
commands. The launcher captures raw stdout and stderr only for the combined
raw byte cap; neither raw stream is forwarded. It captures at most
`-MaxOutputBytes` bytes.

The launcher passes documented Codex `--json` immediately before the final
stdin `-`. It parses bounded strict UTF-8 JSONL and pins only the locally tested
Codex 0.148.0 compatibility fields:

- `type: "item.completed"` plus `item.type: "file_change"` for an
  implementer write;
- `type: "item.completed"` plus `item.type: "agent_message"` with string
  `item.text` for the final message.

These event fields are the locally tested Codex 0.148.0 compatibility
contract, not an official universal schema guarantee; Codex `--json` itself is
documented. Valid progress, file-change, and stderr payloads remain
suppressed. After a zero-exit child and valid completed protocol, only the
latest nonempty agent message is written once to parent stdout, without
framing or a newline.

Malformed, non-object, or nonconforming JSONL exits `2` with
`codex_worker_launcher stage=protocol status=failed reason=invalid_jsonl`.
Zero-exit output without a nonempty final message uses
`codex_worker_launcher stage=protocol status=failed reason=missing_final_message`.

Tester workers include complete stdout/stderr and exit codes for every named
command in the final agent message so the launcher can forward the evidence
without forwarding raw process streams.

## Deadlines, termination, and stable markers

Implementers enforce the structured first-write deadline before the first
`file_change` event, then arm/reset the post-write idle deadline on valid
events. Surveyor and tester runs have neither deadline. Human `patch: completed`
lines never satisfy first-write. Live deadline, output, and supervision
failures terminate and confirm the exact descendant process tree; use
`tree_termination_failed` when confirmation fails. Post-exit protocol failures
report the stable `invalid_jsonl` or `missing_final_message` markers without
inventing tree evidence.

The stable launcher markers are:

- `codex_worker_launcher stage=preflight status=failed reason=recursive_invocation`
- `codex_worker_launcher stage=timeout status=failed reason=deadline_exceeded`
- `codex_worker_launcher stage=output status=failed reason=limit_exceeded`
- `codex_worker_launcher stage=first_write status=failed reason=deadline_exceeded`
- `codex_worker_launcher stage=post_write status=failed reason=deadline_exceeded`
- `codex_worker_launcher stage=protocol status=failed reason=invalid_jsonl`
- `codex_worker_launcher stage=protocol status=failed reason=missing_final_message`

Timeout and output-limit failures exit `2`. The launcher terminates and
confirms the exact descendant process tree before reporting either failure.
These are context and execution bounds, not a claim that advice can force
model completion.

## Canonical invocation and child argv

From the repository root, use this one compact canonical invocation. Every CLI
discovery or dry-run also uses this launcher and carries the explicit profile,
ephemeral mode, model, and effort:

```powershell
pwsh -NoLogo -NoProfile -NonInteractive -File scripts/invoke-codex-worker.ps1 -Role <role> -PromptPath <path> -TimeoutSeconds 600 -MaxOutputBytes 4194304
```

The launcher pins this exact child argv, in this order; documented `--json`
immediately precedes the final `-`, which selects stdin for the prompt:

```text
exec --profile nova-auto --ephemeral --cd C:\Project\magic-mirror -m gpt-5.6-luna -c model_reasoning_effort="max" --json -
```

Preserve the literal Windows repository path `C:\Project\magic-mirror`.

## Three command boundaries and exact cleanup

The bounded H6 harness uses three separate PowerShell command boundaries for
prompt creation, launcher invocation, and exact prompt cleanup. Create a
temporary UTF-8 file outside the repository. Pass its exact resolved path to
the launcher; use that exact resolved path only after the worker completes for
cleanup. Never combine prompt creation, launcher invocation, and prompt
cleanup in one shell expression.

Do not use JavaScript template literals, shell command reconstruction, or a
prompt argument. Prompt bytes travel through the exact temporary file and
stdin path described above.

## Required task envelope

Every task prompt repeats these fields and values:

```text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: exactly one of "implementer", "surveyor", or "tester"
fresh_worker: true
task: one bounded unit with explicit non-goals
write_scope: exact named files; read-only unless the named scope grants a write
read_scope: exact named files only
skills: relevant .agents/skills paths
self_invariants: relevant canonical IDs; use IDs 1–12 for product behavior
evidence: exact changed files, diff summary, complete command output and exit codes, and risks
self_review: read the own diff/output; no more than 3 passes
root_review: external root gate after return; not part of self-review
```

The dispatch must name exact files, relevant skills, invariant IDs, read/write
scope, and evidence format. Do not infer a role from the request or rely on a
project backstop for model or effort. A missing `read_scope`, profile, model,
effort, role, scope, skill, invariant, or evidence field is a dispatch failure.
Profile-less collaboration calls may coordinate context only; they are not
execution substitutes.

## Role write/read/evidence scope

The implementer may write only the exact bounded paths named in its prompt and
must use `apply_patch` for every write. The surveyor is read-only. The tester
may run only named validation commands and may write only the named ignored
evidence artifact. No worker may widen its scope, modify immutable sources,
create a review worker, or silently choose another model.
