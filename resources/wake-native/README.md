# Wake score extension

`npm run build:wake-native` builds a small diagnostic patch against pinned
sherpa-onnx **1.13.6**. The cross-platform Node launcher preserves the existing
Windows PowerShell build and adds a native `darwin-arm64` C API build.

- Windows x64 requires Visual Studio 2022 C++ Build Tools, Windows SDK,
  PowerShell 7, CMake, Git, and the existing npm dependencies. Existing
  PowerShell arguments are forwarded unchanged, including `-Parallel 6`.
- Mac arm64 requires Xcode Command Line Tools, CMake, Git, curl, and the
  existing npm dependencies. `npm run build:wake-native -- --parallel 6`
  builds only the shared C API using the pinned upstream dependencies.
  The launcher uses the selected Xcode SDK returned by `xcrun`, keeping its
  compiler, linker and SDK aligned when Command Line Tools are also installed.

Both builds verify source archive SHA-256
`78f5d10f957d2de1867a1e08395e9ec2ec388911c853dd141887396667f3ff34`
and apply the unchanged `scripts/native/sherpa-onnx-1.13.6-wake-score.patch`.
The Mac build disables preinstalled ONNX Runtime discovery, using the
1.27.1 archive and hash already pinned by sherpa 1.13.6.
That pinned Mac runtime dylib declares a minimum macOS version of 26.4;
the C API compiler target alone does not provide compatibility with older Macs.

The generated `win32-x64/` and `darwin-arm64/` bundles are ignored. Each contains
the patched C API library, upstream Node addon/JS wrappers, matching ONNX
Runtime libraries, licenses, and a hash manifest. Mac uses
`libsherpa-onnx-c-api.dylib` and `libonnxruntime.dylib`; Windows retains its DLLs.
Mac build/download inputs stay in `.artifacts/sherpa-score-native-mac/`.

`predev`/`prebuild` verify the source pin, patch hash, platform, engine version,
and every installed file hash. Existing Windows manifests without a platform
field remain supported. Electron packaging selects the matching platform
bundle and copies it to `resources/wake-score-native`. The detector resolves
that packaged bundle first, then the matching development bundle. The original
npm installation, versioned wake model, pronunciation and gating are unchanged.

Only numerical candidate measurements cross the worker boundary: native acoustic
mean, matched/total sound-token counts, trailing blanks, and decoder-step count.
The acoustic mean is not a calibrated wake probability. Complete candidates
report the exact native threshold-comparison value; partial candidates report
the mean for their matching suffix. Each frame inspects the most probable beam
path, not every path in the beam. Each decode retains that path's furthest candidate,
breaking ties by score. Trigger decisions are unchanged. The panel aggregates
the furthest candidate over each approximately 500 ms update.

Sources: [keyword decoder](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.6/sherpa-onnx/csrc/transducer-keyword-decoder.cc),
[result API](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.6/sherpa-onnx/csrc/keyword-spotter.h).

Run `node scripts/prepare-wake-score-native.mjs` to verify the current bundle.
The Node-only native harness never opens a microphone or saves input audio:

```sh
node scripts/test-wake-score-native.mjs resources/wake-models/sherpa-magic-mirror-mac-v1 --synthetic-tone
node scripts/test-wake-score-native.mjs resources/wake-models/sherpa-magic-mirror-mac-v1 --silence
node scripts/test-wake-score-native.mjs resources/wake-models/sherpa-magic-mirror-mac-v1 /path/to/explicit-synthetic-16khz-wake.wav
```

The explicit synthetic wake fixture additionally checks positive, threshold-1
rejection, coalesced audio, and repeated detections. Synthetic/silence numerical
evidence does not establish human wake accuracy, TCC, signed packaging or
Electron live Console acceptance. Unsupported platforms retain the original
detector. Calibration fails visibly with `wake_native_score_unavailable` when
its native extension is absent.
