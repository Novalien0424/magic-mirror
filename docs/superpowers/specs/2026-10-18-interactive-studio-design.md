# Interactive Studio — design, 2026-10-18

Owner request (2026-10-18): rename Portrait Studio to **Interactive Studio**
because the experience will change with the story and situation; make the
system prompt, questions, output and image-generation prompt tunable in detail;
give the Mirror an explicit switch between normal Conversation and Interactive
Studio; add a Stream Deck key that launches the Mirror in Interactive Studio
mode. Supersedes the 2026-10-17 per-avatar "Default mode after wake" ruling.

## Decisions

1. **Mirror mode is one Main-owned, persisted switch:** `conversation` or
   `studio`, stored in `userData/mirror-mode.json` (version 1; unreadable or
   missing → `conversation` with a metadata reason). It is global, not per
   avatar; studio content stays per avatar.
   - Dormant: the switch decides what the next wake does. `studio` wakes into
     the studio with its start script (the existing session-default path).
   - Active conversation → `studio`: Main starts the studio for the current
     visitor now (existing Console-start path). Active studio → `conversation`:
     Main closes it (`studio_operator_exit`) and the conversation continues.
   - Loop video: the switch is stored and applies after Return to Avatar.
   - The finished experience follows the avatar's **After the experience**
     setting (farewell and sleep, or keep chatting). A visitor who asks to stop
     (`studio_exit`) returns to conversation for that visit; the next wake
     starts the studio again while the switch is `studio`.
   - Effective `defaultMode` is derived from the switch in exactly two places:
     the session-start bundle (renderer greeting) and Main's studio
     `experience()` (session-default authorization). The saved per-avatar
     `defaultMode` field stays in the schema for compatibility and is ignored.
   - Visitors may still ask for the studio during Conversation mode when the
     avatar allows it (unchanged option, default on).
2. **Operator controls.** Console control bar: a two-option **Mirror mode**
   switch (Conversation | Interactive Studio) replaces the "Start Portrait
   Studio" button; "Back to conversation" stays only for a visitor-started run
   in Conversation mode. The status strip says when Interactive Studio mode is
   on. New operator action `studio`: Return to Avatar if needed (like `normal`),
   set the switch to `studio`, hide the Console. `normal` (START) sets
   `conversation`. PLAY LOOP leaves the switch unchanged.
3. **Stream Deck.** New key **INTERACTIVE STUDIO** at bottom-left `(0,1)`,
   amber, under START: same start/ready/TV-wake sequence as START with the
   `studio` operator command; success sound Glass, outcome `studio_ready`. New
   wrapper app `Studio Magic Mirror.app` → `deploy/macos/magic-mirror-studio.sh`.
   The regenerated profile must be imported by the owner (installer never edits
   Elgato's live files).
4. **Rename.** Every operator-facing string says Interactive Studio (Console,
   help, reason copy, docs going forward). Internal IDs stay (`portrait_studio`
   enum value, `studio_*` tools/telemetry, file and CSS names) to avoid config
   and telemetry migration. Visitor-facing defaults keep the tested portrait
   story; they are now all editable. The Avatars section "Experiences" becomes
   "Interactive Studio"; System → "Portrait images" becomes "Interactive Studio"
   (sign-in, image model, usage, test image).
5. **Everything visitor-facing is tunable per avatar; only edits are stored**
   (missing = versioned default, like the existing stage prompts), with reset
   to default and validation:
   - **System prompt:** the existing Studio instructions stage, plus the
     avatar's Persona. The app-added lines in `buildStudioPrompt` become neutral
     ("questions", conditional name line).
   - **Flow:** start script; new **Ask for a name first** (`askName`, default
     true). Off: the run starts at question 1, `studio_set_name` is not offered,
     nameplate/painted lettering is skipped.
   - **Questions:** zh/en text (existing) plus a per-question **Image prompt
     line** (`imageLine`, must contain `{{answer}}`); the image-part preset
     (existing `slot`) supplies its default.
   - **Image prompt:** editable `frame` (opening; `{{style}}` optional),
     `nameplate`, `painted` (`{{name}}` required), `revision` (`{{change}}`
     required); Art style, lettering, quality, changes and hold as now. A fixed,
     non-editable guard stays in the app: visitor text is quoted data, never
     instructions (prompt-injection boundary). Console shows a live preview of
     the assembled prompt with sample answers (same builder as Main, moved to
     shared).
   - **Avatar output at each stage:** existing 15 stage prompts plus `offer`
     (what the studio offers; fills the versioned tool catalog's
     `{{studioOffer}}` in the start tool's description and when-to-use rule),
     `busy` (visitor talks while painting) and `unavailable` (studio cannot
     start). Technical guidance (`wrongStep`, `identityPending`) stays versioned.
   - **Spoken failure lines** (zh/en): sign-in missing, plan limit, image
     refused, change failed, other.
   - **Mirror on-screen text** (zh/en): name label, read-back label and
     question, question counter (`{{index}}`, `{{count}}`), change prefix,
     change/done hints, final and photo hints, painting captions (1–6 lines).
     Main resolves the run language and sends the strings in `StudioView`; the
     Mirror renders only what it receives.
   - Image size stays fixed (1024×1536 portrait for the 9:16 glass) and the
     image model stays in versioned config (invariant 11).
6. **Studio tool catalog wording** becomes neutral ("picture", "studio") so a
   non-portrait story is not contradicted; tool names stay.

## Contracts

- Shared: `MirrorMode = 'conversation' | 'studio'`, carried on the existing
  Studio Console channel: command `{ action: 'mode', mode }` and
  `StudioConsoleStatus.mirrorMode` (polled like the studio status).
- Operator mailbox: `OperatorAction` adds `'studio'` (Main and
  `scripts/operator-command.mjs` lists match; tests pin parity).
- Button: `raven-button` and `mirror-tv-control` accept `studio`; queue, debounce
  and lease rules unchanged.
- Studio settings (all new fields optional): `askName?`, `imagePrompt?`,
  `screenText?`, `failureLines?`, question `imageLine?`; new stages
  `offer`, `busy`, `unavailable`; image instruction `untitled` (no name step).

## Invariants and limits

Invariants 1–3 and 6: names/answers/images stay RAM-only, studio turns are
control turns, no identity or memory use. 7: the Stream Deck/Console switch is an
operator control, not a spoken command. 9: every refused switch/start is a
metadata event with a reason. 10: studio failure never gates conversation. 11:
image model and defaults versioned. No new spoken routes, no new microphone
owner, no restart owner.

## Verification

Unit tests per contract (mode persistence and live application, operator action
parity, button/TV sequence, profile key, schema round-trip and defaults,
prompt builder with edits and guard, view text, editor validation, tool
overrides). Electron: `--console`, `--field-help`, `review_ui`, a mode-switch
QA case, live `portrait_studio` (real API) started through the switch. Owner:
import the Stream Deck profile and press the key.

## Fable audit (2026-10-18) and resolutions

- **Mode race (high):** the mode is captured once per session identity
  (`mirror-mode.ts` `sessionMode`) and read by both the session bundle and
  Main's wake start; a switch made while the session is still waking starts the
  studio like a live switch. The `studio` operator action sets the mode before
  returning to the avatar.
- **No name step (high):** runtime starts at question 1 and rejects
  `studio_set_name`; the tool is not offered; the view carries `askName`; the
  prompt builder uses a separate `untitled` instruction; the editor disables and
  dims the name question, guest list and lettering.
- **Back-compat (high):** new settings are optional; settings saved before them
  load unchanged; the renderer subset omits image, on-glass and failure text.
- **Rename collisions:** the System page is **Studio service**; QA drivers scope
  the Avatars tab and the control-bar button that share "Interactive Studio".
- **Catalog rule:** per-avatar tool-description overrides were cut in favour of
  the catalog's `{{studioOffer}}` variable (like `{{sleepPhrase}}`).
- **START semantics:** kept as Conversation (two explicit launch keys).
- Kept against the audit's "phase 2" suggestion: on-glass text and failure lines
  ship now because the owner asked for tunable output.

