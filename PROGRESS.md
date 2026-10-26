# Magic Mirror — current handoff, 2026-10-26

Latest delivery: MusicLoop now accepts **200 MB**. Studio redraws preserve the
soul's meaning and use the **saved operator style**, as explicitly selected by
the owner. Both redraw templates discard the old rendering style; Main includes
the original answers and full art/format instructions. Console preview and
Prompt Inspector share that builder. Raven v21 already has modern minimalist
multicolour vector art direction and no template overrides; its published
settings and saved draft remain unchanged.

**161 focused checks and 26/26 real-provider Studio journey checks pass**.
Visually reviewed the first picture and redraw: retained story motifs, new
silver wings/pose/shapes, crisp multicolour vector-like rendering without visible
watercolour brushwork. Some tonal shading remains; no guarantee of perfect flat
fills or old-watercolour conversion. Exact 200 MB valid MP3 copied hash-identically
and played through the production native helper for 16 seconds without error.
[Delivery, visual review and limitations](docs/testing/studio-redraw-music-cap-2026-10-26.md) ·
[metadata](docs/testing/studio-redraw-music-cap-checks-2026-10-26.json).

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

MusicLoop accepts audio **up to 200 MB (200,000,000 bytes)** and skips larger
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

- **161/161 focused music/Studio tests pass**, plus both TypeScript projects,
  production build/fingerprint and native signatures. The 26-case provider run
  covered four questions, redraw, transfer/farewell, fresh name on restart and
  release. No owner setting, dependency or runtime model changed.
- Earlier **133/133 focused button/TV tests** remain valid for unchanged controls.
  Coverage checks one-shot 70%,
  ordering/repeat presses, manual-volume preservation and reset failures. Existing
  cases prove no TV, orientation,
  blackout or mouse dependency for music; STOP still stops Main. Build, native
  signature, script syntax and fingerprint pass. No model/dependency/config edit.
- Actual Mac native A/B: original output buffers `[2,2,2]`, corrected `[2]` with
  all three sub-devices active. Corrected production helper played both actual
  cached MP3s for eight seconds after each acknowledgement. Guard negative test
  rejected the original routing with `operator_loop_music_route_incomplete`.
- Current source `01baaad36a1c3e3c`, output `4a218bc1edc3fbef`, built
  **2026-10-26 21:03:10 Taipei**. Latest native helpers and canonical app deployed
  for the next start. Normal LaunchAgent was off and remains off; isolated QA
  exited cleanly. Jabra reset/read-back **70.077%**, other output levels restored,
  mute/input/default devices preserved. Owner's physical MUSIC LOOP/audibility
  check remains pending. Task-generated audio/captures are cleaned after review.
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
