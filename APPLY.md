# Repository harness

The harness is already installed in this checkout.

- [AGENTS](AGENTS.md): shared working contract and Codex worker routing.
- [PRD](PRD.md): current features, complete journeys and concise user stories.
- [CLAUDE](CLAUDE.md): Claude Code entrypoint and its routing exception.
- [PROGRESS](PROGRESS.md): current delivery, runtime evidence and next work.
- [TODO](TODO.md): unresolved defects and acceptance.
- [DECISIONS](DECISIONS.md): durable rulings.
- `.agents/skills/`: maintained domain guidance; read only the selected skill.
- `.codex/config.toml` and `.codex/agents/`: optional worker definitions.
  Disabled `.claude/skills/` entries redirect to the maintained skills.

`apply-control-plane.ps1` is a legacy Windows file-copy helper, not a session
startup command. It copies root policy and Codex role files, not the domain
skills or Claude settings. Use it only for an explicitly requested harness copy.
The retired model-default example was removed; preserve the owner's selected
model/profile. [MODEL-ROUTING](MODEL-ROUTING.md) is only a pointer to the two
maintained agent contracts, not another routing policy.

Previous installation instructions and model defaults are retained in the
[setup archive](docs/archive/harness-setup-before-cleanup-2026-10-21.md).
