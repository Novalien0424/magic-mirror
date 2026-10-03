# Short spell commands and activatable wake tuning

## Delivered

Windows canonical checkout, preserving all prior edits. Ren's enabled rain spell is now published as `施放咒語，下雨` in operator configuration version 14. The update used the production ConfigService, preserved all unrelated active/draft values, retained version 13 as previous, and verified the selected avatar's session transcription hint. Temporary application and native-check scripts were removed.

### Spell control

- `spell-trigger.ts` still compares the entire normalized final transcript. One explicit prefix equivalence accepts `施放咒语`; no semantic, substring or general script-conversion fallback was added. Normalized collisions remain rejected.
- `SceneComposer.tsx` and field help explain a fixed prefix plus short name in one utterance. Existing configured complete phrases remain supported; no bulk conversion of other avatars occurred.
- `avatar-prompt.ts` tells the character to quote configured commands when explaining casting and avoid an extra confirmation step. The application still owns scene execution and reported success.
- `scene-transcript-controller.ts` distinguishes unknown prefixed commands and records accepted/rejected dispatch as metadata. Ordinary non-command conversation is not interrupted. No speech/transcript is persisted.

### Wake tuning flow

Avatars → Persona → Wake sensitivity tuning → enable **Use per-avatar tuning** → enter optional overrides → **Save all changes** → **Check saved changes** → **Publish all changes** → test with the listener in Dormant.

`AvatarProfile.wakeTuning` stores `{ phrase, enabled, threshold?, score?, numTrailingBlanks? }`. Main validates exact phrase binding and bounds. Empty fields inherit package defaults; disabling overrides restores those defaults. Editing the phrase disables and rebinds the old values, requiring explicit re-enabling for the new phrase.

The active avatar's tuning reaches the runtime signature and worker package. Updates retain release → update → acquire ownership. Original `魔鏡阿魔鏡` pronunciation is preserved, including neutral `a`; derived keyword files remove inline score/threshold directives so Console overrides actually take effect. Package/model artifacts are unchanged. Ren currently retains the original package defaults (0.45 / 1 / 1); arbitrary sensitivity changes were not applied without acoustic evidence.

These are **detector parameter controls**, not neural fine-tuning, automatic recording, or an accuracy certification. Each avatar stores its own phrase-bound settings; no shared calibration registry or trained neural model was introduced.

### Evaluation repairs

`corpus-evaluator.ts` now counts repeated false activations across a negative clip, returns null for rates with no corresponding exposure, and measures latency only on positives with explicit `keywordEndMs` annotations. Aggregate schema version is 2. `evaluate-cli.ts` supports the same custom phrase/threshold/score/trailing-blanks settings through the production keyword loader and worker configuration builder. The [runbook](../../resources/wake-models/README.md#per-avatar-tuning-flow) explains the flow, CLI options, held-out validation and interpretation.

Voice/wake skills were updated compactly to distinguish model understanding, exact command dispatch, activated parameters and measured spoken quality.

## Fresh verification

| Check | Result |
| --- | --- |
| Named Vitest run: `tests/main/wake`, avatar commands/profiles/prompt, Console config models, boot runtime, config service, scene transcript controller, spell guard, Realtime session adapter/start bridge | Exit 0; **249 tests / 22 files** |
| `npm run typecheck:web` | Exit 0 |
| Scoped TypeScript Node program, excluding existing `tests/unit/qa-artifacts.test.ts` declaration issue | Exit 0; **189 files** |
| `npm run typecheck:node` | Exit 1; only pre-existing TS7016 for `scripts/qa-artifacts.mjs` |
| `npm run build` | Exit 0; stamped production build |
| Native evaluator pipeline: original phrase and `Hello Ren`, overrides 0.37 / 1.7 / 2 | Exit 0; synthetic silence only, null unmeasured speech metrics; no accuracy claim |
| `npm run test:phase4:qa:profiles` | Exit 0; **20 checks / 24 screenshots**, no timeout |
| Final diff whitespace check | Exit 0 |

Electron evidence: [run directory](../../.artifacts/phase4-qa/2026-09-15T09-17-55-813Z/), [typed evidence](../../.artifacts/phase4-qa/2026-09-15T09-17-55-813Z/evidence.json), [build provenance](../../.artifacts/phase4-qa/2026-09-15T09-17-55-813Z/build.json).

Specific executed checks:

- Real Persona controls authored tuning 0.37 / 1.7 / 2, saved/reloaded/published/activated it, and verified runtime-loaded values plus native worker release/ready/listening events.
- A synthetic final transcript `施放咒语， 下雨！` traversed the real renderer → IPC → Main → mock lighting scene and completed. Negation, unknown spell feedback and duplicate-turn rejection passed. This is a text/control integration test, not a human speech or physical rain/video test; the general profile runner's scene counter remains zero because this check is reported under `profile_short_spell_completed_once`.
- Inspected both 1440- and 1024-wide tuning screenshots: controls, help, values and publication controls readable. Inspected spell pages; the 1440 view exposes the configured phrase, while the narrower page requires scrolling. No horizontal overflow.

## Runtime and operator retest

Canonical `npm run dev` session **95588** replaces stopped session 29758. Main, Mirror and Console renderers are ready at `http://localhost:5173/`. Metadata at **09:19:56 UTC / 17:19:56 Asia/Taipei** confirms `wake_worker_ready`, `wake_worker_listening` and `cubism_avatar_ready`. Operator active configuration remains version 14, Ren, wake `魔鏡阿魔鏡`, spell `施放咒語，下雨`. `out/` is now a development build; rebuild before another stamped QA run.

Next spoken test: wake Ren, then say **施放咒語，下雨** as one utterance. Actual provider transcription, room acoustics, physical sound and human wake accuracy remain operator evidence. If a spell fails, inspect the fresh RAM transcript alongside its exact-match reason before stopping; do not persist the transcript. Representative approved wake recordings are still needed to measure/tune accuracy. Earlier first-boot investigation and deferred phase acceptance remain unresolved; no phase promotion.
