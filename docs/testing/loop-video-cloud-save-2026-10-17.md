# Loop Video Save / PLAY LOOP repair — 2026-10-17

The owner reported that selecting another video and saving still left the old
video on the Stream Deck PLAY LOOP button. Scope: repair the function; **do not
change the owner's saved selection**.

## Cause and repair

The button sends `play_loop`, without a video ID. Main already reads the saved
settings and starts a new playback generation when they differ from the current
loop. The production log instead recorded eight `operator_loop_media_unavailable`
Save failures between 12:03:59 and 12:04:27 UTC. Failed saves correctly retained
the previous preset, but the Console did not make that consequence clear enough.

Two files in the linked Google Drive Common folder exposed valid metadata but
failed an ordinary Node streaming read before returning any bytes:
`Unknown system error -11`, syscall `read`. A native `NSFileCoordinator` read
completed for the affected video (38,154,330 bytes). The implemented fallback
then recovered the still-unreadable audio file (22,001,708 bytes) in **2,086 ms**.
All five linked resources subsequently resolved through `MediaFolders`.

The initial fix coordinated a read on those errors. Owner follow-up required
durability for an always-Google-Drive library, with on-demand downloads and
managed cleanup. The final implementation prepares **only requested media** into
one app-owned location:
`~/Library/Application Support/magic-mirror/media-cache-v1`.
Listing/scanning a linked library does not download or copy its files.

The small macOS helper coordinates access and streams the selected file into an
exclusive private staging file, with bounded buffers and a nine-second deadline;
Main kills it after ten seconds if necessary. Exact byte count is required before
atomic publication. Cache names derive from canonical source path, size and
mtime. Playback uses this local copy, not a provider path that can be evicted.
Cache reuse survives an app restart. Changed source metadata produces a new,
immutable version. Source authorization, realpath and size/mtime checks still run
before and after preparation, including cache hits. Changed, removed or unlinked
sources cannot authorize stale cached media.

Incomplete copies are removed after failure and at the next startup. Startup
cleanup removes entries unused for 30 days and trims older entries to a 2 GiB
soft budget. Cleanup runs before this process prepares playback; the active
run's working set may exceed that budget rather than deleting files it uses.
Missing/truncated cache entries are repaired on demand. Concurrent requests share
one copy operation. No Drive settings, dependencies or restart ownership changed.

Build/dev prepare the helper; existing packaging includes and unpacks
`out/native/*`. Packaged-app execution was not tested in this task.
Console shows preparation while saving and explicitly explains that a failed
Save leaves Stream Deck using the previous saved settings. Draft selection is
retained for retry.

Apple documents coordinated file access in
[NSFileCoordinator](https://developer.apple.com/documentation/foundation/nsfilecoordinator).
Google documents the macOS
[File Provider integration](https://support.google.com/drive/answer/16631477?hl=en-uk)
and [streamed-file behavior](https://support.google.com/drive/answer/13401938?hl=en).
The particular errno and successful recovery above are observed Mac evidence,
not guarantees inferred from those documents.

## Verification

- `node scripts/prepare-media-file.mjs`: exit 0; native helper compiled and the
  real-file recovery above passed. No production media was captured in QA artifacts;
  the final managed playback cache contains only the selected video and audio.
- Focused Vitest runs: **166 passed across seven files** (`media-folders`,
  `prepare-media-file`, `operator-loop`, `operator-command`, `operator-control`,
  `mirror-tv-control`, and renderer `loop-video-panel`).
- `npm run typecheck`: node and web both passed, exit 0.
- Under the sole Electron owner lease:
  `npm run build && node scripts/run-phase4-qa.mjs --operator-loop`.
  Final persistent-cache build: **15/15 cases, 11 captures, exit 0**;
  [evidence](../../.artifacts/phase4-qa/2026-10-17T12-25-08-664Z/evidence.json).
  Inspected the saved-settings and replacement-playback screenshots: controls
  remain readable, Save confirms success, and the replacement video fills the
  portrait renderer. Final `qa-build.mjs --verify` and `git diff --check` passed.
- Actual production-library cache probe prepared only the currently saved video
  and audio: 48,686,672 bytes in 329 ms and 1,569,588 bytes in 11 ms. A newly
  constructed Main store/cache reused both in 1 ms / 0 ms with **zero native
  reads**. Exactly two cache entries exist. This read/preparation probe changed
  no selection and played no sound.

New regression `operator_loop_saved_replacement_button`: real Console selects
video B while A is playing, saves B, verifies A continues until PLAY LOOP,
sends `play_loop` through the production isolated mailbox, then verifies a new
generation and actual renderer playback/protocol access for B. It restores only
the isolated synthetic fixture for subsequent cases. A unit regression also
rejects stale progress acknowledgements from A.

Earlier full operator-loop run:
[15/15 cases, 11 captures](../../.artifacts/phase4-qa/2026-10-17T12-13-56-504Z/evidence.json).
A [second run](../../.artifacts/phase4-qa/2026-10-17T12-17-33-018Z/evidence.json)
rebuilt the current delivery branch after concurrent Console work changed the
checkout. The final run above additionally used the persistent local cache.
This is real Electron/UI/media-decoding evidence using
synthetic media; no physical key press, acoustic output or provider conversation
is claimed. The real cloud-file preparation was tested separately above.

Production `operator-loop.json` remained byte-for-byte unchanged:
`35e0dab4e89390df777467882ed21f856b096518768a701a5f21a1271877bd2d` (SHA-256).
The selected video/audio, fit, volume and persisted intent were not edited.

## Failed attempts and boundaries

- One new test initially expected `/tmp` rather than macOS's canonical
  `/private/tmp` path; its assertion was corrected and passed.
- Concurrent Console UX work changed a help-button label and later switched
  the checkout back. The renderer assertion failed once in each direction
  (159 passed, 1 failed); it is restored to the delivery branch's original
  assertion and all eight renderer tests pass.
- Earlier whole-tree typechecks caught unrelated in-progress `App.tsx` edits
  (unused `stopSignal`, then incomplete JSX). Those edits were not overwritten;
  the final current-branch node/web typechecks pass.
- The first build became stale when concurrent source edits continued. It was
  rebuilt rather than bypassing the QA hash check.
- Existing mixed JSON import-attribute, chunk-size and typeless-package build
  warnings remain. Chromium emitted overlay-mailbox diagnostics during playback
  transitions; advancing frames and the functional cases passed.
- A slow/offline cloud provider can still fail the bounded preparation. Console
  must report that failure and preserve the draft and previous valid preset.
- The owner's minimum-volume QA directive arrived after the final run's sound
  portion; that run is not claimed to have used minimum output. Output was
  captured at 75% / unmuted, briefly set to 1%, then restored and verified at
  75% / unmuted after confirming QA had exited. Future sound-producing QA must
  capture/reduce/restore output, including failure/cancellation, as recorded in
  DECISIONS and the QA skill. Input gain was unchanged.

No phase acceptance changes. The production app was stopped as found; the next
operator launch uses the rebuilt output. TV power was not changed by this task.
