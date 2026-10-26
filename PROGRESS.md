# Magic Mirror — current handoff, 2026-10-26

Repaired MusicLoop silent playback: the native route now mirrors one stereo
stream across the three macOS outputs, instead of concatenating them into six
channels. A new native guard rejects the incorrect route. The previous QA's
advancing-clock/sub-device checks did not prove duplicated output.
MUSIC LOOP now leaves TV power/ADB, orientation, mouse and black cover alone, per
the owner's clarification. STOP retains global shutdown/black/Jabra policy.

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

- **130/130 focused button/TV tests pass**. New case proves no TV, orientation,
  blackout or mouse dependency for music; STOP still stops Main. Build, native
  signature, script syntax and fingerprint pass. No model/dependency/config edit.
- Actual Mac native A/B: original output buffers `[2,2,2]`, corrected `[2]` with
  all three sub-devices active. Corrected production helper played both actual
  cached MP3s for eight seconds after each acknowledgement. Guard negative test
  rejected the original routing with `operator_loop_music_route_incomplete`.
- Current source `5830f8b0ff4fb236`, output `915626e92258cce1`, built
  **2026-10-26 16:07:35 Taipei**. Latest native helper and canonical app deployed;
  LaunchAgent restarted and renderer ready. Jabra final **70.077%**; other output
  levels/mutes and all input/default devices preserved. Owner's physical MUSIC
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
