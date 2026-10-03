# Personal skills and harness compaction — 2026-09-13

Applied the user's requested [OpenAI GPT-6 Astra guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) to six personal skills, eight project skills and the related instruction/configuration files. Subsequent user steering requires English skill/harness instructions. Chinese remains only in exact product phrases, quotations, examples and language-specific test data; historical archives retain their source wording.

## Scope and ownership

- Personal skills under `C:/Users/b8901/.codex/skills`: magic-mirror-avatar-studio, pdf, sat-course-transcript, speak-human-tw, wan-i2v-comfyui-prompter, yao-meta-skill. `speak-human-tw` is a junction to `C:/Users/b8901/.agents/skills/speak-human-tw`; its canonical target was edited once.
- Personal `C:/Users/b8901/.codex/AGENTS.md`; the Yao package's instruction router; avatar/editorial references and affected interface metadata.
- Project [AGENTS](../../AGENTS.md), [CLAUDE](../../CLAUDE.md), [PROGRESS](../../PROGRESS.md), [DECISIONS](../../DECISIONS.md), eight `.agents/skills` entrypoints/references, and `.codex` role descriptions/config.
- Vendor-managed `.system` and plugin-cache skills were excluded after an optional scope question received no expansion instruction. Their upstream files may still contain old workflows. Personal preferences establish the requested local default where advisory skill guidance differs; they do not override system/developer/tool rules. No cache patches, plugin installs or remote writes.

## Result

Shorter capability-specific descriptions and task-specific reference routing replace blanket reading, rigid sequences, scoring loops and repeated approval. The active model is the user's/session selection rather than an obsolete Sol instruction. Optional agents retain their configured model/effort; project concurrency now matches the existing maximum of two. No product model IDs or dependencies changed.

All 12 canonical invariants and the complete protected Windows/firewall/restart boundary were preserved verbatim. Historical progress/decision content remains in [progress archive](../archive/progress-before-harness-2026-09-13.md) and [decision archive](../archive/decisions-before-harness-2026-09-13.md), with relocated links checked.

Corrected stale SDK-element audio guidance to the existing muted receiver/shared processed output, and removed fixed farewell/model defaults from active wake guidance. Current source evidence: `src/renderer/realtime/processed-audio-output.ts` and the dated voice decisions. These are instruction corrections, not product changes.

English avatar references retain PSD/Editor/source ownership, actual MOC compatibility, export/import/display distinctions, alpha/turn/gaze/timing checks and exact helper interfaces. The longer research source index remains on demand. English editorial references preserve fidelity and the author's voice; Chinese fixture passages are data. Link cleanup and invented author experiences are not authorized by a style request.

Size measures are UTF-8 bytes, not token benchmarks. Detailed references and history are excluded from entrypoint reductions because they load only when needed.

| Surface | Before | After | Reduction |
|---|---:|---:|---:|
| Personal skill entrypoints | 39,923 | 14,215 | 64.4% |
| Project skill entrypoints | 53,751 | 13,136 | 75.6% |
| Project AGENTS / CLAUDE / PROGRESS / DECISIONS | 52,525 | 23,351 | 55.5% |

## Validation

Final static command: `python .artifacts/harness-compaction-20260913/validate.py` with `PYTHONUTF8=1`: **exit 0; 14 skills, 15 interface YAML files, five TOML files, 171 relative links, 50 backup hashes, and both unchanged protected AGENTS blocks; no errors**. `git -c core.autocrlf=false diff --check`: **exit 0**. The initial link check identified this not-yet-written report; the completed report resolves that link.

Yao's existing `scripts/trigger_eval.py --description-file SKILL.md --cases evals/trigger_cases.json --semantic-config evals/semantic_config.json`: **92 cases, exit 0, zero false positives/negatives** after tightening the description. This is a deterministic phrase-based routing heuristic, not a fresh model-behavior evaluation. Initial wording had five misfires; an intermediate revision had one README-only false positive. The final wording restored the baseline's zero-misfire result without changing thresholds, evaluator or fixtures. A first Windows run hit cp950 stdout encoding; rerunning with UTF-8 resolved it. Local outputs remain in `.artifacts/harness-compaction-20260913/`.

Manual instruction-boundary review covered applicable/near-neighbor requests for each skill:

| Skill | Applies | Does not expand into |
|---|---|---|
| Avatar studio | Repair a portrait-derived Cubism rig and verify display | Generic image edit, product voice rewrite, publishing operator drafts |
| PDF | Edit/render PDF pages | Unnecessary rendering for a simple text lookup |
| Course transcript | Authorized lesson playback to detailed transcript | Summary-only work, bypassing access, repeating established rights confirmation |
| Wan I2V | Positive/negative image-to-video prompts | Installing workflows or generating a video unasked |
| Speak Human | Requested Chinese rewrite | Fact-checking, inventing facts, sending/publishing; annotation-only stays read-only |
| Yao | Workflow-to-skill or skill routing/package maintenance | README-only editing, automatically running release machinery |
| Electron | Main/IPC/persistence/worker boundary | Ordinary CSS changes or incidental dependency replacement |
| Face | Candidate/enrollment/rebuild boundary | Recognizing a public avatar asset or starting a phase |
| Invariants | Private identity/mic/spell/model boundary | A blanket gate for unrelated UI work |
| Cubism | Rendering/motion/lip-sync/framing | Ordinary library labels or asserting physical sound from screenshots |
| Phase | Requested slicing/demo/exit | Routine fix/status or implicit promotion |
| Realtime | Session/transcript/output/owner boundary | Retargeting product models to the coding model |
| UI QA | Actual Console/portrait visual checks | Every unit test, operator-data publication or unmarked artifact deletion |
| Wake | KWS package/capture/handoff | Fixed historical farewell text or unrelated active speech |

This was direct review of instructions, not independent forward testing or fresh application QA. No Electron/full suite/build was run for these documentation changes. The clock-in tree was clean; no Electron process was found, and no runtime was started/stopped. No commit, push, configuration publication or phase promotion.

## Local recovery

`C:/Users/b8901/.codex/backups/harness-20260913/manifest.json` maps changed paths to pre-edit backups and SHA-256 values. Three directly patched interface files have explicitly labeled reconstructions from their recorded pre-edit reads rather than original-byte snapshots. All other existing-file backups are raw pre-edit copies. New reference/archive files have no prior content. Restore only selected paths after checking for newer user edits; no automatic rollback/deletion was performed.

The active session already received an initial skill catalog. These disk changes do not rewrite previously injected instructions; use a fresh session to assess discovery/adoption. No fresh-session behavior or vendor-package release readiness is claimed.
