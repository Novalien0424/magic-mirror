---
name: mm-wake-word
description: "Diagnose or tune Magic Mirror wake detection, keyword packages and microphone handoff."
---

# Wake word

`npm run evaluate:wake` runs the versioned corpus/tuning evaluator. Inspect its
selected positives, negatives and acoustic route before interpreting the rates.

Main verifies the hashed sherpa-onnx model package, then compiles the active avatar's wake phrase with the bundled pronunciation lexicon and that model's tokens. Preserve the original phrase's verified pronunciation. Package defaults apply unless the selected avatar enables overrides bound to that exact phrase. Model/lockfile pins remain authoritative; another supported phrase needs encoding, not automatic neural retraining.

- Encoding, worker config and false-wake tuning: [keyword package](references/keyword-package.md). Use model-owned tokens, 16 kHz / featureDim 80, and reset the spotter after detection. Keyword tuning is not neural training; configured thresholds are not measured per-event confidence.
- Physical wake RCA, permissions, release/acquire ownership or recovery: [handoff/platform](references/handoff-platform.md). Identify the failed boundary before tuning.

Native wake listens only in Dormant/OfflineLoop, and not while Dormant music plays (owner 2026-11-07: sync over voice control; the Jabra plays ~150 ms early with its microphone open, so every song or loop handed to Dormant releases the wake listener until the music ends or STOP/Console/a mode key stops it). During Active media, the wake phrase is matched from Realtime ASR under the shared sound-alike rules (DECISIONS 2026-10-11), never by reopening native capture. Sleep is model-intent routing through `return_to_dormant`, not a wake keyword; `sleepPhrase` is a tool/ASR hint and the farewell is separate.

Use current PROGRESS links for physical and corpus evidence. A loaded worker, a synthetic PCM match and completed speaker playback each prove different boundaries. Establish fresh native input and delivery before attributing a miss to permissions, echo cancellation or detector sensitivity. Enabling sensitivity tuning in Persona allows testing; it does not certify accuracy. Tune on representative approved positives and negatives, validate on separate samples, and report detection and false-wake rates for the tested route.
