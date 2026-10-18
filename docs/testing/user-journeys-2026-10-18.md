# User journeys — operator and visitor, 2026-10-18

The journeys the owner and visitors take through Magic Mirror after the
Interactive Studio delivery: what each person does, what they should see, and
how each step is verified. Console labels are quoted exactly. "Offline QA" is
`node scripts/run-phase4-qa.mjs --studio-journey` (real Console and IPC,
synthetic data, no model calls); "live QA" is the real-API `portrait_studio`
scenario; "unit" names the test file. Evidence: [delivery record](interactive-studio-2026-10-18.md).

## Where things are in the Console

| Need | Place |
| --- | --- |
| Conversation or Interactive Studio | Control bar › **Mirror mode** › **Conversation** / **Interactive Studio** (header shows **Interactive Studio mode** when on) |
| Start or end a visit by hand | Control bar › **Start Conversation** / **Disconnect** |
| Story content of an avatar | **Avatars** › choose avatar › **Interactive Studio** |
| ChatGPT sign-in, image model, test picture | **System** › **Studio service** (also the **Interactive Studio · ChatGPT** chip on **Mirror**) |
| Everything the models are told | **Avatars** › **Inspect prompt** › **Session** / **Tools & input** |
| Loop video | **Loop Video**, and **Return to Avatar** in the control bar while it plays |

## Operator journeys

### O1. Start a normal day (Conversation)

1. Press **START MIRROR** on the Stream Deck. The app starts if needed, Main
   sets the Mirror mode to Conversation, the Console hides and the TV wakes.
   Glass sound = ready.
2. Visitors wake the mirror with the wake phrase and talk normally (V1).

Verified: unit `mirror-tv-control`, `operator-control`, `operator-command`
(START sends `normal`; Main sets Conversation before returning to the avatar).
Physical key: owner check.

### O2. Run an event in Interactive Studio

1. Before the event, set up the story (O4) and publish it.
2. Press **INTERACTIVE STUDIO** (bottom-left, amber) on the Stream Deck. Same as
   START, but Main sets Interactive Studio. Glass sound = ready.
3. Each visitor wakes the mirror: the avatar speaks the **Studio start script**
   and the studio runs (V2). After the final picture it follows **After the
   experience**: **Say farewell and sleep** returns to Dormant for the next
   visitor (recommended for events); **Keep chatting** continues a normal
   conversation.
4. After the event press **START MIRROR** (back to Conversation) or **STOP**.
   The mode survives a crash restart; a fresh START always selects Conversation.

Verified: unit `studio-config-ipc` (a woken session in studio mode enters the
studio; the mode is captured per session), `realtime-session-start-bridge` (the
session greeting follows the captured mode), `mirror-mode` (persistence); live
QA `studio_mode_switch` (a new wake in Interactive Studio mode opens the studio).
Physical key and a full event day: owner check.

### O3. Switch modes from the Console

1. **Asleep**: press **Interactive Studio**. The button stays pressed, the header
   shows **Interactive Studio mode**, and the result line explains that every
   wake now starts the studio. Nothing wakes.
2. **During a conversation**: press **Interactive Studio** to start the studio
   for the visitor in front of the mirror now (the avatar speaks the start
   script); press **Conversation** to close a running studio and keep talking.
3. A visitor who asked for the studio in Conversation mode gets a separate
   **Back to conversation** button.
4. If the mode cannot be saved, the line says it was not changed. If ChatGPT is
   not signed in, the switch is saved but the studio cannot start: the visitor
   gets a normal conversation and Events records the reason.

Verified: offline QA `journey_mode_switch_dormant` (pressed state, header badge,
Main state, no wake); unit `studio-config-ipc` (live start/close, refused start
reason, save failure); live QA `studio_mode_switch` (start mid-conversation,
close); unit `boot-ipc` (Console bridge passes the mode command).

### O4. Set up or change a story (Console)

**Avatars** › choose the avatar › **Interactive Studio**. Every field has a
**?** help; edits are marked “edited”, and **Reset to default** restores the
tested wording. Only edits are stored.

1. **Experience**: **After the experience**; **Ask for a name first** (off for
   stories without a name: the name question, guest list and name lettering are
   disabled and dimmed); **Studio start script**; **Visitors may ask for the
   studio during conversation**.
2. **Questions** (1–8): each in Traditional Chinese and English, an **Image
   part** preset, and its **Image prompt line** (must keep `{{answer}}`).
3. **Picture**: **Art style**, **Name lettering**, **Quality**, **Changes
   allowed**, **Show final for**.
4. **Image prompt** (open it): **Opening instruction** (`{{style}}` inserts Art
   style), **Nameplate instruction**, **Painted name instruction**
   (`{{name}}`), **No-name instruction**, **Change instruction** (`{{change}}`).
   **Preview with sample answers** shows exactly what Main sends. The app always
   adds one fixed line that marks visitor text as data.
5. **Guest list** (only with a name step).
6. **Avatar prompts at each stage**: **Studio instructions** (the studio's
   system prompt, after the avatar's Persona), **What the studio offers**
   (completes “It offers …” for visitor requests; include example requests), and
   what the avatar is told at each moment of a visit.
7. **Text on the mirror**: every on-glass label, hint and painting caption, in
   both languages.
8. **Spoken failure lines**: what the avatar says when a picture cannot be made.
9. Problems show under the field and in “fields need attention before saving”.
10. **Save all changes** → “Saved and checked. Ready to publish.” → **Publish all
    changes** → **Confirm publish**. The next visit uses it.
11. Check with **Inspect prompt** (Session shows the studio system prompt and
    both image prompts; Tools & input shows the offer), then **System** ›
    **Studio service** › **Generate test picture** (published settings, sample
    answers, never shown on the Mirror or saved).
12. Switch the Mirror mode (O3) and try it.

Verified: offline QA steps `journey_studio_section` through
`journey_save_publish` (edit, preview, validation, name step off, on-glass text,
failure line, offer, inspector, publish and the published config) and
`journey_narrow_layout` (1024×768, no sideways scroll, every control described);
unit `experiences-editor`, `studio-guest-names` (prompt builder), `portrait-studio`
schema via `config-service`. Test picture: not run in QA (uses the plan quota).

### O5. Keep ChatGPT signed in

1. **Mirror** shows **Interactive Studio · ChatGPT** with **Signed in** or **Not
   signed in**; **System** › **Studio service** shows the same with the last
   refresh, image model and **Manage usage**.
2. Main refreshes the sign-in in the background every 30 minutes when it is
   due, so an idle mirror stays signed in. **Sign-in refresh failed** means the
   app keeps retrying; if it stays, sign in again.
3. To sign in: run `npm run chatgpt:login` in Terminal on this Mac, then press
   **Refresh status**.

Verified: unit `chatgpt-auth` (background refresh and lock), `studio-config-ipc`
(schedule), `experiences-editor` (badge text); offline QA overview and Studio
service steps. A live background refresh: not yet due.

### O6. Loop video and back

1. **PLAY LOOP** (Stream Deck) or **Loop Video** › Play: the control bar shows
   only **Return to Avatar**; the Mirror mode switch is hidden.
2. **Return to Avatar** (or START / INTERACTIVE STUDIO) brings the avatar back;
   the stored Mirror mode applies to the next wake. START and INTERACTIVE STUDIO
   also set their mode.

Verified: offline QA `--operator-loop` (unchanged); unit `mirror-tv-control`
(LOOP keeps the mode).

### O7. End of day

**STOP**: TV standby, then the whole app stops and stays stopped. The Mirror
mode is kept; the next START selects Conversation, INTERACTIVE STUDIO selects
the studio.

## Visitor journeys

### V1. Conversation mode
Wake phrase → wake greeting → conversation (memory, media, spells as
configured) → sleep phrase or idle → Dormant (black glass).

### V2. Interactive Studio mode (default story: a portrait)
1. Wake phrase → the avatar speaks the Studio start script.
2. With a name step: name question card → the visitor answers → the avatar reads
   the name back (gold nameplate, “Is that right?”) → confirm or correct.
3. Questions in order, with a counter and the visitor's earlier answers as chips.
4. Painting: the avatar says it starts; rotating captions and an ink animation.
5. Reveal: the picture with the name banner; the avatar describes what it sees;
   hints for a change and for done.
6. A change repaints with only that change; then the final picture.
7. Final: photo hint and countdown, then farewell and Dormant, or a normal
   conversation, as configured.

Verified: live QA (`portrait_studio`: every phase, reveal with the image
attached, one change, keepsake, history cleanup); unit `portrait-studio-layer`
(on-glass text from Main, no-name feathers). Human visit at the mirror: owner
check.

### V3. Asking for the studio in Conversation mode
“幫我畫一張畫像” (or what **What the studio offers** describes) → the studio opens
at its first question → after the final picture, back to conversation.
Verified: live QA `studio_request`.

### V4. Leaving the studio early
“我不想畫了，聊聊就好” → the studio closes and the picture is cleared → normal
conversation for this visit; in Interactive Studio mode the next wake starts the
studio again. Verified: unit `studio-runtime`, `realtime-session-studio`.

### V5. A picture cannot be made
Sign-in missing, plan limit, safety refusal or another failure → the avatar
speaks the matching **Spoken failure line** and the conversation continues; a
failed change keeps the earlier picture for photos. Verified: unit
`studio-runtime` (edited failure line).

## Not yet verified end to end

Physical Stream Deck INTERACTIVE STUDIO key (after importing the regenerated
profile), a human studio visit through the Jabra microphone, a full event day in
Interactive Studio mode, and a live background ChatGPT refresh.
