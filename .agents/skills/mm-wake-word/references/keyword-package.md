# Keyword configuration

Use the installed package manifest and `src/main/wake/sherpa-detector.ts` as the authority for model files, token vocabulary and tuning. Do not substitute model IDs or invent confidence scores.

- `loadWakeModelPackage` verifies the original manifest, platform and artifact hashes first. The original phrase uses its verified keyword artifact.
- A different selected-avatar phrase goes through `compileWakePhrase`: bundled, licensed Mandarin pinyin and English pronunciation data → tokens checked against the installed vocabulary → a local keyword file. No network, retraining or Python dependency is needed at runtime. Unsupported pronunciation/token errors are explicit; do not silently keep the previous phrase.
- Custom encoded lines contain phonemes followed by the fixed label `@avatar_wake`. Package threshold, score and trailing blanks are defaults; enabled avatar overrides must match the exact phrase and reach the worker. For the original phrase, retain verified phonemes and remove conflicting inline keyword tuning in a derived file. Never let an embedded `:score` or `#threshold` silently defeat Console settings. Public phrase labels are not transcript diagnostics.
- On a changed published phrase or avatar selection, release the worker microphone, update its package, then reacquire only in Dormant/OfflineLoop. Realtime owns the microphone during conversation.
- Verify configuration/encoding and native detector loading separately from spoken detection. Physical accuracy requires spoken positive/negative tests; an arbitrary custom phrase does not inherit the default phrase's corpus evidence. Corpus testing is not a gate on unrelated conversation/config edits.
- Reset the detector after each match. Sherpa results expose a keyword, not a calibrated event confidence.

References: [sherpa keyword spotting](https://k2-fsa.github.io/sherpa/onnx/kws/index.html), [upstream encoder](https://github.com/k2-fsa/sherpa-onnx/blob/master/scripts/text2token.py). Bundled lexicon provenance and licenses are in `src/main/wake/lexicon/`.
