# Dance Floor delivery and evidence — 2026-10-30

Implemented for the canonical Mac mini checkout. The owner-supplied
`AI_Stuff/AI_Avatar/Common/DanceFloor.m4a` is 34,155,417 bytes and approximately
35:12 long. Native preparation handles its Google Drive placeholder, then plays
M4A directly. No transcoding, purchase or YouTube extraction was needed.
The [original journey and self-review](dance-floor-design-2026-10-30.md) preceded
implementation. [Machine evidence and retained failures](dance-floor-checks-2026-10-30.json).

## Visitor and operator journey

1. Press **DANCE / FLOOR**, bottom-row third Neo key, or open **Console → Dance
   Floor → Start Dance Floor**. The existing tailnet Console exposes the same
   controls. The active `Magic Mirror copy 1` profile now has eight keys; its
   seven existing assignments were preserved through the Stream Deck UI.
2. Main ends the previous activity, releases voice/wake/camera, prepares the
   selected local audio and analyses its rhythm. The visual mode uses the
   existing portrait/HDMI control path. Console shows preparation or a reason
   for failure. An empty/missing selection can be repaired with Refresh tracks.
3. Raven gives one original brief DJ welcome using the published character,
   voice and effects. Traditional Chinese is default; English is an explicit
   setting. The welcome uses a silent synthetic input stream, never a physical
   microphone. No transcript or voice recording is saved. Music waits for actual
   speech completion and output cleanup; a 25-second bound cancels late speech
   and allows music to continue.
4. Music starts on all available physical Mac outputs. Controllable output
   levels are set once to the saved volume, default **100%**, with read-back.
   The current route has three outputs and two writable volume controls. HDMI's
   amplifier setting cannot be controlled or verified by this CoreAudio scalar.
   Physical buttons remain usable; track repeats do not reset volume.
5. Raven uses head XYZ, torso XYZ, eyes and subtle breathing. Three coordinated
   phrases change every 16 detected beats, with anticipation, downstroke,
   counter-rotation and stronger four-beat accents. Beak movement belongs to
   real DJ speech. The current rig has no independent arms, hands or legs;
   motion is constrained by its existing portrait deformation.
6. The selected track repeats. No confident beat means movement rests and
   Console says why. A stale/paused native clock stops the choreography.
7. Console can save track, intensity, volume, timing offset, welcome and language.
   Intensity/offset/changed volume apply immediately; track/language/welcome
   apply on next Start. Unsaved values survive polling/page navigation and guard
   reload. Positive offset advances Raven relative to the audio clock.
8. **STOP**, the panel's **STOP · black screen**, and global **Stop All** during
   Dance stop speech/music/analysis. Black pixels are verified in rendered QA.
   Jabra returns to 70%; other outputs return to their pre-Dance levels. The
   physical/production Console STOP also invokes the existing HDMI black cover,
   app shutdown and TV standby operation. Return to Avatar releases Dance before
   restoring normal ownership. Dance never auto-resumes at 100% after a crash.

## How synchronization is checked

AVFoundation decodes the file at 22,050 Hz into approximately 10 ms band-energy
frames. Positive log-energy changes identify attacks; local autocorrelation
estimates tempo in overlapping windows. A dynamic-programming path balances
onset evidence and changing beat spacing. The implementation is informed by
[Ellis's original beat-tracking work](https://labrosa.ee.columbia.edu/projects/beattrack/)
and [paper](https://www.ee.columbia.edu/~dpwe/pubs/Ellis07-beattrack.pdf), not an LLM
guess or a copied fixed BPM. Derived timing metadata is cached by content SHA-256.

The native AVPlayer publishes actual position/rate every 100 ms. The renderer
interpolates that clock and evaluates a pose directly against upcoming beat
timestamps. It bypasses Raven's normal 180 ms smoothing. Each gesture holds
energy around its beat so an RMS attack cannot delay the visible peak.

Two separate measurements prevent circular acceptance:

- **Detector:** a native-decoded 120 BPM WAV has known kick times and offbeat
  treble distractors. Twenty interior beats were detected with maximum onset
  error **7.94 ms**. Unit fixtures also cover 100→150 BPM and silence/constant
  loudness; those fixtures alone are not actual-song ground truth.
- **Rendering:** sample Core's written head-Y value on real animation frames,
  find the downstroke minimum, and compare its position with the assigned beat.
  Runs measured 50 complete gestures over two native track wraps. Measured
  medians were approximately 3–6 ms and p95 below 9 ms. The final exact values
  are retained in machine evidence. This proves alignment to the player's clock,
  not acoustic propagation or TV panel latency.

The supplied complete M4A produced 211,670 analysis frames and 4,462 beats;
median estimated tempo 127.95 BPM. Visual plots at 60–66 and 1050–1056 seconds
showed alignment with repeated bass attacks. Bass-only evidence at 2020–2026
seconds was ambiguous; the detector also uses middle/treble attacks. These
spot checks are not independent human annotations for the entire 35-minute mix.

## Checks and corrections

- 394 focused tests pass across beat/clock, music, operator, button/TV, web
  Console and Realtime adapter suites; 15 additional preload/package boundary
  checks pass. Both TypeScript projects, production build/fingerprint and native
  signatures pass. No dependency, runtime model or owner avatar configuration
  changed. This remains canonical checkout deployment, not signed packaged-app
  distribution acceptance.
- Isolated real Electron journey exercises actual Console DOM controls,
  published rig assets, native audio/analysis, provider welcome, no captions,
  selection/save, live controls, wraps, actual M4A playback, missing file,
  preparation cancellation, black STOP, global Stop All, restored defaults and
  Return to Avatar. The legacy `music_analyser=not_executed` field belongs to a
  different generic test; Dance's native/renderer measurements are separate.
- Final isolated run: **14/14 checks**, exit 0, 50 measured gestures,
  median **4.22 ms**, p95 **7.52 ms**, two native wraps. The deployed normal app
  was then tested through actual Console controls and the serialized Neo
  operation path at saved 1% volume: M4A preparation, 4,462-beat analysis,
  three-output playback and production STOP/app shutdown all succeeded. Jabra
  measured 0.009699 while playing and 0.700772 after STOP. Default 100%, welcome
  on, Traditional Chinese and offset zero were restored through the actual UI
  without starting playback. Normal Raven was restarted and left Dormant.
- Provider completion is checked with nonzero processed audio and successful
  cue completion before music. Early testing only observed Speaking and allowed
  a timeout to pass; that weak assertion was replaced. The greeting was bounded
  to one short sentence and connection-plus-output timeout changed to 25 seconds.
- Silent native test verified the 100% command, a subsequent 40% command, no
  reset on a second play, orderly EOF shutdown and volume restoration. Audible
  QA stayed at 1%; the runner now captures/restores output levels itself.
- Visual review: actual Raven remains fully framed, with intact beak/eye/neck
  and torso in sampled poses, changing head/torso silhouettes and no captions.
  Console controls are separated and readable, including the fixed welcome /
  language layout. Static frames do not establish subjective dance quality or
  continuous physical smoothness. No claim of new limb animation is made.
- Review repaired a queued second-start race after STOP, suppressed shutdown
  volume-failure reporting, instantaneous-energy timing shifts, missing Dance
  status labels and global Stop All handling. Track changes deliberately use a
  simple next-start policy rather than the proposed seamless replacement queue.
  Low-confidence movement rests rather than adding an energy-only fallback.

Retained failures: first direct native read hit an unhydrated Drive placeholder
(decoder code 2; Node read errno -11); production preparation succeeded. Initial
type/test assertions needed corrections. Rendered run 1 used an invalid test
presentation; run 2 clicked before async STOP completed. Run 3's nominal pass
had the weak welcome assertion above. An early silent native probe sent an
unsupported `stop` command and exited 1; corrected EOF test exits 0. Final
journey also waits for the completed Return to Avatar reply before shutdown.
Full available failed output and run metadata are retained in the JSON report.

## Installation limits and cleanup

The venue TV ADB connection failed its bounded wake/standby attempt during
deployment preparation (`tv_standby_failed`, connection timeout; remote mouse
stop also failed). App shutdown, native HDMI black cover and Jabra70 succeeded.
No claim that TV power control is healthy. Physical beat-to-speaker/TV alignment,
independent speaker latency, output hotplug, actual 100%-audibility and a full
35-minute playback boundary remain on-site checks. Use the saved timing offset
after listening on the installation. The software and shorter native loop
boundary are verified; these physical checks are not silently treated as passes.

Owner published v21 and its saved unpublished draft were preserved. QA uses
isolated settings and restores defaults. Jabra read-back is **0.7007718682**;
other levels, mute, input gain and default devices match the pre-QA snapshot.
A later observation after the normal restart showed Jabra6.25%; the cause is
not established. Final explicit reset/read-back verified70 repeatedly with the
app running. This observation is retained rather than treated as proof that
every future normal-start device change preserves70.
Only task-owned copied media, derived plots, captures and isolated run roots are
removed after recording review; original Common media and installed controls stay.
Build hashes, exact runs, failures and final runtime evidence are retained in
the linked JSON/current PROGRESS handoff.
