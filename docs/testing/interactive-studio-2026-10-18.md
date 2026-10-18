# Interactive Studio, Mirror mode switch and Stream Deck key — 2026-10-18

Owner request: rename Portrait Studio to Interactive Studio (flexible by story
and situation); make the system prompt, questions, output and image-generation
prompt tunable in detail; give the Mirror an explicit switch between normal
Conversation and Interactive Studio; add a Stream Deck key that launches the
Mirror in Interactive Studio. Ruling: DECISIONS 2026-10-18. Design and Fable
audit: [design](../superpowers/specs/2026-10-18-interactive-studio-design.md).
Journeys: [user journeys](user-journeys-2026-10-18.md). Evidence is metadata
only; generated pictures were viewed locally and are not retained here.

## What changed

- **Mirror mode** (`src/main/mirror-mode.ts`, `userData/mirror-mode.json`):
  Conversation or Interactive Studio, captured once per session for both the
  session greeting (`boot.ts` session bundle) and Main's wake start
  (`studio-ipc.ts`). Live switches start or close the studio for the current
  visitor; a switch while the session is still waking starts it like a live
  switch. Operator actions: `normal` (START) selects Conversation, new
  `studio` selects Interactive Studio, set before returning to the avatar.
- **Console**: control bar **Mirror mode** (Conversation | Interactive Studio)
  replaces Start Portrait Studio; header badge **Interactive Studio mode**;
  Avatars section and System page renamed (**Interactive Studio**, **Studio
  service**); the editor gains the name-step toggle, per-question image prompt
  lines, an **Image prompt** editor with live preview, **Text on the mirror**
  and **Spoken failure lines**; the old Default mode select is gone. The
  Prompt inspector shows both image prompts.
- **Prompts**: stage `offer` fills the tool catalog's `{{studioOffer}}`; studio
  tool wording is neutral ("picture", "studio"); `busy`/`unavailable` are
  editable; image prompt `frame`/`nameplate`/`painted`/`untitled`/`revision`
  editable around a fixed guard line; the Mirror renders on-glass text supplied
  by Main.
- **Stream Deck**: INTERACTIVE STUDIO at bottom-left (`0,1`), amber, wrapper
  `Studio Magic Mirror.app` → `deploy/macos/magic-mirror-studio.sh`; built by an
  Opus worker and reviewed. Installer run on this Mac; profile regenerated at
  `~/Applications/Magic Mirror Controls/Magic Mirror.streamDeckProfile` (five
  keys verified, icon rendered). **Import is the owner's step.**

## Defects found and fixed during QA

| Found by | Defect | Fix |
| --- | --- | --- |
| Offline journey QA | The Console preload rejected the new `mode` command, so the switch never reached Main (unit tests bypass the preload) | Preload filter accepts `{ action: 'mode', mode }`; regression test in `boot-ipc` |
| Screenshot review | A trailing full stop in Art style doubled ("light..") in every image prompt | Builder strips the style's final full stop |
| Screenshot review | The guard said answers "below" while the change prompt quotes before it | Position-neutral guard wording |
| Screenshot review | Disabled name fields looked editable; Reset misaligned under an error; "Any running studio closed" when none ran | Dimmed off-state, aligned Reset, clearer mode messages |
| Live QA run 1 | Right after the reveal the model called `studio_exit`, discarding the picture; the change was then impossible | Exit/finish catalog wording made unambiguous (exit only when the visitor asks to stop, never to end a finished studio); live rerun passed |

## Results

Stamped build (`qa-build --verify` pass); artifacts
`.artifacts/phase4-qa/2026-10-18T<time>`; sound-producing runs at 1 % output
(69 % unmuted captured and restored; input gain unchanged).

| Check | Result |
| --- | --- |
| Typechecks (node, web) | pass |
| `npm test` (includes Electron smoke) | pass, 91 s |
| New `--studio-journey` (13 steps, 11 screenshots reviewed) | pass — `05-21-11-596Z` |
| `--field-help`, `--console`, `--profiles`, `--editor`, `--operator-loop` | pass |
| `review_ui` | pass |
| Live `portrait_studio` run 1 | **failed** at `studio_change` (`studio_exit` called at reveal) — `05-24-16-385Z` |
| Live `portrait_studio` run 2 (after the wording fix) | pass, 16 steps — `05-28-41-969Z` |

Run 2 metadata: phases name → confirm → 4 questions → painting → reveal →
revising → reveal → keepsake → closed; then `studio_started_mode` (switch
mid-conversation), `studio_started_session_default` (fresh wake in
Interactive Studio mode), `studio_operator_exit` (switch back); paint 25.4 s,
change 25.4 s; 2 reveals with the image attached; 0 provider errors. The soft
check that the edited Painting starts prompt was followed was false this run
(true on 10-17); it is not a gate.

Production app restarted on the new build at 13:35 Taipei; Mirror mode
Conversation (no saved mode yet).

## Not covered

Physical INTERACTIVE STUDIO key (after the profile import), a human visit
through the Jabra microphone, a full event day in Interactive Studio mode, a
test picture from the Studio service page (uses plan quota), and a story with
the name step off on the real provider (offline and unit tested only).

## Owner flow follow-up (same day)

Owner request: a separate, UI-settable studio wake word; the visit runs name →
questions → picture (printing later) → studio farewell → Dormant; defaults
「招喚渡鴉使者」 and 「願你找到你所追尋 / 再會 / 人類」 with ~1 s pauses; the system
prompt (character), all questions and replies fully editable; an audited, easy,
robust UI without over-engineering. Ruling: DECISIONS 2026-10-18 "Interactive
Studio visit flow".

- **Wake phrase**: `studio.wakePhrase`; Main's wake config returns it in
  Interactive Studio mode and each switch reloads the listener. 「招喚渡鴉使者」
  compiles with the package tokens (招 → zh āo; 召喚 would be zh ào).
- **Ending**: studio-mode runs end keepsake → studio farewell → Dormant; the
  farewell is one verbatim cue with a sentence end and an ellipsis per line
  break. Visitor-requested runs in Conversation mode return to conversation.
- **Character**: `studio.character` replaces Persona › Personality in the studio
  system prompt only. **Printing**: `KeepsakeSink` documented as the printer seam
  and plumbed through `registerStudioIpc({ keepsakeSinks })`.
- **Editor** reordered by visit (1 · Start, 2 · Character, 3 · Name and
  questions, 4 · Picture, 5 · Ending, More settings); reset buttons for wake
  phrase, character, rules and farewell.
- **Fable UX audit** (screenshots + code): fixed two "system prompt" labels,
  missing wake phrase/farewell resets, the "Goodbye" step that collided with the
  farewell (now "Hand over the picture"), dead help text and stale journey copy;
  moved the Conversation-mode offer to the end of the step list and renamed
  section 3. A bug found by tests: clearing a field left an `undefined` key
  that strict validation would reject; cleared fields now drop the key.

| Check | Result |
| --- | --- |
| Typechecks, focused suites | pass |
| `npm test` (includes Electron smoke) | pass, 91 s |
| `--studio-journey` (14 steps; the real wake listener reloads to 「招喚渡鴉使者」 and back) | pass — after the audit fixes `06-27-15-088Z` |
| `--field-help`, `--console` (after the audit fixes); `--profiles`, `--editor`, `--operator-loop`, `review_ui` | pass |
| Live `portrait_studio`, owner flow (17 steps) | pass — `06-21-02-497Z`: mode on → wake entry (`studio_started_session_default`) → name → 4 answers → painting 23.5 s → reveal → change 23.6 s → keepsake → `sleep_farewell_completed` → Dormant → Conversation-mode visitor request opens the studio; 0 provider errors |

One live run only (no repeats). Sound: the quiet wrapper captures and restores
the default output device, but during Electron runs the default flips between the
TV output and the Jabra, so one restore landed on the other device and left the
Jabra at 1 %; it was set back to its pre-QA 6 % (input gain unchanged). TODO
records pinning the wrapper to one device.

Not covered: saying 「招喚渡鴉使者」 at the mirror (synthetic audio cannot reach
the physical microphone; the listener reload is verified), a physical INTERACTIVE
STUDIO press, a human visit and the exact pause length of the farewell.
