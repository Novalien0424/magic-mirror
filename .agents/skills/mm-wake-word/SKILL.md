---
name: mm-wake-word
description: "Implement or tune Magic Mirror sherpa-onnx wake detection, keyword packages, capture or wake-to-Realtime microphone handoff."
---

# Wake word

Main owns one replaceable hashed sherpa-onnx package binding model, tokens, phrase, platform and tuning. Package/lockfile pins are authoritative; no runtime engine fallback or incidental dependency change.

- For encoding, worker config and false-wake tuning: [keyword package](references/keyword-package.md). Use model-owned tokens, 16 kHz / featureDim 80, and reset the spotter after detection. Keyword tuning is not neural training; configured thresholds are not measured per-event confidence.
- For release/acquire ownership, crashes or Mac port constraints: [handoff/platform](references/handoff-platform.md). Mac version caveats need verification at the port, not a current Windows gate.

The worker listens in Dormant; it confirms stream release before Realtime acquires. Caller-owned renderer tracks must stop before wake reacquires. Handoff failure is local Maintenance. Sleep uses the current avatar's directed command/farewell; it is not a wake keyword.

Use the current PROGRESS links for unresolved first-boot and corpus evidence. Synthetic success does not establish real wake accuracy; deferred field gates stay deferred until the requested phase acceptance. [AGENTS](../../../AGENTS.md) owns phase, privacy and execution rules.
