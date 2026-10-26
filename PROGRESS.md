# Magic Mirror — current handoff, 2026-10-26

Delivered the owner's **MusicLoop** priority: a seventh Stream Deck Neo key in
bottom-row slot (1,1), assigned through the live **Magic Mirror copy 1** profile's
UI. All six existing assignments remain. The shared
`AI_Stuff/AI_Avatar/Common/MusicLoop` folder was created **empty** at the owner's
request. Add audio, then press MUSIC LOOP for a filename-ordered endless playlist
on connected physical Mac outputs. STOP ends playback through Main shutdown;
START/STUDIO/video/Desktop leave it, CONSOLE preserves it. TV presentation is black.

[Plan, self-review, journey, delivery and limits](docs/testing/music-loop-2026-10-26.md) ·
[checks/builds](docs/testing/music-loop-checks-2026-10-26.json) ·
[full retained failures](docs/testing/music-loop-failures-2026-10-26.txt) ·
[operator instructions](deploy/macos/stream-deck.md).

## Current evidence and runtime

- **290 distinct focused tests pass**, reusing unchanged passes; final affected
  run 26/26. Both TypeScript projects, build, native/wrapper signing, shell syntax
  and build fingerprint verification pass. No dependencies or model changes.
- Final real isolated Electron journey **27/27, exit 0**, with 19 captures;
  MusicLoop status and empty-folder screenshots inspected. Two playlist wraps,
  repeated key, Console preservation, all mode transitions and empty-folder retry
  passed. Native cached WAV/MP3 playback advanced on the three-output route
  (Jabra, HDMI, Mac mini Speakers); TERM/EOF and Main shutdown released playback.
- QA found/repaired cached `.media` format detection; final review repaired
  unavailable-video handoff without silently ending active music. Development
  fixture/count/async assertion failures are recorded separately from passes.
- Final build: source `41f766685bacb443`, output `8482e5376d1980d1`, built
  2026-10-26 14:52:47 Taipei. Canonical build and signed controls installed.
  Normal production Electron remains **stopped**; no music worker remains.
  No production config/draft edits. MusicLoop is verified empty. Test volumes
  were restored after every run; Jabra final read-back **70.08%**.
- Four reviewed QA roots cleaned: **365 files / 53119588 bytes**; 27 owned
  scratch files removed. Metadata results/failures and ownership markers remain.
- Real STOP on the stopped installation confirmed `blackout_covered`,
  `already_off`, `jabra_output_70`, no loaded app LaunchAgent and zero playback
  processes. **TV standby and mouse disconnect failed**: trusted ADB service
  exists but board transport is missing. Black HDMI cover remains active. Do not
  claim hardware standby/mouse or human acoustic/physical-key acceptance.

## Next action / scope

Owner adds music to the empty MusicLoop folder. STOP then MUSIC LOOP refreshes
playlist changes. Re-establish the venue board transport and verify physical
MUSIC LOOP → STOP, TV standby/mouse release and acoustic output together.
Physical output hotplug and inter-device latency remain unmeasured.

The **LLM-led full-catalog media selection redesign** is recorded for follow-up
in [TODO](TODO.md), with [research and acceptance plan](docs/testing/llm-media-catalog-design-2026-10-25.md).
It is deferred, not implemented. Existing alias selection remains pending that
replacement; prior voice-quality provider QA remains **not green**. Do not
conflate MusicLoop's deterministic playback checks with conversational search or
human name/ASR acceptance. Preserve natural Raven character; no canned banter.

[Prior media/search/name handoff](docs/archive/progress-before-music-loop-2026-10-26.md)
retains detailed unresolved dialogue/journey evidence. Other hardware and
operator follow-ups remain in [TODO](TODO.md); [DECISIONS](DECISIONS.md) owns
rulings. No phase promotion.
