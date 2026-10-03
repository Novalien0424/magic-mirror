# Console / presentation QA plan — Windows

Run after the implementation plan and its self-review. Isolated synthetic data
only; do not modify the operator's active configuration or record conversations.

| Boundary | Test | Pass evidence |
|---|---|---|
| Config | Defaults, strict fields, bad ranges/asset references; save/test/publish and restart | Focused unit tests and read-only saved config assertions |
| Step editor | Add scene/spell/media action, video completion, duplicate isolation, reorder, remove/undo | Real rendered controls, saved values and screenshots |
| Safety | Invalid draft kept editable, active untouched, unsaved publication blocked, referenced action deletion disabled | Failed-save and disabled-control assertions |
| Import | Cancel, invalid bytes, successful finite video, changed bytes before publish | Production import/decode and pending-copy cleanup |
| Presentation preview | Both modes, real Cubism rendered, full cycle, no lifecycle change | Local canvas, phases and live lifecycle before/after |
| Presentation runtime | Published settings applied; dormant looping video, entry, active, exit, return; rapid replacement | Actual portrait renderer screenshots and DOM/media state |
| Audio | Separate looping ambience, selected output route, fade on wake, cleanup on fault | Audio control tests and runtime element state; physical audibility remains human evidence |
| Readability | Body 18px, secondary >=15px, text contrast >=4.5:1, clear focus/selection, controls >=44px except checkboxes | Computed styles plus visual inspection |
| Responsive UI | 1280px and 1000px wide, no page overflow, reachable publication controls | Native window screenshots and bounds checks |
| Native computer use | Navigate primary/settings/diagnostic pages, scene step selection, full presentation preview | Windows app accessibility/screenshot observations and real clicks |
| Regression | Existing scenes, all Cubism states/expressions, finite/loop/embedded media, failure restoration, idle speech tests | Both typechecks, full unit suite, build, Phase 4 harness |

Commands: `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:phase4:qa:console`, `npm run test:phase4:qa`.

Native QA uses the same canonical Electron build with isolated userData. Native
picker selection, physical speaker quality, acoustic wake detection under music,
artist final mist assets, lights/fog and macOS deployment are separate evidence;
do not label them passed from a synthetic run.
