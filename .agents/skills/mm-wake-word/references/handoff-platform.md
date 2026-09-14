# Mic handoff and Mac port caveats

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Mic Handoff (invariant #8)

Worker holds the mic only in Dormant. On detection: worker closes its stream
and confirms release -> Main tells renderer to acquire -> Realtime session
owns mic. Reverse on Suspending/OfflineLoop - and note the Realtime SDK's
`close()` does NOT stop app-owned mic tracks: the renderer must `track.stop()`
each track before Main hands the mic back (Spec Section 8.1), or this worker
hits device-busy. Handoff failure = local audio fault -> Maintenance (never
OfflineLoop). During Active the worker must not reopen the mic; a wake phrase
said mid-conversation is just a normal utterance.

The Active-only sleep command uses the current avatar configuration and directed-intent contract, never a wake keyword. Preserve the configured exact farewell; reject quoted, negated, hypothetical or incidental mentions. After goodbye playback completes,
Main owns the payload-free transition back to Dormant and the release-then-
acquire mic handoff.

## Critical Version Pin

**Pin sherpa-onnx >= 1.13.5.** On SME-capable Apple Silicon (M4 - our target
Mac mini), **1.13.4's KeywordSpotter detects nothing, ever, silently** -
bundled onnxruntime 1.27.0 KleidiAI miscomputes the zipformer frontend conv
(k2-fsa/sherpa-onnx#3791, fixed by ORT 1.27.1 in 1.13.5). 1.13.5 also fixed
macOS release codesigning (#3794). If ever stuck on 1.13.4:
`mlas.disable_kleidiai=1`.

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
