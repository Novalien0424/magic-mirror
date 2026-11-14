# Codex harness and skills audit — 2026-11-10

Owner request: audit project/user skills against current Astra, Sol and Terra
guidance; remove unhelpful scaffolding; install compact user-wide routing with
latest-family aliases. No Magic Mirror runtime launch or model migration.

## Result

- Added a user-wide `~/.codex/AGENTS.md` and two personal roles: Sol `implementer`
  and Terra `computer_use`. Astra is the default orchestrator. Medium is the
  initial effort; explicit choices remain available. This is a chosen baseline,
  not a measured quality/cost result.
- Removed four project worker definitions and their fixed Sol/max overrides.
  Removed ineffective role-local sandbox settings: current Codex agents inherit
  parent permissions. Project config retains its two-worker concurrency limit.
- Added portable [installer, resolver and rollback instructions](../../tools/codex-harness/README.md).
  `codex-astra`, `codex-sol`, `codex-terra` resolve the newest available stable
  numeric family IDs through the installed Codex account catalog. They are local
  executable aliases; no undocumented `*-latest` API IDs are assumed.
- Installed the user refresh job `local.codex.family-models`: login and hourly,
  plus refresh on each alias invocation. Current mapping: Astra `gpt-6-astra`,
  Sol `gpt-6.1-sol`, Terra `gpt-6.1-terra`. Catalog failure is visible and refuses
  alias launch; no cross-family fallback. Native profiles/app defaults/roles use
  the last successful refresh. Existing chats and explicit app model choices
  are not retroactively switched. Account catalog caching/rollout still applies.
- Project skill entrypoints: 25,629 → 15,793 bytes (**38.4% smaller**), 10 → 8
  skills. Samsung personal skill: 5,756 → 1,212 bytes (**78.9% smaller**).
  Useful conditional detail remains in references. All 12 invariant texts are
  unchanged, as are product runtime models and permission settings.

## Owned skill decisions

| Skill | Applied decision | Reason |
| --- | --- | --- |
| magic-mirror-avatar-studio | Keep | Already a concise router; genuine CMO/MOC, source preservation and Editor/runtime distinctions remain useful. |
| mm-electron-foundation | Narrow trigger | Main/IPC/native-worker ownership cannot be inferred from generic Electron knowledge. |
| mm-face-identity | Narrow trigger; retain deferred status | Consent, camera ownership and incompatible embedding pairs remain necessary; does not start recognition work. |
| mm-invariants | Remove skill entrypoint | Duplicates a cross-cutting contract. Unique distinctions moved to [invariant details](../../.agents/references/invariant-details.md), linked by AGENTS. |
| mm-live2d-avatar | Narrow trigger | Parameter ownership, audio clock and preview/display boundaries are project facts. |
| mm-phase-workflow | Remove skill entrypoint | Process-only routing need not occupy skill discovery. Explicit phase work uses [phase exits](../../.agents/references/phase-exits.md). |
| mm-realtime-voice | Narrow trigger | Session, Studio, extraction and mic contracts remain useful conditional references. |
| mm-ui-qa | Compact | Moved long Mac audio/speaker procedures to an audio-only reference; retained restoration and evidence limits. |
| mm-wake-word | Narrow trigger | Model-owned tokens, pronunciation and mic handoff are non-obvious local requirements. |
| roleplay-control-prompts | Compact | Moved Raven-specific preamble/language rules into a conditional reference; preserved code authorization and measured behavior. |
| samsung-tv-gallery | Compact user-wide symlink source | Discovery and gallery procedures now load by task; preserve identity, saved pairing, original photos and visual verification. |

## Managed skill audit

Read all 63 system/plugin entrypoints found on disk: 5 system and 58 plugin
skills across 14 packages (including 20 bundled templates). No superseded
skill-bearing versions were found. [Per-skill findings](codex-managed-skills-2026-11-10.md)
recommend 40 keep, 23 upstream compaction candidates, and no whole-skill
retirements. Together with the 11 owned entrypoints, the audit covers 74.
Also checked the seven disabled project `.claude/skills` compatibility redirects;
removed the two pointing to retired skills. The other five still resolve to the
maintained project skills. The separate user Claude/gstack/synced skill tree is
not loaded by Codex and was inventoried but not rewritten for OpenAI models.

The managed candidates mostly repeat general writing/workflow guidance, or
mix rare operations into main entrypoints. Their tool formats, artifact checks,
integration identity and provider permission contracts still add value. They
were retained rather than disabling entire capabilities or forking managed
caches that updates replace. The durable user harness makes local scope,
authorization, selective loading and proportional checks explicit. This work
does not replace Codex's built-in system/developer instructions.

## Evidence

- Installed CLI: `codex-cli 0.167.0`. Official guidance and live `model/list`
  agree on the three selected family models; no inference workload was run.
- `python3 -m unittest discover -s tools/codex-harness -p 'test_*.py' -v`: 7 pass;
  family ordering, hidden/preview exclusion, compatibility failure, config
  preservation/idempotence, commented tables/missing final newline, explicit
  overrides and administrative-command launch.
- All three installed aliases started a strict app-server. Each `config/read`
  returned its expected model. Project effective config returns Astra/medium,
  Sol/medium subagents and concurrency 2. No credential values were inspected.
- Native `skills/list(forceReload=true)` returned no parser errors and all 8
  remaining project skills plus Samsung enabled. The CLI's plugin catalog is
  surface-specific; the disk audit includes packages exposed by the desktop.
- `quick_validate.py`: all 9 retained project/personal entrypoints pass using
  an isolated temporary PyYAML install; no project dependency changes.
- Local Markdown links resolve; retired skill names and worker pins are absent
  from active project instructions. The 12 invariant texts match the backup.
- `launchctl print gui/<uid>/local.codex.family-models`: registered, one initial
  run, exit 0, 3600-second interval. It performs metadata/config work only.
- Final diff reviewed; `git diff --check` passes. No Electron/full suite needed.

## Failures retained

1. Official `.md` pages through the web renderer returned
   `(400) Unsupported content-type: text/markdown` for the GPT-6 guide, model
   page and subagent page. Direct official retrieval succeeded. The guessed
   `https://learn.chatgpt.com/docs/skills.md` returned HTTP 404; no claim relies
   on it.
2. First generated documentation patch was truncated before application:
   `apply_patch verification failed: invalid patch: The first line of the patch must be '*** Begin Patch'`.
   Reapplied through the local patch helper; no partial write from that failure.
3. First alias validation failed:
   `Error: --profile only applies to runtime commands, codex mcp, and codex migrate-nfs-db`.
   Alias launch now uses supported `-c` overrides; strict startup and effective
   models pass for all three. Regression covered by a focused test.
4. Initial skill validation (all 9) failed with:

   ```text
   Traceback (most recent call last):
     File "/Users/novalien0424/.codex/skills/.system/skill-creator/scripts/quick_validate.py", line 10, in <module>
       import yaml
   ModuleNotFoundError: No module named 'yaml'
   ```

   Reran with PyYAML in `/tmp/codex-harness-survey-2026-11-10/validator-deps`;
   all 9 passed. System/project packages were not changed.
5. Samsung source directory has no Git repository:
   `fatal: not a git repository (or any of the parent directories): .git`.
   Its source was backed up locally before editing; no Git operation was needed.

Initial backup: `~/.codex/backups/harness-20261110-113107` (project instructions,
skills/config and personal source). User installation's pre-change backup:
`~/.codex/backups/harness-install-20261110-113644-166574`; later installer runs
also retain backups. A concurrent `CLAUDE.md` edit was observed and preserved;
it is not part of this delivery.

## Source basis and limits

[OpenAI skill guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
supports precise triggers, progressive disclosure and removing generic process.
[Model selection](https://developers.openai.com/api/docs/guides/model-selection)
supports Astra for difficult decisions, Sol for complex work and Terra for
screen tasks. [Codex models](https://learn.chatgpt.com/docs/models) and
[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) establish
available settings, personal agents and parent-permission inheritance.

This is an instruction/config audit with static and actual catalog/config
checks, not a comparative model benchmark or live Terra UI acceptance. Terra
still needs computer-use tools on its host. The installer applies to this user's
local Codex surfaces; it does not change cloud workspace policies, other OS
accounts or Windows installations. Explicit/project/managed overrides can take
precedence. Running conversations keep their selected models.
