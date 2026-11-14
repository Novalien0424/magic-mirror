# Managed skill inventory — 2026-11-10

Read-only survey of installed Codex system/plugin packages. Recommendations below
are audit findings; managed cache files were not edited or disabled.

Audited **63 SKILL.md entrypoints**: 5 system skills and 58 plugin skills across 14 packages.

**Recommendations: 40 keep · 23 compact · 0 retire.** No superseded versions existed among skill-bearing packages. No obsolete skill or stale model pin was established from entrypoints alone.

“Compact” preserves integration contracts, artifact formats, citations, and meaningful validation.

**System skills**

| Skill | Recommendation | Exact reason |
|---|---|---|
| [imagegen](/Users/novalien0424/.codex/skills/.system/imagegen/SKILL.md:31) | Compact | Repeated mode, transparency, and path rules; blanket “ask before doing anything else” gate; extensive fallback-only detail. |
| [openai-docs](/Users/novalien0424/.codex/skills/.system/openai-docs/SKILL.md:12) | Compact | Mandatory browsing before local inspection and API-key setup before any app work overgate local/offline tasks. |
| [review-agent](/Users/novalien0424/.codex/skills/.system/review-agent/SKILL.md) | Keep | Bounded review scope, concrete regression criteria, merge-base mechanics, and finding format. |
| [skill-creator](/Users/novalien0424/.codex/skills/.system/skill-creator/SKILL.md) | Compact | Repeats intent, progressive disclosure, and invocation guidance across sections. Preserve schema and validator instructions. |
| [skill-installer](/Users/novalien0424/.codex/skills/.system/skill-installer/SKILL.md:34) | Compact | Requires escalation merely because scripts use networking; actual execution policy should determine that. |

**Artifact skills — primary runtime `26.1104.22356`; Visualize `1.0.66`**

| Skill | Recommendation | Exact reason |
|---|---|---|
| [documents](/Users/novalien0424/.codex/plugins/cache/openai-primary-runtime/documents/26.1104.22356/skills/documents/SKILL.md) | Compact | Generic editorial coaching, overlapping helper indexes, and repeated render gates. Preserve rendering, OOXML, import, and citation contracts. |
| [pdf](/Users/novalien0424/.codex/plugins/cache/openai-primary-runtime/pdf/26.1104.22356/skills/pdf/SKILL.md) | Keep | AcroForm field/widget/appearance checks address distinct correctness failures; remaining guidance is format-specific. |
| [presentations](/Users/novalien0424/.codex/plugins/cache/openai-primary-runtime/presentations/26.1104.22356/skills/presentations/SKILL.md:43) | Compact | Long generic writing taxonomy and absolute punctuation/passive-voice bans. Preserve destination, session, editability, and delivery contracts. |
| [spreadsheets](/Users/novalien0424/.codex/plugins/cache/openai-primary-runtime/spreadsheets/26.1104.22356/skills/spreadsheets/SKILL.md) | Compact | Large workbook/writing tutorials, mandatory full reading and planning. Move shared guidance to references; retain API and verification requirements. |
| [excel-live-control](/Users/novalien0424/.codex/plugins/cache/openai-primary-runtime/spreadsheets/26.1104.22356/skills/excel-live-control/SKILL.md:28) | Compact | **341 lines duplicate Spreadsheets**; six unconditional UI setup gates precede connector discovery. Preserve session/schema/idempotency safeguards. |
| [template-creator](/Users/novalien0424/.codex/plugins/cache/openai-primary-runtime/template-creator/26.1104.22356/skills/template-creator/SKILL.md) | Keep | Concrete packaging, atomic updates, reference retention, cloud-source protection, and gallery syntax. |
| [visualize](/Users/novalien0424/.codex/plugins/cache/openai-bundled/visualize/1.0.66/skills/visualize/SKILL.md:13) | Compact | Silence mandate and compulsory rereading after compaction; substantial mode-specific detail. Preserve fragment, CSP, state, and output-reference contracts. |

**Google Drive `0.1.23`**

| Skill | Recommendation | Exact reason |
|---|---|---|
| [google-drive](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/google-drive/0.1.23/skills/google-drive/SKILL.md:38) | Compact | Router mandates DOCX import while Google Docs selects native creation; export guidance repeats. Delegate route ownership consistently. |
| [google-docs](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/google-drive/0.1.23/skills/google-docs/SKILL.md) | Keep | Useful native-copy semantics, UTF-16 indexing, revision guards, structure preservation, and scoped readback. |
| [google-drive-comments](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/google-drive/0.1.23/skills/google-drive-comments/SKILL.md:24) | Compact | Requires fresh approval merely to split authorized comments across API-sized batches. Preserve location/evidence fields. |
| [google-sheets](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/google-drive/0.1.23/skills/google-sheets/SKILL.md:75) | Compact | “Read every reference if uncertain”; final XLSX-import rule conflicts with its existing-sheet, in-place edit route. |
| [google-slides](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/google-drive/0.1.23/skills/google-slides/SKILL.md:169) | Compact | Arbitrary two-repair-pass ceiling and bulky inline helper examples. Preserve exemplar fidelity, native objects, and render verification. |

**Notion `3.0.8`**

| Skill | Recommendation | Exact reason |
|---|---|---|
| [notion-setup](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-setup/SKILL.md) | Keep | Minimal provider setup-guide routing; no unnecessary workflow. |
| [notion-database-designer](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-database-designer/SKILL.md:78) | Compact | Generic round-trip timing lecture and overlapping efficiency advice. Preserve migration, relation, and inline-view mechanics. |
| [notion-build-my-engineering-wiki](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-build-my-engineering-wiki/SKILL.md:115) | Compact | Copied 19-line efficiency block and repeated context coaching; retain engineering knowledge distinctions and layout requirements. |
| [notion-create-my-team-handbook](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-create-my-team-handbook/SKILL.md:96) | Compact | Same copied efficiency block; preserve procedure/request separation, policy status, and audience controls. |
| [notion-organize-my-semester](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-organize-my-semester/SKILL.md:107) | Compact | Same copied efficiency block and context boilerplate; preserve deadline reconciliation and undated-work visibility. |
| [notion-plan-marketing-campaigns](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-plan-marketing-campaigns/SKILL.md:135) | Compact | Same copied efficiency block; preserve campaign/content relations, drafts, and publication boundaries. |
| [notion-set-up-my-project](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-set-up-my-project/SKILL.md:47) | Compact | Prescribed post-delivery interview/placement stages plus copied efficiency block. Preserve project relations and identity-preserving moves. |
| [notion-knowledge-capture](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-knowledge-capture/SKILL.md) | Keep | Focused capture patterns preserve decisions, rationale, and unresolved questions without mandatory extra artifacts. |
| [notion-meeting-prep](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-meeting-prep/SKILL.md) | Keep | Useful next-meeting routing, internal/external audience separation, and meeting-to-action semantics. |
| [notion-research-documentation](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-research-documentation/SKILL.md) | Keep | Selective retrieval, supersession handling, citations, and optional saving; no source-count or report gate. |
| [notion-spec-to-implementation](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-spec-to-implementation/SKILL.md) | Keep | Requirement/task traceability and evidence-based progress; explicitly avoids mandatory planning artifacts or fixed task counts. |
| [notion-weekly-project-digest](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/notion/3.0.8/skills/notion-weekly-project-digest/SKILL.md) | Keep | Distinguishes historical transitions, current status, activity, and completed delivery; deduplicates period records. |

**Other plugin skills**

| Package / skill | Recommendation | Exact reason |
|---|---|---|
| Pages `0.1.26` / [maintain-space](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/pages/0.1.26/skills/maintain-space/SKILL.md) | Keep | Useful reconciliation, dated-record preservation, coverage, and guarded-edit semantics. |
| Pages / [organize-space](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/pages/0.1.26/skills/organize-space/SKILL.md) | Keep | Cross-Space access previews, required confirmation, and operation recovery are actual provider contracts. |
| Pages / [manage-schedules](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/pages/0.1.26/skills/manage-schedules/SKILL.md) | Compact | Six repetitive intent cases and “delight” coaching; preserve automation IDs, attachment, and update semantics. |
| Pages / [write-page](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/pages/0.1.26/skills/write-page/SKILL.md:14) | Compact | Editorial policy duplicates Documents; repeated clarification/approval coaching. Preserve native content, edit guards, and receipts. |
| Parallel `1.2.2` / [parallel-deep-research](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/app-69fb9378663481919a68e8a2109644e5/1.2.2/skills/parallel-deep-research/SKILL.md) | Keep | Response-ID continuity and uncertain billable-retry handling are specific operational safeguards. |
| Parallel / [parallel-search-setup](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/app-69fb9378663481919a68e8a2109644e5/1.2.2/skills/parallel-search-setup/SKILL.md) | Keep | Correctly separates anonymous tools from protected Research and native account linking. |
| Parallel / [parallel-web-extract](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/app-69fb9378663481919a68e8a2109644e5/1.2.2/skills/parallel-web-extract/SKILL.md) | Keep | Focused fetch/excerpt, truncation, exact-URL, and per-URL failure handling. |
| Parallel / [parallel-web-search](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/app-69fb9378663481919a68e8a2109644e5/1.2.2/skills/parallel-web-search/SKILL.md) | Keep | Short search/fetch routing with live-schema and anonymous-access contracts. |
| Plugin Management `0.1.0` / [plugin-management](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/plugin-management/0.1.0/skills/plugin-management/SKILL.md) | Keep | Direct discovery, permissions, connection, and uninstall boundaries; no arbitrary validation gate. |
| Sites `1.1.4` / [sites](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/sites/1.1.4/skills/sites/SKILL.md) | Keep | Concrete identity/source/archive/audience/deployment contracts; verification is scoped and publishing has no extra conversational gate. |
| Sites / [sites-remix](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/sites/1.1.4/skills/sites-remix/SKILL.md:23) | Compact | Rigid intake ordering, three-question quota, and required warm invitation; preserve remix identity, uncopied-data, and secret-entry rules. |
| Pets `0.1.6` / [create-pet](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/work-pets/0.1.6/skills/create-pet/SKILL.md:23) | Compact | Fixed checklist/time budgets and conditional worker/blind-review mandates. Preserve v2 geometry, motion checks, exact-byte validation, and upload lifecycle. |
| Pets / [pets](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/work-pets/0.1.6/skills/pets/SKILL.md) | Keep | Stable identity, pagination, expiring transport URLs, selection, and destructive deletion semantics. |
| Pets / [update-pet](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/work-pets/0.1.6/skills/update-pet/SKILL.md) | Keep | Separates metadata from artwork changes and preserves stable identity and active selection. |

**Bundled templates `0.1.1` — all 20 keep.** These short wrappers provide distinct template discovery and fidelity instructions. Names below have the `artifact-template-` prefix.

| Skill suffix | Recommendation | Exact reason |
|---|---|---|
| [analytics-dashboard](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-analytics-dashboard/SKILL.md) | Keep | KPI workbook route; preserves formulas and charts. |
| [business-review](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-business-review/SKILL.md) | Keep | Distinct performance-review deck; preserves masters and native objects. |
| [design-report](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-design-report/SKILL.md) | Keep | Distinct report reference; preserves document structure and styles. |
| [experiment-analysis](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-experiment-analysis/SKILL.md) | Keep | Experiment-report routing and document fidelity. |
| [financial-budget](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-financial-budget/SKILL.md) | Keep | Budget/forecast reference and spreadsheet fidelity. |
| [investment-committee-memo](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-investment-committee-memo/SKILL.md) | Keep | Investment-memo routing and document fidelity. |
| [legal-memorandum](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-legal-memorandum/SKILL.md) | Keep | Legal-memo routing and document fidelity. |
| [market-trends-report](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-market-trends-report/SKILL.md) | Keep | Market-report deck routing and slide fidelity. |
| [minimal-letterhead](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-minimal-letterhead/SKILL.md) | Keep | Letterhead reference and recurring-page-element fidelity. |
| [operating-calendar](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-operating-calendar/SKILL.md) | Keep | Operating-calendar routing and spreadsheet fidelity. |
| [operating-review](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-operating-review/SKILL.md) | Keep | Recurring operating-review deck and slide fidelity. |
| [project-kickoff](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-project-kickoff/SKILL.md) | Keep | Kickoff-deck routing and slide fidelity. |
| [project-tracker](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-project-tracker/SKILL.md) | Keep | Tracker reference; preserves validation, formulas, and panes. |
| [sales-pipeline](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-sales-pipeline/SKILL.md) | Keep | Pipeline-workbook routing and spreadsheet fidelity. |
| [simple-dark-mode](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-dark-mode/SKILL.md) | Keep | Distinct dark presentation reference. |
| [simple-light-mode](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-simple-light-mode/SKILL.md) | Keep | Distinct light presentation reference. |
| [strategy-memorandum](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-strategy-memorandum/SKILL.md) | Keep | Strategy-memo routing and document fidelity. |
| [system-design](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-system-design/SKILL.md) | Keep | Architecture-document routing and document fidelity. |
| [team-alignment](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-team-alignment/SKILL.md) | Keep | Team-planning deck routing and slide fidelity. |
| [three-statement-forecast](/Users/novalien0424/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-three-statement-forecast/SKILL.md) | Keep | Integrated-forecast routing and formula/name fidelity. |

No writes, tests, or delegation performed.
