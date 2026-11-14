# User-wide Codex harness

Install from any checkout with Python 3.11+ and the signed-in Codex CLI on PATH:

```sh
python3 tools/codex-harness/install.py --hourly
```

`--hourly` installs a macOS user LaunchAgent that refreshes the catalog at login
and hourly. Omit it on Linux or for manual refresh. The resolver uses `fcntl`;
Windows installation is not implemented. It never launches Magic Mirror.

The installer backs up existing files under `~/.codex/backups/`, adds a compact
managed block to `~/.codex/AGENTS.md`, installs personal agents and three profile
aliases, and preserves unrelated config and permission settings. `CODEX_HOME`
is respected. This applies across this user's local projects; project config,
managed policy and explicit model selections still take precedence.

| Alias / profile | Responsibility | Baseline effort |
| --- | --- | --- |
| `codex-astra` / `codex -p astra` | Orchestration and difficult decisions | medium |
| `codex-sol` / `codex -p sol` | Implementation; `implementer` role | medium |
| `codex-terra` / `codex -p terra` | Screen workflows; `computer_use` role | medium |

The executable aliases refresh before launching. Profiles, app defaults and
personal agents use the most recently resolved catalog. `codex-models refresh`
updates them immediately. `~/.codex/family-models.json` records the check time
and resolved IDs. Existing chats retain their chosen model; start a new chat
after refreshing. An app's saved model choice can override the default.

These are **local aliases**, not invented OpenAI API IDs. As of 2026-11-10,
official documentation and the account catalog expose versioned family IDs,
not verified `astra-latest`/`sol-latest`/`terra-latest` IDs. The resolver selects
the highest numeric stable version visible in each family, excluding snapshots,
hidden models and previews. It checks medium reasoning and Terra image input.
It fails visibly if a family is absent or incompatible, retaining the previous
configuration on catalog/validation failure and refusing an alias launch. It
does not substitute families. Catalog availability is not a live inference test.
Codex may cache its account catalog; this is the newest model that catalog exposes,
not a promise of access to unreleased or rollout-restricted models.

Explicit `-m`, `--model`, `-p`, `--profile` or `-c` options remain available. Use
higher reasoning for demonstrated difficult work, not every worker by default.
All agents inherit parent permissions and available tools; Terra is a routing
preference and does not install native computer-use tools into CLI sessions.

Managed system/plugin skill caches are upstream-owned. Keep their tool and
artifact contracts; project and personal instructions are the durable place
for local preferences. This installer does not replace Codex's built-in prompt.
Magic Mirror's runtime model config is a separate product contract.

To undo, unload the optional refresh job with
`launchctl bootout gui/$(id -u)/local.codex.family-models`, remove its plist from
`~/Library/LaunchAgents`, restore changed files from the install backup, and
remove newly created aliases, profile/agent files and the marked AGENTS block.
Restore a previous file instead of deleting it when the backup contains one.

Sources checked 2026-11-10:
[model roles](https://developers.openai.com/api/docs/guides/model-selection),
[Codex models](https://learn.chatgpt.com/docs/models),
[custom agents and permission inheritance](https://learn.chatgpt.com/docs/agent-configuration/subagents),
[compact skills](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra).
The three-role split and medium baseline are local choices informed by this
guidance, not a measured performance comparison on this project.
