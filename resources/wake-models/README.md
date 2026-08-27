# Local wake model packages

Each subdirectory is one immutable package created by
`scripts/import-wake-model.mjs`. Commit its `manifest.json` as candidate
provenance; large engine artifacts remain local and are copied into the
packaged app from this directory. Runtime activates only the single evaluated
package referenced by the published config and never falls back to another
engine.

Import packages with an explicit runtime platform. For example:

```powershell
node scripts/import-wake-model.mjs --package-id <id> --engine sherpa --engine-version 1.13.6 --model-version <version> --phrase "魔鏡阿魔鏡" --platform win32-x64 --method sherpa-text2token --source-id <source> --tuning '{"sampleRateHz":16000,"threshold":0.45,"score":1,"numTrailingBlanks":2}' --artifact encoder=<path> --artifact decoder=<path> --artifact joiner=<path> --artifact tokens=<path> --artifact keywords=<path>
```

Keep approved PCM16 mono 16 kHz WAVs under ignored `wake-corpus/` with a
manifest like:

```json
{"schemaVersion":1,"samples":[{"id":"positive-001","category":"positive","file":"positive-001.wav"},{"id":"hard-001","category":"hard_negative","file":"hard-001.wav"},{"id":"ambient-001","category":"background","file":"ambient-001.wav"}]}
```

After `npm run build`, compare packages with identical audio using
`npm run evaluate:wake -- wake-corpus/manifest.json package-a package-b`.
The evaluator runs on the current supported host (`win32-x64` during PC-first
development or `darwin-arm64` after the Mac mini port) and prints/writes only
aggregate rates, latency, processing time, and failures; it never emits sample
IDs or audio. Tune each engine separately and select at an equal false-accept
target. A Windows result does not replace later Mac mini runtime revalidation.
The minimum quality run is 100 positive utterances across
speakers/distances/noise, hard negatives including `魔鏡魔鏡` and `魔鏡啊魔鏡`,
and two hours of approved background audio. The official 30-minute live
ambient exit demo remains a separate human check.
