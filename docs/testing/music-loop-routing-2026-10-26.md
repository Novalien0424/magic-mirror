# MusicLoop silent output repair — 2026-10-26

## Report and diagnosis

The owner pressed MUSIC LOOP and heard only a short beep. Both uploaded MP3s were
present and under 100 MB. Main prepared both, native playback advanced and the
Console reported playing, but the owner heard no song. Jabra was unmuted at 68.8%;
Mac mini Speakers were unmuted at their existing 1%. The beep was the button's
failure feedback after TV wake failed on the already-known missing ADB transport.
The owner clarified that music must not wake or depend on the TV.

The files decode as 48 kHz stereo (214.76 seconds) and 44.1 kHz stereo (78.01
seconds). The first 20 seconds have mean levels of -19.3 and -18.0 dBFS, with
peaks of -3.9 and -3.8 dBFS. File silence or size/download failure was excluded.

A native probe measured the existing `stacked: 0` aggregate as **three two-channel
buffers (six channels)**. It concatenated the output channels; a stereo AVPlayer
stream did not duplicate onto every speaker. `stacked: 1` measured **one stereo
buffer**, with all three physical sub-devices active. The old QA only checked
sub-device count and advancing playback; it did not establish duplicated output.
That was an inadequate acceptance boundary and is corrected here.

Apple's [AVPlayer output-device documentation](https://developer.apple.com/documentation/avfoundation/avplayer/audiooutputdeviceuniqueid)
defines routing by Core Audio UID. The stacked value above is based on actual
venue-Mac stream-configuration measurements; the installed SDK comment for that
key is inconsistent with those measurements. No default-device change is needed.

## Change and review

1. Native MusicLoop creates the mirrored multi-output route with `stacked: 1`.
   It validates both active sub-device count and a single output buffer. A
   concatenated route now fails visibly as `operator_loop_music_route_incomplete`
   instead of falsely declaring all outputs ready. Ready metadata includes
   stream/channel counts without media paths or audio samples.
2. MUSIC LOOP still starts Main and requires mode acknowledgement, but skips
   portrait enforcement, black-cover clearing, TV wake/HDMI and mouse commands.
   STOP retains its existing global shutdown, black HDMI and Jabra reset behavior.
3. Self-review checked guard storage/release, failure shutdown, device-volume and
   input/default-device preservation, and the early music-only branch. Download
   ownership, 100 MB limits and ready-track rotation are unchanged.

## Verification

[Retained metadata, A/B events and build](music-loop-routing-checks-2026-10-26.json).

- **130/130 focused tests passed** in `mirror-tv-control` and `raven-button`.
  New coverage makes all TV/display/mouse adapters unavailable and verifies music
  still succeeds without invoking them; global STOP still stops Main.
- Native A/B route probes: old `[2,2,2]`, corrected `[2]`; both had three output
  sub-devices. Corrected production helper played both actual cached MP3s for
  eight seconds after each playback acknowledgement with no decode/stall error.
  Final ready event: **outputs 3, streams 1, channels 2**.
- Negative regression: changing only the route flag back to 0 in an isolated
  helper made the new guard emit `operator_loop_music_route_incomplete`, stop and
  exit 1 before playback. This is an expected rejection, not a passing playback.
- Native test children were released before restoring output volumes. Jabra reset
  and read-back: **70.077%**. Other outputs/mutes/input gain/defaults preserved.
- Build, native signing and build fingerprint pass. Current build source
  `5830f8b0ff4fb2364ef007564da4fa51a8f45bb913000477fc3a5957e0c1b29d`, output
  `915626e92258cce1743743cbebe91fbf769db82c6c8d1e0cf96414e51230a983`, built
  **2026-10-26 16:07:35 Taipei**. Normal LaunchAgent restarted, renderer ready.

No full rendered suite rerun: renderer, playlist/controller and downloads are
unchanged. Earlier 29-case journey evidence remains scoped to those controls;
the native route evidence above replaces its insufficient all-output inference.
Physical speaker audibility still requires the owner's live check.

The task-owned diagnostic sources, binaries, native sample and temporary logs
were removed after retaining metadata. No MP3 source, production cache or operator
setting was deleted. Normal app remains running and ready for the owner's press.

## Follow-up: default Jabra volume on MUSIC LOOP

Owner requested 70% at each MUSIC LOOP press while retaining physical-button
volume control afterward. The button sequence now invokes the existing native
reset/read-back once, after app readiness and before the music command. Repeated
accepted presses reset to 70% without restarting the current track. There is no
volume timer, track-boundary reset or Main/native player volume enforcement.
Reset failure remains fixed `audio` metadata and does not gate other outputs.

Focused `mirror-tv-control` and `raven-button` run: **133/133 passed**. Added
ordering/one-shot/repeated-press behavior, preservation of a simulated physical
volume adjustment through Console access, and reset failure/exception cases.
Script syntax and final diff check passed. The native helper is unchanged from
its measured 70.077% reset above. No new sound-producing QA or Electron restart
was needed; active owner playback was preserved. This launcher-script change is
used directly by the installed canonical controls on their next press.
