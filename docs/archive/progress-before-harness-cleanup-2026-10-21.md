# Superseded PROGRESS snapshot — archived 2026-10-21

Preserved before harness cleanup, including the uncommitted camera investigation.
Dates and runtime claims below are historical. Current handoff: [PROGRESS](../../PROGRESS.md).
Only relative links were rebased for this archive location.

# Magic Mirror — current handoff, 2026-10-18

Current work (**Arducam availability investigation**, local changes/build):
Owner's latest acceptance: actual 1920×1080, very low FPS permitted, fresh photo
within **5 seconds** normally, minor edge defects permitted with the face intact.
Direct USB/custom drivers are authorized and any deployed fix must persist
across restart/reboot. Bounded damage-localization and full-resolution bandwidth
trials are complete; decoder warnings alone are no longer the acceptance gate.
**1920×1080 is mandatory; no usable-image repair is qualified.** Administrator
capture now works, and an exact-camera libusb Darwin patch prevents receive-queue
exhaustion after mixed isochronous errors. ImageIO appeared to pass 20 sub-second
full-HD bursts, five minutes at 28.39 FPS, and a RAM H264 round trip. **Strict JPEG
validation then exposed missing image data:** only 2/975 ImageIO-valid MJPEG30
frames and 5/124 MJPEG5 frames decoded without warnings. Larger transfer batches
also failed. Those earlier throughput results do not establish usable pictures;
the prototype is withheld from production. Native IOUSBHost also produced zero
strict-valid images; camera H264 decoded 693 full-HD frames with 655 decoder
error lines, failing clean-image QA. No images/video/audio are retained.

Latest vendor-control tests identify the specimen's Sonix SNC292A protocol and
verify volatile bitrate/GOP/mode/QP readbacks and restoration. MJPEG bitrate,
endpoint reservation, priority, additional FPS and standard quality controls
did not qualify. H264 1 Mbps with original GOP 29 supplies one independently
decoded full-HD frame at 2.251 s; a cold-start follow-up supplies one at 2.558 s,
then the next cold start supplies none within 5 s. Other tested GOP/VBR/QP
combinations yielded zero clean IDRs. **Still supply is not repeatable, and no
face-safe edge-damage bound is established.** The metadata-only H264 checker
passes 19 focused tests and twelve RAM-only integration cases. Lower FPS is
accepted; corruption and repeatability remain the blockers, not a 15-FPS floor.

App changes remove the 1280 snapshot cap (actual 1080p permitted, no upscaling),
bound private IPC framing, require actual photo dimensions in QA, and retain the
15-second request deadline/unknown-mic USB-reset guard. **300 snapshot/path tests,
15 availability tests, node/web typecheck and stamped build pass**; earlier 111
camera/build checks are retained. No production format fallback, firmware,
privileged camera service or system driver replacement is installed.
[Frozen criteria and all results](../../docs/testing/camera-availability-qa-2026-10-18.md) ·
[driver/firmware/hardware research](../../docs/testing/arducam-driver-research-2026-10-18.md).
The non-root libusb and restricted AccessoryAccess failures remain history;
they are **not root-access blockers**. A fixed root-owned local helper is a
feasible future deployment route without treating Developer ID as an absolute
prerequisite. No such service is installed. The owner confirmed the Arducam
2MP low-light M12 pinhole product link (B0520/B052001 family); vendor-matched
firmware/PCB revision and physical cable/port/host comparisons remain unavailable.
Arducam supplies firmware privately and calls for physical replug after flashing.

AVFoundation rejects 1/2 FPS. Direct full-HD USB requests echo 1/2/5 FPS but all
deliver about 3.85 source FPS, so true 1/2 FPS is unproven. USB configuration
reads back 34-byte PROBE/COMMIT despite UVC 1.00. The fixed transport's YUY2/5
trial delivered 130 incomplete buffers, zero full images. Original payload and
JPEG marker/integrity synthetic checks pass ASan/UBSan. Avatar rendering is
independent; no avatar-active or 48-hour acceptance is claimed.
Targeted suspend/resume succeeds at API level without confirmed suspend state;
configuration **1 → 0 → 1** is verified, but subsequent HD supply still fails.
Current re-enumeration already simulates logical unplug/replug. The camera's
root-port attachment has no verified software VBUS switch; individually
switchable hubs found elsewhere are not its ancestors. Broader primary-source
macOS camera research and USB probe evidence are linked in the reports above.

Latest delivery (**Sticker pictures and visible prompts**, 2026-10-20
afternoon; pushed to `field/macmini-deploy` and PR #2): Interactive Studio
pictures default to **stickers** (square transparent PNG, one emblem with a
white die-cut border) with Console **Picture type** (Sticker / Full picture)
and **Name font**; hidden prompt text moved to versioned files and shown in the
Prompt Inspector (memory helpers view only); one short line before a change
request (owner choice); order guards stop the model finishing or changing a
picture, or recording a name or answer, without the visitor. **Live: Oracle
24/24, Pawnshop 24/24, published 23/23 as stickers, Cartographer 18/18 as a
full picture; full suite 2668, `--studio-journey`, `--console` pass.** No print
output yet (TODO). Runtime 14:44 Taipei: production on this build, Dormant and
listening, Jabra 69 % (set after restart); QA artifacts deleted.
[Evidence](../../docs/testing/interactive-studio-stories-2026-10-20.md).

Earlier (**Interactive Studio follow-up**, 2026-10-20 morning): fixes for a
repaint spoken twice and an English last description, prompts shortened to the
realtime prompting guide, name-confirmation and clean-up fixes.

Earlier (**Interactive Studio stories**, 2026-10-19 late): three spiritual
stories and the published studio ran live end to end; QA fixed the first step
never asked, English stories starting in Chinese, lost name corrections, the
undescribed last picture, and Console stale mode/result line and a false
microphone warning. [Evidence](../../docs/testing/interactive-studio-stories-2026-10-19.md).

Earlier tonight (**Remote Console QA**, 2026-10-19; pushed to
`field/macmini-deploy` and PR #2): the Desktop app **Remote Console Magic
Mirror** (Console on the main display beside the avatar, for Chrome Remote
Desktop) now has user journeys O8, five new `--operator-loop` cases and three
live studio steps. QA found and fixed a Console defect: after INTERACTIVE
STUDIO or START while asleep, the Console kept showing the old Mirror mode; it
now re-reads it when shown. On the stamped build **`--operator-loop` (22
cases), full suite, `--console` and `--studio-journey` pass**; three live
`portrait_studio` visits: console steps 9/9, two runs fully green, one with an
unidentified provider error event. The real Desktop, CONSOLE and START apps
were checked on production at the macOS window level. Runtime 21:50 Taipei:
production restarted on this build, Dormant and listening, Console hidden,
Conversation, Jabra 69 %.
[Evidence](../../docs/testing/remote-console-2026-10-18.md#full-qa-and-user-journeys-2026-10-19) ·
[journeys](../../docs/testing/user-journeys-2026-10-18.md#o8-check-in-from-away-remote-console).

Previous published delivery (**Interactive Studio visit flow**; pushed to
`field/macmini-deploy` and PR #2 `feature/portrait-studio` → `main`): in
Interactive Studio mode the mirror wakes to its own **Studio wake phrase**
(default 「招喚渡鴉使者」, set in the Console), runs name → questions → picture,
says the **Studio farewell** (「願你找到你所追尋 / 再會 / 人類」, pauses between lines)
and returns to Dormant; the studio character (system prompt), rules, questions,
every step's reply, image prompt, on-glass text and failure lines are editable
in an editor ordered by the visit; printing has a documented seam. Built on the
same day's Interactive Studio, Mirror mode switch and Stream Deck key delivery.
On the stamped build: **full suite, `--studio-journey` (incl. the real wake
listener switching to the studio phrase), `--field-help`, `--console`,
`--profiles`, `--editor`, `--operator-loop`, `review_ui` and one live
`portrait_studio` run of the owner flow (17 steps, farewell → Dormant) pass.**
[Evidence](../../docs/testing/interactive-studio-2026-10-18.md) ·
[user journeys](../../docs/testing/user-journeys-2026-10-18.md).

Earlier today: memory extraction on `gpt-6.1-sol` and ChatGPT sign-in upkeep
([evidence](../../docs/testing/memory-model-signin-2026-10-18.md)); the nine TODO
code-audit fixes ([evidence](../../docs/testing/todo-audit-fixes-2026-10-18.md)).
Earlier: Console revamp ([evidence](../../docs/testing/console-ux-revamp-2026-10-17.md)),
Portrait Studio ([QA](../../docs/testing/portrait-studio-2026-10-17.md)), Loop Video
Drive save ([evidence](../../docs/testing/loop-video-cloud-save-2026-10-17.md)),
portrait Console mouse ([setup](../../docs/testing/portrait-console-mouse-2026-10-17.md)),
Neo operator controls ([QA](../../docs/testing/operator-controls-2026-10-17.md)) and
Loop Video ([ledger](../../docs/testing/operator-loop-2026-10-17.md)). Prior handoff:
[archive](../../docs/archive/progress-before-clockout-2026-10-18.md).

Runtime (**23:32 Taipei, 2026-10-18**, restored): stamped build verified; normal
LaunchAgent PID 19470 is freshly Dormant and wake-worker-listening. Zero camera,
reset or research capture helpers remain; the ownership lease shell exited 0.
Original UVC and Sonix controls and Apple video drivers are restored/read back.
Mirror mode Conversation; published config version
19 was preserved. [Restoration metadata](../../.artifacts/camera-availability-2026-10-18/runtime-restored-full-resolution.json).
Stream Deck: the five-key profile is imported and selected for the Neo ("Magic Mirror
copy"); the old four-key profile is still listed, unused. Output: Jabra (default
input/output), unmuted; current CoreAudio output scalar **0.0625** and input
0.571429, matching the latest full-resolution preflight. App startup applied
0.752425 output; the exact preflight level was restored and read back. Camera
QA was silent. [Audio readback](../../.artifacts/camera-availability-2026-10-18/audio-restored-full-resolution.json).
The owner is away for two days.

Open gaps (all in [TODO](../../TODO.md)): saying 「招喚渡鴉使者」 at the mirror and a
physical INTERACTIVE STUDIO press; a human studio visit; the QA sound wrapper
under output-device switches; the stricter `gpt-6.1-sol` judge baseline; no real
cold Drive download since the deadline change; Chrome Remote Desktop pointer;
physical Neo checks; camera, wake and dialogue boundaries in the
[open-issues ledger](../../docs/testing/open-issues-2026-10-13.md). No phase
acceptance changes.

Next camera step: obtain a new discriminator for the remaining USB packet loss:
exact PCB/vendor-matched firmware information or a different physical USB
path/controller/host when available. No matching firmware or remote VBUS switch
is available now; cable/host changes await physical access. Neither cable nor
macOS is uniquely established as the cause. Root access and direct USB are
feasible; retaining a permanent failing helper would not satisfy persistence.
Keep the full 1920×1080 requirement and the experimental sources. A persistent
Main-owned, protected native transport remains the deployment route after
repeatable usable-image delivery is established; app/avatar/restart/reboot and
the 48-hour/200-request soak remain unqualified. No background test is running.
Owner Studio check: press INTERACTIVE
STUDIO, say the studio wake phrase at the
mirror (if detection is weak, try 召喚 instead of 招喚 in Interactive Studio ›
1 · Start), run one visit to the farewell, then START MIRROR; walk user
journeys O2–O4 on the portrait TV. Leave runtime and device state under the
owner's control.
