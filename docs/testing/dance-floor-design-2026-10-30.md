# Dance Floor — research, proposed journey and self-review

Date: 2026-10-30. **This is the plan recorded before implementation.**
Implementation and measured acceptance are in the
[delivery report](dance-floor-delivery-2026-10-30.md). The owner subsequently
provided `Common/DanceFloor.m4a`; it is used directly without transcoding.
The proposal below remains the design record, not a claim that every proposed
physical acceptance check has been completed.
The owner requested research and self-review first, then clarified that Raven
must show the strongest convincing movement its available body parts support,
in sync with the actual music. No music was downloaded, no volume was changed,
and no app/model/settings files were changed during this research.

## Proposed experience

1. Put the selected MP3 in `AI_Stuff/AI_Avatar/Common/DanceFloor/`. Keep this
   playlist separate from `Common/MusicLoop`. Reuse the existing local/cloud
   preparation and 200,000,000-byte limit. Validate playable audio and duration;
   do not treat a URL, partial download or HTML response as a ready MP3.
2. Add **DANCE / FLOOR** to the Neo's unused bottom-row third position and a
   matching Dance Floor section in Console, including the existing tailnet web
   Console. The seven-button installed profile has that position free; older
   copies also exist, so identify the active profile during installation and
   preserve its other buttons. Use the supported profile import path.
3. Pressing Start exits the previous activity, releases its microphone and audio
   ownership, prepares the selected track and shows Raven on the correctly
   oriented TV. This is a visible mode; Music Loop's deliberately black display
   remains its own mode. Console shows preparing/ready/playing/error and the
   selected track. Missing media does not trigger fake playback or a hidden
   substitution.
4. Raven gives one short, naturally generated Traditional-Chinese DJ welcome
   using the published character, voice and effects. Heavy-metal stage attitude
   belongs in a small versioned prompt addition, with no scripted jokes. English
   requires an explicit selection. There are no visitor captions. A failed or
   slow welcome must not prevent music from starting; late speech is cancelled.
5. On actual music entry, set controllable connected speaker outputs to **100%
   once**, verify read-back and play the selected track through the existing
   native all-output route. A fixed-volume output is reported accurately;
   software gain 1.0 cannot prove a TV's own amplifier is at 100%. Physical
   buttons and Console volume remain usable afterward. Do not continually reset
   volume, reset it at track boundaries, or boost newly attached devices.
6. Raven performs energetic, varied head/body choreography to the track's actual
   audio timing. The selected track repeats until STOP or another mode is
   selected. The default performance is high energy, with musical rests and
   stronger accents. A quiet breakdown must not look like the loudest chorus.
   “With the crowd” means Raven shares the music and rhythm; camera-based crowd
   pose imitation is outside this first feature.
7. Console provides Start, global STOP, selected Common/DanceFloor track,
   volume/read-back, intensity and DJ-welcome on/off. Changing tracks prepares
   the replacement while the ready track continues; switch only when ready.
   Repeated Start is idempotent. No sequencer or continuously talking DJ is
   needed for the first version. Settings persist, but a crash/reboot must not
   autonomously restart 100% playback.
8. **STOP** cancels preparation, analysis, speech, animation and music; HDMI is
   fully black and Jabra is reset/read back at **70%**. Restore other outputs to
   their captured pre-Dance levels. Selecting Studio, Desktop, Video Loop,
   Music Loop or normal Raven performs the same Dance cleanup before the target
   mode takes ownership. Merely opening Console does not interrupt the music.

## Fresh audit of the installed Raven rig

The published Raven uses `model-290002c3-7e18-466c-b547-d98a67e054eb`,
`raven-lord.model3.json`, labelled Raven v11. The manifest selects
`raven-calm-v1` and contains seven lifecycle motion groups, with no dance clip.
Its display-info has no independent arms, hands, wings or legs.

A read-only Node/VM probe loaded the **installed MOC through the vendored Cubism
Core**, set every parameter to its minimum and maximum with all other parameters
at defaults, called `model.update()` and compared drawable vertices/opacities.
Exit 0 at `2026-10-30T12:15:39Z`: **27 parameters, 22 drawables, 13 parameters
with measurable effects, 14 without effects in this neutral-pose test**.
MOC SHA-256:
`3065d7339eb57762e282016eb81a1f1894c05f224d1180cc47ee86f71b060de0`.
This is actual Core geometry evidence, not rendered/artistic acceptance.

| Controls | Core range | Observed effect and proposed use |
| --- | --- | --- |
| Head X/Y/Z | -30 to 30 each | All change head meshes; head turn, downstroke and diagonal toss. Maximum vertex displacement from neutral: X 0.411843, Y 0.100125, Z 0.113747 in model coordinates. These are parameter units, not physical degrees. |
| Body X/Y/Z | -10 to 10 each | Move torso/neck and attached head meshes; alternating lean, forward pulse and counter-rotation. Maximum displacement: 0.136856 / 0.093202 / 0.095122. |
| Breath | 0 to 1 | Small torso/head expansion, maximum displacement 0.011308; secondary accent only. |
| Eyeball X/Y | -1 to 1 | Iris movement for deliberate crowd-facing glances. |
| Left eye open | 0 to 1 | Changes eyelid opacity; controlled blinks/squints. |
| Left/right eye smile | 0 to 1 | Change separate facial meshes; right-side effect is small. Visibility depends on pose and masking. |
| Beak open | 0 to 1 | Moves jaw/shadow meshes; reserve for real DJ speech, not musical vocals. |
| Right eye open, eight brow controls, mouth form, cheek, three hair controls | Various | No vertex/opacity change in the tested neutral configuration. Do not advertise these as working dance channels without additional pose-specific evidence. |

The running canonical Electron was detected and left running; no second Electron
or Electron QA was launched. Native computer access exposed the Mirror window
but returned `Screenshot unavailable`; the Console shortcut did not expose a
preview. The Window menu was dismissed. Therefore no rendered extreme-pose,
continuous motion, beat-alignment or physical speaker claim is made here.

## Making the most energetic movement look intentional

The first implementation slice is a **silent rig audition**, before integrating
music or 100% volume. Use the existing isolated Console preview and the installed
model, without publishing a replacement rig or changing the normal calm persona.

- Sweep head/body axes separately and together at 25%, 50%, 75% and 100% of the
  Core range. Inspect both directions and transitions. Derive a clean envelope
  per axis and combination, rather than setting every axis to its maximum.
- Review actual frames at TV size and eye/beak/neck crops. Reject torn necks,
  detached eyes, doubled beaks, feather stretching, mask seams and frame clipping.
  A valid numeric parameter value does not establish a good-looking pose.
- Build three or four coordinated phrases: a sharp forward headbang with torso
  recoil; alternating side leans with a delayed head toss; a larger diagonal
  accent; and a restrained breakdown groove. Change phrases on musical groups
  of beats, not randomly each frame. Brief holds make the next large hit read.
- Use anticipation before the beat, impact at the beat and an eased recovery.
  Start from the strongest visually clean range; expose intensity as a scale
  within that envelope. For very fast music, use half-time main body hits with
  smaller intervening accents instead of frantic frame-by-frame oscillation.
- The current `PerformanceContinuity` applies a 0.18-second body/head time
  constant. Do not run sharp dance curves through this calm filter: it attenuates
  and delays them. Give Dance a dedicated parameter owner and authored curves;
  retain entry/exit crossfades. Disable conflicting lifecycle and gaze writes.
  Blinks and speech-driven beak motion keep explicit ownership.
- Do not infer full-body dance from the model's parameter names. If the strongest
  clean existing deformation still looks too restrained, show that limitation;
  a new rig/export would be a separate scope, not concealed with camera shake.

## Synchronization architecture

Use the **music file**, never the microphone, for rhythmic analysis. Use the
**native player's actual position**, never an independent animation timer, for
playback phase. The LLM supplies the brief character welcome; it does not choose
poses or authorize hardware on each beat.

Proposed first implementation: stream-decode the local file with AVFoundation
into bounded audio-analysis windows; use native Accelerate signal processing
for low-frequency energy, transient/onset strengths and a rolling tempo/phase
estimate. Retain timestamped analysis metadata keyed by file content hash and
analysis version, not raw PCM. A long DJ mix needs local tempo changes and
silence/breakdown handling, not a single assumed BPM for the entire track.
This is a design choice requiring an audio prototype, not an already validated
beat detector. Compare detected accents with the actual selected track before
acceptance. Distinguish strong rhythmic transients from confidently tracked beats.

The existing AVPlayer helper only reports start/end/failure. Extend its protocol
with bounded position/rate/generation/monotonic-time updates and loop/discontinuity
notifications. Renderer interpolates between those reports; pauses, stalls,
seeks, loop restarts and route changes reset the appropriate clock state. Send
future beat timestamps early enough to animate anticipation. Calibrate a shared
audio/visual offset on the actual TV/speaker installation; independent speakers
can have different latency, so simultaneous routing alone cannot prove sync.

While analysis is unavailable or low-confidence, use restrained energy-reactive
movement and report the reason in Console. Do not claim beat synchronization in
that state. Music remains usable if analysis fails. Cancellation tokens prevent
an old analysis, track event or welcome from reappearing after STOP.

Essentia is a researched alternative: its documented rhythm extractor produces
beat times and confidence, but uses whole-track statistics and is not a live
detector. Adding that dependency, packaging and licensing work is not justified
before measuring the smaller native approach. If the prototype cannot meet the
musical acceptance test, report that result before selecting another dependency.

## Integration boundaries and self-review

| Finding | Proposed correction / acceptance condition |
| --- | --- |
| Music Loop returns a black renderer | Add an explicit `dance` operator mode; share the player, not Music Loop's display policy. |
| Multiple playback owners would overlap | Keep Main's serialized operator transitions and one music child; parameterize its scoped playlist rather than create a second player. |
| Existing ordinary Realtime requires an input stream | Add a narrowly scoped output-only welcome path with no microphone acquisition, transcription, tools, private memory or extraction. Do not bypass the normal input gate globally. Preserve the configured model ID and voice/DSP. |
| 100% music would contaminate listening | Release wake/Realtime microphones before starting. STOP and controls remain physical/Console actions. No automatic crowd listening in this mode. |
| Renderer smoothing can destroy beat accents | Dedicated Dance head/body ownership and timed curves; restore normal writers on exit. |
| Listed rig controls may not affect pixels | Fresh Core audit above plus required rendered sweeps; use confirmed visual channels only. |
| Model changes could break dance | Check required capabilities explicitly; do not select behavior by imported filename or UUID. Show a supported fallback reason. |
| Native all-output route and browser DJ voice differ | Verify the welcome's configured output route separately. Music uses all native outputs; do not claim that this automatically mirrors browser speech. First version plays the welcome before music, avoiding simultaneous voice/music mixing. |
| 100% on every event would override the operator | Set once on explicit transition into ready playback. Preserve manual changes thereafter. Failed controllable-output writes are visible. |
| Crash recovery could unexpectedly blast music | Persist preferences, not active Dance playback intent. App restart waits for explicit Start. |
| Large/cloud media may stall | Reuse 200 MB validation, bounded preparation, playable cached files and cancellation. Selected replacement waits until ready while current music continues. |
| STOP during any pending operation | Generation invalidation, child shutdown, animation reset, black HDMI, output restoration; verify no delayed restart. |

Invariants: (1) welcome audio/text remain RAM-only, diagnostics are metadata;
(2–5) no recognition or private identity/memory path is entered;
(6) mode control performs no extraction; (7) explicit operator actions authorize
hardware and do not relax the spoken-command matcher; (8) zero microphone owners
during Dance; (9–10) visible reasons and independent degradation;
(11–12) existing versioned runtime models and Main-only credentials, unchanged.

Likely touched areas: `src/shared/operator-loop.ts`, `src/main/operator-loop.ts`,
`src/main/operator-control.ts`, `src/main/music-loop.ts`, the native
`deploy/macos/music-loop.swift` and output-level helper, Main wiring/typed IPC,
Mirror/Console mode controls, `src/renderer/avatar/cubism-avatar.ts` and a small
dedicated dance-performance module, versioned welcome prompt/output-only voice
adapter, `scripts/mirror-tv-control.mjs` and Stream Deck profile generation.
Final file ownership follows implementation discovery; no unrelated cleanup.

## Implementation and QA order

1. **Rig audition and beat-analysis prototype:** rendered range sweeps, combined
   poses and a continuous high-energy sequence using the real Raven. Check actual
   track onsets/beat changes against listening and plotted timestamps. These
   establish whether the desired visual effect is achievable with this rig.
2. **Mode/player/clock integration:** focused tests for one owner, repeated Start,
   pending downloads, playback clock stalls/loops, failure and cancellation.
3. **Operator UI and voice:** exercise actual Console and Neo entry/exit, track
   selection, volume/intensity, language, no captions, no microphone acquisition,
   speech cancellation and successful fallback when the provider is unavailable.
4. **Real installation journey:** start from normal Raven, Studio, Desktop, Video
   Loop and Music Loop; return to each. Check TV orientation/framing, sustained
   playback across a full track boundary, every output's audibility, measured
   audiovisual offset, tempo changes and energetic movement over time. Include
   disconnect/reconnect, renderer recovery, corrupt/missing file and STOP at every
   preparation/playback stage. A moving clock alone is not sound evidence.
5. **Volume QA and restoration:** existing owner instruction keeps audible QA at
   1%. Test 100% command/read-back separately with playback stopped and outputs
   protected; actual 100%-volume sound is a distinct live acceptance, not silently
   substituted for quiet QA. Guaranteed cleanup restores Jabra70 and other saved
   outputs, preserves mute/input settings and removes owned test artifacts.
6. Review the final diff once, run affected tests/typechecks/build and packaging
   checks, preserve unsaved settings, then use the authorized canonical deployment
   flow. Record actual results and any physical/manual exclusions, never historical
   passes as new Dance Floor evidence.

## Selected music and researched sources

- YouTube's official oEmbed identified the supplied video as **DJ REMIX 2026 | #63
  | The Best Remixes & Mashups of Popular Songs - Mixed by Deejay FDB**. It is
  described as a remix/mashup mix; the heavy-metal direction applies to Raven's
  performance unless the owner changes the selected music. Watch-page retrieval
  was throttled; oEmbed succeeded. No duration/codec/downloadability claim yet.
  [Selected video](https://www.youtube.com/watch?v=r8o9npHJi_k).
- The creator's shop lists a **€30 2026 download collection**, described as all
  2026 YouTube mixes. Inclusion of this exact file/MP3 encoding has not been
  verified inside the collection. The visible free-download list does not list
  #63. No purchase or MP3 import was performed. Obtain the creator download or
  owner's authorized copy before the media-import step; do not silently substitute
  another mix. [2026 collection](https://dj-fdb-shop.company.site/products/2026-YOUTUBE-MIXES-%26-UN-MIXED-TRACKS-p805285330),
  [free-download list](https://dj-fdb-shop.company.site/products/FREE-DOWNLOAD-c162448582).
- Live2D documents motion loading, explicit looping, per-frame updates and fade
  behavior. Local vendored SDK behavior remains authoritative for this project.
  [Live2D motion documentation](https://docs.live2d.com/en/cubism-sdk-manual/motion/).
- Apple documents AVPlayer media timing and periodic/boundary observers. This
  supports using the player clock for synchronized visuals.
  [AVFoundation playback guide](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/MediaPlaybackGuide/Contents/Resources/en.lproj/ExploringAVFoundation/ExploringAVFoundation.html).
  The AVAssetReader web page required JavaScript and its Markdown fetch failed;
  confirm the exact native decode API against the installed SDK during prototype.
- Essentia documents per-beat timestamps, confidence, whole-track analysis and
  the limitations of global tempo assumptions.
  [Beat detection tutorial](https://essentia.upf.edu/tutorial_rhythm_beatdetection.html).

Research is sufficient to define the first implementation slice. Media acquisition,
rendered extreme-motion quality and measured acoustic synchronization remain
explicit unresolved items; no feature or QA acceptance is claimed.
