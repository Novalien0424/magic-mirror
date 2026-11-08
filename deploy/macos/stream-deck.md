# Stream Deck Neo controls

The venue Mac has Elgato Stream Deck 7.6.0 (23012), verified current by its own
updater on 2026-10-17. The signed, notarized vendor installer was used. Neo
firmware was updated successfully from 1.00.013 to 1.00.017; its update button
disappeared afterward.

Installed profiles (2026-11-01): Elgato's **Default Profile**, the main **Magic Mirror
copy 3** (the default profile, `AppIdentifier *`, eight keys below), **Magic Mirror
Playback copy** (VIDEO LOOP's page) and **Magic Mirror Music** (MUSIC LOOP's page).
Older Magic Mirror copies were deleted (see "After every import" below).

| Position | Button | Action |
| --- | --- | --- |
| First / left (`0,0`) | Green **START MIRROR** | Ensure Magic Mirror is running and ready, require Main's successful `normal` acknowledgement (Conversation mode), then wake the TV onto HDMI; about 6 s later reset every speaker to its normal level ([speaker levels](#speaker-levels-calibrated-2026-11-07)). |
| Second (`1,0`) | Purple **CONSOLE** | Bring the existing Console above the mirror display, preserving current playback and unsaved edits; start the app and wake HDMI if needed. |
| Third (`2,0`) | Blue **VIDEO LOOP** | Ensure Magic Mirror is running and ready, set every speaker to its normal level (each press), require Main's successful `play_loop` acknowledgement of actual playback, then wake the TV onto HDMI. The deck switches to the Playback page. |
| Top right (`3,0`) | Teal **DESKTOP** | Pause voice, wake listening, camera and media; hide both Mirror windows, preserving unsaved Console edits; show the portrait macOS desktop and connect the TV mouse. |
| Bottom left (`0,1`) | Amber **STUDIO** | Like START, but require Main's successful `studio` acknowledgement (Interactive Studio mode) before waking HDMI; no speaker-level reset. Refused (Basso) when the avatar's image skill is off. |
| Bottom second (`1,1`) | Turquoise **MUSIC LOOP** | Set every speaker to its normal level, then loop the audio files (up to 200 MB each) of shared `MusicLoop` in file-name order on every speaker while remaining files download. TV black; voice and camera off. The deck switches to the Music page. |
| Bottom third (`2,1`) | **DANCE FLOOR** | Play selected Dance Floor audio on every speaker of the music route (Airfoil; the Mac's built-in speaker is skipped when another speaker is present), default 90%, after Raven says "Ready to Party?", with Raven's beat-driven head/body motion. Voice listening and camera stay off. |
| Bottom right (`3,1`) | Red **STOP** | Cover T749 HDMI with pure black, put the TV in standby, stop Magic Mirror and its owned processes, unload its job, release the TV mouse, and reset every external CoreAudio speaker (Jabra Speak2 75, Bluetooth speakers such as A1) to its normal level, unmuted; the AirPlay Edifier takes its normal level when the app next connects it. The black cover stays until another control has a ready app and acknowledged mode. |

START selects normal Conversation mode, including from Desktop or loop playback.
STUDIO likewise returns from Desktop or the loop to the avatar,
then selects Interactive Studio mode: the mirror now wakes to the avatar's Studio
wake phrase (default 「招喚渡鴉使者」), runs the studio and ends each visit with the
studio farewell and Dormant. VIDEO LOOP and CONSOLE leave the mirror mode alone;
STOP retains its black HDMI and all-speakers normal-level policy.
Display controls first verify the venue's Mac 90° portrait orientation.
MUSIC LOOP leaves TV power, orientation, mouse and the HDMI black cover alone.
DESKTOP keeps Electron running with input suspended; it does not discard Console
edits. START, STUDIO and VIDEO LOOP restore their selected view. CONSOLE returns
from Desktop to the saved avatar mode and opens its existing editor on the TV.
An ordinary fresh start begins in reflective Dormant mode.
It restores the last saved active avatar selection (the Console's **Use on
Mirror** selection), currently Raven. The scripts do not hard-code an avatar or
overwrite that selection when starting or stopping.
Normal avatar wake behavior and TV presence policy still apply. STOP closes the
application as well as sleeping the TV. Starting again bootstraps the same
installed LaunchAgent. VIDEO LOOP uses Main's approved loop; repeated LOOP is
idempotent in Main and does not restart playback. A stalled loop reloads once by itself; after
5 min of healthy playback that reload is available again (`operator_loop_recovery_rearmed`). A
loop that failed before it started playing (e.g. a microphone release) never blocks the next
START. MUSIC LOOP or DANCE FLOOR pressed while a VIDEO LOOP is still preparing wins
(`operator_loop_start_superseded`). The controls do not supply a
media path. START, STUDIO, DESKTOP, VIDEO LOOP, MUSIC LOOP, DANCE FLOOR and the folder
keys hide Console without destroying its unsaved editor state. Repeated CONSOLE shows/focuses it; close the
window or press START/STUDIO/VIDEO LOOP to return to the mirror view.
STOP sends no mode command; Main clears desired mode on deliberate TERM. STOP
applies to Magic Mirror's programs, not unrelated Mac applications.

**Standby is not complete power-off.** Android reports Asleep and display OFF,
but the board remains powered and reachable over wired ADB so START can wake it;
a held wakelock keeps it out of deep suspend (see [raven-button](raven-button.md)).
The signed native black cover remains active after STOP. Standby consumption has not been measured;
wake after a full Android shutdown or removal of mains power is not established.
The Mac mini remains running. This does not change the Mac's pre-login/boot screen.

The keys use Elgato's built-in **System → Open** action; VIDEO LOOP and MUSIC LOOP
are built-in **Multi Actions** (Open, then **Switch Profile** to Playback or Music), and
both pages' STOP keys are Multi Actions (Open Stop, then Switch Profile to the main keys).
The Music page's folder keys are the plugin action `com.magicmirror.controls.folder`. The targets are
`~/Applications/Magic Mirror Controls/Start Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Stop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Play Loop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Console Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Studio Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Music Loop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Dance Floor Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Desktop Magic Mirror.app`, the Playback and Music
pages' `Volume Up Magic Mirror.app` / `Volume Down Magic Mirror.app`, and the Music page's
`Previous Song Magic Mirror.app` / `Next Song Magic Mirror.app`. The small local
apps call the executable [start](magic-mirror-start.sh),
[stop](magic-mirror-stop.sh), [loop](magic-mirror-loop.sh),
[Console](magic-mirror-console.sh), [studio](magic-mirror-studio.sh), and
[desktop](magic-mirror-desktop.sh), [music](magic-mirror-music.sh),
[dance](magic-mirror-dance.sh), [volume up](magic-mirror-volume-up.sh) /
[down](magic-mirror-volume-down.sh) and [previous](magic-mirror-music-previous.sh) /
[next](magic-mirror-music-next.sh) scripts without opening Terminal. The controls need
the **Magic Mirror Controls** plugin (folder keys) and the `ops/stop-state` helper (built by
`install-stream-deck-controls.sh`); no hotkey remapper, accessibility grant, microphone
owner or restart service. Elgato's original Default Profile remains available.

## MusicLoop

The linked shared folder is `AI_Stuff/AI_Avatar/Common`; its **MusicLoop** subfolder
was created empty at the owner's request. Add MP3, M4A, AAC, WAV, AIFF, FLAC or CAF
files of **200 MB or less (200,000,000 bytes)**, then press MUSIC LOOP. Larger files
are abnormal and skipped before download or playback; Console reports when all
files are oversized. MUSIC LOOP plays the folder's own files in natural file-name
order ("2" before "10"); hidden files and symlinks are excluded. A song already on the
Mac (Google Drive "Available offline") is waited for while it is copied into the music
cache (at most 15 s), so the order holds; a cloud-only song still downloading is skipped
until ready rather than stalling the music.

**Music page (2026-10-31).** Pressing MUSIC LOOP switches the Neo to **Magic Mirror
Music**: the top row holds keys for the first three subfolders of MusicLoop in name
order, titled with their names by the **Magic Mirror Controls** plugin (later folders
are ignored); then VOL+, and on the bottom row PREV, NEXT, VOL− and STOP (back to the
main keys). A folder key plays that subfolder (with its own subfolders); the key of the
folder playing shows ▶. A folder Google Drive has not downloaded yet ("Resource
deadlock avoided"), or one without music, is refused with Basso and the current music
keeps playing — make it Available offline in Finder first. PREV/NEXT replace the song at
once with the nearest ready song that way, skipping one still being cached; with no other ready
song the press is refused with Basso (`operator_loop_music_skip_unavailable`) and the music keeps
playing. These keys talk to a running app directly (no queue). PREV/NEXT do nothing
without MusicLoop (Basso); a folder key works in any mode while the app runs: it starts
MusicLoop on that folder and hides Console, without the speaker-level reset. Install or update the
plugin with `zsh deploy/macos/install-stream-deck-plugin.sh` (restarts Stream Deck; it never
edits profiles). Re-import the profile package only on first install or when
`prepare-stream-deck-profile.py` changes.

Playback follows file-name order: the next song, if already on disk, is waited for (up
to 15 s) while it is copied into the cache; a cloud-only song is skipped until it has
downloaded and then joins at a track boundary. Ready tracks keep repeating while one
background download completes. If none are ready, Console shows
downloading/preparing and playback begins automatically. Downloads have a finite
size-based timeout (883 seconds at 200 MB); failure skips that file and preserves
playable music. A song whose playback stalls for 12 s is skipped and tried again later
(`operator_loop_music_stall_skipped`; Dance retries its one track); three stalls in a row without a
finished pass retire it for the session. If the native player exits or fails its route, Main
restarts it once per failure streak (`operator_loop_music_player_restarting`), continuing after
the interrupted song; a second failure before any song finishes leaves MusicLoop/Dance failed in
Console until the next key press. Repeated MUSIC LOOP preserves playback and preparation of the MusicLoop
files; while a folder key's subfolder plays, MUSIC LOOP returns to those files. STOP then
MUSIC LOOP retries downloads and reloads added/removed files. An empty folder
produces an explicit Console message.

Each accepted MUSIC LOOP press first sets every external speaker to its **normal level**
(below) and verifies the native read-back. This happens once per press, including a repeat
press while music is running. Afterwards the Music page's VOL+/VOL− move every external
speaker, keeping their offsets; Jabra's physical volume buttons move the Jabra, and AirPlay
speakers follow it with their offset (A1 keeps its level); there is no periodic reset or per-track volume enforcement. A missing/unavailable Jabra
reset is recorded in button diagnostics; music can still use other outputs.

**Airfoil music route (2026-11-01, owner ruling; Airfoil 5.13 licensed).** Every music
source (MusicLoop, Dance Floor, VIDEO LOOP, conversation music, YouTube) plays into the
virtual output **Magic Mirror Music** ([music-device/](music-device/): pinned BlackHole
v0.7.1, GPL-3.0, 48 kHz, plus a settable reported latency, custom property `mmlt` in
frames). Since 2026-11-08 this is a playback-only endpoint; Airfoil reads the separate
input-only **Magic Mirror Capture**, which shares its samples and reports zero latency.
This prevents the video compensation being added again to Mac-side sound after a cold
Core Audio load. Airfoil plays the Jabra ("Computer"), every Bluetooth
speaker it lists and every AirPlay speaker named EDIFIER (a second Edifier joins by name).
Main (`src/main/airfoil-route.ts`) launches Airfoil, sets the source, connects and
reconnects speakers every 10 s, keeps AirPlay speakers at the Jabra's level, and writes
`ops/music-device/airfoil-route` only once the Jabra is connected; the music-loop helpers
then wrap only the music device (the public "Magic Mirror Speakers" default output stays).
Without Airfoil the flag goes and the direct group below returns (Edifier silent;
`MUSIC_OUTPUT music_output_airfoil_*` reason). No AirPlay speaker for 30 s is reported once:
`music_output_airplay_unreachable` (listed, not connecting) or `_not_found` (not listed; the
Edifier stopped answering Bonjour on 11-08, so power-cycle it), then `_restored`. The TV (HDMI) is not in the Airfoil group.
Raven's voice stays on the Jabra.

Calibration (2026-11-01, `~/Library/Application Support/MagicMirror/ops/music-device/calibration.json`):
measured with [speaker-sync/measure.sh](speaker-sync/measure.sh) (host-clock chirps; mic = a second Jabra
Speak2 75, which cannot hear another Jabra) and an iPad Voice Memo for the Jabra's hidden
playback delay (≈108 ms beyond its report; a second train at +336 ms was likely the linked
second Jabra). Untuned, relative to Airfoil's wired path: Edifier +68 ms, A1 −40 ± 25 ms,
Jabra +108 ms. Airfoil `syncOffsets` (seconds; Computer/Bluetooth positive = play earlier,
0–1 s; AirPlay positive = later, ±1 s; applied 30–60 s after connecting): Computer 0.148,
A1 0, Edifier −0.108. Verified: Edifier +0.8 ms and A1 +26 ms from the Jabra's time; total
audio delay ≈ 2148 ms. A1 still wanders about ±25 ms per stream start (Bluetooth).

Re-tuned 2026-11-07 (night) for the linked second Jabra: **Computer 0.246, A1 0, Edifier −0.108**
(`mmlt` unchanged). Method: the same chirp trains, one speaker audible at a time, alternating
blocks, recorded **from the moment Airfoil connects** for 6–15 min. Mics: A1's own call mic (HFP,
8 kHz, opened through an Electron child) hears the Jabras and the Edifier; the Jabra mic hears A1
and the Edifier but never the linked Jabras (echo cancelling). Findings:

- The linked Jabra pair plays in sync with itself and ~60 ms later than the single Jabra; with
  Computer 0.246 it is +6..+15 ms from the Edifier from the first seconds. It held through
  reconnects, an Airfoil relaunch, 12 min idle and a mic open. (An earlier −6 ms reading at 0.186
  was probably taken while the second Jabra was not linked.)
- The Edifier is steady within ±3 ms over 15 min.
- **A1 (Bluetooth) glides after every connect:** it starts ~130 ms late and moves ~20 ms/min,
  settling after ~6 min whatever its offset; settled at offset 0 it is about −4 ms from the
  Edifier, then wanders ±20 ms with occasional 30–40 ms jumps (weak link; Rogue Amoeba: sliders
  cannot fix fluctuating latency). Main therefore keeps a freshly connected or reconnected
  Bluetooth speaker at Airfoil volume 0 for 6.5 min (`BLUETOOTH_SETTLE_MS`, markers
  `music_output_bluetooth_settling` / `_joined`); A1 then joins in sync. Bluetooth speakers stay
  connected in Airfoil through STOP (owner 2026-11-07), so they stay in sync and the next start
  plays them at once; a quick STOP/START resumes the remaining settle time
  (`ops/music-device/bluetooth-settle.json`). Only a fresh connect (A1 left Bluetooth, Airfoil or
  Mac restart) waits again. STOP still releases the Jabra and AirPlay speakers.
- **The Jabra plays ~150 ms early while its microphone is open** (its call path; measured 11-07
  with A1's mic: −4 ms closed, −140/−157 ms open). Owner ruling: sync over voice control. Main
  sets the Jabras' Airfoil volume to 0 while their microphone is open (a conversation, or the
  Dormant wake listener) so music plays on A1 and the Edifier only, and every song or loop handed
  to Dormant releases the wake listener (no voice wake during music; STOP ends it). The
  calibration above assumes the microphone closed. A failed Airfoil volume write is not taken as
  applied: Main reports `music_output_jabra_music_failed` or `music_output_airplay_level_failed`
  once and retries on the next 10 s poll; writes to one speaker never overlap.
- Ear tests were unreliable below ~50 ms, and a 1–2 min settle is too short for A1: measure from
  connect for at least 7 min. Values and method: `calibration.json` (`retune`).

Current calibration, **2026-11-08 after the split-driver fix: Computer 0.222, A1 0,
Edifier −0.108**. Two cold driver loads passed. Final Jabra–Edifier block differences
were 1–5 ms; settled A1–Edifier differences were 4–7 ms. Normal Bluetooth variation
and the A1 settle hold above remain. [Evidence](../../docs/testing/airfoil-sync-2026-11-08-followup.md).

TV picture delay (2026-11-01 evening): the TV shows a Mac frame **67 ms** later (Mac draw →
board composition; three runs 68/67/62 ms, p10–p90 50–85 ms in 60 Hz steps), measured with
[speaker-sync/tv-picture/measure.sh](speaker-sync/tv-picture/measure.sh) while the TV is awake
(silent, ~30 s). The device therefore reports audio delay − picture delay: `mmlt` = 99888
frames (2081 ms; was 103104 = 2148 ms). Chromium holds video frames back and AVPlayer's
Dance clock lags by this value, so pictures and Dance reach the panel with the sound. Read
or set it with [music-device/latency.swift](music-device/latency.swift) (`latency [frames]`).
Re-tune after adding a speaker: STOP, measure with
[speaker-sync/measure-continuous.sh](speaker-sync/measure-continuous.sh) + `scan.py`
(0–30 s; header has the microphones and lease command). Use a RAM disk for recordings,
one continuous microphone, and alternating speaker blocks. Use A1's mic for the Jabras
with A1 transmission off; use the Jabra mic for A1. The runner restores normal levels
and deletes its raw recording. It leaves connections intact between measurements.
After the last run disconnect Computer/Edifier, leaving A1 connected for its settle hold.
To change calibration,
write `syncOffsets` with Airfoil quit (values beyond the ±1 s sliders are ignored), relaunch,
re-measure ≥2 min after Edifier connects and ≥6.5 min for a fresh A1 connection;
reset `mmlt` if the audio total or the TV path changes.

**Cold-start fault (2026-11-08):** the old duplex device's persisted `mmlt` made
Mac-side playback an extra 2081 ms late. Setting it to zero and relaunching Airfoil
did not clear Core Audio's cached state; reloading Core Audio and the driver exposed
the cause. The split playback/capture endpoints above retain picture compensation.
Measurements and remaining limits:
[follow-up](../../docs/testing/airfoil-sync-2026-11-08-followup.md).
Separately, a relaunched Airfoil can miss an unreachable Edifier until it re-announces;
check discovery/readiness before judging sync.

### Speaker levels (calibrated 2026-11-07)

The speakers are not equally loud at the same setting (owner's Android sound meter, 1 m from
each, 10 s band-limited pink noise through the music route; background 49 dB): Jabra 61/74 dB,
Edifier 71/85 dB, A1 65/80 dB at 30%/70%. Every speaker rises about 3.5 dB per 10%, so one
fixed offset per speaker matches them at any volume. The **normal levels** (owner ruling) live
in `~/Library/Application Support/MagicMirror/ops/music-device/speaker-levels.json`:
`{"normal": {"Jabra Speak2 75": 0.80, "A1": 0.65, "EDIFIER": 0.50}}` (measured match 0.70/0.55/0.40;
the owner then chose one VOL+ step higher by ear during MusicLoop; keys match a speaker whose
name starts with them; an unlisted speaker follows the Jabra; a missing file means 70% each,
and Main logs `MUSIC_OUTPUT music_output_levels_uncalibrated`). START, STOP, every MUSIC LOOP and
VIDEO LOOP press, the end of Dance and QA restores set these; VOL±, Dance volume and a reconnecting speaker keep
each speaker's offset from the Jabra (`stop-state`, `music-loop`, `qa-output-volume`, Main's
`speaker-levels.ts`; 5% floor for a quieter speaker while the Jabra plays). VOL+ can always reach
100% on every speaker (owner): once the Jabra is at 100%, further presses raise the others 10% each
until all are at 100% (from the 80/65/50 defaults: 2 presses to the Jabra's 100%, 5 to all 100%);
`stop-state` keeps that group level in `ops/music-device/group-level` (above 1 only while the Jabra
is at 100%) and `music-loop` reports it to Main for the AirPlay speakers. The Jabra's
CoreAudio level carries it and A1 (Airfoil volume 1); the Edifier's Airfoil (AirPlay) volume
carries its offset. The button log's `jabra_output_70` means the normal-level reset passed (a stable
token, not a 70% level). Without exactly one Jabra the reset still returns the other speakers to
normal, then fails with `jabra_output_missing` or `jabra_output_ambiguous`.

**Jabra call volume (2026-11-08).** The Jabra keeps a second stored volume for its call path,
which it enters when a conversation opens its microphone with echo cancellation (the app's wake
listener does not). A write made during a call is stored once the call has held for a few seconds,
and the level stays after the call ends. Its steps are coarse: 1% is step 0, which the Jabra reads as
muted. START's and STOP's resets run outside a call and never reach it. After the 11-07 night's
sound work at 1% it was left muted, and Raven was nearly silent after every START. Now Main runs
`stop-state --reset-voice` as the first conversation after each app start, START or STUDIO
begins: for 10 s it returns the Jabra to its normal level, unmuted, whenever it reads otherwise,
with writes 0.3 s apart (the switch overrides writes made in its first second). The app log shows
`JABRA_VOICE reason=jabra_voice_level_reset`; a failure is the Console degradation
`jabra_voice_level_reset_failed`, and the next conversation retries. Later conversations keep what a
visitor set with the Jabra's buttons. QA runs skip it (`jabra_voice_level_qa_skipped`) and keep
their 1% hold. Raven QA conversations use synthetic input and never open the Jabra (`--physical`
runs do); any capture that leaves a low call volume is fixed by the next production conversation.

The second Jabra Speak2 75 is linked to the venue Jabra with Jabra's own link and plays the
same sound; the Mac sees one Jabra. Link order matters (11-07): with the USB Jabra pressed
second it played nothing; unlink (hold Smart 8 s), then press Smart on the **USB Jabra first**
and the second unit next. Never plug the second unit into the Mac (two Jabras refuse the reset).

Re-calibrate after moving, adding or replacing a speaker: STOP, then play the same hiss on one
speaker at a time at 30% and 70% (Airfoil connected to that speaker only; the Jabra held open
so its level holds), read the meter at 1 m, set each speaker's normal level to the Jabra's
minus its measured dB difference / 3.5 dB per 10%, edit the file, and START. Owner fine-tuning
by ear can replace the numbers directly.

**Bluetooth drift and re-sync (2026-10-31; the direct route used when Airfoil is down).**
Bluetooth speakers drift apart over long
playback inside their own buffers, invisible to macOS (static reported latency, exact
44.1 kHz); the venue links are weak (Edifier ~6% / A1 ~12% median retransmissions at
−75/−80 dBm). macOS suspends each Bluetooth stream within milliseconds when audio stops,
but a normal song change restarts it after only ~40 ms, shorter than a speaker buffer.
Opt in with **Console → Loop Video → Re-sync Bluetooth speakers between MusicLoop
songs** (Save settings): MusicLoop then leaves 1.2 s of silence after each finished song
so every speaker drains and restarts aligned. Airfoil already keeps the speakers aligned,
so the app skips the pause while the Airfoil route is active (11-01); the option only acts
on the direct route. Within one song drift can still build up; Dance, VIDEO LOOP and YouTube have no song boundary and are unchanged.

A speaker that joins while the app runs (a Bluetooth reconnect) is set to the group's
level, read from the Jabra (`music_output_speaker_matched`), instead of the stale level
macOS restores (once found at 1% after QA). Button sounds play quietly on the Jabra
only, not on every speaker.

Research (2026-10-31): A2DP has no synchronized multi-speaker mode and each sink absorbs
drift in its own buffer ([A2DP 1.4.1 §2.3](https://www.bluetooth.com/specifications/specs/html/?src=a2dp_v1-4-1_1752513648/A2DP_v1.4.1/out/en/index-en.html));
a ≥1 s pause is the conservative re-sync (inference). Wiring a speaker or improving the
radio ([Apple](https://support.apple.com/en-us/102766)) beats the pause; Airfoil is now the normal route.

Main owns the player and a temporary private macOS multi-output route: on the Airfoil
route it wraps only Magic Mirror Music; on the direct route, every connected physical
output (Jabra, Bluetooth, HDMI), the Mac mini speaker only when there is no other.
Outputs are rediscovered during playback; virtual and aggregate devices are excluded
from the direct route to avoid duplicates. Input gain and device mute/volume are preserved; while the
app runs the default output is the shared "Magic Mirror Speakers" device (see
[README](README.md)), which this private route does not use. The route duplicates one stereo stream across the available outputs;
it does not concatenate their channels. MUSIC LOOP does not wake the TV or depend
on its ADB connection, HDMI or power: with the TV off the app keeps playing (the
TV-absent exit is held during MusicLoop) and the command still succeeds. On the direct route HDMI receives music if the connected TV is already able to
play audio (the Airfoil route leaves the TV out); TV power remains unchanged.

START, STUDIO, VIDEO LOOP, DANCE FLOOR, DESKTOP and Return to Avatar release MusicLoop before
changing modes. CONSOLE preserves it and shows status. **STOP ends it through the
same Main shutdown as all other modes**, destroys its temporary audio route,
sleeps TV, keeps HDMI black and restores every external CoreAudio speaker to its normal level. A queued STOP interrupts a
pending MusicLoop, Dance or VIDEO LOOP start wait (logged `music_cancelled`, `dance_cancelled` or
`loop_cancelled`, no chime). No separate restart service is installed.

[Initial delivery](../../docs/testing/music-loop-2026-10-26.md) ·
[Download follow-up, checks and limits](../../docs/testing/music-loop-downloads-2026-10-26.md).

## Dance Floor

The default file is `AI_Stuff/AI_Avatar/Common/DanceFloor.m4a`; M4A plays directly.
Add other supported audio to `Common/DanceFloor`, maximum 200 MB per file.
Open **Console → Dance Floor** locally or through the existing tailnet Console
to refresh/select music, change intensity, volume, visual timing offset, welcome
and Chinese/English language. Save changes before Start. Track/language/welcome
apply next start; intensity, timing and a changed volume apply immediately.

Start prepares the file, analyses local beat timing, gives a brief in-character
welcome, then loops the music. No physical microphone or camera is used. Volume
is set once, default 90%, on every external speaker; physical speaker controls
remain free afterward. Fixed-volume HDMI depends on the TV's own setting.
Music timing drives head and torso motion; this portrait rig has no independent
arms/legs. Positive timing offset advances Raven and negative delays Raven.

STOP releases Dance and returns every external speaker to its normal level, unmuted (switching to
another mode does the same; field-checked 2026-10-31). Main runs that reset once after the Dance
player has exited, whichever way Dance ends (Console Stop, a mode key, VIDEO LOOP, a renderer
reload); a failure is logged `operator_loop_dance_volume_restore_failed` and never blocks the
switch. A saved track that no longer exists plays the first available track
(`dance_track_fallback`); `Common/DanceFloor` is optional and the app never creates it.
The Console's Stop Dance Floor and global Stop All during Dance end Dance only:
they restore output levels (every external speaker at its normal level) and return Raven to Conversation while
the app keeps running. Only the physical STOP key runs the shutdown/black-cover
operation (owner ruling 2026-10-31). Return to Avatar and other mode keys release
Dance before switching. Opening Console preserves Dance. Stop Dance Floor is available only
while Dance runs. App or renderer crashes do not restart Dance automatically (only a native
player failure during a running Dance gets its one restart, above). [Journey, measurements and physical exclusions](../../docs/testing/dance-floor-delivery-2026-10-30.md).

## Playback page

Pressing **VIDEO LOOP** opens its control and switches the Neo to the **Magic Mirror
Playback copy** profile (MUSIC LOOP has its own Music page, above), which has only three keys:

| Position | Key | Action |
| --- | --- | --- |
| Top left (`0,0`) | **VOL +** | The Jabra 10% louder (snapped to 5% steps), unmuted; every other speaker (A1, AirPlay Edifier) keeps its calibrated offset from the Jabra; at the Jabra's 100% further presses raise the others until every speaker is at 100%. |
| Bottom left (`0,1`) | **VOL −** | The same, 10% quieter (0% is the floor; a quieter speaker stays at 5% while the Jabra plays). |
| Bottom right (`3,1`) | Red **STOP** | The normal STOP (shutdown, black HDMI, every external speaker at its normal level), then back to the main profile. |

VOL± acts at once, outside the control queue, so it never waits behind a slow start;
it does not touch the app, TV or Electron lease and plays Pop (Basso on failure). The
Mac mini speaker and fixed-volume HDMI are untouched, and STOP/START/MUSIC LOOP/VIDEO LOOP return
the speakers to their normal levels. Stream Deck's built-in actions switch the page on the press, not
on the result: a failed loop still shows Playback, and its STOP recovers. Leaving a
loop through the Console (Return to Avatar) leaves the deck on Playback until STOP.

**Never steal focus during a loop.** Stream Deck answers any app activation (a focus
change) by selecting its default profile, the main keys. Magic Mirror therefore shows
the mirror without activating itself (`showInactive`) and does not re-toggle simple
fullscreen when the mirror is already in place. Only CONSOLE and DESKTOP take focus,
and their page is the main one. The control apps are `LSUIElement` applets, which do
not take focus (checked 11-01). Before 11-01 every loop press reverted to the main
keys about 1 s later, when the mirror window appeared.

## Reinstall the local controls

From the canonical checkout:

```sh
zsh deploy/macos/install-stream-deck-plugin.sh   # only when the plugin changed (restarts Stream Deck)
zsh deploy/macos/install-stream-deck-controls.sh
open "$HOME/Applications/Magic Mirror Controls/Magic Mirror.streamDeckProfile"
```

**After every import (required):** the package imports three new copies (main, Music,
Playback), and Stream Deck may give the new ones a "copy" suffix while an old one keeps
the plain name. Identify the new set by the new main copy's Switch Profile targets (or the
newest `ProfilesV3` folders), not by name. In Stream Deck → Preferences → Profiles select
the new main copy, tick **Make this my default profile**, then delete the superseded Magic
Mirror copies (keep Elgato's Default Profile). Stream Deck shows the default profile at launch and on focus changes,
so an old default silently brings back old keys (found 2026-10-31: the old "copy 1"
was default, so the Neo lost the Music page after each Stream Deck restart). Verify with
`AppIdentifier: "*"` on exactly the new main copy in
`~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/*/manifest.json`.

The installer verifies its prerequisites, creates ad-hoc signed local apps,
and only replaces apps with the matching Magic Mirror bundle identifiers. It
generates an importable profile; importing is a separate explicit action and
does not edit Elgato's live configuration files. Avoid re-importing unnecessarily,
because Stream Deck may create another copy of the profile. The generated file
also serves as a recovery copy. The installed app and profile retained their
configuration across a Stream Deck quit/relaunch test.

The queue and graceful/forced-stop behavior, result sounds, metadata log, and
limits are documented in [raven-button.md](raven-button.md). For the eight mode keys
script exit zero means queued; VOL± and the Music page keys run at once and exit 1 on
failure. Final results are in `~/Library/Logs/MagicMirror/button.log`.
The controls require the existing installed field plist, canonical checkout,
built output, `/opt/homebrew/bin/node`, and the installed
`system/com.magicmirror.board-adb` daemon on port 5038; they do not build on every
press. A TV failure produces Basso and a metadata reason, while STOP still cleans
up the application. The helper never replaces/restarts the trusted ADB server.

## TV-connected mouse and remote desktop

The Xiaomi receiver stays plugged into the TV. **CONSOLE** and **DESKTOP** connect that
receiver to macOS over the direct Ethernet cable. The owner confirmed one pointer,
correct movement and working clicks on the portrait Console. **STOP** releases
it back to Android and closes the dedicated USB client/server. START,
STUDIO and VIDEO LOOP leave an existing connection alone. No mouse-axis remapping
is installed; keep the accepted Mac 90° / Android user_rotation 2 display settings.

One-time installation or deliberate version update, from this checkout:

```sh
zsh deploy/macos/install-mirror-mouse.sh
```

Exit the dedicated VirtualHere client before reinstalling. The installer pins
tested server 4.8.8 and Mac client 6.0.3 by SHA-256 and verifies the client's vendor
signature/notarization. If a vendor download changes, it fails closed until the
new version is checked and its pin deliberately updated. It uses the board's
existing root access; no rooting, security-policy change or paid client service
is needed. Allow VirtualHereUniversal's normal macOS **Local Network** prompt on
first use. The existing installation has this permission. Only USB `2717:50d1`
is shared; its IPv4 server accepts TCP 7575 only from the directly wired Mac
`192.168.77.1`. No USB reports or mouse/keyboard events are recorded.

The client/config/helper live at `/Applications/VirtualHereUniversal.app` and
`~/Library/Application Support/MagicMirror/mouse/`; the board files are under
`/data/local/tmp/mm-mouse/`. CONSOLE restarts a missing server/client on demand;
it does not require a new login agent. Allow up to ten seconds for a failed
attempt to produce a fixed reason in `~/Library/Logs/MagicMirror/button.log`.
Console still opens if mouse forwarding fails, so remote input remains available.

For **Chrome Remote Desktop**, connect to this Mac as usual. To check the Console
without covering the avatar, stay on the main (virtual) display and double-click
**Remote Console Magic Mirror** on the Desktop. The Console opens there at normal
size while the avatar keeps running on the TV. It only shows the Console: it does
not start Magic Mirror, wake the TV, connect the TV mouse, change the Mirror mode
or play a sound, and if the app is not running it says so in an alert. The next
CONSOLE press (Neo key or Console app) moves the Console back over the avatar;
START, STUDIO, DESKTOP, VIDEO LOOP, MUSIC LOOP and DANCE FLOOR hide it as before. Remote Console leaves a
Desktop TV visible and offers Return to Avatar. Install or reinstall it
with `zsh deploy/macos/install-remote-console.sh` (it refuses to replace any other
app of that name).

To see the Console where a TV user would, select the portrait T749 display (or
all displays) and open
`~/Applications/Magic Mirror Controls/Console Magic Mirror.app` remotely; the
physical Neo button is not required. The existing virtual
main display and remote desktop host remain unchanged. Both inputs control the
same Mac pointer; take turns using the local and remote mice. After moving the
physical mouse, leave it still for a few seconds before controlling remotely
(Chrome Remote Desktop gives local input temporary priority). The helper only
places an outside pointer on the portrait display when CONSOLE or DESKTOP is invoked, then
exits. STOP does not stop Chrome Remote Desktop. End-to-end remote acceptance and
recovery limits are recorded in the [mouse QA ledger](../../docs/testing/portrait-console-mouse-2026-10-17.md).

## Verification

Open: a physical press of every Neo key, including the Playback and Music pages, after
the 11-01 focus fix (TODO "Playback page on the Neo" and "Physical operator journey");
USB reconnect and cold-login acceptance. Evidence ledgers:
[Stream Deck controls](../../docs/testing/stream-deck-controls-2026-10-17.md) ·
[Desktop](../../docs/testing/stream-deck-desktop-2026-10-23.md) ·
[Loop Video](../../docs/testing/operator-loop-2026-10-17.md) ·
[Console/global STOP](../../docs/testing/operator-controls-2026-10-17.md) ·
[night QA journeys](../../docs/testing/user-journeys-2026-10-31.md). The saved loop video
and music are changed in Console → Loop Video.

Primary sources: [Elgato downloads](https://www.elgato.com/us/en/s/downloads),
[built-in System actions](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia).
