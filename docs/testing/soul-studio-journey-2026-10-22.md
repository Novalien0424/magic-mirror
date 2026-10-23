# Gate thirty-three — implementation and journey QA

Owner request: 2026-10-22. Branch: `field/macmini-deploy`.
The [complete visitor journey, implementation analysis, pause research and
pre-implementation self-review](../superpowers/specs/2026-10-22-soul-studio-journey.md)
were written before source implementation. This report does not promote a phase.

## Delivered behavior

Main owns the current visit step and a 30-second silence deadline, armed only
after the scripted question finishes actual processed playback. Visitor speech
cancels it. Name denial asks again; name/confirmation silence uses 無名之人.
Silent story questions store 未回答 in RAM, speak 不回答 也是一種回答, and advance.
Every answered question receives a short generated comment followed directly
by the next addressed question. The last comment precedes the painting cue.

Painting starts after the cue, permits conversation, and a ready image interrupts
that conversation. The visitor can accept or request a revision (one by default).
After the transfer cue finishes, Main invokes the deferred printer adapter once,
then Raven says the Studio farewell and returns to Dormant. The adapter performs
no physical printing and writes no spool file. Silence on the image-preference
question accepts the current image after its acknowledgement.

Authored `[pause=1s]` markers support 0.1–10 seconds per marker in fixed scripts.
The application waits for playback and the audio-processing tail before starting
the gap. Provider/network delay can make the gap longer. Voice → Delivery style
holds pronunciation examples and natural conversational pacing; exact pauses in
free conversation are not promised. Markers in visitor names remain literal data.

The live failures below demonstrated that prompts alone could still produce an
unrecorded spoken reply. The final routing requires a native tool decision during
name, confirmation, question and preference turns. A repeat-question tool records
no answer; painting and ordinary Conversation retain automatic tool selection.
Fixed application speech uses `tool_choice: none`. Exit restores ordinary routing.

## Operator journey

| Need | Control and verified behavior |
| --- | --- |
| Select an Avatar/capability | Avatars → Skills → Image generation; per-Avatar Save/reload/Publish and disabled-route enforcement. |
| Choose Studio | Mirror mode switch changes the dormant wake phrase; Conversation returns its normal phrase. |
| Edit opening | Avatars → Interactive Studio → Studio start script; pause syntax is visible and invalid durations receive field errors. |
| Name | Name question in Chinese/English and optional name step; disabling it disables related guest/name controls. |
| Change questions | 1–8 questions, up to 600 characters each; edit, add, reorder and remove. Removing the last question is disabled. |
| Shape the image | Each answer's image prompt line, art direction, picture format, name lettering, quality and revision allowance remain available. |
| Control comments | More settings → What the avatar says at each step → Comment on an answer. Legacy inactive stage and photo-hold controls are hidden. |
| Control farewell | Studio farewell; separate lines produce one-second pauses. The transfer phrase and printer seam are fixed for this scope. |
| Inspect/save | Prompt Inspector reflects actual scripts, comment instructions and fixed transition policy; Save → Publish → reload preserves edits. |
| Restore defaults | Restore default script and questions restores the Gate opening, name prompt, four questions, one revision and farewell. |

The rendered Console journey passed **20/20, exit 0**. It exercised the controls
above, altered the question count down to one, restored four, validated an invalid
pause, published custom text, reloaded it, and restored/published the default
script. Sixteen synthetic screenshots were captured. The default opening and
1024×768 layout were visually inspected: text fits, controls remain legible, the
publish bar remains available, and there is no horizontal overflow.

Command: `node scripts/run-phase4-qa.mjs --studio-journey`, wrapped in the task's
minimum-output-volume guard. Run ID: `2026-10-22T11-03-38-618Z`.

## Live verification and failures

Real Realtime ASR/dialogue, WebRTC, application tools/IPC and the image service
are used with synthetic visitor audio. No transcript or audio retention flag is
enabled. These tests do not prove a human microphone, acoustic pronunciation,
camera likeness or a physical printer.

| Run | Result |
| --- | --- |
| `2026-10-22T11-05-17-486Z`, `--studio-story soul` | Exit 2. Name denial/correction/confirmation and questions 1–3 passed. Question 4 failed `raven_qa_studio_studio_answer_missing`: final ASR exactly matched the synthetic answer, but the model emitted a spoken reply without the recording tool. No provider protocol errors. No image was generated. |
| `2026-10-22T11-11-57-061Z`, single retry | Exit 2. Replaced contradictory old “ask the question” guidance with explicit application-owned state. Name denial and second read-back occurred; the correction turn did not call `studio_set_name`. Failure: `raven_qa_studio_studio_set_name_missing`. No provider protocol errors. No image was generated. |
| `2026-10-22T11-18-39-672Z`, `--studio-story soul_silence` | **20/20, exit 0**, 267.464 seconds. Actual 30-second name and two question deadlines, exact unanswered acknowledgments, authored pause, real image generation, silent preference, deferred printer, exact farewell, Dormant and wake release passed. Zero provider errors; no transcripts retained. |

After both failures, routing was changed to require a tool decision for structured
steps, with a non-recording repeat path. Sixty focused tests passed, including
processed-playback ordering, interruption, timer ownership and tool registration.
A further full spoken visit requires the owner's exception to AGENTS.md's single
external retry limit; the exception was requested while independent QA continued.

The silence visit used two edited questions, including a one-second pause marker.
Its generated 1254×1254 PNG had transparent corners. The reveal screenshot was
visually inspected: the imaginary creature and 無名之人 nameplate are legible,
the choice prompts remain clear, and nothing is clipped. This is synthetic
visitor evidence, not an evaluation of a human's soul interpretation.

## Verification and restoration

Final verification passed:

- `npm run typecheck`: Node and renderer TypeScript checks, exit 0.
- `npm run build`: final production build, exit 0; `node scripts/qa-build.mjs
  --verify` confirms the canonical output matches the source, exit 0.
- The full `npm test` command, invoked through the volume guard as
  `node scripts/electron-owner.mjs tests node node_modules/vitest/vitest.mjs run`:
  **2,737 passed, two existing skips; 215 files passed, two skipped; exit 0**.
  Duration 98.07 seconds. A test-process MaxListenersExceededWarning and the
  existing large-bundle warning were non-fatal; neither was treated as a pass
  for acoustic or field acceptance.
- The focused routing suite passed 60 tests before the live silence run.

Earlier local check failures concerned old-flow expectations (automatic painting,
photo countdown, stage-prompt inspector and farewell formatting); those were
updated to the new contract. A QA-only missing `responseId` type was corrected.
The playback-ordering fixture was corrected to drain all observers of the same
processed tail rather than resolving only one observer.

Before stopping normal Electron, the real Console showed Raven, published v19,
“Up to date”, and zero changed areas. Normal Electron and QA never overlapped.
Audio guards capture/restore output volume and mute in `finally`, preserving
input gain. Initial state: output 0%, muted; input 57%. QA requests 1% and retains
mute. All five guards (UI, two spoken runs, silence and full suite) confirmed
exact restoration. This is provider playback evidence, not acoustic audibility.
The post-startup audio check later found output at 6%, unmuted; its cause was
not established. Final restoration explicitly returned output to 0%, muted,
with input still 57%. No audio preference service was modified.

Normal Electron was restored through the existing LaunchAgent after QA ended.
Fresh check at **19:29 Taipei**: Main PID 12259, LaunchAgent running. The real
Console's Restore default script and questions → Save → Publish workflow
published **v20**. A Console reload verified the requested Gate opening with
its one-second pause, name prompt, four exact default questions, one revision,
and 願你的靈魂順利穿越. The UI shows **Up to date · 0 changed areas**.
Raven remains asleep, wake listening active, in its original Conversation mode.
The Console is left on Interactive Studio. The real restored page was visually
inspected; authored text and the persistent save/publish controls are legible.
Unrelated Avatar, art, guest-list, voice and system settings were preserved.

## Remaining acceptance boundary

The complete spoken four-answer/revision journey has **not yet passed** after
the required-tool routing repair. The two failed samples above remain failures;
the successful silence journey and local tests do not replace that evidence.
Another full spoken run is pending the owner's requested exception to the
single-retry rule. Human microphone/acoustic pronunciation and the future
physical printer also remain untested. No phase promotion, commit or push is
claimed.

## Artifact cleanup

The four run IDs in this report are this task's only marked QA directories.
Their results, failures and requested visual findings are recorded above before
`qa-artifacts.mjs review`, dry-run `clean`, then `clean --delete`. The task-owned
`.artifacts/soul-studio-2026-10-22` scratch directory contains the completed
logs and temporary volume guard; it is removed after the marked runs. No
credentials, memories, operator assets or historical runs are part of cleanup.
Final cleanup completion is recorded in PROGRESS.md.
