# Audio playback audit — 2026-09-15

## Findings and repairs

The shared background duck gain had two responsibilities: speech ducking and BGM stop/lifecycle fade. Consequently, stopping BGM also silenced embedded video; a Dormant preview inherited zero gain. BGM lifecycle stop also failed to invalidate pending file loads, and a subsequent wake cancelled the pause timer.

`avatar-media-controller.ts` now fades only the BGM's own gain when stopping music. The shared gain handles avatar speech ducking only. Music stop/lifecycle exit invalidates pending loads; play checks the request generation again after audio routing resumes. Returning Active does not restart stopped music or cancel its pending pause. An explicit new play command cancels the old stop timer and resets the BGM gain ramp.

Mirror preload now accepts and preserves supported Voice Studio snapshot fields. Scene video enables anonymous CORS before assigning its managed-media URL, allowing its track into Web Audio.

## Playback rules in current code

| Trigger/state | Sleeping ambience | Scene/test BGM | Avatar speech | Embedded scene video |
| --- | --- | --- | --- | --- |
| Dormant / asleep | Configured ambience loops | Previous BGM stops; explicit Console preview is allowed | No conversation output | No automatic scene; explicit Console preview is allowed |
| Wake / activating | Fades to zero in 500 ms, then pauses | Does not automatically restart | Starts through Realtime; configured greeting is optional | Previous scene does not automatically restart |
| Active, listening | Paused | Plays when a music action requests it | No generated output until the response plays | Plays when a visual action requests it |
| Avatar output starts | Already paused in normal conversation | Shared duck multiplier ramps to 0.22 in 150 ms | Full configured avatar output level | Same 0.22 multiplier |
| Avatar output ends / is interrupted | Lifecycle controlled | Shared multiplier restores to 1 in 400 ms | Output owner ends or interrupts playback | Same restoration; this does not restart stopped media |
| Stop BGM | Remains lifecycle controlled | Generic test stop fades for 2 s then pauses; scene stop uses its authored fade, with 0 meaning immediate pause/reset | Continues | Continues |
| Video ends / is stopped / is replaced | Unaffected | Unaffected unless the scene itself ends or releases music | Unaffected | Audio disconnects; video pauses and releases its source |
| Scene completes / is replaced / Stop scenes | Unaffected | Scene-owned music is released immediately | Dialogue follows the Realtime owner | Scene-owned video is released |
| Active → suspending / Dormant | Ambience fades in during exiting/asleep | Main releases scene resources; renderer fades any remaining test BGM and cancels pending loads | Farewell/output completion follows the existing sleep owner | Main and renderer stop the scene visual |
| OfflineLoop | Presentation ambience stops; fallback video is muted | Stops, pending loads cancelled | Realtime cleanup owns stopping voice | Stops |

Only **avatar output** drives ducking. Visitor speech by itself does not duck background audio; interrupting avatar output restores the background gain. Appearance previews use `silent`, while Voice Studio audition has its own explicit start/stop/cancellation owner.

There are two sources controlled by the System **BGM** volume: sleeping ambience and scene/test music. The scene/test **Stop BGM** command stops the latter; sleeping ambience follows presentation lifecycle. This distinction is existing behavior, not a new global stop command.

## Effective gain and ownership

- Sleeping ambience: `ambienceGain × System BGM volume`, with a 500 ms presentation fade.
- Scene BGM: authored music gain/stop fade × System BGM volume × avatar-speech duck gain.
- Embedded video: authored video gain × System Sound effects volume × avatar-speech duck gain. `Muted` disables the track.
- Avatar voice: voice gain × System Avatar volume, through the processed output path.
- The sleeping background video and OfflineLoop video are always muted.

Code owners:

- [Presentation lifecycle](../../src/renderer/avatar/presentation-controller.ts) and [ambience playback](../../src/renderer/avatar/PresentationStage.tsx).
- [Music, voice gains and embedded audio graph](../../src/renderer/avatar/audio/avatar-media-controller.ts), [speech ducking](../../src/renderer/avatar/audio/music-ducking.ts).
- [Video start, end and teardown](../../src/renderer/mirror/scene-visual-controller.ts).
- [Scene resource cleanup](../../src/main/scenes/scene-runtime.ts), [Main dispatch](../../src/main/ipc.ts), and [leaving Active](../../src/main/index.ts).

## Evidence and limits

89 focused tests / 7 files passed, including bridge validation, media gain independence, delayed music-load cancellation, presentation states, ducking and scene cleanup. Web typecheck and final stamped build passed. The existing unrelated Node declaration issue is recorded in the [repair report](wake-audio-fix-2026-09-15.md).

Fresh Windows Electron QA passed seven checks: real Realtime activation with Voice Studio options; embedded video output signal in Dormant preview and Active; continued video signal after Stop BGM in each state; silence after each video ends. Two portrait screenshots were inspected. The meter measured the final background bus after ducking, before the audio device. QA used synthetic media, synthetic avatar settings and a silent synthetic microphone stream, and collected no conversation content. Temporary measurement hooks were removed and the final source rebuilt.

Evidence: [run result](../../.artifacts/phase4-qa/2026-09-15T07-45-34-602Z/evidence.json). Actual spoken wake detection, human voice quality, physical speaker output and echo remain operator checks. This audit does not claim those were verified by the meter.
