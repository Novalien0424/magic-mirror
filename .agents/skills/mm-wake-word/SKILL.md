---
name: mm-wake-word
description: Use when implementing or tuning the sherpa-onnx Chinese wake-word worker, custom keyword encoding, mic capture for the wake path, false-wake tuning, or the wake-to-realtime mic handoff (Phase 2).
---

# sherpa-onnx Chinese Wake Word - Magic Mirror Reference

## Overview

Verified **2026-08-16**. Baseline stack: `sherpa-onnx-node@1.13.5` or newer + `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01` (int8) + `decibri` capture, in a worker process owned by Electron Main. Re-verify versions when Phase 2 pins the lockfile.

## Codex routing

For wake-word or microphone-handoff work, follow `AGENTS.md` together with
`.agents/skills/mm-phase-workflow/SKILL.md` and
`.agents/skills/mm-invariants/SKILL.md`, then add this domain skill. Check the
applicable invariant IDs `8, 9, 10, 12`. Use the default route of one bounded
fresh implementer, focused RED/GREEN for behavior changes, one independent
tester, and external root acceptance; a correction or extra gate needs a
concrete root finding or escalation trigger. Keep the exact scope,
metadata-only evidence, no-recursion, and root-review rules from `AGENTS.md`.

Use `apply_patch` for writes. In particular, preserve the explicit
release-then-acquire microphone handoff, visitor-visible or metadata-only
degradation reasons, non-gating failure behavior, and Main `safeStorage`
credential boundary described by invariants `8, 9, 10, 12`.

## Critical Version Pin

**Pin sherpa-onnx >= 1.13.5.** On SME-capable Apple Silicon (M4 - our target
Mac mini), **1.13.4's KeywordSpotter detects nothing, ever, silently** -
bundled onnxruntime 1.27.0 KleidiAI miscomputes the zipformer frontend conv
(k2-fsa/sherpa-onnx#3791, fixed by ORT 1.27.1 in 1.13.5). 1.13.5 also fixed
macOS release codesigning (#3794). If ever stuck on 1.13.4:
`mlas.disable_kleidiai=1`.

## Model & Keywords

- Model: `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01` (Chinese;
  encoder/decoder/joiner ONNX + int8 variants + `tokens.txt`). Tarball:
  `github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/<name>.tar.bz2`.
  Fixed 16 kHz / featureDim 80. Alternative zh-en model:
  `...-kws-zipformer-zh-en-3M-2025-12-20` (needs `en.phone` lexicon).
- Keywords workflow: human `keywords_raw.txt` -> encoded `keywords.txt` via
  `sherpa-onnx-cli text2token --tokens tokens.txt --tokens-type ppinyin`
  (needs `pip install pypinyin`). Line syntax:
  `<phrase> :<boost> #<threshold> @<display>` - e.g. the source example
  `\u9b54\u93e1\u9b54\u93e1 :2.0 #0.45 @\u9b54\u93e1\u9b54\u93e1` (ASCII-normalized
  code-point escape form; display text may not contain spaces; use `_`).
  Per-keyword values of 0/absent fall back to globals.

## Node Worker Config (camelCase)

```js
const kws = new sherpa_onnx.KeywordSpotter({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: { transducer: { encoder, decoder, joiner }, tokens, numThreads: 2, provider: 'cpu' },
  keywordsFile, maxActivePaths: 4, numTrailingBlanks: 2, // raise to 4-8 vs false wakes
  keywordsScore: 1.0, keywordsThreshold: 0.45,           // default 0.25 is loose
});
// loop: stream.acceptWaveform -> while isReady -> decode -> getResult
// ALWAYS kws.reset(stream) after every detection - the official Node example
// omits this and repeat detections misbehave without it.
```

- Capture: `decibri@5.x` (maintained, darwin-arm64 prebuilt; Int16->Float32 via
  /32768) or `node-cpal` + `LinearResampler(nativeRate, 16000)`.
  `node-record-lpcm16` is dead - do not use. Python fallback path: PyPI
  `sherpa-onnx==1.13.5` + `sounddevice` (the better-trodden example).

## Tuning False Wakes

- Trigger = trailing blanks exceeded AND mean per-token probability >=
  threshold. Raise `#threshold` (0.35-0.6 for a 4-syllable phrase), lower
  `:boost`, raise `numTrailingBlanks`. Boost makes triggering easier,
  threshold harder - tune in opposite directions.
- **No confidence score is surfaced** - result JSON has only
  keyword/timestamps/tokens. Telemetry "wake confidence" must therefore log
  the configured threshold + keyword, not a per-event score (or derive a
  proxy offline by threshold binary-search on the corpus).
- Wake phrase: 3-6 syllables, not a daily-conversation string (PRD Section
  15). Validate with the recorded-WAV corpus runner in Console (Phase 2) and
  the 30-min ambient/TV negative test.

## Mic Handoff (invariant #8)

Worker holds the mic only in Dormant. On detection: worker closes its stream
and confirms release -> Main tells renderer to acquire -> Realtime session
owns mic. Reverse on Suspending/OfflineLoop - and note the Realtime SDK's
`close()` does NOT stop app-owned mic tracks: the renderer must `track.stop()`
each track before Main hands the mic back (Spec Section 8.1), or this worker
hits device-busy. Handoff failure = local audio fault -> Maintenance (never
OfflineLoop). During Active the worker must not reopen the mic; a wake phrase
said mid-conversation is just a normal utterance.

## macOS Gotchas

- TCC attributes the mic prompt to the nearest signed ancestor (the app that
  spawned the worker), not the worker binary. Dev from Terminal: grant
  Terminal the mic. Production: worker lives inside the signed `.app` bundle
  with `NSMicrophoneUsageDescription`; silence-with-no-error = permission
  denial, surface it as a Console `wake_worker` failure, do not spin.
- Node `types.js` mistypes `KeywordSpotterConfig.modelConfig` as offline -
  cosmetic; the runtime wants the transducer shape above.
- Worker crash -> Main restarts once; still failing -> Maintenance + Console
  `Failed` (Spec Section 14). Wake must keep working with the network down.
