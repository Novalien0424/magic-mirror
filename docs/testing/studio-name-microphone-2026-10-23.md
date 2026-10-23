# Studio name input after microphone recovery

Owner report: Raven asks for the visitor's name but does not hear/respond to it.

## Diagnosis

Production metadata from the reported visit establishes this sequence (UTC):

- `12:24:51`: local wake detection activates Realtime; capture is acquired.
- `12:24:56`: Studio starts its configured opening.
- `12:25:01` and `12:25:11`: microphone recovery starts and succeeds during the
  opening/name narration.
- `12:25:16`: the completed name question starts the 30-second wait.
- `12:25:46`: the name timeout fires. No visitor input reached the session.

The previous narration guard temporarily set the physical microphone track's
`enabled` property to false. Recovery copied that temporary state to the new
track. The narration guard then saved false as its restoration value, so the new
track stayed disabled when Raven finished asking the name. Acquisition finishing
after narration had the same failure. Earlier virtual-microphone QA did not
exercise this device-recovery boundary.

Fresh CoreAudio enumeration identifies Jabra Speak2 75 as both default input and
output. Production audio preferences select the default devices. The two focused
regression cases reproduced the disabled replacement track before the fix; their
[complete failures](studio-name-microphone-failures-2026-10-23.txt) are retained.
No transcript/audio was inspected or retained from the owner's visit.

## Change and acceptance

The microphone recovery owner can now supply the intended enabled state, before
temporary narration muting. Studio supplies its saved state; other callers keep
the existing behavior. Recovery still releases old capture before acquiring a
replacement. The replacement remains paused while Raven speaks and becomes
enabled when the name question finishes, including delayed acquisition.

Visitor journey: wake → complete Chinese opening/name question → microphone
enabled → say name → read-back → deny/correct/confirm → question one. Stop and
restart → a fresh name question → microphone enabled → name heard again.

The existing Raven QA runner now supports `--studio-name-only`, stopping before
image generation. Each Studio input checks the actual WebRTC sender track is
live, enabled and unmuted. Evidence stores only track-state booleans/counts,
recovery counts and existing metadata; no device IDs, audio or transcripts.

## Verification

- Before fix: both recovery-timing regressions failed with replacement track
  disabled after the question.
- After fix: Studio adapter and microphone recovery selection **61/61 passed**.
- Node/web typechecks, script syntax and canonical build passed.
- Physical run `2026-10-23T12-31-35-236Z`, exit 2: Jabra recovered twice during
  narration and its actual sender track was **live, enabled, unmuted** afterward.
  One ASR completion arrived, but the quiet synthetic name was not recognized;
  Raven repeated the name question and the expected `studio_set_name` call was
  absent. No provider errors. This proves the repaired track handoff under the
  actual device condition, not successful physical name recognition. Full
  metadata failure retained; no acoustic-volume increase or repeated trial.
- Clear synthetic-audio run `2026-10-23T12-33-32-846Z`, exit 0: **8/8 passed**.
  Name entry, denial, correction, confirmation and question one passed. A fresh
  restart heard the name and entered confirmation again. Six ASR completions;
  all six input checkpoints had exactly one live/enabled/unmuted sender track.
  No provider errors, no image generation, no retained transcript. The Raven
  confirmation screenshot was inspected; only the test name was shown as text.

Canonical build completed `2026-10-23T12:31:07.973Z`, source
`20023ee7ce9f699d29188815de01f89f8b478dfdd4b3f7cc6ef760fcd418a432`, output
`7ed6700559849daac26816827e3ac5a3b29d0c585b15eae52aeb5317b33e06a3`.
Normal LaunchAgent runtime started at `12:36:05Z` after QA exited; renderer and
web server ready. The Studio button route acknowledged mode success/TV awake at
`12:36:13Z`; HTTPS returned 200. Both QA cleanup paths verified Jabra at 70.08%.
Startup subsequently read 6.25%, so the existing helper reset it again after the
normal Studio route was ready and verified **70.08%**.

The owner is available for a human name check; its result is pending. A deployed
read-only runtime check found fresh wake input blocks (38.7 ms old, signal,
zero detections), so no new visitor session had started at that observation.

Both exact owned QA runs are reviewed against this report and removed with
`qa-artifacts.mjs review`, dry-run `clean`, then `clean --delete`. Full failure
metadata stays linked above. Cleanup removed **190 files / 39,660,818 bytes**,
excluding markers, and all nine task-owned temporary audio helpers/logs after
Jabra's final output read-back at `12:42Z` confirmed **70.08%**. Existing owner
deliverables remain untouched.

Jabra test output is requested at 1%; cleanup always restores and verifies 70%
on success, failure or cancellation. Other output levels, mute and input gain
are preserved. Test speech uses the Mac speaker and actual Jabra capture through
the real provider; this is synthetic acoustic evidence, not human acceptance.

Production active/draft hashes match the preceding delivery. The test profile
is isolated; the four questions, name database and saved operator draft remain
unchanged.
