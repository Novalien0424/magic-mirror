# Media review and YouTube integration — 2026-10-09

Raven can discover and play indexed media from its own and shared folders.
The implementation now supports contextual local lookup and YouTube search and
playback. All five live YouTube checks and 17 local-media functional checks pass.
Following the user's deployment authorization, the verified build is running
through the existing LaunchAgent, PID **40509**, with Dormant and wake-listening
startup evidence. Operator settings hashes are unchanged. QA used synthetic
content and no private memory or physical microphone input.

## Requested behavior

- No source specified: search the avatar's allowed local library first; use
  YouTube when no suitable local match fits the current conversational clues.
- Explicit YouTube: search YouTube directly. Explicit local folder/vault requests
  in English or Chinese stay local unless the visitor asks to broaden the search.
- A clear match can play immediately; ambiguous results prompt a short clarification.
  Lookup uses public titles and aliases and does not reveal filesystem paths.
- Play once by default. Completion restores conversation and the avatar's normal
  presentation. Loop only on an explicit request; after playback is confirmed,
  Realtime releases the microphone and Main enters Dormant with local wake detection.
  Wake or operator Stop interrupts the loop through the existing media owner.
- YouTube video and music use a visible official embedded player. Music keeps the
  avatar above the player. YouTube uses the system audio output; a different saved
  app output produces a metadata-only degradation event. BGM/effects volume applies.

The shared tool catalog supplies contextual matching and ambiguity instructions.
The application enforces local-only English/Chinese source restrictions and local
lookup before source-unspecified YouTube requests. It waits briefly for final ASR
and rejects network actions if the source is still unknown; raw words stay in RAM.
Permission, ownership, stale results, resource access and playback transitions
remain application-controlled. Live intent acceptance is partial, as detailed below.

## Review findings repaired

1. **P1: Dormant could kill the requested loop.** A cached scene executor retained
   a global stop action. Retiring that executor before standalone media ownership
   prevents the Dormant transition from stopping the newly acknowledged loop.
2. **P1: stalled music could suppress conversation indefinitely.** Local music now
   retains a progress watchdog after startup. A 15-second lack of playback progress
   reports failure and releases media ownership. Analyser silence alone is diagnostic.
3. **P2: an older fade could complete a newer track.** Controller callbacks now
   carry the originating action context and invalidate obsolete generations/timers.
   A fade completion is not treated as natural completion of standalone media.
4. **P2: stale media reports disappeared silently.** Obsolete reports are consumed
   with a metadata-only reason. Pending loop handoffs also check the exact run ID.
5. **P1: source routing could contradict the visitor's request.** Live tests found
   obsolete local-miss instructions and a model attempt to broaden an explicit
   vault request. The catalog conflict is removed; a RAM-only source policy now
   blocks that attempted search/playback and missing-local-lookup bypasses before
   network access. Adapter regression replays the observed failure sequence.
6. **P2: exhausted YouTube quota could be misreported as a denied key.** Bounded
   error parsing now distinguishes YouTube's HTTP 403 quota reason from denial.

The Main-owned YouTube player shares this lifecycle. Its sandboxed view has no
preload, file access, microphone permissions, or privileged Mirror bridge. It uses
an in-memory session, blocks downloads/popups/navigation, and reports bounded
startup/progress errors. The desktop embed sends the app's required Referer.

## Files

- Local discovery and source enforcement: `src/shared/media-discovery.ts`,
  `src/shared/media-source-policy.ts`, `src/shared/realtime-events.ts`,
  `src/shared/media-skill.ts`, `src/shared/bridge.ts`, `src/shared/youtube-*.ts`.
- Main providers and ownership: `src/main/avatar/youtube-*.ts`,
  `src/main/avatar/media-skill-runtime.ts`, `src/main/ipc.ts`, `src/main/index.ts`.
- Tool routing and playback: `src/preload/mirror.ts`,
  `src/renderer/realtime/realtime-{tool-bindings,session-adapter,runtime-dependencies}.ts`,
  `src/renderer/mirror/App.tsx`,
  `src/renderer/avatar/audio/avatar-media-controller.ts`, and the shared
  `resources/config/prompts/realtime-tools.v1.json` catalog.
- Isolated QA: `src/main/{youtube,media-intent,media-skill}-qa.ts`, corresponding
  scripts and Main build entries. `src/main/boot.ts` extends its existing offline
  sleep seam for simulated media sessions; production microphone handling is unchanged.

Media code is committed as `37211fa`. Existing memory work and its unresolved
acceptance findings were preserved separately in `d2d7180`, so the pushed source
can reproduce the deployed workspace. No dependency/model change or phase promotion.

## Configuration

Main reads `YOUTUBE_API_KEY` from the ignored root `.env`; the key value was never
inspected or printed by the agent. It is separate from `OPENAI_API_KEY` and is never
sent to the renderer/model. Missing credentials or service errors return bounded
reason codes and leave conversation available.

Enable **YouTube Data API v3** in the key's Google Cloud project and restrict the
key to that API. Standard search is available within the project's free quota;
Google documents a default 100 `search.list` calls/day. Check the project's quota
console for its actual allocation. OpenAI conversation usage remains separate.

## Verification and remaining boundaries

**392 tests passed across 20 focused files**, covering local discovery, ownership,
IPC, shared catalog, Realtime tooling, local audio, presentation, and wake
activation and the offline boot seam. This is 375 media checks plus 17 boot checks;
the boot follow-up also reran 47 overlapping IPC tests. Node/web typechecks,
production build, and diff checks passed.
No full Electron smoke/full suite was run.

[Focused logs, including initial test failures](../../.artifacts/media-review-2026-10-09/).
The initial expectation failures were corrected; their logs remain available.

Live Mac runs, each using synthetic public content and zero player gain:

| Run | Established | Failure / unverified |
| --- | --- | --- |
| [First run](../../.artifacts/youtube-qa/2026-10-09T13-15-57.650Z/evidence.json) | Configured search returned candidates | Player error 153 (missing desktop Referer). Fixed; the original runner's clean exit did not mean acceptance. |
| [One retry](../../.artifacts/youtube-qa/2026-10-09T13-17-50.287Z/evidence.json) | Configured search and official-player playback time advanced | `qa_execution_failed` during capture, before once/loop checks. Runner correctly exited 2. |
| [Authorized completion run](../../.artifacts/youtube-qa/2026-10-09T13-31-18.320Z/evidence.json) | Search, advancing playback, once completion and loop boundary | Stop assertion checked before Electron asynchronously destroyed the view. Fixed to await actual destruction. |
| [Final retry](../../.artifacts/youtube-qa/2026-10-09T13-32-29.374Z/evidence.json) | **All five checks pass, exit 0**, including Stop release | Native capture unavailable; no YouTube visual/physical audio acceptance. |

An offline reproduction identified the capture error exactly:
`Current display surface not available for capture`; parent-window capture was
empty. This is consistent with the display's stopped/sleep state, but no claim is
made that its exact OS cause has been proven. The QA harness now records missing
capture separately, gives stage-specific failure reasons, and continues lifecycle
checks. API mutation scripts return `void` so player objects never need to cross
Electron's result serialization boundary. The runner rejects missing/partial or
failed evidence even if the process exits cleanly.

The [local functional run](../../.artifacts/phase4-qa/2026-10-09T13-49-34-265Z/evidence.json)
passed **17 checks, 11 captures, active music analyser**, exit 0. It covers actual
decoded own/shared media, natural once completion/return, both loops crossing
their end while Dormant, simulated wake plus authenticated Stop, Console Stop,
failed files, refresh/revocation and persistence. Inspected screenshots show
full-frame test video, Ren restored after video, and Ren retained during music.
These are synthetic Ren fixtures, not Raven appearance acceptance.

The original portrait run stopped with `phase4_qa_portrait_display_required`
because macOS reports one 1920×1080 landscape display. Its portrait gate remains
unchanged. The separate `--media-skill-functional` mode explicitly excludes
portrait acceptance. Its first attempt exposed a QA seam mismatch: simulated
sessions tried to stop a nonexistent renderer Realtime session and entered
Maintenance. The existing `completeSleepForDemo` seam now also handles requested
media sleep; the corrected functional run passes. Failed artifacts remain at
`2026-10-09T13-46-03-941Z` and `2026-10-09T13-47-36-115Z` under `.artifacts/phase4-qa/`.

Two synthetic live intent runs used **45,268 reported Realtime tokens** with the
versioned model and shared prompt/tool catalog. The first found the local-miss
instruction conflict. The retry passed default local once, local-to-YouTube
fallback and explicit Chinese YouTube, then exposed the vault-source violation.
[First evidence](../../.artifacts/media-intent-qa/2026-10-09T13-36-51.944Z/evidence.json),
[retry evidence](../../.artifacts/media-intent-qa/2026-10-09T13-37-58.323Z/evidence.json).
The deterministic source guard and regression repair followed; no third external
intent run was made. The complete live intent matrix is not a pass. Contextual
follow-up, ambiguity, and remaining Chinese cases retain unit/catalog evidence,
not fresh end-to-end model acceptance. Physical speaker and real spoken-wake
accuracy still require an in-person check; previous wake evidence is historical.

Reproduction after authorization: `npm run build`, then
`node scripts/run-youtube-qa.mjs`. This opens only the isolated QA entry, performs
one synthetic search and official-player checks, writes metadata to
`.artifacts/youtube-qa/<timestamp>/`, and exits. Additional commands are
`node scripts/run-phase4-qa.mjs --media-skill-functional` and
`node scripts/run-media-intent-qa.mjs`. Preserve operator edits and cleanly stop
normal Raven before any isolated Electron run; never overlap them. New external
retries require the applicable user authorization.

## Deployment

The established Mac checkout LaunchAgent runs the canonical Electron executable
against this workspace's stamped `out/` build. Packaging or a new signing chain
is not part of this deployment. Main, native camera and wake workers started;
fresh metadata records local-ready → Dormant, folder index ready, worker ready
and worker listening. The agent remains the sole restart owner. Build hashes
were verified after launch; five operator-setting files matched their before hashes.

[Deployment record](../../.artifacts/media-review-2026-10-09/deployment.json),
[startup events](../../.artifacts/media-review-2026-10-09/runtime-start-events.json),
[deployed build stamp](../../.artifacts/media-review-2026-10-09/deployed-build.json).
Computer Use app inspection returned `timeoutReached` twice, so no current Raven
visual acceptance is claimed. The runtime was left running as requested.

Applicable invariants checked: 1 (metadata-only diagnostics), 3 (no private IDs
in discovery DTOs), 6 (media control turns skip extraction), 7 (existing exact
spell boundary preserved), 8 (microphone handoff ownership), 9 (visible/reasoned
degradation), 10 (YouTube failure does not gate conversation), 11 (unchanged
runtime models), and 12 (Main-only root credential boundary). Identity/memory
invariants 2, 4 and 5 were not changed.

## Primary references

- [YouTube search API](https://developers.google.com/youtube/v3/docs/search/list)
  and [quota](https://developers.google.com/youtube/v3/getting-started#quota-usage).
- [YouTube error reasons](https://developers.google.com/youtube/v3/docs/errors).
- [IFrame player states/errors](https://developers.google.com/youtube/iframe_api_reference)
  and [single-video loop parameters](https://developers.google.com/youtube/player_parameters).
- [Desktop embed identity](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity)
  and [visible-player policies](https://developers.google.com/youtube/terms/developer-policies-guide).
