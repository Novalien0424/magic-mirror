# Multi-avatar Console — Windows QA, 2026-09-06

Scope: PRD §18, current Phase 4 extension. This is public character
configuration, not visitor identity or private memory. Phase 4 human acceptance,
physical hardware and Mac deployment are separate and remain unclaimed.

## Delivered behavior

Choose an editing avatar in Avatar / Audio or Scenes. New and Duplicate create
independent character/scenes/spells while retaining shared resources. Editing
does not switch the live Mirror. Save Draft → Test Draft → Publish, then Load
while Dormant. Pending edits block Load. Failed publication restores the old
active configuration and original draft; concurrent Console writes serialize.

Character & voice contains name, personality, speaking style, base voice,
inactivity timeout and spoken lines. Appearance contains the Cubism bundle
selector/import and actual preview. Shared device controls remain global.
Advanced prompt text is collapsed and uses the same builder as Realtime.
Model/voice/dialogue settings are captured together before credentials are
awaited. No previous avatar conversation history is transferred.

Media/actions are shared by default. Owner-only locks apply to direct and
indirect references, validated in Main and filtered at runtime. Scenes expose
one test-scope selector: whole scene, selected step or selected action. All use
the production dispatcher and Stop All. Finite video tests end naturally;
other individual actions have a ten-second bounded run.

## RCA closed by local evidence

1. **Preview video stall:** buffered video stopped progressing near 1.5 seconds
   through the Windows D3D11 path. Scoped software video decoding leaves WebGL
   enabled. Probe-free runs measure 36 decoded frames over about 1.2 seconds,
   zero drops, and pass preview/finite/loop/embedded-audio cleanup. Startup in
   sampled synthetic runs is roughly 1.3–1.9 seconds, not instant or universal.
2. **Managed Cubism texture failure:** custom-protocol image decoding alone did
   not authorize WebGL texture upload. Anonymous CORS loading now matches the
   protocol's CORS response. Original asset files are unchanged.
3. **Partial rig after switching:** native settled view showed only collar/hand;
   fresh startup showed the full same bundle. Retired renderer targets remained
   in the context's offscreen mask pool. Removing that pool on release restores
   the full rig. Async replacement waits for prior load/dispose before reuse.
4. **Failed load modifies draft / save interleaving:** two focused tests failed
   before the correction and pass afterward. Compensated load failure restores
   its pre-operation draft, and Console operations execute serially.

## Evidence

Artifact roots below are relative to `.artifacts/phase4-qa/` and contain only
isolated synthetic fixtures, public rig captures and metadata.

| Check | Result | Artifact / detail |
|---|---|---|
| `npm run typecheck` | exit 0 | Node and renderer |
| `npm test` | exit 0 | final 883 tests / 96 files |
| `npm run build` | exit 0 | provenance hashes retained by each runner |
| Console QA | exit 0 | final `2026-09-06T00-16-34-619Z`, 28 checks / 26 captures |
| Portrait QA | exit 0 | `2026-09-06T00-05-59-344Z`, 7 motions / 5 expressions / 3 scenes / 5 visuals |
| Two-avatar live lifecycle | exit 0 | `2026-09-06T00-07-54-873Z`, coral/cedar + respective instructions, greeting/farewell, released tracks |
| Full live scene/media QA | exit 0 | `2026-09-06T00-14-43-009Z`, all 3 scenes completed, lip-sync max 0.176, 7 motions / 5 expressions / 5 visuals |

The non-provider portrait run intentionally reports dialogue unavailable;
its partial scene outcomes do not prove spoken dialogue. The separate live
scene run above completes those scenes and measures actual output/lip-sync.

Earlier live runs failed strict dialogue comparison and second-avatar greeting
timeout. The bounded comparison now ignores punctuation/capitalization and
normalizes traditional/simplified equivalents; changed/additional words still
fail. No earlier failure is retrospectively labelled a pass, and a finite live
sample does not guarantee generative speech will never deviate.

The first full live-scene attempt (`2026-09-06T00-09-03-391Z`) stopped at a
standalone motion timeout: voice lifecycle transitions can legitimately preempt
manual motions. The driver now tests those motions before Realtime startup and
uses synthetic silent input/silent wake for scene isolation; greeting/sleep
remains covered by the separate lifecycle suite. No failing case was removed.

Visually inspected: complete imported rig, active finite video, expression
render, and 1000-pixel Console character view. Native input reproduced the
pre-fix switch failure and confirmed fresh-start contrast. The character form
now puts labels above readable full-width fields. QA additionally checks the
known Ren light-coat coverage (0.080 observed; minimum 0.035), because ready
status and nonblack background pixels missed the partial rig.

Final native Windows interaction used only
`.artifacts/manual-avatar-20260906-0746/`: loaded the original avatar and then
QA Guide through the selector/Load button; the switched managed rig rendered
fully. Opened Appearance, selected Emerge from mist, the synthetic finite video
and QA tone, and ran Preview draft. The sleeping view showed advancing video;
Entrance held the complete avatar awake with the background hidden. Stop preview
returned its status to stopped. These unsaved presentation edits remained only
in the isolated fixture. Physical audibility was not inferred from screenshots.

## Operator validation

1. Avatar / Audio → select/create two characters; set distinct names, voices,
   personality, greeting and farewell. Inspect Effective realtime prompt.
2. Appearance → import a compatible model3.json if desired. Choose either
   Always visible or Emerge from mist; select a short background video and
   ambience. Preview full cycle and Stop preview. Confirm real sound and motion.
3. Save → Test → Publish. While Dormant, Load the other character. Start a
   conversation and verify its voice/personality/greeting and visible rig.
4. Say `恭送渡鴨大人`: only the configured farewell, then Dormant/mist and resumed
   background. Repeat over your own music and during a long avatar answer.
5. Scenes → reuse a shared action, then test action/step/scene. Lock a resource
   to one avatar and confirm the other cannot select it. Stop All releases media.

Prepare a short silent video, a video with audio, one image, an instrumental
loop and a vocal/music clip at the intended room volume. Physical Windows
default microphone/output selection (including 2-SRS-NB10), acoustic wake
recognition, personal-media performance, lighting/fog and subjective dialogue
quality require the operator. Automation does not certify those observations.

Harness changes and evidence limitations: [audit](harness-audit-2026-09-06.md).
