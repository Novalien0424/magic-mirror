# Per-Avatar image skill: design and acceptance journeys

Owner request: make the common image skill selectable per Avatar, audit its
foundation, and complete both Conversation and Interactive Studio journeys.

## Design

`avatar.skills.imageGeneration` is the saved assignment. Avatars → Skills edits
it through the existing Save/Publish workflow. Missing assignments stay enabled
to preserve existing Avatars. Each Avatar has an independent value; duplication
copies it. Interactive Studio retains its story, style and quality settings.

Both agents use the versioned native tool catalog filtered by the assignment.
The Prompt Inspector uses those same builders. Main pins the assignment in the
session-start bundle and checks it independently of model/renderer requests.
Publishing affects the next conversation; an existing session keeps its selection,
including connection rollovers within that conversation.
Unknown session assignments fail closed. Ordinary conversation and consented
camera questions remain available when image generation is off.

One Main-owned image service owns the provider, ChatGPT sign-in and refresh.
Conversation and guided Studio both receive it; neither owns the other. Existing
versioned image model, quality settings and provider implementation are retained.
Guest portraits still require the separate request, spoken disclosure, later
whole-final approval, countdown and fresh validated one-face capture. No image
assignment authorizes a portrait capture. Images and transcripts remain RAM-only.

The architecture follows the [foundational tool contract](realtime-tool-architecture-2026-09-17.md):
versioned catalog → shared validation/filter → native tool and inspector →
validated handler → Main authorization/effects. `requiredSkill` names a validated
registered capability; adding a catalog entry still cannot grant an effect.
The registry and persisted assignment can grow with further skills without
duplicating the image service or the two workflows. No general plugin loader,
dependencies, model substitution or credential path changes were introduced.

## User journeys, written before QA

1. Operator: open Avatars → Skills. Duplicate an Avatar, disable Image generation
   only on the copy, save, reload and publish. Inspect the copy's tools. Activate
   it while Dormant: Conversation stays available; Studio mode and test generation
   are refused by Main. Return to the original Avatar and verify the skill and
   Studio mode remain enabled. Verify narrow UI and existing Studio authoring.
2. Conversation guest: wake, request a picture, continue chatting while it paints,
   hear and see the result, request a change and dismiss it. Request a photo-based
   picture, refuse permission, request again and approve after the disclosure.
   Complete countdown, generate and revise the portrait, chat again, then sleep.
3. Interactive Studio guest: enter Studio, give and correct a name, decline photo
   use, request again and approve after disclosure. Complete all four questions,
   see/hear the painting, request a revision, receive the keepsake and exact
   farewell, and return to Dormant. Wake in Conversation, request Studio, then
   exit and release its image state.

Real-service guest journeys use virtual visitor audio and the previously approved
public NASA portrait at 96×96. They do not claim human microphone or USB stability
acceptance. The six real USB frames already obtained and their transport failures
remain documented in [the earlier run](low-camera-image-journeys-2026-10-21.md).

## Results

- Focused integration: **285 passed**. Subsequent session-rollover/fail-closed
  checks: **95 passed**. Typecheck and rebuilt bundles passed. Initial failures
  caught a disabled-tool reference in camera wording and an inspector test using
  a fixed section index; both were corrected. One test-only type mismatch was
  corrected. Full initial logs are retained, not replaced.
- Real isolated Console journey: **19/19, exit 0**, 15 screenshots. This includes
  per-Avatar selection, Save/reload/Publish, native prompt inspector, Main refusing
  disabled mode/test calls, dormant activation, restoration to the enabled Avatar,
  and the complete existing Studio authoring/mode controls.
  [Run](../../.artifacts/phase4-qa/2026-10-21T09-52-24-933Z/evidence.json).
  Visually inspected the [enabled skill](../../.artifacts/phase4-qa/2026-10-21T09-52-24-933Z/screenshots/journey-skills-enabled.png)
  and [disabled narrow layout](../../.artifacts/phase4-qa/2026-10-21T09-52-24-933Z/screenshots/journey-skills-disabled-narrow.png):
  checkbox, Avatar scope, help, mode state and Save/Publish are readable and fit.
- Full regression: **2,719 passed, 2 existing skips**, exit 0, including Electron
  smoke. [Full log](../../.artifacts/low-camera-journey-2026-10-21/avatar-skills-full-suite.log).
- Complete Conversation: **14/14, exit 0**, 416.4 seconds. All four images were
  displayed and presented aloud; all four temporary image attachments were
  removed. Photo refusal took no capture; a new approved request used the public
  96×96 single-face fixture after countdown. Revisions, ordinary chat, sleep and
  cleanup passed, with zero provider errors.
  [Results](../../.artifacts/phase4-qa/2026-10-21T09-59-24-973Z/raven-results.json).
  Inspected the first reveal, permission screen and portrait revision: artwork
  fits, consent text is readable, and the requested blue hat is visible.
- The first Conversation attempt timed out at `image_chat_while_painting` after
  69 seconds, despite recording two delivered audio replies and a generated,
  presented image; no provider error was reported. The exact wait condition
  responsible is unknown because that run lacked individual completion counters.
  Added metadata-only counters for a future occurrence, then used one retry with
  unchanged production code and unchanged acceptance criteria. It passed the
  entire journey. This is a retained timing failure, not a claimed root-cause fix.
  [Failure](../../.artifacts/phase4-qa/2026-10-21T09-55-34-730Z/raven-results.json).
- Complete Interactive Studio: **24/24, exit 0**, 427.5 seconds, zero provider
  errors. Name correction, refusal/new approval, photo attachment, all four
  answers, two reveals, one revision announcement, keepsake, exact farewell,
  Dormant and Conversation-requested Studio entry/release passed. All 20 measured
  lines used the expected language. Both images were 1254×1254 PNGs with corner
  alpha 0; this sample does not guarantee model transparency on future requests.
  [Results](../../.artifacts/phase4-qa/2026-10-21T10-06-47-775Z/raven-results.json).
  Inspected the reveal and revision: corrected synthetic name, picture bounds,
  instruction labels and the requested snowy background are visible.
- The extra ordinary-camera regression's first attempt heard the exact request
  but the model answered without `look_at_surroundings`; the permission wait
  expired. No capture occurred and no provider error was reported. This is a
  tool-selection failure before Main's camera/permission code. Its single
  unchanged retry passed **5/5**, including consent, a correctly grounded shapes
  answer, sleep/release and no provider error.
  [Failure](../../.artifacts/phase4-qa/2026-10-21T10-14-14-546Z/raven-results.json).
  [Retry](../../.artifacts/phase4-qa/2026-10-21T10-16-59-679Z/raven-results.json).

## Audit boundaries

The two original gaps were global enablement and Studio owning the shared
provider. Both are corrected. Review also removed an instruction referring to
an unavailable image tool, added fail-closed Main checks for missing assignment
ownership, and retained assignments across connection rollovers. No open
application architecture defect was identified within this change's boundary.

Privacy/authorization checks cover invariants 1, 3, 6 and 9: public skill flags
only cross the session boundary; consent and image control turns keep the
existing extraction exclusion; private identity, photo bytes and credentials
never enter diagnostic records. Disabled effects return bounded reasons. The
existing memory ownership/confirmation paths (2, 4, 5), command matcher (7),
single microphone owner (8), visible degradation (10), versioned models (11)
and Main-only credential sources (12) remain covered by the regression suite.
This audit does not reclassify physical or human evidence as automated evidence.

## Changed areas and reproduction

- `src/shared/avatar-skills.ts`, Avatar profile/config/session schemas and the
  versioned tool catalog: assignment, migration, validation and tool filtering.
- `src/renderer/console/SkillsEditor.tsx`, workspace, status controls and prompt
  inspection: per-Avatar selection and accurate disabled-mode feedback.
- `src/main/avatar/image-service.ts`, image/Studio IPC and `boot.ts`: shared
  service ownership, independent Main enforcement and session/rollover pinning.
- Focused tests and `studio-journey-qa.ts`: real Save/Publish/activation journey.
  Raven QA adds only metadata counters for the retained completion timeout.

Commands, run sequentially for Electron ownership:

```sh
npm run typecheck
npm run build
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py avatar-skills-ui node scripts/run-phase4-qa.mjs --studio-journey
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py avatar-skills-full-suite npm test
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py avatar-skills-conversation-retry node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario image_skill --portrait-fixture .artifacts/low-camera-journey-2026-10-21/portrait-fixture.json
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py avatar-skills-studio node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --studio-story default --studio-photo --portrait-fixture .artifacts/low-camera-journey-2026-10-21/portrait-fixture.json
python3 .artifacts/low-camera-journey-2026-10-21/quiet-run.py avatar-skills-camera node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario camera
```

Use fresh labels for reproduction to preserve the original logs. The sound guard
keeps the existing mute state, tests at output 1%, then restores the previous
device/levels in a `finally` block. No operator draft or active config is published
by these isolated QA runs. No phase promotion or dependency/model change occurred.
Commit, push and deployment were separately requested after this QA delivery.

Pre-deployment runtime checked **18:18 Taipei**: no canonical Electron, camera helper or
QA LaunchAgent; normal LaunchAgent unloaded (print exit 113). Existing audio and
TV-network background jobs were left alone. All seven runs restored Jabra output
0%, muted, input 57%. [Runtime snapshot](../../.artifacts/low-camera-journey-2026-10-21/avatar-skills-runtime-final.json).

## Requested commit, push and deployment

Feature commit `96f48e3` was pushed to `origin/field/macmini-deploy`. The current
source/output fingerprint passed before deployment; the tested build was reused.
The existing installed LaunchAgent matches the canonical field definition.
Bootstrap succeeded at **20:26 Taipei**. At **20:28**, Main PID 87151 remained
unchanged, both renderers were ready, and the live Console showed Raven asleep,
wake listening active, all modules normal and the image provider signed in.
Avatars → Skills → Image generation was visibly enabled. No settings were edited
or published; v19 remains current and the Console is left on Skills.

The temporary verifier first had an incorrect relative import, corrected before
launch. Its first startup check then incorrectly expected the Console to exist
immediately. Console is created on demand; the existing `show_console_main`
operator command opened it and completed verification without an app change or
restart. The original failed readiness evidence is retained. Audio stayed at
output 0%, muted, input 57%. No TV power command or new guest/provider/camera
journey was run. This is a checkout deployment, not signed-package acceptance.

[Deployment metadata](../../.artifacts/low-camera-journey-2026-10-21/image-skill-deployment.json) ·
[Retained initial readiness check](../../.artifacts/low-camera-journey-2026-10-21/image-skill-deployment-initial-check.json).
