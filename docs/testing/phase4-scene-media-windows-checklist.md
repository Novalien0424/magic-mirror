# Phase 4 Scene media — Windows human test checklist

Status: ready-to-run checklist. Do not mark Phase 4 accepted from this document
until a person has completed the observations below.

## Scope and exclusions

This verifies the Windows development build in the canonical
`C:\Project\magic-mirror` checkout. Lighting and fog remain mock adapters unless
physical devices are explicitly connected and observed. This does not verify
macOS, signing, LaunchAgent behavior, packaged workers, or Mac camera/microphone
permissions.

The trial media in `resources\phase4-trial-assets` is project-owned synthetic
FFmpeg output. Import copies it into managed storage; configuration and Console
events must never display its source path.

## Prerequisites

1. Open PowerShell in `C:\Project\magic-mirror`.
2. Confirm the persistent Private-profile rules
   `MagicMirror.Development.Electron.TCP` and
   `MagicMirror.Development.Electron.UDP` both target exactly
   `C:\Project\magic-mirror\node_modules\electron\dist\electron.exe`.
3. If either rule is absent or different, run this once from an elevated
   PowerShell and then recheck:

   ```powershell
   .\scripts\configure-windows-electron-firewall.ps1
   ```

4. Run `npm run test:phase4:qa`. Record the final `PHASE4_QA_RESULT` and
   `PHASE4_QA_ARTIFACTS` lines. The artifact root contains screenshots,
   including active/returned finite video, still, loop, replacement, and
   missing-media recovery.
5. Start the normal app with `npm run dev`. Open Console with `Ctrl+Shift+D`.

## Managed visual import

- [ ] In Console → Scenes → Managed visuals, import each file from
  `resources\phase4-trial-assets`.
- [ ] The still reports 360×640 and image/no-audio metadata.
- [ ] The three videos report 360×640, expected duration, and the correct
  audio-track state; the embedded-audio file reports audio present.
- [ ] No source filesystem path appears in Draft, Active, or Console events.
- [ ] Try importing a renamed text/empty file as `.webm`. Chromium decode must
  reject it, the pending copy must be cancelled, and Active must not change.
- [ ] Test Draft and Publish surface validation errors without partially
  publishing an invalid Scene.

## Author the test Scenes

Use the existing reusable action and ordered Stage editors. Exactly one visual
action belongs to a Stage.

1. **Legacy Avatar Scene:** duration Stages containing Avatar dialogue/motion,
   looping managed BGM, and mock fog/lighting actions.
2. **Still:** still visual, `contain`, muted; duration end condition of about
   three seconds.
3. **Finite:** finite silent video, `cover`, muted, `once`; `video complete`
   end condition tied to that visual action.
4. **Loop + BGM:** looping silent video, `cover`, muted, plus looping managed
   BGM; final `until stopped` Stage with a visible maximum-runtime estimate.
5. **Embedded audio:** finite embedded-audio video, `contain`, `once`, embedded
   audio enabled at a moderate gain; `video complete` end condition.

Assign unique normalized exact-match spell phrases. Keep the configured wake
phrase unchanged so it can stop the active loop.

## Runtime observations

- [ ] Run the Legacy Avatar Scene. Avatar, dialogue, BGM, and mock adapter
  status operate as before; Stop All releases BGM and adapters.
- [ ] Run Still. Avatar remains visible until the image is decoded, then the
  image replaces it. At Stage completion the current lifecycle-appropriate
  Avatar returns; no black frame appears.
- [ ] Run Finite. The Stage ends from actual video completion, not an authored
  duration. Avatar returns exactly once after playback.
- [ ] Run Loop + BGM. Video and BGM loop together. Say the configured wake
  phrase exactly; both stop and Avatar returns. A sentence merely containing
  the phrase must not stop it.
- [ ] Start Loop + BGM again, then start Finite from Console. Finite replaces
  the loop; a late event from the old video does not stop or advance the new
  Scene.
- [ ] Run Embedded audio while a real Realtime conversation is active. Video
  audio is audible, spoken output ducks the background bus, and the background
  releases afterward. Dialogue continues even while the Avatar is hidden.
- [ ] Inspect the automated `visual-failure-return.png` and trigger the invalid
  import above. Media failure is visible in metadata-only Console status and
  leaves an Avatar/fallback surface, never black.
- [ ] Interrupt every Scene once with Console Stop All. Visuals, BGM, and mock
  fog/lighting all release; repeated Stop All is harmless.
- [ ] Enter Maintenance or close the window during an active loop. The same
  cleanup occurs and no media continues playing.

## Evidence to retain

Record the date, Windows host, build commit, operator, pass/fail for every box,
the two QA marker lines, and the QA artifact directory. For failures, retain
the relevant screenshot and metadata-only Console reason. Do not capture or
store transcripts, conversation audio, private context, source paths, or API
keys.

Human completion of this checklist is Windows evidence only. Phase acceptance,
tagging, physical adapter acceptance, and the later Mac port remain separate
decisions.
