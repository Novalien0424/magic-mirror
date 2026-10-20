# Spell field failure and wake quality design audit

## Scope and current result

Windows audit of the operator's latest failed spell test and earlier wake tuning work. No runtime code, published configuration, model, or detector parameters changed in this audit. The development app was left running. Previous UI/native-load passes do not establish spoken command accuracy.

## Spell: observed failure boundary

Metadata-only telemetry on 2026-09-15 records four final transcripts followed by `not_exact_match`:

| Local time (Asia/Taipei) | Transcript available (UTC) | Match rejected (UTC) |
| --- | --- | --- |
| 16:41:44 | 08:41:44.427 | 08:41:44.431 |
| 16:41:58 | 08:41:58.720 | 08:41:58.724 |
| 16:42:10 | 08:42:10.979 | 08:42:10.982 |
| 16:42:20 | 08:42:20.006 | 08:42:20.009 |

Published configuration version 13 has Ren selected and an enabled spell with the configured phrase `天氣熱，能不能下雨呢?`, targeting an enabled scene. These are public configuration values, not recovered speech. Manual stop at 08:42:22 cleared RAM transcripts and returned microphone ownership to wake listening. The exact transcript differences in these attempts cannot now be determined.

`src/renderer/mirror/scene-transcript-controller.ts` matches final transcription through `src/main/scenes/spell-trigger.ts`; rejection returns before scene execution. Normalization handles NFKC, punctuation and spaces between Han characters, but still requires whole-transcript equality. There is no general Traditional/Simplified conversion or tolerance for extra words. The Realtime session exposes a sleep tool, not a cast-spell tool. Model understanding or a spoken promise therefore cannot execute a scene.

The previous whitespace repair addressed a reproducible text case, not the full acoustic path. The confirmed failure boundary is exact matching; the specific recognition/segmentation difference remains unknown. Adding more prompt instructions cannot override this application comparison.

## Research and proposed command contract

- [OpenAI Realtime reference](https://platform.openai.com/docs/api-reference/realtime?lang=javascript): input transcription is separate from the audio-native model and should not be assumed to equal what that model heard.
- [OpenAI transcription guidance](https://developers.openai.com/api/docs/guides/transcription): literal keyword hints guide recognition; they do not require exact output. Current `gpt-live-transcribe` options are also documented in the [Agents voice guide](https://openai.github.io/openai-agents-js/guides/voice-agents/build/).
- [Realtime function calling](https://developers.openai.com/api/docs/guides/realtime-conversations#function-calling): a conversational model can propose a structured function call; application code executes it and returns the actual result. This would be a different control contract from this repository's exact-transcript rule.
- [Home Assistant Speech-to-Phrase](https://www.home-assistant.io/blog/2025/02/13/voice-chapter-9-speech-to-phrase/): constrained command vocabularies are another established approach. This is architectural evidence, not a claim that that implementation supports our Mandarin use case.

Recommendation: one complete command, for example `施放咒語，下雨`, using a fixed prefix plus a short spell name. Preserve full-command matching, published scene validation and once-per-turn execution. The existing phrase field can already express this convention. Merely prefixing the same long conversational sentence leaves the original recognition fragility.

An enforced common prefix, explicit reviewed aliases and a clear command-success/unrecognized cue would require a bounded implementation. A two-turn alternative (`我要施法`, cue, then spell name) needs a one-shot arm state with timeout/cancel and is more complex. Neither proposal has been implemented or acoustically validated by this audit. Do not silently introduce substring, fuzzy or model-authorized triggers under the existing invariant. Ordinary conversation should continue without added confirmation gates.

Next diagnostic evidence should compare a fresh final transcript and normalized command in RAM during an operator test, then discard both. Persist only rejection categories/counts. Do not save real speech or transcripts in logs, screenshots or reports.

## Wake: tuning exists, per-phrase quality does not

The active `sherpa-magic-mirror-win-v2` package still uses its verified original `魔鏡阿魔鏡` keyword artifact, including neutral `a`, score 1, threshold 0.45 and one trailing blank. Customization did not remove these default-word settings. Its manifest nevertheless says `corpusResultId: not-evaluated`.

Earlier work covered engine selection, pronunciation encoding, package integrity, capture and handoff. The [archived progress](../archive/progress-through-2026-09-06.md) reports 7/9 synthetic Mandarin detections; that is not human accuracy evidence. Multi-speaker, 19/20 live wake and ambient acceptance were deferred. The [first-boot investigation](wake-first-boot-2026-09-06.md) also retains an unresolved capture/acoustic reproduction problem.

New avatar phrases currently receive dictionary-derived tokens and the same package parameters. There is no phrase-specific calibration record or measured acceptance state. The [official sherpa documentation](https://k2-fsa.github.io/sherpa/onnx/kws/index.html) supports adding phrases without neural retraining and per-keyword boost/threshold tuning; this capability does not guarantee reliability. Lowering threshold or raising boost trades fewer misses against more false activations.

The existing [corpus plan](../../resources/wake-models/README.md) requires 100 positive utterances across speakers/distances/noise, hard negatives and two hours of approved background audio, plus a separate live ambient check. No local `wake-corpus/` dataset was present during this audit.

Evaluator gaps relevant to that work:

- `evaluate-cli.ts` evaluates original package phrases, not the newly derived avatar keyword files.
- `corpus-evaluator.ts` stops at the first detection per sample; long background clips can therefore undercount repeated false activations.
- Reported detection time is relative to clip start, not annotated keyword end. A zero-positive corpus must not be accepted as a meaningful zero false-reject rate.

Recommended next design: each distinct wake phrase owns a versioned pronunciation/tuning/measurement profile; avatars using the same phrase can share it. Show encoded/untested versus measured status. Check actual microphone delivery first, tune on representative approved audio, then validate on separate held-out samples with false-reject rate, false activations/hour and keyword-end latency. Extend the evaluator for derived phrases and repeated detections before using its output for acceptance. Consider neural fine-tuning only if measured pronunciation/parameter tuning cannot meet the chosen target. No automatic recording or upload of normal conversations is authorized by this audit.

## Verification and remaining work

Evidence is current metadata/config/code inspection plus primary-source research. Documentation-only changes need no Electron restart or test suite. Actual spell speech reliability, each custom wake phrase's accuracy and first-boot behavior remain unresolved. No phase promotion or runtime repair is claimed.
