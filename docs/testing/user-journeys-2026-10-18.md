# User journeys — operator and visitor, 2026-10-18

The journeys the owner and visitors take through Magic Mirror after the
Interactive Studio deliveries: what each person does, what they should see, and
how each step is verified. Console labels are quoted exactly. "Offline QA" is
`node scripts/run-phase4-qa.mjs --studio-journey` (real Console, IPC and wake
listener, synthetic data, no model calls); "live QA" is the real-API
`portrait_studio` scenario; "unit" names the test file. Evidence:
[delivery record](interactive-studio-2026-10-18.md).

## Where things are in the Console

| Need | Place |
| --- | --- |
| Conversation or Interactive Studio | Control bar › **Mirror mode** › **Conversation** / **Interactive Studio** (header shows **Interactive Studio mode** and “Listening for 「studio wake phrase」”) |
| Start or end a visit by hand | Control bar › **Start Conversation** / **Disconnect** |
| The studio story of an avatar | **Avatars** › choose avatar › **Interactive Studio** |
| ChatGPT sign-in, image model, test picture | **System** › **Studio service** (also the **Interactive Studio · ChatGPT** chip on **Mirror**) |
| Everything the models are told | **Avatars** › **Inspect prompt** › **Session** / **Tools & input** |
| Loop video | **Loop Video**, and **Return to Avatar** in the control bar while it plays |

## Operator journeys

### O1. A normal day (Conversation)

1. Press **START MIRROR** on the Stream Deck: the app starts if needed, Mirror
   mode becomes Conversation, the Console hides and the TV wakes (Glass sound).
2. Visitors wake the mirror with the Persona wake phrase (「魔鏡阿魔鏡」) and talk (V1).

Verified: unit `mirror-tv-control`, `operator-control`, `operator-command`.
Physical key: owner check.

### O2. An event in Interactive Studio

1. Before the event: set up the story (O4) and publish it.
2. Press **INTERACTIVE STUDIO** (bottom-left, amber). Mirror mode becomes
   Interactive Studio; the mirror now listens for the **Studio wake phrase**
   (default 「招喚渡鴉使者」) instead of the Persona phrase.
3. Each visitor says the studio wake phrase: the avatar appears, speaks the
   **Studio start script**, asks the name, the questions, paints, reveals,
   offers a change, shows the final picture for photos, says the **Studio
   farewell** (「願你找到你所追尋 … 再會 … 人類」) and returns to Dormant for the
   next visitor (V2).
4. After the event press **START MIRROR** (back to Conversation) or **STOP**.
   The mode survives a crash restart; START always selects Conversation.

Verified: offline QA `journey_mode_switch_dormant` (the real wake listener
reloads to 「招喚渡鴉使者」 and back); unit `boot-runtime` (studio wake phrase in
Interactive Studio mode), `studio-runtime` (studio-mode runs end with the
farewell), `realtime-session-studio` (the studio farewell text), `studio-config-ipc`
(wake start captured per session); live QA `studio_wake_entry` →
`studio_farewell_dormant`. Saying the phrase at the mirror and the physical key:
owner check.

### O3. Switch modes from the Console

1. **Asleep**: press **Interactive Studio**. It stays pressed, the header shows
   **Interactive Studio mode** and “Listening for 「招喚渡鴉使者」”; the result line
   says the mirror now wakes to the studio wake phrase. Nothing wakes.
2. **During a conversation**: **Interactive Studio** starts the studio for the
   visitor in front of the mirror now; **Conversation** closes a running studio
   and the conversation continues.
3. A visitor who asked for the studio in Conversation mode gets **Back to
   conversation**.
4. If the mode cannot be saved, the line says it was not changed. If ChatGPT is
   not signed in, the studio cannot start: the visitor gets a normal
   conversation and Events records the reason. A wake phrase the wake model
   cannot encode shows as a wake warning on **Mirror**.

Verified: offline QA `journey_mode_switch_dormant`; unit `studio-config-ipc`,
`boot-ipc` (Console bridge passes the mode command).

### O4. Set up or change the studio story (Console)

**Avatars** › choose the avatar › **Interactive Studio**. Sections follow the
visit. Every field has a **?** help; edits are marked “edited”; reset buttons
restore the tested default. Only edits are stored.

1. **1 · Start** — **Studio wake phrase** (what visitors say) and **Studio
   start script** (the first thing the avatar says).
2. **2 · Character** — **Studio character (system prompt)**: who the avatar is
   during the studio; it starts from Persona › Personality and **Use the Persona
   personality** goes back. **Studio rules**: how the avatar runs the studio.
3. **3 · Questions** — **Ask for a name first** (off for stories without a name;
   name fields, guest list and lettering are then disabled and dimmed), the name
   question, and 1–8 questions in Traditional Chinese and English, each with an
   **Image part** preset and its **Image prompt line** (must keep `{{answer}}`).
4. **4 · Picture** — **Art style**, **Name lettering**, **Quality**, **Changes
   allowed**, **Show final for**, and **Image prompt** (opening, nameplate,
   painted name, no-name and change instructions) with **Preview with sample
   answers** showing exactly what Main sends. One fixed line marks visitor text
   as data.
5. **5 · Ending** — **Studio farewell**, one phrase per line (about a second's
   pause between lines); then Dormant. A printer can be added later.
6. **More settings** — **What the avatar says at each step** (the reply for each
   moment of a visit, including **What the studio offers** for Conversation-mode
   requests), **Text on the mirror**, **Spoken failure lines**, **Guest list** and
   **In Conversation mode** (whether visitors may ask for the studio).
7. Problems show under the field and in “fields need attention before saving”.
8. **Save all changes** → “Saved and checked. Ready to publish.” → **Publish all
   changes** → **Confirm publish**. The next visit uses it.
9. Check with **Inspect prompt** (Session: the studio system prompt with the
   character and both image prompts; Tools & input: the offer), then **System** ›
   **Studio service** › **Generate test picture**, then switch the Mirror mode
   (O3) and try it.

Verified: offline QA `journey_studio_section` through `journey_save_publish`
(sections, wake phrase default, character and farewell edits, questions and
lines, image preview, validation, name step off, mirror text, failure line,
offer, inspector, publish and the published config) and `journey_narrow_layout`
(1024×768, no sideways scroll, every control described); unit
`experiences-editor`, `avatar-prompt` (character), `studio-guest-names`
(prompt builder). Test picture: not run in QA (uses plan quota).

### O5. Keep ChatGPT signed in

**Mirror** shows **Interactive Studio · ChatGPT** with **Signed in** or **Not
signed in**; **System** › **Studio service** shows the same with the last
refresh, image model and **Manage usage**. Main refreshes the sign-in every 30
minutes when due. To sign in: `npm run chatgpt:login` in Terminal, then
**Refresh status**. Verified: unit `chatgpt-auth`, `studio-config-ipc`; offline QA.

### O6. Loop video and back

**PLAY LOOP** or **Loop Video** › Play hides the Mirror mode switch (only **Return
to Avatar**); the stored mode, and its wake phrase, apply after returning.
Verified: offline QA `--operator-loop`; unit `mirror-tv-control`.

### O7. End of day

**STOP**: TV standby, then the app stops. The mode is kept; START selects
Conversation, INTERACTIVE STUDIO selects the studio.

## Visitor journeys

### V1. Conversation mode
Persona wake phrase → wake greeting → conversation → sleep phrase or idle →
Dormant (black glass).

### V2. Interactive Studio mode
1. 「招喚渡鴉使者」 → the avatar appears and speaks the Studio start script.
2. Name card → the visitor answers → the avatar reads the name back → confirm or
   correct (skipped when the name step is off).
3. Questions in order with a counter and earlier answers as chips.
4. Painting: captions and an ink animation.
5. Reveal with the name banner; the avatar describes it; hints for a change or done.
6. A change repaints with only that change; then the final picture.
7. Photo hint and countdown → Studio farewell with pauses → Dormant.

Verified: live QA (every phase, reveal with the image attached, one change,
keepsake, farewell completion and Dormant); unit `portrait-studio-layer`.
Human visit: owner check.

### V3. Asking for the studio in Conversation mode
「可以幫我畫一張畫像嗎？」 (or what **What the studio offers** describes) → the studio
opens at its first question → after the final picture, back to conversation.
Verified: live QA `studio_conversation_request`.

### V4. Leaving the studio early
「我不想畫了，聊聊就好」 → the studio closes, the picture is cleared, the visit
continues as a conversation and later sleeps as usual; the next wake in
Interactive Studio mode starts the studio again. Verified: unit `studio-runtime`,
`realtime-session-studio`.

### V5. A picture cannot be made
Sign-in missing, plan limit, safety refusal or another failure → the avatar
speaks the matching **Spoken failure line**; a failed change keeps the earlier
picture for photos. Verified: unit `studio-runtime`.

## Not yet verified end to end

Saying 「招喚渡鴉使者」 at the mirror (synthetic tests cannot reach the physical
microphone; the listener reload is verified), a physical INTERACTIVE STUDIO
press, a human studio visit through the Jabra microphone, and a full event day.
