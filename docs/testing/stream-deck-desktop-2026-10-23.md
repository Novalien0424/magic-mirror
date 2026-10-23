# Stream Deck Desktop and default soul style — 2026-10-23

The six-key layout, Desktop mode and modern minimalist multicolour vector-style
default are deployed on the canonical Mac. No phase, dependency or model changes.

## Operator journey

| Action | Expected and verified result |
| --- | --- |
| Find Studio | Amber bottom-left **STUDIO**, fully visible in the Neo editor. |
| Top-right **DESKTOP** | Verify portrait orientation; start/reuse Main; release voice/wake/camera/scenes and loop playback; hide Mirror and Console; clear STOP cover; wake HDMI and connect TV mouse. |
| Repeat DESKTOP | Same mode, no extra windows; Console renderer and unsaved values survive. |
| Remote Console during Desktop | Editor opens on the main monitor; TV stays on Desktop. Header explains inputs are off and offers Return to Avatar. |
| START from Desktop | Existing Mirror returns in Conversation mode, Console hidden. |
| STUDIO from Desktop | Existing Mirror returns in Interactive Studio mode, Console hidden. |
| PLAY LOOP from Desktop | Saved loop plays; acknowledgement waits for actual playback. |
| CONSOLE from Desktop | Resume saved avatar mode; show existing Console on the portrait TV, preserving unsaved edits. |
| STOP from Desktop | Native black HDMI cover, TV standby, app/process and mouse release, Jabra output reset to 70%. |
| Generate the next soul | Raven v21 supplies minimalist multicolour vector-style art direction through the existing image journey. |

## Implementation and preservation

Desktop reuses the appliance-mode controller and Main mailbox. Input is inhibited
before asynchronous release. Failed release is visible and keeps the gate closed.
Hidden windows retain renderers; another mode restores the existing Mirror.
Desktop intent survives a crash; STOP clears it through deliberate shutdown.
Launchd remains the only Electron restart owner.

The signed native helper targets exactly one T749, verifies Mac 90° rotation and
portrait bounds, and can correct orientation using the venue's existing
MonitorPanel approach. Other monitors are untouched. Android's accepted
`user_rotation=2` was read back; no mouse-axis changes.

Source areas: Main operator-loop/window/mailbox integration, shared mode parser,
Mirror/Console mode UI, button/TV scripts, native helper, installer/profile
generator and `src/shared/portrait-studio.ts`.

The new art style specifies clean geometric shapes, crisp edges, distinct flat
colours, generous negative space and few symbolic details; no photorealism,
gradients or heavy textures. This changes art direction, not the raster output
format to SVG. The production config service published Raven **v21** while normal
Electron was stopped under the operation lease. Deep equality verified active
changed only in the selected avatar's style/version, previous retained old active,
and the saved draft was restored with that same style/version update. Other
avatars and unrelated draft edits were preserved. Fresh read-back confirms v21
and matching active/draft style. No new paid image call was needed or claimed.

## Fresh verification

Normal Electron, isolated Electron QA and native controls ran sequentially under
the operation lease. No overlapping full-suite Electron smoke.

- **269 distinct focused Vitest tests passed**: five unit files
  (`operator-loop`, `operator-control`, `operator-command`, `raven-button`,
  `mirror-tv-control`) passed 235; four renderer files (`operator-loop-app`,
  `operator-loop-controller`, `loop-video-panel`, `second-audit-status`) initially
  passed 33. One new Desktop release-failure status case was added; its affected
  two files passed 16 (15 overlap). Node/web typecheck and script syntax passed.
- Real isolated Electron journey **24/24**, exit 0, **17 screenshots**, run
  `2026-10-23T08-57-32-784Z`, completed 16:58:39 Taipei. Production mailbox and
  real renderers with synthetic local media. Command:
  `MIRROR_DISPLAY=T749 /tmp/mm-desktop-audio-guard /opt/homebrew/bin/node scripts/run-phase4-qa.mjs --operator-loop`.
  No provider or human-microphone claim.
- Visual review of `operator-desktop-remote-console.png`: clear Desktop banner,
  Return to Avatar available, preserved unsaved Loop volume **23%**, usable layout.
  DOM checks verify avatar/video/audio unmounted, both windows hidden, repeated
  Desktop retains the same Console renderer and draft.
- Deployed Mac/TV sequence, 17:04:32–17:05:02 Taipei, **10/10**, exit 0:
  `desktop → start → desktop → studio → desktop → loop → desktop → console → desktop → stop`.
  Used production `operateMirrorControl` with actual launchd, mailbox, native
  display/black cover, TV and mouse IO. Desktop had **0** visible Electron windows,
  presentation modes **1**, Console **2**. Every expected mode passed; T749 was
  **1080×1920 / 90°** throughout. STOP returned `stopped`, `tv_standby`,
  `blackout_covered`, `mouse_stopped`, `jabra_output_70`.
- Stream Deck CUA: generated six-key profile imported; **Magic Mirror copy 1**
  selected and marked default. STUDIO/DESKTOP fit; DESKTOP's assigned
  `Desktop Magic Mirror.app` path read back. Original profiles remain.
- Installer compiled/signed the helper and six wrappers. Final canonical build
  **17:11:31 Taipei**, source `b71a30bdc7a71f12`, output `0605c6026f90f125`;
  `node scripts/qa-build.mjs --verify` passed. Final build only adds Return to
  Avatar help wording after native QA; unchanged behavior passes are reused.

## Failures and fixes

[Full captured output](stream-deck-desktop-failures-2026-10-23.txt) is retained.

1. Isolated run `08-53-22-960Z`, exit 2 after 3 cases: omitted
   `MIRROR_DISPLAY=T749`, causing `display_watch_not_configured`. Invocation fixed.
2. Run `08-54-36-017Z`, exit 2 after 22 cases: the new test reused a helper requiring
   a visible avatar beside Remote Console. Desktop correctly hides Mirror.
   Replaced that assertion with hidden Mirror, separate display, same renderer
   and preserved draft checks. All 24 cases then passed.
3. First native sequence passed 9 mode checks, but its temporary QA audio guard
   failed restoring output (`output_volume_failed`, outer exit 133): macOS changed
   CoreAudio device IDs during TV/device transitions. Fixed the scratch guard to
   resolve captured outputs by unique name. One native rerun including STOP passed
   and reported `qa_output_restored`. Production audio code was unaffected. After
   QA the installed helper explicitly reset Jabra and read back **0.7007718682**,
   the hardware representation of 70%, unmuted.
4. A focus-changing QA window caused a manual profile edit to duplicate STUDIO
   into an empty slot of an older inactive profile. Removed the task-created
   duplicate through the UI, verified the empty slot, and reselected the generated
   six-key profile. Closed the task-created Finder window.

The first audio guard did not persist the initial internal-speaker level. Final
Mac mini Speakers is **1%**; its original value cannot be proved or restored from
this run. Default input/output remain Jabra and input gains were not changed.
This is a cleanup limitation, not a claim of complete audio-state restoration.
The configured venue output is Jabra at the requested 70%.

## Boundaries and cleanup

No physical hand press of the new key, human conversation, acoustic quality,
external HDMI analyser or deliberate orientation misconfiguration is claimed.
The production control path and accepted orientation were checked. The preceding
USB Arducam zero-frame issue remains unresolved and was not retested here.

Normal Electron began stopped with black cover and TV standby. Final STOP restored
that state. Saved draft and existing soul deliverables remain. The three owned
isolated QA directories are reviewed and cleaned with the marker-aware tool;
full failure text and these findings remain. Temporary scripts/logs/binaries are
removed after recording evidence. Installed controls/helper/recovery profile are
delivery artifacts.
