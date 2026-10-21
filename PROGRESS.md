# Magic Mirror — current handoff, 2026-10-21

Current branch: `field/macmini-deploy`. **Image generation is selectable per Avatar
in Avatars → Skills.** Save/Publish applies on the next conversation. The real
Console journey passed **19/19**; fresh real-provider journeys passed
**Conversation 14/14**, **Interactive Studio with photo 24/24**, and ordinary
camera questions **5/5**. Initial Conversation timing and camera tool-selection
failures passed on their single retries; both failures remain recorded.
Feature commit `96f48e3` is pushed to `origin/field/macmini-deploy` and deployed
through the existing Mac LaunchAgent. The normal app is running; checked at
20:28 Taipei. Raven is asleep with wake listening active. The deployed Console
shows Image generation enabled under Avatars → Skills.
Clocked out at **20:36 Taipei**. LaunchAgent and Main PID 87151 were freshly
confirmed running; the app is left running without a restart or setting change.
The last live UI check remains 20:28. Feature `96f48e3` and deployment record
`907669a` are pushed; this handoff records the requested clock-out.
[TODO](TODO.md) owns open acceptance; [DECISIONS](DECISIONS.md) owns rulings.

## Selectable shared image capability

Each Avatar has its own validated, persisted `skills.imageGeneration` assignment.
Missing values remain enabled to preserve working Avatars. The native catalog's
`requiredSkill` field filters tools/rules and the Prompt Inspector together.
Main enforces the same immutable assignment, including connection rollovers;
publishing cannot change an ongoing guest conversation. Unknown session
assignments fail closed. Disabling the skill leaves ordinary conversation and
separately consented camera questions available, while Studio entry is blocked.

Conversation creates, displays, presents aloud, revises and dismisses pictures
using the same independent Main-owned image service as Interactive Studio.
The shared provider/sign-in is no longer owned by the guided Studio workflow.
The existing model, credential source and Studio content/settings are preserved.

A guest photo requires a request, completed spoken capture/cloud disclosure,
a later whole-final approval and a three-second countdown. Main validates the
decoded dimensions and one face. Portraits/artwork remain in RAM; cancellation,
session changes and stale results cannot revive a request.

The earlier ordinary-camera permission-bypass and Studio photo-attachment
receipt repairs remain intact; details are in the previous image report below.

## Verification and limits

- Real Console: **19/19**, including two independent Avatars, selection,
  Save/reload/Publish, prompt inspection, dormant activation, Main disabled-route
  rejection, existing Studio authoring and narrow layouts. Screenshots inspected.
- Complete Conversation: **14/14, exit 0**. Draw and chat, spoken reveal,
  revision, dismissal, photo refusal, new approval/countdown, portrait and
  revision, ordinary chat, sleep and release. Four images presented and four
  temporary image attachments removed; no provider errors.
- Complete Studio: **24/24, exit 0**. Name correction, refusal, new approval,
  photo attachment, four questions, painting/reveal, revision, keepsake,
  exact farewell, Dormant, Conversation-requested Studio entry and release.
  Both generated PNGs had transparent corners in this sample.
- Ordinary camera question: **5/5, exit 0**, with permission and a correctly
  grounded visual answer from a synthetic shapes image.
- Full suite: **2719 passed, 2 existing skips**; typecheck/build passed. Focused
  integration passed 285 tests; subsequent rollover/fail-closed checks passed 95.
  The later QA-only completion diagnostic passed a rebuild and Node typecheck.
- First Conversation attempt timed out on chat-during-painting completion despite
  two delivered replies and a displayed/revealed image; exact outstanding wait
  was not recorded. Metadata counters were added; unchanged production code and
  acceptance criteria passed the full retry. This is not a root-cause fix claim.
- First ordinary-camera attempt heard the request correctly but the model did
  not select the tool; permission never began and no photo was taken. The single
  unchanged retry passed. Model selection/timing variability remains a limit.
- Virtual visitor audio and real voice/image services were used. Public-photo
  simulation does not prove human microphone accuracy, audibility or likeness.
  Provider-only transparency variation remains outside the app blocker per
  the owner; no phase promotion occurred.

[Latest architecture audit, journeys, screenshots and failures](docs/testing/avatar-image-skill-selection-2026-10-21.md).
[Earlier camera/image journeys and native evidence](docs/testing/low-camera-image-journeys-2026-10-21.md).
[Original shared-skill design and earlier QA](docs/testing/shared-image-skill-2026-10-21.md) ·
[Earlier Studio audit](docs/testing/studio-audit-qa-2026-10-21.md) ·
[Pre-feature handoff and deployment history](docs/archive/progress-before-shared-image-skill-2026-10-21.md).

## Camera — real frames obtained; reliability remains open

Fresh AVFoundation inspection found **96×96 YUY2 at 5 fps** as the smallest
resolution and slowest advertised rate. Production selects that minimum;
the owner's temporary directive supersedes the earlier full-HD-only requirement.
No low-resolution capture is upscaled to claim HD.

Native QA returned **six 96×96 snapshots**, all with zero faces because no
person was present. Its stability test failed with two automatic USB resets
and a 9.789-second receipt gap. A separate measurement delivered **72 advancing
frames**, about **2.18 fps**, despite the configured 5 fps, with a 2.24-second
maximum source gap. Successful still delivery does not qualify continuous
operation or restart/reboot reliability. Native frames were neither saved nor
sent to the cloud.

[Native capture](.artifacts/phase4-qa/2026-10-21T06-37-40-368Z/camera-native.json) ·
[Rate measurement](.artifacts/phase4-qa/2026-10-21T06-39-21-718Z/camera-availability.json) ·
[Transport investigation](docs/testing/camera-availability-qa-2026-10-18.md).

## Runtime — deployed and running; checked 20:28 Taipei

The source/output fingerprint confirms canonical `out/` matches the tested
feature commit `96f48e3`. The installed LaunchAgent matches the repository field
definition and remains the sole restart owner. Bootstrap succeeded at 20:26;
Main PID 87151 remained unchanged through verification. Mirror and Console
loaded and reported ready. The live Console shows Raven asleep, wake listening
active, all modules normal, Conversation mode and ChatGPT signed in.
Avatars → Skills → Image generation is visible and enabled. Published config
remains v19 with no draft changes; the Console is left on Skills.

Audio remained **Jabra output 0%, muted; input 57%** across startup. Existing
audio preference and TV-network services were left alone. No TV power command,
provider test, guest session or camera capture was started during deployment.
This is the established checkout deployment, not a signed package acceptance.

The first deployment check expected a Console renderer at startup; Console is
created on demand. Opening it with the existing operator command completed the
check without an app change or restart. The failed check is retained. An earlier
temporary verifier import-path error was corrected before any launch.
[Deployment evidence](.artifacts/low-camera-journey-2026-10-21/image-skill-deployment.json) ·
[Initial readiness check](.artifacts/low-camera-journey-2026-10-21/image-skill-deployment-initial-check.json) ·
[Pre-deployment stopped snapshot](.artifacts/low-camera-journey-2026-10-21/avatar-skills-runtime-final.json).

## Next action

The requested per-Avatar selector, architecture audit, complete simulated
journeys, commit, push and field deployment are delivered. Future field acceptance needs
a willing guest for real microphone/capture/likeness checks and new physical
or vendor evidence for the intermittent USB transport. Other field work remains
in [TODO](TODO.md).
