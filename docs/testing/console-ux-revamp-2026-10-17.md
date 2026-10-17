# Console UX revamp, Studio fixes and loop-video fold-in — 2026-10-17

Owner requests: audit and revamp the "strange" Console (conversation control and
Portrait Studio in the wrong place; compact, clean, hover help), consult Fable,
fix the four recorded Portrait Studio findings afterwards, fold in Codex's
loop-video work, then merge, deploy and test everything, including compact real
API tests. Evidence is metadata only: no transcripts, audio, names, answers,
images or credentials.

## Console layout

- One sticky top bar on every page: page tabs, a plain-language Mirror status
  chip ("Asleep · Listening for 「…」"; a banner only when attention is needed)
  and the live controls — Conversation (Start / Interrupt / Disconnect),
  Portrait Studio (Start / Back to conversation) and Stop All. In loop mode the
  groups are replaced by Loop video › Return to Avatar. One result line under it.
  Disabled reasons are hover/focus tooltips.
- Mirror page: active avatar row, published version, module health, a Loop video
  status row and the ChatGPT image service chip, each linking to its settings.
- Loop Video stays a separate global tab (owner ruling 2026-10-17); its status is
  a quiet dot ("Not playing" / "Playing" / "Failed"), and Play on Mirror explains
  why it is disabled.
- System: flat sub-nav — Devices · Media folders · Portrait images | Advanced:
  Models · Advanced config · Events · Phase Tests; Simulator only in developer
  mode. The ChatGPT image service (sign-in, model, usage, test portrait) moved
  from Avatars › Experiences to System › Portrait images, with a Copy address
  button for the usage page. Devices saves from a sticky bottom bar.
- Avatars: one header row (Editing avatar · On Mirror / Use on Mirror · New ·
  Duplicate · Delete · Inspect prompt ▾); section tabs and shared libraries in one
  row. Wake greeting and sleep farewell are edited only in Persona. Experiences is
  ~2,000 px instead of ~7,000 px (question cards, zh/en side by side, collapsed
  stage prompts). Static explanations (Appearance, Voice, Experiences, Loop
  Video) became hover help; privacy notes and live status stay inline. When the
  edited avatar is not live, the header says which one is ("On Mirror: …").
  Persona uses two columns below 1,240 px so names stay readable at 1,024 px.
  Inspect prompt closes on outside click or Escape. Global Stop All clears the
  workspace's stale test status; its outcome shows in the control bar.
- Compact scale: 15 px root, 32 px controls, 24 px minimum help targets (WCAG 2.2
  target size), 4.5:1 text contrast kept. The Console QA readability gate moved
  from the 2026-09-05 plan's 18 px / 44 px to this standard; contrast and
  no-horizontal-overflow checks are unchanged.

Fable reviewed the before state and the implemented result; every ranked item was
addressed except: Stop All stays enabled (an emergency stop; the Console cannot
know every running scene), Appearance keeps "Save & apply all changes" (owner
flow since 2026-10-04; labels drive QA), and the Phase 0 "Mock / simulator"
readiness label (a tested contract).

## Portrait Studio findings (TODO, PR #2 audit) — fixed

All four regressions fail without their fix.

1. Delayed reveal from an earlier run: every Studio entry increments a run
   counter; reveal, start-script, failure-line and farewell work carries its run
   and is dropped with `studio_event_stale` when a newer run started.
2. Visitor speech that began in the Studio but arrived after exit: the turn stays
   Studio history and is deleted after it is retrieved; the reply to it too.
3. Late Studio tool results: a call/output pair completed after exit schedules its
   own cleanup, in both arrival orders.
4. Token refresh vs. a newer login: the file is re-read right after the refresh
   response; a replaced or removed file wins (`chatgpt_refresh_superseded`).

## Codex loop-video work — folded in

Codex's on-demand media cache (coordinated Drive preparation into
`media-cache-v1`, startup cleanup, saved selection untouched) is included. One
change: the native helper's fixed nine-second limit covered the whole cloud
download, so a cold, online-only video above roughly 50 MB would fail every Save.
The deadline now scales with size (≥ 9 s, ~1 s per MiB, ≤ 10 min); Main allows
one extra second. Loop Save keeps its 12-second bound: if a large file is still
downloading, Save reports "Preparing the loop media took too long … press Save
settings again in a moment" while preparation continues, and the retry uses the
finished cache.

## QA drivers repaired

Running every offline Electron mode exposed drivers written for the old layout or
older contracts (several predate today): Stop All and its result now live in the
control bar; flat System nav; avatar name shown in the picker instead of a card
heading; Appearance offers only Save & apply (publishes), so the draft-only save
happens in Voice; publish-bar result line; media results may be `{status, code}`;
stale click coordinates after focus scrolls under the sticky bar; Simulator hidden
outside developer mode; device volumes apply on Save device settings; Appearance's
Save & apply replaces Save + Publish in the active-BGM flow. The help-coverage
audit names failing controls, and the ritual reload timeout names its unload
blocker. Three wake-tuning inputs gained real `aria-describedby` hints.

The Black Dormant check now waits (≤ 12 s) for the configured exit fade after a
mode switch instead of sampling the first frame; it measured fully black after
1.5 s and still fails with the lit area if anything remains. One ritual run
stalled on a Console reload (unsaved-changes guard suspected); the next run
passed 14/14 and the stall did not recur. It is recorded as intermittent.

Also fixed: `portrait-studio-config.ts` lacked the JSON import attribute the
Phase 0 demo runner needs, and Codex's new build inputs were missing from the QA
build fixtures and pinned scripts (18 full-suite failures).

## Results

Commit `1a5a435` on `field/macmini-deploy`, pushed; PR #2's branch
fast-forwarded to it (clean, mergeable). The stamped build in the canonical
checkout verifies against that commit; the app was left stopped as found, so the
next START runs it. All sound-producing runs used the owner's minimum-output rule
(captured, 1 %, restored on exit). Output read 75 % for every restore until it was
69 % when the last batches began; nothing in these runs changes volume, so 69 %
(unmuted) was captured and restored as found. Input gain unchanged.

Post-deploy, on that build (artifacts under `.artifacts/phase4-qa/`):

| Check | Result |
| --- | --- |
| `qa-build --verify` | pass |
| `npm test` (includes Electron smoke) | 2,494 passed, 2 skipped, 205 files |
| `--field-help` (with full Console tour) | pass, 21 checks — `14-17-44-900Z` |
| `--profiles` | pass, 43 — `14-17-55-111Z` |
| `--console` (incl. 1024/1440 readability) | pass, 45 — `14-18-32-700Z` |
| `--media-skill` / `--media-skill-functional` | pass, 19 / 19 — `14-19-11-091Z`, `14-25-59-128Z` |
| `--operator-loop` | pass, 16 — `14-19-57-092Z` |
| `--editor`, `--cubism`, `--audio` | pass, 39 / 182 / 4 |
| `--active-bgm`, `--ritual`, `--video-fades`, `--memory` | pass, 9 / 14 / 11 / 11 |
| `review_ui` (isolated) | pass, 14 — `14-26-45-079Z` |

Compact live API runs (mini, synthetic visitor audio → real WebRTC Realtime, real
tools and playback; not human or physical-microphone acceptance):

| Scenario | Result |
| --- | --- |
| `portrait_studio` | pass 15/15 (`14-26-59-604Z`); also 15/15 before commit (`13-34-18-122Z`). Studio history deleted after exit, mic released, 0 provider errors. |
| `local_scope` | pass, 9 (`14-34-18-987Z`) |
| `default_fallback` | run 1 (`14-31-18-280Z`): both phrase turns unlocked online search, but mini made no tool call; run 2 (`14-40-18-193Z`): every application turn passed (phrase turns searched and played; phrase-less turns stayed local); transcript judge failed (mechanism narration, language, ASR meaning). |
| `youtube_modes` | `14-36-07-708Z`: phrase once-play passed; without the phrase mini called `search_youtube`, which the gate kept local (no unlock); the phrase loop turn searched but did not play; judge failed. |

The online gate held in every turn: no online search without the phrase, unlock
with it. Mini's tool choice on phrase turns was 4 of 6 (2/4 in `default_fallback`,
2/2 in `youtube_modes`) versus 4/4 on 2026-10-15; the conversation tool list
gained `start_portrait_studio` today. Two runs cannot separate a regression from
provider variance; no prompt change was made. Saying 「在雲上找找」 at the mirror
remains the owner check.

Not covered: human Portrait Studio visit, owner look-through of the Console on
the portrait display, physical sound and Stream Deck key presses. No phase
acceptance changes.
