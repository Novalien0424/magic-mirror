---
name: mm-invariants
description: "Resolve Magic Mirror invariant edge cases: diagnostics privacy, guest/candidate identity, memory ownership, control-turn extraction, spoken-command matching, mic ownership, visible degradation or model IDs."
---

# Invariant edge cases

[AGENTS](../../../AGENTS.md#canonical-product-invariants) states the 12 invariants and [DECISIONS](../../../DECISIONS.md) the dated rulings. This page adds only distinctions their text does not settle. Apply the IDs the task implicates.

- **1 / 12:** Diagnostics never carry utterances, conversation audio, memory values, private prompts, credentials, camera frames or embeddings. The Console transcript is session RAM and clears on Dormant/restart.
- **2 / 3 / 4:** Public avatar/scene IDs and spoken names are not guest IDs. Identity confirmation returns only yes/no/unclear; Main resolves its pending candidate and clears it on denial, a second unclear answer, owner switch, session close or sleep. Several people need explicit conversation-owner selection, not model disambiguation.
- **5 / 6:** Debug decisions that involve private IDs stay content-free and Main-local.
- **7:** "Normalized" includes deterministic pronunciation folding from the shared lexicon (DECISIONS 2026-10-11). The whole final utterance must still be the command: no substring, edit-distance or model-judged match. Partial adapter failure still consumes the turn's one trigger. Shared callers, cue timing and current gaps: [prompt controls](../mm-realtime-voice/references/prompt-controls.md).
- **8 / 10:** A failed mic handoff is local Maintenance, not cloud OfflineLoop. SDK session close does not release caller-owned tracks.
- **9:** Repeated identical failures may collapse into a reasoned counter, never disappear. Sanitize raw errors before telemetry. Mock adapters need operator configuration, never automatic substitution.
- **11:** A bounded retry reuses the same configured ID. Publishing a tested draft or a whole-config rollback changes configuration; a runtime failure never selects another model.

Not implied: speaker diarization, continuous identity tracking after confirmation, or privacy-grade erasure of external backups. Each needs its own scoped work.
