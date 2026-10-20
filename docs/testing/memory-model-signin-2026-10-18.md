# Memory model and ChatGPT sign-in upkeep — 2026-10-18

Owner requests: switch memory extraction to the latest GPT-6.1 Sol through an
alias; keep the ChatGPT sign-in signed in and show plainly in the Console
whether it is; explain how Portrait Studio starts. Ruling: DECISIONS
2026-10-18. Evidence is metadata only.

## Model ID

OpenAI's [GPT-6.1 Sol page](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
lists `gpt-6.1-sol` as the model and default snapshot: Responses API and
Structured Outputs supported, default reasoning `medium`. The
[all-models list](https://developers.openai.com/api/docs/models/all) has no
family-wide Sol "latest" alias (`chat-latest` is ChatGPT-only and not
recommended for the API). `gpt-6.1-sol` is therefore the alias; a later Sol
generation needs a new versioned config change.

## Changes

- **Config.** Packaged default `resources/config/default.json` →
  `gpt-6.1-sol`, `configVersion` 8. Field config published as version 19 with
  the app stopped, through the app's own config service (`saveDraft` +
  `publish`; draft equalled active beforehand). Only the memory model and
  version changed in meaning; saving also wrote each avatar's Portrait Studio
  settings explicitly, and both equal the defaults that applied before.
  Backup: `config/backups/before-memory-model-sol-2026-10-18/`; Previous = 18.
  The Raven QA transcript judge reads the same published role.
- **Sign-in upkeep.** Main checks every 30 minutes (and at start) and refreshes a
  token that would expire before the next check, plus the existing 8-day
  refresh. Signed out stays silent; refresh failures stay metadata events and
  show as "Sign-in refresh failed". Unit tests never touch the owner's file
  (only Main's own wiring turns upkeep on); Electron runs from the canonical
  checkout share it as before, under the same commit lock.
- **Console.** Badges read **Signed in** / **Not signed in** (or "Not signed
  in · sign-in file unreadable", "Signed in · refresh due", "Sign-in refresh
  failed"). The Mirror overview and Experiences chip is now "Portrait Studio ·
  ChatGPT" with a one-line start hint.

## Results

Stamped build (`qa-build --verify` pass), artifacts under
`.artifacts/phase4-qa/2026-10-18T<time>`; sound-producing runs at minimum output
(69 % unmuted captured and restored; input gain unchanged).

| Check | Result |
| --- | --- |
| Typechecks (node, web) | pass |
| `npm test` (includes Electron smoke) | pass, 90 s |
| `--field-help`, `--console`, `--memory` | pass — `03-34-40-249Z`, `03-34-50-571Z`, offline memory |
| Live `memory_calendar` (real extraction on `gpt-6.1-sol`) | pass, 20 s — `03-35-33-673Z` |
| Live `local_scope` (real API) | **failed twice, judge only** — `03-35-54-307Z`, retry `03-38-31-564Z` |

`local_scope`: every application check passed (vault and folder miss, sticky
local scope, mic release, real audio route, 0 provider errors). The quality
judge, now `gpt-6.1-sol`, failed run 1 on grounding and tool silence, and the
retry on tool silence plus naturalness/character scores of 2. The same
scenario under the `gpt-5.6-luna` judge failed once and passed its retry
earlier today. Dialogue settings did not change, so this is a stricter judge
baseline, not an app regression; it is open in TODO.

The production app was restarted on the new build at 11:40 Taipei (Mirror
ready, no new stderr). The owner's test portrait at 11:19 succeeded, so the
sign-in was valid; no refresh was due at startup.

## Not covered

A full two-visit memory scenario on `gpt-6.1-sol` (latency against the 30 s
extraction timeout under real load), a live background refresh (none was due),
and an owner look at the new badges on the portrait display.
