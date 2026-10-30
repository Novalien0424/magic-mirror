# Magic Mirror — current handoff, 2026-10-30

## Current delivery

Runtime code: **448a2dd**, pushed on `field/macmini-deploy`, deployed from the
canonical Mac checkout. Dance Floor is available in Console/tailnet and Neo's
bottom-row third key; all eight controls are installed.
[Journey and limits](docs/testing/dance-floor-delivery-2026-10-30.md) ·
[409 checks / 14 rendered cases and failures](docs/testing/dance-floor-checks-2026-10-30.json).
MusicLoop accepts 200 MB; Studio redraws preserve meaning in the saved modern
minimalist style. [Prior handoff](docs/archive/progress-before-dance-floor-2026-10-30.md).

Current documentation: [PRD](PRD.md) covers all modes, controls and user stories;
[cleanup audit](docs/testing/repository-cleanup-2026-10-30.md) records retained
evidence and disposal. [TODO](TODO.md) is open-only; [DECISIONS](DECISIONS.md) owns
rulings. This documentation cleanup changes no runtime features or phase status.

## Last observed runtime — not a live health guarantee

- Normal canonical Electron remained running during this docs-only audit; no
  restart, QA launch, operator edits or new sound-producing checks.
- Last functional check: 10-30 Dance start with actual M4A/three outputs, then
  STOP/black HDMI/Jabra 70. Normal restart returned Dormant with wake listening.
- Published Raven v21 and its saved unpublished draft preserved. Dance defaults:
  default track, intensity/volume 100%, offset 0, welcome on, Traditional Chinese.
- Build 10-30 21:27:02 Taipei: source `a3f128351a466aeb`, output
  `e572cc16daff38b2`; native helpers installed. Not packaged-release acceptance.

## Next work / unresolved boundaries

1. TV ADB wake/standby and mouse release remain unhealthy; black cover/audio
   stop succeeded. One later Jabra 6.25% observation has no established cause;
   final explicit 70% held on repeated reads.
2. Studio failed-speech recovery and operator name-step rescue remain open.
   Near-sound matching/confirmation repair does not prove human-name accuracy.
3. Complete physical Dance AV alignment, hotplug and long-track checks; existing
   rig has head/body/eyes, no independent limbs. Other field checks and the
   deferred LLM catalog redesign are in [TODO](TODO.md).
