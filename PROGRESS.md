# Magic Mirror — current handoff, 2026-10-21

Current branch: `field/macmini-deploy`. Clocked out 2026-10-21 11:05 Taipei:
the two Interactive Studio audit defects are fixed, committed and deployed with
the preserved camera/QA and harness edits; the app is stopped.
[TODO](TODO.md) owns open work; [DECISIONS](DECISIONS.md) owns rulings.

## Studio audit fixes — 2026-10-21

Both audit defects are fixed in Main:
- **Cancelled startup.** Leaving the studio (Conversation switch, Console exit,
  scene or session close) now cancels starts still checking config/sign-in, and
  studio-mode starts recheck the live switch before opening. A cancelled Console
  start replies `ignored studio_start_cancelled`, a visitor start is refused with
  the unavailable line, a studio wake tells the Mirror to greet normally; each
  reports `studio_start_cancelled`.
  [Startup](src/main/studio/studio-ipc.ts).
- **Name confirmation.** The four-attempt shortcut is removed; an unconfirmed
  name is read back until the visitor accepts it, per DECISIONS 2026-10-20.
  [Runtime](src/main/studio/studio-runtime.ts).

Four new regression tests (IPC cancellation by exit and by mode switch, Main
repeated/corrected names, and Main behind the renderer's read-back guard) fail
on the previous code and pass now. Typecheck passes; the stamped build
(2026-10-21 10:53 Taipei) and full `npm test` pass: 2672 passed, 2 skipped.
No provider, microphone or Electron QA ran. The harness cleanup's recorded
static checks passed (17 skill frontmatters, TOML/JSON settings, 222 local
links, 17 heading anchors; all 12 invariant texts unchanged).

## Latest delivered feature

Interactive Studio supports configurable stories, its own wake phrase and
farewell, a persisted Mirror mode switch, sticker/full-picture output, name font
and visible prompts. Printing remains unimplemented. Latest recorded live QA
(2026-10-20): Oracle 24/24, Pawnshop 24/24, published studio 23/23 as stickers;
Cartographer 18/18 as a full picture. The recorded full suite was 2668 tests,
with `--studio-journey` and `--console` passing. These historical passes do not
cover the new audit defects or establish human acceptance.
[Delivery and retained failures](docs/testing/interactive-studio-stories-2026-10-20.md) ·
[Remote Console](docs/testing/remote-console-2026-10-18.md) ·
[Artifact cleanup record](docs/testing/qa-artifact-cleanup-2026-10-20.md).

## Camera investigation — preserved, blocked

The owner requires actual **1920×1080**, normally a fresh photo within **5 seconds**;
low FPS and minor edge defects are allowed only with the face intact. Root/direct
USB capture works, but usable images are not repeatable. Strict JPEG checks
overturned the earlier ImageIO throughput result: only 2/975 MJPEG30 and 5/124
MJPEG5 frames decoded without warnings. H264 supplied isolated clean frames at
2.251 and 2.558 seconds, then failed the next five-second cold-start window.
No face-safe damage bound, production transport or persistent privileged service
is qualified. Decoder/transport success alone is not usable-image acceptance.

Local app edits permit full-HD snapshots without upscaling and bound IPC framing.
Recorded checks: 300 snapshot/path tests, 15 availability tests, node/web
typechecks and a stamped build; the H264 checker has 19 focused tests and twelve
RAM-only integration cases. These checks were not rerun for this documentation task.
Next discriminator: vendor-matched firmware/PCB information or a different
physical cable/port/controller/host. No matching firmware or remote VBUS switch
is available; neither cable nor macOS is uniquely established as the cause.
A deployed repair must survive restart/reboot and still needs app/avatar and
48-hour/200-request acceptance.
[Criteria, failures and restoration](docs/testing/camera-availability-qa-2026-10-18.md) ·
[Driver/hardware research](docs/testing/arducam-driver-research-2026-10-18.md).

## Runtime — stopped 2026-10-21 11:02 Taipei

Commit `480dfb6` (stamped build 10:53) is the deployed `out/`. It was started
at 10:56 with the START script (`started`, `tv_awake`; Mirror fullscreen on
`T749-fHD720`, no new stderr), then stopped at the owner's request at 11:02
with the STOP script: button log `stopped`, `tv_standby`, `mouse_stopped`;
`APP_EXIT code=0 reason=operator_stop`; LaunchAgent unloaded (print exit 113);
no Electron process. The glass stays black through TV standby; Mac HDMI and
display layout are unchanged. Press START to resume.
The Jabra (default output) read 0 % muted this morning, after the 10-20 STOP;
set to 69 % unmuted while the app ran, it read 0 % muted again right after this
STOP, still the default output. No STOP code mutes it; the cause is unestablished.
After the next START, set it to 69 % unmuted once the app has opened it.
No wake, conversation or Studio visit was exercised on this build.
The 2026-10-18 PID/audio snapshot and full investigation handoff are
preserved in the [prior handoff](docs/archive/progress-before-harness-cleanup-2026-10-21.md).

## Next work

Keep camera research pending new vendor/hardware evidence. Human Studio visits, physical
wake/Neo/remote-pointer checks, QA output-device restoration, live judge baseline,
cold Drive downloads and Mac field acceptance remain in [TODO](TODO.md).
Runtime is left under the owner's control.
