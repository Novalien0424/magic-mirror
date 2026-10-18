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
