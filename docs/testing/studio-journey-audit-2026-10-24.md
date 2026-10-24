# Interactive Studio journey audit — 2026-10-24

## Scope and verdict

The owner reported an endless name loop and requested an audit of the whole
journey. This is an inspection and QA delivery, **not a production repair**.
Baseline: `f3957b02900e07ec65efbe6ac2a18358c9ce77d3`, canonical Mac checkout,
branch `field/macmini-deploy`. Production source and published settings are
unchanged. The normal application was already stopped by the owner's STOP
action at 10:38:15 Taipei and must remain stopped after isolated QA.

The field failure is real. A successful synthetic provider visit cannot clear
it. The audit identifies two application recovery defects, missing operator
recovery controls, and incomplete regression coverage. Human microphone
acceptance remains open.

## Field incident: 10:35–10:38 Taipei

Source: the production `telemetry/telemetry-0.jsonl` and button metadata, read
without retrieving or retaining conversation text/audio. This window contains:

- One Studio start and eight listening-deadline starts.
- Seven final transcription events and three accepted name submissions.
- **Zero `studio_name_confirmed` events and zero recorded story answers.**
- Five rejected `studio_answer` calls, three accepted repeat calls, one name
  denial, and three `studio_speech_forced` watchdog events.
- Two microphone recoveries during camera trouble in the opening. Later speech
  reached the conversation, so complete microphone loss does not explain the
  subsequent confirmation loop.
- Owner STOP completed with black HDMI coverage and the Jabra output reset.

The first wrong story-answer call was at 10:36:22, after the first name read-back.
The loop persisted until STOP. The logs prove the wrong-tool/confirmation-state
mismatch. They do **not** reveal the owner's spoken words, whether a particular
name was correctly transcribed, or why the model selected that tool.

## Findings, in repair order

### P1 — A rejected tool can feed a name-confirmation loop

`studioToolSpecs` exposes all Studio tools throughout the visit. In
`queueStudioStep`, name/confirmation/question/reveal select `tool_choice:
required`, without restricting the tools to the current phase. Main correctly
rejects `studio_answer` during confirmation. However, the binding returns a
normal response-producing result for that rejection, allowing another model
response and another wrong call. The field log includes exactly this pattern.

`studio_repeat_question` is also absent from the fresh-visitor-input guard used
for `set_name`, `reject_name`, `answer`, `revise`, `finish` and language changes.
An isolated adapter/Main fault probe **confirmed that repeat is accepted with
no visitor input at all**, after the opening finishes. Repetition creates a new
step and cancels/restarts its deadline. Thus the 30-second *silence* fallback
does not bound a repeated dialogue loop. Repeated unconfirmed names deliberately
remain unconfirmed; silently accepting a wrong name is not an acceptable fix.

Repair direction: phase-appropriate tool exposure, one visitor-turn receipt for
every repeat/mutation, and bounded application-owned recovery from a wrong-step
result. Retain fresh verbal confirmation of the actual read-back name. Do not
use substring speech filters or automatically confirm after N attempts.

Sources: `src/shared/avatar-prompt.ts` (`studioToolSpecs`),
`src/renderer/realtime/realtime-session-adapter.ts` (`studioTool`,
`studio_repeat_question`, `queueStudioStep`),
`src/renderer/realtime/realtime-tool-bindings.ts` (`responds`),
`src/main/studio/studio-runtime.ts` (`repeat`, `answer`, `armSilence`).

### P1 — Failed application speech can strand a step

An isolated fault probe rejected the opening's `response.create` with a provider
error. The speech callback returned false; `perform` exited before installing
`studioListeningStep` or sending `step_ready`. A subsequent visitor name was
rejected as `studio_visitor_reply_missing`, while Main remained in the name
phase with no silence deadline. The microphone could be enabled while the
application was unable to accept the answer. Similar early returns exist for
question/transition cues. This is **a reproduced fault path**, not a claim that
it caused today's field incident.

Repair direction: one bounded cue retry, then a visible/metadata-reported safe
exit or explicit recovery; never leave the visitor in an unarmed step or advance
a question that was not delivered. Include processed-playback failures as well
as provider rejection in regression coverage.

Source: `src/renderer/realtime/realtime-session-adapter.ts`
(`queueSpeechResponse`, `releaseFinishedCues`, `queueStudioStep`).

### P2 — The operator cannot rescue the current name step

The Console shows the phase and can change mode or end a visitor-requested
Studio. Name-list changes apply to the next visit. There is no current-visit
control to retry name capture, select a corrected caption for verbal read-back,
or deliberately continue with the anonymous fallback. The practical escape is
to abandon the visit through Conversation/Stop and start again.

Repair direction: a small, explicit name-step recovery control, keeping verbal
confirmation and private-memory identity separate. The Console also needs a
clear failed/retrying status. Current telemetry records a generic rejected tool
but not its Main reason/phase; add metadata-only phase, result code and attempt
counts, never name or transcript values.

Sources: `src/renderer/console/StudioStatusPanel.tsx` (`StudioLiveControls`),
`src/shared/portrait-studio.ts` (`StudioConsoleCommand`), tool invocation metadata.

### P2/P3 — Regression evidence overstates journey coverage

- `--studio-journey` drives the real operator editor, Save/Publish, mode switching
  and narrow layout. Its implementation does not execute a visitor conversation.
  It must be reported as operator QA, separately from the live provider journey.
- Existing deterministic tests explicitly keep reading unconfirmed names back
  indefinitely. They protect against false confirmation, but do not test recovery
  from the wrong-tool/repeat chain seen in the field.
- One existing renderer test fails because it expects the old image-prompt
  guard wording `untrusted data, not instructions`. The current preview contains
  the replacement guard and still quotes visitor answers. This is a stale test
  assertion, not evidence that the guard is missing.
- The live comment check accepts up to two sentences/200 characters, whereas the
  configured default requests one sentence and 60 Chinese characters. A green
  check alone is not proof of that tighter prompt target.

## Complete visitor journey and audit coverage

| Stage | Required behavior / current implementation | Evidence and limit |
|---|---|---|
| Start | Studio mode selects its wake phrase; a fresh visit uses the Traditional Chinese opening and asks the name. | Published script/config inspected; real provider wake-entry and restart checks. Real human wake remains separate. |
| Name | Capture caption, display only the name, read it back; later agreement confirms; denial reasks; correction gets another read-back. | Field failure above; fresh provider denial/correction/confirmation sample; deterministic guard tests. Still unreliable in the field. |
| Name list | Off/prefer/only, up to 1,000 names, sound-alike shortlist; list stays in Main, only matching candidates cross to dialogue. | Editor and matching tests; production list is empty with prefer selected, so it did not cause this incident. |
| Silence | After completed playback, 30 seconds of silence uses 無名之人 for the name, or records 未回答 and says 不回答 也是一種回答 for story questions. | Deterministic timers cover name/confirmation/story/reveal, speech cancellation and stale steps. Not a fresh acoustic-silence acceptance run. Loop and failed-cue gaps remain. |
| Questions | Operator can add/remove/reorder 1–8 bilingual questions. Only question one addresses the name. | Published four questions match the owner's script; Main/adapter/renderer tests; full provider four-question sample. |
| Comments | One short reaction after each answer, then the next question without waiting for a comment response. | Playback sequencing tests and provider comment delivery checks; tighter length caveat above. |
| Drawing cue | Keep the avatar through the last comment and drawing cue; then start generation/rendering and ask the waiting question. | Main holds the visible phase until the renderer acknowledges cue completion; focused tests and provider painting check. |
| Reveal | When ready, interrupt painting chat, announce the soul and show the image. Text is only the name. | Adapter interruption/tail tests, provider reveal, inspected portrait screenshot. |
| Feedback/revision | Require a later heard visitor preference; silence/unclear input cannot request a repaint. One change by default. | Nonempty final-turn guards and Main tests; real requested revision, inspected visible change. Byte-identical edits are rejected; this is not a perceptual similarity guarantee. |
| Transfer | Say the transfer cue, invoke the deferred printer once after playback. | Main/adapter tests and provider deferred-printer receipt. Physical printing is intentionally not connected. |
| Farewell | Use the configurable phrase/pauses, then Dormant and remove transient Studio context. | Provider farewell/Dormant/history-cleanup checks; deterministic pause/cancellation tests. |
| Restart/exit | Close timers, abort generation, discard stale events; next visit starts at opening/name. | Main/adapter ownership tests and live fresh-name restart. STOP hardware results are the owner's fresh button receipt, not a new physical-button test. |

Traditional Chinese remains the default. Explicit Chinese/English selection has
focused tests; this audit's live `soul` story does not exercise both switches.
The actual published `artStyle` is modern minimalist multicolour vector-style,
not the old watercolour style. “Restore default script and questions” explicitly
preserves picture settings and the name list; its label/help correctly describes
that scope.

## Operator journey

The operator should open Console, choose Raven, enable Image generation, edit
Start/Character/Name and questions/Picture/Ending, save and check, review and
publish, switch Mirror mode, monitor the visit, and recover or stop it. The
rendered operator runner exercises the following in isolated data:

- Per-avatar skill selection, duplicate/avatar switching, persistence and disabled
  feature enforcement in both UI and Main.
- Mode/wake-phrase switching while Dormant without waking the mirror.
- Name-list validation, off/prefer/only modes, and disabled controls when name
  capture is off.
- Question count limits, ordering/removal, bilingual contents and pause validation.
- Character/opening/farewell edits, image instructions and preview, lettering,
  quality and revision limits, failure lines and comment rules.
- Save, publication review, publish, reload, restore script defaults, prompt
  inspector and Studio service status.
- Help descriptions and 1024×768 layout without horizontal overflow.

The full provider journey separately checks that opening Console on the Mac's
main display or over the portrait display does not reset an active visit.
Tailnet HTTP/authentication has focused tests. A second computer was not used in
this audit, and production Console is unavailable while normal Electron is
stopped. Physical Stream Deck label/press and desktop orientation were not
re-certified by synthetic UI tests.

## Fresh execution evidence

- Build verified before/after QA: built 2026-10-23 22:11:20 Taipei, source
  `afade18e8be6305549369a5048b8549da2bbfeaf8d6f03efd367d16f78476eff`, output
  `b53cc6350748189d86cba43b9de0503c439070b8413aa9a8c49a0056f43fffc5`.
  No source or model changes, no rebuild or deployment was needed for this audit.
- `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --studio-story soul`
  — **exit 0, 26/26 checks**, one attempt, run
  `2026-10-24T02-43-28-882Z`, 405.918 seconds of scenario execution. Synthetic
  visitor audio through real WebRTC/ASR/tools/IPC/playback and real image service;
  virtual microphone and camera fixture, published Raven. **1/1 sampled visit**,
  not a field reliability rate. [Full metadata](studio-journey-audit-provider-2026-10-24.json).
  Name required one spelling correction and was confirmed correctly. Four
  comments were delivered, 24/32/29/29 characters, no questions; one was two
  sentences, illustrating the looser QA threshold noted above. All 23 classified
  spoken lines matched Chinese. Farewell matched its configured wording.
  First picture took 37.236 seconds, revision 29.026 seconds; both PNG 1254×1254,
  transparent corner alpha 0. Two reveals, one repaint announcement and one
  deferred-printer handoff. Forty transient history items were deleted.
- Inspected the actual portrait screenshots for both provider pictures. The
  revision visibly adds silver wings while preserving the creature/composition;
  it is not the same image. The presentation is multicolour vector-style with
  only the name banner, no dialogue captions. Provider art remains probabilistic.
- `node scripts/run-phase4-qa.mjs --studio-journey` — **exit 0, 23/23 operator
  checks**, run `2026-10-24T02-51-33-781Z`, 17 screenshots. The runner explicitly
  reports `mirror_not_executed`; it is rendered Console evidence, not a second
  visitor run. Name-list, narrow Studio and publication-review screenshots were
  inspected: controls/readouts fit and publication clearly applies the saved
  draft to the next conversation. [Full metadata](studio-journey-audit-operator-2026-10-24.json).
- Focused tests: **219 passed, one failed** across 13 files. The one failure is
  the obsolete renderer text assertion described above. Its full failure output
  and fault-probe outcomes are [retained](studio-journey-audit-failures-2026-10-24.txt).
  The temporary fault-probe file was removed; its two passing assertions prove
  the undesirable behavior described in the findings, not corrected behavior.

Focused commands, both using `node node_modules/vitest/vitest.mjs run`:

```text
tests/unit/studio-runtime.test.ts tests/unit/realtime-session-studio.test.ts
tests/unit/studio-tools.test.ts tests/unit/studio-config-ipc.test.ts
tests/unit/mirror-mode.test.ts tests/renderer/console/experiences-editor.test.ts
tests/renderer/mirror/portrait-studio-layer.test.ts
# exit 1: 129 passed, 1 failed

tests/unit/studio-soul-journey.test.ts tests/unit/studio-guest-names.test.ts
tests/unit/studio-image-provider.test.ts tests/unit/studio-qa-stories.test.ts
tests/unit/raven-button.test.ts tests/unit/web-console.test.ts
# exit 0: 90 passed
```

Both Electron runs were sequential and isolated; normal Electron never overlapped
them. Jabra output was set by device identity to 0.97% for each run and restored
in an EXIT trap to **70.08%**, verified after each run and again at clock-out.
The helper changes output scalar only, not mute or input gain. The normal app
remains stopped and its existing native black-HDMI cover process remains active.
No new human-microphone, physical loudness, camera reliability, second-computer
access or printer acceptance is claimed.

Production config hashes before/after are identical:

- Active: `336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`
- Draft: `d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`

No test settings were published into production. The isolated operator test
restored its script defaults. Metadata summaries and full assertion failures
above are retained for handoff; the two exact owned artifact roots can now be
reviewed/cleaned through `qa-artifacts.mjs`. Final disposal is recorded in
[PROGRESS](../../PROGRESS.md). Owner images and synced media are outside cleanup.

## Recommended acceptance for the repair

1. Reproduce wrong answer/repeat calls during confirmation; keep the same pending
   name, prevent autonomous repetition and recover without invented confirmation.
2. Inject failed opening/question/transfer playback and verify bounded recovery,
   timer ownership, single microphone ownership and a visible failure reason.
3. Exercise the operator's current-visit recovery action through actual UI/IPC;
   ensure it does not load private memory or silently accept a caption.
4. Repeat the full provider journey, explicit language changes and silent paths;
   retain failures. Then validate the owner's real name and correction at Jabra.

No fixes, production restarts, model changes or phase promotion were performed
as part of this audit.
