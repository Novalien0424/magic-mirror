# Document map

Read the current entrypoint for the task; do not load every historical document.

| Need | Maintained entrypoint |
|---|---|
| Features, operator controls, visitor journeys and user stories | [PRD](../PRD.md) |
| Current delivery, dated runtime evidence and next action | [PROGRESS](../PROGRESS.md) |
| Unresolved defects, roadmap and field acceptance | [TODO](../TODO.md) |
| Working contract and durable rulings | [AGENTS](../AGENTS.md), [DECISIONS](../DECISIONS.md) |
| Agent setup/routing | [Harness map](../APPLY.md) |
| Mac deployment and physical operator controls | [Mac runbook](../deploy/macos/README.md), [Stream Deck](../deploy/macos/stream-deck.md) |
| Domain implementation/QA guidance | [.agents/skills](../.agents/skills/) |

The versioned PRD, Tech Spec, Implementation Plan and UIUX Design are historical
baselines. Their phase requirements do not prove delivery. Current PRD and newer
owner rulings distinguish implemented, limited and planned behavior; this
reconciliation does not promote a phase or rewrite baseline acceptance.

`testing/` retains dated checks, failures and exclusions; `archive/` retains
superseded handoffs/rulings. `superpowers/` and root Raven handoffs preserve design
and asset provenance, not additional agent policy. Read a report only when it is
relevant to the selected feature or issue.

Raw QA captures are disposable after ownership/review checks; a historical path
does not guarantee the capture still exists. [Latest cleanup and retained
metadata](testing/repository-cleanup-2026-10-30.md) identifies removed runs and
preserved exceptions. Runtime assets, source masters and owner data are separate.
