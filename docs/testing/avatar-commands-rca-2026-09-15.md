# Per-avatar spoken commands and Ren spell RCA — Windows, 2026-09-15

## Delivery state

Applied to canonical `C:/Project/magic-mirror` after the operator confirmed saved Console edits. Existing wake/audio fixes and operator configuration were preserved. The implementation was prepared in `.worktrees/avatar-commands-20260915` (detached from `7072a1c`); canonical now also includes the final worker-reconfiguration QA assertion. No fresh live-spoken success is claimed.

Canonical development session `29758` is running at `http://localhost:5173/`, replacing `11420`. Main and both renderers reported ready. `out/` is now a development build; rebuild before subsequent stamped QA.

## Canonical Windows UI QA

`npm run build` and `npm run test:phase4:qa:profiles` completed with exit 0. Final run: [evidence](../../.artifacts/phase4-qa/2026-09-15T08-37-29-639Z/evidence.json), [build provenance](../../.artifacts/phase4-qa/2026-09-15T08-37-29-639Z/build.json). All 18 checks passed; 21 screenshots captured. Tests cover real Persona authoring, independent commands, save/reload, publish, avatar activation, matching effective prompt, and the live worker's released/ready/listening events read from the RAM Console event stream. Native worker reconfiguration was observed without a provider conversation. Both Persona widths were visually inspected: labels/values readable, narrow layout uses scrolling. The earlier 17-check run and its publication-scope screenshot are retained at `.artifacts/phase4-qa/2026-09-15T08-32-58-596Z/`; it preceded the additional worker assertion.

Both runs exited normally with no timeout. Chromium emitted a GPU-state message during shutdown after the successful checks. The portrait Mirror was intentionally hidden in this Console mode; physical sound, actual spoken wake accuracy and live custom-sleep interpretation remain operator checks.

## RCA and evidence limits

1. Sleep used a hardcoded `恭送渡鴨大人` tool description and transcription hint. Editing the farewell changed the response, not the trigger. AvatarProfile had no sleep/wake fields.
2. Wake was a root configuration tied to one verified keyword artifact. Switching the avatar did not update the running wake supervisor. Changing prompt text alone could not change the local detector.
3. Ren's published, enabled spell is `天氣熱，能不能下雨呢?`, with an enabled target scene. The supplied variant `天氣熱 能不能下雨呢?` reproduced a failed exact match: punctuation was removed but internal Chinese spaces remained. Normalization now removes whitespace **between Han characters**; English word boundaries and extra-word rejection remain intact.
4. Metadata at 07:51:48, 07:52:04, 07:52:28, 07:53:06 and 07:53:37 UTC showed `transcript_available` then `not_exact_match`. Historical transcripts are RAM-only and unavailable after the session. This proves the rejected-match path and the supplied text reproduction, not the exact wording of every failed spoken attempt. Traditional/Simplified substitutions and additional words still differ unless explicitly configured as separate spells.

## Implementation

- Persona gains independent Wake phrase and Sleep phrase fields, up to 96 characters. Different avatars may share a wake phrase. Existing profiles retain prior commands until edited; new avatars start with `魔鏡阿魔鏡` / `休息吧`.
- Advanced config shows the active-avatar wake projection read-only when an avatar catalog exists, with help directing edits to Persona. Lexicon licenses/provenance are included in the packaging file list.
- Main projects the selected avatar's wake phrase into the compatibility root config. Public frozen session settings carry wake/sleep and enabled spell phrases through preload parsing to Realtime. The model gets a selected-avatar sleep tool and transcription hints; scene execution remains normalized full final transcript equality, once per turn.
- `buildAvatarPrompt` and `buildSleepToolDescription` drive both effective preview and actual instructions. Short bullets distinguish wake, sleep trigger, exact farewell and application-owned scene actions. Quotes, negation and incidental mentions do not authorize sleep. The sleep playback completion contract is unchanged.
- Original package/platform/artifact hashes are verified before deriving custom keyword files. A bundled, licensed Mandarin/English pronunciation dictionary converts supported phrases to the installed vocabulary. The original phrase keeps its verified artifact; model files, IDs, thresholds and dependencies are unchanged. Unsupported words/tokens produce an explicit metadata reason.
- Published phrase changes release the wake microphone, update the worker, and reacquire only in Dormant/OfflineLoop. Unchanged wake configuration is skipped; a failed update does not invalidate Realtime settings. Only changed phrases/package references are validated during configuration checks, so an unchanged unavailable wake package does not block unrelated edits.

Primary files: `src/shared/avatar-{commands,profiles,prompt}.ts`, `src/main/avatar/avatar-config.ts`, `src/main/wake/{custom-keywords,model-package}.ts`, `src/main/{index,boot,console-config}.ts`, `src/main/scenes/spell-trigger.ts`, `src/renderer/console/AvatarCharacterEditor.tsx`, and `src/renderer/realtime/realtime-session-adapter.ts`.

## Research and skill correction

The [official sherpa documentation](https://k2-fsa.github.io/sherpa/onnx/kws/index.html) supports custom keywords without model retraining; the [upstream encoder](https://github.com/k2-fsa/sherpa-onnx/blob/master/scripts/text2token.py) documents phoneme/partial-pinyin encoding. Native loading below verifies the repository implementation against the installed engine, not just a documentation example. Pronunciation source commits/hashes/licenses are recorded under `src/main/wake/lexicon/`.

The [OpenAI Realtime prompting guide](https://cdn.openai.com/API/docs/realtime-prompting-guide.pdf) recommends precise, non-conflicting instructions and short bullets. Applied this to the existing configured model without changing its ID or adding model-controlled spell execution. Updated `mm-realtime-voice` with a compact six-step prompt/control RCA reference. Replaced stale `mm-wake-word` model examples and Python runtime advice with the actual package/compiler/handoff path. Corrected its Active wake-phrase behavior: the transcript controller can stop a scene; a second listener must not open.

## Fresh checks in the isolated worktree

| Check | Result |
|---|---|
| Focused command, prompt, Realtime, Console config, boot and keyword tests | Exit 0; 110 tests / 9 files |
| `npx vitest run tests/main/wake tests/main/scenes/spell-trigger.test.ts tests/unit/avatar-profiles.test.ts tests/unit/avatar-editor.test.ts tests/unit/avatar-component-contract.test.ts tests/unit/profile-workspace.test.ts tests/unit/config-service.test.ts` | Exit 0; 155 tests / 18 files |
| One-run native sherpa probe included in both runs | Three phrases loaded: `你好小蓮`, `Hello Ren`, `魔鏡阿魔鏡`; one second of synthetic silence returned `listening`. No microphone or provider used. Probe removed afterward. |
| `npm run typecheck:web` | Exit 0 |
| `npm run typecheck:node` | Exit 1 solely for existing TS7016: `tests/unit/qa-artifacts.test.ts` lacks a declaration for `scripts/qa-artifacts.mjs` |
| TypeScript API check using the same Node configuration, excluding only that existing failing test | Exit 0; 187 source/test files; zero errors |
| `npm run build` | Exit 0, complete stamped worktree build |
| Final source diff / `git diff --check` | Reviewed; whitespace check exit 0 |

Counts overlap; do not sum them. Initial test failures were a test fixture envelope (`schemaVersion`) and old literal prompt assertions, corrected to the new behavior. Windows Console QA is now recorded above; real provider interpretation of customized sleep and physical wake/speaker checks remain pending.

## Operator retest

After activation: Avatars → select avatar → Persona → Wake phrase / Sleep phrase. Save all changes → Check saved changes → Publish all changes → Confirm publish. Use on Mirror when choosing another avatar; conversation settings take effect on the next conversation. Wake greeting and Sleep farewell remain separate response text.

Test Ren's `天氣熱 能不能下雨呢?` as one complete turn, then the selected sleep phrase, and wake again with that avatar's wake phrase. Repeat with a second avatar and independent sleep phrase; a shared wake phrase is allowed. Physical speech accuracy is still operator evidence.
