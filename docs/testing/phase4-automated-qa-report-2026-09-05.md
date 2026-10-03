# Phase 4 Console automation and runtime audit — 2026-09-05

Windows working copy based on `07e2122`. Phase 4 human acceptance remains
pending. No phase promotion, tag, commit, or push is part of this task.

## Result

The real Electron Console and portrait playback journey passes 17 automated cases. The harness
substitutes native file-picker selection only; it drives actual React controls,
managed import/decode, IPC, Draft/Test/Publish, and persisted configuration.
Six screenshots were captured, including active video and Avatar return. Inspected fields, Stage selections,
disabled actions, unsaved-edit notices, and validation errors are readable.

Evidence: `.artifacts/phase4-qa/2026-09-05T07-45-05-745Z/evidence.json` and its
`screenshots/` directory. The runner exited 0 with exactly one result marker,
no timeout, `console_check_count=17`, and explicit `music_analyser=not_executed`.
The separate Avatar/Scene run passed with an active music analyser; details below.

Covered cases: picker cancel; invalid media and pending-copy cleanup; finite
video import; action/Scene/Stage authoring; publish; playback and Avatar return; rejected-save preservation;
unsaved Test/Publish protection; incompatible endings; Stage reorder/delete;
spell editing/collision; enabled controls; media corruption between Test and
Publish; referenced-action deletion; Scene/spell deletion; invalid Config edits;
and navigation across all Console tabs. Stop All preserves local edits.

## Corrected defects

- Rejected Scene and Config saves preserve local edits and show field errors.
- Test/Publish cannot use an older saved Draft while unsaved edits are visible.
  Controls stay disabled during configuration refresh, closing a no-op Test race.
- Scene Test Draft decodes saved visuals through a managed Draft media endpoint.
  Main checks visual hashes at Test and again before Publish; a corrupted asset
  cannot replace Active.
- Scene/action enabled controls and Scene deletion are available. Run Published
  Scene is unavailable for a new or published-disabled Scene.
- Import bridge rejection is visible and does not expose raw exception text.
- A timed visual releases before an Avatar-only next Stage. Progress watchdogs
  require a changing playback timestamp; repeated `playing` cannot renew bounds.
- Continuous fog is capped across repeated ON/value actions. A failed OFF
  dispatch cannot cancel that safety deadline. These are deterministic adapter
  tests, not physical fog evidence.

## Verification

| Command | Exit | Evidence |
|---|---:|---|
| `npm test` | 0 | 84 files, 823 tests; includes real Electron smoke/crash checks |
| `npm run typecheck` | 0 | Node and web targets passed |
| `npm run build` | 0 | Electron Vite production build passed |
| `npm run test:phase4:qa:editor` | 0 | 16 real Console cases; 4 screenshots |
| `npm run test:phase4:qa:console` | 0 | 17 real Console/playback cases; 6 screenshots; portrait verified |
| `npm run test:phase4:qa` | 0 | 7 motion groups, 5 expressions, 3 scene fixtures, 5 visual cases; 28 screenshots; portrait verified |
| `node --check scripts/run-phase4-qa.mjs` | 0 | Runner syntax valid |
| skill-creator `quick_validate.py .agents/skills/mm-ui-qa` | 0 | Skill valid |
| `git diff --check` | 0 | No whitespace errors; repository CRLF notices only |

Focused failing tests first reproduced the timed-visual, stalled-loop,
continuous-fog, failed-OFF, Scene asset publication, and import-rejection defects.
The real Console driver reproduced rejected-edit loss and the refresh race.

## Portrait visual audit — verified on Windows

Both required canonical Electron firewall rules were verified enabled/allow
on the Private profile. After the operator rotated the ASUS monitor in Windows,
Electron enumerated three displays and verified Mirror on the portrait one:

| Display | Electron ID | OS-reported dimensions |
|---|---:|---|
| 1, primary | 2715795664 | 1707×1067 logical pixels, scale 1.5 |
| 2 | 552284001 | 2560×1440 |
| 3, portrait | 935303234 | 800×1280 logical pixels, scale 2 |

Enumeration labels are not Windows Settings monitor numbers: the operator calls
the ASUS monitor 2. WMI reports an active ASUS MB16NCG. The selected portrait
Electron ID is `935303234`; Console stayed on primary `2715795664`.
Both new runs record `display.verified=true`, exit 0, exactly one result marker,
and no timeout. This supersedes the earlier landscape-only blocker.

Full Avatar/Scene evidence:
`.artifacts/phase4-qa/2026-09-05T07-45-32-588Z/evidence.json` and `screenshots/`.
The production build was refreshed before running Console and Avatar QA sequentially.

Selected frames were opened directly: Scene motion active/resumed, expressions
01/05, opening Stage, still/finite/loop/replacement visuals, loop and failure
returns, and Console playback/return and invalid Draft. The full-body Avatar
is centered with head and boots inside the portrait frame. Media renders upright;
the still's contain framing has side margins, while cover videos fill the view.
Completion, stop, and missing-media frames restore the Avatar. The sample Ren
rig includes authored hologram/noise effects (`ParamHologram`, `ParamNoise`);
the loop-return frame catches those effects while later failure return is clear.
Console invalid-edit values and the full validation message remain readable.

The three legacy scene fixtures include two expected `partial_failure` outcomes
because this isolated run has no live Realtime session; it verifies bounded
degradation, not successful spoken dialogue. Fog/light adapters are synthetic.
Smoothness, live dialogue, speaker sound/ducking, native picker interaction,
real lighting/fog, and operator acceptance remain human/device checks.
Mac evidence remains deferred. No new product fix was needed for portrait execution.

Reusable route: [mm-ui-qa](../../.agents/skills/mm-ui-qa/SKILL.md).
Coverage plan: [Phase 4 automated QA](phase4-automated-qa-plan.md).
