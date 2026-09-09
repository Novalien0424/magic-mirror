# Console action preview looping — 2026-09-09, Windows

## Behavior and boundary

Console motion clicks previously forced `setLoop(false)`, even for authored
looping clips. The preview factory now opts into native Cubism looping;
normal Mirror calls remain finite. Each loop skips a repeated fade-in.
The installed SDK V2 fires finished callbacks at loop boundaries. Preview
callbacks must not resume lifecycle playback at those boundaries. A successful
preview start emits one metadata event, not an event each frame/cycle.

Expressions are indefinite poses in the SDK. Preserve their blend/hold rather
than restarting fades. Active motion/expression buttons are highlighted and
status text explains looping versus held. Another action, Stop/reset, unload,
or leaving the page clears the preview. No rig, publication, SDK or schema edits.

## Verification

- Focused Vitest: 17 tests / 3 files, exit 0 (preview SDK behavior, component
  preview-only gate, existing runtime controller).
- Initial red test failed on missing helper. Initial green attempt caught
  incorrect test-only SDK accessor names/protected constructor; corrected to
  installed `getLoop`/`getLoopFadeIn` and a fixture subclass.
- Node/web typechecks and build: exit 0.
- Initial isolated Console run failed at `cubism_preview_motion_loop`, exit 1
  (Electron exit 2), exposing the SDK V2 loop-boundary callback above. Retained:
  `.artifacts/phase4-qa/2026-09-09T02-30-28-623Z/`.
- Corrected callback guard; rerun exit 0: **224 Console checks**, 22 motion
  buttons, 15 expressions, 8 captures. Loop/hold/reset checks all passed.
  Evidence: `.artifacts/phase4-qa/2026-09-09T02-35-48-549Z/evidence.json`.
  Inspected captured Ren rendering and Raven's highlighted Waking control.
- Normal Windows app restarted as Main **47112**. Native Console loaded Raven
  v10; Waking remained highlighted/looping after **18.271 seconds**, with
  changed head position/readback. Selecting exp_05 cleared the motion highlight
  and showed held-expression status, still active after **26.431 seconds**.
  Native Stop/reset cleared the highlight and restored neutral. Console left
  on Raven v10 controls, neutral. No Appearance publication.
- Final build: source `f1a213f5a6c1d91fb875a1a5cddac25c9e9834bdeec641657cf9c702c1c12cac`,
  output `2ec598f08eb8dec2a39000ae92e51eb1b4b409a4a98dd8d6648410cc8503a4d1`.
  Build fingerprint and scoped `git diff --check`: exit 0.

Published config SHA256 remains
`ABF27F0C257B123AFAE96C0A35C561A7C98916245264417581CDF60DD34AEB35`;
saved draft remains
`446D82AEB23A988FE049FBB7F7316E73A501BA3993057D89015C5A8BC4771189`.
Native pre-restart UI showed Active v12 / saved Draft 64, no unsaved-edit flag.

## Independent rerun

Do not overlap the normal app and Electron QA. Check unsaved Console edits,
then stop the normal app. From canonical checkout, run `npm run build`, set
`MIRROR_CUBISM_QA_MODEL` to
`C:\Project\magic-mirror\resources\avatar\Raven\v10\runtime\raven-lord.model3.json`,
then run `npm run test:phase4:qa:cubism`.

The harness includes `cubism_preview_motion_loop`,
`cubism_preview_expression_hold`, and `cubism_preview_loop_reset` for Raven.
Inspect the actual screenshots and native UI: select v8/v10, load, click a
motion, observe repeated movement beyond its duration, select an expression,
verify held pose/active highlight, then Stop/reset. These are local silent
Console checks, not Mirror conversation, physical smoothness or Mac evidence.
