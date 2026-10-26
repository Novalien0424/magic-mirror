# Magic Mirror — current handoff, 2026-10-26

Latest request: read-only audit of Studio's complete image prompt after the
owner reported a watercolour appearance. Published Raven v21 and its saved draft
both contain the modern minimalist multicolour vector style, no image-template
overrides, and implicit Sticker type. Published quality is medium; the saved
draft's low quality is unpublished. The shared builder/provider dry run passes
the assembled prompt unchanged (1024×1024 transparent PNG); 13 focused provider/
inspector tests and build fingerprint pass. No provider generation, settings
change or runtime restart. Past visitor answers/artwork are not retained, so the
reported image's visual cause is unproven. Confirmed limitations: rendering-time
chat cannot alter the already submitted image; sticker revisions preserve the
existing emblem/colours and omit the initial frame's explicit no-texture/shadow/
glow rules. Conversation-mode image requests do not inherit Studio artStyle
(current saved Mirror mode is Conversation; not evidence of the reported visit).
Next Studio action: make explicit restyling compatible with revision preservation
and verify a fresh result visually if the owner requests repair. A first local
prompt probe returned the prompt but emitted Vite dependency-scan shutdown
warnings; a repeat with discovery disabled passed without warnings.

Repaired MusicLoop silent playback: the native route now mirrors one stereo
stream across the three macOS outputs, instead of concatenating them into six
channels. A new native guard rejects the incorrect route. The previous QA's
advancing-clock/sub-device checks did not prove duplicated output.
MUSIC LOOP now leaves TV power/ADB, orientation, mouse and black cover alone, per
the owner's clarification. STOP retains global shutdown/black/Jabra policy.
Latest follow-up: each accepted MUSIC LOOP press sets and verifies Jabra at 70%
once before the mode command. Physical volume buttons remain free afterward;
there is no per-track/timer enforcement. Repeat presses reset volume without
restarting the track. Failed resets are recorded while other outputs continue.

MusicLoop accepts audio **up to 100 MB (100,000,000 bytes)** and skips larger
files as abnormal before downloading. Ready tracks loop while remaining files
prepare, then completed tracks join at a boundary. Mode commands acknowledge
promptly; Console shows preparing/downloading/playback/error status. Repeated
MUSIC LOOP is idempotent. STOP and mode changes cancel preparation and playback.
Shared `AI_Stuff/AI_Avatar/Common/MusicLoop` now contains the owner's **two MP3s**
(4.85 MB and 1.25 MB). **VIDEO LOOP** remains the Neo top-row third key label.

[Silent-output diagnosis, repair and evidence](docs/testing/music-loop-routing-2026-10-26.md) ·
[route checks/build](docs/testing/music-loop-routing-checks-2026-10-26.json) ·
[download journey and retained failures](docs/testing/music-loop-downloads-2026-10-26.md) ·
[operator instructions](deploy/macos/stream-deck.md).

## Current evidence and runtime

- **133/133 focused button/TV tests pass**. Latest coverage checks one-shot 70%,
  ordering/repeat presses, manual-volume preservation and reset failures. Existing
  cases prove no TV, orientation,
  blackout or mouse dependency for music; STOP still stops Main. Build, native
  signature, script syntax and fingerprint pass. No model/dependency/config edit.
- Actual Mac native A/B: original output buffers `[2,2,2]`, corrected `[2]` with
  all three sub-devices active. Corrected production helper played both actual
  cached MP3s for eight seconds after each acknowledgement. Guard negative test
  rejected the original routing with `operator_loop_music_route_incomplete`.
- Current source `5830f8b0ff4fb236`, output `915626e92258cce1`, built
  **2026-10-26 16:07:35 Taipei**. Latest native helper and canonical app deployed;
  LaunchAgent restarted and renderer ready. Native reset measured **70.077%**;
  the later launcher-only change preserved active owner music and its volume.
  Other output levels/mutes and all input/default devices preserved. Owner's physical MUSIC
  LOOP/audibility check has been requested and is pending.
- Earlier **29/29 rendered journey**, 284 focused tests and 100 MB copy/cache
  evidence remain valid for unchanged controls/download handling. They do not
  establish physical speaker output; the route acceptance gap is documented above.
  Their cleaned artifacts and full failed attempts remain linked in the report.

## Next action / scope

Complete owner's live MUSIC LOOP check on the corrected build. STOP then MUSIC
LOOP refreshes files/retries downloads. TV standby/mouse transport remains a
separate display-control issue; music no longer uses it. Output hotplug and
inter-device latency remain unmeasured; no cold cloud hydration claim.

The **LLM-led full-catalog media selection redesign** remains deferred in
[TODO](TODO.md), with [research and acceptance plan](docs/testing/llm-media-catalog-design-2026-10-25.md).
MusicLoop does not establish conversational search or human name/ASR acceptance;
prior voice-quality provider QA remains **not green**. Preserve Raven character.

[Previous MusicLoop delivery/handoff](docs/archive/progress-before-music-loop-downloads-2026-10-26.md)
links the initial native player/button evidence and earlier media/name work.
[DECISIONS](DECISIONS.md) owns rulings. No phase promotion.
