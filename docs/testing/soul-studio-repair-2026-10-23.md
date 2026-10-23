# Interactive Studio repair and operator audit — 2026-10-23

## Journey and pre-implementation review

The owner requested repair of the remaining QA gaps and a complete operator
journey audit. This authorizes a fresh bounded provider verification after the
repairs. Earlier failures remain in `soul-studio-sample-2026-10-23.md`.

Visitor acceptance: opening → name → denial/re-ask → spelling correction →
confirmation → four addressed questions, each with one or two short comments →
painting cue → real image → complete reveal and feedback offer → requested
revision → second image → transfer → deferred printer → farewell → Dormant.
Also preserve the silence journey (30 seconds after playback; 無名之人 / 未回答
and 不回答 也是一種回答), early visitor interruption and zero-revision ending.

Operator acceptance: discover Studio and service status; select the avatar;
edit opening/name, question content/count/order, character/comment instructions,
image settings and farewell; see actionable validation; preview actual prompts;
save, publish and reload; verify reset scope, disabled controls and narrow layout;
switch Mirror mode without waking it; leave normal settings and runtime restored.

Self-review before edits: preserve application ownership of ordering and actual
processed playback. Normal output-stop and explicit buffer-clear can race with
cancellation; generation completion alone is never playback completion. Preserve
response identity and serial speech ownership, including pause segments. Do not
add regex speech filters or substitute image-generation latency for cancellation
failure. Improve short-comment instructions and measure the actual output. QA must
wait for the whole feedback offer, not merely the first reveal response. UI reset
must affect only the controls it describes. Farewell line breaks already become
one-second pauses in `studioFarewellSpeech`; verify this existing behavior.

Normal Console inspected before changes: Raven v20, zero changed areas,
Conversation mode, asleep and wake listening. Operator data is preserved; QA
uses isolated settings. No physical human speech or printing claim is implied.

## Results

Changes:

- A matching natural output stop now satisfies cancellation's buffer-drain
  requirement. Already stopped/cleared cues do not clear a newer response.
  Joined WebRTC output retires earlier completed cues by response order, leaving
  unknown, newer and still-generating responses owned. Cancellation requests are
  sent once and their deadline is removed independently of the element mute value.
- QA waits for Main's post-playback preference deadline before speaking a change,
  checks the complete feedback offer and short-comment sentence count, and fails
  immediately if a revision closes the visit instead of waiting four minutes.
- The default comment prompt requests one concrete observation, preferably one
  sentence and never more than two. Operator overrides remain available.
- The stage-prompt reset affects only the four displayed prompts, preserving
  Character's system rules. Reset scope and the fixed journey transitions are
  now explained in the editor.

Local verification: `npm run typecheck` and `npm run build` exited 0. Focused
Vitest run of realtime-session-adapter, realtime-session-studio,
studio-soul-journey, studio-config-ipc, studio-runtime, studio-tools,
experiences-editor, prompt-inspection and image-skill-runtime: **259 passed**,
exit 0, 19.81 seconds. No Electron smoke/full suite ran alongside Electron.

Regression evidence before repair: the targeted adapter run exited 1, all three
new cases failed. `accepts an already drained cue when abort races output
stopped` and `... cleared` expected two speech requests and got one; `accepts a
matching normal playback stop after cancellation without waiting for a redundant
clear` received one unexpected failure callback `{kind: ice, realtimeSessionId:
session-a, reason: scene_dialogue_cancel_failed}`. The initial repair released the
queue but all three still received that callback because timer cleanup depended
on the element mute value. Separating timer cleanup fixed all three. Existing
missing-acknowledgement and transport-failure checks still pass.

Operator run `2026-10-23T02-14-01-083Z`, command
`node scripts/run-phase4-qa.mjs --studio-journey` under the Electron-owner/audio
restoration guard: **22/22 passed**, exit 0, 16 screenshots. Real rendered
controls exercised question count 1–8, add/remove/order/content, pause validation,
name on/off, character, comment edit/reset without erasing system rules,
portrait/sticker, lettering/font, quality/change limits, image prompt preview,
screen/failure text, skill assignment, Save/Publish/reload/default script reset,
service status and Mirror mode/wake phrase switching. Read-only IPC verified the
published values. Normal active/draft hashes were unchanged and audio was
restored; normal Main resumed as PID 26910.

Visual review: narrow Studio and Mirror overview, inline validation, prompt reset
and publication confirmation are legible and fit the window. The long editor
scrolls vertically; persistent navigation and publication controls remain
available. The changed reset explanation clearly describes what is restored.

First live repair run `2026-10-23T02-14-46-534Z`:
`node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
portrait_studio --studio-story soul`, exit 2, 422.287 seconds. The visit completed
name denial/correction/confirmation, all four answers, both reveal segments,
revision (39.670 seconds), transfer/printer, exact farewell, Dormant and the
Conversation-mode entry check. First image took 38.246 seconds; both PNGs were
1254×1254 with transparent corners. Zero protocol errors; no cancellation failure.
The single failing check was `studio_comments_then_next_question` with reason
`raven_qa_studio_comment_brevity`. Its failure could mean more than two sentences
or a question mark; the original check did not retain those separate counts.
Raw dialogue was not retained. The normal app/settings/audio were restored
(Main PID 27515).

Follow-up inspection found that comment generation inherited the general
session's “Usually use 1–3 short sentences” and “Ask at most one useful question”
rules, as well as unrelated tool rules. The response now uses a shared,
versioned comment-only builder with the operator's character, voice style,
comment instruction and language. Its default requests one short declarative
sentence. Prompt Inspector uses the same builder. QA records sentence/character
counts and question/delivery flags only, so a future failure is diagnosable
without retaining dialogue. Focused prompt/adapter/config checks: 81 passed,
exit 0. Typecheck first found an unused `studioReplyLanguage` import after this
refactor (TS6133); it was removed before final verification.

Second operator run `2026-10-23T02-24-51-337Z`: 22/22 checks, exit 0,
16 screenshots; the Prompt Inspector showed the actual focused comment request.
Settings and audio were restored, normal Main PID 28282.

The one bounded live retry, `2026-10-23T02-25-42-983Z`, finished exit 2 in
388.673 seconds: 24 checks passed and one failed. Both images completed
(30.780 and 30.140 seconds), both were 1254×1254 PNGs with transparent corners.
All four comments passed: sentence counts 1/2/1/2, character counts 29/30/29/39,
none asked a question. Name correction, both reveals, exact feedback offer,
revision, transfer, deferred printer, exact farewell, Dormant and release passed.
Zero protocol errors. `studio_repaint_once` failed with
`raven_qa_studio_repaint_lines`: two audible records before the revision image.
The application cue repeated the native preamble; the fix now uses the preamble
when present and waits for its processed playback tail before requesting the
image. Without a preamble it retains the application cue. The catalog was aligned
with the existing 2026-10-20 ruling allowing one short preamble. A focused
regression covers the application-step path and its tail barrier. This fix has
not received another full live story retry; both attempts remain failures.
Normal settings/audio restored, Main PID 28870.

Visual QA also found that revision screenshots could sample the image during its
fade-in. Captures now wait for a loaded, visible image at full opacity. The earlier
blank revision screenshot does not prove the final presentation. A separate
Console copy gap showed successful lifecycle controls as “needs attention”;
`runtime_command_delivered` now displays “The requested control was applied.”
Ten focused status/review tests passed.

## Name-list addition and operator journey

The owner added the request for keyed-in names during the repair. Inspection
found an existing per-avatar local list and bounded spelling/pronunciation
matcher. The implementation reuses that storage; it adds no new database,
identity authority or dependency. The previous controls were hidden under More
settings. They now sit beside the name question, with matching mode, count,
inline validation and explanations of unmatched names, confirmation, silence,
publication and private-memory separation.

Operator journey: open Avatars → Interactive Studio → Name and questions →
Name list for confirmation; enter one name per line; choose Suggest names from
the list (default), Only accept listed names, or Off; Save then Publish. The
list survives reload and Restore default script and questions. Name-step Off
disables its use without deleting names. Limits remain 1,000 names, 40 characters
each. The model receives at most three matching candidates, never the whole list.
Visitor journey: say a name; Main matches its spelling/pronunciation; Raven reads
back the suggested spelling; a later affirmative reply confirms. Choosing another
listed name requires another read-back. Unlisted names are accepted in Suggest
mode or asked again in Only mode. Name silence still uses 無名之人 after 30 seconds.

Review checked that this is caption spelling support rather than identity or
memory access, that the list remains per avatar, and that resets preserve
operator-entered names. Existing tool handling already suppresses a second model
reply when Only mode dispatches its application-owned name question.
Six focused files passed, 110 tests, exit 0. The new integrated name test initially
failed due to a null test image provider (`studio_not_active_stale`), then a test
assertion on the wrong tool-result envelope (`next` is outside `studio`); both
test-fixture issues were corrected. Typecheck and build passed. An attempted
`node scripts/qa-build.mjs --check` exited 2 (`qa_build_mode_invalid`); the real QA
runner performs the supported fingerprint verification instead.

Expanded name-list Console run `2026-10-23T02-38-43-400Z`: **23/23 checks
passed**, exit 0, 17 screenshots. Entry, all three matching modes, empty Only
validation, name-step disabling, Save/Publish, reload and preservation across
script reset passed. The name-list panel and narrow layout were visually
reviewed: readable labels/help, multiline entry, count and publication controls
remain visible. Settings/audio restored, Main PID 29553.

Final review found two edge cases before handoff: retain the preamble marker
until its revision step arrives even if the IPC reply arrives first (two timing
variants now tested); and an empty Only list must not block saving when the name
step is off. The latter validation now applies only while asking for a name.
Seven focused files passed **232 tests** in 19.65 seconds; the later validation
adjustment passed the 18 Console editor tests. Typecheck passed. The new empty
Only/name-off path was added to the rendered operator journey for final checking.
The live silence Console was also inspected directly: successful start now
displays “The requested control was applied.”

Silence run `2026-10-23T02-39-41-391Z`, command
`node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
portrait_studio --studio-story soul_silence`: **21/21 passed**, exit 0,
256.600 seconds. Real name timeout, both question timeouts and 未回答 records,
both silence responses, full offer, preference timeout, transfer, deferred
printer, exact farewell, Dormant and release passed. Image generation took
40.643 seconds; 1254×1254 PNG, transparent corners. Zero protocol errors.
The one-second authored pause measured 2,677 ms from provider stop to next
request (includes processed tail/transport; physical audio not measured).
The reveal screenshot now shows the fully visible soul, correct 無名之人 caption
and legible feedback instructions. This validates the new capture readiness
condition for the first image; a revised image still needs equivalent visual
evidence. Normal settings/audio restored, Main PID 30106.

The final build passed, including the supported
`node scripts/qa-build.mjs --verify`. Final Console run
`2026-10-23T02-44-43-873Z`: **23/23 passed**, exit 0, 17 screenshots.
The added Only/empty/name-off validation path passed. The final name-list panel
was visually reviewed. All normal active/draft settings hashes remained unchanged;
audio volume/mute were restored, input gain untouched, Main PID **30434**.
Direct production Console inspection at 10:45 Taipei showed Raven **v20**,
**Up to date · 0 changed areas**, default opening/four questions/farewell,
one allowed revision, an empty name list with Suggest mode, Conversation mode,
and Dormant with wake listening. The Console is left on Interactive Studio,
focused on the empty name list. No synthetic names were inserted into production.

Final review covered the touched playback, prompt, UI and name-list boundaries;
`git diff --check` passed. No further full provider retry was made after the
bounded retry. Full live acceptance remains open for the corrected duplicate
revision announcement and a visible revised-image capture; lookup integration
is covered by deterministic Main/adapter tests and real Console authoring, not
human microphone evidence. Printing remains a deferred no-op by design.

## Cleanup

All seven named QA runs are finished. Their results, failures and requested
visual findings are recorded above. Cleanup uses the installed marker-aware
cleaner and preserves the previously requested five sample deliverables under
`.artifacts/deliverables/soul-studio-2026-10-23/`, all operator assets, historical
runs and credentials. Review → dry run → delete completed for each exact run ID:
**590 files, 118,008,142 bytes** removed (excluding retained ownership markers).
The finished task-owned guard/log/audio scratch directory was removed (39
entries); no symlinks were present. All five requested sample deliverables remain.
A final read of output volume/mute exactly matched the captured pre-QA state;
input gain was never modified. The normal app remains running. Reported failures
are preserved in this report; no raw dialogue was retained by these seven runs.
