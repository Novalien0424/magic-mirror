# Local wake model packages

Each subdirectory is one immutable package created by
`scripts/import-wake-model.mjs`. Commit its `manifest.json` after evaluation;
large engine artifacts remain local and are copied into the packaged app from
this directory. Runtime activates only the single package referenced by the
published config and never falls back to another engine.

On the target Mac, keep approved PCM16 mono 16 kHz WAVs under ignored
`wake-corpus/` with a manifest like:

```json
{"schemaVersion":1,"samples":[{"id":"positive-001","category":"positive","file":"positive-001.wav"},{"id":"hard-001","category":"hard_negative","file":"hard-001.wav"},{"id":"ambient-001","category":"background","file":"ambient-001.wav"}]}
```

After `npm run build`, compare packages with identical audio using
`npm run evaluate:wake -- wake-corpus/manifest.json package-a package-b`.
The evaluator runs only on `darwin-arm64` and prints/writes aggregate rates,
latency, processing time, and failures; it never emits sample IDs or audio.
Tune each engine separately and select at an equal false-accept target. The
minimum quality run is 100 positive utterances across speakers/distances/noise,
hard negatives including `魔鏡魔鏡` and `魔鏡啊魔鏡`, and two hours of approved
background audio. The official 30-minute live ambient exit demo remains a
separate human check.
