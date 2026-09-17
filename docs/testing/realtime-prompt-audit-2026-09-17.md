# Realtime prompt sources and inspection — 2026-09-17

The subsequent [structured-tool migration](realtime-tool-architecture-2026-09-17.md)
moved tool schemas, rules and results into `realtime-tools.v1.json`. The inventory
and validation below describe the earlier audit build.

## Outcome

Application-owned model wording is loaded from the versioned
`resources/config/prompts/realtime.v1.json` catalog and operator configuration.
The catalog is imported at build time, checked for nonempty values and exact
template variables, and frozen. Changing it requires rebuild/restart; it is not
a hot-loaded file. Runtime code still owns protocol fields, tool identifiers,
validation, cancellation and playback authorization.

The avatar workspace has a compact **Effective realtime prompt & tool** launcher
above the selected editor. Session, Speech, Tools & input, Audition and Sources
each open a separate native window. Each window also has category tabs and an
editor-draft/published selector. It captures public configuration when opened;
reopening from Console refreshes it. Existing conversations retain their own
earlier settings. This is explicitly not an active-session wire log.

The inspector uses the same public-avatar projection and prompt builders as
production dispatch. It renders text through React, never HTML from prompts.
Only five named `about:blank` windows are allowed from Console; their sandbox
and isolation are inherited. Child navigation/popups are blocked, and their
unregistered senders cannot invoke privileged Console IPC. Windows close with
their owner. No visitor content, private context or credentials are collected.

## Audit inventory

| Model-facing surface | Source | Inspector |
|---|---|---|
| Character/system instructions | catalog `session` + selected avatar name/personality/style/sleep phrase | Session |
| Sleep tool description | catalog `sleepTool` + selected sleep phrase | Tools & input |
| Accepted/ignored tool results | catalog `toolResults` | Tools & input |
| Wake greeting, farewell, scene dialogue, spell announcement | catalog `performance` + configured spoken text; announcement in catalog | Speech |
| Audition system instructions and utterance | catalog `audition`, `auditionText`, `performance` + style | Audition |
| Transcription hints | catalog language/delay defaults + configured wake/sleep/enabled spell phrases | Tools & input |
| Default persona, style, spoken lines, command phrases | catalog `defaults`, `commandDefaults` | Sources |
| New-avatar defaults, scene-dialogue seed, delivery presets | catalog `authoring` | Sources |
| Visitor user messages | live microphone input; no application-generated imperative user turn | Tools & input explains routing; no transcript capture |

Audited production constructors and `instructions`, `sendMessage`,
`speakVerbatim`, `input_text`, persona/style/utterance assignments across `src`.
No additional production Responses/extractor prompt dispatch exists in this
checkout. QA synthetic text and documentation examples are fixtures, not hidden
production prompts. SDK/API/provider internals are outside application control;
provider-internal instructions cannot be displayed. Configured scene dialogue
lists include library actions; listing an action does not make a scene execute it.

## Greeting scope correction

Previously greeting and scene requests inserted an imperative performance cue
as a persistent user message, followed by `response.create`. That left a
“say only this text” instruction in history on subsequent turns. They now use
the shared `buildSpeechResponse`: response-specific `instructions`, empty
`input`, and `tool_choice: 'none'`. Farewell and audition use the same builder.
The obsolete performance-cue exception was removed from the session prompt.
No speech-filtering regex was added; template-marker substitution does not
parse or rewrite visitor language.

## Current official guidance, checked September 17, 2026

OpenAI's current [prompt-engineering guide](https://developers.openai.com/api/docs/guides/prompt-engineering)
recommends keeping production prompts versioned with the application, typed
builders, review, tests and normal deployment. It provides examples loading
prompt text from files. It also says reusable API prompt objects are being
deprecated. Our repository-owned JSON plus shared builders follows this
guidance; JSON rather than text files is a local organizational choice, not
an API requirement.

The [Realtime conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
documents response-specific instructions and empty response input to generate
without other conversational context. This supports scoping one-time speech
instead of leaving an imperative user message in history. The inspector is an
operator audit feature, not an OpenAI requirement or a guarantee of model
compliance. [Electron's window documentation](https://www.electronjs.org/docs/latest/api/window-open)
supports same-origin child-window rendering and describes inherited sandbox
preferences and Main-controlled opening policy.

## Windows evidence and limits

- Focused `npx vitest run` over prompt-inspection, realtime-session-adapter,
  realtime-privacy-cleanup, avatar-prompt, avatar-commands, spell-announcement,
  profile-workspace, boot-ipc and console-ipc: exit **0**, **140 tests passed**.
  The changed response-history test failed before implementation as expected.
- `npm run typecheck:web`: exit **0**. `npm run build`: exit **0**.
- `npm run typecheck:node`: exit **1**, only pre-existing TS7016 at
  `tests/unit/qa-artifacts.test.ts:6` for `scripts/qa-artifacts.mjs` remains.
- `git -c core.safecrlf=false diff --check`: exit **0**.
- Initial QA `.artifacts/phase4-qa/2026-09-17T02-08-40-271Z` was stopped after
  a task-caused preload failure. Zod was incorrectly imported into a sandboxed
  preload; replaced it with dependency-free static-catalog validation. Subsequent
  builds started Main, Mirror and Console successfully.
- `npm run test:phase4:qa:lifecycle-live`, run
  `.artifacts/phase4-qa/2026-09-17T02-11-32-696Z`: exit **1** (runner reports
  Electron exit **2**). Five native window checks plus tabs/published selection
  passed. Screenshots 0–4 are under `screenshots/`; Session/Speech were visually
  inspected for readable wrapping and navigation. Host and Raven both delivered
  exact greetings and answered an ordinary arithmetic question without repeating
  the greeting. Host farewell passed. Raven generated speech before announcing
  the sleep tool; pre-farewell output peak **0.528581** failed the **0.001** limit,
  then its exact farewell completed.
- One bounded retry, `.artifacts/phase4-qa/2026-09-17T02-13-03-530Z`: same
  five windows and tab/published checks passed. Host greeting, follow-up and exact
  farewell comparisons passed, but pre-farewell output peak **0.003754** failed
  the silence limit. No extra transcript was classified in this retry; residual
  output versus event-order timing is not resolved by these metadata alone.
  No further provider retry was performed.

**Sleep silence remains unresolved.** A prompt can request a silent tool call,
but it cannot enforce silence before the application sees the tool. The live
suite is not claimed green. Preserve these failures for a bounded output/intent
ownership investigation; do not weaken the threshold or add transcript regex
filters. Real microphone recognition and physical speaker/echo acceptance are
separate from synthetic-text provider and processed-audio analyser evidence.

## Operator state

Before restart the normal Console showed published **v20** and an unsaved Raven
edit. **Save all changes** succeeded: “Saved and checked. Ready to publish.”
The draft was not published. Normal canonical `npm run dev` was restarted after
isolated QA. Existing V11 assets and prior fixes remain preserved.
Normal runtime session **25418** reported Main/Mirror/Console ready at
`http://localhost:5173/`; direct Console observation confirmed Raven, published
v20 and “Awaiting publish.” The new Session window displayed the saved Raven
draft. Screenshot: `.artifacts/realtime-prompt-audit-2026-09-17/raven-session.png`.
