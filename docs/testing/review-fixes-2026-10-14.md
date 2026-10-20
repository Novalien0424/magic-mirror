# Review, fixes and voice-stack research — 2026-10-14

Claude Code (Opus) clock-in after the Codex [focused research](focused-research-2026-10-13.md).
Four Opus reviewers covered camera/Main code, realtime/memory/prompt code, QA
methodology and voice-stack research; the root agent re-verified the cited code
and archived metadata before relying on them. Six defects were fixed with
failing-first unit tests, then live Raven QA ran (see below). No full `npm test`;
production model, voice, persona, credentials and TV policy are unchanged. All
edits are uncommitted on `field/macmini-deploy`, on top of earlier uncommitted work.

## Adversarial review of the 10-13 conclusions

- **Wake is localized, not unknown.** In all three archived runs the Jabra cancels
  its own speech bed to about −84 dBFS but also captures the near-end wake phrase
  about 6 dB lower (−37 vs −31 dBFS). Pooled: bed at 0.07 gain 0/15, bed 20 dB
  quieter 8/9, negatives clear. This fits speakerphone near-end suppression during
  far-end playback; more software AEC would not restore it. Evidence:
  `wake-levels`, `wake-louder`, `wake-asr` under
  [.artifacts/focused-research-2026-10-13](../../.artifacts/focused-research-2026-10-13/).
  The bed levels are not tied to the production Dormant level and use the same
  TTS voice, so the cheapest decisive check is owner-voiced.
- **Camera.** Invalid UVC payloads are counted below the app, so the
  processing-bypass control could only re-confirm that. Untried simple
  discriminators: five minutes in Photo Booth, and a known-good UVC webcam on the
  same port with the existing `camera_delivery` control. USB packet capture on
  Apple silicon probably needs a hardware analyzer (inference).
- **Dialogue measurement.** Mini 8/10 vs full 10/10 is one run per arm and two
  discordant turns (exact McNemar p = 0.5). The judge is the same model family,
  scores are saturated, calibration is ten easy single-scenario cases with
  script-exact ASR, and `scripts/raven-quality-rates.mjs` counts the judge's
  `tool_preamble` label instead of the measured `toolTiming`. All visitors are one
  clean synthetic voice. The repeat runner supports 20 rounds but ran once.
- **Memory QA.** The learning gate couples queue-settled with keyword checks
  inside 45 s and, on failure, skips every recall turn, so recall was unmeasured
  in two of three runs. The fixture waits before the explicit save, which hid
  fix 3 below.
- **Process.** Twenty-two testing ledgers from 10-10 to 10-13; caveats replaced
  decisions while cheap decisive checks stayed unexecuted.

## Fixes

| # | Defect | Change | Focused tests |
| --- | --- | --- | --- |
| 1 | Visitor barge-in over an uncancelled cue (greeting) left it `sent` forever; later spells, scene dialogue and command-reply resume never played. | `output_audio_buffer.cleared` finishes a matching uncancelled cue as not completed (`realtime-session-adapter.ts`). | adapter |
| 2 | A recall during a pending identity question returned `memory_confirmation_pending` with a model reply, cancelling the question (`memory_dialogue_failed` → `memory_question_rejected`); a repeated identify re-minted the token. | Pending is a background tool result (`realtime-tool-bindings.ts`); identify of the same pending name keeps its question (`memory/session.ts`). | tools, memory session |
| 3 | An authorized explicit save invalidated every pending automatic observation; its epoch bump would also stale them. | `remember` excludes only its own turn and `MemoryLearning.carry` moves the queued batch across its single epoch increment. Corrections, forget, policy and temporary still invalidate. Commits still re-check topic revisions; any concurrent mutation leaves the batch stale. | learning, relationship |
| 4 | Production `compact` rendering silently dropped authored rules (sleep "a request to stay is not dismissal"; play "stay silent on accepted playback"). | Compact now only removes duplicate wording (`realtime-tools.ts`). **The production prompt changed.** | avatar prompt |
| 5 | A Han alias merely contained in the visitor sentence (artist) auto-played the wrong song and stopped the default YouTube fallback. | New `media_discovery_weak` for an alias-only weak top match: `find_media` returns `next: ask`; default-source `search_youtube` continues online. A title contained in the sentence still matches. | media discovery, adapter |
| 6 | A synchronous helper `spawn` throw (ENOEXEC/ENOMEM) escaped the restart timer and could exit Main; a failed first launch leaked the watchdog. | `spawn` is guarded; failure reports `camera_worker_unavailable` and uses the shared bounded `relaunchLater` backoff; helper `error` uses `on`. | camera tracker |

Checks: `npm run typecheck:node` and `typecheck:web` exit 0; 22 focused files,
**500 passed**, including adapter, tools, memory session/dialogue/learning/IPC/
store, relationship, prompt, prompt inspection, probe/rates, media discovery,
merged media, audio ownership, runtime owner, camera and lifecycle suites.
`npm run build` exit 0 at handoff (stamped `out/`). Not run: full suite,
Electron, provider or physical QA.

## Open review findings (not fixed)

- Regex speech classification sets a sticky local-only media restriction
  (`src/shared/media-source-policy.ts`), contrary to the no-regex policy.
  Resolved by the online search phrase ruling (below); the module is removed.
- Session prompt invites preambles: "quick tools" is undefined and a line before
  `search_youtube` is explicitly allowed (`realtime.v1.json`).
- Button worker re-runs forever on a malformed queue file (`scripts/raven-button.mjs`).
- Camera watchdog may act on stale timestamps after a Main stall; a wedged helper
  ignores stdin EOF and can outlive Main; Dormant Console camera status is stale;
  an Arducam reset can cut a fallback Arducam microphone; a capture during helper
  retirement waits its full timeout.
- Preamble diagnostic counts per turn, not per response (`modelAudioThisTurn`).
- Simplifications: one camera state enum with Main-owned deadlines; one
  application-owned media play path; QA prompt variants out of the shared bundle.

## Research verdicts

Sources checked 2026-10-14; estimates are labelled.

- **Mac mini (M6, 12 cores, 32 GB).** Suitable for local STT/TTS by memory
  (estimated 11–15 GB with Electron). TTS GPU time is the limit: published M5 Pro
  Qwen3-TTS-1.7B RTF ≈ 0.8; prefer 0.6B, CosyVoice3 or Kokoro first. No M6
  inference measured. Apple `SpeechTranscriber` supports zh-TW; only English is installed.
- **Prompt adherence.** A cascaded text model likely follows text rules better
  ([Audio MultiChallenge](https://arxiv.org/abs/2512.14865): 51% cascaded vs 24%
  older speech-to-speech, English only), but it cannot fix camera, wake or the
  memory application defects, and loses tone, turn-taking and voice. Big Bench
  Audio: 2.1-mini 63% vs 2.1 87% at minimal effort
  ([Artificial Analysis](https://artificialanalysis.ai/speech-to-speech)).
- **GPT-6.1 Sol for live speech** is too slow: about 3.5 s to first token at low
  effort (third-party); estimated 4.5–5.5 s to first audio. Luna without
  reasoning estimates 2.0–2.8 s.
- **GPT-Live-1** (`gpt-live-1`, GA 2026-09-10): `/v1/live/sessions` only, API-key
  authentication, no tools at the voice layer (Responses or client delegation),
  no image input, no completed-turn transcript event (invariant 7 matching would
  need redesign), paraphrases supplied text, `cedar` available, Chinese undocumented.
  [Model](https://developers.openai.com/api/docs/models/gpt-live-1),
  [delegation](https://developers.openai.com/api/docs/guides/live-delegation).
- **ChatGPT-plan OAuth** ([Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)):
  only `GET /v1/models` and `POST /v1/responses`; audio/video input and
  transcription unsupported. Neither Realtime nor GPT-Live can use it. The only
  subscription-only design is local wake/STT/TTS plus Main-owned `/v1/responses`,
  which needs an owner ruling against invariant 12. Plus shares one five-hour
  allowance across apps; Pro has app limits. The terms page returned 403; guest
  kiosk use of a personal plan is unverified.

### Prices ([pricing](https://developers.openai.com/api/docs/pricing))

| Model | Audio in / cached / out per 1M | Text in / cached / out per 1M | Other |
| --- | --- | --- | --- |
| `gpt-realtime-2.1-mini` | $10 / $0.30 / $20 | $0.60 / $0.06 / $2.40 | image $0.80 |
| `gpt-realtime-2.1` | $32 / $0.40 / $64 | $4 / $0.40 / $24 | image $5 |
| `gpt-live-1` | — | — | $0.05/min of session, per second; backend extra; no image |
| `gpt-live-transcribe` | — | — | $0.017/min |
| `gpt-6-luna` / `gpt-6.1-sol` | — | $0.10/$0.01/$0.50 · $2/$0.10/$10 | — |

Estimate for one 10-minute active conversation (20 turns, 12 s visitor + 12 s
Raven audio per turn, about 3k instruction/tool tokens; audio 600 input / 1,200
output tokens per minute per the cost guide): mini ≈ $0.26 (≈ $0.95 if caching
fails), full ≈ $0.66 (≈ $2.8), Live + Luna ≈ $0.51, Live + Sol ≈ $0.63. Live
also bills connected silence, up to $0.25 per five-minute idle timeout.

## Live QA after the fixes (15:53–17:00 Taipei)

Stamped build `0408a519…/82be426f…`, `--launch-agent`, virtual microphone and
camera fixture, one Electron owner at a time. Run index:
[chain-index.txt](../../.artifacts/qa-2026-10-14/chain-index.txt); grouped rates:
[character-rates.json](../../.artifacts/qa-2026-10-14/character-rates.json).
Exit 2 below means the transcript judge failed a turn; application checks are
listed separately. Transcripts were not retained.

| Run | Application checks | Judge |
| --- | --- | --- |
| `two_visit_memory` (mini) | 17/17 passed: question delivery, confirm, learning gate, explicit save, clean second visit, three recalls | 7/10: correction answer incomplete, measured preamble before `remember`, preference recall invented |
| `additional_capabilities` (mini) | exit 0; WebGL recovery, three folders, camera question, barge-in | — |
| `local_media` (mini) | all passed; alias, ambiguity and piano choice routed correctly | 5/6: measured preamble on "Play Rain." |

Recall was measured for the first time; the isolated synthetic store held the
expected two episodes and one explicit fact, so the preference miss is recall or
answer quality (n=1), not save loss.

Character consistency, interleaved, same prompt/tool/judge hashes:

| Variant | Runs 1–5 | Turns passed | Measured preamble (`unavailable_local`) | Correction turn failed | Memory tool for a guest |
| --- | --- | --- | --- | --- | --- |
| mini | 6, 7, 8, 8, 8 | **37/50 (74%)** | 5/5 runs | 4/5 | 2/5 |
| full | 8, 10, 10, 10, 10 | **48/50 (96%)** | 0/5 | 0/5 | 0/5 |

Exact Fisher tests: turns p = 0.004; preamble p = 0.008; correction p = 0.048.
Turns within a run are correlated, the judge is the same model family and every
visitor is one synthetic voice, so treat p-values as descriptive. Judge-coded
`asr_changed_meaning` appeared on the correction turn in 8/10 runs for both arms;
full still answered correctly. Full's only failures were run 1 language/naturalness.
`gpt-live-1` was not run: the app and runner have no Live transport.

## Second fix round (owner keeps mini as default)

| Area | Change | Tests |
| --- | --- | --- |
| Preamble | Tried and **reverted** (see trial below): defining every tool except `search_youtube` as quick in the session prompt, then "call it before saying anything" in the `find_media`/`memory` descriptions. | prompt suites |
| Guest memory | Memory rules: identify when the visitor wants to be remembered; recall only after confirmation; answer stated facts from the conversation. `memory_identity_required` returns catalog `memoryLocked` as `next`. | tools |
| Correction | Conversation rule: a correction replaces the earlier detail; restate item, quantity, person, time and status plainly before imagery. | prompt suites |
| Button | A malformed or partial queue file is consumed and logged (`request_invalid`) instead of re-waking the worker forever. | button |
| Diagnostics | `tool_*_preamble_*` uses the calling response's audio; `raven-quality-rates.mjs` v5 adds `measured_tool_preamble` from `toolTimingEvidence`. | adapter, rates |
| Camera (Opus worker) | Late watchdog tick defers once; helper exits on stdin EOF; Dormant publishes `ready`/`camera_avatar_inactive`; USB reset deferred while the conversation microphone is the camera's own; capture during helper retirement fails fast. | camera (69) |

Not changed: the regex local-only source policy (`media-source-policy.ts`). A
model-declared scope would make mini, the weaker router, own a guarantee the
regex enforces deterministically; this needs an owner ruling.

Checks: both typechecks exit 0; full `npm test` exit 0 (187 files, 2,162 passed,
1 skipped); `npm run build` exit 0; the Swift helper compiled.

Post-fix mini QA ([index](../../.artifacts/qa-2026-10-14/after-fixes/chain-index.txt)):
character 8, 9, 7, 6, 8 = **38/50** (was 37/50); memory tool for a guest 0/5
(was 2/5); correction failed 3/5 (was 4/5); measured preamble before the local
search still 5/5. `local_scope` application checks passed (judge 2/3, one
preamble); `local_media` application checks passed (judge 2/6, two measured
preambles); `identity_denial` application checks passed (judge failed narration
and an invented detail); `two_visit_memory` stopped at the first identity (name
mismatch, spelling repair failed; it passed earlier today), cause unknown.

Camera (`camera_native`, real Arducam): the same pattern as 10-13 — ready at
1.3 s, stale at 3.0 s, reset restores frames in 2.8 s, stale again within 2 s,
budget exhausted at 20.6 s. With the 10-13 controls (a minimal standalone
AVFoundation program received 0 frames in 60 s; macOS's UVC driver dropped
~99% of packets as invalid payloads), the stall is below Magic Mirror. Software
recovery works but cannot keep this camera streaming. The Arducam is alone on
its USB bus at 480 Mb/s with 500 mA allocated; the Jabra is on another bus.

Silence trial (session wording plus tool descriptions,
[index](../../.artifacts/qa-2026-10-14/silent-tools/chain-index.txt)): memory
application checks 17/18 (identity passed, so the earlier stop was not
reproduced) but measured preambles rose to 5/6 memory calls (morning 1/6; judge
4/10); character 8, 7, 9 = 24/30 with preambles before the local search in 2/3;
`local_media` preambles 2/3. No benefit and a memory regression, so both wordings
were reverted; the production preamble text is the original. Mini's preamble
before quick tools is not fixable by prompt wording in these trials.

First-identity mismatches (4 of 7 memory runs after 18:59, none in 12 earlier
runs) were first blamed on the memory rules; they persisted after reverting every
prompt change. In each failure the visitor's introduction ASR was not exact
(`recognition.exact=false`); every pass was exact. Cause: provider
transcription variance on the synthetic name, not these edits; the memory and
correction wording were restored. Pooled mini character turns with them:
77/100 (before 37/50); guest memory-tool routes 0/10 runs (before 2/5).
Correction failures 7/12 (before 4/5). Small samples, judge caveats as above.

## Preamble ruling re-measure (20:36–21:00 Taipei)

The last pre-ruling run ([final-shipped](../../.artifacts/qa-2026-10-14/final-shipped/chain-index.txt))
scored character 8/10. Mini under the owner ruling, rebuilt
([index](../../.artifacts/qa-2026-10-14/preamble-ruling/chain-index.txt),
[rates](../../.artifacts/qa-2026-10-14/preamble-ruling/character-rates.json)):
character 9, 9, 10 = **28/30**, the first full mini pass; judged tool preamble,
wrong tool, wrong language and character drift 0/30; invented fact 1/30; one
correction miss and one local-scope miss in three runs. `local_media` 5/6 (one
mechanism narration, no measured preamble). `two_visit_memory` stopped at the
first identity: the introduction ASR was again not exact and the confirmation
after the spelling repair was judged unclear. Same provider-ASR pattern; small
samples.

## Online search phrase (owner ruling; live QA 00:04–00:18 Taipei 10-15)

[DECISIONS](../../DECISIONS.md) 2026-10-14: media stays local unless the final
transcript opens with the avatar's hidden phrase (default 「在雲上找找」, Console
Persona field). Delivered: `opensWithSpokenPhrase` (shared sound-alike key),
per-avatar `cloudSearchPhrase` (config schema, session settings, Console field,
transcription hint, prompt inspector), adapter gate (`search_youtube` without
the phrase is a local lookup; `find_media` misses return `mediaNoMatch` or, on
an allowed turn, `mediaOnlineSearch`; returned URLs stay playable), catalog rule
wording, conversation fixtures (`default_fallback`, `youtube_modes`) and the
text intent probe. The keyword source policy and its test are removed.

Live mini QA ([index](../../.artifacts/qa-2026-10-14/cloud-phrase/chain-index.txt)):
the gate held in every turn — no online search in 7 phrase-less media requests
(including "On YouTube, play …"), and `media_online_unlocked` plus an online
search in 4/4 phrase requests. `local_media` 6/6 (first full pass today);
`local_scope` application checks passed, judge 2/3 (wrong language/ASR).
Remaining mini faults are not source decisions: it skipped the local lookup on
all 4 phrase turns (allowed by the gate; owner accepted it 10-15), described the search in 2/4, searched
without playing the requested loop once, and called `memory` temporary on a
phrase-less YouTube request once. One once-video never reported completion within
120 s (`raven_qa_media_return`, also seen 10-10). For comparison, 10-10 builds
had 5 application route failures in 15 default-fallback online turns (wrong
order or no online search).

## Next

1. Owner: a different cable/port or powered hub for the Arducam, Photo Booth
   five minutes, then a second UVC webcam (purchase needs approval).
2. Owner wake checks: phrase 10× at production Dormant loop level and 10× about
   10 dB lower.
3. Owner ruling (DECISIONS 2026-10-14): one short in-character line is allowed
   before local search and non-identify memory calls; identify and other tools
   stay silent. Prompt, probe quick-tool set and judge criteria updated;
   mini re-measured (above).

Owner decisions pending: model switch (versioned config, invariant 11; full ≈ 2.5×
cost) and any OAuth/subscription path (invariant 12).
