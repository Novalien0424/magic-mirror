# Numerical wake calibration — Windows, 2026-09-16

## Delivery and interpretation

The live test now displays the native acoustic score as a decimal from 0 to 1,
alongside matched/total sound-token counts, the applied threshold, decoder-step
count and candidate trailing blanks. A partial phrase can have a high acoustic
score and still not trigger. The value is not a calibrated probability of waking.
Actual detections remain a separate counter/status. Audio is never recorded.

The pinned sherpa-onnx 1.13.6 public result API exposes keyword/tokens/timestamps,
but not acoustic scores. The local native patch exports numerical data already
computed by the decoder, including incomplete and below-threshold candidates.
It does not modify the matching/threshold decision, wake model, pronunciation,
published avatar settings, or microphone ownership. Complete candidates use
the exact arithmetic mean compared against the native acoustic threshold;
partial candidates use their matching suffix. The furthest candidate is retained
per decode and per approximately 500 ms UI update, with score breaking ties.
Only the most probable beam path at each frame contributes; this is not the
furthest progress over all alternative paths in the decoder beam.

Primary sources inspected:

- [Pinned result API](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.6/sherpa-onnx/csrc/keyword-spotter.h)
- [Pinned native keyword decoder](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.6/sherpa-onnx/csrc/transducer-keyword-decoder.cc)
- [Keyword score and threshold semantics](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)

The independently built extension lives in ignored
`resources/wake-native/win32-x64/`; the original npm package is unchanged.
Source checksum, reviewable patch, build command and bundle hash validation are
tracked. See [native build instructions](../../resources/wake-native/README.md).
Electron extraResources stages it outside ASAR; QA build stamps include the
native bundle and its build inputs. A Mac native build remains unimplemented.

## Reported zero detections

The operator reported a moving microphone meter and no detections even at 0.18.
The 11:20 normal session and subsequent calibration changes reported successful
microphone acquisition; there was no capture-failure event in that interval.
The historical spoken attempts were not recorded and cannot be reconstructed.

A separate real defect was reproduced in the adapter: when one supplied audio
block spans multiple decoder steps, reading the result only after the loop can
lose an earlier detection. The synthetic phrase delivered as one 63,273-sample
block produced zero detections before the fix and one with per-step reads.
The adapter now checks every step. A failing regression test was observed before
the fix. This does not establish that coalesced input caused the operator's
live misses; ordinary 1,600-sample synthetic input already detected successfully.

With the same existing synthetic phrase, the new native extension measured:

| Input | Threshold | Detections | Observation |
| --- | ---: | ---: | --- |
| Synthetic phrase | 0.18 | 1 | Full 9/9 tokens, acoustic mean 0.675640 |
| Same phrase | 1.00 | 0 | Same nonzero full-phrase score remains visible below threshold |
| Coalesced synthetic audio | 0.18 | 1 | Per-step result consumption preserves the match |
| Three separated phrases | 0.18 | 3 | Repeated detections continue |
| Silence | 0.18 | 0 | No matched tokens or false detection |

Live speaker playback in the operator's temporary test (0.18, score 1, trailing
blanks 1) showed microphone activity and advancing decoder steps but zero matched
tokens/detections. The OS default input/output is Echo Cancelling Speakerphone,
which may suppress its own playback. This is not a valid substitute for the
operator's spoken positive trial. No device or published setting was changed.

The operator then spoke the phrase three times and confirmed completion. Direct
Console observation recorded **2 detections**, with complete 9/9-token scores
of **0.517361** and **0.473206**, at threshold 0.18, keyword score 1 and trailing
blanks 1. Partial progress, including 4/9 tokens without a trigger, was also
visible. This establishes that the native score and live detection work on the
operator's microphone, but does not establish reliable three-for-three waking
or explain the original zero-detection interval. Lowering the threshold alone
cannot make an incomplete token match trigger. Temporary numerical observation
was RAM-only and removed; the test was stopped without saving its settings.

## Verification and limits

- `npm run build:wake-native`: exit 0 under PowerShell 7; pinned source patch,
  Windows C API DLL build, separate bundle installation and hash check passed.
- `node scripts/test-wake-score-native.mjs resources/wake-models/sherpa-magic-mirror-win-v2 .artifacts/wake-startup-20260906/synthetic-wake.wav`:
  exit 0, all five native cases above passed. Fixture is preexisting public
  synthetic speech, not visitor microphone audio.
- `npx vitest run tests/main/wake tests/unit/wake-score-ui.test.ts tests/unit/wake-tuning-ui.test.ts tests/unit/qa-build.test.ts tests/unit/console-ipc.test.ts tests/unit/boot-runtime.test.ts`:
  exit 0, 141 tests / 19 files. Subsequent malformed-measurement and stamp checks:
  28 tests / 5 files passed, including clearing a stale score on invalid data.
  Final missing-native error and display follow-up: 21 tests / 4 files passed.
  Calibration now fails visibly if the numerical native extension is missing.
- `npm run typecheck:web`: exit 0. `npm run typecheck:node`: only the existing
  TS7016 at `tests/unit/qa-artifacts.test.ts:6` for `scripts/qa-artifacts.mjs`.
- `npm run build`: exit 0.
- `npm run test:phase4:qa:profiles`: exit 0, 33 checks / 31 screenshots.
  [Final evidence](../../.artifacts/phase4-qa/2026-09-16T03-55-04-715Z/evidence.json),
  [numerical panel](../../.artifacts/phase4-qa/2026-09-16T03-55-04-715Z/screenshots/profile-live-wake-calibration.png).
  Screenshot inspected: numerical score, token progress, threshold, microphone
  and actual detection count are visible together. The earlier run
  `2026-09-16T03-49-23-463Z` passed but captured before decoder warmup following
  a threshold change; the final run explicitly waits for resumed numerical data.
- Optional `npm run package` did not complete: it remained at packaging after
  Electron download with no further progress and was stopped. Its log is kept at
  `.artifacts/sherpa-score-native/package.log`. Release packaging is unverified.

Physical human wake accuracy, false-positive rates, sustained hardware behavior,
and Mac behavior are not established by these checks. No phase promotion.
