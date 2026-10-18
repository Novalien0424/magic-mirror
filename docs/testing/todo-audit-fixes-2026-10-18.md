# TODO code-audit fixes — 2026-10-18

Owner request: read TODO.md, verify its claims, fix them all, then QA, commit,
deploy and push. Scope: the nine P2 code-audit findings against `1a5a435` and the
known media deadline limitation. Hardware, human and acoustic acceptance items
stay open in [TODO](../../TODO.md). Evidence is metadata only.

## Verification of the claims

Each claim was checked against the code at `1456e26` and then reproduced by a
regression test that fails on that code and passes with its fix: 14 new or
extended tests in seven files, each run against the old source before the fix
was restored.

| Finding | Verified cause |
| --- | --- |
| Late Studio reveal reply | The reveal is application-owned, so no visitor turn maps to it; after exit only the image item was deleted. |
| Interrupted Studio call | The SDK runs only `completed` calls; an `incomplete` one never gets an output, and cleanup waited for one. |
| Failed Studio transcription | The SDK retrieves an input only after a transcript; cleanup waited for that retrieval. |
| Farewell retry across runs | The retry closure re-entered `requestStudioFarewell` without the run guard. |
| Superseded revision | Reveal work checked only the run counter, not the revision. |
| Refresh vs. login write window | Recheck and write were separate steps with no lock shared with the login script (a separate process). |
| Removed sign-in fallback | `refresh()` returned `null` for both removal and failure; `get()` then returned the old still-valid token. |
| Console cancel during Play | Main's Play reply waits until frames advance, and the Loop panel paused polling for the whole request, so the control bar stayed in avatar mode with no Return to Avatar. |
| Cache budget | Deleted entries still counted toward the running total. |
| Media deadlines | Loop validation bounded preparation at 12 s and conversation media had a 15 s player watchdog, while the helper may download for its size-scaled deadline. Return to Avatar also queued behind an in-flight validation. |

## Changes

- **Studio (Realtime adapter):** replies to application Studio responses
  (`mirror_studio` metadata) are Studio history even after exit; an `incomplete`
  Studio call is deleted without an output; `input_audio_transcription.failed`
  settles the item like a retrieval (and logs `transcript_unavailable`); farewell
  retries carry their run; reveals require Main's latest revision of the run.
- **ChatGPT sign-in:** Main and `npm run chatgpt:login` both commit under
  `.env.chatgpt.lock` (exclusive create; a lock older than 30 s is reclaimed).
  Main rechecks the refresh token under the lock, so a login lands before or
  after a refresh save, never under it. A removed sign-in returns no credential
  to any request waiting on that refresh.
- **Console:** the Loop panel keeps polling during Play (only Save pauses it);
  the control bar shows Loop video › Return to Avatar while Play is pending;
  cancelling drops the pending Play quietly instead of reporting a start failure.
- **Media cache:** only kept entries count toward the 2 GiB startup budget.
- **Media deadlines:** loop Save/Play validation waits for the size-scaled copy
  deadline (+3 s; 12 s for small files as before). Return to Avatar and shutdown
  abandon an in-flight validation. Conversation media from linked folders is
  copied before media takes over (the avatar stays visible meanwhile), so the
  15 s watchdog covers the player only; Stop or replacement cancels a start during
  the copy, which stays cached.

## Results

On the rebuilt stamped build (`qa-build --verify` pass; artifacts under
`.artifacts/phase4-qa/2026-10-18T<time>`):

| Check | Result |
| --- | --- |
| Typechecks (node, web) | pass |
| `npm test` (includes Electron smoke) | 2,507 passed, 2 skipped, 205 files |
| `--operator-loop`, with new `operator_loop_start_cancel` | pass, 16 — `01-51-11-507Z` |
| `--console`, `--field-help` | pass, 44 / 20 — `01-52-01-844Z`, `01-52-40-364Z` |
| `--media-skill`, `--media-skill-functional` | pass, 18 / 18 — `01-52-50-396Z`, `01-53-36-416Z` |
| `review_ui` (isolated) | pass, 14 — `01-54-21-971Z` |
| Live `portrait_studio` (real API) | pass 15/15 — `01-54-36-513Z`; reveal, change, finish, history cleanup and mic release; 0 provider errors |
| Live `local_scope` (real API) | run 1 `01-59-12-461Z`: every application check passed, the transcript judge failed one turn (`wrong_language`, `fixture_evidence_gap`); retry `02-01-47-605Z`: pass, 9 |

Counts are passed steps; the Console, field-help and media-skill step sets are
identical to the 2026-10-17 runs. The new Console case holds the Mirror's media
start so Main stays `preparing` while Play is pending, then checks that Return to
Avatar is offered and cancels without a start-failure alert.

Sound: the Electron QA modes and live runs used the minimum-output rule (69 %
unmuted captured, 1 %, restored). `npm test` ran at the captured 69 % without
that wrapper. Input gain was unchanged.

Not covered: a real cold Google Drive download over the network (the
slow-preparation behavior is proven with synthetic delays), a real concurrent
`npm run chatgpt:login` (the lock is proven with real files and the script's
writer), and owner hardware/human checks. No phase acceptance changes.

## Follow-up gap review (same day)

- **Fixed:** the first version of copy-before-play hid the avatar for a video
  request during the whole copy (a black mirror for a long download). Media now
  takes over only after the copy; the regression asserts no media state change
  while copying.
- **Checked, not a gap:** a Studio call that reaches the conversation agent after
  a swap gets the SDK's own "not found" output, so its pair is still deleted.
- **Remaining (in TODO):** no real cold Drive download has been exercised; during
  a long copy a Stream Deck PLAY LOOP shows nothing until the loop starts, and a
  conversation request waits silently. Loop Save during a long copy cannot be
  cancelled; it is bounded by the size-scaled deadline. A real concurrent
  `npm run chatgpt:login` was not exercised.
- **Documents:** superseded statements in the 2026-10-17 revamp and cloud-save
  ledgers point here; the open-issues ledger has a current status note; the
  Studio cleanup facts in `mm-realtime-voice` are current. Root handoff files are
  history referenced by `SHA256SUMS.txt` and Raven manifests, so they stay.

Follow-up results on the rebuilt stamped build (`qa-build --verify` pass): full
suite 2,507 passed / 2 skipped, run at minimum output this time;
`--media-skill` and `--media-skill-functional` pass, 18 / 18 (`02-25-27-097Z`,
`02-26-13-373Z`). Volume restored to 69 % unmuted; input gain unchanged.
