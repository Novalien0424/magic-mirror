# Keyword encoding, worker config and tuning

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

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
