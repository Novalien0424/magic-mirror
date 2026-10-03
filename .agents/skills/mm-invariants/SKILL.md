---
name: mm-invariants
description: "Resolve Magic Mirror privacy, guest identity, memory ownership, mic exclusivity, exact spell matching or visible degradation boundaries."
---

# Invariant interpretation

[AGENTS](../../../AGENTS.md#canonical-product-invariants) is the single owner of the 12 canonical IDs; [DECISIONS](../../../DECISIONS.md) supplies dated implementation rulings. Apply only the IDs implicated by the task.

## Non-obvious distinctions

- **1 / 12:** diagnostics contain metadata, never utterances, conversation audio, extracted values, private prompts, credentials, camera frames or embeddings. The RAM Console transcript clears on Dormant/restart. Future memory schemas do not authorize persistence under today's ruling.
- **2 / 3 / 4:** public avatar/scene IDs and spoken names are not private guest IDs. Model confirmation returns only yes/no/unclear; Main resolves its pending candidate. Clear that candidate on denial, second ambiguous response, owner switch, session close or sleep. Multiple people require explicit conversation-owner selection, not model disambiguation.
- **5 / 6:** freeze extraction ownership at turn start, not completion; any control intent skips extraction. Keep debug decisions content-free and Main-local where they include private IDs.
- **7:** normalize and compare the entire final transcript. Partial adapter failure still consumes the turn's one scene trigger. Only approved typed presets control hardware.
- **8 / 10:** a failed mic handoff is local Maintenance, not cloud OfflineLoop. SDK session close does not release caller-owned tracks. An unrelated camera, extractor or adapter cannot block speech.
- **9:** repeated identical failures may collapse into a reasoned counter, never disappear. Sanitize raw errors before telemetry. Mock adapters require operator configuration, not automatic substitution.
- **11:** a bounded retry uses the same configured ID. Publish of a tested draft or whole-config rollback changes configuration; runtime failure never selects another model.

No speaker diarization or continuous post-confirmation face tracking is implied. Guest-facing memory-management tools and privacy-grade backup erasure require their own scoped product work; historical/future plans are not authorization.
