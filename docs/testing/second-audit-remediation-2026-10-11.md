# Second-audit remediation — 2026-10-11

Implements the bounded software findings in the
[second audit](second-audit-remaining-failures-2026-10-11.md), under the
[accepted rulings](../../DECISIONS.md). No phase is promoted. Operator config
v17, Raven's persona, production model IDs and the independent board services
are unchanged. Pre-existing `CLAUDE.md`, audit-document and local owner-check
edits are preserved.

## Software changes

| Audit item | Change and boundary |
|---|---|
| §1 #1, #14 TV | `src/main/tv-presence.ts`: three-minute startup grace before first detection; normal 15-second dual-absence shutdown thereafter. HDMI presence skips the network probe; a slow probe rechecks HDMI. Query failure is not absence. |
| #2 Maintenance | `src/main/boot.ts`: permanent core/config/storage failures stay in visible Maintenance so the Console can be used. Audio and renderer ownership failures retain bounded recovery and LaunchAgent-owned restart. |
| #3 speech collision | One queue for greeting, spell/retry cues and scene dialogue. It waits for prior generation/playback release. Only the cue's own response completion, playback stop and processed tail complete it. Cancellation and failure cannot report success. |
| #4 microphone loss | `wake/supervisor.ts` and Main distinguish unavailable devices from ownership failures, including asynchronous worker exit. Conversation can stop to Dormant with wake visibly degraded. |
| #5 failing fixtures | Missing scene-action drafts render safely; stale memory wording and audition mocks are repaired. Broader checks also found and repaired obsolete packaging, UI, QA-build and retired-session assertions. Production behavior was not weakened to satisfy old fixtures. |
| #6 rejection paths | Noncritical scene cleanup, configuration refresh, media-folder, camera/status and Console-load failures get bounded metadata degradation. They do not kill unrelated conversation. |
| #7 activation deadline | A 30-second activation timeout has its own reason. OfflineLoop follows the renderer's microphone-release receipt; failed release retains ownership recovery. |
| #8 Undo/blur | Manual voice edits clear preset Undo; number blur commits only a changed value, preserving unrelated Undo state. |
| #9 memory status | Control-phrase cache failure has its own reason and no longer marks the database unavailable. The cache includes both avatar and scene-stop phrases. |
| #10 audio reset | Every interruption increments the voice-worklet generation, so a pending `begin()` cannot unmute cancelled output. |
| #11 Thinking | Media activation clears the missing-output timer. Known pending search work gets an Active-only nonverbal cue. |
| #12 status polling | Console runtime requests time out after two seconds, display unavailable status and retry; late responses cannot restore stale health. |
| #13 provider causes | A fixed allowlist records provider rejection codes, never arbitrary provider messages or request contents. |
| #14 smaller findings | Publishing does not replay entrance/wake cues; null wake defaults are retried; the root installer executes its installed root-owned adb copy; outcome text/counts remain visible; failed wake recovery has `role=alert`. |
| CX-08/CX-11 | Simulator preset references are labelled honestly and survive incomplete drafts. Advanced field labels and save wording are readable. No physical preset catalog is invented. |

The principal files are `src/main/boot.ts`, `src/main/index.ts`,
`src/main/tv-presence.ts`, `src/renderer/realtime/realtime-session-adapter.ts`,
the Mirror transcript/announcement controllers, Console controls and the
avatar audio/presentation modules. The adb installer change is source/syntax
verified; the running root service did not need reinstallation.

## Conversation and media controls

- `src/shared/spoken-command.ts` supplies one whole-utterance key for spell
  matching, scene stop, media wake, catalog collisions and memory exclusion.
  It uses the existing pinned pronunciation dictionary plus OpenCC: script,
  homophones, tone removal, in/ing and en/eng only. Extra/missing words,
  quotations, negation, hypothetical prefixes and held zh/z-class folds do
  not authorize effects. Unknown symbols remain in the key. The browser
  derivative and regeneration command are documented in the lexicon README;
  no dependency or model was added.
- Final spell-prefix turns are application-owned. Late automatic responses
  are cancelled and locally muted; delayed audio from a response created
  before final ASR is also suppressed. The next visitor turn restores normal
  dialogue. Unmatched prefixes receive the fixed catalog retry line once.
  Main's turn-start owner and control-extraction exclusion remain intact.
- Versioned prompt catalogs put language and preamble rules near the top,
  remove priming examples and redundant prose, permit the accepted brief
  slow-search bridge and explain camera failures. The attempted memory-specific
  simplification was reverted after its quality checks failed.
  Conservative complete-sentence hints append a fixed system item without
  replacing the session/private-memory instructions. The ASR request includes
  a Traditional-Chinese prompt. No generated-speech regex filter was added.
- Application speech uses `conversation: "none"` and response metadata.
  This follows OpenAI's documented
  [out-of-band response mechanism](https://developers.openai.com/api/docs/guides/realtime-conversations).
  Preamble changes follow its
  [voice prompting guidance](https://developers.openai.com/api/docs/guides/voice-prompting).
  These mechanisms are not a guarantee of model-quality rates.
- Local and YouTube loops are attenuated by 12 dB in Dormant, with metadata;
  normal volume returns for subsequent awake playback. Voice gain is
  unchanged. Physical wake improvement has not been measured here.
- Unproduced YouTube source-policy result codes were removed. Local-first
  semantic selection remains model/tool guidance; no regex intent classifier
  or fictitious application enforcement is claimed.

## Checks and retained failures

Local logs use `/tmp/magic-mirror-second-audit-*.log`; 31 full logs, including
failures, are also retained in
[the evidence directory](../../.artifacts/second-audit-remediation-2026-10-11/).

| Check | Result |
|---|---|
| Main worker focused regressions | 179 passed; Node typecheck and installer `zsh -n` passed. |
| Console/audio/presentation focused regressions | 114 passed; web typecheck passed. |
| Root voice/control batch | 260 passed before the final playback-race additions. |
| Node-only regression sweep | **1,875 passed, 1 skipped**, 172 passing files; exit 0. Command: `npx vitest run tests/unit tests/main tests/renderer tests/integration/realtime-contract.test.ts --exclude tests/unit/smoke-contract.test.ts`. |
| Final control regressions | **140 passed**, exit 0: adapter, transcript controller, Raven fixture and boot-runtime tests. Includes delayed pre-ASR-created output and prior-audio queue release. |
| Observer regressions | **106 passed**, exit 0: Raven probe/fixture and adapter. Post-tool answers generated during an already-playing stream are retained with a distinct `continuous_stream` delivery label; no second start event is not proof of silence. Cancellation and media suppression stay separate. |
| Final command regressions | **93 passed**, exit 0: whole-utterance matcher, spell guard and relationship memory, including straight single-quote rejection. |
| Restored memory prompt checks | **50 passed**, exit 0: tool catalog, avatar prompt, memory dialogue and prompt inspection. |
| Final `npm run typecheck` | Both TypeScript projects passed, exit 0. |
| Final `npm run build` | Passed including QA source/output stamp, exit 0. Existing large-chunk warning remains. |

The first broad command unintentionally included `tests/unit/smoke-contract.test.ts`
while ordinary Raven was running. That run is not runtime acceptance. After
ordinary Raven exited cleanly, the next broad run's four Electron smoke cases
passed. A parallel Raven QA launch refused to start with
`raven_qa_electron_already_running`; it did not overlap those smoke cases.
Subsequent Node-only runs explicitly excluded smoke, and provider runs were
sequential. Initial broad failures (11 stale assertions, then one duplicate
cache entry) and intermediate fixture/typecheck failures are retained rather
than replaced by the passing summaries.

### Real-provider spell checks

Both runs used synthesized PCM into WebRTC, isolated identity data, published
Raven settings and one mock-hardware spell. Neither proves human recognition,
physical effects or acoustic audibility.

- [First result](../../.artifacts/phase4-qa/2026-10-11T04-23-56-012Z/raven-results.json):
  all eight runtime cases passed; quality failed three spell-related turns.
  This exposed the delayed audio-start race fixed above. The fixture also
  still described an unmatched prefix as silent; it now explicitly expects
  the accepted application retry cue.
- [Repaired rerun](../../.artifacts/phase4-qa/2026-10-11T04-31-26-688Z/raven-results.json):
  all eight runtime cases passed again, no provider protocol errors, exact
  spell recognized and scene executed once, retry and announcement completed,
  conversation resumed, farewell tail preceded close and wake reacquisition.
  **Overall exit 2 remains:** the quality judge flagged `tool_preamble` on
  extended/exact spell turns. Provider audio began **49 ms and 278 ms before**
  final-ASR interruption. The probe counts provider buffer starts, not
  physical sound, so this is neither a clean silence pass nor proof that the
  whole generated reply was audible. No further same-action retry was made.

Ordinary turns are not held behind final ASR, per the durable ruling. Eliminating
that remaining early fragment needs measured candidate-prefix gating or a
successful prompt/model comparison, not another late-response cancellation.
The broad rate targets in the audit have not been established by these samples.

### Memory checks

The [first two-visit result](../../.artifacts/phase4-qa/2026-10-11T04-35-32-796Z/raven-results.json)
passed all ten runtime cases, separate confirmation in both visits, automatic
learning, explicit saving, clean-session replacement and recall operations.
There were no provider protocol errors. It exited 2 on quality: the observer
excluded all three post-tool recall answers because their response IDs lacked
an independent buffer-start event. The existing stream remained active through
their generation/playback interval. The observer now retains that evidence as
`continuous_stream`, explicitly an inference rather than physical audibility.
The original failure is retained.

The [corrected rerun](../../.artifacts/phase4-qa/2026-10-11T04-43-45-286Z/raven-results.json)
also passed all ten runtime cases and had no protocol errors, but still exited
2 on quality. Its diagnostics include ASR meaning changes, incomplete recall,
preambles and a return-identity language/conflict finding. The judge additionally
flagged `private_context_leak` on return-identify; Main's private-memory lock
assertion passed, and brief installation occurred only after the following
confirmation. This remains an unresolved semantic/identity-output finding,
not evidence proving a data-plane release.

Because the shortened memory wording did not meet the quality gate, the
established memory tool description/rules and private-state guidance were
restored from HEAD. Their focused checks pass. No third provider retry or
fresh end-to-end acceptance of the restored wording is claimed. The shared
control exclusion, clean-session, out-of-band question and consent protections
remain in place.

### Local media and UI

The [local-scope run](../../.artifacts/phase4-qa/2026-10-11T04-53-39-698Z/raven-results.json)
exited 2. The vault-miss turn called `find_media`, `search_youtube` and
`play_youtube`, violating the local-only route. The judge flagged ASR meaning
changes on the first two turns; sticky-local passed. No protocol errors
occurred and cleanup passed. Folder-miss also has semantic grounding/leak
flags plus `fixture_evidence_gap`; this guest run does not establish any
private-memory release. No source-policy or language-quality pass is claimed.

The [first UI attempt](../../.artifacts/phase4-qa/2026-10-11T04-56-45-423Z/evidence.json)
exited 2: the one-shot LaunchAgent omitted the review flag, dispatching the
older Console suite. That suite still assumed auto-saving volume controls.
The launch allowlist now forwards the review/calendar/media-mode flags; the
older volume checks explicitly save device settings. The latter has static
typecheck/build evidence, not a fresh full-Console-suite pass.

The [intended UI rerun](../../.artifacts/phase4-qa/2026-10-11T05-00-07-309Z/evidence.json)
passed **14 checks**, exit 0. It covers 1024-wide controls, number validation,
preset Undo, Stop All availability, unpublished model review, hidden/resumed
rendering, forced renderer recovery, Chinese Offline/Maintenance messages,
server validation and polling failure. Wake-cue start was measured at **12.4 ms**
after entrance with its AudioContext closed. All ten screenshots were reviewed:
Raven is correctly framed, failure messages are legible and field errors are
visible. Some screenshots are scrolled away from the status strip, so those
state assertions rely on the runner's DOM checks. This is functional/UI
evidence, not portrait-display or physical-acoustic acceptance.

The seven named QA roots retain results, full logs, build/provenance metadata
and telemetry under `metadata/`. Copied assets, isolated synthetic databases
and screenshots were removed after review to keep retained evidence metadata-only.

### Runtime restoration

After all QA processes exited, final Node typecheck/build and build-stamp
verification passed again. Normal LaunchAgent kickstart at **13:01 Taipei**
restored Raven; **13:02** readback shows PID **47163**, run **5**. Board-ADB
remains PID **4320**. Fresh Console shows Dormant, wake audio arriving,
published v17 up to date and zero changed areas. It also shows
`camera_starting` degradation, retained as an unresolved runtime observation.
Startup selected T749 with HDMI present; Ethernet is intentionally not probed
while HDMI is present. No new conversation, physical wake or camera acceptance
is inferred from restoration.

## Remaining boundary

The following boundary was the **13:02 handoff**, before the owner requested
continued work with the TV on. The field continuation below supersedes its
test status; retained failures are not replaced.

- The full-model A/B is authorized but not run. Production model and proposed
  sage persona remain unchanged because prompt-quality acceptance is incomplete.
- Merging media tools, adding `wait_for_user`, a prefix spotter/transcript gate
  or AEC are larger experiments. Existing failures and representative acoustic
  evidence should choose those changes; they are not bundled into these fixes.
- Physical wake under spoken loop media, representative human spell trials,
  real spells/presets and T1–T5 power-cut/cold-boot checks remain open. Published
  Raven has no production spells/scenes. Screen-lock authentication requires
  the owner. TV Wi-Fi remains closed as unnecessary; Mac Wi-Fi acceptance is
  separate.
- Greeting still respects the configured entrance/presentation gate. The
  existing wake cue is retained; no unmeasured change to reveal timing is
  claimed as acceptance.

All 12 invariant IDs are preserved. Focused new coverage concerns 1, 4–10;
the broader existing checks cover the remaining identity, model and credential
boundaries. No raw visitor transcripts/audio, private context, credentials,
identity images or embeddings were inspected or added to diagnostics.

## TV-on field continuation

Normal Raven was stopped cleanly after another readback of v17 and zero
changed areas. Full tests and isolated Electron runs are sequential; the
root board-ADB service remains running. No power cut, USB reconnect or human
microphone trial is inferred from the owner turning on the TV.

Completed field-run metadata is archived under the evidence directory in
subdirectories named by run ID. Full failed results, process logs, telemetry,
build stamps and provenance are retained and byte-checked before scratch
cleanup. All four provider portrait captures through the first passing prefix
run were reviewed: framing is intact, without failure overlays. The marked
cleanup command removes the completed run's copied assets, isolated browser/
database state and screenshots after this report is recorded; active runs
are excluded.

### Full automated suite

`npm test` now passes: **1,893 passed, 1 skipped**, 176 passing files, exit 0
(13:49 Taipei). The suite includes the Electron smoke and Phase 0 regression
fixtures; this does not advance phase acceptance. Full logs, including two
earlier failed attempts, are copied to the existing evidence directory:
`magic-mirror-full-field-tests-2026-10-11*.log`.

The failures exposed missing Node JSON import attributes in raw TypeScript
demo dependencies, an obsolete Maintenance-copy expectation, and a Mac-only
memory measurement assumption. Electron's installed API explicitly omits
`residentSet` on macOS; the test now uses its private footprint and records
`workingSetSource=macos_footprint`, keeping it distinct from other platforms.
Bounded demo failure reasons are retained. Both typechecks and stamped builds
pass. Later prompt/probe checks pass **44 tests**; the timing probe retains
only partial-ASR timestamps/counts, never partial text.

### Camera and physical audio setup

Real camera permission is granted, but the Arducam delivers no frames in two
20-second native checks:
[first](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T05-35-04-869Z/camera-native.json),
[second](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T05-43-01-840Z/camera-native.json).
Both exit 2. A proposed AVFoundation input-priority preset is unavailable on
macOS and was removed after compilation rejected it. Holding the device lock
through start did not recover frames and was reverted. The native helper now
reports `camera_frames_missing` and failed stream start explicitly. Camera
images were neither saved nor sent to the cloud. USB reconnect is pending
the owner; no further unchanged-state retry is justified.

The native wake route diagnostic detected the configured phrase from the Mac
speaker into the Jabra, while the Arducam microphone delivered zero blocks:
[first](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T05-31-46-658Z/wake-diagnostic.json),
[diagnosed rerun](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T05-35-41-034Z/wake-diagnostic.json).
The latter records `raven_qa_wake_calibration_lost`. Both exit 2 overall; a
working Jabra sample does not upgrade the failed Arducam route. Terminal UI
launch was blocked by the computer-use tool, so physical tests use the
existing one-shot Electron LaunchAgent with actual microphone permission.

### Dialogue model comparison

`resources/testing/raven-model-ab.v1.json` and `--variant mini|full` select
model IDs only in the isolated QA config. Production v17/model/persona remain
unchanged. The first full-model local-only scenario still fell through to
YouTube; stronger dialogue alone did not fix the source policy.

After clarifying that vault/library/folder requests are local-only, the
[full-model rerun](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T05-43-29-943Z/raven-results.json)
passed all three source-route cases and protocol/cleanup checks. Overall
exit 2 remains: the folder turn's grounding/local-scope judgment failed with
`fixture_evidence_gap`; two other quality turns passed. ASR also changed the
first request's meaning. This is not a clean language/quality pass. The
fresh-lookup rule for changed title clues is retained in the final catalog.
The Raven screenshot was reviewed: portrait framing is intact with no failure
overlay, but this does not establish physical-TV or acoustic acceptance.

### Wake media matrix

The new `wake_media`, `wake_media_routes` and `wake_soak` QA modes reuse the
production calibration microphone owner. Stimulus/decoded music and capture
remain in RAM. Near-phrase negatives accompany positives; no operator audio
preferences are changed. Music is decoded from an existing linked local
source, while a fixed synthetic speech bed represents spoken media. These
controlled beds do not prove actual local-video/YouTube playback acceptance.

Two setup failures preceded measurements: the first linked music file was not
decodable; the harness now records the failure and tries the next linked file.
An intermediate run was stopped after discovering uncontrolled published
ambience in its purported quiet control; its partial results are retained
but invalid for comparison. The corrected run explicitly pauses/mutes the
isolated ambience element. The completed comparisons follow.

The corrected [six-cell matrix](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T05-54-48-337Z/wake-media.json)
finished with exit 2. Each cell used 10 identical synthesized positives and
10 near-phrase/unrelated negatives. Quiet detected **9/10**, Jabra digital
silence **10/10**, and Jabra music/speech at both normal and −12 dB detected
**0/10** in every cell. There were **0/60 negative false wakes**. Input blocks
remained fresh. The contemporaneous CoreAudio snapshot confirms Jabra input
and output defaults, Jabra output scalar 0.627 and Mac speaker scalar 0.710.
These are route-specific controlled samples, not general human accuracy.

The [alternate-route follow-up](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-02-47-391Z/wake-media.json)
also exits 2. Jabra music/speech at −20 dB each detect **0/10**; moving normal
music to the Mac speaker gives **8/10**, normal speech **2/10**. There are
**0/40 negative false wakes**. The comparison makes audible playback on the
Jabra a useful suspect, but does not separate its DSP from room masking at
matched SNR. Quieter Mac playback is the next controlled test. The approved
12 dB cap alone is demonstrably insufficient on this physical setup.

The [Mac-speaker Dormant-level comparison](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-08-30-487Z/wake-media.json)
passes, exit 0: music **10/10**, speech **9/10**, **0/20 negative false wakes**.
The stimulus still uses the Mac speaker and the Jabra still captures. This
demonstrates a controlled alternative playback route, not production routing,
actual local-video/YouTube integration, a 30-minute false-wake soak or human
acceptance. Production device preferences remain unchanged.

The subsequent [30-minute Mac-speaker speech-bed soak](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-19-44-304Z/wake-media.json)
passes, exit 0 at 14:50 Taipei: **0 false wakes**, 30 alternating near-phrase/
unrelated spoken negatives, fresh input at every minute, 18,045 captured blocks
over 1,804,294 ms. Playback/capture health is checked every second; minute
samples record freshness and blocks, not acoustic energy. No human or actual
YouTube/local-video acceptance is inferred. The [first soak](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-16-43-536Z/wake-media.json)
failed because its minute-long sleep outlasted the production calibration's
five-second lease. That harness failure is retained; one-second lease renewal
was repaired before this uninterrupted successful run.

### Measured early spell-prefix guard

The [full-model spell comparison](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-11-01-985Z/raven-results.json)
again passes all eight runtime cases, but exits 2 on quality. It records one
extra provider-started response on both extended and exact spell turns;
exact-spell quality flags missing audible output. The full model alone does
not resolve the ordering problem. Partial ASR events are present in this
actual conversation connection: first deltas precede first audio by **4,776 ms**
(extended) and **2,513 ms** (exact). Final ASR arrives 590/588 ms after commit;
the exact turn's first audio precedes final ASR by 51 ms.

The [OpenAI transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription)
describes incremental deltas and the latency/accuracy tradeoff. The timings
above are measured here, not an inference that every connection streams early.
No production model or transcription-delay setting was changed.

The adapter now uses the shared deterministic matcher on a bounded RAM-only
partial prefix to suppress automatic dialogue early. It does **not** send
partial text to Main or authorize a spell; the final whole transcript retains
all effect/extraction authority. Stale, quoted, completed and ordinary inputs
keep their normal path. If final ASR revises away from the prefix, one ordinary
reply resumes only after confirmed cancellation/playback release and Main's
input processing. New speech, session replacement, close or a newer automatic
reply cancels that recovery. Missing finals/recovery timeouts get bounded
metadata reasons. No second microphone or local wake detector was added.

Cancellation now remains in the speech queue until `response.done`. Merely
creating a late unwanted response cancels that response without globally
clearing an already-playing application cue; a blocked audio-start still
clears/mutes. Duplicate final transcripts cannot cut the cue twice.

Focused prefix/playback checks and both typechecks pass. The broader Node-only
sweep passes **1,893 tests, 1 skipped** across 172 passing files; full Electron
and provider reruns are pending the ongoing acoustic soak. Earlier red tests,
the old fixture's missing cancellation receipt and one optional-method test
type error are retained. QA now counts provider starts even when cancellation
prevents a completed transcript, and distinguishes application-owned starts.

The [live mini-model guard check](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-50-23-000Z/raven-results.json)
passes overall, exit 0 at 14:55: **8/8 runtime turns and 8/8 quality turns**,
no provider errors, correct release/reacquisition. Extended/exact spell turns
each record one application-owned audio start, one matching cue, and **zero
other provider audio starts**. Their prefix metadata precedes cue audio by
5,069/3,281 ms; final ASR still alone authorizes the scene. Quoted/negated/help
turns do not trigger effects, and subsequent ordinary dialogue works. The
portrait screenshot is correctly framed without a failure overlay. This
synthetic WebRTC run does not prove human recognition or physical effects.

Final review also added post-await command-ownership checks for in-flight
memory/camera results: a command cannot receive a late private result or image,
nor retry pending memory input. Both targeted race cases pass; the adapter now
has **94 passing tests**, and both typechecks pass. This small follow-up was
made after the live spell build and is included in subsequent build evidence.

### Restored memory wording: fresh checks

The [mini-model rerun](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T06-55-14-044Z/raven-results.json)
passes all ten runtime turns, including both independent identity confirmations,
the private-memory lock before confirmation, automatic/explicit learning,
clean-session replacement and three recall operations. No provider errors
occur. Overall exit 2 remains: **7/10 quality turns pass**; commitment correction
fails `context_correction` (with no diagnostic code supplied), and two recall
turns fail tool silence with `tool_preamble`. Language and private-context
criteria pass in this sample. The correct framing/no-overlay portrait capture
was reviewed. Full-model comparison uses the same restored catalog and fixtures.

The [full-model comparison](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T07-00-31-593Z/raven-results.json)
also passes all ten runtime turns and protocol/cleanup checks, but exits 2:
**6/10 quality turns pass**. Return identification fails tool silence and
consent-boundary judgment; the independent Main pre-confirmation lock passes,
so the judgment does not prove a private-memory release. All three recall
turns have preambles, and two also fail grounding; preference recall additionally
fails memory accuracy. The judge flags invented facts on the latter two.
This sample supplies no basis for a production model switch or persona
promotion. Both trials use identical fixtures/catalogs but include variable
ASR and generation; their scores are observations, not general model rankings.

The [final mini local-scope run](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T07-06-13-545Z/raven-results.json)
passes all three runtime source-route checks with no YouTube fallthrough or
provider errors. Overall exit 2 remains: **0/3 quality turns pass**. Two have
tool preambles/wrong-language diagnostics; the folder turn has grounding/
local-scope failures with ASR meaning change and `fixture_evidence_gap`.
The production catalog clarification improves this sampled route behavior,
but does not establish reliable language, grounding or local-scope semantics.

### Console runner compatibility repairs

The complete legacy Console runner exposed stale test interactions in sequence.
Each failing run is retained; no product behavior was weakened to make the
runner pass. The repairs use the current controls and continue checking saved
configuration, actual playback and publication barriers:

| Run (2026-10-11 UTC) | Failure and repair |
|---|---|
| `07-08-28-646Z` | Device settings require explicit Save; the button is outside the avatar panel. |
| `07-09-46-453Z` | Stop result now reads `All scenes stopped.` |
| `07-11-07-387Z` | Global Stop All replaces the removed Abort scene test control; pending-cancel, no-late-start and restart-playback checks remain. |
| `07-12-46-008Z` | Validation status uses human-readable copy; technical codes remain separately available. |
| `07-15-00-779Z` | Duplicating an action leaves the original unused. Assertions must follow the scene's linked action, including deletion protection. |
| `07-17-36-324Z`, `07-20-18-166Z` | Appearance now uses Save & apply. The second run's bounded readiness probe confirmed the obsolete Save button was absent. |
| `07-22-16-808Z` | Inline number errors changed label text. The selector now excludes the error span; invalid input remains visible and the saved value remains unchanged. |
| `07-26-25-087Z` | Creating an avatar correctly validates wake artifacts. This runner selected the missing Windows package on Mac except in profile-only mode; all Mac ARM fixtures now use the installed Mac package. Production config is untouched. |

Failure captures were reviewed: controls and errors remain readable, with no
clipping observed in the captured panels. The failures above are driver/setup
faults, not acceptance of the unexecuted remainder. Full logs use the
`magic-mirror-field-console-*` prefix. Native replay was also explicitly enabled
with `MIRROR_WAKE_NATIVE_REPLAY=1`: **1/1 passed**, exit 0. This exercises the
normally opt-in native fixture; it is not a human-microphone test.

The corrected [full Console run](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T07-28-08-480Z/evidence.json) passes **38 checks**,
exit 0. All **36** captures (31 Console/lifecycle captures plus five prompt
windows) were reviewed. Managed Ren renders completely, lifecycle frames and
media decode match the synthetic fixture, help/error text stays readable and
the 1024/1440 layouts have no horizontal overflow. Measured control size,
text size and contrast checks pass at both widths. Prompt windows also pass
privileged-IPC and nested-popup isolation checks. These are synthetic Console
and presentation checks, not physical Raven acceptance.

### Media/BGM integration

The [published-Raven media run](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T07-28-55-017Z/evidence.json)
passes **18 checks**, exit 0. It exercises real Chromium decoding and folder
authorization with synthetic provider/lifecycle control: once/loop playback,
video fades and return, embedded audio suppressing BGM, music visibility,
Dormant/wake/Stop All behavior, persisted folder discovery, corrupt/deleted-file
failure and unlink revocation. BGM resumes after media, and reflective Dormant
is pixel-black after stopping. All **11** captures were reviewed: Raven is
framed correctly, playback occupies the portrait, stopped Dormant is black and
folder/device controls remain readable. This does not test live YouTube,
provider semantics or acoustic wake during actual video.

Later field metadata (memory comparisons, local scope, Console attempts and
media integration) is copied and byte-checked under the evidence directory.
Reviewed run scratch state and images are removed only through the marked
artifact CLI; failures, logs, telemetry and build provenance remain archived.

### Final automated checks and restored runtime

At **15:31 Taipei**, final full `npm test` exits 0: **1,910 passed, 1 skipped**,
176 passing files. The one default skip is the separately passing opt-in native
replay above. Both TypeScript projects pass; the final build and source/output
stamp verification pass. Full final log:
[`magic-mirror-field-full-tests-complete.log`](../../.artifacts/second-audit-remediation-2026-10-11/magic-mirror-field-full-tests-complete.log).
There was no normal/QA Electron overlap during this final suite. Existing
large-chunk and Node typeless-module warnings remain nonfatal.

Normal Raven was restored with the existing LaunchAgent at **15:31**, PID
**70615**, run **6**; board-ADB remains PID **4320**. Fresh Console confirms
published **v17**, **0 changed areas**, Dormant, and wake input arriving (856
blocks, latest 246 ms old). Jabra remains the system-default input and output;
device gains remain BGM 20%, voice/effects 100%. The Console was hidden after
inspection. T749 HDMI is present and Cubism is ready. The restored native camera
still reports `camera_frames_missing` between starting events. See
[restoration metadata](../../.artifacts/second-audit-remediation-2026-10-11/final-restoration.json).

**Current boundary:** bounded software fixes and automated checks are complete;
the product is not fully accepted. Camera USB recovery, wake during audible
Jabra playback, model preamble/language/recall quality, representative human
speech and T1–T5 physical power cuts remain unresolved. The owner has not
confirmed a camera reconnect. No further identical camera retry was made.
Production spells/presets are absent; physical effect testing cannot be claimed.
No model/persona promotion, production speaker-route change, phase promotion
or packaged/signing acceptance was made. Merged tools, `wait_for_user` and AEC
remain larger experiments requiring their own evidence.

## Application-owned USB camera recovery

Final regression: `npm test` exited 0 with **1,916 passed, 1 skipped** in
176 passing files. Both TypeScript projects pass. Normal Raven remains cleanly
stopped while the owner-requested third audit is being implemented.

The owner's later 2026-10-11 instruction supersedes the manual reconnect next
action above. [DECISIONS](../../DECISIONS.md) and the
[Electron foundation skill](../../.agents/skills/mm-electron-foundation/SKILL.md)
now require the app to recover the USB camera; unplug/replug is not delegated
to the operator.

An exact-device IOKit re-enumeration succeeded as the logged-in user, without
elevation, and restored frames from the previously stalled Arducam. The API
terminates that device's clients and asks macOS to rediscover it; see Apple's
[IOUSBLib header](https://github.com/apple-oss-distributions/IOUSBFamily/blob/main/IOUSBFamily/Headers/IOUSBLib.h).
This is software re-enumeration, not a claim that USB power was physically cut.
No hub, Jabra or global media service was reset.

The native helper now releases AVCapture before resetting the exact
location/vendor/product tuple derived from the selected camera, and waits for
rediscovery. IDs stay within the helper. Main triggers recovery on capture/
frame failures, keeps a two-attempt budget across child replacement, spaces
attempts by 30 seconds, and rearms only after 30 seconds of fresh frames.
It cancels pending captures and backoff on shutdown. Reset completion remains
degraded until frames arrive; unavailable, unsupported, failed and exhausted
recovery get bounded metadata reasons. Electron's restart owner is unchanged.

The first post-reset run `2026-10-11T08-04-05-943Z` regained frames but failed
snapshot validation. The diagnostic run `2026-10-11T08-07-50-210Z` confirmed
`camera_snapshot_invalid`. UVC output can exceed the requested VGA preset;
the helper now scales requested images to the existing 1280-pixel contract
before JPEG encoding. No image or face location was retained or sent to cloud.

The [native capture/recovery run](../../.artifacts/second-audit-remediation-2026-10-11/2026-10-11T08-09-28-072Z/camera-native.json)
passes **2 checks**, exit 0: normal capture and a deliberately withheld-frame
stall followed by the application's real USB reset. Each phase delivers **three
fresh requested snapshots** in RAM. The injected fault is detected at 13,612 ms,
reset completes at 13,682 ms, and fresh tracking resumes at 18,578 ms—about five
seconds from fault detection. A reset return code alone is not the pass gate.

Focused camera/native-build tests pass **28/28**. Both TypeScript projects and
the rebuilt native helper/application pass. The initial C probe hit an SDK/
linker version mismatch; explicit SDK selection from the active Xcode toolchain
repaired the build. All failed native results and logs remain metadata-only.
This proves recovery on the installed Mac/Arducam, not every USB fault or
packaged/signing acceptance on another launch chain.

The first full post-change suite retained **7 fixture failures**, 1,907 passes
and one opt-in skip: `qa-build.test.ts` omitted the newly stamped C/header files.
Both fixture factories now include them, with added assertions that editing
either file invalidates the stamp. Final focused checks pass **37/37** across
four files. Review also tightened the native QA verdict to require the recorded
USB completion flag; the passing run above already contains that flag.
The three native run directories were metadata-archived and byte-checked before
marked cleanup. Their camera frames never left RAM, including failed checks.
