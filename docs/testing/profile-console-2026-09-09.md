# Profile Console validation — Windows, 2026-09-09

The Console now has three primary destinations: Mirror, Avatars and System.
Avatars owns Persona, Appearance, Voice and Spells & scenes. Reusable rigs,
media and actions live in its Shared library. Each avatar stores independent
persona, rig assignment, voice/style/speed/effects, presentation and spells/scenes.
Action definitions and assets may be shared deliberately; their consumers and
publication scope are shown. This does not introduce a general AI skill/plugin
system. Devices and diagnostic controls remain system-wide.

Design and ten-step new-profile journey:
[design](../superpowers/specs/2026-09-09-profile-console-design.md).
Implementation and acceptance matrix:
[plan](../superpowers/plans/2026-09-09-profile-console.md).
Two planning reviews plus two image-based visual reviews:
[Fable findings and resolutions](profile-console-reviews-2026-09-09.md).

## Fresh checks

All Electron runs used the canonical Windows checkout and isolated synthetic
user data, sequentially. Normal Main 38996 was stopped only after its unsaved
operator edits were saved through the existing UI: Draft saved, 92 changes.
The operator draft was never published. Canonical enabled Private TCP/UDP
firewall rules matched before the first Electron test.

| Command | Result |
| --- | --- |
| npm run typecheck | Exit 0, Node and renderer |
| npm test | Exit 0, 942 tests / 103 files, 119.19 seconds, 23:24 start; includes Electron smoke |
| npm run build | Exit 0, 23:27 build |
| npm run test:phase4:qa:editor | Exit 0, 26 checks / 20 captures, run 15-19-28-720Z |
| npm run test:phase4:qa:profiles | Exit 0, 16 checks / 21 captures, final run 15-27-35-210Z |
| MIRROR_CUBISM_QA_MODEL=resources/avatar/Raven/v10/runtime/raven-lord.model3.json; npm run test:phase4:qa:cubism | Exit 0, 224 checks / 22 motions / 15 expressions / 8 captures, run 15-28-42-162Z |
| npx vitest run tests/unit/profile-workspace.test.ts tests/unit/console-config-ui.test.ts | Exit 0, 11 tests / 2 files; added rendered read-failure/retry/publication guard check after full suite |

The editor pass preceded the final copy, read-failure retry and stable-section
geometry refinements. The final profile pass uses all final product code.
No full-suite/normal-app/QA overlap occurred. Subsequent test-only additions
are reported separately below.

Final build source fingerprint:
`82826ee5da59a9043a01861c6b2c602fd27568ecca1d630db6f83ff6509dc821`.
Output fingerprint:
`a192d2edd2e69f3cac2abb958e0d6c2ec32fcecf36e049798573a7b5019c430c`.
Built at `2026-09-09T15:27:24.241Z`, based on main `63cd430` plus this delivery.

## Coverage and actual observations

- P01–P05: three synthetic profiles; neutral creation, distinct persona and
  spoken lines, managed Raven assignment, bound advanced preview without an
  independent selector, cedar/style/1.1 speed/Dark oracle effects, finite scene
  and exact trigger phrase, shared lighting action with consumer disclosure.
- P06–P07: unsaved profile/section/Mirror/System round trips; Advanced config
  guard and return route; cancelable beforeunload confirms unsaved protection.
- P08–P11: invalid name rejected at Save with visible field path and disabled
  Check/Publish; valid Save leaves active unchanged; reload preserves all-profile
  scope; explicit Check then publication disclosure then Confirm; Dormant
  activation and reload retain selected profile/rig. Existing editor QA also
  exercises media replacement/decode rejection and active-switch UI/Main guard.
- P12–P13: synthetic in-memory audio playback, Original/Processed, loop/Stop,
  page-leave cleanup and two-avatar effects isolation; existing editor QA covers
  duplicated ownership links, access locks, shared-action focused tests and
  invalid/partial draft preservation. Cubism detail results appear below.
- P14: 1440x900 and 1024x768 Console captures. Final geometry asserts no
  horizontal overflow and stable section-navigation position within one pixel
  across Persona/Appearance/Voice/Spells/Media. Keyboard focus outline passes.
  Editor readability measurements at both widths and all three destinations:
  base font 18px, zero small text, zero low-contrast text, zero small controls,
  zero horizontal overflow under the harness's rendered visibility rules.
- P15: pure refresh tests prove identical refresh retains unsaved values,
  changed saved revision conflicts, and expected own refresh accepts. Read
  failures retain the last payload, disable editing, expose a retry route.
  This is focused state/render evidence, not an end-to-end bridge outage or
  OS crash recovery claim. Library failure uses a visible status and existing
  model fallback behavior; no provider call is triggered by navigation.

Codex inspected actual final Persona (both widths), Spells, Voice controls,
publish confirmation and System captures. The dark neutral surfaces, cyan
selected states, rounded groups, consistent section headings and aligned rail
are coherent. Long profile names remain readable below the compact selector.
The opaque action dock is confined to the editor; long content and the rail
scroll independently. The local audio picker is readable at 1024. The Spells
status chip now occupies the dock and no longer moves the navigation. The
publication capture intentionally distinguishes editing from running profile.
These observations close the required visual findings; aesthetics remain a
review judgment rather than something inferred from nonblack-pixel counts.

Final inspected capture hashes (cleanup was requested but blocked below):

| Image | SHA-256 |
| --- | --- |
| profile-1024-persona.png | de634e1007d841bc0ea7857323193ae15fddeb9a9c977d3a5ac414582b3c14bc |
| profile-1440-spells---scenes.png | 5cab5c2c693007276849b75e31bfd2a5be22d928e7f63abf3d83d2fb38d96295 |
| profile-1024-voice-controls.png | 8e149a7f6555dc0c73e510011018bf2a6d46da45e88df4588f4286cd10173498 |
| profile-1440-system.png | 9ca9b0f6d7c37c55b5e326b18e00b09ecfa1ed9b0f18c6c08dd2d05d905fd755 |

## Failure ledger and harness improvements

All run IDs below have prefix `2026-09-09T` in `.artifacts/phase4-qa`.
They are this task's isolated runs; pre-existing runs are outside cleanup scope.

| Run suffix | Outcome / correction |
| --- | --- |
| 14-54-06-889Z, 14-56-32-708Z | Bound rig preview failed: duplicate React sibling keys reused stale preview. Distinct presentation/rig keys fixed the cause. |
| 14-58-38-253Z | Functional profile journey passed, narrow Voice overflow failed. Contained grid children; actual images informed first visual review. |
| 15-01-29-652Z | Legacy test expected publishing an unchanged draft. Corrected fixture to have saved changes. |
| 15-03-27-238Z | Legacy Config navigation label outdated; routed through System. |
| 15-06-43-502Z | Profile pass; first sticky dock subsequently refined after visual inspection. |
| 15-11-16-406Z | Legacy primary-navigation expectation outdated; corrected real navigation assertions. |
| 15-13-28-702Z | Profile pass, 16 checks / 21 captures; second visual review identified status-chip shift. |
| 15-15-41-064Z | Editor functional checks passed, readability failed; nested small text given explicit readable size. |
| 15-19-28-720Z | Editor pass, 26 checks / 20 captures; readability metrics all clear. |
| 15-27-35-210Z | Final profile pass, 16 checks / 21 captures, stable-section geometry. |
| 15-28-42-162Z | Cubism pass, 224 checks: built-in Ren, managed Ren and Raven v10; actual MOC min/max/default parameters, loop/hold/reset, label persistence, switch-back and leave cleanup. Active/draft config unchanged. |

Reusable improvements: a new profile journey runner, current navigation in
editor/voice/Cubism harnesses, explicit readability metrics on failure, neutral
pointer before capture, action/confirmation captures, geometry checks, and
the [UI QA skill](../../.agents/skills/mm-ui-qa/SKILL.md) now requiring actual
image inspection, separate visual/functional claims and confined cleanup.

No physical speaker quality, fog/lighting, live-provider speech, portrait
playback or Mac acceptance is claimed by this Console task. Existing human
acoustic/performance gates remain in the earlier Voice Studio report. All
synthetic audio was RAM-only and no private transcript/context/key was read.

The legacy Cubism capture frames can emphasize the library controls and leave
the rig below the viewport; their screenshot count is not full-rig framing
proof. Actual parameter/renderer assertions support the Cubism functional
result. The profile Appearance and Voice captures support this task's visual
review. No new avatar-art quality claim is made.

## Cleanup limitation

All 12 exact run directories in the failure ledger and the temporary
`.artifacts/profile-console` MCP/review directory were checked as ordinary
directories within the canonical artifact root. All QA processes had exited.
Automatic approval review rejected the guarded PowerShell recursive cleanup,
then also rejected the safer command naming every absolute literal path.
Both returned only "blocked by policy". No deletion ran; the directories
remain ignored and local. No alternate mechanism was used to bypass the block.
Cleanup remains incomplete. Operator user data and pre-existing artifacts are
unchanged. The written evidence is complete enough to remove these exact
directories once policy permits it.

On 2026-09-10 the user explicitly reauthorized cleanup. Rechecked all 13
absolute directory paths and confirmed only the normal operator Electron
runtime was active. The literal-path PowerShell deletion was again rejected
before execution with "blocked by policy". No files were deleted; the remaining
block is tool policy, not missing user authorization.

## Windows deployment and Git delivery

The verified 23:27 build was restored as the normal canonical Windows app at
23:35:48 Asia/Taipei, Main PID **46096**. Fresh logs show MAIN_READY, smoke off,
Mirror and Console loaded/renderer ready, and Mirror shown maximized. Stderr
was empty. The process executable matches canonical Electron; build/source
verification returned exit 0 after launch. Runtime stays running. Logs are
local in `.artifacts/profile-console-deployment-20260909`, separate from the
synthetic cleanup scope. This is local Windows development deployment, not
an installer or Mac release.

Git delivery includes the Console change, focused tests, reusable QA harness,
design/journey/reviews/report and skill update. Push target is origin/main,
without force; final HEAD/remote equality is verified after the push and
recorded in the final response to avoid a self-referencing commit hash.
