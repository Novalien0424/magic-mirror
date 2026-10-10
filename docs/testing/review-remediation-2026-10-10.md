# Review remediation — 2026-10-10

Requested by the owner after the media/BGM/TV work: systematically verify and
resolve the findings in [the performance, correctness and UI/UX review](performance-correctness-uiux-review-2026-10-10.md).
The original review is preserved. This ledger records current-code conclusions,
focused checks and remaining physical acceptance, without conversation content.

## Work groups

| Group | Findings | Status |
| --- | --- | --- |
| Main lifecycle, config hot paths and host services | PE-01, PE-02, PE-07, PE-08, PE-10, PE-11, PE-12; CO-01, CO-04, CO-08, CO-11, CO-13; MM-01, MM-02, MM-03, MM-06 | Implemented; [Main report](review-remediation-main-2026-10-10.md), 284 focused tests plus native wake replay. Actual Active renderer crash/recovery passed. |
| Memory correctness and worker lifecycle | PE-03; CO-03, CO-05, CO-06, CO-07, CO-09, CO-10, memory portion of CO-12; MM-05 | Implemented; [memory report](review-remediation-memory-2026-10-10.md), 211 focused tests plus root integration below. Four real-provider calendar cases passed. |
| Renderer/audio efficiency and recovery | PE-04, PE-05, PE-09, PE-13, PE-14, PE-15; CO-02; MM-04; MX-05, MX-06, MX-08, MX-09, MX-11, MX-12 | Implemented; focused renderer tests and actual Raven UI/media evidence below. Exact scene ordering passes; spontaneous spell speech still fails quality. |
| Console operability and presentation | PE-06; CX-01 through CX-14; MM-07 | Implemented; actual narrow Console, preset undo, Stop All, model review guard, server field focus and unavailable polling passed. |
| Guest failure presentation and operator phrases | MX-02, MX-03, MX-04, MX-07, MX-10; camera/player portion of CO-12 | Implemented; Chinese fallback captures, local wake cue measured at 16 ms after entering phase. Published typo corrected through Console; only two sleep fields and configVersion changed. |
| Intentional behavior | MX-01 | Healthy reflective Dormant stays completely black, per the owner's ruling. No guest wake hint will be added. |

The seven MM findings explicitly listed by this review are included. Other
findings from the separate whole-project review are referenced only when needed
to resolve these changes correctly; they are not silently claimed complete.

## Verification policy

Each group gets the smallest meaningful regression checks. Renderer changes also
get isolated Electron captures where they affect visible behavior. Provider
conversation evidence uses the actual Raven persona and real API, with synthetic
input clearly distinguished from human and physical wake acceptance. Normal
Electron and QA never overlap. Operator edits, dependencies, runtime model IDs,
exact spell authorization and private-memory ownership remain protected.

## Results

### Renderer and Console implementation

- **PE-04/05, CO-02:** paused Cubism consumes no animation frames while hidden;
  resume resets timing. Runtime metrics coalesce at 10 Hz, deduplicate unchanged
  values, normalize reason codes, and send device enumeration only on change.
  Main retains the last device view when omitted and bounds rejection telemetry.
- **PE-09/13/14/15, MM-04:** suspend unused media audio, avoid test-WAV preload,
  cache impulse buffers and Cubism IDs/matrices, make interruption immediately
  silence local output, and minify renderer bundles (the prior ~2.5 MB shared
  chunk becomes ~1.14 MB). No speculative chunk-splitting refactor.
- **PE-06/CX-03:** status subscribers alone receive the guarded, deduplicated
  runtime poll; editing no longer rerenders the Console root twice a second.
- **CX-01/02/13:** friendly recovery text with expandable technical details;
  persistent liveness/wake/audio strip, honest polling-unavailable banner and
  explicitly inferred mic-owner label.
- **CX-04/05/14:** English document language with Chinese-example spans,
  responsive single-column forms, compact narrow toolbar, unoccluded save bar,
  neutral disabled Delete with its explanation beside it.
- **CX-06/10/12:** immediate reachable scene-removal Undo, voice-preset Undo,
  inline discard/memory-off confirmation, Stop All outside disabled fieldsets
  and present on Memories, one persistent scene result announcement region.
- **CX-07:** numeric fields preserve partial typing and clamp on blur. Main returns
  safe field paths, mapped against the submitted snapshot to stable public IDs;
  the Console opens the correct section, shows the inline error and focuses its
  control. Invalid saves write nothing. Worker checks pass 42 tests; integrated
  Console/fixture checks pass 68. The initial SSR fixture failures were repaired
  with production-equivalent automatic JSX and server snapshot functions.
- **CX-08/09/11:** readable action labels, simulation preset choices, explicit
  missing physical-adapter disclosure, per-stage missing-OFF warning, change
  scope count, amber simulation/neutral disabled/information styles and current
  platform-neutral button/help copy. A physical preset catalog is not invented.
- **MM-07:** shared model changes prevent one-click Save & apply and appear in
  the explicit publish review. QA never publishes its isolated model draft.
- **MX-02/03/07:** full-size Chinese OfflineLoop/Maintenance/error presentation
  remains visible outside the hidden reflective stage. Healthy Dormant stays
  black as requested (**MX-01**, not a defect).
- **MX-04/06/08/09/12:** a short local wake tone, bounded Thinking with no output,
  Scene state and listening/speaking overlay, landscape edge feather and reason
  event, stable media host that preserves running fades.
- **MX-05:** an application-authorized exact full transcript starts its approved
  scene before the supplied cue completes. Later VAD can interrupt speech but
  cannot revoke that completed authorization. Duplicate/stale-session rejection,
  session cleanup and Stop remain enforced. This follows the requested review's
  recommended ordering change and supersedes older cue-before-effect evidence.
- **MX-10:** corrected published/default sleep spelling, Chinese fallback for
  unknown-language identity questions and natural Chinese policy disclosure.
  The durable default wake phrase `魔鏡阿魔鏡` is intentionally retained.
- **MX-11:** reduced-motion skips ritual video and uses a short fade; normal
  ritual brightness is reduced. This is mitigation, not a photosensitivity
  certification for arbitrary imported clips.

### Memory integration and script variants

Main now receives storage recovery reports. The extractor uses venue-local
observation time, date-only calendar events, and original offsets for explicit
instants. The renderer buffers one post-tail answer while the question-delivery
receipt is in flight and releases it only after Main accepts that receipt.

**CO-07 is implemented after the memory worker's initial handoff.** The requested
review explicitly suggests OpenCC; `opencc-js` **1.4.2** is pinned, with no
transitive dependencies. Only Main imports its Traditional-to-Simplified module
for candidate comparison. Exact stored labels take priority; a unique folded
candidate is proposed using its existing label and still requires verbal
confirmation. Collisions return a reason and ask for the existing distinct
label. No database keys, existing owner scopes or memories are migrated/merged.
This uses [OpenCC's maintained conversion data](https://github.com/nk2028/opencc-js),
not a hand-written partial character map or model identity guess. Four focused
files pass **119 checks**, including both identify/recall routes, no private
brief before confirmation, ambiguity, exact-label precedence and separate
stored scopes. The initial three failing new tests omitted required tool names;
their full failure output is retained and the fixtures were corrected.

### Runtime evidence

All paths below are local ignored artifacts; screenshots contain isolated Raven
fixtures, not operator memory/transcripts.

- `.artifacts/phase4-qa/2026-10-10T15-31-55-055Z/evidence.json`: **17 checks,
  9 captures, exit 0**. Includes actual Active renderer crash → replacement
  Dormant → wake, hidden FPS 0 and visible resume, Chinese failure views,
  narrow Console and model-review boundary. Wake cue **16 ms** from rendered
  entering phase, context closed. Four real-provider date extractions passed:
  Taiwan-midnight tomorrow/yesterday, explicit historical date, undated history.
- `.artifacts/phase4-qa/2026-10-10T15-32-40-376Z/evidence.json`: **18 checks,
  11 captures, exit 0**, Raven media/BGM after the integrated audio/Main changes.
- `.artifacts/phase4-qa/2026-10-10T15-34-33-524Z/raven-results.json`: retained
  **exit 2**. Model wrongly selected sleep for a negated dismissal; the remaining
  spell cases then lacked an active session. Updated the existing compact sleep
  instruction with whole-request intent and two short stay-awake examples. QA
  now preserves that failure but recovers for independent subsequent spell checks.
- `.artifacts/phase4-qa/2026-10-10T15-55-00-541Z/raven-results.json`: **exit 2**.
  Negated sleep now stays Active, and directed sleep completes farewell and mic
  handoff. Quoted/extended spells run no scene. Exact spell failed final ASR;
  the strict application matcher correctly withheld effects. Negated-sleep
  dialogue also failed the preamble quality check. Other six quality turns passed.
- `.artifacts/phase4-qa/2026-10-10T16-05-46-897Z/raven-results.json`: one focused
  diagnostic retry, **exit 2**. Fresh exact spell has edit distance 0, runs the
  scene before the cue completes, and directed sleep passes. Exact spell still
  emits one non-cue output response and fails quality. Request/acknowledgement
  field metadata is retained; absent keyword echo does not prove ignored hints.
  No fuzzy authorization or dialogue-regex suppression was added. This separates
  variable recognition from spontaneous dialogue that can precede final ASR.
- `.artifacts/phase4-qa/2026-10-10T16-02-47-844Z/evidence.json`: **exit 2** overall,
  although all 14 UI checks passed. The fourth calendar provider case returned
  an invalid proposal after three passes. Added fixed metadata-only validation
  reasons, and split provider calendar checks from UI checks. The earlier four
  calendar passes remain valid evidence, not a guarantee of every provider reply.
- `.artifacts/phase4-qa/2026-10-10T16-08-33-889Z/raven-results.json`: final media
  **exit 2**. All four runtime turns pass: explicit folder-only, a new English
  local→YouTube→play request, conversation after natural completion, and Chinese
  local→YouTube→play. No provider transport errors. Three control turns fail
  preamble quality; two also fail language and one completeness. Follow-up
  conversation passes. Compact instructions do not guarantee model compliance.
- `.artifacts/phase4-qa/2026-10-10T16-10-47-726Z/evidence.json`: diagnostic
  calendar retry **exit 0, all four cases pass**. The prior invalid proposal
  cannot be classified retrospectively because raw output is not retained;
  future failures now report the fixed validation category without content.
- `.artifacts/phase4-qa/2026-10-10T16-11-11-415Z/evidence.json`: final UI-only
  **exit 0, 14 checks and 10 captures**. Includes actual renderer crash recovery,
  hidden/resumed rendering, wake cue, Console operations and field-error focus.
  Final invalid-name screenshot inspected: heading wraps, input error visible,
  keyboard focus retained. Both final typechecks and production build exit 0.
  The diagnostic extractor/fixture check passes 44 tests; invalid-IPC summary
  regression passes 30 tests. Build retains its existing large-chunk advisory.
- `.artifacts/review-remediation-2026-10-10/operator-phrase-publish.json`:
  actual Console save/check/publish. Active avatar unchanged; only the two
  `sleepPhrase` fields and `configVersion` changed. Ordinary Electron exited 0.
- The obsolete installed privileged HDMI script/plist now match the inert repo
  copies. The daemon stays disabled/unloaded; the independent root ADB service
  remains enabled. Native camera backoff compiled in the production prebuild.

The first UI run failed because its no-TV functional mode lacked the explicit
virtual-display QA permission; that harness was repaired and its failure log
retained. Screenshot inspection confirmed the corrected narrow toolbar and neutral
disabled Delete border. The invalid-name capture exposed heading overflow, now
wrapped and covered by the rendered check. No TV portrait,
physical Jabra wake, camera watt/RSS, or new human conversation acceptance is
claimed from synthetic/provider/virtual-display checks.

### Deployment and remaining limits

Completed on 2026-10-11 Taipei time. The canonical checkout production build was
launched through `com.magicmirror.launchagent`, with its existing sole restart
ownership and `MIRROR_TV_HOST=192.168.77.2`. Main observed both connections absent
for **15.042 seconds**, then exited **0**. No app/embedding/camera workers remained;
all five operator settings files were unchanged. Only Mirror was created during
normal boot. No shutdown-failure or snapshot-delivery error appeared in the new
startup/teardown markers. Root ADB remained running and the retired HDMI daemon
disabled. Installed inert HDMI files match the repository and remain root-owned.
Evidence: `.artifacts/review-remediation-2026-10-10/deployment.json`.

The current app is stopped because the TV is absent. After reconnecting/powering
the TV, start Magic Mirror through its LaunchAgent or the future button. This is
field checkout deployment, not a newly signed/packaged release or cold-boot pass.

Final diff/whitespace review completed. All requested review IDs have a scoped
resolution; this does **not** mean every conversation passes. Extra tool/spell
speech, some wrong-language replies and variable ASR remain real failed quality
evidence. The single rejected calendar proposal was not retained as raw content,
so its exact invalid field remains unknown; validation prevented a bad write.
Physical wake under loud media, actual TV/Mac cold boot, watt/RSS changes and
live Wi-Fi RCA remain separate acceptance work. No new model, intent regex or
confirmation gate was added to hide those limits. Invariants **1–12** were checked
at the changed boundaries; no phase promotion is claimed.
