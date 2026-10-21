# QA modes and evidence

Start at [PROGRESS](../../../../PROGRESS.md) and the selected unresolved issue.
Read the chosen runner/probe, not every historical run. Mode names such as
`live` describe provider use, not necessarily physical input.

## Ownership and build

Runners/full `npm test` acquire `scripts/electron-owner.mjs`. Agent start/stop/
reload uses `node scripts/electron-owner.mjs <owner> <command> [args]` around the
whole operation. Nested runners inherit the lease. On Mac, the `.lock` inode is
kernel-owned: never unlink it; `.json` is diagnostic only. Legacy migration
requires a dead PID and known contents. Other platforms need checked stale-PID
cleanup. The lease cannot stop manually launched Electron; preserve operator
edits and ensure normal Electron is stopped before QA.

Canonical checkout only; Raven QA is Mac-only. Runners verify input/output hashes
from a completed build and retain `build.json`. Rebuild stale/interrupted/altered
output, never bypass hashes. Choose one supported Phase 4 mode; unknown/combined
flags fail. Prefer npm's named modes or direct Node flags to avoid forwarding loss.

## Raven runner

```sh
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario <id>
```

The [fixture](../../../../src/main/raven-conversation-fixture.ts) owns cases and
judge version; the [runner](../../../../scripts/run-raven-conversation-qa.mjs)
owns flags. Isolated comparisons: `--prompt baseline|trimmed|merged|focused`,
`--variant mini|full`, `--effort minimal|low`, `--persona published|sage|authoritative`.
Default persona is published. Provenance records prompt/tools/rendered/judge hashes,
model/effort and device route; comparisons never publish settings.

| Scenario | Evidence / limit |
| --- | --- |
| `character_consistency` | Ten opt-in character stress turns; transcript grades do not prove vocal acting. |
| `two_visit_memory`, `identity_denial` | Actual isolated learning/confirmation; failed prerequisites skip dependent judgments. |
| `media_stop` | 90-second Active fixture, negation, exact configured ASR stop and follow-up. |
| `additional_capabilities` | WebGL context recreation, folder playback, image grounding, interruption. |
| `portrait_studio` | Synthetic visitor, real Realtime/image providers; `--studio-story` selects the story. Picture/reply checks do not prove human name, wake or printing acceptance. |
| `camera_native` | Native fresh snapshots, targeted USB reset, sustained recovery. |
| `camera_delivery` | Same signed helper/LaunchAgent, image processing bypassed; 60 seconds of advancing-source-timestamp receipts, zero resets/restarts. Throttled receipts are not FPS. |
| `camera_availability` | `--camera-case` selects an allowlisted native format experiment; `--camera-check screen\|stable\|cycles` measures native sample cadence or RAM-only decoded snapshots with serialized acquire/release. Metadata-only evidence; no video encoding, identity accuracy or days-long acceptance. Criteria: [camera availability](../../../../docs/testing/camera-availability-qa-2026-10-18.md). |
| `judge_calibration` | Ten public good/bad/adversarial candidates against the existing grader; no Raven generation or physical-delivery acceptance. |
| `memory_intent_calibration` | Six fixed request/biography/quote/negation controls through Main's configured interpreter; assessment only, no memory mutation. |
| `wake_levels`, `wake_levels_asr` | Native level/near-negative controls; optional unhinted ASR. dBFS is not SPL/SNR; failed acoustic ASR control prevents localization. |
| `camera --physical` | Real Jabra/native camera; zero camera children asleep, one awake, zero after sleep/no-restart interval. |
| `wake_diagnostic` | Native playback/capture/detector, no Realtime. |
| `wake_replay` | Same bounded RAM PCM live/replay, gain/bias/clean-source controls; exit success means completed diagnostic, inspect detections. |
| `wake_capture` | Above plus authorized unhinted real transcription and native-format/stimulus comparisons. |
| `wake_control` | Local package-default phrase, near negatives, stock/wider detector and independent conversion. |
| `wake_aec` | Post-gain played background reference; no production AEC change. |
| `wake_aec_alignment`, `wake_aec_alignment_native` | Jabra/Mac far-end playback, 16/32 kHz capture; native variant uses 48 kHz stereo post-conversion reference. Alignment is not wake acceptance. |
| `wake_browser` | Chromium Jabra capture/background, native Mac visitor stimulus → same detector. QA only; release native first, close browser before restoration. |

`--physical` uses Main native Mac-speaker stimulus at its native rate/channel
layout, outside Chromium's echo reference. Browser-injected speech can be cancelled.
All stimuli remain synthetic, not human acceptance. TV-off exemption is isolated.
`--launch-agent` uses a one-shot `KeepAlive:false` job without changing restart
ownership. Permission results are launch-context-specific. Long-lived tmux shells
have produced digital-zero native input; use the authorized LaunchAgent route or
the owner's Terminal for acoustic evidence.

## Other Phase 4 modes

[Runner](../../../../scripts/run-phase4-qa.mjs) owns the full accepted flag list.
Select the relevant mode rather than copying all cases into a new harness:

| Mode | Boundary |
| --- | --- |
| `--lifecycle-live`, `--spells-live` | Synthetic text, actual provider/cue sequencing; no microphone/ASR acceptance. Spell cue/effect ordering follows current DECISIONS. |
| `--live` | Configured provider with silent virtual mic; no physical conversation claim. |
| `--profiles` | Real isolated authoring/Save/Publish/Dormant activation; no provider, Active-switch denial remains separate. |
| `--cubism` | Motions/expressions/actual MOC parameters and replacement; hidden Mirror, no portrait. External Raven requires `MIRROR_CUBISM_QA_MODEL`; built-in Ren is insufficient. |
| `--editor` | Console import/edit/validation/Test/Publish; hidden Mirror. |
| `--console` | Editor plus finite-video playback and portrait Avatar return. |
| `--studio-journey` | Isolated Studio editor/visit flow and wake-phrase switching; live provider dialogue and human speech remain separate. |
| `--video-fades` | UI Save/Publish, computed opacity/embedded gain; no physical sound claim. |
| Default | Cubism and still/finite/loop/embedded-audio/replacement/failure scene cases. |

## Evidence rules that affect interpretation

- [Probe](../../../../src/main/raven-conversation-probe.ts) normally replaces
  `getUserMedia` with a virtual stream. Synthetic PCM/WebRTC proves provider
  ASR/VAD/tools/IPC/playback integration, not native capture or human quality.
  Fixture spells use mock effects and do not prove published presets exist.
- Physical QA needs actual permission/status, route, fresh blocks, energy and
  delivery evidence. An open stream, playback callback, `signal`/`silent` label
  or assumed permission does not prove heard speech. See the
  [physical wake reference](../../mm-wake-word/references/handoff-platform.md).
- `output_audio_buffer.started` counts provider output, not processed speaker
  audibility. Distinguish generation, response ownership, output tail and physical
  sound. Missing server echo alone does not prove a requested hint was ignored.
- Clear probe response/tool counters on local peer `close()` and new connection;
  local close does not emit `connectionstatechange`. Acoustic retries require
  Dormant; greeting failure never authorizes a second mic during Active.
- Preambles are attributed within the same provider response/event order. An
  allowed search bridge is not a later playback preamble; missing attribution is
  unknown. Deduplicate transcript aliases only by shared response/item/index.
- v8 accepts exact per-turn criteria/scores and derives pass flags. Missing,
  duplicate, foreign or malformed evidence fails; diagnostics enter rates only
  after full validation. Character is separate; cues/silent turns are exempt.
- `raven-quality-rates.mjs RUN_DIRECTORY...` groups matching provenance and case
  sets, excludes duplicate/unfinished/unversioned runs, treats unscored history
  as unknown. Never pool judge versions; correlated-turn intervals are descriptive.
- Tool-call names alone do not prove application ordering; include local discovery
  inside the online guard. `recognition.exact` includes command folds;
  `literalExact`/title-presence own literal media evidence.
- Camera ASR `judged` booleans are diagnostic; actual tool/image/grounding checks
  own visual acceptance. Unavailable ASR judgment must not gate those checks.
- Muted success never upgrades audible-media acceptance. Fixture labels such as
  `windowsDecode` do not prove a different platform. Retain failed attempts.
