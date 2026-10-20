# Portrait Studio deploy QA — 2026-10-17

Build: `field/macmini-deploy` fast-forwarded to the Portrait Studio commits on top
of `d5bb775`; stamped `npm run build` in the canonical checkout. ChatGPT sign-in
moved (not copied) to ignored root `.env.chatgpt` (mode 0600). Evidence below is
metadata only: no transcripts, audio, names, answers or images are retained here.

## Live spoken visit (synthetic visitor audio, real provider)

`node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio`
Route: synthetic visitor audio → real WebRTC Realtime ASR/dialogue/tools → Main
IPC → real image generation on the owner's ChatGPT plan (Codex backend,
`gpt-image-2.5-flare`, 1024×1536, medium) → Mirror display. Not a human or
physical-microphone acceptance.

| Run | Result | Notes |
|---|---|---|
| `2026-10-17T10-12-54-520Z` | failed, exit 2 | Both preloads threw at load: a shared Rollup chunk sandboxed preloads cannot require. Fixed in "Keep sandboxed preload bundles self-contained"; regression test `preload-bundle-boundary`. |
| `2026-10-17T10-16-18-040Z` | passed, 15/15 | Paint 21.0 s, change 24.8 s. Second reveal hint chip clipped; fixed ("Fit two Portrait Studio chip rows"). |
| `2026-10-17T10-30-53-448Z` | passed, 15/15 | Final build with configurable stage prompts. Paint 22.2 s, change 26.4 s. Edited Painting starts prompt followed live (`customPaintingPromptFollowed: true`). |

Each passing run: phases name → confirm → 4 questions → painting → reveal →
revising → reveal → keepsake → closed; `start_portrait_studio`, `studio_set_name`,
4× `studio_answer`, `studio_revise`, `studio_finish` (called by the avatar after
the final version); 2 reveals, each with the image attached for the avatar; 9/9
visitor turns recognized; 0 provider errors; studio history deleted after exit;
no `memory_saved`; studio turns excluded from learning
(`memory_learning_control_excluded`); follow-up conversation used no studio tools.

Captures (`.artifacts/phase4-qa/<run>/screenshots/studio-*.png`) were inspected:
name card and feather progress, question 1/4, painting frame, reveal with
nameplate and both hint chips, revision with the composition kept and only the
requested change applied, keepsake countdown.

Image content matched the scripted answers (owl; night seaside; mist; deep blue;
change to a snowy forest). The synthetic visitor's 王曉明 was recognized as
王小明 and the scripted confirmation accepted it; a real visitor corrects this at
the read-back step.

## Painted lettering (OAuth route, real image)

`PORTRAIT_LIVE=1 PORTRAIT_MODELS=gpt-image-2.5-flare PORTRAIT_LETTERING=painted PORTRAIT_EDIT=0 npx vitest run tests/integration/portrait-image-live.test.ts`:
HTTP 200, 22.8 s. The name 王曉明 was lettered exactly once and correctly on a
banner; image saved outside the repository and inspected.

## Checks

Node suites 2,457 passed, 1 skipped in the worktree (the `youtube-search`
root-path test passes in the canonical checkout); both typechecks; Electron smoke
4/4 in the canonical checkout.

## Not covered

Human spoken visit at the mirror (physical Jabra route), studio-default wake on
the field LaunchAgent, and the Console Experiences section in the running app
(reviewed as a rendered preview with the real Console stylesheet).
