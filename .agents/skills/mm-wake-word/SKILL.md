---
name: mm-wake-word
description: "Implement, tune or diagnose Magic Mirror sherpa-onnx wake detection, physical microphone input, keyword packages or wake-to-Realtime handoff."
---

# Wake word

Main verifies the hashed sherpa-onnx model package, then compiles the active avatar's wake phrase with the bundled pronunciation lexicon and that model's tokens. Preserve the original phrase's verified pronunciation. Package defaults apply unless the selected avatar enables overrides bound to that exact phrase. Model/lockfile pins remain authoritative; another supported phrase needs encoding, not automatic neural retraining.

- For encoding, worker config and false-wake tuning: [keyword package](references/keyword-package.md). Use model-owned tokens, 16 kHz / featureDim 80, and reset the spotter after detection. Keyword tuning is not neural training; configured thresholds are not measured per-event confidence.
- For physical wake RCA, permissions, release/acquire ownership or recovery: [handoff/platform](references/handoff-platform.md). Mac is the canonical deployment target; identify the failed boundary before tuning. Historical Windows evidence does not establish Mac wake accuracy.

Normal wake capture listens in Dormant/OfflineLoop and releases before Realtime acquires. Updating the active phrase releases, updates, then reacquires only in a listening lifecycle state. Caller-owned renderer tracks stop before wake reacquires. Handoff failure is local Maintenance; a failed wake module alone does not imply that transition. Sleep uses the current avatar's separate `sleepPhrase` and farewell; changing the farewell does not change its trigger.

Use current PROGRESS links for physical and corpus evidence. A loaded worker, a synthetic PCM match and completed speaker playback each prove different boundaries. Establish fresh native input and delivery before attributing a miss to permissions, echo cancellation or detector sensitivity. Enabling sensitivity tuning in Persona allows testing; it does not certify accuracy. Tune on representative approved positives and negatives, then validate on separate samples. [AGENTS](../../../AGENTS.md) owns privacy and execution rules.
