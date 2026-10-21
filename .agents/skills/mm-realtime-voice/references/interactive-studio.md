# Interactive Studio visits

Visitor name → questions → picture → changes → photo hold. Internal IDs remain
`portrait_studio` / `studio_*`. Cubism rig authoring belongs to
[Avatar Studio](../../magic-mirror-avatar-studio/SKILL.md); Voice Studio is audio DSP.
[DECISIONS](../../../../DECISIONS.md) owns the 2026-10-17 through 2026-10-20
rulings; read the relevant section before older designs.

## Owners and sources

- Main: `src/main/studio/studio-runtime.ts` owns the run, steps, answers, RAM
  images, aborts and idle holds; `studio-ipc.ts` owns sender/session checks and
  startup. `src/main/mirror-mode.ts` persists Conversation / Studio and captures
  the greeting mode per session. A live mode change applies to the current visit.
- Renderer: `src/renderer/realtime/realtime-session-adapter.ts` swaps agents,
  tracks visitor turns, schedules speech and cleans studio history. The studio
  agent has studio tools plus sleep; no memory/media tools. It uses the session
  settings snapshot; inspect both sides when publishing during an active session.
- Editing: `src/renderer/console/ExperiencesEditor.tsx`; schema/defaults in
  `src/shared/portrait-studio{,-config}.ts`; image assembly in
  `src/shared/studio-image-prompt.ts`. Stage/system/image/screen/failure edits are
  per avatar. Prompt Inspector uses the shared builders. Model IDs, defaults and
  helper instructions remain versioned under `resources/config/`.
- Images: Main's `image-provider.ts` uses owner-run ChatGPT sign-in. Never read
  `.env.chatgpt`. Stickers are the default; full pictures and name font are
  configurable. `KeepsakeSink` is a future printing seam, not a working printer.

## Contracts to check

- A name needs a later visitor reply to its read-back; a correction needs a new
  read-back. No name/answer before visitor input. Model-requested finish/change
  needs visitor input after reveal. Check Main and adapter together, not just mocks.
- Async startup must respect the latest mode/exit and session. Queued speech
  belongs to its run; a reveal also belongs to its revision. First question
  follows the start script. Final-version description precedes automatic finish.
- A studio-mode visit ends with photo hold → studio farewell → Dormant;
  a visitor-requested studio in Conversation returns to conversation. Wake uses
  the studio phrase. Deprecated avatar `defaultMode` / `afterPortrait` settings
  do not override the Mirror switch or fixed studio-mode ending.
- Studio turns stay control turns even when results arrive after exit. Remove
  studio history on exit, including late items, failed transcriptions and ended
  tool calls; delete only server-listed items and preserve call/output pairing.
  Close aborts image work, clears RAM images and releases idle holds.
- Guest lists stay in Main; only shortlisted names reach the model. Names are
  captions, never identity confirmation. Image prompts quote visitor data behind
  the fixed `imagePrompt.guard`. Reveal/failure speech waits for idle; language follows the start script
  then visitor speech. A revision preamble suppresses the duplicate result reply.

## Focused evidence

Node checks: `tests/unit/{studio-runtime,studio-config-ipc,realtime-session-studio,
studio-image-provider,studio-tools,mirror-mode}.test.ts`, plus
`tests/renderer/console/experiences-editor.test.ts` and
`tests/renderer/mirror/portrait-studio-layer.test.ts` for UI changes.
Use [mm-ui-qa](../../mm-ui-qa/SKILL.md) for `--studio-journey` or live
`portrait_studio` story runs. Local checks do not establish live dialogue,
physical wake, microphone or printer acceptance.
