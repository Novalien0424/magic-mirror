# Magic Mirror — current handoff, 2026-10-30

Latest delivery: **Dance Floor implemented on the canonical Mac mini**.
Neo **bottom-row third key** is DANCE / FLOOR in the existing Magic Mirror copy 1
profile; the other seven controls remain. Console and its existing tailnet
version have a **Dance Floor** page. Default source is the owner's
`AI_Stuff/AI_Avatar/Common/DanceFloor.m4a` (34.2 MB, 35:12), played directly.
[Complete journey, implementation and limitations](docs/testing/dance-floor-delivery-2026-10-30.md) ·
[checks and retained failures](docs/testing/dance-floor-checks-2026-10-30.json) ·
[original plan/self-review](docs/testing/dance-floor-design-2026-10-30.md).

Start releases voice/wake/camera, prepares cloud media, analyses local beats,
gives a brief in-character Traditional-Chinese DJ welcome, then loops native
audio across available outputs. Speaker default is 100%, applied once; physical
adjustment remains free. Existing Raven head/body/eyes drive three beat phrases,
without its calm smoothing. No limbs were invented. The actual player clock,
confidence/energy and saved timing offset drive motion; stale clocks stop it.

Console saves track, intensity, volume, timing, welcome and Chinese/English.
Track/welcome/language apply next Start; other controls apply immediately.
STOP cancels every Dance activity, blacks HDMI and restores Jabra70 plus other
prior output levels. Global Stop All during Dance also stops it. Another mode
releases Dance; a crash never resumes loud playback automatically.

## Current evidence and runtime

- **409 focused/boundary tests pass**, both TypeScript projects, production build,
  build fingerprint and native signatures. **14/14 real rendered journey checks**
  pass, with actual Raven, native audio and provider welcome completion.
- Known native-decoded beats: maximum onset error **7.94 ms**. Final rendered
  measurement: 50 gestures, two native loop wraps, median **4.22 ms**, p95
  **7.52 ms** relative to player-clock beats. These are software timing results,
  not physical TV/speaker latency or human musical annotations.
- Production Console start at quiet 1% successfully prepared/analyzed/played the
  actual M4A across the three-output native route. Production STOP stopped Main,
  covered HDMI black and verified Jabra70. Normal canonical Electron restarted
  and is running Dormant, with normal wake listening; no QA/player child remains.
- Defaults restored through the actual Console: volume/intensity100%, offset0,
  welcome on, Traditional Chinese, default track. Owner published Raven v21 and
  saved unpublished draft preserved. Final Jabra reset/read-back70; other
  levels/mute/input/default devices preserved. Reviewed task copies/captures are
  cleaned; original Common media and runtime cache remain.
- Build **2026-10-30 21:27:02 Taipei**, source `a3f128351a466aeb`,
  output `e572cc16daff38b2`. Native helpers and eight control apps are installed.
  This is canonical checkout deployment, not signed packaged distribution.

## Remaining physical check / next action

TV ADB wake/standby is currently failing (`tv_transport_missing` /
`tv_command_timeout`; remote mouse stop also failed). App mode, native black
cover and audio restoration succeeded. Do not call TV power control healthy.
Owner should check the installation's audible/visible beat alignment and use
Dance Floor's timing offset; independent speaker delay, hotplug, actual100%
audibility and a full35-minute playback boundary remain unverified. The existing
portrait rig limits how extreme the visible dance can look.
One post-restart Jabra observation was 6.25% after STOP had verified70; its cause
is not established. Final explicit reset stayed at70 on repeated read-back.
Investigate that separate startup/device-volume change if it recurs.

Prior MusicLoop200MB / saved-modern-minimalist Studio redraw delivery remains
unchanged. Its evidence and the earlier handoff are preserved in
[previous PROGRESS](docs/archive/progress-before-dance-floor-2026-10-30.md).
The LLM-led full-catalog media selection redesign remains deferred in [TODO](TODO.md).
[DECISIONS](DECISIONS.md) owns rulings. No phase promotion.
