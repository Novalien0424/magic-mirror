# Third audit: prompts, skills and persistence (2026-10-11, consolidated)

Scope, requested by the owner:
- Are Raven's prompt, tools and the agents' skills current and effective for a
  realtime-LLM talking avatar?
- Does Raven use its tools ("skills") correctly?
- Can the app run persistently while a person starts and stops it with a button?

**Snapshot.** HEAD `8cf702a` plus Codex's final second-audit remediation
(uncommitted, ≈107 paths), as Codex left it at 15:31 Taipei. Codex reported
full `npm test` passing then (1,910 passed, 1 skipped). It follows the
[second audit](second-audit-remaining-failures-2026-10-11.md) and the
[remediation ledger](second-audit-remediation-2026-10-11.md) and does not
repeat them. Codex's camera USB-recovery work, started at 16:01 under a new
DECISIONS ruling, is out of scope here.

**Method.**
- **13:30–13:55, read-only audit.** Four Opus investigators: guidance survey,
  prompt and tools, harness skills, reliability.
- **15:55–16:05, consolidation.**
  - An Opus re-check of every code claim against the final tree.
  - Prompt and language probes using the repo's own code.
  - Five lifecycle tests on the deployed LaunchAgent (§8).
- ✓ marks a fact re-verified on the final tree or measured on this Mac.

**Paused.** At 16:02 Codex quit Raven to work on the camera (Computer Use,
Cmd+Q). Claude therefore stopped its Electron tests to avoid two app owners
(invariant 8). Three live tests are still to run (§8, pending).

## Summary

| Area | Status on the final tree | First action |
|---|---|---|
| Language | **Regression still present** (✓ probe): 9 of 11 ordinary Chinese sentences are not detected, and the hint is inserted only on change, so after one English sentence Raven keeps answering in English | Fix before commit (§4) |
| Command-prefix guard (added after the first draft) | **New defect N1** (✓): a memory change can skip the clean-session reset | One-line move before commit (§5) |
| Raven's tools | **Three wiring defects remain** (✓): `stop_media` cannot run during playback; the prompt says the media library is empty; results carry `speech` fields that invite narration | §3 items 1–3 |
| Raven's prompt | **Over budget and growing** (✓): 1,979 tokens and 131 directive clauses (budget ≈950 / ≤50); about 50 restated rules | Trim to one statement per rule (§2) |
| Spoken commands | Conform to the sound-alike ruling (✓ probe); QA still judges with the old exact matcher | §5 |
| Harness skills | Stale facts fixed; `deep-reviewer` now on `gpt-6.1-sol` (owner ruling) | §6 |
| Latest guidance | SDK 0.20.0 has realtime interruption fixes; `delay` is unsupported for our model; GPT-Live 1 exists | §7 |
| Evaluation | Rates exist (41 runs) but cannot be split by prompt version | §1, §9 |
| Persistence | Restart, crash and stop recovery work (✓ live). Confirmed risks: two stop signals turn a stop into a restart (✓ live); wake dies after a second worker failure; no hang detection; the camera helper reopens every ~8 s forever | §8 |
| Button | Flic 2 (keyboard mode) + Karabiner-Elements + a `launchctl`-only helper | §10 |

## 1. Evidence baseline

**Retained real-provider QA:** 41 runs, 2026-10-09 to 10-11, synthetic speech
into real WebRTC ASR and tools, about 200 judged turns, metadata only
(`.artifacts/phase4-qa/*/raven-results.json`).

| Judge code | Count | Failed criterion | Count |
|---|---|---|---|
| tool_preamble | 42 | tool_silence | 81 |
| asr_changed_meaning | 34 | grounding | 48 |
| incomplete_answer | 22 | completion_truth | 35 |
| wrong_language | 20 | memory_accuracy | 18 |
| wrong_tool | 12 | spell_boundary | 18 |
| invented_fact | 10 | local_scope / local_first | 16 |

**Worst turns:**

| Turn | Pass rate |
|---|---|
| recall_material, recall_commitment | 0/6 each |
| explicit_local_loop | 0/8 |
| chinese_fallback | 0/7 |
| vault_miss | 0/4 |
| local_then_external | 1/10 |
| exact and extended spell | 1/8 each |

**Tool calls:**

| Tool | Calls |
|---|---|
| find_media | 52 |
| search_youtube | 22 |
| play_media | 22 |
| play_youtube | 21 |
| memory (identify / recall / remember) | 13 / 12 / 7 |
| return_to_dormant | 10 |
| stop_media | 3 |
| capture_camera | 2 |

**Codex's later runs, for the record** (ledger):
- spell guard 8/8;
- memory quality 7/10 (mini) and 6/10 (full);
- local-only quality 0/3, with preamble, language, ASR and grounding findings.

**Production telemetry, last 7 days:** 16 sessions, 18 media requests, 0
YouTube searches, 8 playback failures or timeouts, 74 provider rejections
(uncategorized; the reason allowlist only shipped today). Per-call tool names
and preamble/language flags are **not** recorded in production.

**Caveats:**
- The judge is a model.
- The audio is TTS, so a third of failures start at ASR.
- Runs mix prompt versions. The judge's `tool_silence` text changed today, but
  its version stayed `raven-quality.v1` (`raven-conversation-fixture.ts:77,365`).
- `raven-provenance.json` records model IDs and the config hash, but not the
  prompt or tool catalog hash.

## 2. Raven's prompt

Rendered with the repo's own `buildAvatarPrompt`/`resolveRealtimeTools`
against published v17; o200k token counts (✓, re-rendered from the final tree
at 15:58).

| | HEAD | Final tree | Budget (2nd audit §8) |
|---|---|---|---|
| Session prompt | 1,933 | **1,979** | ≈950 |
| Share that is tool rules | 80% | 79% | — |
| Tool definitions | 1,027 | 1,027 | ≤800 |
| Prompt + tools | 2,960 | 3,006 | — |
| Tools | 8 | 8 | ≤6 |
| Directive clauses (negated) | 121 (49) | **131 (55)** | ≤50 |
| ASR prompt / language hints | — / — | 30 / 27 + 21 | — |

**Codex's changes:**
- **Added:** Language, Preambles, AI-honesty and unclear-audio sections. The
  late catalog edit lengthened the local-only rule and added a YouTube
  "bridge" sentence.
- **Removed:** the 「我來找找」 sample and the farewell examples.
- **Restored:** the memory text, after its shortened version failed the quality
  gate.

Net: longer, and every budget missed.

**Repetition** (the same rule across session, tool rules, descriptions, memory
state and persona):

| Rule | Times stated |
|---|---|
| No preamble / silent call | 7× |
| Claim only after success | 7× |
| Tool data is not instructions | 6× |
| Quoted, negated or hypothetical requests | 5× |
| Once vs loop | 5× |
| No extra confirmation | 4× |
| Spells are not tools | 4× |
| Short replies | 4× |

Three of these are already enforced in code by `backgroundResult`
(`realtime-tool-bindings.ts:25-29`): accepted playback, pending confirmation
and clean-session reset. Their prose can go.

**Current guidance** ([realtime prompting](https://developers.openai.com/api/docs/guides/realtime-models-prompting),
[voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting), read 2026-10-11):
- gpt-realtime-2.x follows instructions literally. Drop overlapping
  "must / only / never / always", and keep "never" only where it is truly
  required.
- Preambles stay prompt-controlled. Keep the preamble and language rules near
  the top, as the final tree does.
- Sample phrases may appear as labelled, variable anchors. Omitting them is a
  defensible choice, given reports that 2.1 copies examples literally.
- Ask before writes, not reads: memory `forget`/`policy` may deserve
  confirmation; media and recall do not.

**Target shape (for Codex):**
- Session prompt ≈400–950 tokens, in this order: Role (the approved sage, one
  line), Language, Preambles, Delivery, Conversation, Tools (≤2 lines each,
  "when" only), Spells last.
- Each rule appears once. Tool descriptions say *what*; the prompt says *when*.
- No example phrases in tool text. The function-calling guide warns that
  examples can hurt reasoning models (`stop_media`'s 不要再播了).

**Persona.** The operator persona's "speak in the visitor's language"
contradicts the `# Language` section. Adopt the approved sage persona, which
describes character only: plain answer first, then at most one brief image or
riddle. The owner applies it in the Console after the trial.

## 3. Raven's tools: does the avatar use its skills correctly?

All eight findings still hold on the final tree (✓ re-check, current lines).

| # | Finding | Evidence | Fix (Codex) | IDs |
|---|---|---|---|---|
| 1 | **`stop_media` cannot run during playback.** `setMediaPlayback` sends `create_response:false` and interrupts, so the model never answers while media plays. Model audio during media is interrupted, and `stop_media` also refuses while a command owns the turn. Only the wake phrase stops media; 「不要再播了」 is logged `media_wake_not_matched`. | adapter `:1684-1696`, `:1138`, `:600-602`, `:1316-1331` | Remove the tool (−195 tokens). Add application-owned whole-utterance stop phrase(s) through `spokenCommandKey` as control turns (D2). | 6, 7, 9 |
| 2 | **The prompt says the media library is empty.** v17 has `mediaSkill.enabled` with 0 resources, so the prompt renders `Media library … []`, while two linked folders are indexed by `find_media`. This plausibly drives the local-only failures. | `avatar-prompt.ts:72-73`, v17 | Omit the line or render the indexed count. Reword `assetId` to "from find_media results". | 9 |
| 3 | **Results invite narration.** `speech` is spread into every payload; 19 results say `"speech":"model"`. The late edit moved `capture_camera` rejected/failed from `none` to `model`. | `realtime-tool-bindings.ts:22`, catalog | Return one code plus an optional `next` (`play_media` / `search_youtube` / `ask` / `explain`), with no `speech` field. | 9 |
| 4 | **Local-only is enforced only in the prompt.** The rule was reworded and strengthened (catalog `:58`, `:76`), but the `search_youtube` handler has no source restriction, and `media_source_restricted` is declared but never emitted. | adapter `:581-589`; `realtime-events.ts:38` | Enforce the restriction in code, or use one play tool with `source: auto/local/youtube` and code-owned fallback (D3). | 9 |
| 5 | **Play failures give nothing to explain.** The model sees only bare `rejected`/`failed`; the reasons go to telemetry. | `ipc.ts:1816-1868` | A small reason enum: `not_found`, `youtube_not_configured`, `playback_timeout`, `loop_unavailable`. | 9, 10 |
| 6 | **Slow tools run silently.** Memory (8 s interpreter) and camera are not wrapped in the working cue; only find/search are. | adapter `:538-576`, `memory/intent.ts:44` | Wrap memory (except recall) and camera. | 9 |
| 7 | **"All five fields" is not enforced on the wire.** The SDK sends only type, name, description and parameters, so the ~70-token retry rule compensates. The rules also leak internals ("Main verifies delivery…"). | SDK `openaiRealtimeBase.mjs:483-488`, catalog `:185` | Fill missing strings with `''` before validation; delete the retry and mechanics prose. | — |
| 8 | **Memory results carry `confirmation` (token + text) and `name`.** The token is opaque noise to the model. | adapter `:562`, `shared/memory.ts:11,16` | Drop the token from model output. | 2, 3 |

**Target set:**
- **Tools (5):** `return_to_dormant`, `find_media`, `play` (source + fallback in
  code), `capture_camera`, `memory`. Media stop becomes an application spoken
  command.
- **Cues:** a working cue for any tool slower than about 500 ms, and the one
  spoken bridge only before a YouTube search (ruling).

## 4. Language: regression still present (fix before commit)

`visitorSentenceLanguage` (`src/shared/visitor-language.ts:5-8`) recognises
Chinese only with three patterns:
- 我/你(們) + 想/要/是/有/會/能/覺得/喜歡;
- 請/可以/能不能 + anything;
- 今天/昨天/明天 + two characters.

`MemoryDialogue.observeVisitorSentence` (`memory-dialogue.ts:28-35`) inserts a
system hint only when the detected language changes. It never removes the
previous hint, and it skips hints while a memory dialogue is open.

**Probe on the final tree (✓):**

| Input | Detected |
|---|---|
| 「現在幾點」「這是什麼」「你好嗎」「那你呢」「告訴我一個故事」「播放月亮代表我的心」「幫我找一首周杰倫的歌」「為什麼天空是藍的」「停止播放」 | none (9/11) |
| 「我想聽音樂」「請播放音樂」 | Chinese |
| "Play some jazz", "What time is it?", "Tell me a story", "Who are you?" | English |
| "Why is the sky blue?", "Hello Raven", "Sing me a song", "Good morning" | none |

So one complete English sentence leaves "Current visitor reply language:
English" in force through most Chinese that follows.

**Fix:**
- Treat Han-dominant text as Chinese (for example, ≥4 Han characters and
  Han ≥50% of letters).
- Keep a single current hint: delete the previous item before inserting.
- Add the table above as unit cases.

The ruling stands: switch only on a complete sentence; names and titles do not
switch.

## 5. Spoken commands

**Conforms (✓ probe on the final tree).** `spokenCommandKey` folds the whole
utterance with OpenCC and a pinned toneless lexicon. Spell, scene stop,
media-wake, the publish collision check and memory exclusion share it.

| Wake phrase 「有請渡鴉大人」: matched | Rejected |
|---|---|
| 有情渡鴨大人, 有親渡鴉大人, 有請杜鴉大人, a trailing 。, spaces, Simplified script | an added 吧, a 不要 prefix, quotes |

`isSpellAttempt`:
- **True:** 施放咒語點亮銀燈, 是放咒語點亮銀燈, 施放咒語是什麼.
- **False:** 我要施放咒語, 師傅咒語.

A question that merely starts with the spell prefix still counts as an
attempt; it is caught at the final transcript by whole-utterance equality.

**Command-prefix guard (Codex, 14:53; not in the first draft):**
- **N1, defect (invariants 1, 4).** In the memory tool handler,
  `if (commandTurnOwned) return stale()` (adapter `:547`) now runs before
  `memoryResetPending ||= memoryNeedsReset(...)` (`:559`).
  - Scenario: Main completes a forget, correct, policy or temporary change,
    and meanwhile the visitor starts an utterance with the spell prefix.
  - The handler returns stale without setting the reset flag, so the
    clean-session replacement (`:1415-1420`) never runs. The old provider
    session keeps context that Main has just changed.
  - Fix: set the flag before the ownership check.
- **N2, minor.** The language hint and memory "complete" input are fed before
  scene-stop and spell-decision listeners claim the turn (adapter `:1333`,
  `:1344` onward), so those control turns can still move the language hint.
- **N3, minor.** On the 8 s final-transcript timeout, ownership and the
  candidate stay set, so a cancelled reply is not resumed until the visitor
  speaks again. The Console event exists, so invariant 9 holds.

**Earlier gaps, all still present (✓):**
- QA judges "exact" with the old character-exact `normalizeTranscript`
  (`spell-trigger.ts:93`) in `raven-conversation-qa.ts:97` and
  `raven-wake-asr-qa.ts:31`, so QA disagrees with production.
- The adapter, `scene-transcript-controller.ts` and `scene-config.ts` import
  the new key under that same old name. Rename it or remove the old export.
- `relationship.ts:121,168` labels every unconfirmed guest turn
  `memory_control_excluded`. Give guest turns their own reason (invariant 9).
- The ASR prompt primes 「施放咒語」 (`realtime.v1.json:43`, sent at adapter
  `:645`). Measure the false-prefix rate before keeping it.

## 6. Harness and skills

| Measure | Value |
|---|---|
| AGENTS.md | 6,978 B / 120 lines (21% of Codex's 32 KiB) |
| CLAUDE.md + imported AGENTS.md | 198 lines (Anthropic target <200) |
| Skill descriptions | 10 skills, 1,439 chars (18% of 8,000) |
| Broken links | 0 |

**Fixed by Claude** (files Codex had not modified; facts re-verified):
- `mm-realtime-voice/references/prompt-controls.md`: the sound-alike matcher
  and turn ownership are described as implemented. Application speech is
  out-of-band. The wire carries no `strict`. It warns against the old
  `normalizeTranscript`.
- `mm-realtime-voice/references/sdk-session.md`: the ASR prompt comes from the
  catalog, with a false-prefix caution.
- `mm-realtime-voice/references/playback-lifecycle.md`: names the real
  mechanisms (`resetConversation()`, `rolloverAtSafeBoundary`,
  `MemorySession.turnStart`, `turn.control`) instead of nonexistent symbols.
- `roleplay-control-prompts/SKILL.md`: the language hint is implemented, so
  measure its rate.
- `mm-invariants/SKILL.md`: corrected pointer.
- `CLAUDE.md`: skill routing, and the stale `.claude/skills/mm-*` copies are
  hidden by `.claude/settings.json`.
- **`.codex/agents/deep-reviewer.toml`: `gpt-5.6-luna` → `gpt-6.1-sol`**
  (owner, 2026-10-11: "for codex yes must use sol"). All four Codex agents and
  `default_subagent_model` now match AGENTS.md.

**Left for Codex or the owner:**
1. **Electron ownership across agents.** AGENTS.md forbids overlapping
   Electron runs, but nothing enforces it between Claude and Codex. Today
   Codex quit the production app while Claude was testing it. Suggest one lock
   file, for example `~/Library/Caches/MagicMirror/electron-owner`, taken by
   QA runners, `owner-check.sh` and any agent before stopping or starting
   Raven.
2. **Avatar studio has no route to Raven's masters.**
   - Add one line to `magic-mirror-contract.md`: `resources/avatar/Raven/README.md`;
     canonical `v10/cubism/raven-lord-v09.cmo3`; V11 is performance-only on
     V10's MOC; new work gets a new `vN/`.
   - `acceptance-resume.md:3` ("do not copy source into the product repo")
     conflicts with the versioned-masters rule.
3. **Missing guidance likely to cause mistakes:**
   - **Voice DSP:** `voice-effects.ts`, `VoiceStudio.tsx`, `prepare-voice-effects.mjs`
     and the latency budgets.
   - **Persona source:** published config (Console draft → Publish), assembled
     by `avatar-prompt.ts`. `realtime.v1.json` `defaults` are only the
     fallback.
   - **Wake tuning:** `npm run evaluate:wake`.
   - **QA scenarios:** `RAVEN_CONVERSATION_SCENARIOS` and the Phase 4 flags
     are missing from `mm-ui-qa/references/modes.md`.
4. **Duplication.**
   - 47 "does not prove/establish" disclaimers.
   - The mouth-clock and V11 facts are repeated in 6–7 files.
   - Keep one owner per rule and link to it elsewhere.
5. **DECISIONS contradicts itself.**
   - Line ≈241 says large editable files are git-ignored, but six
     `.cmo3`/`.psd` files are tracked.
   - Line ≈205 says extracted memory values stay RAM-only, against invariant 1.
   - Mark both superseded.
6. **Small items.**
   - AGENTS.md line 56 → "On Windows pass `--cd 'C:\Project\magic-mirror'`."
   - `main-process.md:13` suggests adding a dependency.

## 7. Latest guidance (checked 2026-10-11)

| Item | Source | Implication |
|---|---|---|
| `@openai/agents-realtime` **0.20.0** (2026-10-08) vs installed 0.16.1: response-ownership, history-order, stale-tool and interruption fixes | [npm](https://registry.npmjs.org/@openai/agents-realtime), [releases](https://github.com/openai/openai-agents-js/releases) | Touches barge-in, the spell-turn race and application `response.create`. Dependency change: D1, with its own regression. |
| `delay` is "only supported with gpt-realtime-whisper" | [API reference](https://developers.openai.com/api/reference/resources/realtime/client-events) | Our `"delay":"medium"` with `gpt-live-transcribe` is probably ignored. |
| **GPT-Live 1** GA (2026-09-10): full duplex, tools by delegation, no image input; `store:true` retains audio | [changelog](https://developers.openai.com/api/docs/changelog), [guide](https://developers.openai.com/api/docs/guides/live) | Breaks `capture_camera`; retention conflicts with invariant 1. Not now (D7). |
| No newer realtime model than 2.1. Community reports (unverified): 2.1 narrates steps and copies examples; 2.1-mini skips tool calls | [forum](https://community.openai.com/t/new-realtime-models-on-the-api-gpt-realtime-2-1-and-gpt-realtime-2-1-mini/1385896) | Same direction as our preamble rate. Keep the QA-only model A/B. |
| Examples in tool text can hurt; `strict` is not in the Realtime tool schema | [function calling](https://developers.openai.com/api/docs/guides/function-calling) | §2, §3 item 7 |
| `truncation.retention_ratio`, per-response `parallel_tool_calls`, `near_field`/`far_field` noise reduction | API reference | `far_field` is worth an acoustic A/B with the Jabra. |
| Claude Code: `/doctor prompt-audit`; `skillOverrides`; skill bodies truncated to 5,000 tokens after compaction | [memory](https://code.claude.com/docs/en/memory.md), [skills](https://code.claude.com/docs/en/skills) | Keep critical rules at the top of each SKILL.md. |

## 8. Persistence: running for days, started and stopped by a person

**Lifecycle tests on the deployed LaunchAgent (✓ live, 15:55–16:02,
Dormant).** Times come from launchd and telemetry.

| # | Action | Result | Verdict |
|---|---|---|---|
| L1 | One `launchctl kill TERM` | Exit 0 after **0.17 s**; not restarted after 15 s | ✓ |
| L2 | `launchctl kickstart` from stopped | Dormant at **1.0 s**; wake listening at **2.2 s** | ✓ |
| L3 | Two TERMs back to back | Killed by signal 15; **launchd restarted it at once** (`runs` +1); graceful cleanup skipped | ✗ confirms risk 3 |
| L4 | `kill -9` Main | launchd respawned in 0.09 s; wake listening 2.2 s later; no orphan camera or helper processes | ✓ |
| L5a | Kill the Mirror renderer | Maintenance → rebuilt → Dormant in 0.6 s, same process | ✓ |
| L5b | Kill it again 20 s later | Exit 1 (recreate budget spent), then launchd restart: Dormant in 0.9 s | ✓ as designed |

**Pending (blocked by Codex's camera work; run when Electron is free):**
- **L6:** kill the wake utility process twice. Expected from code:
  `wake_worker_exit_repeated`, then no wake until restart (risk 1).
- **L7:** `SIGSTOP` the Mirror renderer for 60 s. Expected: nothing detects
  it (risk 2).
- **L8:** one Raven conversation QA pass on the final prompt, to compare with
  §1.

**Measured** (metadata):

| Item | Value |
|---|---|
| launchd | exit timeout 5 s, ThrottleInterval 10, KeepAlive `SuccessfulExit=false`; installed plist = repo |
| Logs | `app.out.log` 24 KB since 10-03, markers without timestamps; `app.err.log` gets renderer-gone stack traces |
| Telemetry | rotates at 5 MB × 5 |
| Camera | the native helper (`camera-tracker.swift:93-130`) reopens the session every ~8 s while frames are missing, with no backoff: **393 status events in 26 min** (~3 MB/day), so rotation keeps only about a week |
| Resources, Dormant | 15:32–15:54: total RSS 932 → 951 MB; utility processes +11 MB / 22 min. Too short to judge a slope |
| Power | sleep and displaysleep 0, `autorestartatconnect 1`, display-sleep blocker held |

**Ranked risks:**
1. **Wake dies after a second worker failure** (✓ code).
   - The budget is one restart per lifetime (`wake/supervisor.ts:105,362-366`),
     reset only in `start()` (`:380`).
   - `wake_worker_exit_repeated` neither enters Maintenance nor exits, so the
     black mirror cannot be woken until someone restarts the app. This
     happened on 10-03.
   - Fix (D5): reset the budget after about 10 minutes of healthy input; on a
     further failure in Dormant, exit 1 so launchd restarts (L4 shows about
     2 s to listening).
2. **No hang detection** (✓ code). There is no `unresponsive`,
   `child-process-gone` or heartbeat handling. Fix (D5):
   - a Mirror heartbeat every 5 s, crashing the renderer after 30 s of silence
     (reusing L5a's path);
   - a Main liveness worker that aborts after 60 s, so launchd restarts it.
3. **A stop can become a restart** (✓ live, L3).
   - A second TERM kills by signal; there is no SIGTERM handler in
     `src/main`.
   - Separately, `fatalMainFailure` and the global handlers ignore
     `shutdownStarted` (`index.ts:728,752-756,768-769,1638-1645`), so a
     rejection during a TV-off or button quit exits 1.
   - Fix: handle SIGTERM once and ignore repeats; keep exit 0 once a graceful
     quit has started. The button helper never sends a second TERM.
4. **The camera helper never backs off** (✓ live, new). It retries every ~8 s
   forever on a stalled device; Main's backoff (`camera/tracker.ts:25,102-104`)
   covers only process exits. Alternating statuses bypass the status dedupe,
   which floods telemetry and the Console.
   - Fix within Codex's camera-recovery ruling: exponential backoff in the
     helper (8 s → 5 min); coalesce flapping status into one degraded reason
     with a count.
5. **WebGL contexts are never freed** (✓ code). `release()`
   (`cubism-avatar.ts:576-583`) and `dispose` neither call `loseContext` nor
   clear the vendor shader map. Nothing handles `webglcontextlost`, so a GPU
   reset freezes the avatar silently (invariant 9).
6. **launchd's 5 s stop timeout vs the app's 15 s cleanup bound.** Dormant
   cleanup took 0.17 s (L1), so this matters only when stopping mid-conversation
   or mid-media. Add `ExitTimeOut` 20 to the field plist.
7. **A failed audio stop is cached** (`realtime-runtime-owner.ts:718-725`,
   `processed-audio-output.ts:60,68-70`). Audio Maintenance then exits 1 and
   recovers only through a restart.
8. **Restart loops.** Renderer crashes are counted per lifetime
   (`crash-recovery.ts:38-43`; L5b), and `window_load_failed` exits 1
   (`index.ts:500`). Each restart is about 1 s (L5b), so this is acceptable,
   except for a crash on every launch. Count per hour, and add ISO timestamps
   to `formatMarker` (`log.ts:18-21`) so loops show in the log.
9. **Smaller items.**
   - The startup grace can skip the 15 s confirmation (`tv-presence.ts:98-99`).
   - The YouTube partition is never cleared.
   - App Nap is not disabled explicitly (low risk while the window is visible).

**Verified clean:**
- Telemetry rotation.
- Per-session microphone, WebRTC and AudioContext release.
- YouTube view closed after each play.
- Bounded recovery probes.
- Hourly realtime rollover.
- Crash and single-stop recovery (L1–L5).

**"Persistent" and the TV ruling are consistent.** Raven runs until a person
stops it or the TV is off. A start pressed with the TV off exits 0 after the
180 s grace.

**Soak still to do.** Run 24 hours under the LaunchAgent with no other agent
touching Electron. Sample RSS and file descriptors every 2 minutes, and include
≥10 wake → conversation → Dormant cycles. Pass: RSS slope <5 MB/hour after
warm-up, no FD growth, no unplanned `runs` increments.

## 9. Evaluation method (so prompt changes are judged by rates)

**Provenance and versioning:**
- Record `promptCatalogSha256`, `toolCatalogSha256`, the rendered-prompt hash
  and a judge-criteria hash in `raven-provenance.json`.
- Bump `raven-quality.vN` whenever criterion text changes.

**Cases:**
- A fixed gold set of 10–50 turns per behavior, plus a holdout.
- Fixed VAD settings, chunking and tool mocks.
- Judge language separately from ASR.
- Check spoken confirmations against completed actions.

**Runs and arms:**
- Interleave arms: current vs trimmed prompt, then 2.1 vs 2.1-mini (QA-only).
- About 200 tool turns per arm. Report Wilson intervals for `tool_preamble`,
  `wrong_language`, `invented_fact` and `wrong_tool`.

**Recorded in production (metadata only):** per-call tool name and outcome,
preamble-before-tool and reply-language flags, so field rates can be compared
with QA.

## 10. Start/stop button

**Recommendation:**
- **Hardware:** a Flic 2 in Universal (Bluetooth keyboard) mode.
- **Mapping:** Karabiner-Elements with `device_if` on the button's address or
  VID/PID. Karabiner seizes only that device, so the key never reaches the
  Mirror or Console. Hammerspoon and Shortcuts cannot filter by device.
- **Gestures:** push = start, hold about 1 s = stop.
- **Fallback:** the Flic Mac app's Terminal Command action. Simpler, but not
  verified to run headless at login.

**Helper `deploy/macos/raven-button.sh` (Codex writes it; launchd stays the
only restart owner):**
- Absolute paths and `$UID`, because Karabiner gives a minimal environment.
  Detach at once, because Karabiner kills a still-running command when a new
  one fires.
- Debounce with an `mkdir` lock: ignore presses within 2–3 s.
- **start:**
  - Already running: play "already on".
  - Job not loaded: `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.magicmirror.launchagent.plist`.
  - Otherwise: `launchctl kickstart gui/$UID/com.magicmirror.launchagent`.
  - Wait ≤10 s for a pid (L2: 1 s), then play the success or failure sound.
- **stop:**
  - Not running: play "already off".
  - A stop marker younger than 30 s: ignore the press. **Never send a second
    TERM**; L3 shows it restarts Raven.
  - Otherwise: one `launchctl kill TERM`, then poll ≤25 s for exit 0
    (L1: 0.17 s in Dormant).
  - Still alive: `launchctl bootout`, which unloads the job so it cannot
    restart. The next start bootstraps it.
- **Feedback:** sound only, via `afplay`. Nothing appears on the glass (Black
  Dormant), and nothing touches the microphone.
- **Log:** one metadata line per press in `~/Library/Logs/MagicMirror/button.log`.
- **`owner-check.sh`:** add a check that Karabiner and its driver extension are
  active.

**Failure modes:**
- The CR2032 battery: check quarterly.
- After boot, the first press may only reconnect Bluetooth.
- A macOS or Karabiner update can revoke the driver-extension, Accessibility or
  background-item approvals.
- ThrottleInterval (10 s) delays a restart only if the previous run lasted
  under 10 s.

**Acceptance tests:**
1. Stopped, push: running ≤5 s with the start sound. Push again: still one
   instance and one microphone owner.
2. Dormant, hold: exit 0 ≤15 s; `runs` unchanged after 60 s; no Electron,
   camera or worker left.
3. Active, mid-YouTube or BGM, hold: audio stops, exit 0, no restart.
4. Hold twice within 3 s: one TERM, exit 0, no restart (the L3 regression).
5. Hold, then push within 5 s: one clean stop, then one start; never two
   instances.
6. Frozen app (QA-only SIGSTOP), hold: bootout after 25 s; the next push
   starts it.
7. Power-cut reboot: after auto-login, the button works with no app opened.
8. The button key never reaches the Mirror, Console or TextEdit.
9. Push with the TV off: exit 0 after 180 s. Push, then TV on within 2 min:
   stays running.
10. Battery out, then back in: reconnects and works.

## 11. Decisions for the owner

| # | Decision | Recommendation / status |
|---|---|---|
| D1 | Upgrade `@openai/agents-realtime` 0.16.1 → 0.20.0 | **Yes**, as its own change with a regression run, before the prompt A/B |
| D2 | Replace the unreachable `stop_media` with application-owned stop phrase(s) during media | **Yes**; the owner names the phrase(s), for example 「停止播放」. The wake phrase keeps stopping media. |
| D3 | Trial one merged play tool (source + fallback in code) | **Yes**, QA-only first |
| D4 | `deep-reviewer` model | **Done:** `gpt-6.1-sol` (owner, 2026-10-11) |
| D5 | Self-restart: exit 1 when wake keeps failing in Dormant; a hang watchdog | **Yes**; each costs about 2 s of restart (L4) instead of a dead mirror |
| D6 | Buy a Flic 2 and install Karabiner-Elements (one-time admin approvals) | **Yes**; push = start, hold = stop |
| D7 | GPT-Live 1 trial | **Not now** (no image input; audio retention) |

## 12. Order of work for Codex

1. **Before committing the current remediation:**
   - N1, the memory-reset ordering (§5, one line);
   - the language detector and single hint (§4);
   - the empty media-library line (§3 item 2);
   - provenance hashes and judge version (§9).
2. **Persistence:**
   - SIGTERM-once and shutdown exit-code guard (risk 3, L3);
   - camera helper backoff and status coalescing (risk 4, within the camera
     ruling);
   - wake budget and escalation (D5);
   - heartbeat and liveness watchdog (D5);
   - WebGL release and context-loss handling;
   - uncached stop failure;
   - `ExitTimeOut` 20;
   - marker timestamps.
3. **SDK 0.20.0** (D1), with a regression run.
4. **Tools:**
   - remove `stop_media` and add the app stop phrase (D2);
   - result shape `code` + `next`;
   - failure reason enum;
   - working cue on slow tools;
   - fill missing memory fields;
   - QA matcher alignment;
   - the guest-turn reason;
   - N2 and N3.
5. **Prompt trim to budget (§2),** then the interleaved A/Bs (§9) for prompt,
   merged media (D3) and model.
6. **Skills items left in §6,** including the Electron-owner lock and the
   DECISIONS supersession notes.
7. **Button helper and Karabiner config (D6),** then the §10 acceptance tests.
8. **Pending L6–L8, the 24-hour soak and power-cut tests T1–T5,** run while no
   other agent owns Electron.

## Appendix: probes and tests run by Claude

- **QA aggregation:** 41 `raven-results.json` files, counting codes, criteria,
  turns and tool calls only.
- **Prompt render:** HEAD, the 13:40 working tree and the final tree (15:58),
  using the repo's own builders against published v17, with o200k counts.
- **Language and matcher probe:** bundled from final-tree
  `visitor-language.ts` and `spoken-command.ts` (§4, §5).
- **Code re-check:** every §3, §4, §5 and §8 claim against the final tree by
  one Opus investigator, with N1 re-read by the root.
- **Lifecycle tests L1–L5:** on the deployed LaunchAgent with `launchctl` and
  signals; timing from launchd and telemetry; metadata only.
- **Resource sampler:** Raven process-tree RSS, CPU and FDs every 2 minutes
  (session scratchpad).
- **Registry:** `npm view` of `@openai/agents-realtime` and `openai`.
- **Not run:** provider calls, QA runners, audio playback, microphone capture.
  Codex reported the full suite at 15:31; Claude changed no code, so that
  result stands.
