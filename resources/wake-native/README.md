# Windows wake score extension

`npm run build:wake-native` builds a small diagnostic patch against pinned
sherpa-onnx **1.13.6**. It requires Visual Studio 2022 C++ Build Tools, Windows
SDK, PowerShell 7, CMake, Git, and the existing npm dependencies. The source archive SHA-256
and native patch are pinned in `scripts/build-wake-score-native.ps1` and
`scripts/native/sherpa-onnx-1.13.6-wake-score.patch`.

The generated `win32-x64/` bundle is ignored. It contains the patched C API DLL,
upstream Node addon/JS wrappers, ONNX Runtime DLLs, Apache license, and a hash
manifest. `predev`/`prebuild` verify the patch and bundle; Electron packaging
copies it to `resources/wake-score-native`. The original npm installation is
unchanged. The existing versioned wake model and pronunciation remain unchanged.

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

Windows evidence does not establish a Mac native build. On other platforms the
original detector remains available; numerical calibration requires a port and
fails visibly with `wake_native_score_unavailable` if the extension is absent.
