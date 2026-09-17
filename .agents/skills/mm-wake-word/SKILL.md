---
name: mm-wake-word
description: "Implement or tune Magic Mirror sherpa-onnx wake detection, keyword packages, capture or wake-to-Realtime microphone handoff."
---

# Wake word

Main verifies the hashed sherpa-onnx model package, then compiles the active avatar's wake phrase with the bundled pronunciation lexicon and that model's tokens. Preserve the original phrase's verified pronunciation. Package defaults apply unless the selected avatar enables overrides bound to that exact phrase. Model/lockfile pins remain authoritative; another supported phrase needs encoding, not automatic neural retraining.

- For encoding, worker config and false-wake tuning: [keyword package](references/keyword-package.md). Use model-owned tokens, 16 kHz / featureDim 80, and reset the spotter after detection. Keyword tuning is not neural training; configured thresholds are not measured per-event confidence.
- For release/acquire ownership, crashes or Mac port constraints: [handoff/platform](references/handoff-platform.md). Mac version caveats need verification at the port, not a current Windows gate.

The worker listens in Dormant; it confirms stream release before Realtime acquires. Updating the active phrase also releases, updates, then reacquires the worker. Caller-owned renderer tracks stop before wake reacquires. Handoff failure is local Maintenance. Sleep uses the current avatar's separate `sleepPhrase` and farewell; changing the farewell does not change its trigger.

Use the current PROGRESS links for unresolved first-boot and corpus evidence. Enabling sensitivity tuning in Persona allows testing; it does not certify accuracy. Tune pronunciation/parameters on representative approved positives and negatives, then validate on separate samples. Synthetic success and worker loading are not spoken accuracy. [AGENTS](../../../AGENTS.md) owns phase, privacy and execution rules.
