# Raven media fallback, silent-video BGM and TV-loss shutdown

Requested: local-first media with automatic YouTube fallback; existing Raven
BGM under videos without audio tracks; graceful app shutdown after both HDMI
and Ethernet have been absent for 15 seconds. The user also reported repeated
claims that Raven could not search/play YouTube.

## Root cause and changes

- Runtime metadata at 21:52:04, 21:52:31 and 21:55:10 Taipei shows
  `media_source_restricted`, `media_discovery_no_match`, then
  `media_source_restricted`. A renderer regex policy retained a prior local-only
  scope across requests, and could reject YouTube before its service was called.
  These events establish a real application-side block; retained metadata cannot
  reconstruct the user's exact speech or prove every reported refusal had this
  cause. Removed that policy and its ASR wait. The shared tool catalog instructs
  the model to honor local-only restrictions for that request and clarifications,
  then use folder-first/YouTube fallback for a new source-unspecified request.
  Actual service errors still return visibly. No added regex or confirmation gate.
- The visual controller inspects media tracks after `loadeddata`, immediately
  releases the inspection tracks, and reports unknown detection. A local video
  with no audio track keeps the same Raven ambience element playing at its
  configured ambience gain and global BGM volume, including Dormant loops.
  Audio-bearing/unknown videos suppress BGM. This is track detection, not
  silence/amplitude analysis. Speech priority and mute remain effective.
- Main samples the configured HDMI label and wired IP. TCP connection/refusal
  proves presence; a nonresponding port falls back to ICMP so ADB availability
  alone cannot decide TV state. Both must remain absent for 15 seconds; recovery
  or unknown resets the timer. The existing quit path releases playback, wake,
  workers and runtime; successful exit stays stopped. No second restart owner.

The track-inspection behavior follows the
[media-element capture specification](https://w3c.github.io/mediacapture-fromelement/#html-media-element-media-capture-extensions);
actual Electron playback checks below qualify this implementation.

## Realtime prompt audit

Checked the actual session builder, native tool definitions and shared catalog
against current [Realtime prompting guidance](https://developers.openai.com/api/docs/guides/voice-prompting)
and [general prompt engineering guidance](https://developers.openai.com/api/docs/guides/prompt-engineering).
The model remains the configured `gpt-realtime-2.1-mini`; no migration or model
substitution. Applied concise sections, scoped instructions and evaluation of
observed failures. Added tool headings to the formerly unlabelled instruction
stream. Removed repeated media routing/silence rules and the duplicated grounding
section, retaining model intent, real-result grounding and application ownership.
Session template length falls 2,826→1,618 characters (43%); tool-rule prose falls
9,912→7,695 (22%). These counts exclude the unchanged operator persona, media
labels, native schemas and session-specific memory. Explicit English/Chinese
handling replaces the earlier asymmetric language wording. Application spell
matching, private-memory confirmation, argument validation and failure reporting
remain; they are not conversational regex filters.
The native search descriptions now state when to use each source, so tool
selection does not depend on finding that guidance in the session prose alone.
An empty local lookup also returns concise versioned next-step guidance, using
the existing tool-result pattern. It describes general-play fallback and the
current-request-only local restriction; it does not parse speech or force a tool.
The memory rule now distinguishes changes to saved memory from corrections to
the current conversation, after a live correction incorrectly invoked remember.

## Evidence and limits

- 164 focused media/prompt/renderer/network/timer and Main shutdown tests pass.
  The older Main test harness lacked current
  Electron APIs and launched real memory workers; repaired its mocks and wait
  accounting. Its initial failures are test-harness failures, not evidence of a
  production shutdown failure. Both typechecks and the production build pass.
- First real-Raven run: [metadata](../../.artifacts/phase4-qa/2026-10-10T14-04-30-732Z/raven-results.json).
  English local-only scope, a new local→YouTube request, actual playback/natural
  completion and conversation resumption pass. The Chinese request reused the
  same query and skipped a new local lookup; its ASR also changed meaning.
  Quality still failed for preamble/language issues. The follow-up fixture uses
  a distinct, entirely Chinese query. No successful result replaces this failure.
- [Second live run](../../.artifacts/phase4-qa/2026-10-10T14-09-50-818Z/raven-results.json)
  confirmed a new Chinese selection still inherited YouTube as its source.
  Clarified the prompt's new-selection scope. The
  [next run](../../.artifacts/phase4-qa/2026-10-10T14-13-26-170Z/raven-results.json)
  used local→YouTube→play in both languages, but both natural-return assertions
  timed out after two minutes. Player timing metadata was then added for the
  next run. This result does not establish whether the chosen content was longer
  than the harness budget or playback completion failed.
- [Compact prompt run](../../.artifacts/phase4-qa/2026-10-10T14-21-35-425Z/raven-results.json):
  Chinese local→YouTube→play/return passes and the conversational follow-up passes
  quality. English skipped local discovery; first-turn language and playback
  preambles still fail quality. Updated the native tool descriptions' routing
  guidance; no runtime intent gate was added.
- [Native-description run](../../.artifacts/phase4-qa/2026-10-10T14-25-50-575Z/raven-results.json)
  stopped at an empty local lookup in both languages. The following
  [empathy run](../../.artifacts/phase4-qa/2026-10-10T14-27-56-374Z/raven-results.json)
  incorrectly called `memory.remember` on a conversational correction; three
  other turns passed. These failures motivated the contextual lookup result and
  the saved-memory/current-context distinction above.
- **Final live routing passes in both languages:**
  [14:33 UTC run](../../.artifacts/phase4-qa/2026-10-10T14-33-59-796Z/raven-results.json)
  respects local-only scope, then performs fresh local→YouTube→play for each new
  request, completes once playback and resumes conversation. The local-only
  answer and follow-up score 4/4 in all assessed dimensions. Overall exit remains
  **2**, because both playback turns include a tool preamble. No provider errors.
- **Final empathy/context run exits 0:**
  [four turns](../../.artifacts/phase4-qa/2026-10-10T14-35-57-337Z/raven-results.json)
  pass practical help, correction, context continuity and language checks, with
  no unintended memory call. Scores are 3–4/4. The separate ASR diagnostic still
  flags changed meaning for the two Chinese inputs; quality pass is not exact
  transcription or physical speech acceptance. No provider errors.
- First Raven BGM run: [evidence](../../.artifacts/phase4-qa/2026-10-10T14-08-10-257Z/evidence.json).
  Silent video once, BGM advancement, video loop/Dormant, BGM across a loop and
  simulated wake/stop passed. The audio-bearing fixture initially failed because
  its file changed without refreshing the folder index; corrected the harness
  to refresh after each fixture replacement.
- [Second BGM run](../../.artifacts/phase4-qa/2026-10-10T14-12-52-341Z/evidence.json)
  failed the loop assertion after successful once playback. Its immediate
  ready-state assertion could fail during loop seek; the saved result did not
  identify which conjunct failed. It now waits within the
  existing deadline for ready, advancing frames, retaining immediate checks for
  stopped playback or lost lifecycle and more precise state metadata on failure.
- [Third BGM run](../../.artifacts/phase4-qa/2026-10-10T14-20-05-088Z/evidence.json)
  passes silent once/loop, embedded-audio suppression and ordinary music once.
  The older harness then expected a visible avatar after stopping music while
  Dormant; Raven's reflective mode correctly hides it. Corrected this assertion
  to require the configured Dormant presentation and capture/prove the black
  reflective frame. Product presentation behavior was not changed for the test.
- **Final BGM functional run exits 0:** [18 checks and 11 captures](../../.artifacts/phase4-qa/2026-10-10T14-24-02-415Z/evidence.json).
  Passes silent video once and loop with advancing BGM, suppression for embedded
  audio, music once/loop, Console stop, folder persistence, corrupted/deleted
  files, folder BGM selection and black Dormant. Inspected full-screen video,
  returned Raven and black stopped-Dormant captures. Functional synthetic wake
  remains distinct from acoustic wake evidence.
- Screenshots are captured by the Raven harness and inspected. This round sees
  only the virtual Mac display, so it does not requalify physical portrait layout.
  Provider conversation uses synthetic speech through real WebRTC/ASR/tools and
  playback; functional BGM QA uses simulated wake. Neither proves human wake
  performance under audible music. Earlier acoustic masking remains open.

No credentials, conversation transcripts/audio, or private context are retained.
Invariants 1, 7, 8, 9, 10, 11 and 12 are preserved; model IDs and operator
configuration are unchanged. Deployment changes only the field LaunchAgent's
TV-presence environment and the built application.

## Deployment

At 22:39 Taipei, installed the updated field LaunchAgent and bootstrapped the
checked build. The real Mac reported target HDMI absent and wired TV absent;
Main recorded the countdown at 22:39:02.835 and shutdown at 22:39:17.877,
**15.042 seconds later**. PID 8430 exited 0, no app/worker processes remained,
and the app stayed stopped through the 49-second observation. The independent
board-ADB daemon remained running. All five operator configuration/device/folder
hashes matched the pre-deployment snapshot.
[Deployment metadata](../../.artifacts/media-tv-2026-10-10/deployment.json).
This verifies actual absent OS signals, not a witnessed physical power-button
test. The app is deliberately stopped while the TV is absent; after the TV
returns, the operator/start button must start it normally.
